import { db } from "./firebase.js";

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

/* =========================================
   ELEMENTS
========================================= */

const $ = (id) => document.getElementById(id);

const elements = {
  products: $("productsContainer"),
  search: $("productSearch"),
  category: $("categoryFilter"),
  sort: $("productSort"),

  categoryNavigation: $("categoryNavigation"),
  activeCategoryTitle: $("activeCategoryTitle"),
  productCount: $("productCount"),

  favoritesToggle: $("favoritesToggle"),
  favoritesCount: $("favoritesCount"),

  cartDialog: $("cartDialog"),
  optionsDialog: $("productOptionsDialog"),

  contactLinks: $("storeContactLinks"),
  footerLinks: $("footerSocialLinks")
};

const CART_KEY = "nado_libya_cart_v2";
const FAVORITES_KEY = "nado_libya_favorites_v1";

/* =========================================
   DEFAULT SETTINGS
========================================= */

const defaultSettings = {
  storeName: "NADO LIBYA",
  currency: "د.ل",

  phone: "",
  whatsapp: "",

  facebook: "",
  instagram: "",
  tiktok: "",
  snapchat: "",

  address: "",
  description: "",

  deliveryFee: 0,
  deliveryEnabled: true,
  pickupEnabled: true,

  paymentMethods: {
    cashOnDelivery: true,
    bankTransfer: false
  },

  bankDetails: {
    bankName: "",
    accountName: "",
    accountNumber: ""
  }
};

/* =========================================
   APPLICATION STATE
========================================= */

let products = [];

let cart = readSavedCart();

let favorites = readSavedFavorites();

let storeSettings = structuredClone(defaultSettings);

let selectedProduct = null;

let favoritesOnly = false;

let whatsappFallbackUrl = "";

/* =========================================
   STORAGE
========================================= */

function readSavedCart() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(CART_KEY) || "[]"
    );

    if (!Array.isArray(saved)) return [];

    return saved
      .filter((item) => item && typeof item.productId === "string")
      .map((item) => ({
        productId: item.productId,
        quantity: Math.max(
          1,
          Math.floor(Number(item.quantity) || 1)
        ),
        size: typeof item.size === "string" ? item.size : "",
        color: typeof item.color === "string" ? item.color : ""
      }));

  } catch (error) {
    console.warn("Saved cart could not be read:", error);
    return [];
  }
}

function saveCart() {
  try {
    localStorage.setItem(
      CART_KEY,
      JSON.stringify(cart)
    );
  } catch (error) {
    console.warn("Cart could not be saved:", error);
  }
}

function readSavedFavorites() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(FAVORITES_KEY) || "[]"
    );

    if (!Array.isArray(saved)) return new Set();

    return new Set(
      saved.filter((id) => typeof id === "string")
    );

  } catch (error) {
    console.warn("Favorites could not be read:", error);
    return new Set();
  }
}

function saveFavorites() {
  try {
    localStorage.setItem(
      FAVORITES_KEY,
      JSON.stringify([...favorites])
    );
  } catch (error) {
    console.warn("Favorites could not be saved:", error);
  }
}

/* =========================================
   HELPERS
========================================= */

function addTextElement(tag, text, className = "") {
  const element = document.createElement(tag);

  element.textContent = String(text ?? "");

  if (className) {
    element.className = className;
  }

  return element;
}

function normalizeChoices(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[,،]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function effectivePrice(product) {
  const price = Number(product.price);
  const sale = Number(product.salePrice);

  if (!Number.isFinite(price) || price < 0) {
    return 0;
  }

  if (
    Number.isFinite(sale) &&
    sale > 0 &&
    sale < price
  ) {
    return sale;
  }

  return price;
}

function formatMoney(value) {
  return `${Number(value || 0).toLocaleString("ar-LY", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })} ${storeSettings.currency || "د.ل"}`;
}

function safeExternalUrl(value) {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    return "";
  }

  try {
    const url = new URL(value.trim());

    return ["https:", "http:"].includes(url.protocol)
      ? url.href
      : "";

  } catch {
    return "";
  }
}

function normalizeWhatsappNumber(value) {
  return String(value || "")
    .replace(/\D/g, "")
    .replace(/^00/, "");
}

function normalizePhoneForDisplay(value) {
  return String(value || "").trim();
}

function showMessage(id, message, type = "") {
  const node = $(id);

  if (!node) return;

  node.textContent = message;
  node.className = `form-message ${type}`.trim();
}

function productStock(product) {
  const quantity = Number(product?.quantity);

  if (!Number.isFinite(quantity)) return 0;

  return Math.max(0, Math.floor(quantity));
}

/* =========================================
   STORE SETTINGS
========================================= */

async function loadStoreSettings() {
  try {
    const snapshot = await getDoc(
      doc(db, "publicSettings", "store")
    );

    if (snapshot.exists()) {
      const saved = snapshot.data();

      storeSettings = {
        ...defaultSettings,
        ...saved,

        paymentMethods: {
          ...defaultSettings.paymentMethods,
          ...(saved.paymentMethods || {})
        },

        bankDetails: {
          ...defaultSettings.bankDetails,
          ...(saved.bankDetails || {})
        }
      };
    }

  } catch (error) {
    console.error(
      "Store settings load failed:",
      error
    );
  }

  applyStoreDetails();

  setupDeliveryChoices();

  renderPaymentOptions();

  updateCart();
}

/* =========================================
   CONTACT LINKS
========================================= */

function createLink(
  label,
  url,
  className = "contact-link"
) {
  const safeUrl = safeExternalUrl(url);

  if (!safeUrl) return null;

  const link = document.createElement("a");

  link.href = safeUrl;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.className = className;
  link.textContent = label;

  return link;
}

function applyStoreDetails() {
  const name = storeSettings.storeName || "NADO LIBYA";

  $("siteLogo").textContent = name;

  document.title = `${name} | متجر الأزياء النسائية`;

  $("aboutDescription").textContent =
    storeSettings.description ||
    "متجر متخصص في الأزياء، نقدم أحدث التصاميم والقطع العصرية لنمنحك تجربة تسوق مميزة.";

  $("storeAddress").textContent =
    storeSettings.address
      ? `عنوان الفرع: ${storeSettings.address}`
      : "";

  elements.contactLinks.innerHTML = "";
  elements.footerLinks.innerHTML = "";

  const phone = normalizePhoneForDisplay(
    storeSettings.phone
  );

  if (phone) {
    const call = document.createElement("a");

    call.href = `tel:${phone.replace(/[^\d+]/g, "")}`;
    call.className = "contact-link";
    call.textContent = `اتصال: ${phone}`;

    elements.contactLinks.append(call);
  }

  const waNumber = normalizeWhatsappNumber(
    storeSettings.whatsapp
  );

  if (waNumber) {
    const whatsapp = createLink(
      "تواصلي عبر واتساب",
      `https://wa.me/${waNumber}`
    );

    if (whatsapp) {
      elements.contactLinks.append(whatsapp);
    }
  }

  const socials = [
    ["فيسبوك", storeSettings.facebook],
    ["إنستغرام", storeSettings.instagram],
    ["تيك توك", storeSettings.tiktok],
    ["سناب شات", storeSettings.snapchat]
  ];

  socials.forEach(([label, url]) => {
    const contactLink = createLink(label, url);

    const footerLink = createLink(
      label,
      url,
      "footer-social-link"
    );

    if (contactLink) {
      elements.contactLinks.append(contactLink);
    }

    if (footerLink) {
      elements.footerLinks.append(footerLink);
    }
  });

  if (!elements.contactLinks.children.length) {
    elements.contactLinks.append(
      addTextElement(
        "p",
        "لم تتم إضافة بيانات التواصل بعد.",
        "contact-loading"
      )
    );
  }

  $("currentYear").textContent =
    String(new Date().getFullYear());

  updatePickupAddress();
}

/* =========================================
   LOAD PRODUCTS
========================================= */

async function loadProducts() {
  elements.products.textContent =
    "جاري تحميل المنتجات...";

  try {
    const publishedQuery = query(
      collection(db, "products"),
      where("status", "==", "published")
    );

    const snapshot = await getDocs(publishedQuery);

    products = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data()
    }));

    products.sort((a, b) => {
      const dateA = a.createdAt?.toMillis?.() || 0;
      const dateB = b.createdAt?.toMillis?.() || 0;

      return dateB - dateA;
    });

    reconcileCartWithProducts();

    reconcileFavorites();

    buildCategories();

    renderProducts(products);

    updateCart();

    updateFavoritesInterface();

  } catch (error) {
    console.error(
      "Storefront products error:",
      error
    );

    elements.products.textContent =
      "تعذر تحميل المنتجات. تحقق من اتصال Firebase وقواعد Firestore.";
  }
}

/* =========================================
   RECONCILE CART AND FAVORITES
========================================= */

function reconcileCartWithProducts() {
  const alreadyAllocated = new Map();

  cart = cart.flatMap((entry) => {
    const product = products.find(
      (item) => item.id === entry.productId
    );

    if (!product) return [];

    const stock = productStock(product);

    const used =
      alreadyAllocated.get(entry.productId) || 0;

    const remaining = Math.max(0, stock - used);

    const quantity = Math.min(
      entry.quantity,
      remaining
    );

    if (quantity <= 0) return [];

    alreadyAllocated.set(
      entry.productId,
      used + quantity
    );

    return [{
      ...entry,
      quantity
    }];
  });

  saveCart();
}

function reconcileFavorites() {
  const existingIds = new Set(
    products.map((product) => product.id)
  );

  favorites = new Set(
    [...favorites].filter((id) => existingIds.has(id))
  );

  saveFavorites();
}

/* =========================================
   CATEGORIES
========================================= */

function buildCategories() {
  const categories = [
    ...new Set(
      products
        .map((item) => item.category)
        .filter((item) =>
          typeof item === "string" &&
          item.trim()
        )
    )
  ];

  categories.sort((a, b) =>
    a.localeCompare(b, "ar")
  );

  const previousCategory = elements.category.value;

  elements.category.innerHTML = "";

  elements.category.append(
    new Option("جميع الأقسام", "all")
  );

  categories.forEach((category) => {
    elements.category.append(
      new Option(category, category)
    );
  });

  if (categories.includes(previousCategory)) {
    elements.category.value = previousCategory;
  } else {
    elements.category.value = "all";
  }

  renderCategoryNavigation(categories);

  updateActiveCategoryTitle();
}

function renderCategoryNavigation(categories) {
  const nav = elements.categoryNavigation;

  nav.innerHTML = "";

  const allButton = createCategoryButton(
    "الكل",
    "all"
  );

  nav.append(allButton);

  categories.forEach((category) => {
    nav.append(
      createCategoryButton(category, category)
    );
  });

  updateCategoryNavigationState();
}

function createCategoryButton(label, value) {
  const button = addTextElement(
    "button",
    label,
    "category-nav-button"
  );

  button.type = "button";

  button.dataset.category = value;

  button.addEventListener("click", () => {
    elements.category.value = value;

    updateCategoryNavigationState();

    updateActiveCategoryTitle();

    filterProducts();

    $("products").scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  });

  return button;
}

function updateCategoryNavigationState() {
  const activeValue = elements.category.value || "all";

  elements.categoryNavigation
    .querySelectorAll(".category-nav-button")
    .forEach((button) => {
      const active =
        button.dataset.category === activeValue;

      button.classList.toggle("active", active);
    });
}

function updateActiveCategoryTitle() {
  const selectedCategory = elements.category.value;

  const title =
    selectedCategory === "all"
      ? "جميع المنتجات"
      : selectedCategory;

  elements.activeCategoryTitle.textContent = title;
}

/* =========================================
   PRODUCT CARDS
========================================= */

function renderProducts(items) {
  elements.products.innerHTML = "";

  $("productCount").textContent =
    String(items.length);

  if (!items.length) {
    elements.products.append(
      addTextElement(
        "p",
        favoritesOnly
          ? "لم تضيفي منتجات إلى المفضلة بعد."
          : "لا توجد منتجات مطابقة حالياً.",
        "empty-products"
      )
    );

    return;
  }

  items.forEach((product, index) => {
    const card = document.createElement("article");

    card.className = "products-card";
    card.style.animationDelay = `${Math.min(index * 35, 300)}ms`;

    /* IMAGE BUTTON */

    const imageButton = document.createElement("button");

    imageButton.type = "button";
    imageButton.className = "product-image-button";

    imageButton.setAttribute(
      "aria-label",
      `عرض ${product.name || "المنتج"}`
    );

    const imageBox = document.createElement("div");

    imageBox.className = "products-image";

    const imageUrl = safeExternalUrl(
      product.imageUrl
    );

    if (imageUrl) {
      const image = document.createElement("img");

      image.src = imageUrl;
      image.alt = product.name || "منتج NADO LIBYA";
      image.loading = "lazy";

      image.addEventListener("error", () => {
        image.remove();

        imageBox.append(
          addTextElement(
            "div",
            "NADO",
            "product-image-placeholder"
          )
        );
      });

      imageBox.append(image);

    } else {
      imageBox.append(
        addTextElement(
          "div",
          "NADO",
          "product-image-placeholder"
        )
      );
    }

    imageButton.append(imageBox);

    imageButton.addEventListener("click", () => {
      openProductOptions(product.id);
    });

    card.append(imageButton);

    /* BADGES */

    const badges = document.createElement("div");

    badges.className = "product-badges";

    const basePrice = Number(product.price);
    const finalPrice = effectivePrice(product);

    if (product.isNew === true) {
      badges.append(
        addTextElement(
          "span",
          "جديد",
          "badge"
        )
      );
    }

    if (
      Number.isFinite(basePrice) &&
      finalPrice < basePrice
    ) {
      badges.append(
        addTextElement(
          "span",
          "عرض",
          "badge sale"
        )
      );
    }

    if (badges.children.length) {
      card.append(badges);
    }

    /* FAVORITE BUTTON */

    const favoriteButton = addTextElement(
      "button",
      favorites.has(product.id) ? "♥" : "♡",
      `favorite-button ${favorites.has(product.id) ? "active" : ""}`
    );

    favoriteButton.type = "button";

    favoriteButton.setAttribute(
      "aria-label",
      favorites.has(product.id)
        ? "إزالة من المفضلة"
        : "إضافة للمفضلة"
    );

    favoriteButton.addEventListener("click", () => {
      toggleFavorite(product.id);
    });

    card.append(favoriteButton);

    /* CARD INFO */

    const info = document.createElement("div");

    info.className = "product-card-info";

    const topLine = document.createElement("div");

    topLine.className = "product-card-topline";

    const productName = addTextElement(
      "h3",
      product.name || "منتج جديد"
    );

    topLine.append(productName);

    info.append(topLine);

    if (product.category) {
      info.append(
        addTextElement(
          "p",
          product.category,
          "product-category-label"
        )
      );
    }

    if (product.description) {
      const shortDescription =
        String(product.description).length > 85
          ? `${String(product.description).slice(0, 85)}...`
          : product.description;

      info.append(
        addTextElement(
          "p",
          shortDescription,
          "product-description"
        )
      );
    }

    /* PRICE */

    const priceWrap = document.createElement("div");

    priceWrap.className = "product-price";

    if (
      Number.isFinite(basePrice) &&
      finalPrice < basePrice
    ) {
      priceWrap.append(
        addTextElement(
          "del",
          formatMoney(basePrice)
        ),

        addTextElement(
          "strong",
          formatMoney(finalPrice)
        )
      );

    } else {
      priceWrap.append(
        addTextElement(
          "strong",
          formatMoney(finalPrice)
        )
      );
    }

    info.append(priceWrap);

    /* ADD BUTTON */

    const stock = productStock(product);

    const addButton = addTextElement(
      "button",
      stock > 0
        ? "اختاري المنتج"
        : "غير متوفر",
      "add-to-cart"
    );

    addButton.type = "button";
    addButton.disabled = stock <= 0;

    addButton.addEventListener("click", () => {
      openProductOptions(product.id);
    });

    info.append(addButton);

    card.append(info);

    elements.products.append(card);
  });
}

/* =========================================
   FAVORITES
========================================= */

function toggleFavorite(productId) {
  if (favorites.has(productId)) {
    favorites.delete(productId);
  } else {
    favorites.add(productId);
  }

  saveFavorites();

  updateFavoritesInterface();

  filterProducts();
}

function updateFavoritesInterface() {
  elements.favoritesCount.textContent =
    String(favorites.size);

  elements.favoritesToggle.classList.toggle(
    "active",
    favoritesOnly
  );

  elements.favoritesToggle.setAttribute(
    "aria-pressed",
    String(favoritesOnly)
  );

  const icon =
    elements.favoritesToggle.querySelector("span:first-child");

  if (icon) {
    icon.textContent = favoritesOnly ? "♥" : "♡";
  }
}

function toggleFavoritesView() {
  favoritesOnly = !favoritesOnly;

  updateFavoritesInterface();

  filterProducts();
}

/* =========================================
   FILTER AND SORT
========================================= */

function filterProducts() {
  const term = elements.search.value
    .trim()
    .toLocaleLowerCase();

  const category = elements.category.value;

  const sort = elements.sort.value;

  let filtered = products.filter((item) => {
    const searchable = [
      item.name || "",
      item.description || "",
      item.category || ""
    ].join(" ").toLocaleLowerCase();

    const matchesSearch =
      searchable.includes(term);

    const matchesCategory =
      category === "all" ||
      item.category === category;

    const matchesFavorites =
      !favoritesOnly ||
      favorites.has(item.id);

    return (
      matchesSearch &&
      matchesCategory &&
      matchesFavorites
    );
  });

  if (sort === "price-low") {
    filtered.sort(
      (a, b) =>
        effectivePrice(a) - effectivePrice(b)
    );
  }

  if (sort === "price-high") {
    filtered.sort(
      (a, b) =>
        effectivePrice(b) - effectivePrice(a)
    );
  }

  if (sort === "name") {
    filtered.sort((a, b) =>
      String(a.name || "").localeCompare(
        String(b.name || ""),
        "ar"
      )
    );
  }

  if (sort === "newest") {
    filtered.sort((a, b) => {
      const dateA = a.createdAt?.toMillis?.() || 0;
      const dateB = b.createdAt?.toMillis?.() || 0;

      return dateB - dateA;
    });
  }

  updateActiveCategoryTitle();

  updateCategoryNavigationState();

  renderProducts(filtered);
}

/* =========================================
   PRODUCT QUICK VIEW
========================================= */

function openProductOptions(productId) {
  const product = products.find(
    (item) => item.id === productId
  );

  if (!product) return;

  const stock = productStock(product);

  if (stock <= 0) {
    alert("هذا المنتج غير متوفر حالياً.");
    return;
  }

  selectedProduct = product;

  const sizes = normalizeChoices(product.sizes);

  const colors = normalizeChoices(product.colors);

  $("optionsProductName").textContent =
    product.name || "اختيارات المنتج";

  $("optionsProductDescription").textContent =
    product.description || "منتج من مجموعة NADO LIBYA.";

  $("optionsProductPrice").textContent =
    formatMoney(effectivePrice(product));

  $("optionsStockHint").textContent =
    `الكمية المتوفرة حالياً: ${stock}`;

  $("itemQuantityInput").value = "1";

  $("itemQuantityInput").max = String(stock);

  /* PRODUCT IMAGE */

  const image = $("optionsProductImage");

  const imageUrl = safeExternalUrl(
    product.imageUrl
  );

  if (imageUrl) {
    image.src = imageUrl;
    image.alt = product.name || "صورة المنتج";
    image.hidden = false;

    image.onerror = () => {
      image.removeAttribute("src");
      image.hidden = true;
    };

  } else {
    image.removeAttribute("src");
    image.hidden = true;
  }

  populateChoiceSelect(
    "itemSizeSelect",
    "sizeField",
    sizes,
    "اختاري المقاس"
  );

  populateChoiceSelect(
    "itemColorSelect",
    "colorField",
    colors,
    "اختاري اللون"
  );

  elements.optionsDialog.showModal();
}

function populateChoiceSelect(
  selectId,
  fieldId,
  choices,
  placeholder
) {
  const select = $(selectId);

  const field = $(fieldId);

  select.innerHTML = "";

  if (!choices.length) {
    field.hidden = true;
    select.required = false;
    return;
  }

  field.hidden = false;
  select.required = true;

  select.append(
    new Option(placeholder, "")
  );

  choices.forEach((choice) => {
    select.append(
      new Option(choice, choice)
    );
  });
}

/* =========================================
   ADD PRODUCT TO CART
========================================= */

function addSelectedProduct(event) {
  event.preventDefault();

  if (!selectedProduct) return;

  const quantity = Number(
    $("itemQuantityInput").value
  );

  const stock = productStock(selectedProduct);

  const size = $("sizeField").hidden
    ? ""
    : $("itemSizeSelect").value;

  const color = $("colorField").hidden
    ? ""
    : $("itemColorSelect").value;

  if (
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > stock
  ) {
    alert(
      "الكمية المختارة غير صحيحة أو تتجاوز المتوفر."
    );

    return;
  }

  if (!$("sizeField").hidden && !size) {
    alert("اختاري المقاس أولاً.");
    return;
  }

  if (!$("colorField").hidden && !color) {
    alert("اختاري اللون أولاً.");
    return;
  }

  const existing = cart.find((item) =>
    item.productId === selectedProduct.id &&
    item.size === size &&
    item.color === color
  );

  const alreadyInCart = cart
    .filter((item) =>
      item.productId === selectedProduct.id
    )
    .reduce(
      (sum, item) => sum + item.quantity,
      0
    );

  if (alreadyInCart + quantity > stock) {
    alert(
      `المتاح من هذا المنتج ${stock} فقط، والموجود في السلة ${alreadyInCart}.`
    );

    return;
  }

  if (existing) {
    existing.quantity += quantity;

  } else {
    cart.push({
      productId: selectedProduct.id,
      quantity,
      size,
      color
    });
  }

  selectedProduct = null;

  saveCart();

  updateCart();

  elements.optionsDialog.close();

  showMessage(
    "cartMessage",
    "تمت إضافة المنتج إلى حقيبة التسوق.",
    "success"
  );
}

/* =========================================
   CART HELPERS
========================================= */

function cartProduct(entry) {
  return products.find(
    (product) => product.id === entry.productId
  );
}

function cartSubtotal() {
  return cart.reduce((sum, entry) => {
    const product = cartProduct(entry);

    return sum + (
      product
        ? effectivePrice(product) * entry.quantity
        : 0
    );

  }, 0);
}

function selectedDeliveryMethod() {
  return document.querySelector(
    'input[name="deliveryMethod"]:checked'
  )?.value || "delivery";
}

function currentDeliveryFee() {
  return selectedDeliveryMethod() === "delivery"
    ? Math.max(
        0,
        Number(storeSettings.deliveryFee) || 0
      )
    : 0;
}

/* =========================================
   RENDER CART
========================================= */

function updateCart() {
  const box = $("cartItems");

  box.innerHTML = "";

  let count = 0;

  cart.forEach((entry) => {
    count += entry.quantity;
  });

  if (!cart.length) {
    box.append(
      addTextElement(
        "p",
        "حقيبتك فارغة حالياً.",
        "empty-cart"
      )
    );
  }

  cart.forEach((entry, index) => {
    const product = cartProduct(entry);

    if (!product) return;

    const row = document.createElement("article");

    row.className = "cart-item";

    /* IMAGE */

    const imageUrl = safeExternalUrl(
      product.imageUrl
    );

    if (imageUrl) {
      const image = document.createElement("img");

      image.src = imageUrl;
      image.alt = product.name || "منتج";
      image.className = "cart-item-image";
      image.loading = "lazy";

      image.addEventListener("error", () => {
        image.remove();
      });

      row.append(image);

    } else {
      const placeholder = addTextElement(
        "div",
        "NADO",
        "cart-item-image product-image-placeholder"
      );

      row.append(placeholder);
    }

    /* MAIN */

    const main = document.createElement("div");

    main.className = "cart-item-main";

    const name = addTextElement(
      "h3",
      product.name || "منتج"
    );

    const variants = [
      entry.size ? `المقاس: ${entry.size}` : "",
      entry.color ? `اللون: ${entry.color}` : ""
    ].filter(Boolean).join(" · ");

    const details = addTextElement(
      "p",
      variants || "اختيار من مجموعة NADO"
    );

    const price = addTextElement(
      "p",
      formatMoney(
        effectivePrice(product) * entry.quantity
      ),
      "cart-item-price"
    );

    main.append(name, details, price);

    /* CONTROLS */

    const controls = document.createElement("div");

    controls.className = "cart-item-controls";

    const minus = addTextElement(
      "button",
      "−",
      "quantity-button"
    );

    minus.type = "button";

    minus.setAttribute(
      "aria-label",
      "تقليل الكمية"
    );

    minus.addEventListener("click", () => {
      changeCartQuantity(index, -1);
    });

    const amount = addTextElement(
      "strong",
      String(entry.quantity),
      "cart-quantity"
    );

    const plus = addTextElement(
      "button",
      "+",
      "quantity-button"
    );

    plus.type = "button";

    plus.setAttribute(
      "aria-label",
      "زيادة الكمية"
    );

    plus.addEventListener("click", () => {
      changeCartQuantity(index, 1);
    });

    const remove = addTextElement(
      "button",
      "حذف",
      "remove-cart-item"
    );

    remove.type = "button";

    remove.addEventListener("click", () => {
      cart.splice(index, 1);

      saveCart();

      updateCart();
    });

    controls.append(
      minus,
      amount,
      plus,
      remove
    );

    main.append(controls);

    row.append(main);

    box.append(row);
  });

  const subtotal = cartSubtotal();

  const deliveryFee = cart.length
    ? currentDeliveryFee()
    : 0;

  const total = subtotal + deliveryFee;

  $("cartCount").textContent = String(count);

  $("cartSubtotal").textContent =
    formatMoney(subtotal);

  $("cartDeliveryFee").textContent =
    formatMoney(deliveryFee);

  $("cartTotal").textContent =
    formatMoney(total);

  $("checkoutFinalTotal").textContent =
    formatMoney(total);

  $("showCheckoutButton").disabled =
    cart.length === 0;

  $("showCheckoutButton").hidden =
    cart.length === 0;

  if (!cart.length) {
    $("checkoutForm").hidden = true;
  } else {
    $("whatsappFallbackLink").hidden = true;
    $("checkoutMessage").textContent = "";
  }
}

/* =========================================
   CHANGE CART QUANTITY
========================================= */

function changeCartQuantity(index, difference) {
  const entry = cart[index];

  if (!entry) return;

  const product = cartProduct(entry);

  const stock = productStock(product);

  const next = entry.quantity + difference;

  const otherLines = cart
    .filter((item, itemIndex) =>
      itemIndex !== index &&
      item.productId === entry.productId
    )
    .reduce(
      (sum, item) => sum + item.quantity,
      0
    );

  if (next + otherLines > stock) {
    alert(
      "لا توجد كمية إضافية متوفرة من هذا المنتج."
    );

    return;
  }

  if (next < 1) {
    cart.splice(index, 1);
  } else {
    entry.quantity = next;
  }

  saveCart();

  updateCart();
}

/* =========================================
   DELIVERY
========================================= */

function setupDeliveryChoices() {
  const fieldset = $("deliveryMethodFieldset");

  const deliveryRadio = fieldset.querySelector(
    'input[value="delivery"]'
  );

  const pickupRadio = fieldset.querySelector(
    'input[value="pickup"]'
  );

  deliveryRadio.closest("label").hidden =
    storeSettings.deliveryEnabled === false;

  pickupRadio.closest("label").hidden =
    storeSettings.pickupEnabled === false;

  if (
    storeSettings.deliveryEnabled === false &&
    storeSettings.pickupEnabled !== false
  ) {
    pickupRadio.checked = true;

  } else {
    deliveryRadio.checked = true;
  }

  fieldset.hidden =
    storeSettings.deliveryEnabled === false &&
    storeSettings.pickupEnabled === false;

  updateDeliveryFields();
}

function updateDeliveryFields() {
  const method = selectedDeliveryMethod();

  const isDelivery = method === "delivery";

  $("deliveryAddressField").hidden =
    !isDelivery;

  $("customerAddress").required =
    isDelivery;

  $("pickupAddressBox").hidden =
    isDelivery;

  updatePickupAddress();

  updateCart();
}

function updatePickupAddress() {
  const address =
    storeSettings.address ||
    "يرجى التواصل مع المتجر لمعرفة عنوان الفرع.";

  $("pickupAddressBox").textContent =
    `عنوان الاستلام من الفرع: ${address}`;
}

/* =========================================
   PAYMENT METHODS
========================================= */

function renderPaymentOptions() {
  const box = $("paymentOptions");

  box.innerHTML = "";

  const methods =
    storeSettings.paymentMethods || {};

  const bank =
    storeSettings.bankDetails || {};

  const bankReady = Boolean(
    bank.bankName &&
    bank.accountName &&
    bank.accountNumber
  );

  const options = [];

  if (methods.cashOnDelivery !== false) {
    options.push({
      value: "cash_on_delivery",
      label: "الدفع نقداً عند الاستلام"
    });
  }

  if (
    methods.bankTransfer === true &&
    bankReady
  ) {
    options.push({
      value: "bank_transfer",
      label: "تحويل مصرفي"
    });
  }

  if (!options.length) {
    box.append(
      addTextElement(
        "p",
        "طرق الدفع غير مفعّلة حالياً. يرجى التواصل مع المتجر.",
        "stock-hint"
      )
    );

    return;
  }

  options.forEach((option, index) => {
    const label = document.createElement("label");

    label.className = "choice-row";

    const input = document.createElement("input");

    input.type = "radio";
    input.name = "paymentMethod";
    input.value = option.value;
    input.checked = index === 0;

    input.addEventListener(
      "change",
      updatePaymentDetails
    );

    label.append(
      input,
      document.createTextNode(option.label)
    );

    box.append(label);
  });

  updatePaymentDetails();
}

function updatePaymentDetails() {
  const method = document.querySelector(
    'input[name="paymentMethod"]:checked'
  )?.value;

  const bank =
    storeSettings.bankDetails || {};

  const isBank =
    method === "bank_transfer";

  $("bankDetailsBox").hidden = !isBank;

  $("bankReferenceField").hidden = !isBank;

  if (isBank) {
    $("bankDetailsBox").textContent =
      `بيانات التحويل: ${bank.bankName} · اسم الحساب: ${bank.accountName} · رقم الحساب: ${bank.accountNumber}. يرجى عدم اعتبار التحويل مؤكداً قبل مراجعة المتجر.`;
  }
}

/* =========================================
   SHOW CHECKOUT
========================================= */

function showCheckoutForm() {
  if (!cart.length) return;

  if (!normalizeWhatsappNumber(storeSettings.whatsapp)) {
    showMessage(
      "cartMessage",
      "لم يضف المتجر رقم واتساب دولياً بعد. يرجى التواصل مع الإدارة.",
      "error"
    );

    return;
  }

  $("checkoutForm").hidden = false;

  $("checkoutForm").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });

  showMessage(
    "cartMessage",
    "أكملي بياناتك لاختيار طريقة الاستلام والدفع."
  );
}

/* =========================================
   VALIDATE CHECKOUT
========================================= */

function validateCheckout(formData) {
  const customerName = String(
    formData.get("customerName") || ""
  ).trim();

  const customerPhone = String(
    formData.get("customerPhone") || ""
  ).trim();

  const city = String(
    formData.get("city") || ""
  ).trim();

  const address = String(
    formData.get("address") || ""
  ).trim();

  const notes = String(
    formData.get("notes") || ""
  ).trim();

  const deliveryMethod = String(
    formData.get("deliveryMethod") || ""
  );

  const paymentMethod = String(
    formData.get("paymentMethod") || ""
  );

  const phoneDigits =
    customerPhone.replace(/\D/g, "");

  if (customerName.length < 2) {
    throw new Error("أدخلي الاسم الكامل.");
  }

  if (
    phoneDigits.length < 8 ||
    phoneDigits.length > 15
  ) {
    throw new Error("تحققي من رقم الهاتف.");
  }

  if (city.length < 2) {
    throw new Error("أدخلي المدينة أو المنطقة.");
  }

  if (
    storeSettings.deliveryEnabled === false &&
    storeSettings.pickupEnabled === false
  ) {
    throw new Error(
      "طرق الاستلام غير متاحة حالياً. تواصلي مع المتجر."
    );
  }

  if (
    deliveryMethod === "delivery" &&
    storeSettings.deliveryEnabled === false
  ) {
    throw new Error("التوصيل غير متاح حالياً.");
  }

  if (
    deliveryMethod === "pickup" &&
    storeSettings.pickupEnabled === false
  ) {
    throw new Error("الاستلام من الفرع غير متاح حالياً.");
  }

  if (
    deliveryMethod === "delivery" &&
    address.length < 5
  ) {
    throw new Error(
      "أدخلي عنوان التوصيل بالتفصيل."
    );
  }

  if (!["delivery", "pickup"].includes(deliveryMethod)) {
    throw new Error("اختاري طريقة الاستلام.");
  }

  if (
    !["cash_on_delivery", "bank_transfer"].includes(
      paymentMethod
    )
  ) {
    throw new Error(
      "لا توجد طريقة دفع متاحة. يرجى التواصل مع المتجر."
    );
  }

  const waNumber = normalizeWhatsappNumber(
    storeSettings.whatsapp
  );

  if (!waNumber) {
    throw new Error(
      "رقم واتساب المتجر غير مضبوط حالياً."
    );
  }

  const productTotals = new Map();

  cart.forEach((entry) => {
    productTotals.set(
      entry.productId,
      (productTotals.get(entry.productId) || 0) +
      entry.quantity
    );
  });

  const currentProducts = cart.map((entry) => {
    const product = cartProduct(entry);

    if (!product) {
      throw new Error(
        "أحد المنتجات لم يعد متوفراً. حدّثي الصفحة."
      );
    }

    const stock = productStock(product);

    const totalRequested =
      productTotals.get(entry.productId) || 0;

    if (totalRequested > stock) {
      throw new Error(
        `الكمية المتاحة من ${product.name} تغيرت. راجعي السلة.`
      );
    }

    const sizes = normalizeChoices(product.sizes);

    const colors = normalizeChoices(product.colors);

    if (sizes.length && !sizes.includes(entry.size)) {
      throw new Error(
        `اختاري مقاساً صالحاً لمنتج ${product.name}.`
      );
    }

    if (
      colors.length &&
      !colors.includes(entry.color)
    ) {
      throw new Error(
        `اختاري لوناً صالحاً لمنتج ${product.name}.`
      );
    }

    return {
      productId: product.id,

      name: String(
        product.name || "منتج"
      ),

      unitPrice: effectivePrice(product),

      quantity: entry.quantity,

      size: entry.size || "",

      color: entry.color || "",

      lineTotal:
        effectivePrice(product) * entry.quantity
    };
  });

  const subtotal = currentProducts.reduce(
    (sum, item) => sum + item.lineTotal,
    0
  );

  const deliveryFee =
    deliveryMethod === "delivery"
      ? Math.max(
          0,
          Number(storeSettings.deliveryFee) || 0
        )
      : 0;

  const total = subtotal + deliveryFee;

  const paymentMethods =
    storeSettings.paymentMethods || {};

  if (
    paymentMethod === "cash_on_delivery" &&
    paymentMethods.cashOnDelivery === false
  ) {
    throw new Error(
      "الدفع نقداً عند الاستلام غير متاح حالياً."
    );
  }

  if (
    paymentMethod === "bank_transfer" &&
    paymentMethods.bankTransfer !== true
  ) {
    throw new Error(
      "التحويل المصرفي غير متاح حالياً."
    );
  }

  const bank = storeSettings.bankDetails || {};

  if (
    paymentMethod === "bank_transfer" &&
    !(
      bank.bankName &&
      bank.accountName &&
      bank.accountNumber
    )
  ) {
    throw new Error(
      "بيانات التحويل المصرفي غير مكتملة."
    );
  }

  return {
    customerName,
    customerPhone,
    city,

    address:
      deliveryMethod === "pickup"
        ? (
            storeSettings.address ||
            "استلام من الفرع"
          )
        : address,

    notes,

    deliveryMethod,

    paymentMethod,

    bankReference:
      paymentMethod === "bank_transfer"
        ? String(
            $("bankReference").value || ""
          ).trim()
        : "",

    items: currentProducts,

    subtotal,

    deliveryFee,

    total,

    currency:
      storeSettings.currency || "د.ل",

    paymentStatus:
      paymentMethod === "bank_transfer"
        ? "awaiting_verification"
        : "unpaid"
  };
}

/* =========================================
   ORDER MESSAGE HELPERS
========================================= */

function paymentMethodLabel(value) {
  return value === "bank_transfer"
    ? "تحويل مصرفي"
    : "نقداً عند الاستلام";
}

function deliveryMethodLabel(value) {
  return value === "pickup"
    ? "استلام من الفرع"
    : "توصيل";
}

function buildWhatsappMessage(order, orderId) {
  const lines = [
    `طلب جديد من ${storeSettings.storeName || "NADO LIBYA"}`,

    `رقم الطلب: ${orderId}`,

    "",

    `اسم الزبون: ${order.customerName}`,

    `الهاتف: ${order.customerPhone}`,

    `المدينة / المنطقة: ${order.city}`,

    `طريقة الاستلام: ${deliveryMethodLabel(order.deliveryMethod)}`,

    `العنوان: ${order.address}`,

    `طريقة الدفع: ${paymentMethodLabel(order.paymentMethod)}`,

    "",

    "تفاصيل المنتجات:"
  ];

  order.items.forEach((item, index) => {
    const choices = [
      item.size
        ? `المقاس ${item.size}`
        : "",

      item.color
        ? `اللون ${item.color}`
        : ""
    ]
      .filter(Boolean)
      .join("، ");

    lines.push(
      `${index + 1}. ${item.name}${choices ? ` (${choices})` : ""} × ${item.quantity} = ${formatMoney(item.lineTotal)}`
    );
  });

  lines.push(
    "",

    `قيمة المنتجات: ${formatMoney(order.subtotal)}`,

    `رسوم التوصيل: ${formatMoney(order.deliveryFee)}`,

    `الإجمالي: ${formatMoney(order.total)}`
  );

  if (order.bankReference) {
    lines.push(
      `مرجع التحويل: ${order.bankReference}`
    );
  }

  if (order.notes) {
    lines.push(
      `ملاحظات: ${order.notes}`
    );
  }

  lines.push(
    "",
    "يرجى مراجعة توفر المنتجات وتأكيد الطلب."
  );

  return lines.join("\n");
}

/* =========================================
   SUBMIT ORDER
========================================= */

async function submitOrder(event) {
  event.preventDefault();

  if (!cart.length) {
    showMessage(
      "checkoutMessage",
      "السلة فارغة.",
      "error"
    );

    return;
  }

  const button = $("placeOrderButton");

  button.disabled = true;

  button.textContent = "جارٍ تسجيل الطلب...";

  showMessage(
    "checkoutMessage",
    "يتم حفظ الطلب لدى المتجر..."
  );

  /*
    فتح نافذة فارغة مباشرة من ضغط الزبون
    لتقليل احتمال منع نافذة واتساب.
  */

  const whatsappWindow = window.open(
    "about:blank",
    "_blank"
  );

  try {
    const formData = new FormData(
      $("checkoutForm")
    );

    const order = validateCheckout(formData);

    const orderDocument = {
      ...order,

      status: "new",

      source: "website",

      createdAt: serverTimestamp()
    };

    const savedOrder = await addDoc(
      collection(db, "orders"),
      orderDocument
    );

    const message = buildWhatsappMessage(
      order,
      savedOrder.id
    );

    whatsappFallbackUrl =
      `https://wa.me/${normalizeWhatsappNumber(storeSettings.whatsapp)}?text=${encodeURIComponent(message)}`;

    cart = [];

    saveCart();

    updateCart();

    $("checkoutForm").hidden = true;

    $("whatsappFallbackLink").href =
      whatsappFallbackUrl;

    $("whatsappFallbackLink").hidden = false;

    showMessage(
      "checkoutMessage",
      `تم تسجيل طلبك بنجاح. رقم الطلب: ${savedOrder.id}. سيُفتح واتساب لإرسال التفاصيل إلى المتجر.`,
      "success"
    );

    if (
      whatsappWindow &&
      !whatsappWindow.closed
    ) {
      whatsappWindow.location.href =
        whatsappFallbackUrl;

    } else {
      showMessage(
        "checkoutMessage",
        `تم تسجيل طلبك بنجاح برقم ${savedOrder.id}. اضغطي على زر واتساب لإرسال التفاصيل للمتجر.`,
        "success"
      );
    }

  } catch (error) {
    console.error(
      "Order submission failed:",
      error
    );

    if (
      whatsappWindow &&
      !whatsappWindow.closed
    ) {
      whatsappWindow.close();
    }

    showMessage(
      "checkoutMessage",
      error.message ||
        "تعذر تسجيل الطلب. حاولي مرة أخرى أو تواصلي مع المتجر.",
      "error"
    );

  } finally {
    button.disabled = false;

    button.textContent = "تأكيد الطلب";
  }
}

/* =========================================
   EVENTS
========================================= */

function initializeEvents() {
  /* SEARCH */

  elements.search.addEventListener(
    "input",
    filterProducts
  );

  /* CATEGORY FILTER */

  elements.category.addEventListener(
    "change",
    () => {
      updateCategoryNavigationState();

      updateActiveCategoryTitle();

      filterProducts();
    }
  );

  /* SORT */

  elements.sort.addEventListener(
    "change",
    filterProducts
  );

  /* FAVORITES */

  elements.favoritesToggle.addEventListener(
    "click",
    toggleFavoritesView
  );

  /* CART */

  $("cartButton").addEventListener(
    "click",
    () => {
      elements.cartDialog.showModal();
    }
  );

  $("closeCartButton").addEventListener(
    "click",
    () => {
      elements.cartDialog.close();
    }
  );

  /* HEADER LINK */

  $("headerCartLink").addEventListener(
    "click",
    (event) => {
      event.preventDefault();

      $("products").scrollIntoView({
        behavior: "smooth"
      });
    }
  );

  /* CHECKOUT */

  $("showCheckoutButton").addEventListener(
    "click",
    showCheckoutForm
  );

  $("checkoutForm").addEventListener(
    "submit",
    submitOrder
  );

  /* PRODUCT OPTIONS */

  $("productOptionsForm").addEventListener(
    "submit",
    addSelectedProduct
  );

  $("closeOptionsButton").addEventListener(
    "click",
    () => {
      elements.optionsDialog.close();
    }
  );

  /* DELIVERY */

  document
    .querySelectorAll('input[name="deliveryMethod"]')
    .forEach((radio) => {
      radio.addEventListener(
        "change",
        updateDeliveryFields
      );
    });

  /* CLOSE CART MESSAGE */

  $("cartDialog").addEventListener(
    "close",
    () => {
      showMessage("cartMessage", "");
    }
  );
}

/* =========================================
   INITIALIZE APPLICATION
========================================= */

initializeEvents();

loadStoreSettings();

loadProducts();