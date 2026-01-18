/* Tiny, no-deps interactions */

(function () {
  const root = document.documentElement;

  // Smooth scroll for internal anchors
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute("href");
    if (!id || id === "#") return;
    const el = document.querySelector(id);
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    history.pushState(null, "", id);
  });

  // Update active nav link on scroll
  const nav = document.querySelector(".nav");
  const navLinks = Array.from(document.querySelectorAll(".nav a[href^='#']"));
  const sections = navLinks
    .map((l) => document.querySelector(l.getAttribute("href")))
    .filter(Boolean);

  const setActive = () => {
    const y = window.scrollY + 120;
    let active = null;
    for (const s of sections) {
      if (s.offsetTop <= y) active = s;
    }
    navLinks.forEach((l) => l.classList.remove("is-active"));
    if (active) {
      const l = navLinks.find((x) => x.getAttribute("href") === `#${active.id}`);
      if (l) l.classList.add("is-active");
    }

    // shrink nav on scroll
    if (nav) {
      nav.classList.toggle("is-scrolled", window.scrollY > 14);
    }
  };

  window.addEventListener("scroll", setActive, { passive: true });
  setActive();

  // Respect reduced motion
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const updateMotionFlag = () => {
    root.dataset.reduceMotion = reduceMotion.matches ? "1" : "0";
  };
  reduceMotion.addEventListener?.("change", updateMotionFlag);
  updateMotionFlag();
})();
