import { auth, db } from "./firebase.js";

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

const form = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const message = document.getElementById("loginMessage");
const button = document.getElementById("loginButton");

function showMessage(text, success = false) {
  message.textContent = text;
  message.style.color = success ? "#39775a" : "#a64f47";
}

async function checkOwner(user) {
  const snapshot = await getDoc(
    doc(db, "admins", user.uid)
  );

  if (!snapshot.exists()) return false;

  const data = snapshot.data();

  return data.active === true && data.role === "owner";
}

onAuthStateChanged(auth, async (user) => {
  if (!user) return;

  try {
    if (await checkOwner(user)) {
      window.location.replace("admin.html");
    }
  } catch (error) {
    console.error("Session check:", error);
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    showMessage("أدخل البريد الإلكتروني وكلمة المرور.");
    return;
  }

  button.disabled = true;
  button.textContent = "جارٍ التحقق...";
  showMessage("");

  try {
    const result = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    const allowed = await checkOwner(result.user);

    if (!allowed) {
      await signOut(auth);
      showMessage("هذا الحساب لا يملك صلاحية إدارة المتجر.");
      return;
    }

    showMessage("تم تسجيل الدخول بنجاح.", true);

    window.location.replace("admin.html");

  } catch (error) {
    console.error("Login:", error);

    const messages = {
      "auth/invalid-credential":
        "البريد الإلكتروني أو كلمة المرور غير صحيحة.",

      "auth/invalid-email":
        "صيغة البريد الإلكتروني غير صحيحة.",

      "auth/too-many-requests":
        "محاولات كثيرة. حاول لاحقاً.",

      "auth/network-request-failed":
        "تعذر الاتصال بالإنترنت."
    };

    showMessage(
      messages[error.code] ||
      "تعذر تسجيل الدخول. راجع إعدادات Firebase."
    );

  } finally {
    button.disabled = false;
    button.textContent = "تسجيل الدخول";
  }
});