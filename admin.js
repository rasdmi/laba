// admin.js
import { requireAuth } from "./auth.js";

function ensureAdmin() {
  let el = document.getElementById("adminPanel");
  if (el) return el;

  el = document.createElement("div");
  el.id = "adminPanel";
  el.style.cssText = `
    position:fixed; top:86px; right:14px;
    z-index:70;
    padding:16px;
    width:360px;
    border-radius:26px;
    background:rgba(255,255,255,.84);
    border:1px solid rgba(23,23,23,.12);
    box-shadow:0 24px 80px rgba(0,0,0,.12);
    backdrop-filter: blur(10px);
    display:none;
  `;

  el.innerHTML = `
    <div style="font-family:'Vasek',ui-sans-serif; font-size:20px;">Админ</div>
    <div style="opacity:.6; font-size:12px; margin-top:6px;">
      Вставь код персонажа <b>uid:charId</b>
    </div>

    <input id="adminCode" placeholder="uid:charId"
      style="margin-top:10px; width:100%; padding:10px 12px; border-radius:14px;
      border:1px solid rgba(23,23,23,.14); background:rgba(255,255,255,.9);" />

    <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:10px; flex-wrap:wrap;">
      <button class="btn ghost" id="adminClose">закрыть</button>
      <button class="btn" id="adminOpen">открыть</button>
    </div>

    <div style="opacity:.55; font-size:12px; margin-top:10px; line-height:1.35;">
      Подсказка: открой персонажа → нажми “код” → вставь сюда.
    </div>
  `;

  document.body.appendChild(el);

  el.querySelector("#adminClose").onclick = () => (location.hash = "#/notebook");

  el.querySelector("#adminOpen").onclick = () => {
    const raw = el.querySelector("#adminCode").value.trim();
    const [uid, charId] = raw.split(":");
    if (!uid || !charId) {
      alert("Формат: uid:charId");
      return;
    }
    location.hash = `#/admin/character/${uid}/${charId}`;
  };

  return el;
}

function route() {
  const h = location.hash || "";
  const el = ensureAdmin();

  if (h === "#/admin") {
    if (!requireAuth()) return;

    if (!window.APP_IS_ADMIN) {
      // не админ — просто уводим в тетрадку
      location.hash = "#/notebook";
      return;
    }

    el.style.display = "block";
  } else {
    el.style.display = "none";
  }
}

window.addEventListener("hashchange", route);
document.addEventListener("DOMContentLoaded", route);
