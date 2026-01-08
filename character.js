// character.js
import { auth, db, storage } from "./firebase-config.js";
import { requireAuth } from "./auth.js";
import { doc, getDoc, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { ref as sRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

function escapeHtml(s){ return (s||"").replace(/[&<>"']/g, (m)=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m])); }

let activeChar = null;
let unsubPages = null;
let unsubComments = null;

function ensureCharacterUI(){
  const rightBody = document.getElementById("nbRightBody");
  if (!rightBody || document.getElementById("charUI")) return;

  const wrap = document.createElement("div");
  wrap.id = "charUI";
  wrap.innerHTML = `
    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
      <button class="nbBtnMini" id="charAddNote" type="button">+ заметка</button>
      <button class="nbBtnMini" id="charAddFile" type="button">+ файл</button>
      <button class="nbBtnMini" id="charAddDrawing" type="button">+ рисунок</button>
    </div>

    <div id="charComposer" style="display:none; margin-bottom:12px;"></div>

    <div style="font-family:'Vasek',ui-sans-serif; font-size:14px; opacity:.85; margin: 10px 0 8px;">Страницы</div>
    <div id="charPages" style="display:flex; flex-direction:column; gap:10px;"></div>

    <div id="charPageModal" style="display:none;"></div>
  `;
  rightBody.innerHTML = "";
  rightBody.appendChild(wrap);

  const modal = document.getElementById("charPageModal");
  modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.22);display:none;align-items:center;justify-content:center;z-index:90;";
  modal.addEventListener("click", (e)=>{ if (e.target===modal) modal.style.display="none"; });

  document.getElementById("charAddNote").onclick = ()=> showComposer("note");
  document.getElementById("charAddFile").onclick = ()=> showComposer("file");
  document.getElementById("charAddDrawing").onclick = ()=> {
    if (typeof window.openDrawing === "function") window.openDrawing();
    else alert("drawing.js не загрузился");
  };

  function showComposer(type){
    const c = document.getElementById("charComposer");
    c.style.display = "";
    if (type === "note"){
      c.innerHTML = `
        <div class="nbForm">
          <input class="nbInput" id="noteTitle" placeholder="Заголовок заметки" />
          <textarea class="nbTextarea" id="noteText" placeholder="Текст..."></textarea>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="nbBtnMini" id="noteSave" type="button">сохранить</button>
            <button class="nbBtnMini" id="noteCancel" type="button">отмена</button>
          </div>
        </div>
      `;
      document.getElementById("noteCancel").onclick = ()=> (c.style.display="none");
      document.getElementById("noteSave").onclick = ()=> saveNote();
    } else {
      c.innerHTML = `
        <div class="nbForm">
          <input class="nbInput" id="fileTitle" placeholder="Название файла (необязательно)" />
          <input class="nbInput" id="fileInput" type="file" />
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="nbBtnMini" id="fileSave" type="button">загрузить</button>
            <button class="nbBtnMini" id="fileCancel" type="button">отмена</button>
          </div>
        </div>
      `;
      document.getElementById("fileCancel").onclick = ()=> (c.style.display="none");
      document.getElementById("fileSave").onclick = ()=> uploadFile();
    }
  }
}

async function loadCharacter(charId){
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  const ref = doc(db, "users", uid, "characters", charId);
  const snap = await getDoc(ref);
  if (!snap.exists()){
    document.getElementById("nbRightTitle").textContent = "Не найдено";
    document.getElementById("nbRightMuted").textContent = "";
    return;
  }

  activeChar = { id: charId, ...snap.data() };
  document.getElementById("nbRightTitle").textContent = activeChar.name || "Персонаж";
  document.getElementById("nbRightMuted").textContent = activeChar.about || "";

  ensureCharacterUI();
  mountPages();
}

function mountPages(){
  const uid = auth.currentUser?.uid;
  if (!uid || !activeChar) return;

  unsubPages?.();
  const pagesEl = document.getElementById("charPages");
  pagesEl.innerHTML = "";

  const q = query(collection(db, "users", uid, "characters", activeChar.id, "pages"), orderBy("createdAt", "desc"));
  unsubPages = onSnapshot(q, (snap) => {
    pagesEl.innerHTML = "";
    if (snap.empty){
      const empty = document.createElement("div");
      empty.style.cssText = "opacity:.6; font-size:13px; line-height:1.45;";
      empty.textContent = "Пока нет страниц. Добавьте заметку/файл/рисунок.";
      pagesEl.appendChild(empty);
      return;
    }

    snap.forEach((docSnap) => {
      const p = docSnap.data();
      const card = document.createElement("div");
      card.className = "charItem";
      const subtitle = p.type === "file" ? "файл" : p.type === "drawing" ? "рисунок" : "заметка";
      card.innerHTML = `
        <div class="charName">${escapeHtml(p.title || subtitle)}</div>
        <div class="charAbout">${escapeHtml(p.type==="note" ? (p.text||"").slice(0,140) : p.type==="file" ? (p.originalName||"") : "Открыть")}</div>
      `;
      card.onclick = ()=> openPageModal(docSnap.id, p);
      pagesEl.appendChild(card);
    });
  });
}

async function saveNote(){
  const uid = auth.currentUser?.uid;
  if (!uid || !activeChar) return;

  const title = document.getElementById("noteTitle").value.trim() || "Заметка";
  const text = document.getElementById("noteText").value.trim();

  await addDoc(collection(db, "users", uid, "characters", activeChar.id, "pages"), { type:"note", title, text, createdAt: serverTimestamp() });
  document.getElementById("charComposer").style.display = "none";
}

async function uploadFile(){
  const uid = auth.currentUser?.uid;
  if (!uid || !activeChar) return;

  const input = document.getElementById("fileInput");
  const file = input.files?.[0];
  if (!file){ alert("Выберите файл"); return; }

  const title = document.getElementById("fileTitle").value.trim() || "Файл";
  const safeName = (file.name || "file").replace(/[^a-zA-Z0-9._-]+/g, "_");
  const path = `users/${uid}/characters/${activeChar.id}/files/${Date.now()}_${safeName}`;
  const storageRef = sRef(storage, path);

  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);

  await addDoc(collection(db, "users", uid, "characters", activeChar.id, "pages"), {
    type:"file", title, originalName:file.name, storagePath:path, url, createdAt: serverTimestamp()
  });

  document.getElementById("charComposer").style.display = "none";
}

async function openPageModal(pageId, page){
  const modal = document.getElementById("charPageModal");
  modal.style.display = "flex";

  const inner = document.createElement("div");
  inner.style.cssText = "width:min(820px,calc(100vw - 28px));max-height:calc(100vh - 28px);overflow:auto;border-radius:26px;background:rgba(255,255,255,.94);border:1px solid rgba(23,23,23,.18);box-shadow:0 18px 50px rgba(0,0,0,.14);padding:14px;font-family:ui-sans-serif,system-ui;";

  let body = "";
  if (page.type==="note"){
    body = `<div style="margin-top:10px;white-space:pre-wrap;line-height:1.5;">${escapeHtml(page.text||"")}</div>`;
  } else if (page.type==="file"){
    body = `<div style="margin-top:10px;"><div style="opacity:.7;margin-bottom:8px;">${escapeHtml(page.originalName||"")}</div><a href="${page.url}" target="_blank" rel="noreferrer">Открыть файл ↗</a></div>`;
  } else {
    body = `<div style="margin-top:10px;"><img src="${page.url}" alt="" style="max-width:100%;border-radius:18px;border:1px solid rgba(23,23,23,.12);" /></div>`;
  }

  body += `
    <div style="margin-top:14px;padding-top:12px;border-top:1px solid rgba(23,23,23,.10);">
      <div style="font-family:'Vasek',ui-sans-serif;font-size:14px;opacity:.85;">Комментарии</div>
      <div id="cmList" style="display:flex;flex-direction:column;gap:8px;margin-top:8px;"></div>
      <div style="display:flex;gap:8px;margin-top:10px;">
        <input id="cmInput" placeholder="Написать комментарий..." style="flex:1;padding:10px 12px;border-radius:14px;border:1px solid rgba(23,23,23,.14);background:rgba(255,255,255,.92);" />
        <button id="cmSend" class="nbBtnMini" type="button">отправить</button>
      </div>
    </div>
  `;

  inner.innerHTML = `
    <div style="display:flex;align-items:flex-start;gap:10px;">
      <div style="font-family:'Vasek',ui-sans-serif;font-size:18px;">${escapeHtml(page.title || "страница")}</div>
      <button id="closePageModal" style="margin-left:auto;border:0;background:transparent;cursor:pointer;font-size:16px;opacity:.7;">✕</button>
    </div>
    ${body}
  `;

  modal.innerHTML = "";
  modal.appendChild(inner);
  inner.querySelector("#closePageModal").onclick = ()=> (modal.style.display="none");

  mountComments(pageId);

  inner.querySelector("#cmSend").onclick = async ()=>{
    const t = inner.querySelector("#cmInput").value.trim();
    if (!t) return;
    await addComment(pageId, t);
    inner.querySelector("#cmInput").value = "";
  };
}

function mountComments(pageId){
  const uid = auth.currentUser?.uid;
  if (!uid || !activeChar) return;

  unsubComments?.();
  const list = document.getElementById("cmList");
  list.innerHTML = "";

  const q = query(collection(db, "users", uid, "characters", activeChar.id, "comments"), orderBy("createdAt", "desc"));
  unsubComments = onSnapshot(q, (snap) => {
    list.innerHTML = "";
    const items = [];
    snap.forEach((d)=>{ const c=d.data(); if (c.pageId===pageId) items.push(c); });

    if (items.length===0){
      const empty=document.createElement("div");
      empty.style.cssText="opacity:.6;font-size:13px;";
      empty.textContent="Комментариев пока нет.";
      list.appendChild(empty);
      return;
    }
    items.forEach((c)=>{
      const row=document.createElement("div");
      row.style.cssText="padding:10px 12px;border-radius:14px;border:1px solid rgba(23,23,23,.10);background:rgba(255,255,255,.70);";
      row.innerHTML=`<div style="font-family:'Vasek',ui-sans-serif;font-size:13px;opacity:.85;">${escapeHtml(c.authorName||"участник")}</div><div style="margin-top:4px;line-height:1.45;">${escapeHtml(c.text||"")}</div>`;
      list.appendChild(row);
    });
  });
}

async function addComment(pageId, text){
  const uid = auth.currentUser?.uid;
  if (!uid || !activeChar) return;

  await addDoc(collection(db, "users", uid, "characters", activeChar.id, "comments"), {
    pageId, text,
    authorName: auth.currentUser?.displayName || "участник",
    createdAt: serverTimestamp()
  });
}

window.__CHAR_CTX__ = {
  get active(){ return activeChar; },
  async addDrawingPage(title, url, storagePath){
    const uid = auth.currentUser?.uid;
    if (!uid || !activeChar) return;
    await addDoc(collection(db, "users", uid, "characters", activeChar.id, "pages"), { type:"drawing", title: title||"Рисунок", url, storagePath, createdAt: serverTimestamp() });
  }
};

async function route(){
  const hash = location.hash || "#/";
  if (!hash.startsWith("#/character/")) return;
  if (!requireAuth()) return;

  const charId = hash.split("/")[2];
  if (charId) await loadCharacter(charId);
}

window.addEventListener("hashchange", route);
document.addEventListener("DOMContentLoaded", route);
