// NADO LIBYA - Firebase connection
import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";

import {
  getAuth
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";

import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

import {
  getStorage
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyBWMlmaQMHOIOT4IvNXihYmZ8F438ia_UQ",
  authDomain: "nado-libay.firebaseapp.com",
  projectId: "nado-libay",
  storageBucket: "nado-libay.firebasestorage.app",
  messagingSenderId: "1000684928185",
  appId: "1:1000684928185:web:deb170b48202e3556a6f68"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;
