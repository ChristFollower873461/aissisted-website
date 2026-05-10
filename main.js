(function () {
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
    initMenu();
    initYear();
    initFocusMode();
  }

  init();
}());
