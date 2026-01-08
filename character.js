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
  serverTimestamp,
  updateDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

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

async function openCharacter() {
  if (!requireAuth()) return;

  const route = parseRoute();
  if (!route || !route.uid || !route.charId) return;

  const { uid, charId, mode } = route;

  const wrap = ensureUI();
  wrap.style.display = "block";

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

  if (unsubPages) unsubPages();
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
  if (unsubPages) unsubPages();
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
