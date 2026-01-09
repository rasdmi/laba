// board.js
import { db } from "./firebase-config.js";
import { qs, escapeHtml, youtubeId, vimeoId, guessKind, formatDate } from "./utils.js";
import {
  doc, setDoc, getDoc, updateDoc, collection, addDoc, deleteDoc,
  query, orderBy, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

function previewHtml(url){
  const kind = guessKind(url);
  if (kind === "image") return `<img class="cardPreviewImg" src="${escapeHtml(url)}" alt="">`;
  if (kind === "video") return `<video class="cardPreviewVid" src="${escapeHtml(url)}" controls playsinline></video>`;
  if (kind === "youtube"){ const id = youtubeId(url); return `<div class="cardFrame"><iframe src="https://www.youtube.com/embed/${escapeHtml(id)}" allowfullscreen></iframe></div>`; }
  if (kind === "vimeo"){ const id = vimeoId(url); return `<div class="cardFrame"><iframe src="https://player.vimeo.com/video/${escapeHtml(id)}" allowfullscreen></iframe></div>`; }
  return `<a class="cardLink" href="${escapeHtml(url)}" target="_blank" rel="noopener">Открыть ссылку</a>`;
}

export function mountCabinet({ uid, email }){
  const driveIdeas = qs("#driveIdeas");
  const driveDone  = qs("#driveDone");
  const btnSaveDrive = qs("#saveDriveLinks");
  const btnOpenIdeas = qs("#openIdeasFolder");
  const btnOpenDone  = qs("#openDoneFolder");

  const colIdeas = qs("#colIdeas");
  const colDone = qs("#colDone");

  const btnAdd = qs("#addCardBtn");
  const modal = qs("#cardModal");
  const mTitle = qs("#mTitle");
  const mUrl = qs("#mUrl");
  const mNote = qs("#mNote");
  const mStatus = qs("#mStatus");
  const mCancel = qs("#mCancel");
  const mCreate = qs("#mCreate");

  const userRef = doc(db, "users", uid);

  (async ()=>{
    const snap = await getDoc(userRef);
    if (!snap.exists()){
      await setDoc(userRef, { email, createdAt: serverTimestamp() }, { merge:true });
    }
    const fresh = await getDoc(userRef);
    const data = fresh.data() || {};
    driveIdeas.value = data.driveIdeasUrl || "";
    driveDone.value  = data.driveDoneUrl || "";
  })();

  btnSaveDrive.onclick = async ()=>{
    await updateDoc(userRef, {
      driveIdeasUrl: driveIdeas.value.trim(),
      driveDoneUrl: driveDone.value.trim(),
      updatedAt: serverTimestamp()
    });
    btnSaveDrive.textContent = "Сохранено ✓";
    setTimeout(()=>btnSaveDrive.textContent="Сохранить", 900);
  };
  btnOpenIdeas.onclick = ()=>{ const url = driveIdeas.value.trim(); if(!url) return alert("Вставь ссылку на папку Ideas"); window.open(url,"_blank","noopener"); };
  btnOpenDone.onclick  = ()=>{ const url = driveDone.value.trim(); if(!url)  return alert("Вставь ссылку на папку Done");  window.open(url,"_blank","noopener"); };

  function openModal(){
    modal.classList.add("is-open");
    mTitle.value=""; mUrl.value=""; mNote.value=""; mStatus.value="ideas";
    setTimeout(()=>mTitle.focus(), 20);
  }
  function closeModal(){ modal.classList.remove("is-open"); }
  btnAdd.onclick = openModal;
  mCancel.onclick = closeModal;
  modal.addEventListener("click",(e)=>{ if(e.target===modal) closeModal(); });

  mCreate.onclick = async ()=>{
    const title = mTitle.value.trim() || "Без названия";
    const url = mUrl.value.trim();
    if (!url) return alert("Вставь URL");
    const note = mNote.value.trim();
    const status = mStatus.value;
    await addDoc(collection(db, "users", uid, "boardItems"), {
      title, url, note, status,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      kind: guessKind(url)
    });
    closeModal();
  };

  function makeCard(id, c){
    const el = document.createElement("div");
    el.className = "bCard";
    el.draggable = true;

    el.innerHTML = `
      <div class="bCardTop">
        <div class="bCardTitle" contenteditable="true" spellcheck="false">${escapeHtml(c.title||"")}</div>
        <button class="iconBtn" title="Удалить">✕</button>
      </div>
      <div class="bCardPreview">${previewHtml(c.url||"")}</div>
      <div class="bCardMeta">
        <a href="${escapeHtml(c.url||"")}" target="_blank" rel="noopener">ссылка</a>
        <span>•</span>
        <span>${escapeHtml(formatDate(c.createdAt)||"")}</span>
      </div>
      <div class="bCardNote">
        <div class="muted mini">Комментарий</div>
        <div class="bNote" contenteditable="true" spellcheck="false">${escapeHtml(c.note||"")}</div>
      </div>
    `;

    el.querySelector("button").onclick = async ()=>{
      if (!confirm("Удалить карточку?")) return;
      await deleteDoc(doc(db, "users", uid, "boardItems", id));
    };

    const titleEl = el.querySelector(".bCardTitle");
    const noteEl = el.querySelector(".bNote");
    let t1=null, t2=null;

    titleEl.addEventListener("input", ()=>{
      clearTimeout(t1);
      t1=setTimeout(()=>updateDoc(doc(db, "users", uid, "boardItems", id), {
        title: titleEl.textContent.trim(),
        updatedAt: serverTimestamp()
      }), 450);
    });
    noteEl.addEventListener("input", ()=>{
      clearTimeout(t2);
      t2=setTimeout(()=>updateDoc(doc(db, "users", uid, "boardItems", id), {
        note: noteEl.textContent.trim(),
        updatedAt: serverTimestamp()
      }), 450);
    });

    el.addEventListener("dragstart",(e)=>{ e.dataTransfer.setData("text/plain", id); el.classList.add("dragging"); });
    el.addEventListener("dragend",()=>el.classList.remove("dragging"));

    return el;
  }

  function setupDropZone(zoneEl, toStatus){
    zoneEl.addEventListener("dragover",(e)=>{ e.preventDefault(); zoneEl.classList.add("is-over"); });
    zoneEl.addEventListener("dragleave",()=>zoneEl.classList.remove("is-over"));
    zoneEl.addEventListener("drop", async (e)=>{
      e.preventDefault();
      zoneEl.classList.remove("is-over");
      const id = e.dataTransfer.getData("text/plain");
      if (!id) return;
      await updateDoc(doc(db, "users", uid, "boardItems", id), { status: toStatus, updatedAt: serverTimestamp() });
    });
  }
  setupDropZone(colIdeas, "ideas");
  setupDropZone(colDone, "done");

  const q = query(collection(db, "users", uid, "boardItems"), orderBy("createdAt","desc"));
  const unsub = onSnapshot(q, (snap)=>{
    colIdeas.innerHTML=""; colDone.innerHTML="";
    snap.forEach(d=>{
      const c=d.data();
      const card = makeCard(d.id, c);
      (c.status==="done" ? colDone : colIdeas).appendChild(card);
    });
    if (!colIdeas.children.length) colIdeas.innerHTML = `<div class="empty">Пока пусто. Нажми “+ карточка”.</div>`;
    if (!colDone.children.length)  colDone.innerHTML  = `<div class="empty">Здесь появятся результаты.</div>`;
  });

  return ()=>unsub();
}
