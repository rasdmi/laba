// firebase-config.js
// 1) Firebase Console → Create project
// 2) Authentication → Sign-in method → включи Google
// 3) Firestore Database → Create
// 4) Storage → Get started
// 5) Project settings → General → Your apps → Web app → скопируй config и вставь ниже
//
// GitHub Pages: Authentication → Settings → Authorized domains
// добавь: YOURNAME.github.io (и кастомный домен если есть)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

/** TODO: вставь сюда свой config из Firebase Console */
export const firebaseConfig = {
  apiKey: "PASTE_ME",
  authDomain: "PASTE_ME.firebaseapp.com",
  projectId: "PASTE_ME",
  storageBucket: "PASTE_ME.appspot.com",
  messagingSenderId: "PASTE_ME",
  appId: "PASTE_ME",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
