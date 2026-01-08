// character.js
import { auth, db, storage } from "./firebase-config.js";
import { requireAuth } from "./auth.js";

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

import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[m]));
}

function parseRoute() {
  const h = location.hash || "";

  // user mode
  if (h.startsWith("#/character/")) {
    return {
      mode: "user",
      uid: auth.currentUser?.uid,
      charId: h.split("/")[2],
    };
  }

  // admin mode
  if (h.startsWith("#/admin/character/")) {
    const p = h.split("/");
    return {
      mode: "admin",
      uid: p[3],
      charId: p[4],
    };
  }

  return null;
}

function ensureUI() {
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
    <div style="display:flex; align-items:center; gap:12px; padding:14px 16px; border-bottom:1px solid rgba(23,23,23,.08);">
      <div style="min-width:0;">
        <div id="charTitle" style="font-family:'Vasek',ui-sans-serif; font-size:20px; line-height:1.1;">Персонаж</div>
        <div id="charSubtitle" style="opacity:.6; font-size:12px; margin-top:2px;"></div>
      </div>

      <button id="charCopyCode" class="btn ghost" style="margin-left:auto;">код</button>
      <button id="charClose" class="btn">✕</button>
    </div>

    <div style="display:grid; grid-template-columns:280px 1fr; height:calc(100% - 58px); min-height:0;">
      <aside style="border-right:1px solid rgba(23,23,23,.08); padding:12px; overflow:auto; min-height:0;">
        <div style="display:flex; gap:8px; align-items:center; justify-content:space-between; margin-bottom:10px;">
          <div style="font-family:'Vasek',ui-sans-serif; font-size:14px; opacity:.85;">Страницы</div>
          <button id="pageAddBtn" class="btn ghost" style="padding:8px 10px;">+ добавить</button>
        </div>
        <div id="pageList"></div>
      </aside>

      <main style="padding:16px; overflow:auto; min-height:0;">
        <div id="pageBody" style="max-width:900px;">
          <div style="opacity:.6;">Выберите страницу слева</div>
        </div>

        <section id="gallerySection" style="margin-top:14px;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
            <div style="font-family:\'Vasek\',ui-sans-serif; font-size:16px; opacity:.85;">Галерея</div>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <input id="galleryFile" type="file" accept="image/*" style="display:none" />
              <button class="btn ghost" id="galleryAdd" type="button">+ картинка</button>
            </div>
          </div>
          <div id="galleryBoard" style="
            margin-top:10px;
            height: 260px;
            border-radius: 20px;
            border: 1px dashed rgba(23,23,23,.16);
            background: rgba(255,255,255,.62);
            position: relative;
            overflow: hidden;
          "></div>
          <div style="opacity:.6; font-size:12px; margin-top:6px; line-height:1.35;">
            Перетаскивай картинки мышкой/пальцем. Нажми ✕ чтобы удалить.
          </div>
        </section>
      </main>
    </div>

    <style>
      @media (max-width: 980px){
        #charOverlay{ inset:74px 10px 10px 10px; }
        #charOverlay > div:nth-child(2){
          grid-template-columns: 1fr !important;
        }
        #charOverlay aside{
          border-right:0 !important;
          border-bottom:1px solid rgba(23,23,23,.08);
        }
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
      .pgTopRow{
        display:flex;
        gap:10px;
        align-items:center;
        justify-content:space-between;
      }
      .miniRow{
        display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end;
        margin-top:10px;
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
    </style>
  `;

  document.body.appendChild(el);

  el.querySelector("#charClose").onclick = () => (location.hash = "#/notebook");

  return el;
}

let unsubPages = null;
let activePageId = null;

function canEditPage(routeMode, pageOrigin) {
  // admin может всё
  if (routeMode === "admin") return true;
  // пользователь может редактировать только свои страницы
  return pageOrigin !== "admin";
}


let unsubGallery = null;

function randPos(max){
  return Math.max(12, Math.floor(Math.random() * Math.max(12, max-120)));
}

function mountGallery(uid, charId){
  const board = document.getElementById("galleryBoard");
  const addBtn = document.getElementById("galleryAdd");
  const fileInput = document.getElementById("galleryFile");
  if (!board || !addBtn || !fileInput) return;

  // responsive board height
  if (window.matchMedia && window.matchMedia("(max-width: 980px)").matches){
    board.style.height = "200px";
  }

  addBtn.onclick = () => fileInput.click();

  fileInput.onchange = async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    fileInput.value = "";

    const id = (crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()));
    const path = `users/${uid}/characters/${charId}/gallery/${id}_${file.name}`;
    const sref = storageRef(storage, path);

    try{
      await uploadBytes(sref, file, { contentType: file.type || "image/*" });
      const url = await getDownloadURL(sref);

      // store initial position
      const rect = board.getBoundingClientRect();
      const x = randPos(rect.width);
      const y = randPos(rect.height);

      await addDoc(collection(db,"users",uid,"characters",charId,"gallery"), {
        url,
        storagePath: path,
        name: file.name,
        x, y,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }catch(e){
      console.error("[gallery] upload error", e);
      alert("Не удалось загрузить картинку. Проверь Storage rules/доступ.");
    }
  };

  if (unsubGallery) unsubGallery();
  const q = query(collection(db,"users",uid,"characters",charId,"gallery"), orderBy("createdAt","asc"));
  unsubGallery = onSnapshot(q, (snap) => {
    board.innerHTML = "";
    if (snap.empty){
      board.innerHTML = `<div style="opacity:.55; font-size:12px; padding:14px;">Пока пусто. Нажми “+ картинка”.</div>`;
      return;
    }

    snap.forEach((d) => {
      const it = d.data();
      const wrap = document.createElement("div");
      wrap.style.cssText = `
        position:absolute;
        left:${Math.max(0, it.x||0)}px;
        top:${Math.max(0, it.y||0)}px;
        width:120px; height:88px;
        border-radius:16px;
        border:1px solid rgba(23,23,23,.12);
        background: rgba(255,255,255,.86);
        box-shadow: 0 10px 26px rgba(0,0,0,.10);
        overflow:hidden;
        touch-action:none;
        user-select:none;
      `;

      wrap.innerHTML = `
        <img src="${it.url}" alt="" style="width:100%; height:100%; object-fit:cover; display:block;">
        <button title="Удалить" style="
          position:absolute; top:6px; right:6px;
          width:24px; height:24px; border-radius:999px;
          border:1px solid rgba(23,23,23,.16);
          background: rgba(255,255,255,.88);
          cursor:pointer;
        ">✕</button>
      `;

      // delete
      wrap.querySelector("button").onclick = async (ev) => {
        ev.stopPropagation();
        if (!confirm("Удалить картинку?")) return;
        try{
          await deleteDoc(doc(db,"users",uid,"characters",charId,"gallery", d.id));
        }catch(e){
          console.error(e);
        }
        // try delete from storage (optional)
        if (it.storagePath){
          try{ await deleteObject(storageRef(storage, it.storagePath)); }catch(e){}
        }
      };

      // drag
      let startX=0, startY=0, baseX=it.x||0, baseY=it.y||0, dragging=false;

      const onDown = (e) => {
        dragging = true;
        wrap.setPointerCapture?.(e.pointerId);
        startX = e.clientX;
        startY = e.clientY;
        baseX = it.x||0;
        baseY = it.y||0;
      };
      const onMove = (e) => {
        if (!dragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const nx = Math.max(0, baseX + dx);
        const ny = Math.max(0, baseY + dy);
        wrap.style.left = nx + "px";
        wrap.style.top = ny + "px";
      };
      const onUp = async (e) => {
        if (!dragging) return;
        dragging = false;
        const nx = parseFloat(wrap.style.left) || 0;
        const ny = parseFloat(wrap.style.top) || 0;
        try{
          await updateDoc(doc(db,"users",uid,"characters",charId,"gallery", d.id), {
            x: nx, y: ny, updatedAt: serverTimestamp()
          });
        }catch(err){ console.error(err); }
      };

      wrap.addEventListener("pointerdown", onDown);
      wrap.addEventListener("pointermove", onMove);
      wrap.addEventListener("pointerup", onUp);
      wrap.addEventListener("pointercancel", onUp);

      board.appendChild(wrap);
    });
  });
}

async function openCharacter() {
  if (!requireAuth()) return;

  const route = parseRoute();
  if (!route || !route.uid || !route.charId) return;

  const { uid, charId, mode } = route;

  const wrap = ensureUI();
  wrap.style.display = "block";
  document.body.classList.add("overlay-open");

  // контекст для drawing.js (чтобы рисунки понимали, какой персонаж активен)
  window.__CHAR_CTX__ = { uid, charId, mode, active: { id: charId } };

  // header: персонаж
  const charSnap = await getDoc(doc(db, "users", uid, "characters", charId));
  if (charSnap.exists()) {
    const c = charSnap.data();
    wrap.querySelector("#charTitle").textContent = c.name || "Персонаж";
    wrap.querySelector("#charSubtitle").textContent =
      mode === "admin" ? "режим мастера (админ)" : "моя тетрадка";
  } else {
    wrap.querySelector("#charTitle").textContent = "Персонаж не найден";
    wrap.querySelector("#charSubtitle").textContent = "";
  }

  // код персонажа (для админа удобно)
  wrap.querySelector("#charCopyCode").onclick = async () => {
    const code = `${uid}:${charId}`;
    try {
      await navigator.clipboard.writeText(code);
      alert("Код персонажа скопирован:\n" + code);
    } catch {
      prompt("Скопируйте код вручную:", code);
    }
  };

  const listEl = wrap.querySelector("#pageList");
  const bodyEl = wrap.querySelector("#pageBody");

  // add page
  wrap.querySelector("#pageAddBtn").onclick = async () => {
    const title = prompt("Название страницы");
    if (!title) return;

    await addDoc(collection(db, "users", uid, "characters", charId, "pages"), {
      title,
      body: "",
      origin: mode === "admin" ? "admin" : "user",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  };

  mountGallery(uid, charId);

  if (unsubPages) unsubPages();
  if (unsubGallery) unsubGallery();
  unsubGallery = null;
  unsubPages = onSnapshot(
    query(
      collection(db, "users", uid, "characters", charId, "pages"),
      orderBy("createdAt", "asc")
    ),
    (snap) => {
      listEl.innerHTML = "";

      if (snap.empty) {
        listEl.innerHTML = `<div style="opacity:.6; font-size:13px; line-height:1.45; padding:8px 2px;">
          Пока нет страниц. Нажми “+ добавить”.
        </div>`;
        bodyEl.innerHTML = `<div style="opacity:.6;">Создай первую страницу.</div>`;
        activePageId = null;
        return;
      }

      snap.forEach((d) => {
        const p = d.data();
        const item = document.createElement("div");
        item.className = "pgItem" + (d.id === activePageId ? " is-active" : "");
        item.innerHTML = `
          <div class="pgTopRow">
            <div class="pgTitle">${escapeHtml(p.title || "")}</div>
            <div style="opacity:.55; font-size:11px;">${escapeHtml(p.origin || "")}</div>
          </div>
          <div class="pgMeta">${p.origin === "admin" ? "файл от мастера" : "моя заметка"}</div>
        `;

        item.onclick = () => {
          activePageId = d.id;
          // подсветка
          listEl.querySelectorAll(".pgItem").forEach((x) => x.classList.remove("is-active"));
          item.classList.add("is-active");

          const editable = canEditPage(mode, p.origin);

          bodyEl.innerHTML = `
            <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap;">
              <div>
                <div style="font-family:'Vasek',ui-sans-serif; font-size:18px; line-height:1.1;">${escapeHtml(p.title || "")}</div>
                <div style="opacity:.6; font-size:12px; margin-top:4px;">
                  ${p.origin === "admin" ? "контент от мастера" : "контент пользователя"}
                  ${mode === "admin" ? " • вы в режиме админа" : ""}
                </div>
              </div>
              <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <button class="btn ghost" id="pgRename">переименовать</button>
                <button class="btn ghost" id="pgDelete">удалить</button>
              </div>
            </div>

            <div style="margin-top:12px;">
              <textarea class="field" id="pgBody" ${editable ? "" : "disabled"}>${escapeHtml(p.body || "")}</textarea>
              <div class="miniRow">
                <button class="btn ghost" id="pgCancel">отмена</button>
                <button class="btn" id="pgSave" ${editable ? "" : "disabled"}>сохранить</button>
              </div>
              ${editable ? "" : `<div style="opacity:.6; font-size:12px; margin-top:6px;">
                Это страница от мастера — пользователь её не редактирует.
              </div>`}
            </div>
          `;

          // rename
          bodyEl.querySelector("#pgRename").onclick = async () => {
            const nt = prompt("Новое название", p.title || "");
            if (!nt) return;
            await updateDoc(doc(db, "users", uid, "characters", charId, "pages", d.id), {
              title: nt,
              updatedAt: serverTimestamp(),
            });
          };

          // delete (MVP: можно удалять; хочешь — ограничим права)
          bodyEl.querySelector("#pgDelete").onclick = async () => {
            if (!confirm("Удалить страницу?")) return;
            await deleteDoc(doc(db, "users", uid, "characters", charId, "pages", d.id));
            activePageId = null;
            bodyEl.innerHTML = `<div style="opacity:.6;">Страница удалена. Выберите другую.</div>`;
          };

          // cancel
          bodyEl.querySelector("#pgCancel").onclick = () => {
            // просто перерисуем текущую страницу повторным кликом
            item.click();
          };

          // save
          bodyEl.querySelector("#pgSave").onclick = async () => {
            const nextBody = bodyEl.querySelector("#pgBody").value;
            await updateDoc(doc(db, "users", uid, "characters", charId, "pages", d.id), {
              body: nextBody,
              updatedAt: serverTimestamp(),
            });
            // лёгкий фидбек
            bodyEl.querySelector("#pgSave").textContent = "сохранено ✓";
            setTimeout(() => {
              const btn = bodyEl.querySelector("#pgSave");
              if (btn) btn.textContent = "сохранить";
            }, 900);
          };
        };

        listEl.appendChild(item);
      });

      // если еще не выбрано — открыть первую
      if (!activePageId) {
        const first = listEl.querySelector(".pgItem");
        first?.click();
      }
    }
  );
}

function closeCharacter() {
  const el = document.getElementById("charOverlay");
  if (el) el.style.display = "none";
  document.body.classList.remove("overlay-open");
  mountGallery(uid, charId);

  if (unsubPages) unsubPages();
  if (unsubGallery) unsubGallery();
  unsubGallery = null;
  unsubPages = null;
  activePageId = null;
}

function route() {
  const h = location.hash || "";
  if (h.startsWith("#/character/") || h.startsWith("#/admin/character/")) {
    openCharacter().catch((e) => console.error("[character] open error", e));
  } else {
    closeCharacter();
  }
}

window.addEventListener("hashchange", route);
document.addEventListener("DOMContentLoaded", route);
