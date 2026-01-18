// drawing.js
import { auth, storage } from "./firebase-config.js";
import { ref as sRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

function ensureStyles(){
  if (document.getElementById("drawStyles")) return;
  const s = document.createElement("style");
  s.id = "drawStyles";
  s.textContent = `
    .drawModal{position:fixed;inset:0;background:rgba(0,0,0,.22);display:none;align-items:center;justify-content:center;z-index:95;}
    .drawCard{width:min(980px,calc(100vw - 28px));height:min(720px,calc(100vh - 28px));border-radius:26px;background:rgba(255,255,255,.94);border:1px solid rgba(23,23,23,.18);box-shadow:0 18px 50px rgba(0,0,0,.14);overflow:hidden;display:flex;flex-direction:column;}
    .drawTop{padding:12px 14px;border-bottom:1px solid rgba(23,23,23,.10);display:flex;align-items:center;gap:10px;font-family:"Vasek",ui-sans-serif;flex-wrap:wrap;}
    .drawTop input{flex:1 1 240px;padding:10px 12px;border-radius:14px;border:1px solid rgba(23,23,23,.14);background:rgba(255,255,255,.92);font-family:ui-sans-serif,system-ui;}
    .drawBtn{border:1px solid rgba(23,23,23,.16);background:rgba(255,255,255,.85);border-radius:14px;padding:10px 12px;cursor:pointer;font-family:"Vasek",ui-sans-serif;}
    .drawCanvasWrap{flex:1;display:grid;place-items:center;background:rgba(23,23,23,.03);}
    canvas{width:100%;height:100%;background:white;touch-action:none;}
  `;
  document.head.appendChild(s);
}

function ensureModal(){
  let m = document.getElementById("drawModal");
  if (m) return m;

  m = document.createElement("div");
  m.id = "drawModal";
  m.className = "drawModal";
  m.innerHTML = `
    <div class="drawCard">
      <div class="drawTop">
        <div style="font-size:18px;">Рисунок</div>
        <input id="drawTitle" placeholder="Название рисунка (необязательно)" />
        <button class="drawBtn" id="drawClear" type="button">очистить</button>
        <button class="drawBtn" id="drawSave" type="button">сохранить</button>
        <button class="drawBtn" id="drawClose" type="button">✕</button>
      </div>
      <div class="drawCanvasWrap"><canvas id="drawCanvas"></canvas></div>
    </div>
  `;
  document.body.appendChild(m);

  m.addEventListener("click", (e)=>{ if (e.target===m) close(); });

  const canvas = m.querySelector("#drawCanvas");
  const ctx = canvas.getContext("2d");
  let drawing = false;
  let last = null;

  function resize(){
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.fillStyle = "white";
    ctx.fillRect(0,0,rect.width,rect.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 3.2;
    ctx.strokeStyle = "rgba(23,23,23,.92)";
  }

  function pointFromEvent(e){
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left), y: (e.clientY - rect.top) };
  }

  canvas.addEventListener("pointerdown", (e)=>{ drawing=true; last=pointFromEvent(e); canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", (e)=>{
    if (!drawing) return;
    const p=pointFromEvent(e);
    ctx.beginPath(); ctx.moveTo(last.x,last.y); ctx.lineTo(p.x,p.y); ctx.stroke();
    last=p;
  });
  canvas.addEventListener("pointerup", ()=>{ drawing=false; last=null; });
  canvas.addEventListener("pointercancel", ()=>{ drawing=false; last=null; });

  function clear(){
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = "white";
    ctx.fillRect(0,0,rect.width,rect.height);
  }

  async function save(){
    const uid = auth.currentUser?.uid;
    const active = window.__CHAR_CTX__?.active;
    if (!uid || !active){ alert("Сначала откройте персонажа"); return; }

    const title = m.querySelector("#drawTitle").value.trim() || "Рисунок";
    const blob = await new Promise((resolve)=> canvas.toBlob(resolve, "image/png"));
    if (!blob){ alert("Не удалось сохранить рисунок"); return; }

    const path = `users/${uid}/characters/${active.id}/drawings/${Date.now()}.png`;
    const storageRef = sRef(storage, path);
    await uploadBytes(storageRef, blob, { contentType: "image/png" });
    const url = await getDownloadURL(storageRef);

    await window.__CHAR_CTX__.addDrawingPage(title, url, path);
    close();
  }

  function open(){ resize(); m.querySelector("#drawTitle").value=""; m.style.display="flex"; }
  function close(){ m.style.display="none"; }

  m.querySelector("#drawClose").onclick = close;
  m.querySelector("#drawClear").onclick = clear;
  m.querySelector("#drawSave").onclick = save;

  window.addEventListener("resize", ()=>{ if (m.style.display==="flex") resize(); });
  window.openDrawing = open;

  return m;
}

ensureStyles();
ensureModal();
