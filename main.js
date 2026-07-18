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

  function init() {
    initAxonPixel();
    initMenu();
    initYear();
    initFocusMode();
  }

  init();
}());
