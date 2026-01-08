// character.js — “Notion inside” notebook with blocks (inline edit + drag reorder)
// + page folders/tags + admin pinned + readonly admin pages for users
// Works on Firestore (NO Storage, media via URLs).
import { auth, db } from "./firebase-config.js";
import { requireAuth } from "./auth.js";

import {
  doc, getDoc, updateDoc,
  collection, addDoc, deleteDoc,
  query, orderBy, onSnapshot,
  serverTimestamp, getDocs,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* ================= utils ================= */

function escapeHtml(s){
  return (s||"").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
}
function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

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
function mustBeAdminIfAdminRoute(route){
  if (route?.mode !== "admin") return true;
  if (window.APP_IS_ADMIN) return true;
  location.hash = "#/notebook";
  return false;
}
function charDocRef(uid, charId){
  return doc(db, "users", uid, "characters", charId);
}

function isImageUrl(url){
  return /\.(png|jpg|jpeg|webp|gif|avif)(\?.*)?$/i.test(url||"");
}
function isVideoFileUrl(url){
  return /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url||"");
}
function youtubeId(url){
  if (!url) return null;
  try{
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.replace("/","") || null;
    if (u.hostname.includes("youtube.com")) return u.searchParams.get("v") || null;
    return null;
  }catch{ return null; }
}
function vimeoId(url){
  if (!url) return null;
  try{
    const u = new URL(url);
    if (!u.hostname.includes("vimeo.com")) return null;
    const m = u.pathname.match(/\/(\d+)/);
    return m ? m[1] : null;
  }catch{ return null; }
}
function guessEmbedKind(url){
  if (!url) return "link";
  if (youtubeId(url)) return "youtube";
  if (vimeoId(url)) return "vimeo";
  if (isImageUrl(url)) return "image";
  if (isVideoFileUrl(url)) return "video";
  return "embed";
}
function parseTags(raw){
  return (raw||"")
    .split(",")
    .map(t=>t.trim())
    .filter(Boolean)
    .slice(0, 12);
}
function tagsToString(arr){
  return (arr||[]).join(", ");
}
function normalizeFolder(s){
  return (s||"").trim().slice(0, 40);
}

function debounce(fn, ms=350){
  let t=null;
  return (...args)=>{
    clearTimeout(t);
    t=setTimeout(()=>fn(...args), ms);
  };
}

/* ================= UI shell ================= */

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
      <div class="chHead">
        <div class="chTitle" id="chTitle">Персонаж</div>
        <div class="chSub" id="chSub"></div>
      </div>

      <div class="chTabs">
        <button class="chTab is-active" data-tab="notebook">тетрадка</button>
        <button class="chTab" data-tab="params">параметры</button>
        <button class="chTab" data-tab="inventory">инвентарь</button>
        <button class="chTab" data-tab="gallery">галерея</button>
        <button class="chTab" data-tab="master">от мастера</button>
        <button class="chTab" data-tab="game">в игру</button>
      </div>

      <div class="chActions">
        <button class="btn ghost" id="chCopyCode">код</button>
        <button class="btn" id="chClose">✕</button>
      </div>
    </div>

    <div class="chBody">
      <!-- NOTEBOOK -->
      <div class="chView is-active" data-view="notebook">
        <div class="nbGrid">
          <aside class="nbSide">
            <div class="nbSideTop">
              <div>
                <div class="nbSideTitle">Страницы</div>
                <div class="muted" id="pgHint" style="font-size:12px; margin-top:2px;"></div>
              </div>
              <button class="btn ghost" id="pgToggleNew">+ добавить</button>
            </div>

            <div class="pgNew" id="pgNew" style="display:none;">
              <input class="field" id="pgNewTitle" placeholder="Название страницы" />
              <input class="field" id="pgNewFolder" placeholder="Папка (например: идея / мир / рефы)" />
              <input class="field" id="pgNewTags" placeholder="Теги через запятую (например: лук, король)" />
              <div class="miniRow" style="justify-content:space-between;">
                <button class="btn ghost" id="pgNewCancel">отмена</button>
                <button class="btn" id="pgNewCreate">создать</button>
              </div>
            </div>

            <div class="pgFilters">
              <input class="field" id="pgSearch" placeholder="Поиск по страницам…" />
              <input class="field" id="pgTagFilter" placeholder="Фильтр по тегу (один)" />
            </div>

            <div id="pgList"></div>
          </aside>

          <main class="nbMain">
            <div id="pgBody" class="nbPad">
              <div class="muted">Выберите страницу слева</div>
            </div>
          </main>
        </div>
      </div>

      <!-- PARAMS -->
      <div class="chView" data-view="params">
        <div class="pane">
          <div class="paneRow">
            <div class="paneCard">
              <div class="paneH">Паспорт</div>
              <label class="lbl">Описание</label>
              <textarea class="field" id="pDesc" placeholder="Кто он, где живёт, что любит/не любит"></textarea>

              <label class="lbl">Желания / идеи участника</label>
              <textarea class="field" id="pWants" placeholder="Что хочется сделать? куда развить?"></textarea>

              <div class="miniRow">
                <button class="btn ghost" id="pReset">сброс</button>
                <button class="btn" id="pSave">сохранить</button>
              </div>
            </div>

            <div class="paneCard">
              <div class="paneH">Аватар</div>
              <div class="avaBox">
                <div class="ava" id="pAvaPreview">🙂</div>
                <div class="avaMeta">
                  <div class="muted">Аватар закрепляет мастер (админ)</div>
                  <input class="field" id="pAvaUrl" placeholder="URL картинки (админ)" />
                  <div class="miniRow">
                    <button class="btn ghost" id="pAvaClear">очистить</button>
                    <button class="btn" id="pAvaSet">закрепить</button>
                  </div>
                </div>
              </div>
              <div class="muted" style="margin-top:10px;">*Пользователь видит, но не меняет (MVP).</div>
            </div>
          </div>

          <div class="paneCard">
            <div class="paneH">Способности</div>
            <div class="grid2">
              <div>
                <label class="lbl">Сила</label>
                <input class="field" id="sPower" type="number" min="0" max="100" />
              </div>
              <div>
                <label class="lbl">Ловкость</label>
                <input class="field" id="sAgility" type="number" min="0" max="100" />
              </div>
              <div>
                <label class="lbl">Магия</label>
                <input class="field" id="sMagic" type="number" min="0" max="100" />
              </div>
              <div>
                <label class="lbl">Харизма</label>
                <input class="field" id="sCharm" type="number" min="0" max="100" />
              </div>
            </div>
            <div class="miniRow">
              <button class="btn" id="sSave">сохранить способности</button>
            </div>
          </div>
        </div>
      </div>

      <!-- INVENTORY -->
      <div class="chView" data-view="inventory">
        <div class="pane">
          <div class="paneCard">
            <div class="paneH">Инвентарь</div>
            <div class="muted">Добавляйте предметы.</div>

            <div class="invRow">
              <input class="field" id="invName" placeholder="предмет (например: меч Арагорна)" />
              <button class="btn" id="invAdd">добавить</button>
            </div>

            <div id="invList" class="invList"></div>
          </div>
        </div>
      </div>

      <!-- GALLERY -->
      <div class="chView" data-view="gallery">
        <div class="pane">
          <div class="paneCard">
            <div class="paneH">Галерея (свободные карточки)</div>
            <div class="muted">URL → карточка, можно двигать и удалять.</div>
            <div class="galRow">
              <input class="field" id="gUrl" placeholder="URL (картинка / YouTube / Vimeo / embed)" />
              <button class="btn" id="gAdd">+ добавить</button>
            </div>
          </div>
          <div class="paneCard">
            <div id="galStage" class="galStage"></div>
          </div>
        </div>
      </div>

      <!-- MASTER -->
      <div class="chView" data-view="master">
        <div class="pane">
          <div class="paneCard">
            <div class="paneH">Материалы от мастера</div>
            <div class="muted">Админ добавляет карточки с превью (image/video/embed).</div>

            <div class="assetRow">
              <input class="field" id="aTitle" placeholder="название" />
              <select class="field" id="aType">
                <option value="auto">auto</option>
                <option value="image">image</option>
                <option value="video">video</option>
                <option value="embed">embed</option>
              </select>
              <input class="field" id="aUrl" placeholder="URL" />
              <button class="btn" id="aAdd">добавить</button>
            </div>

            <div id="assetList" class="assetList"></div>
          </div>
        </div>
      </div>

      <!-- GAME -->
      <div class="chView" data-view="game">
        <div class="pane">
          <div class="paneCard">
            <div class="paneH">В игру</div>
            <div class="muted">Персонаж закрепляется за локацией и сохраняет состояние.</div>

            <div class="gameBox">
              <div>
                <div class="muted">Текущая локация</div>
                <div class="gameLoc" id="gLocName">—</div>
                <div class="muted" id="gLocDesc"></div>
              </div>

              <div class="miniRow">
                <button class="btn ghost" id="gRefresh">обновить</button>
                <button class="btn" id="gJoin">в игру (рандом)</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <style>
      .btn{
        border:1px solid rgba(23,23,23,.14);
        background: rgba(255,255,255,.78);
        border-radius: 14px;
        padding: 9px 11px;
        cursor:pointer;
        font-family:"Vasek", ui-sans-serif;
        white-space:nowrap;
      }
      .btn.ghost{ background: rgba(255,255,255,.55); opacity:.9; }
      .btn:disabled{ opacity:.45; cursor:not-allowed; }

      .chTop{
        display:flex; align-items:flex-start; gap:12px;
        padding: 12px 14px;
        border-bottom:1px solid rgba(23,23,23,.08);
      }
      .chHead{ min-width: 180px; }
      .chTitle{ font-family:'Vasek',ui-sans-serif; font-size:20px; line-height:1.1; }
      .chSub{ opacity:.6; font-size:12px; margin-top:3px; }

      .chTabs{
        display:flex; gap:8px; flex-wrap:wrap;
        padding-top:2px;
        flex: 1 1 auto;
      }
      .chTab{
        border:1px solid rgba(23,23,23,.14);
        background: rgba(255,255,255,.78);
        border-radius: 999px;
        padding: 8px 10px;
        cursor:pointer;
        font-family:'Vasek', ui-sans-serif;
        font-size: 14px;
        opacity:.85;
      }
      .chTab.is-active{ background: rgba(23,23,23,.06); opacity:1; }
      .chActions{ display:flex; gap:10px; margin-left:auto; }

      .chBody{ height: calc(100% - 60px); min-height:0; overflow:hidden; }
      .chView{ display:none; height:100%; }
      .chView.is-active{ display:block; }

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
      textarea.field{ min-height: 110px; resize: vertical; }
      .muted{ opacity:.6; }
      .miniRow{ display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; margin-top:10px; }

      /* Notebook layout */
      .nbGrid{ height:100%; display:grid; grid-template-columns: 320px 1fr; min-height:0; }
      .nbSide{
        border-right:1px solid rgba(23,23,23,.08);
        overflow:auto;
        padding: 12px;
        min-height:0;
      }
      .nbSideTop{ display:flex; align-items:flex-start; justify-content:space-between; gap:10px; margin-bottom:10px; }
      .nbSideTitle{ font-family:'Vasek',ui-sans-serif; font-size:14px; opacity:.85; }
      .nbMain{ overflow:auto; min-height:0; }
      .nbPad{ padding: 14px 16px; }

      .pgNew{
        background: rgba(23,23,23,.035);
        border: 1px solid rgba(23,23,23,.09);
        border-radius: 18px;
        padding: 10px;
        display:grid;
        gap:8px;
        margin-bottom:10px;
      }
      .pgFilters{ display:grid; gap:8px; margin-bottom:10px; }

      .pgGroupTitle{
        font-family:'Vasek',ui-sans-serif;
        font-size:13px;
        opacity:.75;
        margin: 12px 2px 6px;
        display:flex; align-items:center; gap:8px;
      }
      .pinDot{ width:8px; height:8px; border-radius:99px; background: rgba(23,23,23,.25); }

      .pgItem{
        margin-top:8px; padding:10px 10px;
        cursor:pointer;
        border-radius:14px;
        border:1px solid rgba(23,23,23,.10);
        background: rgba(255,255,255,.68);
      }
      .pgItem:hover{ background: rgba(255,255,255,.82); }
      .pgItem.is-active{ outline:2px solid rgba(23,23,23,.18); background: rgba(255,255,255,.86); }
      .pgTitle{ font-family:'Vasek',ui-sans-serif; font-size:14px; line-height:1.15; }
      .pgMeta{ opacity:.55; font-size:11px; margin-top:4px; line-height:1.35; }
      .pgMeta .tag{ display:inline-block; padding:2px 6px; border:1px solid rgba(23,23,23,.12); border-radius:999px; margin-right:4px; background: rgba(255,255,255,.65); }

      /* Block editor */
      .blkTopRow{ display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; align-items:flex-start; }
      .blkTitle{ font-family:'Vasek',ui-sans-serif; font-size:18px; line-height:1.15; }
      .blkTools{ display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
      .blkSubRow{ margin-top:10px; display:grid; grid-template-columns: 1fr 1fr; gap:10px; }
      .blkAddRow{ margin-top:12px; display:grid; grid-template-columns: 150px 1fr auto; gap:10px; }
      .blkList{ margin-top:12px; display:grid; gap:10px; }
      .blkCard{
        border:1px solid rgba(23,23,23,.10);
        background: rgba(255,255,255,.70);
        border-radius:16px;
        padding:10px;
      }
      .blkCard[draggable="true"]{ cursor: grab; }
      .blkCard.dragging{ opacity:.55; }
      .blkCard.dropTarget{ outline:2px dashed rgba(23,23,23,.18); }

      .blkRow{ display:flex; justify-content:space-between; gap:10px; align-items:flex-start; flex-wrap:wrap; margin-bottom:8px; }
      .blkMeta{ opacity:.55; font-size:12px; }
      .blkActions{ display:flex; gap:8px; flex-wrap:wrap; align-items:center; }

      .blkTextView{ font-size:14px; line-height:1.5; white-space:pre-wrap; }
      .blkTextEdit{ min-height: 90px; }
      .blkImg{ width:100%; display:block; border-radius:14px; border:1px solid rgba(23,23,23,.10); }
      .blkVid{ width:100%; display:block; border-radius:14px; border:1px solid rgba(23,23,23,.10); background: rgba(0,0,0,.04); }
      .blkFrame{ border-radius:14px; overflow:hidden; border:1px solid rgba(23,23,23,.10); background: rgba(255,255,255,.65); }
      .blkFrame iframe{ width:100%; height:320px; border:0; display:block; background: rgba(0,0,0,.02); }

      .blkCheck{ display:flex; gap:10px; align-items:flex-start; }
      .blkCheck .box{
        width:18px; height:18px; border-radius:6px;
        border:1px solid rgba(23,23,23,.18);
        background: rgba(255,255,255,.75);
        display:grid; place-items:center;
        font-size:12px; margin-top:2px; flex:0 0 auto;
      }
      .blkCheck.is-done{ opacity:.65; text-decoration: line-through; }

      /* Other tabs */
      .pane{ padding: 14px 16px; height:100%; overflow:auto; }
      .paneRow{ display:grid; grid-template-columns: 1.2fr .8fr; gap:12px; }
      .paneCard{
        border-radius: 22px;
        background: rgba(255,255,255,.70);
        border: 1px solid rgba(23,23,23,.10);
        padding: 12px;
      }
      .paneH{ font-family:'Vasek',ui-sans-serif; font-size:16px; margin-bottom:8px; }
      .lbl{ display:block; font-size:12px; opacity:.65; margin-top:10px; margin-bottom:6px; }

      .avaBox{ display:flex; gap:12px; align-items:flex-start; }
      .ava{
        width:80px; height:80px; border-radius:22px;
        border: 1px solid rgba(23,23,23,.12);
        background: rgba(23,23,23,.04);
        display:grid; place-items:center;
        overflow:hidden;
      }
      .ava img{ width:100%; height:100%; object-fit:cover; }
      .avaMeta{ flex:1; }
      .grid2{ display:grid; grid-template-columns: repeat(2, 1fr); gap:10px; }

      .invRow{ display:flex; gap:10px; margin-top:12px; flex-wrap:wrap; }
      .invRow .field{ flex: 1 1 260px; }
      .invList{ margin-top:12px; display:grid; gap:10px; }
      .invItem{
        display:flex; align-items:center; justify-content:space-between; gap:10px;
        padding:10px 12px;
        border-radius:16px;
        border:1px solid rgba(23,23,23,.10);
        background: rgba(255,255,255,.70);
      }
      .invItem b{ font-family:'Vasek',ui-sans-serif; font-weight:400; }

      .galRow{ display:flex; gap:10px; flex-wrap:wrap; }
      .galRow .field{ flex: 1 1 320px; }
      .galStage{
        position:relative;
        min-height: 520px;
        border-radius: 20px;
        border:1px dashed rgba(23,23,23,.16);
        background: rgba(255,255,255,.55);
        overflow:hidden;
      }
      .galCard{
        position:absolute;
        width: 240px;
        border-radius: 18px;
        border:1px solid rgba(23,23,23,.12);
        background: rgba(255,255,255,.78);
        box-shadow: 0 10px 26px rgba(0,0,0,.10);
        cursor: grab;
        user-select:none;
        overflow:hidden;
      }
      .galCard:active{ cursor: grabbing; }
      .galCardBar{
        display:flex; gap:8px; justify-content:space-between; align-items:center;
        padding: 8px 10px;
        font-size: 12px; opacity:.75;
        border-top:1px solid rgba(23,23,23,.08);
        background: rgba(255,255,255,.65);
      }
      .xBtn{
        border:1px solid rgba(23,23,23,.14);
        background: rgba(255,255,255,.78);
        border-radius: 12px;
        padding: 6px 8px;
        cursor:pointer;
        font-family:'Vasek',ui-sans-serif;
      }
      .gMedia{ width:100%; height:150px; display:block; background: rgba(0,0,0,.03); }
      .gMedia img{ width:100%; height:150px; object-fit:cover; display:block; }
      .gMedia video{ width:100%; height:150px; object-fit:cover; display:block; }
      .gMedia iframe{ width:100%; height:150px; border:0; display:block; background: rgba(0,0,0,.03); }

      .assetRow{
        display:grid;
        grid-template-columns: 1fr 130px 1fr auto;
        gap:10px;
        margin-top:10px;
      }
      .assetList{ margin-top:12px; display:grid; gap:12px; }
      .assetCard{
        padding:12px;
        border-radius:18px;
        border:1px solid rgba(23,23,23,.10);
        background: rgba(255,255,255,.72);
      }
      .assetTop{
        display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;
      }
      .assetTop b{ font-family:'Vasek',ui-sans-serif; font-weight:400; font-size:16px; }
      .assetMeta{ opacity:.6; font-size:12px; margin-top:4px; }
      .assetActions{ display:flex; gap:8px; flex-wrap:wrap; }
      .aFrame{
        margin-top:10px;
        border-radius:16px;
        overflow:hidden;
        border:1px solid rgba(23,23,23,.10);
        background: rgba(255,255,255,.65);
      }
      .aFrame iframe{ width:100%; height: 360px; border:0; display:block; background: rgba(0,0,0,.02); }
      .aMediaImg{
        width:100%;
        display:block;
        border-radius:16px;
        border:1px solid rgba(23,23,23,.10);
        margin-top:10px;
      }
      .aMediaVid{
        width:100%;
        display:block;
        border-radius:16px;
        border:1px solid rgba(23,23,23,.10);
        margin-top:10px;
        background: rgba(0,0,0,.03);
      }

      .gameBox{
        display:flex; align-items:flex-start; justify-content:space-between; gap:16px; flex-wrap:wrap;
        margin-top:10px;
        padding: 12px;
        border-radius: 18px;
        border:1px solid rgba(23,23,23,.10);
        background: rgba(255,255,255,.70);
      }
      .gameLoc{ font-family:'Vasek',ui-sans-serif; font-size:18px; margin-top:4px; }

      @media (max-width: 980px){
        #charOverlay{ inset:74px 10px 10px 10px; }
        .chTop{ flex-direction:column; align-items:stretch; gap:10px; }
        .chActions{ margin-left:0; justify-content:flex-end; }

        .nbGrid{ grid-template-columns: 1fr; }
        .nbSide{ border-right:0; border-bottom:1px solid rgba(23,23,23,.08); }
        .paneRow{ grid-template-columns: 1fr; }
        .assetRow{ grid-template-columns: 1fr; }
        .galStage{ min-height: 420px; }
        .blkAddRow{ grid-template-columns: 1fr; }
        .blkSubRow{ grid-template-columns: 1fr; }
        .blkFrame iframe{ height:240px; }
        .aFrame iframe{ height:260px; }
      }
    </style>
  `;

  document.body.appendChild(el);

  el.querySelector("#chClose").onclick = () => (location.hash = "#/notebook");
  el.querySelectorAll(".chTab").forEach(btn => btn.onclick = () => setActiveTab(btn.dataset.tab));

  return el;
}

function setActiveTab(tab){
  const el = ensureUI();
  el.querySelectorAll(".chTab").forEach(b => b.classList.toggle("is-active", b.dataset.tab === tab));
  el.querySelectorAll(".chView").forEach(v => v.classList.toggle("is-active", v.dataset.view === tab));
}

/* ================= Notebook: pages + blocks ================= */

let unsubPages = null;
let unsubBlocks = null;
let activePageId = null;
let activePageData = null;

function isReadonlyForUser(routeMode, pageOrigin){
  return routeMode !== "admin" && pageOrigin === "admin";
}
function canUserDeleteBlock(routeMode, blockOrigin){
  // user can't delete admin blocks
  return routeMode === "admin" || blockOrigin !== "admin";
}

function renderBlockContent(b){
  const t = b.type;
  const v = b.value || "";

  if (t === "text"){
    return `<div class="blkTextView">${escapeHtml(v)}</div>`;
  }
  if (t === "image"){
    return `<img class="blkImg" src="${escapeHtml(v)}" alt="">`;
  }
  if (t === "video"){
    const y = youtubeId(v);
    const vm = vimeoId(v);
    if (y) return `<div class="blkFrame"><iframe src="https://www.youtube.com/embed/${escapeHtml(y)}" allowfullscreen></iframe></div>`;
    if (vm) return `<div class="blkFrame"><iframe src="https://player.vimeo.com/video/${escapeHtml(vm)}" allowfullscreen></iframe></div>`;
    if (isVideoFileUrl(v)) return `<video class="blkVid" src="${escapeHtml(v)}" controls playsinline></video>`;
    return `<div class="blkFrame"><iframe src="${escapeHtml(v)}"></iframe></div>`;
  }
  if (t === "embed"){
    return `<div class="blkFrame"><iframe src="${escapeHtml(v)}"></iframe></div>`;
  }
  if (t === "check"){
    const done = !!b.done;
    return `<div class="blkCheck ${done ? "is-done":""}"><span class="box">${done?"✓":""}</span><span>${escapeHtml(v)}</span></div>`;
  }
  return `<div class="blkTextView">${escapeHtml(v)}</div>`;
}

function mountNotebook(route){
  const el = ensureUI();
  const { uid, charId, mode } = route;

  const listEl = el.querySelector("#pgList");
  const bodyEl = el.querySelector("#pgBody");

  const toggleNew = el.querySelector("#pgToggleNew");
  const pgNew = el.querySelector("#pgNew");
  const pgNewTitle = el.querySelector("#pgNewTitle");
  const pgNewFolder = el.querySelector("#pgNewFolder");
  const pgNewTags = el.querySelector("#pgNewTags");
  const pgNewCancel = el.querySelector("#pgNewCancel");
  const pgNewCreate = el.querySelector("#pgNewCreate");

  const pgSearch = el.querySelector("#pgSearch");
  const pgTagFilter = el.querySelector("#pgTagFilter");
  const pgHint = el.querySelector("#pgHint");

  toggleNew.onclick = ()=>{
    const open = pgNew.style.display !== "none";
    pgNew.style.display = open ? "none" : "";
    if (!open) setTimeout(()=>pgNewTitle.focus(), 20);
  };
  pgNewCancel.onclick = ()=>{
    pgNew.style.display = "none";
    pgNewTitle.value = ""; pgNewFolder.value = ""; pgNewTags.value = "";
  };

  pgNewCreate.onclick = async ()=>{
    const title = (pgNewTitle.value||"").trim();
    if (!title) { alert("Введите название"); return; }

    const folder = normalizeFolder(pgNewFolder.value);
    const tags = parseTags(pgNewTags.value);

    await addDoc(collection(db, "users", uid, "characters", charId, "pages"), {
      title,
      folder,
      tags,
      pinned: false,
      origin: mode === "admin" ? "admin" : "user",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    pgNew.style.display = "none";
    pgNewTitle.value = ""; pgNewFolder.value = ""; pgNewTags.value = "";
  };

  // search/filter re-render trigger
  const rerenderSignal = { v: 0 };
  const bumpRender = ()=>{ rerenderSignal.v++; /* noop: triggers closure read */ };

  pgSearch.oninput = bumpRender;
  pgTagFilter.oninput = bumpRender;

  // pages subscription
  if (unsubPages) unsubPages();
  unsubPages = onSnapshot(
    query(collection(db, "users", uid, "characters", charId, "pages"), orderBy("createdAt","asc")),
    (snap)=>{
      const pages = snap.docs.map(d => ({ id:d.id, ...d.data() }));

      const search = (pgSearch.value||"").trim().toLowerCase();
      const tagNeed = (pgTagFilter.value||"").trim().toLowerCase();

      const filtered = pages.filter(p=>{
        const inSearch =
          !search ||
          (p.title||"").toLowerCase().includes(search) ||
          (p.folder||"").toLowerCase().includes(search) ||
          (tagsToString(p.tags)||"").toLowerCase().includes(search);

        const inTag =
          !tagNeed ||
          (p.tags||[]).some(t => (t||"").toLowerCase() === tagNeed);

        return inSearch && inTag;
      });

      // hint
      const total = pages.length;
      const shown = filtered.length;
      pgHint.textContent = tagNeed || search ? `Показано ${shown} из ${total}` : `${total} страниц`;

      // group: pinned first, then folders
      const pinned = filtered
        .filter(p => !!p.pinned)
        .sort((a,b)=> (a.origin === b.origin ? 0 : (a.origin === "admin" ? -1 : 1)));

      const byFolder = new Map();
      filtered.filter(p=>!p.pinned).forEach(p=>{
        const f = (p.folder||"").trim() || "без папки";
        if (!byFolder.has(f)) byFolder.set(f, []);
        byFolder.get(f).push(p);
      });

      // render list
      listEl.innerHTML = "";

      const renderPageItem = (p)=>{
        const item = document.createElement("div");
        item.className = "pgItem" + (p.id === activePageId ? " is-active" : "");
        const lock = (p.origin === "admin") ? "🔒 " : "";
        const pin = (p.pinned) ? "📌 " : "";
        const tags = (p.tags||[]).slice(0, 6).map(t=>`<span class="tag">${escapeHtml(t)}</span>`).join("");

        item.innerHTML = `
          <div class="pgTitle">${pin}${lock}${escapeHtml(p.title||"")}</div>
          <div class="pgMeta">
            <span>${escapeHtml(p.folder||"")}</span>
            ${tags ? `<div style="margin-top:6px;">${tags}</div>` : ""}
          </div>
        `;
        item.onclick = ()=> openPage(p);
        return item;
      };

      if (!filtered.length){
        listEl.innerHTML = `<div class="muted" style="padding:8px 2px;">Ничего не найдено.</div>`;
      } else {
        if (pinned.length){
          const h = document.createElement("div");
          h.className = "pgGroupTitle";
          h.innerHTML = `<span class="pinDot"></span> закреплённые`;
          listEl.appendChild(h);
          pinned.forEach(p=> listEl.appendChild(renderPageItem(p)));
        }

        // folder groups sorted
        const folders = [...byFolder.keys()].sort((a,b)=>a.localeCompare(b));
        folders.forEach(f=>{
          const h = document.createElement("div");
          h.className = "pgGroupTitle";
          h.textContent = f;
          listEl.appendChild(h);
          byFolder.get(f).forEach(p=> listEl.appendChild(renderPageItem(p)));
        });
      }

      // auto-open first if none
      if (!activePageId && filtered.length){
        openPage(filtered[0]);
      }
      // if active page disappeared from filter, close
      if (activePageId && !filtered.some(p=>p.id === activePageId)){
        activePageId = null;
        activePageData = null;
        bodyEl.innerHTML = `<div class="muted">Выберите страницу слева</div>`;
        if (unsubBlocks) unsubBlocks(); unsubBlocks = null;
      }
    }
  );

  async function openPage(p){
    activePageId = p.id;
    activePageData = p;

    // highlight active
    [...listEl.querySelectorAll(".pgItem")].forEach(x=>x.classList.remove("is-active"));
    // best effort: add class to matching item by title + id stored nowhere; simplest: re-render list causes active class.

    const readonly = isReadonlyForUser(mode, p.origin);
    const editablePageMeta = (mode === "admin") || (!readonly); // user can edit own page meta

    bodyEl.innerHTML = `
      <div class="blkTopRow">
        <div>
          <div class="blkTitle">${escapeHtml(p.title||"")}</div>
          <div class="blkMeta">
            ${p.origin === "admin" ? "страница от мастера (readonly для участника)" : "страница участника"}
            ${p.pinned ? " • закреплена" : ""}
          </div>
        </div>

        <div class="blkTools">
          <button class="btn ghost" id="pgMetaToggle">настройки</button>
          <button class="btn ghost" id="pgDelete" ${readonly ? "disabled":""}>удалить</button>
        </div>
      </div>

      <div id="pgMetaBox" style="display:none;">
        <div class="blkSubRow">
          <div>
            <div class="muted" style="font-size:12px; margin:6px 0;">Папка</div>
            <input class="field" id="pgFolderEdit" value="${escapeHtml(p.folder||"")}" ${editablePageMeta ? "" : "disabled"} />
          </div>
          <div>
            <div class="muted" style="font-size:12px; margin:6px 0;">Теги (через запятую)</div>
            <input class="field" id="pgTagsEdit" value="${escapeHtml(tagsToString(p.tags||[]))}" ${editablePageMeta ? "" : "disabled"} />
          </div>
        </div>

        <div class="miniRow" style="justify-content:space-between;">
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn ghost" id="pgRename" ${editablePageMeta ? "" : "disabled"}>переименовать</button>
            <button class="btn ghost" id="pgPin" ${mode === "admin" ? "" : "disabled"}>
              ${p.pinned ? "снять закреп" : "закрепить"}
            </button>
          </div>
          <button class="btn" id="pgMetaSave" ${editablePageMeta ? "" : "disabled"}>сохранить настройки</button>
        </div>

        ${readonly ? `<div class="muted" style="font-size:12px; margin-top:8px;">
          Участник не редактирует страницы мастера. Можно создавать свои страницы и дополнять ими историю.
        </div>` : ``}
      </div>

      <div class="blkAddRow">
        <select class="field" id="blkType" ${readonly ? "disabled":""}>
          <option value="text">text</option>
          <option value="image">image (url)</option>
          <option value="video">video (url)</option>
          <option value="embed">embed (url)</option>
          <option value="check">check</option>
        </select>
        <input class="field" id="blkValue" ${readonly ? "disabled":""} placeholder="Текст или URL" />
        <button class="btn" id="blkAdd" ${readonly ? "disabled":""}>+ блок</button>
      </div>

      <div class="muted" style="font-size:12px; margin-top:8px;">
        Перетаскивай блоки мышкой, чтобы менять порядок. Редактируй прямо в карточке (без pop-up).
      </div>

      <div class="blkList" id="blkList"></div>
    `;

    // meta UI
    const metaToggle = bodyEl.querySelector("#pgMetaToggle");
    const metaBox = bodyEl.querySelector("#pgMetaBox");
    metaToggle.onclick = ()=>{
      metaBox.style.display = metaBox.style.display === "none" ? "" : "none";
    };

    const pgDelete = bodyEl.querySelector("#pgDelete");
    pgDelete.onclick = async ()=>{
      if (readonly) return;
      if (!confirm("Удалить страницу?")) return;
      await deleteDoc(doc(db, "users", uid, "characters", charId, "pages", p.id));
      activePageId = null;
      activePageData = null;
      if (unsubBlocks) unsubBlocks(); unsubBlocks = null;
      bodyEl.innerHTML = `<div class="muted">Страница удалена.</div>`;
    };

    const pgRename = bodyEl.querySelector("#pgRename");
    pgRename.onclick = async ()=>{
      if (!editablePageMeta) return;
      const nt = prompt("Новое название", p.title || "");
      if (!nt) return;
      await updateDoc(doc(db, "users", uid, "characters", charId, "pages", p.id), {
        title: nt,
        updatedAt: serverTimestamp(),
      });
    };

    const pgPin = bodyEl.querySelector("#pgPin");
    pgPin.onclick = async ()=>{
      if (mode !== "admin") return;
      await updateDoc(doc(db, "users", uid, "characters", charId, "pages", p.id), {
        pinned: !p.pinned,
        updatedAt: serverTimestamp(),
      });
    };

    const folderEdit = bodyEl.querySelector("#pgFolderEdit");
    const tagsEdit = bodyEl.querySelector("#pgTagsEdit");
    const pgMetaSave = bodyEl.querySelector("#pgMetaSave");
    pgMetaSave.onclick = async ()=>{
      if (!editablePageMeta) return;
      await updateDoc(doc(db, "users", uid, "characters", charId, "pages", p.id), {
        folder: normalizeFolder(folderEdit.value),
        tags: parseTags(tagsEdit.value),
        updatedAt: serverTimestamp(),
      });
      const b = pgMetaSave;
      b.textContent = "сохранено ✓";
      setTimeout(()=>b.textContent="сохранить настройки", 800);
    };

    // blocks add
    const blkType = bodyEl.querySelector("#blkType");
    const blkValue = bodyEl.querySelector("#blkValue");
    const blkAdd = bodyEl.querySelector("#blkAdd");

    blkAdd.onclick = async ()=>{
      if (readonly) return;
      const type = blkType.value;
      const value = (blkValue.value||"").trim();
      if (type !== "check" && !value) return;
      if (type === "check" && !value){ alert("Введите текст пункта"); return; }

      await addDoc(collection(db, "users", uid, "characters", charId, "pages", p.id, "blocks"), {
        type,
        value,
        done: false,
        order: Date.now(),
        origin: mode === "admin" ? "admin" : "user",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      blkValue.value = "";
    };

    // subscribe blocks
    if (unsubBlocks) unsubBlocks();
    unsubBlocks = onSnapshot(
      query(collection(db, "users", uid, "characters", charId, "pages", p.id, "blocks"), orderBy("order","asc")),
      (snap)=>{
        const blocks = snap.docs.map(d => ({ id:d.id, ...d.data() }));
        renderBlocks(blocks, { uid, charId, pageId: p.id, mode, readonly }, bodyEl.querySelector("#blkList"));
      }
    );
  }

  function renderBlocks(blocks, ctx, list){
    list.innerHTML = "";
    if (!blocks.length){
      list.innerHTML = `<div class="muted">Пока нет блоков. Добавь первый.</div>`;
      return;
    }

    const isAdminMode = ctx.mode === "admin";

    // drag reorder state
    let dragId = null;

    const commitReorder = async (newOrderIds)=>{
      // write new "order" for all blocks (small batch, ok for MVP)
      const batch = writeBatch(db);
      const base = 1000;
      newOrderIds.forEach((id, i)=>{
        const ref = doc(db, "users", ctx.uid, "characters", ctx.charId, "pages", ctx.pageId, "blocks", id);
        batch.update(ref, { order: base + i*1000, updatedAt: serverTimestamp() });
      });
      await batch.commit();
    };

    // inline save (debounced per block)
    const saveValueDebounced = new Map();
    const getSaver = (blockId)=>{
      if (saveValueDebounced.has(blockId)) return saveValueDebounced.get(blockId);
      const fn = debounce(async (nextValue, extra={})=>{
        const ref = doc(db, "users", ctx.uid, "characters", ctx.charId, "pages", ctx.pageId, "blocks", blockId);
        await updateDoc(ref, { value: nextValue, ...extra, updatedAt: serverTimestamp() });
      }, 450);
      saveValueDebounced.set(blockId, fn);
      return fn;
    };

    blocks.forEach((b, idx)=>{
      const card = document.createElement("div");
      const readonlyBlock = ctx.readonly || (!isAdminMode && b.origin === "admin"); // user can't edit admin blocks
      const canDelete = canUserDeleteBlock(ctx.mode, b.origin) && !ctx.readonly;
      const canEdit = !readonlyBlock;

      card.className = "blkCard";
      card.dataset.id = b.id;
      card.draggable = !ctx.readonly; // user can reorder within own pages, but not in readonly page
      if (ctx.readonly) card.draggable = false;

      card.innerHTML = `
        <div class="blkRow">
          <div class="blkMeta">${escapeHtml(b.type)} • ${escapeHtml(b.origin||"")}${readonlyBlock ? " • readonly" : ""}</div>
          <div class="blkActions">
            ${b.type === "check" ? `<button class="btn ghost" data-act="toggle">${b.done ? "снять" : "готово"}</button>` : ""}
            <button class="btn ghost" data-act="del" ${canDelete ? "" : "disabled"}>удалить</button>
          </div>
        </div>

        <div class="blkContent" data-kind="${escapeHtml(b.type)}"></div>

        <div class="muted" style="font-size:11px; margin-top:8px;">
          ${ctx.readonly ? "Страница readonly: блоки нельзя менять." : "Редактируй прямо здесь. Перетащи блок, чтобы поменять порядок."}
        </div>
      `;

      const content = card.querySelector(".blkContent");
      const type = b.type;
      const value = b.value || "";

      // render with inline editor where applicable
      if (type === "text"){
        if (!canEdit){
          content.innerHTML = `<div class="blkTextView">${escapeHtml(value)}</div>`;
        } else {
          content.innerHTML = `
            <textarea class="field blkTextEdit" placeholder="Текст...">${escapeHtml(value)}</textarea>
          `;
          const ta = content.querySelector("textarea");
          const saver = getSaver(b.id);
          ta.addEventListener("input", ()=> saver(ta.value));
        }
      } else if (type === "check"){
        // show checkbox row; inline edit via input
        const done = !!b.done;
        if (!canEdit){
          content.innerHTML = `<div class="blkCheck ${done ? "is-done":""}"><span class="box">${done?"✓":""}</span><span>${escapeHtml(value)}</span></div>`;
        } else {
          content.innerHTML = `
            <div style="display:grid; gap:10px;">
              <div class="blkCheck ${done ? "is-done":""}">
                <span class="box">${done?"✓":""}</span>
                <input class="field" value="${escapeHtml(value)}" placeholder="Пункт чеклиста" />
              </div>
            </div>
          `;
          const inp = content.querySelector("input");
          const saver = getSaver(b.id);
          inp.addEventListener("input", ()=> saver(inp.value));
        }
      } else {
        // URL-based types: show preview + inline URL edit
        const preview = renderBlockContent(b);
        if (!canEdit){
          content.innerHTML = preview;
        } else {
          content.innerHTML = `
            <input class="field" value="${escapeHtml(value)}" placeholder="URL" />
            <div style="margin-top:10px;">${preview}</div>
          `;
          const inp = content.querySelector("input");
          const saver = getSaver(b.id);
          inp.addEventListener("input", ()=>{
            // update preview live (local) while saving debounce
            saver(inp.value);
          });
          // refresh preview on blur (so iframe/image updates when URL changes)
          inp.addEventListener("blur", ()=>{
            const next = inp.value.trim();
            const b2 = { ...b, value: next };
            content.querySelectorAll(":scope > div").forEach(d=>d.remove());
            const wrap = document.createElement("div");
            wrap.style.marginTop = "10px";
            wrap.innerHTML = renderBlockContent(b2);
            content.appendChild(wrap);
          });
        }
      }

      // actions
      const delBtn = card.querySelector('[data-act="del"]');
      delBtn.onclick = async ()=>{
        if (!canDelete) return;
        if (!confirm("Удалить блок?")) return;
        await deleteDoc(doc(db, "users", ctx.uid, "characters", ctx.charId, "pages", ctx.pageId, "blocks", b.id));
      };

      const toggleBtn = card.querySelector('[data-act="toggle"]');
      if (toggleBtn){
        toggleBtn.onclick = async ()=>{
          if (ctx.readonly) return;
          const ref = doc(db, "users", ctx.uid, "characters", ctx.charId, "pages", ctx.pageId, "blocks", b.id);
          await updateDoc(ref, { done: !b.done, updatedAt: serverTimestamp() });
        };
      }

      // Drag reorder
      if (!ctx.readonly){
        card.addEventListener("dragstart", (e)=>{
          dragId = b.id;
          card.classList.add("dragging");
          e.dataTransfer.effectAllowed = "move";
          try { e.dataTransfer.setData("text/plain", b.id); } catch {}
        });
        card.addEventListener("dragend", ()=>{
          dragId = null;
          card.classList.remove("dragging");
          list.querySelectorAll(".blkCard").forEach(x=>x.classList.remove("dropTarget"));
        });
        card.addEventListener("dragover", (e)=>{
          e.preventDefault();
          if (!dragId || dragId === b.id) return;
          card.classList.add("dropTarget");
        });
        card.addEventListener("dragleave", ()=>{
          card.classList.remove("dropTarget");
        });
        card.addEventListener("drop", async (e)=>{
          e.preventDefault();
          card.classList.remove("dropTarget");
          const fromId = dragId || (()=>{
            try { return e.dataTransfer.getData("text/plain"); } catch { return null; }
          })();
          const toId = b.id;
          if (!fromId || fromId === toId) return;

          const ids = blocks.map(x=>x.id);
          const fromIdx = ids.indexOf(fromId);
          const toIdx = ids.indexOf(toId);
          if (fromIdx === -1 || toIdx === -1) return;

          // reorder in-memory
          ids.splice(toIdx, 0, ids.splice(fromIdx, 1)[0]);

          // commit batch
          try{
            await commitReorder(ids);
          }catch(err){
            console.error("[blocks] reorder failed", err);
            alert("Не удалось поменять порядок (проверь правила Firestore).");
          }
        });
      }

      list.appendChild(card);
    });
  }
}

/* ================= Other tabs: params / inventory / gallery / master / game ================= */

function mountParams(route, charData){
  const el = ensureUI();
  const { mode } = route;

  const desc = el.querySelector("#pDesc");
  const wants = el.querySelector("#pWants");
  const avaPreview = el.querySelector("#pAvaPreview");
  const avaUrl = el.querySelector("#pAvaUrl");
  const btnSet = el.querySelector("#pAvaSet");
  const btnClear = el.querySelector("#pAvaClear");

  const sPower = el.querySelector("#sPower");
  const sAgility = el.querySelector("#sAgility");
  const sMagic = el.querySelector("#sMagic");
  const sCharm = el.querySelector("#sCharm");

  desc.value = charData?.profile?.desc || "";
  wants.value = charData?.profile?.wants || "";

  const avatar = charData?.avatarUrl || "";
  if (avatar){
    avaPreview.innerHTML = `<img src="${escapeHtml(avatar)}" alt="">`;
    avaUrl.value = avatar;
  } else {
    avaPreview.textContent = "🙂";
    avaUrl.value = "";
  }

  const canAdminEditAvatar = (mode === "admin");
  avaUrl.disabled = !canAdminEditAvatar;
  btnSet.disabled = !canAdminEditAvatar;
  btnClear.disabled = !canAdminEditAvatar;

  el.querySelector("#pSave").onclick = async ()=>{
    await updateDoc(charDocRef(route.uid, route.charId), {
      "profile.desc": desc.value,
      "profile.wants": wants.value,
      updatedAt: serverTimestamp(),
    });
    alert("Сохранено");
  };
  el.querySelector("#pReset").onclick = ()=>{
    desc.value = charData?.profile?.desc || "";
    wants.value = charData?.profile?.wants || "";
  };

  btnSet.onclick = async ()=>{
    const url = avaUrl.value.trim();
    if (!url) { alert("Вставь URL"); return; }
    await updateDoc(charDocRef(route.uid, route.charId), {
      avatarUrl: url,
      avatarSetBy: "admin",
      avatarSetAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    avaPreview.innerHTML = `<img src="${escapeHtml(url)}" alt="">`;
    alert("Аватар закреплён");
  };
  btnClear.onclick = async ()=>{
    await updateDoc(charDocRef(route.uid, route.charId), { avatarUrl: "", updatedAt: serverTimestamp() });
    avaPreview.textContent = "🙂";
    avaUrl.value = "";
  };

  const stats = charData?.stats || {};
  sPower.value = stats.power ?? 20;
  sAgility.value = stats.agility ?? 20;
  sMagic.value = stats.magic ?? 20;
  sCharm.value = stats.charm ?? 20;

  el.querySelector("#sSave").onclick = async ()=>{
    await updateDoc(charDocRef(route.uid, route.charId), {
      stats: {
        power: clamp(parseInt(sPower.value||"0",10), 0, 100),
        agility: clamp(parseInt(sAgility.value||"0",10), 0, 100),
        magic: clamp(parseInt(sMagic.value||"0",10), 0, 100),
        charm: clamp(parseInt(sCharm.value||"0",10), 0, 100),
      },
      updatedAt: serverTimestamp(),
    });
    alert("Способности сохранены");
  };
}

let unsubInv = null;
function mountInventory(route){
  const el = ensureUI();
  const { uid, charId, mode } = route;

  const list = el.querySelector("#invList");
  const inp = el.querySelector("#invName");
  const addBtn = el.querySelector("#invAdd");

  const invCol = collection(db, "users", uid, "characters", charId, "inventory");

  addBtn.onclick = async ()=>{
    const name = (inp.value||"").trim();
    if (!name) return;
    await addDoc(invCol, {
      name,
      origin: mode === "admin" ? "admin" : "user",
      createdAt: serverTimestamp(),
    });
    inp.value = "";
  };

  if (unsubInv) unsubInv();
  unsubInv = onSnapshot(query(invCol, orderBy("createdAt","desc")), (snap)=>{
    list.innerHTML = "";
    if (snap.empty){
      list.innerHTML = `<div class="muted" style="padding:8px 2px;">Пока пусто.</div>`;
      return;
    }
    snap.forEach(d=>{
      const it = d.data();
      const row = document.createElement("div");
      row.className = "invItem";
      row.innerHTML = `
        <div><b>${escapeHtml(it.name||"")}</b> <span class="muted" style="font-size:12px;">• ${escapeHtml(it.origin||"")}</span></div>
        <button class="xBtn" title="удалить">✕</button>
      `;
      row.querySelector("button").onclick = async ()=>{
        if (!confirm("Удалить предмет?")) return;
        await deleteDoc(doc(db, "users", uid, "characters", charId, "inventory", d.id));
      };
      list.appendChild(row);
    });
  });
}

let unsubGallery = null;

function renderGalleryMedia(url){
  const kind = guessEmbedKind(url);
  if (kind === "image") return `<div class="gMedia"><img src="${escapeHtml(url)}" alt=""></div>`;
  if (kind === "video") return `<div class="gMedia"><video src="${escapeHtml(url)}" muted controls playsinline></video></div>`;
  if (kind === "youtube"){
    const id = youtubeId(url);
    return `<div class="gMedia"><iframe src="https://www.youtube.com/embed/${escapeHtml(id)}" allowfullscreen></iframe></div>`;
  }
  if (kind === "vimeo"){
    const id = vimeoId(url);
    return `<div class="gMedia"><iframe src="https://player.vimeo.com/video/${escapeHtml(id)}" allowfullscreen></iframe></div>`;
  }
  return `<div class="gMedia"><iframe src="${escapeHtml(url)}"></iframe></div>`;
}

function enableDragFree(card, onMove, onCommit){
  let dragging=false, sx=0, sy=0, sl=0, st=0;
  const down=(e)=>{
    if (e.target?.closest?.("button")) return;
    dragging=true;
    const pt = e.touches ? e.touches[0] : e;
    sx=pt.clientX; sy=pt.clientY;
    sl=parseInt(card.style.left||"0",10)||0;
    st=parseInt(card.style.top||"0",10)||0;
    try{ card.setPointerCapture?.(e.pointerId); }catch{}
    e.preventDefault?.();
  };
  const move=(e)=>{
    if (!dragging) return;
    const pt = e.touches ? e.touches[0] : e;
    const dx=pt.clientX-sx, dy=pt.clientY-sy;
    onMove(sl+dx, st+dy);
  };
  const up=()=>{
    if (!dragging) return;
    dragging=false;
    onCommit?.();
  };
  card.addEventListener("pointerdown", down);
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  card.addEventListener("touchstart", down, { passive:false });
  window.addEventListener("touchmove", move, { passive:false });
  window.addEventListener("touchend", up);
}

function mountGallery(route){
  const el = ensureUI();
  const { uid, charId, mode } = route;

  const stage = el.querySelector("#galStage");
  const urlInp = el.querySelector("#gUrl");
  const addBtn = el.querySelector("#gAdd");
  const col = collection(db, "users", uid, "characters", charId, "gallery");

  addBtn.onclick = async ()=>{
    const url = (urlInp.value||"").trim();
    if (!url) return;
    await addDoc(col, {
      url,
      x: 24 + Math.floor(Math.random()*160),
      y: 24 + Math.floor(Math.random()*120),
      origin: mode === "admin" ? "admin" : "user",
      createdAt: serverTimestamp(),
    });
    urlInp.value = "";
  };

  if (unsubGallery) unsubGallery();
  unsubGallery = onSnapshot(query(col, orderBy("createdAt","desc")), (snap)=>{
    stage.innerHTML = "";
    snap.forEach(d=>{
      const g = d.data();
      const card = document.createElement("div");
      card.className = "galCard";
      card.style.left = (g.x ?? 20) + "px";
      card.style.top  = (g.y ?? 20) + "px";
      card.innerHTML = `
        ${renderGalleryMedia(g.url||"")}
        <div class="galCardBar">
          <span>${escapeHtml(g.origin||"")}</span>
          <button class="xBtn" title="удалить">✕</button>
        </div>
      `;

      const canDelete = (mode === "admin") || (g.origin !== "admin");
      const delBtn = card.querySelector("button");
      delBtn.style.display = canDelete ? "" : "none";
      delBtn.onclick = async (e)=>{
        e.stopPropagation();
        await deleteDoc(doc(db, "users", uid, "characters", charId, "gallery", d.id));
      };

      let timer=null;
      const commit=()=>{
        clearTimeout(timer);
        timer=setTimeout(async ()=>{
          const x = parseInt(card.style.left||"0",10);
          const y = parseInt(card.style.top||"0",10);
          await updateDoc(doc(db, "users", uid, "characters", charId, "gallery", d.id), { x, y });
        }, 220);
      };
      enableDragFree(card, (nx,ny)=>{ card.style.left=nx+"px"; card.style.top=ny+"px"; }, commit);

      stage.appendChild(card);
    });
  });
}

let unsubAssets = null;
function renderAssetPreview(a){
  const url = a.url || "";
  const kind = guessEmbedKind(url);
  if (a.type && a.type !== "auto"){
    // allow forced
  }
  if (kind === "image") return `<img class="aMediaImg" src="${escapeHtml(url)}" alt="">`;
  if (kind === "video") return `<video class="aMediaVid" src="${escapeHtml(url)}" controls playsinline></video>`;
  if (kind === "youtube"){
    const id = youtubeId(url);
    return `<div class="aFrame"><iframe src="https://www.youtube.com/embed/${escapeHtml(id)}" allowfullscreen></iframe></div>`;
  }
  if (kind === "vimeo"){
    const id = vimeoId(url);
    return `<div class="aFrame"><iframe src="https://player.vimeo.com/video/${escapeHtml(id)}" allowfullscreen></iframe></div>`;
  }
  return `<div class="aFrame"><iframe src="${escapeHtml(url)}"></iframe></div>`;
}
function mountMaster(route){
  const el = ensureUI();
  const { uid, charId, mode } = route;

  const list = el.querySelector("#assetList");
  const aTitle = el.querySelector("#aTitle");
  const aType = el.querySelector("#aType");
  const aUrl = el.querySelector("#aUrl");
  const aAdd = el.querySelector("#aAdd");

  const col = collection(db, "users", uid, "characters", charId, "assets");

  const adminOnly = (mode === "admin");
  aAdd.disabled = !adminOnly;
  aTitle.disabled = !adminOnly;
  aType.disabled = !adminOnly;
  aUrl.disabled = !adminOnly;

  aAdd.onclick = async ()=>{
    if (!adminOnly) return;
    const title = (aTitle.value||"").trim();
    const url = (aUrl.value||"").trim();
    const type = aType.value;
    if (!title || !url) return;

    await addDoc(col, { title, url, type, origin:"admin", createdAt: serverTimestamp() });
    aTitle.value = ""; aUrl.value = "";
  };

  if (unsubAssets) unsubAssets();
  unsubAssets = onSnapshot(query(col, orderBy("createdAt","desc")), (snap)=>{
    list.innerHTML = "";
    if (snap.empty){
      list.innerHTML = `<div class="muted" style="padding:8px 2px;">Пока нет материалов.</div>`;
      return;
    }
    snap.forEach(d=>{
      const a = d.data();
      const card = document.createElement("div");
      card.className = "assetCard";
      card.innerHTML = `
        <div class="assetTop">
          <div>
            <b>${escapeHtml(a.title||"")}</b>
            <div class="assetMeta">${escapeHtml(a.origin||"")} • ${escapeHtml(a.type||"auto")}</div>
          </div>
          <div class="assetActions">
            <a class="btn ghost" href="${escapeHtml(a.url||"")}" target="_blank" rel="noopener">открыть</a>
            <button class="btn ghost" data-act="del">удалить</button>
          </div>
        </div>
        ${renderAssetPreview(a)}
      `;
      const del = card.querySelector('[data-act="del"]');
      del.style.display = adminOnly ? "" : "none";
      del.onclick = async ()=>{
        if (!confirm("Удалить материал?")) return;
        await deleteDoc(doc(db, "users", uid, "characters", charId, "assets", d.id));
      };
      list.appendChild(card);
    });
  });
}

let cachedLocations = null;
async function loadLocations(){
  if (cachedLocations) return cachedLocations;
  const snap = await getDocs(collection(db, "locations"));
  const arr = [];
  snap.forEach(d=>arr.push({ id:d.id, ...d.data() }));
  cachedLocations = arr;
  return arr;
}
async function resolveCurrentLocation(charData){
  const locId = charData?.locationId;
  if (!locId) return null;
  const ls = await loadLocations();
  return ls.find(x=>x.id === locId) || null;
}
function mountGame(route, charData){
  const el = ensureUI();
  const locName = el.querySelector("#gLocName");
  const locDesc = el.querySelector("#gLocDesc");
  const btnJoin = el.querySelector("#gJoin");
  const btnRefresh = el.querySelector("#gRefresh");

  async function render(){
    const fresh = await getDoc(charDocRef(route.uid, route.charId));
    const c = fresh.exists() ? fresh.data() : charData;
    const loc = await resolveCurrentLocation(c);
    if (!loc){
      locName.textContent = "не выбрана";
      locDesc.textContent = "Нажми “в игру (рандом)” чтобы попасть в мир.";
    } else {
      locName.textContent = loc.name || loc.id;
      locDesc.textContent = loc.desc || "";
    }
  }

  btnRefresh.onclick = render;
  btnJoin.onclick = async ()=>{
    const ls = await loadLocations();
    if (!ls.length){
      alert("Нет локаций. Создай хотя бы одну (админ).");
      return;
    }
    const pick = ls[Math.floor(Math.random()*ls.length)];
    await updateDoc(charDocRef(route.uid, route.charId), {
      inGame: true,
      locationId: pick.id,
      joinedAt: serverTimestamp(),
      lastMoveAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await render();
    alert("Персонаж отправлен в локацию: " + (pick.name || pick.id));
  };

  render();
}

/* ================= lifecycle ================= */

function cleanup(){
  if (unsubPages) unsubPages(); unsubPages = null;
  if (unsubBlocks) unsubBlocks(); unsubBlocks = null;
  if (unsubInv) unsubInv(); unsubInv = null;
  if (unsubGallery) unsubGallery(); unsubGallery = null;
  if (unsubAssets) unsubAssets(); unsubAssets = null;
  activePageId = null;
  activePageData = null;
}

async function openCharacter(){
  if (!requireAuth()) return;

  const route = parseRoute();
  if (!route || !route.uid || !route.charId) return;
  if (!mustBeAdminIfAdminRoute(route)) return;

  const el = ensureUI();
  el.style.display = "block";

  window.__CHAR_CTX__ = { uid: route.uid, charId: route.charId, mode: route.mode };

  const snap = await getDoc(charDocRef(route.uid, route.charId));
  if (!snap.exists()){
    el.querySelector("#chTitle").textContent = "Персонаж не найден";
    el.querySelector("#chSub").textContent = "";
    return;
  }
  const c = snap.data();

  el.querySelector("#chTitle").textContent = c.name || "Персонаж";
  el.querySelector("#chSub").textContent = (route.mode === "admin") ? "режим мастера" : "тетрадка участника";

  el.querySelector("#chCopyCode").onclick = async ()=>{
    const code = `${route.uid}:${route.charId}`;
    try{
      await navigator.clipboard.writeText(code);
      alert("Код персонажа скопирован:\n" + code);
    }catch{
      prompt("Скопируйте вручную:", code);
    }
  };

  setActiveTab("notebook");

  cleanup();
  mountNotebook(route);
  mountParams(route, c);
  mountInventory(route);
  mountGallery(route);
  mountMaster(route);
  mountGame(route, c);
}

function closeCharacter(){
  const el = document.getElementById("charOverlay");
  if (el) el.style.display = "none";
  cleanup();
}

function route(){
  const h = location.hash || "";
  if (h.startsWith("#/character/") || h.startsWith("#/admin/character/")){
    openCharacter().catch(e=>console.error("[character] open error", e));
  } else {
    closeCharacter();
  }
}

window.addEventListener("hashchange", route);
document.addEventListener("DOMContentLoaded", route);
