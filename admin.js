import { auth, db, storage } from "./firebase.js";
import { requireOwner } from "./admin-guard.js";

import {
  signOut
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-storage.js";

/* =========================================
   NADO LIBYA ADMIN
   Products / Categories / Inventory
   Customers / Discounts / Reports
========================================= */

/* =========================================
   ELEMENTS AND STATE
========================================= */

const $ = (id) => document.getElementById(id);

let currentUser = null;

let products = [];
let categories = [];
let customers = [];
let ordersForCustomers = [];

let settings = {
  lowStockThreshold: 5,
  currency: "LYD"
};

let loadingProducts = false;
let loadingCategories = false;
let loadingCustomers = false;

const pageNames = {
  dashboard: "الرئيسية",
  products: "المنتجات",
  categories: "التصنيفات",
  inventory: "المخزون",
  orders: "الطلبات",
  customers: "العملاء",
  discounts: "العروض والخصومات",
  reports: "التقارير",
  staff: "الموظفون والصلاحيات",
  settings: "إعدادات المتجر"
};

/* =========================================
   GENERAL HELPERS
========================================= */

function notify(message) {
  const toast = $("toast");

  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  window.clearTimeout(notify.timer);

  notify.timer = window.setTimeout(() => {
    toast.classList.remove("show");
  }, 3200);
}

function setMessage(id, message, type = "") {
  const element = $(id);

  if (!element) return;

  element.textContent = message;
  element.className = `form-message ${type}`.trim();
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseList(value) {
  return cleanText(value)
    .split(/[,،]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function money(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return "—";
  }

  return `${amount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })} LYD`;
}

function safeImageUrl(value) {
  if (
    typeof value === "string" &&
    /^https?:\/\//i.test(value)
  ) {
    return value;
  }

  return "";
}

function getTimestamp(value) {
  if (!value) return 0;

  if (typeof value.toMillis === "function") {
    return value.toMillis();
  }

  if (typeof value.seconds === "number") {
    return value.seconds * 1000;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  const parsed = new Date(value).getTime();

  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value) {
  const timestamp = getTimestamp(value);

  if (!timestamp) return "—";

  return new Intl.DateTimeFormat("ar-LY", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(new Date(timestamp));
}

function makeImageFallback(image) {
  image.addEventListener("error", () => {
    image.removeAttribute("src");
    image.classList.add("image-unavailable");
  }, { once: true });
}

function createCell(text) {
  const cell = document.createElement("td");
  cell.textContent = text ?? "—";
  return cell;
}

function createEmptyRow(body, colspan, message) {
  body.innerHTML = "";

  const row = document.createElement("tr");
  const cell = document.createElement("td");

  cell.colSpan = colspan;
  cell.className = "empty-state";
  cell.textContent = message;

  row.append(cell);
  body.append(row);
}

function safeFileName(value) {
  return String(value || "NADO-LIBYA")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .trim();
}

/* =========================================
   NAVIGATION
========================================= */

function closeSidebar() {
  $("sidebar")?.classList.remove("open");
  $("sidebarOverlay")?.classList.remove("show");
  $("mobileMenuButton")?.setAttribute("aria-expanded", "false");
}

function openSidebar() {
  $("sidebar")?.classList.add("open");
  $("sidebarOverlay")?.classList.add("show");
  $("mobileMenuButton")?.setAttribute("aria-expanded", "true");
}

function showView(viewName) {
  if (!pageNames[viewName]) return;

  document.querySelectorAll(".view-section").forEach((section) => {
    section.classList.toggle(
      "active",
      section.id === `view-${viewName}`
    );
  });

  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.view === viewName
    );
  });

  if ($("pageTitle")) {
    $("pageTitle").textContent = pageNames[viewName];
  }

  if ($("breadcrumbName")) {
    $("breadcrumbName").textContent = pageNames[viewName];
  }

  closeSidebar();

  if (viewName === "inventory") {
    renderInventory();
  }

  if (viewName === "reports") {
    renderReport();
  }

  if (viewName === "customers") {
    loadCustomers();
  }

  if (viewName === "discounts") {
    renderDiscounts();
  }
}

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    showView(button.dataset.view);
  });
});

document.querySelectorAll("[data-goto]").forEach((button) => {
  button.addEventListener("click", () => {
    const view = button.dataset.goto;

    showView(view);

    if (view === "products") {
      openProductForm();
    }
  });
});

$("mobileMenuButton")?.addEventListener("click", () => {
  const isOpen = $("sidebar")?.classList.contains("open");

  if (isOpen) {
    closeSidebar();
  } else {
    openSidebar();
  }
});

$("sidebarOverlay")?.addEventListener("click", closeSidebar);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeSidebar();

    if (!$("productEditor")?.hidden) {
      closeProductForm();
    }
  }
});

document.addEventListener("click", (event) => {
  if (
    window.innerWidth <= 850 &&
    $("sidebar")?.classList.contains("open") &&
    !event.target.closest("#sidebar") &&
    !event.target.closest("#mobileMenuButton")
  ) {
    closeSidebar();
  }
});

/* =========================================
   HEADER
========================================= */

function setupHeader() {
  if ($("adminEmail")) {
    $("adminEmail").textContent =
      currentUser?.email || "مدير المتجر";
  }

  if ($("staffCurrentEmail")) {
    $("staffCurrentEmail").textContent =
      currentUser?.email || "الحساب الحالي";
  }

  if ($("todayDate")) {
    $("todayDate").textContent =
      new Intl.DateTimeFormat("ar-LY", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
      }).format(new Date());
  }
}

/* =========================================
   LOAD PRODUCTS
========================================= */

async function loadProducts() {
  if (loadingProducts) return false;

  loadingProducts = true;

  try {
    const snapshot = await getDocs(
      collection(db, "products")
    );

    products = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data()
    }));

    products.sort((a, b) => {
      return getTimestamp(b.createdAt) - getTimestamp(a.createdAt);
    });

    updateDashboard();
    renderProducts();
    renderInventory();
    renderReport();
    renderDiscounts();
    updateProductCategoryFilter();
    updateCategorySuggestions();

    return true;

  } catch (error) {
    console.error("Products loading failed:", error);

    notify("تعذر تحميل المنتجات. راجع صلاحيات Firestore.");

    createEmptyRow(
      $("productsTableBody"),
      6,
      "تعذر تحميل المنتجات."
    );

    return false;

  } finally {
    loadingProducts = false;
  }
}

/* =========================================
   DASHBOARD
========================================= */

function getProductQuantity(product) {
  const quantity = Number(product.quantity);

  return Number.isFinite(quantity) && quantity > 0
    ? quantity
    : 0;
}

function isLowStock(product) {
  const quantity = getProductQuantity(product);

  return (
    quantity > 0 &&
    quantity <= Number(settings.lowStockThreshold || 0)
  );
}

function updateDashboard() {
  const total = products.length;

  const published = products.filter(
    (item) => item.status === "published"
  ).length;

  const drafts = total - published;

  const stock = products.reduce(
    (sum, item) => sum + getProductQuantity(item),
    0
  );

  const low = products.filter(isLowStock).length;

  $("statProducts").textContent = total;
  $("statPublished").textContent = published;
  $("statStock").textContent = stock;
  $("statLowStock").textContent = low;

  $("lowStockNavCount").textContent = low;

  $("healthPublished").textContent = published;
  $("healthDraft").textContent = drafts;

  const publishedPercent =
    total > 0 ? (published / total) * 100 : 0;

  const draftPercent =
    total > 0 ? (drafts / total) * 100 : 0;

  $("healthPublishedBar").style.width =
    `${publishedPercent}%`;

  $("healthDraftBar").style.width =
    `${draftPercent}%`;

  $("healthMessage").textContent =
    total === 0
      ? "لا توجد منتجات بعد. ابدأ بإضافة أول منتج إلى متجرك."
      : `${published} منتج منشور و${drafts} منتج غير منشور.`;

  renderRecentProducts();
}

function renderRecentProducts() {
  const box = $("recentProducts");

  if (!box) return;

  box.innerHTML = "";

  const recent = products.slice(0, 5);

  if (!recent.length) {
    box.textContent = "لا توجد منتجات حتى الآن.";
    box.className = "recent-products empty-state";
    return;
  }

  box.className = "recent-products";

  recent.forEach((product) => {
    const row = document.createElement("div");
    row.className = "recent-product";

    const image = document.createElement("img");
    image.alt = product.name || "صورة المنتج";

    const imageUrl = safeImageUrl(product.imageUrl);

    if (imageUrl) {
      image.src = imageUrl;
    }

    makeImageFallback(image);

    const info = document.createElement("div");
    info.className = "recent-product-info";

    const name = document.createElement("strong");
    name.textContent = product.name || "منتج بدون اسم";

    const category = document.createElement("small");
    category.textContent = product.category || "بدون تصنيف";

    info.append(name, category);

    const price = document.createElement("span");
    price.className = "recent-price";

    price.textContent = money(
      product.salePrice || product.price
    );

    row.append(image, info, price);
    box.append(row);
  });
}

$("dashboardRefresh")?.addEventListener("click", async () => {
  const results = await Promise.all([
    loadProducts(),
    loadCategories()
  ]);

  if (results.some(Boolean)) {
    notify("تم تحديث بيانات لوحة التحكم.");
  }
});

/* =========================================
   PRODUCT FORM
========================================= */

function openProductForm() {
  $("productEditor").hidden = false;

  $("productEditor").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function closeProductForm() {
  $("productEditor").hidden = true;
  resetProductForm();
}

function resetProductForm() {
  $("productForm").reset();

  $("productId").value = "";
  $("existingImagePath").value = "";

  $("productQuantity").value = 1;

  $("productFormTitle").textContent = "إضافة منتج جديد";
  $("saveProductButton").textContent = "حفظ المنتج";

  $("imagePreview").hidden = true;
  $("imagePreview").removeAttribute("src");

  $("productImage").value = "";

  setMessage("productFormMessage", "");
}

$("showProductForm")?.addEventListener(
  "click",
  openProductForm
);

$("closeProductForm")?.addEventListener(
  "click",
  closeProductForm
);

$("cancelProductEdit")?.addEventListener(
  "click",
  closeProductForm
);

/* =========================================
   PRODUCT IMAGE PREVIEW
========================================= */

$("productImage")?.addEventListener("change", () => {
  const file = $("productImage").files?.[0];

  if (!file) return;

  const validType = [
    "image/jpeg",
    "image/png",
    "image/webp"
  ].includes(file.type);

  if (!validType || file.size > 5 * 1024 * 1024) {
    setMessage(
      "productFormMessage",
      "اختر صورة JPG أو PNG أو WEBP بحجم لا يتجاوز 5MB.",
      "error"
    );

    $("productImage").value = "";
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    $("imagePreview").src = reader.result;
    $("imagePreview").hidden = false;
  };

  reader.onerror = () => {
    setMessage(
      "productFormMessage",
      "تعذرت قراءة الصورة المختارة.",
      "error"
    );
  };

  reader.readAsDataURL(file);
});

$("productImageUrl")?.addEventListener("input", () => {
  if ($("productImage").files?.length) return;

  const url = safeImageUrl($("productImageUrl").value);

  if (url) {
    $("imagePreview").src = url;
    $("imagePreview").hidden = false;
  } else {
    $("imagePreview").hidden = true;
    $("imagePreview").removeAttribute("src");
  }
});

/* =========================================
   PRODUCT IMAGE UPLOAD
========================================= */

async function uploadImage(file) {
  if (!storage) {
    throw new Error("Firebase Storage غير مهيأ في firebase.js.");
  }

  const extension = file.type === "image/png"
    ? "png"
    : file.type === "image/webp"
      ? "webp"
      : "jpg";

  const uniqueId = (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  )
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const path = `products/${uniqueId}.${extension}`;

  const imageRef = ref(storage, path);

  await uploadBytes(imageRef, file, {
    contentType: file.type
  });

  const url = await getDownloadURL(imageRef);

  return { url, path };
}

/* =========================================
   PRODUCT VALIDATION
========================================= */

function validateProduct() {
  const name = cleanText($("productName").value);
  const category = cleanText($("productCategory").value);

  const price = Number($("productPrice").value);

  const saleText = $("productSalePrice").value.trim();

  const salePrice =
    saleText === "" ? null : Number(saleText);

  const quantity = Number($("productQuantity").value);

  if (!name || !category) {
    throw new Error("أدخل اسم المنتج والتصنيف.");
  }

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("أدخل سعراً أساسياً أكبر من صفر.");
  }

  if (
    salePrice !== null &&
    (
      !Number.isFinite(salePrice) ||
      salePrice <= 0 ||
      salePrice >= price
    )
  ) {
    throw new Error(
      "سعر التخفيض يجب أن يكون أكبر من صفر وأقل من السعر الأساسي."
    );
  }

  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new Error("الكمية يجب أن تكون رقماً صحيحاً غير سالب.");
  }

  return {
    name,
    category,
    price,
    salePrice,
    quantity
  };
}

/* =========================================
   SAVE PRODUCT
========================================= */

$("productForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const button = $("saveProductButton");

  button.disabled = true;
  button.textContent = "جارٍ الحفظ...";

  let uploadedImagePath = "";

  try {
    const values = validateProduct();

    const selectedFile =
      $("productImage").files?.[0] || null;

    let imageUrl = cleanText(
      $("productImageUrl").value
    );

    let imagePath = cleanText(
      $("existingImagePath").value
    );

    const oldImagePath = imagePath;

    if (selectedFile) {
      setMessage(
        "productFormMessage",
        "جارٍ رفع الصورة إلى Firebase Storage..."
      );

      const uploaded = await uploadImage(selectedFile);

      imageUrl = uploaded.url;
      imagePath = uploaded.path;
      uploadedImagePath = uploaded.path;
    }

    if (!safeImageUrl(imageUrl)) {
      throw new Error(
        "أدخل رابط صورة صحيحاً أو اختر صورة من جهازك."
      );
    }

    const productData = {
      ...values,

      description: cleanText(
        $("productDescription").value
      ),

      sizes: parseList(
        $("productSizes").value
      ),

      colors: parseList(
        $("productColors").value
      ),

      imageUrl,
      imagePath,

      status: $("productStatus").value === "published"
        ? "published"
        : "draft",

      isNew: $("productIsNew").checked,

      updatedAt: serverTimestamp()
    };

    const productId = $("productId").value;

    if (productId) {
      await updateDoc(
        doc(db, "products", productId),
        productData
      );
    } else {
      productData.createdAt = serverTimestamp();

      await addDoc(
        collection(db, "products"),
        productData
      );
    }

    if (
      selectedFile &&
      oldImagePath &&
      oldImagePath !== imagePath &&
      storage
    ) {
      try {
        await deleteObject(
          ref(storage, oldImagePath)
        );
      } catch (imageError) {
        console.warn(
          "Old image cleanup failed:",
          imageError
        );
      }
    }

    closeProductForm();

    await loadProducts();

    notify(
      productId
        ? "تم تحديث المنتج بنجاح."
        : "تمت إضافة المنتج بنجاح."
    );

  } catch (error) {
    console.error("Product save failed:", error);

    setMessage(
      "productFormMessage",
      error.message || "تعذر حفظ المنتج.",
      "error"
    );

    /*
      إذا تم رفع صورة وفشل حفظ المنتج،
      نحاول حذف الصورة الجديدة حتى لا تبقى ملفات غير مرتبطة.
    */
    if (uploadedImagePath && storage) {
      try {
        await deleteObject(
          ref(storage, uploadedImagePath)
        );
      } catch (cleanupError) {
        console.warn("Uploaded image cleanup failed:", cleanupError);
      }
    }

  } finally {
    button.disabled = false;

    button.textContent = $("productId").value
      ? "حفظ التعديلات"
      : "حفظ المنتج";
  }
});

/* =========================================
   PRODUCTS TABLE
========================================= */

function renderProducts() {
  const body = $("productsTableBody");

  if (!body) return;

  const term = cleanText(
    $("productSearch").value
  ).toLocaleLowerCase();

  const status = $("productStatusFilter").value;
  const category = $("productCategoryFilter").value;

  const filtered = products.filter((product) => {
    const searchable =
      `${product.name || ""} ${product.category || ""}`
        .toLocaleLowerCase();

    const matchesText = searchable.includes(term);

    const matchesStatus =
      status === "all" || product.status === status;

    const matchesCategory =
      category === "all" || product.category === category;

    return matchesText && matchesStatus && matchesCategory;
  });

  $("productsCount").textContent =
    `${filtered.length} منتج`;

  body.innerHTML = "";

  if (!filtered.length) {
    createEmptyRow(
      body,
      6,
      "لا توجد منتجات مطابقة لعملية البحث."
    );
    return;
  }

  filtered.forEach((product) => {
    const row = document.createElement("tr");

    /* Product */
    const productCell = document.createElement("td");
    const productWrap = document.createElement("div");

    productWrap.className = "product-table-cell";

    const image = document.createElement("img");
    image.alt = product.name || "صورة المنتج";

    const imageUrl = safeImageUrl(product.imageUrl);

    if (imageUrl) {
      image.src = imageUrl;
    }

    makeImageFallback(image);

    const info = document.createElement("div");

    const name = document.createElement("strong");
    name.textContent = product.name || "بدون اسم";

    const id = document.createElement("small");
    id.textContent = product.id;

    info.append(name, id);
    productWrap.append(image, info);
    productCell.append(productWrap);

    /* Category */
    const categoryCell = createCell(
      product.category || "—"
    );

    /* Price */
    const priceCell = createCell(
      money(product.salePrice || product.price)
    );

    /* Quantity */
    const quantityCell = createCell(
      String(getProductQuantity(product))
    );

    /* Status */
    const statusCell = document.createElement("td");
    const statusLabel = document.createElement("span");

    statusLabel.className =
      `status-label ${
        product.status === "published"
          ? "published"
          : "draft"
      }`;

    statusLabel.textContent =
      product.status === "published"
        ? "منشور"
        : "مسودة";

    statusCell.append(statusLabel);

    /* Actions */
    const actionsCell = document.createElement("td");
    const actions = document.createElement("div");

    actions.className = "table-actions";

    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "تعديل";

    edit.addEventListener("click", () => {
      editProduct(product.id);
    });

    const toggle = document.createElement("button");
    toggle.type = "button";

    toggle.textContent =
      product.status === "published"
        ? "إخفاء"
        : "نشر";

    toggle.addEventListener("click", () => {
      toggleProductStatus(product.id);
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger-action";
    remove.textContent = "حذف";

    remove.addEventListener("click", () => {
      deleteProduct(product.id);
    });

    actions.append(edit, toggle, remove);
    actionsCell.append(actions);

    row.append(
      productCell,
      categoryCell,
      priceCell,
      quantityCell,
      statusCell,
      actionsCell
    );

    body.append(row);
  });
}

/* =========================================
   EDIT PRODUCT
========================================= */

function editProduct(id) {
  const product = products.find(
    (item) => item.id === id
  );

  if (!product) return;

  $("productId").value = product.id;
  $("existingImagePath").value = product.imagePath || "";

  $("productName").value = product.name || "";
  $("productCategory").value = product.category || "";

  $("productPrice").value = product.price ?? "";
  $("productSalePrice").value = product.salePrice ?? "";

  $("productQuantity").value =
    product.quantity ?? 0;

  $("productStatus").value =
    product.status || "draft";

  $("productDescription").value =
    product.description || "";

  $("productSizes").value =
    Array.isArray(product.sizes)
      ? product.sizes.join(", ")
      : "";

  $("productColors").value =
    Array.isArray(product.colors)
      ? product.colors.join(", ")
      : "";

  $("productImageUrl").value =
    product.imageUrl || "";

  $("productIsNew").checked =
    product.isNew === true;

  $("productImage").value = "";

  const url = safeImageUrl(product.imageUrl);

  if (url) {
    $("imagePreview").src = url;
    $("imagePreview").hidden = false;
  } else {
    $("imagePreview").hidden = true;
    $("imagePreview").removeAttribute("src");
  }

  $("productFormTitle").textContent = "تعديل المنتج";
  $("saveProductButton").textContent = "حفظ التعديلات";

  setMessage("productFormMessage", "");

  openProductForm();
}

/* =========================================
   CHANGE PRODUCT STATUS
========================================= */

async function toggleProductStatus(id) {
  const product = products.find(
    (item) => item.id === id
  );

  if (!product) return;

  const nextStatus =
    product.status === "published"
      ? "draft"
      : "published";

  try {
    await updateDoc(
      doc(db, "products", id),
      {
        status: nextStatus,
        updatedAt: serverTimestamp()
      }
    );

    await loadProducts();

    notify(
      nextStatus === "published"
        ? "تم نشر المنتج."
        : "تم إخفاء المنتج."
    );

  } catch (error) {
    console.error("Product status update failed:", error);
    notify("تعذر تغيير حالة المنتج.");
  }
}

/* =========================================
   DELETE PRODUCT
========================================= */

async function deleteProduct(id) {
  const product = products.find(
    (item) => item.id === id
  );

  if (!product) return;

  const confirmed = window.confirm(
    `هل تريد حذف المنتج "${product.name || "بدون اسم"}"؟`
  );

  if (!confirmed) return;

  try {
    await deleteDoc(
      doc(db, "products", id)
    );

    if (product.imagePath && storage) {
      try {
        await deleteObject(
          ref(storage, product.imagePath)
        );
      } catch (imageError) {
        console.warn(
          "Image deletion warning:",
          imageError
        );
      }
    }

    await loadProducts();

    notify("تم حذف المنتج.");

  } catch (error) {
    console.error("Product deletion failed:", error);
    notify("تعذر حذف المنتج.");
  }
}

/* =========================================
   PRODUCT FILTERS
========================================= */

$("productSearch")?.addEventListener(
  "input",
  renderProducts
);

$("productStatusFilter")?.addEventListener(
  "change",
  renderProducts
);

$("productCategoryFilter")?.addEventListener(
  "change",
  renderProducts
);

$("refreshProducts")?.addEventListener(
  "click",
  async () => {
    await loadProducts();
    notify("تم تحديث المنتجات.");
  }
);

function updateProductCategoryFilter() {
  const select = $("productCategoryFilter");

  if (!select) return;

  const selected = select.value;

  select.innerHTML = "";

  select.append(
    new Option("جميع التصنيفات", "all")
  );

  const names = [
    ...new Set(
      products
        .map((item) => cleanText(item.category))
        .filter(Boolean)
    )
  ];

  names.sort((a, b) => a.localeCompare(b, "ar"));

  names.forEach((name) => {
    select.append(
      new Option(name, name)
    );
  });

  if (
    [...select.options].some(
      (option) => option.value === selected
    )
  ) {
    select.value = selected;
  }
}

function updateCategorySuggestions() {
  const list = $("categorySuggestions");

  if (!list) return;

  list.innerHTML = "";

  categories
    .filter((item) => item.active === true)
    .forEach((category) => {
      const option = document.createElement("option");
      option.value = category.name || "";
      list.append(option);
    });
}

/* =========================================
   CATEGORIES
========================================= */

async function loadCategories() {
  if (loadingCategories) return false;

  loadingCategories = true;

  try {
    const snapshot = await getDocs(
      collection(db, "categories")
    );

    categories = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data()
    }));

    categories.sort((a, b) => {
      return (
        (Number(a.sortOrder) || 0) -
        (Number(b.sortOrder) || 0)
      );
    });

    renderCategories();
    updateCategorySuggestions();

    return true;

  } catch (error) {
    console.error("Categories load error:", error);

    const box = $("categoriesList");

    if (box) {
      box.textContent =
        "تعذر تحميل التصنيفات. تحقق من قواعد Firestore.";
    }

    return false;

  } finally {
    loadingCategories = false;
  }
}

function renderCategories() {
  const box = $("categoriesList");

  if (!box) return;

  box.innerHTML = "";

  const activeCategories = categories.filter(
    (item) => item.active === true
  );

  if (!activeCategories.length) {
    box.textContent = "لا توجد تصنيفات نشطة حتى الآن.";
    box.className = "category-list empty-state";
    return;
  }

  box.className = "category-list";

  activeCategories.forEach((category) => {
    const row = document.createElement("div");
    row.className = "category-item";

    const info = document.createElement("div");

    const name = document.createElement("strong");
    name.textContent = category.name || "تصنيف بدون اسم";

    const sort = document.createElement("small");
    sort.textContent =
      `الترتيب: ${Number(category.sortOrder) || 0}`;

    info.append(name, sort);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "إخفاء";

    remove.addEventListener("click", () => {
      deactivateCategory(category.id);
    });

    row.append(info, remove);
    box.append(row);
  });
}

$("categoryForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = cleanText(
    $("categoryName").value
  );

  const sortOrder = Number(
    $("categorySort").value
  );

  if (!name) {
    setMessage(
      "categoryMessage",
      "أدخل اسم التصنيف.",
      "error"
    );
    return;
  }

  if (
    !Number.isInteger(sortOrder) ||
    sortOrder < 0
  ) {
    setMessage(
      "categoryMessage",
      "الترتيب يجب أن يكون رقماً صحيحاً غير سالب.",
      "error"
    );
    return;
  }

  const duplicate = categories.some(
    (item) =>
      cleanText(item.name).toLocaleLowerCase() ===
      name.toLocaleLowerCase() &&
      item.active === true
  );

  if (duplicate) {
    setMessage(
      "categoryMessage",
      "هذا التصنيف موجود بالفعل.",
      "error"
    );
    return;
  }

  const submitButton = $("categoryForm").querySelector(
    'button[type="submit"]'
  );

  submitButton.disabled = true;

  try {
    await addDoc(
      collection(db, "categories"),
      {
        name,
        sortOrder,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }
    );

    $("categoryForm").reset();
    $("categorySort").value = "0";

    await loadCategories();

    setMessage(
      "categoryMessage",
      "تمت إضافة التصنيف بنجاح.",
      "success"
    );

    notify("تمت إضافة التصنيف.");

  } catch (error) {
    console.error("Category create failed:", error);

    setMessage(
      "categoryMessage",
      "تعذرت إضافة التصنيف. راجع قواعد Firestore.",
      "error"
    );

  } finally {
    submitButton.disabled = false;
  }
});

async function deactivateCategory(id) {
  const category = categories.find(
    (item) => item.id === id
  );

  if (!category) return;

  const confirmed = window.confirm(
    `هل تريد إخفاء التصنيف "${category.name}"؟`
  );

  if (!confirmed) return;

  try {
    await updateDoc(
      doc(db, "categories", id),
      {
        active: false,
        updatedAt: serverTimestamp()
      }
    );

    await loadCategories();

    notify("تم إخفاء التصنيف.");

  } catch (error) {
    console.error("Category update failed:", error);
    notify("تعذر إخفاء التصنيف.");
  }
}

$("refreshCategories")?.addEventListener(
  "click",
  async () => {
    await loadCategories();
    notify("تم تحديث التصنيفات.");
  }
);

/* =========================================
   INVENTORY
========================================= */

function stockStatus(quantity) {
  if (quantity <= 0) {
    return {
      label: "نفد المخزون",
      className: "out"
    };
  }

  if (quantity <= Number(settings.lowStockThreshold || 0)) {
    return {
      label: "مخزون منخفض",
      className: "draft"
    };
  }

  return {
    label: "متوفر",
    className: "published"
  };
}

function renderInventory() {
  const body = $("inventoryTableBody");

  if (!body) return;

  const term = cleanText(
    $("inventorySearch").value
  ).toLocaleLowerCase();

  const filter = $("inventoryFilter").value;

  const total = products.reduce(
    (sum, item) => sum + getProductQuantity(item),
    0
  );

  const low = products.filter(isLowStock).length;

  const out = products.filter(
    (item) => getProductQuantity(item) <= 0
  ).length;

  $("inventoryTotal").textContent = total;
  $("inventoryLow").textContent = low;
  $("inventoryOut").textContent = out;

  const filtered = products.filter((item) => {
    const searchable =
      `${item.name || ""} ${item.category || ""}`
        .toLocaleLowerCase();

    const quantity = getProductQuantity(item);

    const matchesSearch = searchable.includes(term);

    const matchesFilter =
      filter === "all" ||
      (filter === "low" &&
        quantity > 0 &&
        quantity <= Number(settings.lowStockThreshold || 0)) ||
      (filter === "out" && quantity <= 0) ||
      (filter === "available" &&
        quantity > Number(settings.lowStockThreshold || 0));

    return matchesSearch && matchesFilter;
  });

  body.innerHTML = "";

  if (!filtered.length) {
    createEmptyRow(
      body,
      5,
      "لا توجد منتجات مطابقة."
    );
    return;
  }

  filtered.forEach((product) => {
    const row = document.createElement("tr");

    const name = createCell(
      product.name || "بدون اسم"
    );

    const category = createCell(
      product.category || "—"
    );

    const quantity = getProductQuantity(product);

    const current = createCell(String(quantity));

    const statusCell = document.createElement("td");
    const status = stockStatus(quantity);

    const pill = document.createElement("span");
    pill.className = `status-label ${status.className}`;
    pill.textContent = status.label;

    statusCell.append(pill);

    const editCell = document.createElement("td");
    const wrap = document.createElement("div");

    wrap.className = "stock-edit";

    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.step = "1";
    input.value = quantity;

    input.setAttribute(
      "aria-label",
      `الكمية الجديدة للمنتج ${product.name || ""}`
    );

    const save = document.createElement("button");
    save.type = "button";
    save.textContent = "حفظ";

    save.addEventListener("click", async () => {
      const nextQuantity = Number(input.value);

      if (
        !Number.isInteger(nextQuantity) ||
        nextQuantity < 0
      ) {
        notify("أدخل كمية صحيحة غير سالبة.");
        return;
      }

      save.disabled = true;

      try {
        await updateDoc(
          doc(db, "products", product.id),
          {
            quantity: nextQuantity,
            updatedAt: serverTimestamp()
          }
        );

        await loadProducts();

        notify("تم تحديث كمية المنتج.");

      } catch (error) {
        console.error("Stock update failed:", error);
        notify("تعذر تحديث الكمية.");

      } finally {
        save.disabled = false;
      }
    });

    wrap.append(input, save);
    editCell.append(wrap);

    row.append(
      name,
      category,
      current,
      statusCell,
      editCell
    );

    body.append(row);
  });
}

$("inventorySearch")?.addEventListener(
  "input",
  renderInventory
);

$("inventoryFilter")?.addEventListener(
  "change",
  renderInventory
);

$("refreshInventory")?.addEventListener(
  "click",
  async () => {
    await loadProducts();
    notify("تم تحديث المخزون.");
  }
);

/* =========================================
   REPORTS
========================================= */

function renderReport() {
  const box = $("reportSummary");

  if (!box) return;

  const published = products.filter(
    (item) => item.status === "published"
  ).length;

  const stock = products.reduce(
    (sum, item) => sum + getProductQuantity(item),
    0
  );

  const low = products.filter(isLowStock).length;

  box.innerHTML = "";

  const values = [
    ["عدد المنتجات", products.length],
    ["المنتجات المنشورة", published],
    ["إجمالي القطع", stock],
    ["مخزون منخفض", low]
  ];

  values.forEach(([label, value]) => {
    const item = document.createElement("div");
    item.className = "report-box";

    const title = document.createElement("span");
    title.textContent = label;

    const number = document.createElement("strong");
    number.textContent = Number(value).toLocaleString("ar-LY");

    item.append(title, number);
    box.append(item);
  });
}

/* =========================================
   EXPORT PRODUCTS CSV
========================================= */

function escapeCSV(value) {
  let text = String(value ?? "");

  /*
    حماية ملف CSV من تفسير النصوص التي تبدأ
    بعلامات معادلات عند فتحها في برامج الجداول.
  */
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

$("exportProductsCsv")?.addEventListener("click", () => {
  const headers = [
    "Product ID",
    "Name",
    "Category",
    "Price",
    "Sale Price",
    "Quantity",
    "Status",
    "Sizes",
    "Colors"
  ];

  const rows = products.map((item) => [
    item.id,
    item.name,
    item.category,
    item.price,
    item.salePrice ?? "",
    item.quantity,
    item.status,
    Array.isArray(item.sizes)
      ? item.sizes.join(" / ")
      : "",
    Array.isArray(item.colors)
      ? item.colors.join(" / ")
      : ""
  ]);

  const csv = [
    headers.map(escapeCSV).join(","),
    ...rows.map((row) =>
      row.map(escapeCSV).join(",")
    )
  ].join("\r\n");

  const blob = new Blob(
    ["\uFEFF" + csv],
    { type: "text/csv;charset=utf-8;" }
  );

  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = safeFileName("NADO-LIBYA-products") + ".csv";

  document.body.append(link);
  link.click();
  link.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);

  notify("تم تجهيز تقرير المنتجات.");
});

/* =========================================
   CUSTOMERS
   Customers are derived from stored orders.
========================================= */

function getCustomerDetails(order) {
  const nested = (
    order.customer &&
    typeof order.customer === "object"
  )
    ? order.customer
    : {};

  const name =
    order.customerName ||
    order.name ||
    nested.name ||
    nested.fullName ||
    order.fullName ||
    "عميل بدون اسم";

  const phone =
    order.customerPhone ||
    order.phone ||
    nested.phone ||
    nested.phoneNumber ||
    order.phoneNumber ||
    "";

  return {
    name: cleanText(String(name)),
    phone: cleanText(String(phone))
  };
}

function buildCustomers(orders) {
  const map = new Map();

  orders.forEach((order) => {
    const details = getCustomerDetails(order);

    const key = details.phone || details.name.toLocaleLowerCase();

    if (!key) return;

    if (!map.has(key)) {
      map.set(key, {
        name: details.name,
        phone: details.phone,
        orderCount: 0,
        lastOrder: null,
        lastOrderTimestamp: 0
      });
    }

    const customer = map.get(key);

    customer.orderCount += 1;

    const orderTimestamp = getTimestamp(order.createdAt);

    if (orderTimestamp > customer.lastOrderTimestamp) {
      customer.lastOrderTimestamp = orderTimestamp;
      customer.lastOrder = order.createdAt;
    }
  });

  return [...map.values()].sort(
    (a, b) => b.lastOrderTimestamp - a.lastOrderTimestamp
  );
}

async function loadCustomers() {
  if (loadingCustomers) return;

  loadingCustomers = true;

  const body = $("customersTableBody");

  if (body) {
    createEmptyRow(body, 4, "جارٍ تحميل بيانات العملاء...");
  }

  try {
    const snapshot = await getDocs(
      collection(db, "orders")
    );

    ordersForCustomers = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data()
    }));

    customers = buildCustomers(ordersForCustomers);

    $("customersTotal").textContent = customers.length;
    $("customersOrders").textContent = ordersForCustomers.length;

    renderCustomers();

  } catch (error) {
    console.error("Customers loading failed:", error);

    $("customersTotal").textContent = "—";
    $("customersOrders").textContent = "—";

    createEmptyRow(
      body,
      4,
      "تعذر تحميل العملاء. تأكد من أن حساب المدير يملك صلاحية قراءة الطلبات."
    );

  } finally {
    loadingCustomers = false;
  }
}

function renderCustomers() {
  const body = $("customersTableBody");

  if (!body) return;

  const term = cleanText(
    $("customerSearch").value
  ).toLocaleLowerCase();

  const filtered = customers.filter((customer) => {
    const searchText =
      `${customer.name} ${customer.phone}`.toLocaleLowerCase();

    return searchText.includes(term);
  });

  body.innerHTML = "";

  if (!filtered.length) {
    createEmptyRow(
      body,
      4,
      customers.length
        ? "لا توجد نتائج مطابقة."
        : "لا توجد بيانات عملاء بعد."
    );
    return;
  }

  filtered.forEach((customer) => {
    const row = document.createElement("tr");

    row.append(
      createCell(customer.name),
      createCell(customer.phone || "—"),
      createCell(String(customer.orderCount)),
      createCell(formatDate(customer.lastOrder))
    );

    body.append(row);
  });
}

$("customerSearch")?.addEventListener(
  "input",
  renderCustomers
);

$("refreshCustomers")?.addEventListener(
  "click",
  async () => {
    await loadCustomers();
    notify("تم تحديث قائمة العملاء.");
  }
);

/* =========================================
   DISCOUNTS
   Uses product.salePrice.
========================================= */

function getDiscountInfo(product) {
  const price = Number(product.price);
  const salePrice = Number(product.salePrice);

  if (
    !Number.isFinite(price) ||
    !Number.isFinite(salePrice) ||
    price <= 0 ||
    salePrice <= 0 ||
    salePrice >= price
  ) {
    return null;
  }

  const percentage = Math.round(
    ((price - salePrice) / price) * 100
  );

  return {
    price,
    salePrice,
    percentage
  };
}

function renderDiscounts() {
  const body = $("discountsTableBody");

  if (!body) return;

  const discounted = products
    .map((product) => ({
      product,
      discount: getDiscountInfo(product)
    }))
    .filter((item) => item.discount !== null);

  const average = discounted.length
    ? Math.round(
        discounted.reduce(
          (sum, item) => sum + item.discount.percentage,
          0
        ) / discounted.length
      )
    : 0;

  $("discountProductsCount").textContent =
    discounted.length;

  $("discountAverage").textContent =
    `${average}%`;

  body.innerHTML = "";

  if (!discounted.length) {
    createEmptyRow(
      body,
      5,
      "لا توجد منتجات عليها تخفيض حالياً."
    );
    return;
  }

  discounted.forEach(({ product, discount }) => {
    const row = document.createElement("tr");

    row.append(
      createCell(product.name || "منتج بدون اسم"),
      createCell(money(discount.price)),
      createCell(money(discount.salePrice)),
      createCell(`${discount.percentage}%`)
    );

    const actionCell = document.createElement("td");

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "outline-button";
    edit.textContent = "تعديل";

    edit.addEventListener("click", () => {
      showView("products");
      editProduct(product.id);
    });

    actionCell.append(edit);
    row.append(actionCell);

    body.append(row);
  });
}

$("refreshDiscounts")?.addEventListener(
  "click",
  async () => {
    await loadProducts();
    notify("تم تحديث قائمة التخفيضات.");
  }
);

/* =========================================
   SETTINGS FOR ADMIN DISPLAY
   Main store settings are managed by
   admin-commerce.js.
========================================= */

function updateLocalSettingsFromCommerce(data = {}) {
  const threshold = Number(data.lowStockThreshold);

  if (
    Number.isInteger(threshold) &&
    threshold >= 0
  ) {
    settings.lowStockThreshold = threshold;
  }

  if (data.currency === "LYD") {
    settings.currency = "LYD";
  }

  updateDashboard();
  renderInventory();
  renderReport();
}

/*
  يسمح لملف إدارة المتجر بإرسال حد المخزون
  إلى لوحة المنتجات عند الحاجة.
*/
window.NADOAdmin = {
  refreshProducts: loadProducts,
  refreshCategories: loadCategories,
  refreshCustomers: loadCustomers,
  updateLocalSettings: updateLocalSettingsFromCommerce,
  showView
};

/* =========================================
   LOGOUT
========================================= */

$("logoutButton")?.addEventListener("click", async () => {
  const confirmed = window.confirm(
    "هل تريد تسجيل الخروج من لوحة الإدارة؟"
  );

  if (!confirmed) return;

  try {
    await signOut(auth);

    window.location.replace("admin-login.html");

  } catch (error) {
    console.error("Logout failed:", error);
    notify("تعذر تسجيل الخروج. حاول مرة أخرى.");
  }
});

/* =========================================
   START APPLICATION
========================================= */

async function startAdmin() {
  try {
    currentUser = await requireOwner();

    if (!currentUser) {
      return;
    }

    setupHeader();

    await Promise.all([
      loadProducts(),
      loadCategories()
    ]);

    renderProducts();
    renderInventory();
    renderReport();
    renderDiscounts();

    showView("dashboard");

  } catch (error) {
    console.error("Admin initialization failed:", error);

    notify(
      "تعذر تشغيل لوحة الإدارة. تحقق من تسجيل الدخول وإعدادات Firebase."
    );
  }
}

startAdmin();