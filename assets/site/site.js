/* Shared behaviour for the 2026 site system: floating header, the full-screen menu, scroll reveals,
   year, and the lazy hero scene (any page with a [data-hero-scene] stage). */
(function () {
  const html = document.documentElement;
  html.classList.add("js");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function initHeader() {
    const header = document.querySelector("[data-header]");
    if (!header) return;
    let queued = false;
    const update = () => {
      queued = false;
      header.classList.toggle("is-scrolled", window.scrollY > 24);
    };
    window.addEventListener("scroll", () => {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(update);
    }, { passive: true });
    update();
  }

  // One menu for every viewport: a full-screen overlay. Everything behind it goes inert while it is open.
  function initMenu() {
    const menu = document.querySelector("[data-menu]");
    const opener = document.querySelector("[data-menu-open]");
    if (!menu || !opener) return;
    const closer = menu.querySelector("[data-menu-close]");
    const behind = Array.from(document.body.children).filter((node) => node !== menu && node.tagName !== "SCRIPT");
    let returnFocus = null;
    let hideTimer = 0;

    const setOpen = (open) => {
      window.clearTimeout(hideTimer);
      opener.setAttribute("aria-expanded", String(open));
      if (open) {
        returnFocus = document.activeElement;
        menu.hidden = false;
        void menu.offsetHeight;
        menu.classList.add("is-open");
        html.classList.add("menu-open");
        behind.forEach((node) => node.setAttribute("inert", ""));
        const first = menu.querySelector(".menu-nav a");
        window.setTimeout(() => { if (first) first.focus({ preventScroll: true }); }, reducedMotion ? 0 : 200);
      } else {
        menu.classList.remove("is-open");
        html.classList.remove("menu-open");
        behind.forEach((node) => node.removeAttribute("inert"));
        hideTimer = window.setTimeout(() => { menu.hidden = true; }, reducedMotion ? 0 : 480);
        if (returnFocus && typeof returnFocus.focus === "function") returnFocus.focus({ preventScroll: true });
      }
    };

    opener.addEventListener("click", () => setOpen(true));
    if (closer) closer.addEventListener("click", () => setOpen(false));
    menu.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => setOpen(false)));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && menu.classList.contains("is-open")) setOpen(false);
    });
  }

  function initReveal() {
    const targets = document.querySelectorAll(".reveal");
    if (!targets.length) return;
    if (reducedMotion || !("IntersectionObserver" in window)) {
      targets.forEach((node) => node.classList.add("is-in"));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.08 });
    targets.forEach((node) => observer.observe(node));
  }

  function initYear() {
    document.querySelectorAll("[data-year]").forEach((node) => {
      node.textContent = String(new Date().getFullYear());
    });
  }

  // The constellation. Only when motion is allowed, Save-Data is off, the device is not tiny, WebGL
  // exists and the page has finished loading. Anything that fails leaves the poster in place.
  function initHeroScene() {
    const host = document.querySelector("[data-hero-scene]");
    if (!host || !host.dataset.heroScene) return;
    if (reducedMotion) return;
    const connection = navigator.connection;
    if (connection && (connection.saveData || /(^|-)2g$|^3g$/.test(connection.effectiveType || ""))) return;
    if (navigator.deviceMemory && navigator.deviceMemory < 2) return;

    let webgl = false;
    try {
      const probe = document.createElement("canvas");
      webgl = Boolean(probe.getContext("webgl2") || probe.getContext("webgl"));
    } catch (error) {
      webgl = false;
    }
    if (!webgl) return;

    const mount = () => {
      import(host.dataset.heroScene)
        .then((module) => module.mountHeroScene(host))
        .catch(() => {});
    };
    const whenIdle = () => {
      if (window.requestIdleCallback) {
        window.requestIdleCallback(mount, { timeout: 2500 });
      } else {
        window.setTimeout(mount, 600);
      }
    };
    // Let the first paint and the poster settle before the bundle competes for the main thread.
    const afterSettle = () => window.setTimeout(whenIdle, 900);
    if (document.readyState === "complete") {
      afterSettle();
    } else {
      window.addEventListener("load", afterSettle, { once: true });
    }
  }

  initHeader();
  initMenu();
  initReveal();
  initYear();
  initHeroScene();
}());
