(function () {
  const script = document.querySelector('script[src$="main.js"]');
  const root = script ? new URL(".", script.src) : new URL("./", window.location.href);

  function loadOptionalConfig() {
    return new Promise((resolve) => {
      const tag = document.createElement("script");
      tag.src = new URL("config.js", root).toString();
      tag.defer = true;
      tag.onload = resolve;
      tag.onerror = resolve;
      document.head.appendChild(tag);
    });
  }

  function initMenu() {
    const toggle = document.querySelector("[data-menu-toggle]");
    const nav = document.querySelector("[data-nav-links]");
    if (!toggle || !nav) return;

    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
    });
  }

  function initActiveNav() {
    const page = document.body.dataset.page;
    if (!page) return;
    document.querySelectorAll("[data-nav]").forEach((link) => {
      if (link.dataset.nav === page) link.setAttribute("aria-current", "page");
    });
  }

  function initYear() {
    document.querySelectorAll("[data-year]").forEach((node) => {
      node.textContent = String(new Date().getFullYear());
    });
  }

  function initReveal() {
    const nodes = document.querySelectorAll(".reveal");
    if (!nodes.length) return;

    if (!("IntersectionObserver" in window)) {
      nodes.forEach((node) => node.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });

    nodes.forEach((node) => observer.observe(node));
  }

  function localZoneResult(value) {
    const query = value.toLowerCase();
    const close = ["ocala", "34470", "34471", "34472", "34474", "gainesville", "the villages", "lady lake"];
    const remote = ["orlando", "tampa", "jacksonville", "daytona", "lakeland", "sarasota"];
    const matchedClose = close.some((item) => query.includes(item));
    const matchedRemote = remote.some((item) => query.includes(item));

    if (matchedClose) {
      return {
        headline: "High-fit local service zone",
        body: "This looks like an Ocala or nearby Central Florida workflow. Discovery can include local context, service-area routing, and in-person setup assumptions when needed."
      };
    }

    if (matchedRemote || query.includes("fl")) {
      return {
        headline: "Remote-first Florida fit",
        body: "This appears to be a Florida service area that can be assessed remotely first, with rollout designed around call urgency, route rules, and owner reporting."
      };
    }

    return {
      headline: "National remote review",
      body: "The workflow can still be evaluated remotely. Share the current intake, scheduling, and follow-up process so fit can be judged before implementation."
    };
  }

  async function lookupSlpy(query, config) {
    const key = config && config.slpy && config.slpy.apiKey;
    const country = (config && config.slpy && config.slpy.country) || "us";
    if (!key) return null;

    const params = new URLSearchParams({
      query,
      country,
      key
    });

    const response = await fetch(`https://api.slpy.com/v1/search?${params.toString()}`);
    if (!response.ok) throw new Error(`Slpy returned ${response.status}`);
    return response.json();
  }

  function initZoneTool(config) {
    const form = document.querySelector("[data-zone-form]");
    const input = document.querySelector("[data-zone-input]");
    const output = document.querySelector("[data-zone-output]");
    if (!form || !input || !output) return;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const value = input.value.trim();
      if (!value) return;

      output.classList.add("is-loading");
      output.innerHTML = "<strong>Checking service context...</strong><span>Local candidate lookup is running.</span>";

      try {
        const slpy = await lookupSlpy(value, config);
        if (slpy) {
          const address = slpy.properties && slpy.properties.address ? slpy.properties.address : value;
          output.innerHTML = [
            `<strong>Slpy geocoding result: ${address}</strong>`,
            `<span>Accuracy: ${slpy.accuracy || "unknown"} · Level: ${slpy.level || "n/a"}</span>`,
            '<small>Displayed for this lookup only. Slpy and OpenStreetMap attribution applies.</small>'
          ].join("");
          output.classList.remove("is-loading");
          return;
        }
      } catch (error) {
        output.innerHTML = `<strong>Slpy lookup could not complete.</strong><span>${error.message}. Showing local fallback instead.</span>`;
      }

      const fallback = localZoneResult(value);
      output.innerHTML = `<strong>${fallback.headline}</strong><span>${fallback.body}</span>`;
      output.classList.remove("is-loading");
    });
  }

  function initAvosBriefing(config) {
    const form = document.querySelector("[data-avos-form]");
    const text = document.querySelector("[data-avos-text]");
    const output = document.querySelector("[data-avos-output]");
    if (!form || !text || !output) return;

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = text.value.trim();
      if (!value) return;

      const payload = {
        source: "AIssistedConsulting.com local candidate",
        kind: "workflow_intake_context",
        summary: value,
        requestedAt: new Date().toISOString()
      };

      window.dispatchEvent(new CustomEvent("aissisted:avos-memory-query", { detail: payload }));

      const avosConfigured = Boolean(config && config.avos && config.avos.apiKey);
      output.innerHTML = [
        `<strong>${avosConfigured ? "AVOS credential detected." : "AVOS-ready briefing prepared locally."}</strong>`,
        "<span>The workflow context is structured for memory retrieval or handoff. No AVOS write is sent by this static candidate.</span>",
        `<code>${JSON.stringify(payload, null, 2)}</code>`
      ].join("");
    });
  }

  function initContactForms() {
    document.querySelectorAll("[data-contact-form]").forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const data = new FormData(form);
        const lines = [];
        for (const [key, value] of data.entries()) {
          if (String(value).trim()) {
            lines.push(`${key}: ${value}`);
          }
        }

        const subject = encodeURIComponent("AIssisted workflow assessment request");
        const body = encodeURIComponent(lines.join("\n"));
        window.location.href = `mailto:pj@aissistedconsulting.com?subject=${subject}&body=${body}`;
      });
    });
  }

  function initBookingChoice() {
    const buttons = document.querySelectorAll("[data-slot]");
    const output = document.querySelector("[data-selected-slot]");
    if (!buttons.length || !output) return;

    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        buttons.forEach((node) => node.classList.remove("is-selected"));
        button.classList.add("is-selected");
        output.textContent = button.dataset.slot || "Selected appointment";
      });
    });
  }

  async function init() {
    await loadOptionalConfig();
    const config = window.AC_SITE_CONFIG || {};
    initMenu();
    initActiveNav();
    initYear();
    initReveal();
    initZoneTool(config);
    initAvosBriefing(config);
    initContactForms();
    initBookingChoice();
  }

  init();
}());

