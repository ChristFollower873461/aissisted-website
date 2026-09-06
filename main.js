(function () {
  function initAxonPixel() {
    if (window.__aissistedAxonPixelRequested || document.querySelector("script[data-axon-pixel]")) return;

    window.__aissistedAxonPixelRequested = true;
    const script = document.createElement("script");
    script.src = "/axon-pixel.js?v=20260718";
    script.async = true;
    script.dataset.axonPixel = "true";
    document.head.appendChild(script);
  }

  function initMenu() {
    const toggle = document.querySelector("[data-menu-toggle]");
    const nav = document.querySelector("[data-nav-links]");
    if (!toggle || !nav) return;

    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
    });

    nav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  function initYear() {
    document.querySelectorAll("[data-year]").forEach((node) => {
      node.textContent = String(new Date().getFullYear());
    });
  }

  function initFocusMode() {
    document.body.addEventListener("keydown", (event) => {
      if (event.key === "Tab") {
        document.body.classList.add("user-is-tabbing");
      }
    }, { once: true });
  }

  function initHeroScene() {
    const host = document.querySelector("[data-hero-scene]");
    if (!host || !host.dataset.heroScene) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const connection = navigator.connection;
    if (connection && (connection.saveData || /(^|-)2g$|^3g$/.test(connection.effectiveType || ""))) return;

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
    // Let the first paint, the poster and the largest-contentful-paint settle before the
    // bundle competes for bandwidth or main-thread time; the poster covers the wait.
    const afterSettle = () => window.setTimeout(whenIdle, 1400);
    if (document.readyState === "complete") {
      afterSettle();
    } else {
      window.addEventListener("load", afterSettle, { once: true });
    }
  }

  function init() {
    initAxonPixel();
    initMenu();
    initYear();
    initFocusMode();
    initHeroScene();
  }

  init();
}());
