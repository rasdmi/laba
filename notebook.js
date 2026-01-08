// notebook.js
import { auth, db } from "./firebase-config.js";
import { requireAuth } from "./auth.js";
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

function ensureStyles(){
  if (document.getElementById("nbStyles")) return;
  const s = document.createElement("style");
  s.id = "nbStyles";
  s.textContent = `
    .nbWrap{ position: fixed; inset: 74px 0 0 0; z-index: 50; display:none; }
    .nbWrap.is-open{ display:block; }
    .nbLayout{ height:100%; display:grid; grid-template-columns: 380px 1fr; gap: 12px; padding: 12px; }
    .nbCard{ border-radius: 26px; background: rgba(255,255,255,.86); border:1px solid rgba(23,23,23,.12);
      box-shadow: 0 18px 50px rgba(0,0,0,.10); backdrop-filter: blur(10px); overflow:hidden; }
    .nbHead{ padding:14px 14px 10px; border-bottom: 1px solid rgba(23,23,23,.10); display:flex; gap:10px; align-items:flex-start; }
    .nbTitle{ font-family:"Vasek", ui-sans-serif; font-size:18px; line-height:1.1; }
    .nbMuted{ opacity:.65; font-size:12px; margin-top:3px; }
    .nbBody{ padding: 12px 14px 14px; }
    .nbBtnMini{ border:1px solid rgba(23,23,23,.16); background: rgba(255,255,255,.8); border-radius: 14px;
      padding: 10px 12px; cursor:pointer; font-family:"Vasek", ui-sans-serif; }
    .charList{ display:flex; flex-direction:column; gap:10px; padding: 12px 14px 14px; }
    .charItem{ border-radius: 18px; border:1px solid rgba(23,23,23,.12); background: rgba(255,255,255,.72); padding: 12px; cursor:pointer; }
    .charItem:hover{ background: rgba(23,23,23,.03); }
    .charName{ font-family:"Vasek", ui-sans-serif; font-size:16px; }
    .charAbout{ opacity:.65; font-size:12px; margin-top:4px; line-height:1.35; }
    .nbForm{ display:grid; gap:8px; background: rgba(23,23,23,.04); border:1px solid rgba(23,23,23,.10);
      border-radius: 18px; padding: 10px; margin-top: 10px; }
    .nbInput, .nbTextarea{ width:100%; padding: 10px 12px; border-radius: 14px; border:1px solid rgba(23,23,23,.14);
      background: rgba(255,255,255,.88); font-family: ui-sans-serif, system-ui; font-size:14px; outline:none; }
    .nbTextarea{ min-height: 76px; resize: vertical; }
    .nbSplit{ display:flex; align-items:center; justify-content:space-between; gap:10px; }
    .nbClose{ margin-left:auto; border:0; background:transparent; cursor:pointer; font-size:16px; opacity:.7; }
    @media (max-width: 980px){ .nbLayout{ grid-template-columns: 1fr; } }
  `;
  document.head.appendChild(s);
}

function ensureShell(){
  let wrap = document.getElementById("nbWrap");
  if (wrap) return wrap;

  wrap = document.createElement("div");
  wrap.className = "nbWrap";
  wrap.id = "nbWrap";
  wrap.innerHTML = `
    <div class="nbLayout">
      <section class="nbCard">
        <div class="nbHead">
          <div>
            <div class="nbTitle">Моя тетрадка</div>
            <div class="nbMuted">Персонажи и материалы</div>
          </div>
          <button class="nbClose" id="nbCloseBtn" title="Закрыть">✕</button>
        </div>
        <div class="nbBody">
          <div class="nbSplit">
            <div style="font-family:'Vasek',ui-sans-serif; font-size:14px; opacity:.85;">Персонажи</div>
            <button class="nbBtnMini" id="nbNewCharBtn" type="button">+ добавить</button>
          </div>

          <div class="nbForm" id="nbNewCharForm" style="display:none;">
            <input class="nbInput" id="nbCharName" placeholder="Имя персонажа (например: ММ лучник)" />
            <textarea class="nbTextarea" id="nbCharAbout" placeholder="Коротко: кто он, где живёт, что любит/не любит"></textarea>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <button class="nbBtnMini" id="nbCreateChar" type="button">создать</button>
              <button class="nbBtnMini" id="nbCancelChar" type="button">отмена</button>
            </div>
          </div>
        </div>
        <div class="charList" id="nbCharList"></div>
      </section>

      <section class="nbCard">
        <div class="nbHead">
          <div>
            <div class="nbTitle" id="nbRightTitle">Выберите персонажа</div>
            <div class="nbMuted" id="nbRightMuted">Или создайте нового</div>
          </div>
        </div>
        <div class="nbBody" id="nbRightBody">
          <div style="opacity:.7; line-height:1.45;">
            Нажмите на персонажа слева — откроется тетрадка: страницы, файлы, рисунки, комментарии.
          </div>
        </div>
      </section>
    </div>
  `;
  document.body.appendChild(wrap);

  wrap.querySelector("#nbCloseBtn").onclick = () => (location.hash = "#/");
  wrap.querySelector("#nbNewCharBtn").onclick = () => {
    const form = wrap.querySelector("#nbNewCharForm");
    form.style.display = form.style.display === "none" ? "" : "none";
  };
  wrap.querySelector("#nbCancelChar").onclick = () => { wrap.querySelector("#nbNewCharForm").style.display = "none"; };

  return wrap;
}

function toggleMain(show){
  const stage = document.getElementById("stage");
  const panel = document.getElementById("panel");
  if (stage) stage.style.display = show ? "" : "none";
  if (panel) panel.style.display = show ? "" : "none";
}

let unsubChars = null;

function updateUserPill(){
  const wrap = document.getElementById('nbWrap');
  const el = wrap?.querySelector('#nbUserName');
  if (!el) return;
  const uname = window.APP_USER?.displayName || auth.currentUser?.displayName || auth.currentUser?.email || 'аккаунт';
  el.textContent = uname;
}


function mountCharacters(){
  const listEl = document.getElementById("nbCharList");
  const uid = auth.currentUser?.uid;
  if (!listEl || !uid) return;

  const q = query(collection(db, "users", uid, "characters"), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    listEl.innerHTML = "";
    if (snap.empty){
      const empty = document.createElement("div");
      empty.style.cssText = "opacity:.6; padding: 0 14px 14px; font-size:13px; line-height:1.45;";
      empty.textContent = "Пока нет персонажей. Нажмите «+ добавить».";
      listEl.appendChild(empty);
      return;
    }
    snap.forEach((docSnap) => {
      const c = docSnap.data();
      const item = document.createElement("div");
      item.className = "charItem";
      item.innerHTML = `
        <div class="charName">${(c.name||"Без имени")}</div>
        <div class="charAbout">${(c.about||"")}</div>
      `;
      item.onclick = () => (location.hash = "#/character/" + docSnap.id);
      listEl.appendChild(item);
    });
  });
}

async function createCharacter(){
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  const name = document.getElementById("nbCharName").value.trim();
  const about = document.getElementById("nbCharAbout").value.trim();
  if (!name){ alert("Введите имя персонажа"); return; }

  await addDoc(collection(db, "users", uid, "characters"), { name, about, createdAt: serverTimestamp() });

  document.getElementById("nbCharName").value = "";
  document.getElementById("nbCharAbout").value = "";
  document.getElementById("nbNewCharForm").style.display = "none";
}

function openNotebook(){
  if (!requireAuth()) return;
  ensureStyles();
  ensureShell().classList.add("is-open");
  document.body.classList.add("overlay-open");
  updateUserPill();
  toggleMain(false);
  if (!unsubChars) unsubChars = mountCharacters();
}

function closeNotebook(){
  document.getElementById("nbWrap")?.classList.remove("is-open");
  toggleMain(true);
  document.body.classList.remove("overlay-open");
}

function route(){
  const hash = location.hash || "#/";
  if (hash.startsWith("#/notebook") || hash.startsWith("#/character/")){
    openNotebook();
  } else {
    closeNotebook();
  }
}

window.addEventListener("hashchange", route);
document.addEventListener("DOMContentLoaded", () => {
  document.addEventListener("click", (e) => { if (e.target?.id === "nbCreateChar") createCharacter(); });
  route();
});
