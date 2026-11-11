/* Homepage behaviour: the terminal replay and the AI Guy clips. Header, menu, reveals and the hero
   scene live in site.js. */
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

  // AI Guy clips: muted loops that load and play only while on screen. Tap a clip for its sound;
  // one clip has sound at a time. Reduced motion or Save-Data: nothing plays until tapped.
  function initAiGuy() {
    const band = document.querySelector("[data-aiguy]");
    if (!band) return;
    const clips = Array.from(band.querySelectorAll("video"));
    const buttons = Array.from(band.querySelectorAll("[data-aiguy-sound]"));
    const saveData = Boolean(navigator.connection && navigator.connection.saveData);
    const autoplay = !reducedMotion && !saveData;

    const start = (video) => {
      if (!video.getAttribute("src") && video.dataset.src) video.src = video.dataset.src;
      const playing = video.play();
      if (playing && playing.catch) playing.catch(() => {});
    };
    const setSound = (video, on) => {
      video.muted = !on;
      const button = buttons[clips.indexOf(video)];
      if (button) button.setAttribute("aria-pressed", on ? "true" : "false");
    };
    const toggle = (video) => {
      const on = video.muted || video.paused;
      clips.forEach((other) => {
        if (other !== video) setSound(other, false);
      });
      setSound(video, on);
      if (on) start(video);
      else if (!autoplay) video.pause();
    };

    clips.forEach((video, i) => {
      video.addEventListener("click", () => toggle(video));
      if (buttons[i]) buttons[i].addEventListener("click", () => toggle(video));
    });

    // Leaving the screen always pauses and mutes, even for a clip started by hand.
    if (!("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          if (autoplay) start(entry.target);
        } else {
          setSound(entry.target, false);
          entry.target.pause();
        }
      });
    }, { threshold: 0.5 });
    clips.forEach((video) => observer.observe(video));
  }

  initTerminal();
  initAiGuy();
}());
