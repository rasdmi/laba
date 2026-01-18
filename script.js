import { CONTENT } from "./content.js";
const $ = (s, r=document)=>r.querySelector(s);

function render(){
  $("#brandName").textContent = CONTENT.title;
  $("#brandSub").textContent = CONTENT.subtitle;

  const badges = $("#badges");
  badges.innerHTML = "";
  CONTENT.badges.forEach(b=>{
    const el = document.createElement("div");
    el.className = "badge";
    el.textContent = b;
    badges.appendChild(el);
  });

  $("#heroTitle").textContent = CONTENT.title;
  $("#heroSub").textContent = CONTENT.subtitle;
  $("#heroLead").textContent = CONTENT.heroLead;
  $("#cta1").textContent = CONTENT.cta1;
  $("#cta2").textContent = CONTENT.cta2;

  $("#whatH").textContent = CONTENT.sections.what.h;
  $("#whatP").textContent = CONTENT.sections.what.p;

  $("#toolsH").textContent = CONTENT.sections.tools.h;
  const tools = $("#toolsGrid");
  tools.innerHTML = "";
  CONTENT.sections.tools.items.forEach(it=>{
    const div = document.createElement("div");
    div.className = "tool";
    div.innerHTML = `<b>${it.t}</b><span>${it.p}</span>`;
    tools.appendChild(div);
  });

  $("#mapH").textContent = CONTENT.sections.map.h;
  $("#mapP").textContent = CONTENT.sections.map.p;
  const map = $("#mapGrid");
  map.innerHTML = "";
  CONTENT.sections.map.steps.forEach((s, idx)=>{
    const div = document.createElement("div");
    div.className = "step";
    div.style.transform = `rotate(${(idx%2?1:-1) * (0.35 + idx*0.06)}deg)`;
    div.innerHTML = `<div class="n">${s.n}</div><div class="t">${s.t}</div><div class="d">${s.p}</div>`;
    map.appendChild(div);
  });

  $("#startH").textContent = CONTENT.sections.start.h;
  $("#startP").textContent = CONTENT.sections.start.p;
  const bl = $("#startBullets");
  bl.innerHTML = "";
  CONTENT.sections.start.bullets.forEach(x=>{
    const d = document.createElement("div");
    d.className = "bul";
    d.textContent = x;
    bl.appendChild(d);
  });

  $("#footerText").textContent = CONTENT.footer;
}

function anchors(){
  document.addEventListener("click",(e)=>{
    const a = e.target.closest("a[data-scroll]");
    if (!a) return;
    e.preventDefault();
    const id = a.getAttribute("href");
    const el = document.querySelector(id);
    if (!el) return;
    el.scrollIntoView({behavior:"smooth", block:"start"});
  });
}

function ctas(){
  $("#cta1").addEventListener("click",(e)=>{
    e.preventDefault();
    alert("Демо CTA.\nДальше подключим Telegram/форму записи и даты.");
  });
}

render(); anchors(); ctas();
