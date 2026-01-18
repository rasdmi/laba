import { SITE } from "./content.js";

const setText = (el, txt) => { if (el) el.textContent = txt; };

function mount(){
  // brand + hero
  setText(document.querySelector("[data-brand]"), SITE.brand);

  const h1 = document.querySelector("[data-hero-title]");
  if (h1) h1.innerHTML = `<span class="accent">${SITE.hero.title}</span>`;

  setText(document.querySelector("[data-hero-subtitle]"), SITE.hero.subtitle);

  // left
  setText(document.querySelector("[data-left-tag]"), SITE.split.left.tag);
  setText(document.querySelector("[data-left-title]"), SITE.split.left.title);

  const leftText = document.querySelector("[data-left-text]");
  if (leftText){
    leftText.innerHTML = SITE.split.left.text.map(p=>`<p>${p}</p>`).join("");
  }

  // right
  setText(document.querySelector("[data-right-tag]"), SITE.split.right.tag);
  setText(document.querySelector("[data-right-title]"), SITE.split.right.title);

  const rightText = document.querySelector("[data-right-text]");
  if (rightText){
    rightText.innerHTML = SITE.split.right.text.map(p=>`<p>${p}</p>`).join("");
  }

  // contacts
  setText(document.querySelector("[data-contacts-title]"), SITE.contacts.title);
  setText(document.querySelector("[data-telegram-label]"), SITE.contacts.telegramLabel);
  setText(document.querySelector("[data-portfolio-label]"), SITE.contacts.portfolioLabel);

  const tg = document.querySelector("[data-telegram]");
  if (tg){
    tg.href = SITE.contacts.telegramHref;
    tg.textContent = SITE.contacts.telegramLabel;
  }
  const pf = document.querySelector("[data-portfolio]");
  if (pf){
    pf.href = SITE.contacts.portfolioHref;
    pf.textContent = SITE.contacts.portfolioLabel;
  }

  setText(document.querySelector("[data-footer-left]"), SITE.brand);

  // CTAs
  const c1 = document.querySelector("[data-cta-primary]");
  const c2 = document.querySelector("[data-cta-secondary]");
  if (c1){
    c1.textContent = SITE.cta.primary.label;
    c1.href = SITE.cta.primary.href;
    c1.target = "_blank";
    c1.rel = "noopener";
  }
  if (c2){
    c2.textContent = SITE.cta.secondary.label;
    c2.href = SITE.cta.secondary.href;
    c2.target = "_blank";
    c2.rel = "noopener";
  }
}

function smoothScroll(){
  document.addEventListener("click",(e)=>{
    const a = e.target.closest("[data-scroll]");
    if (!a) return;
    const href = a.getAttribute("href");
    if (!href || !href.startsWith("#")) return;
    e.preventDefault();
    const el = document.querySelector(href);
    if (!el) return;
    el.scrollIntoView({behavior:"smooth", block:"start"});
  });
}

mount();
smoothScroll();
