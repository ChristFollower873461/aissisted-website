/* Homepage behaviour: the terminal replay. Header, menu, reveals and the hero scene live in site.js. */
(function () {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

  initTerminal();
}());
