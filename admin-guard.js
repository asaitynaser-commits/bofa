import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

let authorizationPromise = null;
let currentUser = null;
let currentProfile = null;

function redirectToLogin() {
  window.location.replace("admin-login.html");
}

export function requireAdmin() {
  if (authorizationPromise) {
    return authorizationPromise;
  }

  authorizationPromise = new Promise((resolve) => {
    let firstCheck = true;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!firstCheck) return;

      firstCheck = false;
      unsubscribe();

      if (!user) {
        redirectToLogin();
        resolve(null);
        return;
      }

      try {
        const profileSnapshot = await getDoc(
          doc(db, "admins", user.uid)
        );

        if (!profileSnapshot.exists()) {
          await signOut(auth);
          redirectToLogin();
          resolve(null);
          return;
        }

        const profile = profileSnapshot.data();

        if (profile.active !== true) {
          await signOut(auth);
          redirectToLogin();
          resolve(null);
          return;
        }

        currentUser = user;
        currentProfile = {
          uid: user.uid,
          email: profile.email || user.email || "",
          displayName: profile.displayName || "موظف",
          role: profile.role || "sales",
          active: profile.active,
          permissions: profile.permissions || {}
        };

        document.body.style.visibility = "visible";

        resolve(user);

      } catch (error) {
        console.error("Authorization error:", error);

        try {
          await signOut(auth);
        } catch (signOutError) {
          console.error(signOutError);
        }

        redirectToLogin();
        resolve(null);
      }
    });
  });

  return authorizationPromise;
}

// توافق مع ملفات لوحة التحكم القديمة.
// أصبحت هذه الدالة تسمح بجميع الحسابات النشطة.
export function requireOwner() {
  return requireAdmin();
}

export function getAdminProfile() {
  return currentProfile;
}

export function getAdminUser() {
  return currentUser;
}

export function isOwner() {
  return currentProfile?.role === "owner";
}

export function hasPermission(permission) {
  if (!currentProfile) return false;

  if (isOwner()) return true;

  return currentProfile.permissions?.[permission] === true;
}