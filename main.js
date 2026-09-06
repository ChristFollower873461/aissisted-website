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
    // Let the first paint, the poster and the largest-contentful-paint settle before the
    // bundle competes for bandwidth or main-thread time; the poster covers the wait.
    const afterSettle = () => window.setTimeout(whenIdle, 1400);
    if (document.readyState === "complete") {
      afterSettle();
    } else {
      window.addEventListener("load", afterSettle, { once: true });
    }
  }

  // Stage pages (body[data-theme="stage"]): floating nav that turns solid on scroll,
  // staggered scroll reveals, and pointer-tracked tilt + glow on cards.
  const REVEAL_SELECTOR = [
    ".section-kicker", ".workflow-copy", ".content-copy", ".scoreboard-header > div", ".scoreboard-note",
    ".service-integrations > p", ".integration-board", ".privacy-layout > .eyebrow", ".privacy-layout > h2",
    ".boundary-list", ".boundary-layout > *", ".founder-layout > *", ".contact-layout > *", ".credential-intro > *",
    ".capability-card", ".catalog-card", ".process-card", ".path-card", ".info-card", ".step-card",
    ".credential-card", ".fact-list > div",
  ].join(",");
  const TILT_SELECTOR = [
    ".capability-card", ".catalog-card", ".process-card", ".path-card", ".info-card", ".step-card",
    ".credential-card", ".fact-list > div", ".hero-system-panel", ".page-panel", ".founder-card",
  ].join(",");

  function initStage() {
    const body = document.body;
    if (!body.hasAttribute("data-theme")) return;
    body.classList.add("stage-js");

    const header = document.querySelector(".site-header");
    if (header) {
      let queued = false;
      const update = () => {
        header.classList.toggle("is-scrolled", window.scrollY > 24);
        queued = false;
      };
      window.addEventListener("scroll", () => {
        if (queued) return;
        queued = true;
        window.requestAnimationFrame(update);
      }, { passive: true });
      update();
    }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const reveals = Array.from(document.querySelectorAll(REVEAL_SELECTOR))
      .filter((el) => !el.closest(".hero, .page-hero"));
    reveals.forEach((el) => {
      const siblings = Array.from(el.parentElement.children).filter((node) => reveals.includes(node));
      el.style.setProperty("--reveal-i", String(siblings.indexOf(el) % 6));
      el.classList.add("reveal");
    });
    if (reduced || !("IntersectionObserver" in window)) {
      reveals.forEach((el) => el.classList.add("is-in"));
    } else {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        });
      }, { rootMargin: "0px 0px -6% 0px", threshold: 0.06 });
      reveals.forEach((el) => io.observe(el));
    }

    if (reduced || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    document.querySelectorAll(TILT_SELECTOR).forEach((card) => {
      card.classList.add("tilt");
      card.addEventListener("pointermove", (event) => {
        const rect = card.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        card.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
        card.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
        card.style.setProperty("--ry", `${((x - 0.5) * 7).toFixed(2)}deg`);
        card.style.setProperty("--rx", `${((0.5 - y) * 7).toFixed(2)}deg`);
      });
      card.addEventListener("pointerleave", () => {
        card.style.setProperty("--rx", "0deg");
        card.style.setProperty("--ry", "0deg");
      });
    });
  }

  function init() {
    initAxonPixel();
    initMenu();
    initYear();
    initFocusMode();
    initStage();
    initHeroScene();
  }

  init();
}());
