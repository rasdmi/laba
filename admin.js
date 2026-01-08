// admin.js
import { requireAuth } from "./auth.js";

function ensureAdmin(){
  let el = document.getElementById("adminPanel");
  if (el) return el;

  el = document.createElement("div");
  el.id = "adminPanel";
  el.style.cssText = `
    position:fixed; inset:64px 12px auto auto;
    z-index:70;
    padding:16px;
    width:360px;
    border-radius:26px;
    background:rgba(255,255,255,.8);
    border:1px solid rgba(23,23,23,.12);
    box-shadow:0 24px 80px rgba(0,0,0,.12);
    backdrop-filter: blur(10px);
    display:none;
  `;

  el.innerHTML = `
    <div style="font-family:'Vasek',ui-sans-serif; font-size:20px;">Админ</div>
    <div style="opacity:.6; font-size:12px; margin-top:6px;">
      вставь код персонажа uid:charId
    </div>

    <input id="adminCode" style="margin-top:10px; width:100%; padding:10px; border-radius:12px;" />

    <button id="adminOpen" style="margin-top:10px;">открыть персонажа</button>
  `;

  document.body.appendChild(el);

  el.querySelector("#adminOpen").onclick = ()=>{
    const raw = el.querySelector("#adminCode").value.trim();
    const [uid,charId] = raw.split(":");
    if (!uid || !charId){
      alert("Формат: uid:charId");
      return;
    }
    location.hash = `#/admin/character/${uid}/${charId}`;
  };

  return el;
}

function route(){
  const h = location.hash || "";
  const el = ensureAdmin();

  if (h === "#/admin"){
    if (!requireAuth()) return;
    if (!window.APP_IS_ADMIN){
      el.style.display="block";
      el.innerHTML = "Нет доступа";
      return;
    }
    el.style.display="block";
  } else {
    el.style.display="none";
  }
}

window.addEventListener("hashchange", route);
document.addEventListener("DOMContentLoaded", route);
