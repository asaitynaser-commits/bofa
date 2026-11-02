import { auth, db } from "./firebase.js";

import {
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";

import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

import {
  requireAdmin,
  getAdminProfile,
  hasPermission,
  isOwner
} from "./admin-guard.js";

const $ = (id) => document.getElementById(id);
function notify(message) {
  const toast = $("toast");

  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(notify.timer);

  notify.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}
let employees = [];
let editingUid = null;

const PERMISSIONS = {
  dashboardView: "عرض الرئيسية",
  productsView: "عرض المنتجات",
  productsCreate: "إضافة المنتجات",
  productsEdit: "تعديل المنتجات ونشرها",
  productsDelete: "حذف المنتجات",
  categoriesManage: "إدارة التصنيفات",
  inventoryView: "عرض المخزون",
  inventoryEdit: "تعديل الكميات",
  ordersView: "عرض الطلبات",
  ordersUpdate: "تحديث حالة الطلبات",
  customersView: "عرض العملاء",
  discountsManage: "إدارة العروض والخصومات",
  reportsView: "عرض التقارير",
  settingsManage: "تعديل إعدادات المتجر",
  commerceSettingsManage: "تعديل إعدادات الدفع والتوصيل"
};

const ROLE_LABELS = {
  owner: "المالك",
  manager: "مدير",
  sales: "موظف مبيعات",
  inventory: "موظف مخزون",
  orders: "موظف طلبات",
  custom: "صلاحيات مخصصة"
};

const ROLE_PRESETS = {
  manager: {
    dashboardView: true,
    productsView: true,
    productsCreate: true,
    productsEdit: true,
    productsDelete: false,
    categoriesManage: true,
    inventoryView: true,
    inventoryEdit: true,
    ordersView: true,
    ordersUpdate: true,
    customersView: true,
    discountsManage: false,
    reportsView: true,
    settingsManage: false,
    commerceSettingsManage: true
  },

  sales: {
    dashboardView: true,
    productsView: true,
    productsCreate: false,
    productsEdit: false,
    productsDelete: false,
    categoriesManage: false,
    inventoryView: false,
    inventoryEdit: false,
    ordersView: true,
    ordersUpdate: true,
    customersView: true,
    discountsManage: false,
    reportsView: false,
    settingsManage: false,
    commerceSettingsManage: false
  },

  inventory: {
    dashboardView: true,
    productsView: true,
    productsCreate: false,
    productsEdit: false,
    productsDelete: false,
    categoriesManage: false,
    inventoryView: true,
    inventoryEdit: true,
    ordersView: false,
    ordersUpdate: false,
    customersView: false,
    discountsManage: false,
    reportsView: false,
    settingsManage: false,
    commerceSettingsManage: false
  },

  orders: {
    dashboardView: true,
    productsView: true,
    productsCreate: false,
    productsEdit: false,
    productsDelete: false,
    categoriesManage: false,
    inventoryView: false,
    inventoryEdit: false,
    ordersView: true,
    ordersUpdate: true,
    customersView: true,
    discountsManage: false,
    reportsView: false,
    settingsManage: false,
    commerceSettingsManage: false
  },

  custom: {}
};

/* =========================================
   STAFF INTERFACE
========================================= */

function buildStaffView() {
  const section = $("view-staff");

  if (!section) return;

  section.innerHTML = `
    <div class="section-heading">
      <div>
        <h2>الموظفون والصلاحيات</h2>
        <p>إدارة حسابات فريق NADO LIBYA وتحديد صلاحيات كل موظف.</p>
      </div>

      <button class="outline-button" id="refreshStaff">
        ↻ تحديث القائمة
      </button>
    </div>

    <div class="panel staff-info-panel">
      <strong>طريقة إضافة موظف</strong>
      <p>
        أنشئ حساب الموظف أولاً من Firebase Authentication،
        ثم أدخل UID والبريد الإلكتروني هنا.
        لا تدخل كلمة المرور ولا تحفظها في قاعدة البيانات.
      </p>
    </div>

    <div class="panel">
      <div class="panel-heading">
        <div>
          <h3 id="staffFormTitle">إضافة موظف</h3>
          <p>حدد معلومات الموظف والدور والصلاحيات.</p>
        </div>
      </div>

      <form id="staffForm">

        <div class="form-grid">

          <label class="field">
            UID الخاص بالموظف *
            <input
              id="staffUid"
              type="text"
              required
              maxlength="128"
              autocomplete="off"
              placeholder="Firebase Authentication UID"
            >
          </label>

          <label class="field">
            البريد الإلكتروني *
            <input
              id="staffEmail"
              type="email"
              required
              maxlength="160"
              placeholder="employee@example.com"
            >
          </label>

          <label class="field">
            اسم الموظف *
            <input
              id="staffName"
              type="text"
              required
              maxlength="80"
              placeholder="اسم الموظف"
            >
          </label>

          <label class="field">
            الدور الوظيفي
            <select id="staffRole">
              <option value="manager">مدير</option>
              <option value="sales">موظف مبيعات</option>
              <option value="inventory">موظف مخزون</option>
              <option value="orders">موظف طلبات</option>
              <option value="custom">صلاحيات مخصصة</option>
            </select>
          </label>

          <label class="check-field field-full">
            <input type="checkbox" id="staffActive" checked>
            تفعيل حساب الموظف
          </label>

        </div>

        <div class="staff-permissions-heading">
          <h3>الصلاحيات</h3>
          <p>يمكنك تعديل صلاحيات الدور المحدد بشكل مستقل.</p>
        </div>

        <div class="staff-permissions-grid" id="staffPermissions">
        </div>

        <div class="form-actions">
          <button
            class="primary-button"
            id="saveStaffButton"
            type="submit"
          >
            حفظ الموظف
          </button>

          <button
            class="outline-button"
            id="cancelStaffEdit"
            type="button"
          >
            إلغاء
          </button>

          <span
            id="staffMessage"
            class="form-message"
            role="status"
          ></span>
        </div>

      </form>
    </div>

    <div class="panel">
      <div class="table-heading">
        <div>
          <h3>قائمة الموظفين</h3>
          <p id="staffCount">0 موظف</p>
        </div>
      </div>

      <div class="table-wrap">
        <table class="staff-table">
          <thead>
            <tr>
              <th>الموظف</th>
              <th>الدور</th>
              <th>الحالة</th>
              <th>الصلاحيات</th>
              <th>الإجراءات</th>
            </tr>
          </thead>

          <tbody id="staffTableBody">
            <tr>
              <td colspan="5" class="empty-state">
                جارٍ تحميل الموظفين...
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  buildPermissionCheckboxes();
  setupStaffEvents();
}

function buildPermissionCheckboxes() {
  const container = $("staffPermissions");

  container.innerHTML = "";

  Object.entries(PERMISSIONS).forEach(([key, label]) => {
    const item = document.createElement("label");
    item.className = "staff-permission-item";

    const checkbox = document.createElement("input");

    checkbox.type = "checkbox";
    checkbox.dataset.permission = key;

    const text = document.createElement("span");
    text.textContent = label;

    item.append(checkbox, text);
    container.append(item);
  });
}

function setPermissions(values = {}) {
  document
    .querySelectorAll("[data-permission]")
    .forEach((checkbox) => {
      const key = checkbox.dataset.permission;

      checkbox.checked = values[key] === true;
    });
}

function readPermissions() {
  const result = {};

  Object.keys(PERMISSIONS).forEach((key) => {
    const checkbox = document.querySelector(
      `[data-permission="${key}"]`
    );

    result[key] = checkbox?.checked === true;
  });

  return result;
}

function applyRolePreset(role) {
  setPermissions(ROLE_PRESETS[role] || {});
}

function setStaffMessage(message, type = "") {
  const element = $("staffMessage");

  if (!element) return;

  element.textContent = message;
  element.className = `form-message ${type}`.trim();
}

/* =========================================
   FORM EVENTS
========================================= */

function setupStaffEvents() {
  $("staffRole").addEventListener("change", () => {
    applyRolePreset($("staffRole").value);
  });

  $("staffForm").addEventListener("submit", saveStaff);

  $("cancelStaffEdit").addEventListener(
    "click",
    resetStaffForm
  );

  $("refreshStaff").addEventListener(
    "click",
    loadEmployees
  );

  $("staffUid").addEventListener("input", () => {
    $("staffUid").readOnly = false;
  });

  applyRolePreset("manager");
}

function resetStaffForm() {
  editingUid = null;

  $("staffForm").reset();

  $("staffUid").readOnly = false;
  $("staffActive").checked = true;
  $("staffRole").value = "manager";

  applyRolePreset("manager");

  $("staffFormTitle").textContent = "إضافة موظف";
  $("saveStaffButton").textContent = "حفظ الموظف";

  setStaffMessage("");
}

/* =========================================
   LOAD EMPLOYEES
========================================= */

async function loadEmployees() {
  const body = $("staffTableBody");

  body.innerHTML = `
    <tr>
      <td colspan="5" class="empty-state">
        جارٍ تحميل الموظفين...
      </td>
    </tr>
  `;

  try {
    const snapshot = await getDocs(
      collection(db, "admins")
    );

    employees = snapshot.docs.map((item) => ({
      uid: item.id,
      ...item.data()
    }));

    renderEmployees();

  } catch (error) {
    console.error("Employees loading error:", error);

    body.innerHTML = `
      <tr>
        <td colspan="5" class="empty-state">
          تعذر تحميل الموظفين.
          تحقق من قواعد Firestore.
        </td>
      </tr>
    `;
  }
}

/* =========================================
   RENDER EMPLOYEES
========================================= */

function renderEmployees() {
  const body = $("staffTableBody");

  body.innerHTML = "";

  const currentUid = getAdminProfile()?.uid;

  const list = employees.filter(
    (employee) => employee.uid !== currentUid
  );

  $("staffCount").textContent = `${list.length} موظف`;

  if (!list.length) {
    body.innerHTML = `
      <tr>
        <td colspan="5" class="empty-state">
          لا يوجد موظفون مسجلون حتى الآن.
        </td>
      </tr>
    `;

    return;
  }

  list.forEach((employee) => {
    const row = document.createElement("tr");

    const infoCell = document.createElement("td");

    const name = document.createElement("strong");
    name.textContent = employee.displayName || "بدون اسم";

    const email = document.createElement("small");
    email.textContent = employee.email || "";

    email.style.display = "block";
    email.style.color = "#898477";

    infoCell.append(name, email);

    const roleCell = document.createElement("td");
    roleCell.textContent =
      ROLE_LABELS[employee.role] || employee.role || "—";

    const stateCell = document.createElement("td");

    const state = document.createElement("span");

    state.className = employee.active
      ? "staff-status active"
      : "staff-status disabled";

    state.textContent = employee.active
      ? "نشط"
      : "معطل";

    stateCell.append(state);

    const permissionCell = document.createElement("td");

    const count = Object.values(
      employee.permissions || {}
    ).filter(Boolean).length;

    permissionCell.textContent = `${count} صلاحية`;

    const actionsCell = document.createElement("td");
    const actions = document.createElement("div");

    actions.className = "table-actions";

    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "تعديل";

    edit.addEventListener("click", () => {
      editEmployee(employee);
    });

    const toggle = document.createElement("button");
    toggle.type = "button";

    toggle.textContent = employee.active
      ? "تعطيل"
      : "تفعيل";

    toggle.addEventListener("click", () => {
      toggleEmployee(employee);
    });

    const reset = document.createElement("button");
    reset.type = "button";
    reset.textContent = "إرسال رابط كلمة المرور";

    reset.addEventListener("click", () => {
      sendResetEmail(employee.email);
    });

    actions.append(edit, toggle, reset);
    actionsCell.append(actions);

    row.append(
      infoCell,
      roleCell,
      stateCell,
      permissionCell,
      actionsCell
    );

    body.append(row);
  });
}

/* =========================================
   SAVE EMPLOYEE PROFILE
========================================= */

async function saveStaff(event) {
  event.preventDefault();

  const button = $("saveStaffButton");

  const uid = $("staffUid").value.trim();
  const email = $("staffEmail").value.trim().toLowerCase();
  const displayName = $("staffName").value.trim();
  const role = $("staffRole").value;
  const active = $("staffActive").checked;

  if (!/^[A-Za-z0-9_-]{20,128}$/.test(uid)) {
    setStaffMessage(
      "UID غير صحيح. انسخه من Firebase Authentication.",
      "error"
    );

    return;
  }

  if (uid === getAdminProfile()?.uid) {
    setStaffMessage(
      "لا يمكنك تعديل حساب المالك من هنا.",
      "error"
    );

    return;
  }

  if (!email || !displayName) {
    setStaffMessage(
      "أكمل البريد الإلكتروني واسم الموظف.",
      "error"
    );

    return;
  }

  if (!["manager", "sales", "inventory", "orders", "custom"].includes(role)) {
    setStaffMessage("الدور المحدد غير صحيح.", "error");
    return;
  }

  const permissions = readPermissions();

  button.disabled = true;
  button.textContent = "جارٍ الحفظ...";

  try {
    const profileRef = doc(db, "admins", uid);

    const profile = {
      email,
      displayName,
      role,
      active,
      permissions,
      updatedAt: serverTimestamp()
    };

    if (!editingUid) {
      profile.createdAt = serverTimestamp();
    }

    await setDoc(profileRef, profile, { merge: true });

    setStaffMessage(
      editingUid
        ? "تم تحديث بيانات الموظف."
        : "تم تسجيل الموظف بنجاح.",
      "success"
    );

    resetStaffForm();

    await loadEmployees();

  } catch (error) {
    console.error("Employee save error:", error);

    setStaffMessage(
      "تعذر الحفظ. تحقق من قواعد Firestore وأنك مسجل بحساب المالك.",
      "error"
    );

  } finally {
    button.disabled = false;
    button.textContent = editingUid
      ? "حفظ التعديلات"
      : "حفظ الموظف";
  }
}

/* =========================================
   EDIT EMPLOYEE
========================================= */

function editEmployee(employee) {
  if (employee.role === "owner") {
    notify("حساب المالك محمي من التعديل.");
    return;
  }

  editingUid = employee.uid;

  $("staffUid").value = employee.uid;
  $("staffUid").readOnly = true;

  $("staffEmail").value = employee.email || "";
  $("staffName").value = employee.displayName || "";

  $("staffRole").value =
    ROLE_PRESETS[employee.role]
      ? employee.role
      : "custom";

  $("staffActive").checked = employee.active === true;

  setPermissions(employee.permissions || {});

  $("staffFormTitle").textContent = "تعديل الموظف";
  $("saveStaffButton").textContent = "حفظ التعديلات";

  setStaffMessage("");

  $("staffForm").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

/* =========================================
   ACTIVATE / DEACTIVATE
========================================= */

async function toggleEmployee(employee) {
  if (employee.role === "owner") {
    notify("لا يمكن تعطيل حساب المالك.");
    return;
  }

  const nextState = employee.active !== true;

  const confirmed = window.confirm(
    nextState
      ? `هل تريد تفعيل حساب ${employee.displayName}؟`
      : `هل تريد تعطيل حساب ${employee.displayName}؟`
  );

  if (!confirmed) return;

  try {
    await updateDoc(
      doc(db, "admins", employee.uid),
      {
        active: nextState,
        updatedAt: serverTimestamp()
      }
    );

    await loadEmployees();

    notify(
      nextState
        ? "تم تفعيل حساب الموظف."
        : "تم تعطيل حساب الموظف."
    );

  } catch (error) {
    console.error(error);
    notify("تعذر تغيير حالة الموظف.");
  }
}

/* =========================================
   PASSWORD RESET
========================================= */

async function sendResetEmail(email) {
  if (!email) {
    notify("لا يوجد بريد إلكتروني لهذا الموظف.");
    return;
  }

  const confirmed = window.confirm(
    `إرسال رابط إعادة تعيين كلمة المرور إلى ${email}؟`
  );

  if (!confirmed) return;

  try {
    await sendPasswordResetEmail(auth, email);

    notify(
      "تم طلب إرسال رابط إعادة تعيين كلمة المرور."
    );

  } catch (error) {
    console.error("Password reset error:", error);

    notify(
      "تعذر إرسال الرابط. تحقق من إعدادات Firebase Authentication."
    );
  }
}

/* =========================================
   ACCESS CONTROL FOR DASHBOARD UI
========================================= */

function canOpenView(view) {
  const viewPermissions = {
    dashboard: "dashboardView",
    products: "productsView",
    categories: "categoriesManage",
    inventory: "inventoryView",
    orders: "ordersView",
    customers: "customersView",
    discounts: "discountsManage",
    reports: "reportsView"
  };

  if (view === "settings") {
    return (
      hasPermission("settingsManage") ||
      hasPermission("commerceSettingsManage")
    );
  }

  if (view === "staff") {
    return isOwner();
  }

  const permission = viewPermissions[view];

  return permission ? hasPermission(permission) : false;
}

function applyDashboardAccess() {
  document.querySelectorAll(".nav-item[data-view]").forEach((button) => {
    const view = button.dataset.view;
    button.hidden = !canOpenView(view);
  });

  document.querySelectorAll("[data-goto]").forEach((button) => {
    button.hidden = !canOpenView(button.dataset.goto);
  });

  if (!hasPermission("productsCreate")) {
    $("showProductForm")?.setAttribute("hidden", "");
    $("productEditor")?.setAttribute("hidden", "");
  }

  if (!hasPermission("categoriesManage")) {
    $("categoryForm")?.closest(".panel")?.setAttribute("hidden", "");
  }

  if (!hasPermission("settingsManage")) {
    $("settingsForm")?.closest(".panel")?.setAttribute("hidden", "");
    $("inventorySettingsForm")?.closest(".panel")?.setAttribute("hidden", "");
  }

  if (!hasPermission("commerceSettingsManage")) {
    $("commerceSettingsForm")?.closest(".panel")?.setAttribute("hidden", "");
  }

  if (!hasPermission("ordersUpdate")) {
    document.querySelectorAll(".order-status-select").forEach((select) => {
      select.disabled = true;
    });
  }

  if (!hasPermission("productsEdit")) {
    document.querySelectorAll("#productsTableBody .table-actions button").forEach((button) => {
      if (["تعديل", "نشر", "إخفاء"].includes(button.textContent.trim())) {
        button.hidden = true;
      }
    });
  }

  if (!hasPermission("productsDelete")) {
    document.querySelectorAll("#productsTableBody .table-actions button").forEach((button) => {
      if (button.textContent.trim() === "حذف") {
        button.hidden = true;
      }
    });
  }

  if (!hasPermission("inventoryEdit")) {
    document.querySelectorAll("#inventoryTableBody .stock-edit button").forEach((button) => {
      button.hidden = true;
    });
    document.querySelectorAll("#inventoryTableBody .stock-edit input").forEach((input) => {
      input.disabled = true;
    });
  }
}

async function initializeStaff() {
  const user = await requireAdmin();

  if (!user) return;

  if (!isOwner()) {
    $("view-staff")?.setAttribute("hidden", "");
  } else {
    buildStaffView();
    await loadEmployees();
  }

  applyDashboardAccess();

  const observer = new MutationObserver(() => {
    applyDashboardAccess();
  });

  [
    $("productsTableBody"),
    $("inventoryTableBody"),
    $("view-settings"),
    $("view-orders")
  ].filter(Boolean).forEach((element) => {
    observer.observe(element, {
      childList: true,
      subtree: true
    });
  });
}

initializeStaff();