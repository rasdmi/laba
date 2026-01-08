// character.js — Tabs + assets renderer + Notion tab (no Firebase Storage)
import { auth, db } from "./firebase-config.js";
import { requireAuth } from "./auth.js";

import {
  doc, getDoc, updateDoc,
  collection, addDoc, deleteDoc,
  query, orderBy, onSnapshot,
  serverTimestamp, getDocs
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

/* ================= URL embed helpers ================= */

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
    if (u.hostname.includes("youtu.be")){
      return u.pathname.replace("/","") || null;
    }
    if (u.hostname.includes("youtube.com")){
      return u.searchParams.get("v") || null;
    }
    return null;
  }catch{ return null; }
}
function vimeoId(url){
  if (!url) return null;
  try{
    const u = new URL(url);
    if (!u.hostname.includes("vimeo.com")) return null;
    // vimeo.com/123456789
    const m = u.pathname.match(/\/(\d+)/);
    return m ? m[1] : null;
  }catch{ return null; }
}
function notionPublicEmbedUrl(url){
  // Notion public share can be embedded by adding ?embed=1 (usually works)
  if (!url) return null;
  try{
    const u = new URL(url);
    // accept notion.site, notion.so and custom share
    // just add embed=1 param
    u.searchParams.set("embed","1");
    return u.toString();
  }catch{
    return null;
  }
}
function guessAssetKind(url, forcedType=null){
  // forcedType may be image/video/embed/model/link
  if (forcedType && forcedType !== "auto") return forcedType;

  if (!url) return "link";
  const yid = youtubeId(url);
  if (yid) return "youtube";
  const vid = vimeoId(url);
  if (vid) return "vimeo";
  if ((url||"").includes("notion.") || (url||"").includes("notion.site") || (url||"").includes("notion.so")){
    return "notion";
  }
  if (isImageUrl(url)) return "image";
  if (isVideoFileUrl(url)) return "video";
  return "embed"; // default: iframe
}

function renderAssetPreview(asset){
  const url = asset.url || "";
  const kind = guessAssetKind(url, asset.type);

  if (kind === "image"){
    return `<img class="aMediaImg" src="${escapeHtml(url)}" alt="">`;
  }

  if (kind === "video"){
    return `
      <video class="aMediaVid" src="${escapeHtml(url)}" controls playsinline></video>
    `;
  }

  if (kind === "youtube"){
    const id = youtubeId(url);
    return `
      <div class="aFrame">
        <iframe
          src="https://www.youtube.com/embed/${escapeHtml(id)}"
          title="YouTube"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowfullscreen
        ></iframe>
      </div>
    `;
  }

  if (kind === "vimeo"){
    const id = vimeoId(url);
    return `
      <div class="aFrame">
        <iframe
          src="https://player.vimeo.com/video/${escapeHtml(id)}"
          title="Vimeo"
          allow="autoplay; fullscreen; picture-in-picture"
          allowfullscreen
        ></iframe>
      </div>
    `;
  }

  if (kind === "notion"){
    const e = notionPublicEmbedUrl(url) || url;
    return `
      <div class="aFrame aFrame--tall">
        <iframe src="${escapeHtml(e)}" title="Notion embed"></iframe>
      </div>
    `;
  }

  // generic embed
  return `
    <div class="aFrame">
      <iframe src="${escapeHtml(url)}" title="Embed"></iframe>
    </div>
  `;
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
      <div class="chHead">
        <div class="chTitle" id="chTitle">Персонаж</div>
        <div class="chSub" id="chSub"></div>
      </div>

      <div class="chTabs" id="chTabs">
        <button class="chTab is-active" data-tab="notebook">тетрадка</button>
        <button class="chTab" data-tab="params">параметры</button>
        <button class="chTab" data-tab="inventory">инвентарь</button>
        <button class="chTab" data-tab="gallery">галерея</button>
        <button class="chTab" data-tab="master">от мастера</button>
        <button class="chTab" data-tab="notion">notion</button>
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
              <div class="nbSideTitle">Страницы</div>
              <button class="btn ghost" id="pgAdd">+ добавить</button>
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

      <!-- GALLERY (URLs + draggable cards) -->
      <div class="chView" data-view="gallery">
        <div class="pane">
          <div class="paneCard">
            <div class="paneH">Галерея (свободные карточки)</div>
            <div class="muted">MVP: добавляем URL, можно двигать и удалять. Поддержка: картинки и видео(YouTube/Vimeo/iframe).</div>

            <div class="galRow">
              <input class="field" id="gUrl" placeholder="URL (картинка / YouTube / Vimeo / Notion / embed)" />
              <button class="btn" id="gAdd">+ добавить</button>
            </div>
          </div>

          <div class="paneCard">
            <div id="galStage" class="galStage"></div>
          </div>
        </div>
      </div>

      <!-- MASTER assets (admin adds) -->
      <div class="chView" data-view="master">
        <div class="pane">
          <div class="paneCard">
            <div class="paneH">Материалы от мастера</div>
            <div class="muted">Админ добавляет карточки (image/video/embed/notion/youtube).</div>

            <div class="assetRow">
              <input class="field" id="aTitle" placeholder="название" />
              <select class="field" id="aType">
                <option value="auto">auto</option>
                <option value="image">image</option>
                <option value="video">video</option>
                <option value="embed">embed</option>
                <option value="notion">notion</option>
              </select>
              <input class="field" id="aUrl" placeholder="URL" />
              <button class="btn" id="aAdd">добавить</button>
            </div>

            <div id="assetList" class="assetList"></div>
          </div>
        </div>
      </div>

      <!-- NOTION tab -->
      <div class="chView" data-view="notion">
        <div class="pane">
          <div class="paneCard">
            <div class="paneH">Notion-страница персонажа</div>
            <div class="muted">
              Сделай в Notion “Share to web”, вставь ссылку сюда — и она будет видна прямо в персонаже.
            </div>

            <div class="notRow">
              <input class="field" id="nUrl" placeholder="Notion public URL" />
              <button class="btn" id="nSave">сохранить</button>
              <button class="btn ghost" id="nOpen">открыть</button>
              <button class="btn ghost" id="nClear">очистить</button>
            </div>

            <div class="muted" style="margin-top:8px; font-size:12px;">
              Если Notion не отображается в iframe — проверь, что страница “Publish to web” включена.
            </div>
          </div>

          <div class="paneCard">
            <div id="notionFrameWrap" class="notionFrameWrap">
              <div class="muted">Вставь ссылку на Notion — здесь появится встроенная страница.</div>
            </div>
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

            <div class="muted" style="margin-top:12px;">
              Дальше добавим NPC/квесты/награды/интеракции.
            </div>
          </div>
        </div>
      </div>
    </div>

    <style>
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

      .chBody{
        height: calc(100% - 60px);
        min-height:0;
        overflow:hidden;
      }
      .chView{ display:none; height:100%; }
      .chView.is-active{ display:block; }

      .nbGrid{
        height:100%;
        display:grid;
        grid-template-columns: 290px 1fr;
        min-height:0;
      }
      .nbSide{
        border-right:1px solid rgba(23,23,23,.08);
        overflow:auto;
        padding: 12px;
        min-height:0;
      }
      .nbSideTop{
        display:flex; align-items:center; justify-content:space-between;
        gap:10px; margin-bottom:10px;
      }
      .nbSideTitle{ font-family:'Vasek',ui-sans-serif; font-size:14px; opacity:.85; }
      .nbMain{ overflow:auto; min-height:0; }
      .nbPad{ padding: 14px 16px; }
      .muted{ opacity:.6; }

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
      .pgMeta{ opacity:.55; font-size:11px; margin-top:4px; }

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
      .miniRow{ display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; margin-top:10px; }

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

      /* media inside cards */
      .gMedia{
        width:100%;
        height: 150px;
        display:block;
        background: rgba(0,0,0,.03);
      }
      .gMedia img{ width:100%; height:150px; object-fit:cover; display:block; }
      .gMedia video{ width:100%; height:150px; object-fit:cover; display:block; }
      .gMedia iframe{
        width:100%; height:150px; border:0; display:block;
        background: rgba(0,0,0,.03);
      }

      .assetRow{
        display:grid;
        grid-template-columns: 1fr 130px 1fr auto;
        gap:10px;
        margin-top:10px;
      }
      .assetList{
        margin-top:12px;
        display:grid;
        gap:12px;
      }
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
      .aFrame iframe{
        width:100%;
        height: 360px;
        border:0;
        display:block;
        background: rgba(0,0,0,.02);
      }
      .aFrame--tall iframe{ height: 520px; }
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

      .notRow{
        display:flex; gap:10px; flex-wrap:wrap; margin-top:10px;
      }
      .notRow .field{ flex:1 1 320px; }
      .notionFrameWrap{
        border-radius: 18px;
        border:1px dashed rgba(23,23,23,.16);
        background: rgba(255,255,255,.55);
        min-height: 520px;
        overflow:hidden;
        display:grid;
        place-items:center;
      }
      .notionFrameWrap iframe{
        width:100%;
        height: 520px;
        border:0;
        display:block;
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
        .aFrame iframe{ height: 260px; }
        .aFrame--tall iframe{ height: 420px; }
        .notionFrameWrap{ min-height: 420px; }
        .notionFrameWrap iframe{ height: 420px; }
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

/* ================= Notebook pages ================= */

let unsubPages = null;
let activePageId = null;

function canEditPage(routeMode, origin){
  if (routeMode === "admin") return true;
  return origin !== "admin";
}

function mountPages(route){
  const el = ensureUI();
  const { uid, charId, mode } = route;
  const listEl = el.querySelector("#pgList");
  const bodyEl = el.querySelector("#pgBody");

  el.querySelector("#pgAdd").onclick = async () => {
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
    query(collection(db, "users", uid, "characters", charId, "pages"), orderBy("createdAt","asc")),
    (snap)=>{
      listEl.innerHTML = "";

      if (snap.empty){
        listEl.innerHTML = `<div class="muted" style="padding:8px 2px;">Пока нет страниц. Нажми “+ добавить”.</div>`;
        bodyEl.innerHTML = `<div class="muted">Создай первую страницу.</div>`;
        activePageId = null;
        return;
      }

      snap.forEach(d=>{
        const p = d.data();
        const item = document.createElement("div");
        item.className = "pgItem" + (d.id === activePageId ? " is-active" : "");
        item.innerHTML = `
          <div class="pgTitle">${escapeHtml(p.title||"")}</div>
          <div class="pgMeta">${p.origin === "admin" ? "от мастера" : "моя"} • ${escapeHtml(p.origin||"")}</div>
        `;

        item.onclick = () => {
          activePageId = d.id;
          listEl.querySelectorAll(".pgItem").forEach(x=>x.classList.remove("is-active"));
          item.classList.add("is-active");

          const editable = canEditPage(mode, p.origin);

          bodyEl.innerHTML = `
            <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap;">
              <div>
                <div style="font-family:'Vasek',ui-sans-serif; font-size:18px;">${escapeHtml(p.title||"")}</div>
                <div class="muted" style="font-size:12px; margin-top:4px;">
                  ${p.origin === "admin" ? "контент от мастера" : "контент пользователя"}
                </div>
              </div>
              <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <button class="btn ghost" id="pgRename">переименовать</button>
                <button class="btn ghost" id="pgDelete">удалить</button>
              </div>
            </div>

            <div style="margin-top:12px;">
              <textarea class="field" id="pgBodyEdit" ${editable ? "" : "disabled"}>${escapeHtml(p.body||"")}</textarea>
              <div class="miniRow">
                <button class="btn ghost" id="pgCancel">отмена</button>
                <button class="btn" id="pgSave" ${editable ? "" : "disabled"}>сохранить</button>
              </div>
              ${editable ? "" : `<div class="muted" style="font-size:12px; margin-top:6px;">
                Это страница от мастера — пользователь её не редактирует.
              </div>`}
            </div>
          `;

          bodyEl.querySelector("#pgRename").onclick = async () => {
            const nt = prompt("Новое название", p.title || "");
            if (!nt) return;
            await updateDoc(doc(db, "users", uid, "characters", charId, "pages", d.id), {
              title: nt,
              updatedAt: serverTimestamp(),
            });
          };

          bodyEl.querySelector("#pgDelete").onclick = async () => {
            if (!confirm("Удалить страницу?")) return;
            await deleteDoc(doc(db, "users", uid, "characters", charId, "pages", d.id));
            activePageId = null;
            bodyEl.innerHTML = `<div class="muted">Страница удалена.</div>`;
          };

          bodyEl.querySelector("#pgCancel").onclick = () => item.click();

          bodyEl.querySelector("#pgSave").onclick = async () => {
            const nextBody = bodyEl.querySelector("#pgBodyEdit").value;
            await updateDoc(doc(db, "users", uid, "characters", charId, "pages", d.id), {
              body: nextBody,
              updatedAt: serverTimestamp(),
            });
            const btn = bodyEl.querySelector("#pgSave");
            btn.textContent = "сохранено ✓";
            setTimeout(()=>{ if (btn) btn.textContent = "сохранить"; }, 900);
          };
        };

        listEl.appendChild(item);
      });

      if (!activePageId){
        listEl.querySelector(".pgItem")?.click();
      }
    }
  );
}

/* ================= Params + Stats + Avatar ================= */

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

  el.querySelector("#pSave").onclick = async () => {
    await updateDoc(charDocRef(route.uid, route.charId), {
      "profile.desc": desc.value,
      "profile.wants": wants.value,
      updatedAt: serverTimestamp(),
    });
    alert("Сохранено");
  };

  el.querySelector("#pReset").onclick = () => {
    desc.value = charData?.profile?.desc || "";
    wants.value = charData?.profile?.wants || "";
  };

  btnSet.onclick = async () => {
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

  btnClear.onclick = async () => {
    await updateDoc(charDocRef(route.uid, route.charId), {
      avatarUrl: "",
      updatedAt: serverTimestamp(),
    });
    avaPreview.textContent = "🙂";
    avaUrl.value = "";
  };

  const stats = charData?.stats || {};
  sPower.value = stats.power ?? 20;
  sAgility.value = stats.agility ?? 20;
  sMagic.value = stats.magic ?? 20;
  sCharm.value = stats.charm ?? 20;

  el.querySelector("#sSave").onclick = async () => {
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

/* ================= Inventory ================= */

let unsubInv = null;

function mountInventory(route){
  const el = ensureUI();
  const { uid, charId, mode } = route;

  const list = el.querySelector("#invList");
  const inp = el.querySelector("#invName");
  const addBtn = el.querySelector("#invAdd");

  const invCol = collection(db, "users", uid, "characters", charId, "inventory");

  addBtn.onclick = async () => {
    const name = inp.value.trim();
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
      row.querySelector("button").onclick = async () => {
        if (!confirm("Удалить предмет?")) return;
        await deleteDoc(doc(db, "users", uid, "characters", charId, "inventory", d.id));
      };
      list.appendChild(row);
    });
  });
}

/* ================= Gallery: draggable cards with embeds ================= */

let unsubGallery = null;

function enableDrag(card, onMove, onCommit){
  let dragging = false;
  let startX=0, startY=0;
  let startLeft=0, startTop=0;

  const down = (e)=>{
    // ignore clicks on buttons
    if (e.target?.closest?.("button")) return;

    dragging = true;
    const pt = e.touches ? e.touches[0] : e;
    startX = pt.clientX; startY = pt.clientY;
    startLeft = parseInt(card.style.left||"0",10) || 0;
    startTop = parseInt(card.style.top||"0",10) || 0;

    try{ card.setPointerCapture?.(e.pointerId); }catch{}
    e.preventDefault?.();
  };

  const move = (e)=>{
    if (!dragging) return;
    const pt = e.touches ? e.touches[0] : e;
    const dx = pt.clientX - startX;
    const dy = pt.clientY - startY;
    onMove(startLeft + dx, startTop + dy);
  };

  const up = ()=>{
    if (!dragging) return;
    dragging = false;
    onCommit?.();
  };

  card.addEventListener("pointerdown", down);
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);

  // touch fallback
  card.addEventListener("touchstart", down, { passive:false });
  window.addEventListener("touchmove", move, { passive:false });
  window.addEventListener("touchend", up);
}

function renderGalleryMedia(url){
  const kind = guessAssetKind(url, "auto");

  if (kind === "image"){
    return `<div class="gMedia"><img src="${escapeHtml(url)}" alt=""></div>`;
  }
  if (kind === "video"){
    return `<div class="gMedia"><video src="${escapeHtml(url)}" muted controls playsinline></video></div>`;
  }
  if (kind === "youtube"){
    const id = youtubeId(url);
    return `<div class="gMedia"><iframe src="https://www.youtube.com/embed/${escapeHtml(id)}" allowfullscreen></iframe></div>`;
  }
  if (kind === "vimeo"){
    const id = vimeoId(url);
    return `<div class="gMedia"><iframe src="https://player.vimeo.com/video/${escapeHtml(id)}" allowfullscreen></iframe></div>`;
  }
  if (kind === "notion"){
    const e = notionPublicEmbedUrl(url) || url;
    return `<div class="gMedia"><iframe src="${escapeHtml(e)}"></iframe></div>`;
  }
  return `<div class="gMedia"><iframe src="${escapeHtml(url)}"></iframe></div>`;
}

function mountGallery(route){
  const el = ensureUI();
  const { uid, charId, mode } = route;

  const stage = el.querySelector("#galStage");
  const urlInp = el.querySelector("#gUrl");
  const addBtn = el.querySelector("#gAdd");

  const galCol = collection(db, "users", uid, "characters", charId, "gallery");

  addBtn.onclick = async () => {
    const url = urlInp.value.trim();
    if (!url) return;

    await addDoc(galCol, {
      url,
      x: 24 + Math.floor(Math.random()*160),
      y: 24 + Math.floor(Math.random()*120),
      createdAt: serverTimestamp(),
      origin: mode === "admin" ? "admin" : "user",
    });
    urlInp.value = "";
  };

  if (unsubGallery) unsubGallery();
  unsubGallery = onSnapshot(query(galCol, orderBy("createdAt","desc")), (snap)=>{
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

      // delete: user can delete own, admin can delete all
      const canDelete = (mode === "admin") || (g.origin !== "admin");
      const delBtn = card.querySelector("button");
      delBtn.style.display = canDelete ? "" : "none";
      delBtn.onclick = async (e) => {
        e.stopPropagation();
        await deleteDoc(doc(db, "users", uid, "characters", charId, "gallery", d.id));
      };

      // drag + persist position (debounced)
      let timer = null;
      const commit = () => {
        clearTimeout(timer);
        timer = setTimeout(async ()=>{
          const x = parseInt(card.style.left||"0",10);
          const y = parseInt(card.style.top||"0",10);
          await updateDoc(doc(db, "users", uid, "characters", charId, "gallery", d.id), { x, y });
        }, 220);
      };

      enableDrag(
        card,
        (nx, ny)=>{ card.style.left = nx + "px"; card.style.top = ny + "px"; },
        commit
      );

      stage.appendChild(card);
    });
  });
}

/* ================= Master assets: cards with previews ================= */

let unsubAssets = null;

function mountMaster(route){
  const el = ensureUI();
  const { uid, charId, mode } = route;

  const list = el.querySelector("#assetList");
  const aTitle = el.querySelector("#aTitle");
  const aType = el.querySelector("#aType");
  const aUrl = el.querySelector("#aUrl");
  const aAdd = el.querySelector("#aAdd");

  const col = collection(db, "users", uid, "characters", charId, "assets");

  // only admin can add/edit/delete master assets
  const adminOnly = (mode === "admin");
  aAdd.disabled = !adminOnly;
  aTitle.disabled = !adminOnly;
  aType.disabled = !adminOnly;
  aUrl.disabled = !adminOnly;

  aAdd.onclick = async () => {
    const title = aTitle.value.trim();
    const url = aUrl.value.trim();
    const type = aType.value;
    if (!title || !url) return;

    await addDoc(col, {
      title,
      url,
      type,               // 'auto' or forced
      origin: "admin",
      createdAt: serverTimestamp(),
    });

    aTitle.value = "";
    aUrl.value = "";
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

      const delBtn = card.querySelector('[data-act="del"]');
      delBtn.style.display = adminOnly ? "" : "none";
      delBtn.onclick = async ()=>{
        if (!confirm("Удалить материал?")) return;
        await deleteDoc(doc(db, "users", uid, "characters", charId, "assets", d.id));
      };

      list.appendChild(card);
    });
  });
}

/* ================= Notion tab ================= */

function mountNotion(route, charData){
  const el = ensureUI();
  const inp = el.querySelector("#nUrl");
  const btnSave = el.querySelector("#nSave");
  const btnOpen = el.querySelector("#nOpen");
  const btnClear = el.querySelector("#nClear");
  const wrap = el.querySelector("#notionFrameWrap");

  const current = charData?.notionUrl || "";
  inp.value = current;

  function renderFrame(url){
    if (!url){
      wrap.innerHTML = `<div class="muted">Вставь ссылку на Notion — здесь появится встроенная страница.</div>`;
      return;
    }
    const e = notionPublicEmbedUrl(url) || url;
    wrap.innerHTML = `<iframe src="${escapeHtml(e)}" title="Notion page"></iframe>`;
  }

  renderFrame(current);

  btnSave.onclick = async ()=>{
    const url = inp.value.trim();
    await updateDoc(charDocRef(route.uid, route.charId), {
      notionUrl: url,
      updatedAt: serverTimestamp(),
    });
    renderFrame(url);
    alert("Сохранено");
  };

  btnOpen.onclick = ()=>{
    const url = inp.value.trim();
    if (!url) return;
    window.open(url, "_blank", "noopener");
  };

  btnClear.onclick = async ()=>{
    if (!confirm("Очистить Notion ссылку?")) return;
    inp.value = "";
    await updateDoc(charDocRef(route.uid, route.charId), {
      notionUrl: "",
      updatedAt: serverTimestamp(),
    });
    renderFrame("");
  };
}

/* ================= Game: random location ================= */

let cachedLocations = null;

async function loadLocations(){
  if (cachedLocations) return cachedLocations;
  const snap = await getDocs(collection(db, "locations"));
  const arr = [];
  snap.forEach(d=> arr.push({ id:d.id, ...d.data() }));
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
      alert("Нет локаций. Создай хотя бы одну в #/locations (админ).");
      return;
    }
    const pick = ls[Math.floor(Math.random() * ls.length)];
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
  if (unsubPages) unsubPages(); unsubPages = null; activePageId = null;
  if (unsubInv) unsubInv(); unsubInv = null;
  if (unsubGallery) unsubGallery(); unsubGallery = null;
  if (unsubAssets) unsubAssets(); unsubAssets = null;
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
  el.querySelector("#chSub").textContent = (route.mode === "admin") ? "режим мастера" : "моя тетрадка";

  el.querySelector("#chCopyCode").onclick = async ()=>{
    const code = `${route.uid}:${route.charId}`;
    try{
      await navigator.clipboard.writeText(code);
      alert("Код персонажа скопирован:\n" + code);
    }catch{
      prompt("Скопируйте вручную:", code);
    }
  };

  // default tab
  setActiveTab("notebook");

  cleanup();
  mountPages(route);
  mountParams(route, c);
  mountInventory(route);
  mountGallery(route);
  mountMaster(route);
  mountNotion(route, c);
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
