// character.js
import { auth, db } from "./firebase-config.js";
import { requireAuth } from "./auth.js";
import {
  doc,
  getDoc,
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

function escapeHtml(s){
  return (s||"").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
}

/* ================= ROUTE ================= */

function parseRoute(){
  const h = location.hash || "";
  if (h.startsWith("#/character/")){
    return {
      mode: "user",
      uid: auth.currentUser?.uid,
      charId: h.split("/")[2]
    };
  }
  if (h.startsWith("#/admin/character/")){
    const p = h.split("/");
    return {
      mode: "admin",
      uid: p[3],
      charId: p[4]
    };
  }
  return null;
}

/* ================= UI ================= */

function ensureUI(){
  let el = document.getElementById("charOverlay");
  if (el) return el;

  el = document.createElement("div");
  el.id = "charOverlay";
  el.style.cssText = `
    position:fixed; inset:64px 12px 12px 12px;
    z-index:60;
    border-radius:26px;
    background:rgba(255,255,255,.8);
    border:1px solid rgba(23,23,23,.12);
    box-shadow:0 24px 80px rgba(0,0,0,.12);
    backdrop-filter: blur(10px);
    display:none;
    overflow:hidden;
  `;

  el.innerHTML = `
    <div style="display:flex; align-items:center; gap:12px; padding:14px 16px; border-bottom:1px solid rgba(23,23,23,.08);">
      <div>
        <div id="charTitle" style="font-family:'Vasek',ui-sans-serif; font-size:20px;">Персонаж</div>
        <div id="charSubtitle" style="opacity:.6; font-size:12px;"></div>
      </div>

      <button id="charCopyCode" style="margin-left:auto;">код</button>
      <button id="charClose">✕</button>
    </div>

    <div style="display:grid; grid-template-columns:260px 1fr; height:100%;">
      <aside id="pageList" style="border-right:1px solid rgba(23,23,23,.08); padding:12px; overflow:auto;"></aside>
      <main id="pageBody" style="padding:16px; overflow:auto;">
        <div style="opacity:.6;">Выберите страницу</div>
      </main>
    </div>
  `;

  document.body.appendChild(el);

  el.querySelector("#charClose").onclick = () => location.hash = "#/notebook";

  return el;
}

/* ================= LOGIC ================= */

let unsubPages = null;

function openCharacter(){
  if (!requireAuth()) return;

  const route = parseRoute();
  if (!route || !route.uid || !route.charId) return;

  const { uid, charId, mode } = route;
  const wrap = ensureUI();
  wrap.style.display = "block";

  // загружаем персонажа
  getDoc(doc(db, "users", uid, "characters", charId)).then(snap=>{
    if (!snap.exists()) return;
    const c = snap.data();
    wrap.querySelector("#charTitle").textContent = c.name || "Персонаж";
    wrap.querySelector("#charSubtitle").textContent =
      mode === "admin" ? "режим мастера" : "моя тетрадка";
  });

  // код персонажа
  wrap.querySelector("#charCopyCode").onclick = () => {
    const code = `${uid}:${charId}`;
    navigator.clipboard.writeText(code);
    alert("Код персонажа скопирован:\n" + code);
  };

  // страницы
  const list = wrap.querySelector("#pageList");
  const body = wrap.querySelector("#pageBody");

  if (unsubPages) unsubPages();
  unsubPages = onSnapshot(
    query(
      collection(db, "users", uid, "characters", charId, "pages"),
      orderBy("createdAt","asc")
    ),
    snap=>{
      list.innerHTML = "";

      // кнопка добавления
      const addBtn = document.createElement("button");
      addBtn.textContent = mode === "admin" ? "+ страница от мастера" : "+ моя страница";
      addBtn.onclick = async () => {
        const title = prompt("Название страницы");
        if (!title) return;
        await addDoc(
          collection(db,"users",uid,"characters",charId,"pages"),
          {
            title,
            body:"",
            origin: mode === "admin" ? "admin" : "user",
            createdAt: serverTimestamp()
          }
        );
      };
      list.appendChild(addBtn);

      snap.forEach(d=>{
        const p = d.data();
        const item = document.createElement("div");
        item.style.cssText = "margin-top:8px; padding:8px; cursor:pointer; border-radius:10px;";
        item.innerHTML = `
          <div>${escapeHtml(p.title||"")}</div>
          <div style="opacity:.5; font-size:11px;">${p.origin}</div>
        `;
        item.onclick = ()=>{
          body.innerHTML = `
            <h3>${escapeHtml(p.title)}</h3>
            <textarea id="pageEdit" style="width:100%; min-height:240px;">${escapeHtml(p.body||"")}</textarea>
            <button id="pageSave">сохранить</button>
          `;
          body.querySelector("#pageSave").onclick = async ()=>{
            await addDoc; // placeholder, MVP
            await doc(db,"users",uid,"characters",charId,"pages",d.id)
            await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js")
              .then(({updateDoc})=>updateDoc(
                doc(db,"users",uid,"characters",charId,"pages",d.id),
                { body: body.querySelector("#pageEdit").value }
              ));
          };
        };
        list.appendChild(item);
      });
    }
  );
}

function closeCharacter(){
  document.getElementById("charOverlay")?.style.display="none";
}

function route(){
  const h = location.hash || "";
  if (h.startsWith("#/character/") || h.startsWith("#/admin/character/")){
    openCharacter();
  } else {
    closeCharacter();
  }
}

window.addEventListener("hashchange", route);
document.addEventListener("DOMContentLoaded", route);
