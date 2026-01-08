// locations.js
import { auth, db } from "./firebase-config.js";
import { requireAuth } from "./auth.js";
import {
  collection,
  addDoc,
  deleteDoc,
  updateDoc,
  getDocs,
  doc,
  query,
  orderBy,
  serverTimestamp,
  onSnapshot,
  limit
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

function escapeHtml(s){
  return (s||"").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
}

function ensureUI(){
  let el = document.getElementById("locOverlay");
  if (el) return el;

  el = document.createElement("div");
  el.id = "locOverlay";
  el.style.cssText = `
    position:fixed; inset:64px 12px 12px 12px;
    z-index:58;
    border-radius:26px;
    background:rgba(255,255,255,.84);
    border:1px solid rgba(23,23,23,.12);
    box-shadow:0 24px 80px rgba(0,0,0,.12);
    backdrop-filter: blur(10px);
    display:none;
    overflow:hidden;
  `;

  el.innerHTML = `
    <div style="display:flex; align-items:center; gap:12px; padding:14px 16px; border-bottom:1px solid rgba(23,23,23,.08);">
      <div style="min-width:0;">
        <div style="font-family:'Vasek',ui-sans-serif; font-size:20px; line-height:1.1;">Локации</div>
        <div style="opacity:.6; font-size:12px; margin-top:2px;">мир, в который попадают персонажи</div>
      </div>

      <button id="locNewBtn" class="btn ghost" style="margin-left:auto; display:none;">+ добавить</button>
      <button id="locClose" class="btn">✕</button>
    </div>

    <div style="display:grid; grid-template-columns:340px 1fr; height:calc(100% - 58px); min-height:0;">
      <aside style="border-right:1px solid rgba(23,23,23,.08); padding:12px; overflow:auto; min-height:0;">
        <div id="locList"></div>
      </aside>

      <main style="padding:16px; overflow:auto; min-height:0;">
        <div id="locBody" style="max-width:900px;">
          <div style="opacity:.6;">Выберите локацию слева</div>
        </div>
      </main>
    </div>

    <style>
      @media (max-width: 980px){
        #locOverlay{ inset:74px 10px 10px 10px; }
        #locOverlay > div:nth-child(2){
          grid-template-columns: 1fr !important;
        }
        #locOverlay aside{
          border-right:0 !important;
          border-bottom:1px solid rgba(23,23,23,.08);
        }
      }
      .locItem{
        margin-top:10px;
        padding:12px;
        border-radius:18px;
        border:1px solid rgba(23,23,23,.10);
        background: rgba(255,255,255,.68);
        cursor:pointer;
      }
      .locItem:hover{ background: rgba(255,255,255,.82); }
      .locName{
        font-family:'Vasek',ui-sans-serif;
        font-size:16px;
        line-height:1.1;
      }
      .locDesc{
        opacity:.65;
        font-size:12px;
        margin-top:6px;
        line-height:1.35;
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
      textarea.field{ min-height: 140px; resize: vertical; }
      .row{ display:flex; gap:10px; flex-wrap:wrap; justify-content:flex-end; margin-top:10px; }
    </style>
  `;

  document.body.appendChild(el);

  el.querySelector("#locClose").onclick = () => (location.hash = "#/");
  el.querySelector("#locNewBtn").onclick = async () => {
    const name = prompt("Название локации");
    if (!name) return;
    const desc = prompt("Короткое описание (можно пусто)") || "";
    await addDoc(collection(db, "locations"), {
      name,
      desc,
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser?.uid || null
    });
  };

  return el;
}

let unsubLocs = null;
let activeLocId = null;

function openLocations(){
  if (!requireAuth()) return;
  const el = ensureUI();
  el.style.display = "block";

  // admin can create
  el.querySelector("#locNewBtn").style.display = window.APP_IS_ADMIN ? "" : "none";

  const list = el.querySelector("#locList");
  const body = el.querySelector("#locBody");

  if (unsubLocs) unsubLocs();
  unsubLocs = onSnapshot(
    query(collection(db, "locations"), orderBy("createdAt","desc"), limit(100)),
    (snap)=>{
      list.innerHTML = "";
      if (snap.empty){
        list.innerHTML = `<div style="opacity:.6; font-size:13px; line-height:1.45; padding:8px 2px;">
          Пока нет локаций. ${window.APP_IS_ADMIN ? "Нажмите “+ добавить”." : "Скоро появятся."}
        </div>`;
        body.innerHTML = `<div style="opacity:.6;">Нет локаций.</div>`;
        return;
      }

      snap.forEach(d=>{
        const loc = d.data();
        const item = document.createElement("div");
        item.className = "locItem" + (d.id===activeLocId ? " is-active" : "");
        item.innerHTML = `
          <div class="locName">${escapeHtml(loc.name||"Локация")}</div>
          <div class="locDesc">${escapeHtml(loc.desc||"")}</div>
        `;
        item.onclick = ()=>{
          activeLocId = d.id;
          showLocation(d.id, loc);
          // highlight
          list.querySelectorAll(".locItem").forEach(x=>x.classList.remove("is-active"));
          item.classList.add("is-active");
        };
        list.appendChild(item);
      });

      if (!activeLocId){
        list.querySelector(".locItem")?.click();
      }
    }
  );

  function showLocation(id, loc){
    const admin = !!window.APP_IS_ADMIN;

    body.innerHTML = `
      <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap;">
        <div>
          <div style="font-family:'Vasek',ui-sans-serif; font-size:22px; line-height:1.1;">${escapeHtml(loc.name||"Локация")}</div>
          <div style="opacity:.65; font-size:13px; margin-top:6px; line-height:1.45;">${escapeHtml(loc.desc||"")}</div>
        </div>
        ${admin ? `
          <div class="row">
            <button class="btn ghost" id="locEdit">редактировать</button>
            <button class="btn ghost" id="locDel">удалить</button>
          </div>` : ``}
      </div>

      <div style="margin-top:16px; padding:16px; border-radius:22px; border:1px dashed rgba(23,23,23,.18); background:rgba(255,255,255,.62);">
        <div style="font-family:'Vasek',ui-sans-serif; font-size:16px;">Что дальше</div>
        <div style="opacity:.7; font-size:13px; margin-top:8px; line-height:1.45;">
          Персонажи попадают в локации через кнопку <b>“в игру”</b> внутри персонажа.
          В следующем шаге сюда добавим: NPC, задания, награды и карту уровня.
        </div>
      </div>
    `;

    if (!admin) return;

    body.querySelector("#locEdit").onclick = async ()=>{
      const newName = prompt("Название", loc.name||"");
      if (!newName) return;
      const newDesc = prompt("Описание", loc.desc||"") ?? "";
      await updateDoc(doc(db,"locations",id), { name:newName, desc:newDesc });
    };

    body.querySelector("#locDel").onclick = async ()=>{
      if (!confirm("Удалить локацию?")) return;
      await deleteDoc(doc(db,"locations",id));
      activeLocId = null;
    };
  }
}

function closeLocations(){
  const el = document.getElementById("locOverlay");
  if (el) el.style.display = "none";
  if (unsubLocs) unsubLocs();
  unsubLocs = null;
  activeLocId = null;
}

function route(){
  const h = location.hash || "#/";
  if (h.startsWith("#/locations")){
    openLocations();
  } else {
    closeLocations();
  }
}

window.addEventListener("hashchange", route);
document.addEventListener("DOMContentLoaded", route);

// Utility: pick random location id (used by character.js)
export async function pickRandomLocationId(){
  const snap = await getDocs(query(collection(db,"locations"), orderBy("createdAt","desc"), limit(50)));
  const ids = [];
  snap.forEach(d=>ids.push(d.id));
  if (!ids.length) return null;
  return ids[Math.floor(Math.random()*ids.length)];
}
