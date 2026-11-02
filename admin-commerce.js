import { db } from "./firebase.js";
import { requireOwner } from "./admin-guard.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

const PAYMENT_LABELS = {
  cash_on_delivery: "نقداً عند الاستلام",
  bank_transfer: "تحويل مصرفي"
};

const DELIVERY_LABELS = {
  delivery: "توصيل",
  pickup: "استلام من الفرع"
};

const STATUS_LABELS = {
  new: "جديد",
  confirmed: "تم التأكيد",
  preparing: "قيد التجهيز",
  shipped: "تم الشحن / خرج للتوصيل",
  delivered: "تم التسليم",
  cancelled: "ملغي"
};

let storeRecord = {};
let orders = [];

function makeField(labelText, control, wide = false) {
  const label = document.createElement("label");
  label.className = wide ? "field field-full commerce-field" : "field commerce-field";
  label.append(document.createTextNode(labelText), control);
  return label;
}

function inputField(id, type, placeholder = "", value = "") {
  const input = document.createElement("input");
  input.id = id;
  input.type = type;
  input.value = value;
  input.placeholder = placeholder;

  if (type === "number") {
    input.min = "0";
    input.step = "0.01";
  }

  return input;
}

function checkboxField(id, labelText) {
  const wrap = document.createElement("label");
  wrap.className = "commerce-checkbox";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.id = id;

  const text = document.createElement("span");
  text.textContent = labelText;

  wrap.append(input, text);
  return wrap;
}

function buildCommerceSettingsPanel() {
  const settingsView = $("view-settings");

  if (!settingsView || $("commerceSettingsForm")) return;

  const panel = document.createElement("div");
  panel.className = "panel commerce-settings-panel";

  const heading = document.createElement("div");
  heading.className = "panel-heading";

  const headingText = document.createElement("div");

  const title = document.createElement("h3");
  title.textContent = "إعدادات الطلبات والتواصل";

  const description = document.createElement("p");
  description.textContent =
    "أضيفي رقم واتساب وروابط صفحات المتجر وحددي طرق الاستلام والدفع.";

  headingText.append(title, description);
  heading.append(headingText);

  const form = document.createElement("form");
  form.id = "commerceSettingsForm";
  form.className = "form-grid commerce-form-grid";

  const whatsapp = inputField(
    "settingWhatsapp",
    "tel",
    "مثال: 2189XXXXXXXX"
  );

  whatsapp.inputMode = "numeric";

  form.append(
    makeField(
      "رقم واتساب المتجر بالصيغة الدولية ومن دون + أو مسافات",
      whatsapp,
      true
    )
  );

  const tiktok = inputField(
    "settingTikTok",
    "url",
    "https://www.tiktok.com/@..."
  );

  const snapchat = inputField(
    "settingSnapchat",
    "url",
    "https://www.snapchat.com/add/..."
  );

  form.append(makeField("رابط تيك توك", tiktok));
  form.append(makeField("رابط سناب شات", snapchat));

  const deliveryFee = inputField(
    "settingDeliveryFee",
    "number",
    "0",
    "0"
  );

  form.append(
    makeField("رسوم التوصيل (د.ل)", deliveryFee)
  );

  const options = document.createElement("div");
  options.className = "commerce-options field-full";

  options.append(
    checkboxField("settingDeliveryEnabled", "السماح بالتوصيل"),
    checkboxField("settingPickupEnabled", "السماح بالاستلام من الفرع"),
    checkboxField("settingCashOnDelivery", "الدفع نقداً عند الاستلام"),
    checkboxField("settingBankTransfer", "السماح بالتحويل المصرفي")
  );

  form.append(options);

  const bankTitle = document.createElement("h4");
  bankTitle.className = "field-full commerce-subtitle";
  bankTitle.textContent =
    "بيانات الحساب المصرفي (تظهر للزبون عند اختيار التحويل)";

  form.append(bankTitle);

  form.append(
    makeField(
      "اسم المصرف",
      inputField("settingBankName", "text", "اسم المصرف")
    )
  );

  form.append(
    makeField(
      "اسم صاحب الحساب",
      inputField("settingBankAccountName", "text", "اسم صاحب الحساب")
    )
  );

  form.append(
    makeField(
      "رقم الحساب / IBAN",
      inputField(
        "settingBankAccountNumber",
        "text",
        "رقم الحساب أو IBAN"
      ),
      true
    )
  );

  const actions = document.createElement("div");
  actions.className = "field-full form-actions";

  const save = document.createElement("button");
  save.type = "submit";
  save.className = "primary-button";
  save.textContent = "حفظ إعدادات التواصل والدفع";

  const message = document.createElement("span");
  message.id = "commerceSettingsMessage";
  message.className = "form-message";
  message.setAttribute("role", "status");

  actions.append(save, message);
  form.append(actions);

  panel.append(heading, form);
  settingsView.append(panel);

  form.addEventListener("submit", saveCommerceSettings);

  $("settingBankTransfer").addEventListener("change", () => {
    const enabled = $("settingBankTransfer").checked;

    $("settingBankName").required = enabled;
    $("settingBankAccountName").required = enabled;
    $("settingBankAccountNumber").required = enabled;
  });
}

function setCommerceMessage(message, type = "") {
  const node = $("commerceSettingsMessage");

  if (!node) return;

  node.textContent = message;
  node.className = `form-message ${type}`.trim();
}

async function loadCommerceSettings() {
  try {
    const snapshot = await getDoc(
      doc(db, "publicSettings", "store")
    );

    storeRecord = snapshot.exists()
      ? snapshot.data()
      : {};

    const paymentMethods = storeRecord.paymentMethods || {};
    const bank = storeRecord.bankDetails || {};

    $("settingWhatsapp").value =
      storeRecord.whatsapp || "";

    $("settingTikTok").value =
      storeRecord.tiktok || "";

    $("settingSnapchat").value =
      storeRecord.snapchat || "";

    $("settingDeliveryFee").value =
      Number(storeRecord.deliveryFee ?? 0);

    $("settingDeliveryEnabled").checked =
      storeRecord.deliveryEnabled !== false;

    $("settingPickupEnabled").checked =
      storeRecord.pickupEnabled !== false;

    $("settingCashOnDelivery").checked =
      paymentMethods.cashOnDelivery !== false;

    $("settingBankTransfer").checked =
      paymentMethods.bankTransfer === true;

    $("settingBankName").value =
      bank.bankName || "";

    $("settingBankAccountName").value =
      bank.accountName || "";

    $("settingBankAccountNumber").value =
      bank.accountNumber || "";

  } catch (error) {
    console.error("Commerce settings load error:", error);

    setCommerceMessage(
      "تعذر تحميل إعدادات الطلبات. راجعي صلاحيات Firestore.",
      "error"
    );
  }
}

async function saveCommerceSettings(event) {
  event.preventDefault();

  const fee = Number($("settingDeliveryFee").value);

  if (!Number.isFinite(fee) || fee < 0) {
    setCommerceMessage(
      "رسوم التوصيل يجب أن تكون صفراً أو أكثر.",
      "error"
    );
    return;
  }

  const deliveryEnabled =
    $("settingDeliveryEnabled").checked;

  const pickupEnabled =
    $("settingPickupEnabled").checked;

  const cashOnDelivery =
    $("settingCashOnDelivery").checked;

  const bankTransfer =
    $("settingBankTransfer").checked;

  if (!deliveryEnabled && !pickupEnabled) {
    setCommerceMessage(
      "فعّلي طريقة استلام واحدة على الأقل.",
      "error"
    );
    return;
  }

  if (!cashOnDelivery && !bankTransfer) {
    setCommerceMessage(
      "فعّلي طريقة دفع واحدة على الأقل.",
      "error"
    );
    return;
  }

  const bankDetails = {
    bankName: $("settingBankName").value.trim(),
    accountName: $("settingBankAccountName").value.trim(),
    accountNumber: $("settingBankAccountNumber").value.trim()
  };

  if (
    bankTransfer &&
    (
      !bankDetails.bankName ||
      !bankDetails.accountName ||
      !bankDetails.accountNumber
    )
  ) {
    setCommerceMessage(
      "أكملي بيانات الحساب المصرفي قبل تفعيل التحويل.",
      "error"
    );
    return;
  }

  const whatsapp =
    $("settingWhatsapp").value.replace(/\D/g, "");

  if (
    !whatsapp ||
    whatsapp.length < 10 ||
    whatsapp.length > 15
  ) {
    setCommerceMessage(
      "أدخلي رقم واتساب بالصيغة الدولية مع رمز الدولة.",
      "error"
    );
    return;
  }

  const payload = {
    whatsapp,
    tiktok: $("settingTikTok").value.trim(),
    snapchat: $("settingSnapchat").value.trim(),
    deliveryFee: fee,
    deliveryEnabled,
    pickupEnabled,
    paymentMethods: {
      cashOnDelivery,
      bankTransfer
    },
    bankDetails,
    updatedAt: serverTimestamp()
  };

  const button = event.submitter;

  if (button) {
    button.disabled = true;
    button.textContent = "جارٍ الحفظ...";
  }

  try {
    await setDoc(
      doc(db, "publicSettings", "store"),
      payload,
      { merge: true }
    );

    storeRecord = {
      ...storeRecord,
      ...payload
    };

    setCommerceMessage(
      "تم حفظ إعدادات الطلبات والتواصل.",
      "success"
    );

  } catch (error) {
    console.error("Commerce settings save error:", error);

    setCommerceMessage(
      "تعذر الحفظ. تحققي من قواعد Firestore.",
      "error"
    );

  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "حفظ إعدادات التواصل والدفع";
    }
  }
}

function buildOrdersView() {
  const section = $("view-orders");

  if (!section) return;

  section.innerHTML = `
    <div class="section-heading">
      <div>
        <h2>إدارة الطلبات</h2>
        <p>الطلبات التي أرسلها الزبائن من الموقع. راجعي المخزون والسعر قبل تأكيد كل طلب.</p>
      </div>
      <button class="outline-button" type="button" id="refreshOrdersButton">↻ تحديث الطلبات</button>
    </div>

    <div class="stats-grid orders-stats">
      <article class="stat-card">
        <div class="stat-top">
          <span>إجمالي الطلبات</span>
          <span class="stat-icon">▧</span>
        </div>
        <strong id="ordersTotalCount">0</strong>
      </article>

      <article class="stat-card">
        <div class="stat-top">
          <span>طلبات جديدة</span>
          <span class="stat-icon">!</span>
        </div>
        <strong id="ordersNewCount">0</strong>
      </article>

      <article class="stat-card">
        <div class="stat-top">
          <span>تم التسليم</span>
          <span class="stat-icon">✓</span>
        </div>
        <strong id="ordersDeliveredCount">0</strong>
      </article>
    </div>

    <div class="panel">
      <div class="orders-toolbar">
        <input
          id="ordersSearch"
          type="search"
          placeholder="ابحث بالاسم أو رقم الهاتف أو رقم الطلب..."
        >

        <select id="ordersStatusFilter">
          <option value="all">جميع الحالات</option>
          <option value="new">جديد</option>
          <option value="confirmed">تم التأكيد</option>
          <option value="preparing">قيد التجهيز</option>
          <option value="shipped">تم الشحن / خرج للتوصيل</option>
          <option value="delivered">تم التسليم</option>
          <option value="cancelled">ملغي</option>
        </select>
      </div>

      <div class="table-wrap">
        <table class="orders-table">
          <thead>
            <tr>
              <th>رقم الطلب</th>
              <th>الزبون</th>
              <th>التاريخ</th>
              <th>القطع</th>
              <th>الإجمالي</th>
              <th>الدفع</th>
              <th>الحالة</th>
              <th>التفاصيل</th>
            </tr>
          </thead>

          <tbody id="ordersTableBody">
            <tr>
              <td colspan="8" class="empty-state">جارٍ تحميل الطلبات...</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p id="ordersMessage" class="form-message" role="status"></p>
    </div>

    <dialog class="order-details-dialog" id="orderDetailsDialog">
      <div class="order-details-heading">
        <h3>تفاصيل الطلب</h3>
        <button type="button" id="closeOrderDetails">✕</button>
      </div>

      <div id="orderDetailsContent"></div>
    </dialog>
  `;

  $("refreshOrdersButton").addEventListener(
    "click",
    loadOrders
  );

  $("ordersSearch").addEventListener(
    "input",
    renderOrders
  );

  $("ordersStatusFilter").addEventListener(
    "change",
    renderOrders
  );

  $("closeOrderDetails").addEventListener(
    "click",
    () => $("orderDetailsDialog").close()
  );
}

function dateLabel(timestamp) {
  const date = timestamp?.toDate?.();

  if (!date) return "—";

  return new Intl.DateTimeFormat("ar-LY", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function orderMoney(value) {
  return `${Number(value || 0).toLocaleString("en-US", {
    maximumFractionDigits: 2
  })} د.ل`;
}

function renderOrders() {
  const body = $("ordersTableBody");

  if (!body) return;

  const search =
    ($("ordersSearch")?.value || "").trim().toLowerCase();

  const filter =
    $("ordersStatusFilter")?.value || "all";

  const newCount = orders.filter(
    (order) => (order.status || "new") === "new"
  ).length;

  const deliveredCount = orders.filter(
    (order) => order.status === "delivered"
  ).length;

  $("ordersTotalCount").textContent =
    String(orders.length);

  $("ordersNewCount").textContent =
    String(newCount);

  $("ordersDeliveredCount").textContent =
    String(deliveredCount);

  const filtered = orders.filter((order) => {
    const orderId = order.id.toLowerCase();

    const text =
      `${order.customerName || ""} ` +
      `${order.customerPhone || ""} ` +
      `${order.city || ""} ${orderId}`.toLowerCase();

    return (
      text.includes(search) &&
      (filter === "all" || (order.status || "new") === filter)
    );
  });

  body.innerHTML = "";

  if (!filtered.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.colSpan = 8;
    cell.className = "empty-state";
    cell.textContent = orders.length
      ? "لا توجد طلبات مطابقة للبحث."
      : "لا توجد طلبات حتى الآن.";

    row.append(cell);
    body.append(row);
    return;
  }

  filtered.forEach((order) => {
    const row = document.createElement("tr");

    const values = [
      order.id.slice(-8).toUpperCase(),
      `${order.customerName || "—"} · ${order.customerPhone || "—"}`,
      dateLabel(order.createdAt),
      Array.isArray(order.items)
        ? order.items.reduce(
            (sum, item) => sum + (Number(item.quantity) || 0),
            0
          )
        : 0,
      orderMoney(order.total),
      PAYMENT_LABELS[order.paymentMethod] || "—"
    ];

    values.forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = String(value);
      row.append(cell);
    });

    const statusCell = document.createElement("td");
    const statusSelect = document.createElement("select");

    statusSelect.className = "order-status-select";

    Object.entries(STATUS_LABELS).forEach(([value, label]) => {
      statusSelect.append(new Option(label, value));
    });

    statusSelect.value =
      STATUS_LABELS[order.status] ? order.status : "new";

    statusSelect.addEventListener("change", () => {
      updateOrderStatus(
        order.id,
        statusSelect.value,
        statusSelect
      );
    });

    statusCell.append(statusSelect);
    row.append(statusCell);

    const detailsCell = document.createElement("td");
    const detailsButton = document.createElement("button");

    detailsButton.type = "button";
    detailsButton.className = "order-details-button";
    detailsButton.textContent = "عرض";

    detailsButton.addEventListener("click", () => {
      showOrderDetails(order);
    });

    detailsCell.append(detailsButton);
    row.append(detailsCell);

    body.append(row);
  });
}

async function loadOrders() {
  const body = $("ordersTableBody");

  if (body) {
    body.innerHTML =
      '<tr><td colspan="8" class="empty-state">جارٍ تحميل الطلبات...</td></tr>';
  }

  try {
    const snapshot = await getDocs(
      collection(db, "orders")
    );

    orders = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data()
    }));

    orders.sort(
      (a, b) =>
        (b.createdAt?.toMillis?.() || 0) -
        (a.createdAt?.toMillis?.() || 0)
    );

    renderOrders();

  } catch (error) {
    console.error("Orders loading error:", error);

    if (body) {
      body.innerHTML =
        '<tr><td colspan="8" class="empty-state">تعذر تحميل الطلبات. تحققي من نشر قواعد Firestore.</td></tr>';
    }
  }
}

async function updateOrderStatus(orderId, status, select) {
  if (!Object.hasOwn(STATUS_LABELS, status)) return;

  if (select) select.disabled = true;

  try {
    await updateDoc(
      doc(db, "orders", orderId),
      {
        status,
        updatedAt: serverTimestamp()
      }
    );

    const order = orders.find(
      (item) => item.id === orderId
    );

    if (order) order.status = status;

    renderOrders();

  } catch (error) {
    console.error("Order update error:", error);

    const message = $("ordersMessage");

    if (message) {
      message.textContent = "تعذر تغيير حالة الطلب.";
      message.className = "form-message error";
    }

    if (select) select.disabled = false;
  }
}

function showOrderDetails(order) {
  const box = $("orderDetailsContent");
  box.innerHTML = "";

  const heading = document.createElement("p");
  heading.className = "order-detail-id";
  heading.textContent = `رقم الطلب: ${order.id}`;

  box.append(heading);

  const data = [
    ["اسم الزبون", order.customerName],
    ["رقم الهاتف", order.customerPhone],
    ["المدينة", order.city],
    ["العنوان", order.address],
    ["طريقة الاستلام", DELIVERY_LABELS[order.deliveryMethod] || "—"],
    ["طريقة الدفع", PAYMENT_LABELS[order.paymentMethod] || "—"],
    ["مرجع التحويل", order.bankReference || "—"],
    ["ملاحظات", order.notes || "—"],
    ["تاريخ الطلب", dateLabel(order.createdAt)]
  ];

  const details = document.createElement("div");
  details.className = "order-detail-grid";

  data.forEach(([label, value]) => {
    const item = document.createElement("div");

    const key = document.createElement("small");
    key.textContent = label;

    const val = document.createElement("strong");
    val.textContent = String(value || "—");

    item.append(key, val);
    details.append(item);
  });

  box.append(details);

  const itemHeading = document.createElement("h4");
  itemHeading.textContent = "المنتجات";

  box.append(itemHeading);

  const itemList = document.createElement("div");
  itemList.className = "order-detail-items";

  (Array.isArray(order.items) ? order.items : []).forEach((item) => {
    const line = document.createElement("p");

    const variations = [
      item.size ? `المقاس ${item.size}` : "",
      item.color ? `اللون ${item.color}` : ""
    ].filter(Boolean).join("، ");

    line.textContent =
      `${item.name || "منتج"}${variations ? ` (${variations})` : ""} × ${Number(item.quantity) || 0} — ${orderMoney(item.lineTotal)}`;

    itemList.append(line);
  });

  box.append(itemList);

  const totals = document.createElement("div");
  totals.className = "order-detail-totals";

  [
    ["قيمة المنتجات", order.subtotal],
    ["التوصيل", order.deliveryFee],
    ["الإجمالي", order.total]
  ].forEach(([label, amount]) => {
    const line = document.createElement("p");
    line.textContent = `${label}: ${orderMoney(amount)}`;
    totals.append(line);
  });

  box.append(totals);

  $("orderDetailsDialog").showModal();
}

async function initializeCommerceAdmin() {
  const user = await requireOwner();

  if (!user) return;

  buildCommerceSettingsPanel();
  buildOrdersView();

  await loadCommerceSettings();

  const ordersNav = document.querySelector(
    '[data-view="orders"]'
  );

  if (ordersNav) {
    ordersNav.addEventListener("click", () => {
      loadOrders();
    });
  }
}

initializeCommerceAdmin();