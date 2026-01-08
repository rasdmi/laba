// character.js
import { auth, db } from "./firebase-config.js";
import { requireAuth } from "./auth.js";
import { pickRandomLocationId } from "./locations.js";

import {
  doc,
  getDoc,
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  deleteDoc
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
    return { mode:"user", uid: auth.currentUser?.uid, charId: h.split("/")[2] };
  }
  if (h.startsWith("#/admin/character/")){
    const p = h.split("/");
    return { mode:"admin", uid: p[3], charId: p[4] };
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
    background:rgba(255,255,255,.84);
    border:1px solid rgba(23,23,23,.12);
    box-shadow:0 24px 80px rgba(0,0,0,.12);
    backdrop-filter: blur(10px);
    display:none;
    overflow:hidden;
  `;

  el.innerHTML = `
    <div class="chTop">
      <div style="min-width:0;">
        <div id="charTitle" class="chTitle">Персонаж</div>
        <div id="charSubtitle" class="chSub"></div>
      </div>

      <button id="charCopyCode" class="btn ghost" style="margin-left:auto;">код</button>
      <button id="charGameBtn" class="btn">в игру</button>
      <button id="charClose" class="btn">✕</button>
    </div>

    <div class="chGrid">
      <aside class="chSide">
        <div class="chSideHead">
          <div class="chSideLabel">Страницы</div>
          <button id="pageAddBtn" class="btn ghost" style="padding:8px 10px;">+ добавить</button>
        </div>
        <div id="pageList"></div>
      </aside>

      <main class="chMain">
        <div id="pageBody" style="max-width:900px;">
          <div style="opacity:.6;">Выберите страницу слева</div>
        </div>
      </main>
    </div>

    <style>
      .chTop{
        display:flex; align-items:center; gap:12px;
        padding:14px 16px; border-bottom:1px solid rgba(23,23,23,.08);
      }
      .chTitle{ font-family:'Vasek',ui-sans-serif; font-size:20px; line-height:1.1; }
      .chSub{ opacity:.6; font-size:12px; margin-top:2px; }
      .chGrid{
        display:grid; grid-template-columns: 280px 1fr;
        height: calc(100% - 58px); min-height:0;
      }
      .chSide{
        border-right:1px solid rgba(23,23,23,.08);
        padding:12px; overflow:auto; min-height:0;
      }
      .chMain{
        padding:16px; overflow:auto; min-height:0;
      }
      .chSideHead{ display:flex; gap:8px; align-items:center; justify-content:space-between; margin-bottom:10px; }
      .chSideLabel{ font-family:'Vasek',ui-sans-serif; font-size:14px; opacity:.85; }

      @media (max-width: 980px){
        #charOverlay{ inset:74px 10px 10px 10px; }
        .chGrid{ grid-template-columns:1fr; }
        .chSide{ border-right:0; border-bottom:1px solid rgba(23,23,23,.08); }
      }

      .pgItem{
        margin-top:8px;
        padding:10px 10px;
        cursor:pointer;
        border-radius:14px;
        border:1px solid rgba(23,23,23,.10);
        background: rgba(255,255,255,.68);
      }
      .pgItem:hover{ background: rgba(255,255,255,.82); }
      .pgItem.is-active{
        outline:2px solid rgba(23,23,23,.18);
        background: rgba(255,255,255,.86);
      }
      .pgTitle{
        font-family:'Vasek',ui-sans-serif;
        font-size:14px;
        line-height:1.15;
      }
      .pgMeta{
        opacity:.55;
        font-size:11px;
        margin-top:4px;
      }
      .field{
        width:100%;
        padding:10px 12px;
        border-radius:14px;
        border:1px solid rgba(23,23,23,.12);
        background: rgba(255,255,255,.88);
        font-family: ui-sans-serif, system-ui;
        font-size:14px;
        outline:none;
      }
      textarea.field{ min-height: 260px; resize: vertical; }
      .row{ display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; margin-top:10px; }
      .card{
        border-radius:22px;
        border:1px solid rgba(23,23,23,.10);
        background: rgba(255,255,255,.65);
        padding:12px;
      }
    </style>
  `;

  document.body.appendChild(el);
  el.querySelector("#charClose").onclick = () => (location.hash = "#/notebook");
  return el;
}

/* ================= LOGIC ================= */
let unsubPages = null;
let activePageId = null;
let currentRoute = null;
let currentCharacterSnap = null;

function canEditPage(mode, origin){
  if (mode === "admin") return true;
  return origin !== "admin";
}

async function joinGame(){
  const r = currentRoute;
  if (!r) return;

  // only owner can join their own character
  if (r.mode === "admin"){
    alert("Зайти в игру можно только как пользователь. Админ — задаёт контент.");
    return;
  }

  const locId = await pickRandomLocationId();
  if (!locId){
    alert("Пока нет локаций. (Админу нужно создать хотя бы одну в меню → “локации”)");
    return;
  }

  await updateDoc(doc(db,"users", r.uid, "characters", r.charId), {
    inGame: true,
    locationId: locId,
    joinedAt: serverTimestamp(),
    lastMoveAt: serverTimestamp()
  });

  alert("Готово! Персонаж отправлен в локацию.");
  location.hash = "#/locations";
}

async function openCharacter(){
  if (!requireAuth()) return;

  const route = parseRoute();
  if (!route || !route.uid || !route.charId) return;
  currentRoute = route;

  const { uid, charId, mode } = route;
  const wrap = ensureUI();
  wrap.style.display = "block";

  // load character
  const charRef = doc(db, "users", uid, "characters", charId);
  const snap = await getDoc(charRef);
  currentCharacterSnap = snap;

  const titleEl = wrap.querySelector("#charTitle");
  const subEl = wrap.querySelector("#charSubtitle");

  if (!snap.exists()){
    titleEl.textContent = "Персонаж не найден";
    subEl.textContent = "";
  } else {
    const c = snap.data();
    titleEl.textContent = c.name || "Персонаж";
    const parts = [];
    parts.push(mode === "admin" ? "режим мастера" : "моя тетрадка");
    if (c.inGame && c.locationId) parts.push("в игре");
    subEl.textContent = parts.join(" • ");
  }

  // code button
  wrap.querySelector("#charCopyCode").onclick = async () => {
    const code = `${uid}:${charId}`;
    try { await navigator.clipboard.writeText(code); alert("Код персонажа скопирован:\n"+code); }
    catch { prompt("Скопируйте код:", code); }
  };

  // game button
  wrap.querySelector("#charGameBtn").onclick = () => joinGame().catch(e=>{
    console.error(e);
    alert("Ошибка входа в игру: " + (e?.message || e));
  });

  // pages list
  const listEl = wrap.querySelector("#pageList");
  const bodyEl = wrap.querySelector("#pageBody");

  wrap.querySelector("#pageAddBtn").onclick = async ()=>{
    const title = prompt("Название страницы");
    if (!title) return;
    await addDoc(collection(db,"users",uid,"characters",charId,"pages"), {
      title,
      body:"",
      origin: mode==="admin" ? "admin" : "user",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  };

  if (unsubPages) unsubPages();
  unsubPages = onSnapshot(
    query(collection(db,"users",uid,"characters",charId,"pages"), orderBy("createdAt","asc")),
    (snapPages)=>{
      listEl.innerHTML = "";

      if (snapPages.empty){
        listEl.innerHTML = `<div style="opacity:.6; font-size:13px; line-height:1.45; padding:8px 2px;">
          Пока нет страниц. Нажми “+ добавить”.
        </div>`;

        bodyEl.innerHTML = `
          <div class="card">
            <div style="font-family:'Vasek',ui-sans-serif; font-size:18px;">Здесь будет тетрадка персонажа</div>
            <div style="opacity:.7; line-height:1.45; margin-top:8px;">
              Добавляйте страницы: заметки, референсы, файлы.  
              Админ может добавлять “страницы от мастера”.
            </div>
          </div>
        `;
        activePageId = null;
        return;
      }

      snapPages.forEach((d)=>{
        const p = d.data();
        const item = document.createElement("div");
        item.className = "pgItem" + (d.id===activePageId ? " is-active" : "");
        item.innerHTML = `
          <div class="pgTitle">${escapeHtml(p.title||"")}</div>
          <div class="pgMeta">${p.origin==="admin" ? "от мастера" : "моё"}</div>
        `;
        item.onclick = ()=>openPage(d.id, p, d.ref);
        listEl.appendChild(item);
      });

      if (!activePageId){
        listEl.querySelector(".pgItem")?.click();
      }
    }
  );

  function openPage(id, p, ref){
    activePageId = id;
    listEl.querySelectorAll(".pgItem").forEach(x=>x.classList.remove("is-active"));
    [...listEl.children].find(n=>n.classList?.contains("pgItem") && n.querySelector(".pgTitle")?.textContent=== (p.title||""))?.classList.add("is-active");

    const editable = canEditPage(mode, p.origin);

    bodyEl.innerHTML = `
      <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap;">
        <div>
          <div style="font-family:'Vasek',ui-sans-serif; font-size:20px; line-height:1.1;">${escapeHtml(p.title||"")}</div>
          <div style="opacity:.6; font-size:12px; margin-top:4px;">
            ${p.origin==="admin" ? "контент от мастера" : "контент пользователя"}
            ${mode==="admin" ? " • вы в режиме админа" : ""}
          </div>
        </div>

        <div class="row">
          <button class="btn ghost" id="pgRename">переименовать</button>
          <button class="btn ghost" id="pgDelete">удалить</button>
        </div>
      </div>

      <div style="margin-top:12px;">
        <textarea class="field" id="pgBody" ${editable ? "" : "disabled"}>${escapeHtml(p.body||"")}</textarea>
        <div class="row">
          <button class="btn ghost" id="pgCancel">отмена</button>
          <button class="btn" id="pgSave" ${editable ? "" : "disabled"}>сохранить</button>
        </div>
        ${editable ? "" : `<div style="opacity:.6; font-size:12px; margin-top:6px;">
          Это страница от мастера — пользователь её не редактирует.
        </div>`}
      </div>
    `;

    bodyEl.querySelector("#pgRename").onclick = async ()=>{
      const nt = prompt("Новое название", p.title||"");
      if (!nt) return;
      await updateDoc(ref, { title: nt, updatedAt: serverTimestamp() });
    };

    bodyEl.querySelector("#pgDelete").onclick = async ()=>{
      if (!confirm("Удалить страницу?")) return;
      await deleteDoc(ref);
      activePageId = null;
      bodyEl.innerHTML = `<div style="opacity:.6;">Страница удалена.</div>`;
    };

    bodyEl.querySelector("#pgCancel").onclick = ()=> openPage(id,p,ref);

    bodyEl.querySelector("#pgSave").onclick = async ()=>{
      const nextBody = bodyEl.querySelector("#pgBody").value;
      await updateDoc(ref, { body: nextBody, updatedAt: serverTimestamp() });
      const btn = bodyEl.querySelector("#pgSave");
      btn.textContent = "сохранено ✓";
      setTimeout(()=>{ if (btn) btn.textContent="сохранить"; }, 900);
    };
  }
}

function closeCharacter(){
  document.getElementById("charOverlay")?.style.display="none";
  if (unsubPages) unsubPages();
  unsubPages = null;
  activePageId = null;
  currentRoute = null;
  currentCharacterSnap = null;
}

function route(){
  const h = location.hash || "#/";
  if (h.startsWith("#/character/") || h.startsWith("#/admin/character/")){
    openCharacter().catch(e=>console.error("[character] open error", e));
  } else {
    closeCharacter();
  }
}

window.addEventListener("hashchange", route);
document.addEventListener("DOMContentLoaded", route);
