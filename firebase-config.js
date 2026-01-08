// firebase-config.js
// ВАЖНО: в index.html не должно быть второго Firebase <script> из туториала.
// Используется только этот модульный файл.
//
// Firebase Console:
// 1) Authentication → Sign-in method → Google → Enable
// 2) Authentication → Settings → Authorized domains → добавь rasdmi.github.io

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

export const firebaseConfig = {
  apiKey: "AIzaSyDgLHvkVN4UgkC847TZnC8DMibMbrngJls",
  authDomain: "laba-bfbdd.firebaseapp.com",
  projectId: "laba-bfbdd",
  storageBucket: "laba-bfbdd.appspot.com",
  messagingSenderId: "419950691766",
  appId: "1:419950691766:web:9716214d635a3f8316ad17"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

console.log("[firebase] host=", location.host);
console.log("[firebase] projectId=", firebaseConfig.projectId, "authDomain=", firebaseConfig.authDomain);
