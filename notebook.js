// notebook.js
import { auth, db } from "./firebase-config.js";
import { requireAuth } from "./auth.js";
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
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

function ensureStyles() {
  if (document.getElementById("nbStyles")) return;
  const s = document.createElement("style");
  s.id = "nbStyles";
  s.textContent = `
    .nbWrap{
      position:fixed;
      inset: 64px 0 0 0;
      z-index: 50;
      display:none;
      padding: 12px;
    }
    .nbWrap.is-open{ display:block; }

    .nbShell{
      height: calc(100vh - 64px - 24px);
      border-radius: 26px;
      background: rgba(255,255,255,.78);
      border: 1px solid rgba(23,23,23,.10);
      box-shadow: 0 22px 70px rgba(0,0,0,.10);
      backdrop-filter: blur(10px);
      overflow:hidden;
      display:grid;
      grid-template-columns: 340px 1fr;
    }

    .nbSide{
      background: rgba(255,255,255,.60);
      border-right: 1px solid rgba(23,23,23,.08);
      display:flex;
      flex-direction:column;
      min-width: 0;
    }

    .nbMain{
      background: rgba(255,255,255,.50);
      display:flex;
      flex-direction:column;
      min-width:0;
    }

    .nbTop{
      padding: 14px 16px;
      border-bottom: 1px solid rgba(23,23,23,.08);
      display:flex;
      align-items:center;
      gap:12px;
    }

    .nbTitle{
      font-family:"Vasek", ui-sans-serif;
      font-size: 20px;
      line-height: 1.1;
      letter-spacing: .2px;
    }
    .nbMuted{
      opacity:.65;
      font-size:12px;
      margin-top:3px;
    }

    .nbPill{
      margin-left:auto;
      display:flex;
      align-items:center;
      gap:8px;
      padding: 8px 10px;
      border-radius: 999px;
      border: 1px solid rgba(23,23,23,.14);
      background: rgba(255,255,255,.72);
      font-family: ui-sans-serif, system-ui;
      font-size: 12px;
      opacity:.9;
      white-space:nowrap;
    }
    .nbPill__dot{
      width:7px; height:7px; border-radius:999px;
      background: rgba(23,23,23,.35);
    }

    .nbClose{
      border: 1px solid rgba(23,23,23,.14);
      background: rgba(255,255,255,.65);
      border-radius: 14px;
      padding: 8px 10px;
      cursor:pointer;
      font-family:"Vasek", ui-sans-serif;
    }

    .nbSectionHead{
      padding: 14px 16px 10px;
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:10px;
    }
    .nbSectionLabel{
      font-family:"Vasek", ui-sans-serif;
      font-size: 14px;
      opacity:.85;
    }

    .nbBtnMini{
      border:1px solid rgba(23,23,23,.14);
      background: rgba(255,255,255,.72);
      border-radius: 14px;
      padding: 9px 11px;
      cursor:pointer;
      font-family:"Vasek", ui-sans-serif;
      white-space:nowrap;
    }
    .nbBtnMini:hover{ background: rgba(23,23,23,.03); }

    .nbBody{
      padding: 12px 16px 16px;
      overflow:auto;
    }

    .nbForm{
      display:grid;
      gap:8px;
      background: rgba(23,23,23,.035);
      border: 1px solid rgba(23,23,23,.09);
      border-radius: 18px;
      padding: 10px;
      margin: 0 16px 12px;
    }
    .nbInput, .nbTextarea{
      width:100%;
      padding: 10px 12px;
      border-radius: 14px;
      border:1px solid rgba(23,23,23,.12);
      background: rgba(255,255,255,.85);
      font-family: ui-sans-serif, system-ui;
      font-size:14px;
      outline:none;
    }
    .nbTextarea{ min-height: 70px; resize: vertical; }

    .nbBtnRow{
      display:flex;
      gap:8px;
      flex-wrap:wrap;
      justify-content:flex-end;
    }

    .charList{
      display:flex;
      flex-direction:column;
      gap:10px;
      padding: 0 16px 16px;
      overflow:auto;
    }

    .charItem{
      border-radius: 18px;
      border:1px solid rgba(23,23,23,.10);
      background: rgba(255,255,255,.70);
      padding: 12px;
      cursor:pointer;
      transition: transform .12s ease, box-shadow .12s ease, background .12s ease;
    }
    .charItem:hover{
      background: rgba(255,255,255,.82);
      transform: translateY(-1px);
      box-shadow: 0 14px 40px rgba(0,0,0,.10);
    }
    .charName{
      font-family:"Vasek", ui-sans-serif;
      font-size:16px;
      line-height:1.15;
    }
    .charAbout{
      opacity:.65;
      font-size:12px;
      margin-top:4px;
      line-height:1.35;
    }

    .nbEmpty{
      padding: 26px;
      margin: 16px;
      border-radius: 24px;
      border: 1px dashed rgba(23,23,23,.16);
      background: rgba(255,255,255,.62);
    }
    .nbEmpty__title{
      font-family:"Vasek", ui-sans-serif;
      font-size: 18px;
    }
    .nbEmpty__text{
      margin-top:8px;
      opacity:.7;
      line-height:1.45;
      font-size: 13px;
    }

    @media (max-width: 980px){
      .nbWrap{ padding: 10px; }
      .nbShell{
        grid-template-columns: 1fr;
        height: calc(100vh - 64px - 20px);
      }
      .nbSide{ border-right: 0; border-bottom: 1px solid rgba(23,23,23,.08); }
      .nbPill{ display:none; }
    }
  `;
  document.head.appendChild(s);
}

function ensureShell() {
  let wrap = document.getElementById("nbWrap");
  if (wrap) return wrap;

  wrap = document.createElement("div");
  wrap.className = "nbWrap";
  wrap.id = "nbWrap";

  wrap.innerHTML = `
    <div class="nbShell">
      <aside class="nbSide">
        <div class="nbTop">
          <div>
            <div class="nbTitle">Личный кабинет</div>
            <div class="nbMuted">Моя тетрадка: персонажи и страницы</div>
          </div>

          <div class="nbPill" id="nbUserPill" title="Аккаунт">
            <span class="nbPill__dot"></span>
            <span id="nbUserName">гость</span>
          </div>

          <button class="nbClose" id="nbCloseBtn" title="Закрыть">✕</button>
        </div>

        <div class="nbSectionHead">
          <div class="nbSectionLabel">Персонажи</div>
          <button class="nbBtnMini" id="nbNewCharBtn" type="button">+ добавить</button>
        </div>

        <div class="nbForm" id="nbNewCharForm" style="display:none;">
          <input class="nbInput" id="nbCharName" placeholder="Имя персонажа (например: ММ лучник)" />
          <textarea class="nbTextarea" id="nbCharAbout" placeholder="Коротко: кто он, где живёт, что любит/не любит"></textarea>
          <div class="nbBtnRow">
            <button class="nbBtnMini" id="nbCancelChar" type="button">отмена</button>
            <button class="nbBtnMini" id="nbCreateChar" type="button">создать</button>
          </div>
        </div>

        <div class="charList" id="nbCharList"></div>
      </aside>

      <main class="nbMain">
        <div class="nbTop">
          <div>
            <div class="nbTitle" id="nbRightTitle">Выберите персонажа</div>
            <div class="nbMuted" id="nbRightMuted">Или создайте нового — и начните историю</div>
          </div>
        </div>

        <div class="nbBody" id="nbRightBody">
          <div class="nbEmpty">
            <div class="nbEmpty__title">Здесь будет тетрадка персонажа</div>
            <div class="nbEmpty__text">
              Добавляйте страницы: заметки, файлы, рисунки.<br/>
              Удобно хранить весь “путь оживления идеи” в одном месте.
            </div>
          </div>
        </div>
      </main>
    </div>
  `;

  document.body.appendChild(wrap);

  wrap.querySelector("#nbCloseBtn").onclick = () => (location.hash = "#/");
  wrap.querySelector("#nbNewCharBtn").onclick = () => {
    const form = wrap.querySelector("#nbNewCharForm");
    form.style.display = form.style.display === "none" ? "" : "none";
  };
  wrap.querySelector("#nbCancelChar").onclick = () => {
    wrap.querySelector("#nbNewCharForm").style.display = "none";
  };

  // ✅ показываем имя пользователя в пилле
  const uname =
    window.APP_USER?.displayName ||
    auth.currentUser?.displayName ||
    "аккаунт";
  const elName = wrap.querySelector("#nbUserName");
  if (elName) elName.textContent = uname;

  return wrap;
}

function toggleMain(show) {
  const stage = document.getElementById("stage");
  const panel = document.getElementById("panel");
  if (stage) stage.style.display = show ? "" : "none";
  if (panel) panel.style.display = show ? "" : "none";
}

let unsubChars = null;

function mountCharacters() {
  const listEl = document.getElementById("nbCharList");
  const uid = auth.currentUser?.uid;
  if (!listEl || !uid) return;

  const q = query(
    collection(db, "users", uid, "characters"),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(q, (snap) => {
    listEl.innerHTML = "";

    if (snap.empty) {
      const empty = document.createElement("div");
      empty.className = "charItem";
      empty.style.cursor = "default";
      empty.innerHTML = `
        <div class="charName">Пока нет персонажей</div>
        <div class="charAbout">Нажмите «+ добавить», чтобы создать первого героя.</div>
      `;
      listEl.appendChild(empty);
      return;
    }

    snap.forEach((docSnap) => {
      const c = docSnap.data();
      const item = document.createElement("div");
      item.className = "charItem";
      item.innerHTML = `
        <div class="charName">${escapeHtml(c.name || "Без имени")}</div>
        <div class="charAbout">${escapeHtml(c.about || "")}</div>
      `;
      item.onclick = () => (location.hash = "#/character/" + docSnap.id);
      listEl.appendChild(item);
    });
  });
}

async function createCharacter() {
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  const name = document.getElementById("nbCharName").value.trim();
  const about = document.getElementById("nbCharAbout").value.trim();
  if (!name) {
    alert("Введите имя персонажа");
    return;
  }

  await addDoc(collection(db, "users", uid, "characters"), {
    name,
    about,
    createdAt: serverTimestamp(),
  });

  document.getElementById("nbCharName").value = "";
  document.getElementById("nbCharAbout").value = "";
  document.getElementById("nbNewCharForm").style.display = "none";
}

function openNotebook() {
  if (!requireAuth()) return;
  ensureStyles();
  ensureShell().classList.add("is-open");
  toggleMain(false);
  if (!unsubChars) unsubChars = mountCharacters();
}

function closeNotebook() {
  document.getElementById("nbWrap")?.classList.remove("is-open");
  toggleMain(true);
}

function route() {
  const hash = location.hash || "#/";
  if (hash.startsWith("#/notebook") || hash.startsWith("#/character/")) {
    openNotebook();
  } else {
    closeNotebook();
  }
}

window.addEventListener("hashchange", route);
document.addEventListener("DOMContentLoaded", () => {
  document.addEventListener("click", (e) => {
    if (e.target?.id === "nbCreateChar") createCharacter();
  });
  route();
});
