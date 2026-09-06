/* Homepage behaviour: floating header, scroll reveals, the terminal replay and the lazy hero scene. */
(function () {
  document.documentElement.classList.add("js");
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

  // The terminal is real output, replayed. Lines carry their own text; we only pace them.
  function initTerminal() {
    const terminal = document.querySelector("[data-terminal]");
    if (!terminal) return;
    const lines = Array.from(terminal.querySelectorAll("[data-line]"));
    const replay = terminal.querySelector("[data-replay]");
    let timers = [];
    let running = false;

    const clear = () => {
      timers.forEach((id) => window.clearTimeout(id));
      timers = [];
      lines.forEach((line) => {
        line.classList.remove("is-on", "is-typing");
        if (line.dataset.text !== undefined) line.querySelector("[data-cmd]").textContent = line.dataset.typed ? "" : line.dataset.text;
      });
      terminal.classList.remove("is-done");
    };

    const play = () => {
      clear();
      running = true;
      let at = 200;
      lines.forEach((line) => {
        const pause = Number(line.dataset.pause || 90);
        if (line.dataset.typed !== undefined) {
          const target = line.querySelector("[data-cmd]");
          const text = line.dataset.text || "";
          timers.push(window.setTimeout(() => line.classList.add("is-on", "is-typing"), at));
          const perChar = reducedMotion ? 0 : 14;
          for (let i = 1; i <= text.length; i += 1) {
            timers.push(window.setTimeout(() => { target.textContent = text.slice(0, i); }, at + i * perChar));
          }
          at += text.length * perChar + 60;
          timers.push(window.setTimeout(() => line.classList.remove("is-typing"), at));
        } else {
          timers.push(window.setTimeout(() => line.classList.add("is-on"), at));
        }
        at += reducedMotion ? 0 : pause;
      });
      timers.push(window.setTimeout(() => {
        terminal.classList.add("is-done");
        running = false;
      }, at + 200));
    };

    lines.forEach((line) => {
      if (line.dataset.typed !== undefined) {
        const target = line.querySelector("[data-cmd]");
        line.dataset.text = target.textContent;
        target.textContent = "";
      }
    });

    if (replay) {
      replay.addEventListener("click", () => {
        if (!running) play();
      });
    }

    if (!("IntersectionObserver" in window)) {
      play();
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      play();
    }, { threshold: 0.35 });
    observer.observe(terminal);
  }

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
  initReveal();
  initTerminal();
  initHeroScene();
}());
