// script.js
(() => {
  const DATA = window.IDEA_WORKSHOP;
  if (!DATA) {
    console.error("content.js not loaded");
    return;
  }

  const stage = document.getElementById("stage");
  const mapEl = document.getElementById("map");
  const nodesEl = document.getElementById("nodes");
  const pathsSvg = document.getElementById("paths");

  const panel = document.getElementById("panel");
  const panelTitle = document.getElementById("panelTitle");
  const panelMeta = document.getElementById("panelMeta");
  const panelDesc = document.getElementById("panelDesc");
  const panelListTitle = document.getElementById("panelListTitle");
  const panelList = document.getElementById("panelList");
  const panelClose = document.getElementById("panelClose");
  const panelNext = document.getElementById("panelNext");
  const panelPin = document.getElementById("panelPin");

  const btnReset = document.getElementById("btnReset");
  const btnHelp = document.getElementById("btnHelp");
  const modal = document.getElementById("modal");
  const modalClose = document.getElementById("modalClose");

  let activeLens = "kids";
  let activeNodeId = null;
  let pinned = false;

  // --- icons (simple inline svg assets) ---
  const ICONS = {
    spark: "media/icon-spark.svg",
    profile: "media/icon-profile.svg",
    sketch: "media/icon-sketch.svg",
    ai: "media/icon-ai.svg",
    story: "media/icon-story.svg",
    sound: "media/icon-sound.svg",
    media: "media/icon-media.svg",
    craft: "media/icon-craft.svg",
    play: "media/icon-play.svg"
  };

  // build nodes
  const byId = Object.fromEntries(DATA.nodes.map(n => [n.id, n]));
  function el(tag, cls){
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }

  function makeWordSpans(node){
    const wrap = el("div","words");
    const words = (node.words?.[activeLens] || []).slice(0, 7);
    // deterministic layout per node + lens
    const seed = (node.id + ":" + activeLens).split("").reduce((a,c)=>a+c.charCodeAt(0),0);
    function rand(i){
      // tiny PRNG
      const x = Math.sin(seed * 999 + i * 77) * 10000;
      return x - Math.floor(x);
    }

    words.forEach((w, i) => {
      const s = el("span","word");
      s.textContent = w;
      // place around the node card
      const angle = rand(i) * Math.PI * 2;
      const r = 110 + rand(i+9)*50;
      const cx = 110 + Math.cos(angle) * (r * 0.55);
      const cy = 65 + Math.sin(angle) * (r * 0.35);
      s.style.left = cx + "px";
      s.style.top = cy + "px";
      s.style.setProperty("--dx", (rand(i+1)*14+6) + "px");
      s.style.setProperty("--dy", (rand(i+2)*14+6) + "px");
      s.style.setProperty("--rot", ((rand(i+3)*14)-7) + "deg");
      s.style.setProperty("--dur", (5.2 + rand(i+4)*2.8) + "s");
      wrap.appendChild(s);
    });
    return wrap;
  }

  function renderNodes(){
    nodesEl.innerHTML = "";
    DATA.nodes.forEach((node) => {
      const card = el("div","node");
      card.dataset.id = node.id;
      card.style.left = node.x + "px";
      card.style.top  = node.y + "px";

      const top = el("div","node__top");

      const chip = el("div","node__chip");
      const icon = el("div","node__icon");
      icon.style.backgroundImage = `url(${ICONS[node.icon] || ICONS.spark})`;
      chip.appendChild(icon);

      const text = el("div","node__text");
      const title = el("div","node__title");
      title.textContent = node.title;
      const sub = el("div","node__sub");
      sub.textContent = node.subtitle;
      text.appendChild(title);
      text.appendChild(sub);

      const pin = el("div","node__pin");
      top.appendChild(chip);
      top.appendChild(text);
      top.appendChild(pin);

      const footer = el("div","node__footer");
      const tags = el("div","node__tags");
      // show 2–3 tiny tags (from current lens list)
      const items = (node.list?.[activeLens] || []).slice(0, 3);
      items.forEach(t => {
        const tg = el("span","tag");
        tg.textContent = t;
        tags.appendChild(tg);
      });
      const go = el("div","node__go");
      go.textContent = "→";
      footer.appendChild(tags);
      footer.appendChild(go);

      card.appendChild(top);
      card.appendChild(footer);

      card.appendChild(makeWordSpans(node));

      card.addEventListener("click", (e) => {
        e.preventDefault();
        focusNode(node.id, true);
      });

      nodesEl.appendChild(card);
    });

    // re-apply active
    if (activeNodeId) {
      const n = document.querySelector(`.node[data-id="${activeNodeId}"]`);
      if (n) n.classList.add("is-active");
    }
  }

  // paths
  function pathBetween(a, b, alt=false){
    const x1=a.x, y1=a.y, x2=b.x, y2=b.y;
    const mx = (x1+x2)/2;
    const my = (y1+y2)/2;
    const dx = x2-x1;
    const dy = y2-y1;
    // curve perpendicular offset (gives boardgame vibe)
    const k = alt ? 0.12 : 0.20;
    const ox = -dy * k;
    const oy = dx * k;
    const c1x = mx + ox;
    const c1y = my + oy;
    const c2x = mx - ox;
    const c2y = my - oy;
    return `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;
  }

  function renderPaths(){
    // svg viewbox
    const w = mapEl.offsetWidth;
    const h = mapEl.offsetHeight;
    pathsSvg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    pathsSvg.setAttribute("preserveAspectRatio","none");
    pathsSvg.innerHTML = "";

    DATA.edges.forEach(([from,to], idx) => {
      const a = byId[from], b = byId[to];
      if (!a || !b) return;
      const p = document.createElementNS("http://www.w3.org/2000/svg","path");
      p.setAttribute("d", pathBetween(a,b, idx >= 8));
      p.setAttribute("class", idx >= 8 ? "path alt" : "path");
      pathsSvg.appendChild(p);
    });
  }

  // panel
  function fillPanel(node){
    panelTitle.textContent = node.title;
    panelMeta.textContent = DATA.lenses[activeLens]?.label || "";
    panelDesc.textContent = node.lensText?.[activeLens] || "";

    panelListTitle.textContent =
      activeLens === "start" ? "Вопросы / шаги" :
      activeLens === "inspire" ? "Референсы / идеи" :
      activeLens === "parents" ? "Польза / фокус" :
      "Возможности";

    panelList.innerHTML = "";
    (node.list?.[activeLens] || []).forEach((it) => {
      const li = document.createElement("li");
      li.textContent = it;
      panelList.appendChild(li);
    });
  }

  function setActiveCard(id){
    document.querySelectorAll(".node").forEach(n => n.classList.remove("is-active"));
    const card = document.querySelector(`.node[data-id="${id}"]`);
    if (card) card.classList.add("is-active");
  }

  function focusNode(id, scrollIntoView){
    activeNodeId = id;
    const node = byId[id];
    if (!node) return;

    setActiveCard(id);
    fillPanel(node);

    if (scrollIntoView){
      // center node in viewport (horizontal)
      const targetX = Math.max(0, node.x - (stage.clientWidth * 0.5));
      const targetY = Math.max(0, node.y - (stage.clientHeight * 0.45));
      stage.scrollTo({ left: targetX, top: targetY, behavior: "smooth" });
    }
  }

  function nextNodeId(){
    if (!activeNodeId) return DATA.nodes[0]?.id;
    const idx = DATA.nodes.findIndex(n => n.id === activeNodeId);
    return DATA.nodes[Math.min(DATA.nodes.length-1, idx+1)]?.id;
  }

  // lens switching
  document.querySelectorAll(".lens").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".lens").forEach(b => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      activeLens = btn.dataset.lens;
      // rerender nodes to update tags + words
      renderNodes();
      // keep selection
      if (activeNodeId) focusNode(activeNodeId, false);
    });
  });

  // interactions
  btnReset.addEventListener("click", () => focusNode(DATA.nodes[0].id, true));
  panelClose.addEventListener("click", () => { if (!pinned) activeNodeId=null; setActiveCard(""); });
  panelNext.addEventListener("click", () => {
    const nid = nextNodeId();
    if (nid) focusNode(nid, true);
  });

  panelPin.addEventListener("click", () => {
    pinned = !pinned;
    panelPin.textContent = pinned ? "закреплено" : "закрепить";
    panelPin.classList.toggle("ghost", !pinned);
  });

  // modal
  function openModal(){
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden","false");
  }
  function closeModal(){
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden","true");
  }
  btnHelp.addEventListener("click", openModal);
  modalClose.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

  // Shift + wheel => horizontal scroll (nice on mouse)
  stage.addEventListener("wheel", (e) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && e.shiftKey){
      stage.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  }, { passive:false });

  // initial render
  renderNodes();
  renderPaths();
  window.addEventListener("resize", () => renderPaths());
  focusNode(DATA.nodes[0].id, false);
})();
