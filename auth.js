// auth.js
import { auth, db } from "./firebase-config.js";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  doc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* ================= ADMIN ================= */

export const ADMIN_EMAILS = [
  "rastadmi@gmail.com", // ← замени на свой gmail
];

export function isAdminUser(user) {
  const email = (user?.email || "").toLowerCase();
  return ADMIN_EMAILS.map((e) => e.toLowerCase()).includes(email);
}

/* ================= UI styles ================= */

function injectStyles() {
  if (document.getElementById("authStyles")) return;
  const s = document.createElement("style");
  s.id = "authStyles";
  s.textContent = `
    .accChip{
      display:flex; align-items:center; gap:10px;
      padding:8px 10px;
      border-radius:999px;
      border:1px solid rgba(23,23,23,.18);
      background: rgba(255,255,255,.78);
      box-shadow: 0 8px 18px rgba(0,0,0,.06);
      font-family:"Vasek", ui-sans-serif;
      font-size:14px;
      cursor:pointer;
      user-select:none;
    }
    .accChip__ava{
      width:26px; height:26px; border-radius:999px;
      background: rgba(0,0,0,.08);
      overflow:hidden;
      display:grid; place-items:center;
    }
    .accChip__ava img{ width:100%; height:100%; object-fit:cover; }
    .accChip__name{
      max-width:160px;
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
      opacity:.9;
    }
    .accMenu{
      position:fixed;
      top:72px; right:14px;
      width:300px;
      padding:10px;
      border-radius:18px;
      background: rgba(255,255,255,.92);
      border:1px solid rgba(23,23,23,.16);
      box-shadow:0 18px 50px rgba(0,0,0,.12);
      backdrop-filter: blur(10px);
      display:none;
      z-index:60;
    }
    .accMenu.is-open{ display:block; }
    .accMenu__row{
      display:flex; justify-content:space-between; align-items:center;
      padding:10px;
      border-radius:14px;
      cursor:pointer;
    }
    .accMenu__row:hover{ background: rgba(23,23,23,.05); }
    .accMenu__title{ font-family:"Vasek", ui-sans-serif; font-size:16px; }
    .accMenu__muted{ font-size:12px; opacity:.6; }
    .accMenu__btn{
      width:100%;
      margin-top:8px;
      padding:10px 12px;
      border-radius:14px;
      border:1px solid rgba(23,23,23,.18);
      background: rgba(255,255,255,.85);
      font-family:"Vasek", ui-sans-serif;
      cursor:pointer;
    }
  `;
  document.head.appendChild(s);
}

/* ================= UI helpers ================= */

let btnAccount = null;
let chip = null;

function ensureLoginButton() {
  btnAccount = document.getElementById("btnAccount");
  if (!btnAccount) {
    const right = document.querySelector(".topbar__right");
    btnAccount = document.createElement("button");
    btnAccount.className = "btn";
    btnAccount.id = "btnAccount";
    btnAccount.textContent = "войти";
    right?.prepend(btnAccount);
  }
}

function createChip() {
  const el = document.createElement("div");
  el.className = "accChip";
  el.innerHTML = `
    <div class="accChip__ava" id="accAva"></div>
    <div class="accChip__name" id="accName"></div>
  `;
  return el;
}

function ensureMenu() {
  let menu = document.getElementById("accMenu");
  if (menu) return menu;

  menu = document.createElement("div");
  menu.id = "accMenu";
  menu.className = "accMenu";
  menu.innerHTML = `
    <div class="accMenu__row" id="goNotebook">
      <div>
        <div class="accMenu__title">моя тетрадка</div>
        <div class="accMenu__muted">персонажи и страницы</div>
      </div>
      <div>→</div>
    </div>
    <div class="accMenu__row" id="goAdmin" style="display:none;">
      <div>
        <div class="accMenu__title">админ</div>
        <div class="accMenu__muted">открыть по коду</div>
      </div>
      <div>→</div>
    </div>
    <button class="accMenu__btn" id="logoutBtn">выйти</button>
  `;
  document.body.appendChild(menu);

  return menu;
}

/* ================= Auth logic ================= */

async function loginPopup() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return signInWithPopup(auth, provider);
}

// fallback если popup режется браузером
async function loginRedirect() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return signInWithRedirect(auth, provider);
}

async function logout() {
  await signOut(auth);
  location.hash = "#/";
}

async function upsertUser(user) {
  const ref = doc(db, "users", user.uid);
  await setDoc(
    ref,
    {
      uid: user.uid,
      email: user.email || null,
      displayName: user.displayName || "Без имени",
      photoURL: user.photoURL || null,
      lastLoginAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/* ================= State rendering ================= */

function setLoggedOut() {
  btnAccount.style.display = "";
  chip?.remove();
  chip = null;

  window.APP_USER = null;
  window.APP_IS_ADMIN = false;
}

function setLoggedIn(user) {
  btnAccount.style.display = "none";

  if (!chip) {
    chip = createChip();
    document.querySelector(".topbar__right")?.prepend(chip);
    chip.addEventListener("click", () =>
      ensureMenu().classList.toggle("is-open")
    );
  }

  chip.querySelector("#accName").textContent = user.displayName || "аккаунт";
  chip.querySelector("#accAva").innerHTML = user.photoURL
    ? `<img src="${user.photoURL}">`
    : "🙂";

  const menu = ensureMenu();
  menu.querySelector("#goNotebook").onclick = () => {
    menu.classList.remove("is-open");
    location.hash = "#/notebook";
  };

  const isAdmin = isAdminUser(user);
  const goAdmin = menu.querySelector("#goAdmin");
  goAdmin.style.display = isAdmin ? "" : "none";
  goAdmin.onclick = () => {
    menu.classList.remove("is-open");
    location.hash = "#/admin";
  };

  menu.querySelector("#logoutBtn").onclick = logout;

  window.APP_USER = user;
  window.APP_IS_ADMIN = isAdmin;
}

/* ================= Login overlay ================= */

function mountLoginOverlay() {
  function render() {
    const hash = location.hash || "#/";
    let overlay = document.getElementById("loginOverlay");

    if (hash === "#/login") {
      if (overlay) return;

      overlay = document.createElement("div");
      overlay.id = "loginOverlay";
      overlay.style.cssText = `
        position:fixed; inset:0;
        background: rgba(0,0,0,.22);
        display:flex; align-items:center; justify-content:center;
        z-index:80;
      `;

      overlay.innerHTML = `
        <div style="
          width:min(540px, calc(100vw - 28px));
          padding:16px;
          border-radius:26px;
          background: rgba(255,255,255,.92);
          border:1px solid rgba(23,23,23,.18);
          box-shadow:0 18px 50px rgba(0,0,0,.14);
          font-family:'Vasek', ui-sans-serif;
        ">
          <div style="font-size:20px;">Войти</div>
          <div style="opacity:.65; font-size:13px; margin-top:6px;">
            Нужен аккаунт, чтобы сохранять тетрадки и персонажей
          </div>
          <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:14px; flex-wrap:wrap;">
            <button class="btn ghost" id="loginCancel">пока нет</button>
            <button class="btn ghost" id="loginGooglePopup">через popup</button>
            <button class="btn" id="loginGoogle">войти через Google</button>
          </div>
          <div style="opacity:.55; font-size:12px; margin-top:10px; line-height:1.35;">
            Если после выбора аккаунта “ничего не происходит” — нажми “через popup” или перезагрузи страницу.
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) location.hash = "#/";
      });

      overlay.querySelector("#loginCancel").onclick = () => (location.hash = "#/");

      overlay.querySelector("#loginGoogle").onclick = async () => {
        try {
          // redirect наиболее стабильный
          await loginRedirect();
        } catch (e) {
          console.error("AUTH ERROR (redirect):", e);
          alert(`${e?.code || ""}\n${e?.message || e}`);
        }
      };

      overlay.querySelector("#loginGooglePopup").onclick = async () => {
        try {
          await loginPopup();
          // важно: даже если дальше роутер не успеет — onAuthStateChanged дожмёт
          location.hash = "#/notebook";
        } catch (e) {
          console.error("AUTH ERROR (popup):", e);
          alert(`${e?.code || ""}\n${e?.message || e}`);
        }
      };
    } else {
      overlay?.remove();
    }
  }

  window.addEventListener("hashchange", render);
  render();
}

/* ================= Init ================= */

injectStyles();
ensureLoginButton();

btnAccount.onclick = () => (location.hash = "#/login");

// важно: обработать redirect возврат (иначе “успешно вошёл, но не видно”)
getRedirectResult(auth).catch((e) => {
  // не показываем alert, просто логируем — чтобы не бесить
  console.warn("getRedirectResult:", e?.code, e?.message);
});

onAuthStateChanged(auth, async (user) => {
  if (user) {
    try { await upsertUser(user); } catch (e) { console.warn(e); }
    setLoggedIn(user);

    // ✅ КЛЮЧЕВОЕ: если мы на экране логина — переводим в кабинет
    const h = location.hash || "#/";
    if (h === "#/login" || h === "#/") {
      location.hash = "#/notebook";
    }
  } else {
    setLoggedOut();
  }
});

mountLoginOverlay();

/* ================= Guard helper ================= */
export function requireAuth() {
  if (auth.currentUser) return true;
  location.hash = "#/login";
  return false;
}
