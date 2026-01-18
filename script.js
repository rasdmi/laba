import { CONTENT } from "./content.js";
const $ = (s, r=document) => r.querySelector(s);

function render(){
  $("#brandName").textContent = CONTENT.title;
  $("#brandSub").textContent = CONTENT.subtitle;

  $("#heroTitle").innerHTML = `<span class="accent">${CONTENT.title}</span>`;
  $("#heroSub").textContent = CONTENT.subtitle;
  $("#heroLead").textContent = CONTENT.lead;

  $("#ctaPrimary").textContent = CONTENT.ctaPrimary;
  $("#ctaSecondary").textContent = CONTENT.ctaSecondary;

  const chips = $("#chips");
  chips.innerHTML = "";
  CONTENT.chips.forEach(x=>{
    const d=document.createElement("div");
    d.className="chip";
    d.textContent=x;
    chips.appendChild(d);
  });

  const b0 = CONTENT.blocks[0];
  $("#blockLeft").innerHTML = `<h3 class="h2">${b0.h}</h3><div class="p">${b0.p}</div>`;

  const b1 = CONTENT.blocks[1];
  $("#blockRight").innerHTML = `<h3 class="h2">${b1.h}</h3>
    <ul class="ul">${b1.bullets.map(li=>`<li>${li}</li>`).join("")}</ul>`;

  const b2 = CONTENT.blocks[2];
  $("#blockHow").innerHTML = `<h3 class="h2">${b2.h}</h3>
    <div class="steps">
      ${b2.steps.map(s=>`
        <div class="step">
          <div class="n">${s.n}</div>
          <div class="t">${s.t}</div>
          <div class="d">${s.d}</div>
        </div>
      `).join("")}
    </div>
    <div class="ctas" style="margin-top:14px;">
      <a class="btn primary" id="ctaPrimary2" href="#start" data-scroll>Хочу в мастерскую</a>
      <a class="btn secondary" href="#top" data-scroll>Наверх</a>
    </div>
  `;

  $("#footerLeft").textContent = CONTENT.footerLeft;
  $("#footerRight").textContent = CONTENT.footerRight;
}

function smoothScroll(){
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

function cta(){
  const handler = (e)=>{
    e.preventDefault();
    alert("Запись — демо.\nПодключим Telegram/форму и даты в следующей версии.");
  };
  $("#ctaPrimary").addEventListener("click", handler);
  document.addEventListener("click",(e)=>{
    if (e.target && e.target.id==="ctaPrimary2") handler(e);
  });
}

render();
smoothScroll();
cta();
