/* Book sale: the $29 buy button and the thanks-page download list. */
(function () {
  "use strict";

  function setText(node, text) {
    if (node) node.textContent = text;
  }

  const buy = document.querySelector("[data-store-buy]");
  if (buy) {
    const status = document.querySelector("[data-store-status]");
    buy.addEventListener("click", async () => {
      buy.disabled = true;
      setText(status, "Opening secure checkout...");
      try {
        const response = await fetch("/api/store/checkout", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}"
        });
        const payload = await response.json().catch(() => ({}));
        if (response.ok && payload.ok && typeof payload.url === "string" && payload.url.startsWith("https://")) {
          window.location.assign(payload.url);
          return;
        }
        setText(status, payload.error || "Checkout could not start. Please try again.");
      } catch (_error) {
        setText(status, "Checkout could not start. Check your connection and try again.");
      }
      buy.disabled = false;
    });
  }

  const thanks = document.querySelector("[data-store-thanks]");
  if (thanks) {
    const heading = document.querySelector("[data-store-heading]");
    const message = document.querySelector("[data-store-message]");
    const list = document.querySelector("[data-store-downloads]");
    const sessionId = new URLSearchParams(window.location.search).get("session_id") || "";

    const fail = (text) => {
      setText(heading, "We couldn't find a paid order.");
      setText(message, text);
    };

    if (!sessionId) {
      fail("This page needs the link from your checkout. If you paid and lost it, email pj@aissistedconsulting.com with your receipt.");
      return;
    }

    fetch(`/api/store/session?session_id=${encodeURIComponent(sessionId)}`, { headers: { accept: "application/json" } })
      .then((response) => response.json().catch(() => ({})).then((payload) => ({ response, payload })))
      .then(({ response, payload }) => {
        if (!response.ok || !payload.ok || !Array.isArray(payload.files)) {
          fail(payload.error || "We could not check this order. Please try again in a minute.");
          return;
        }
        const until = new Date(payload.expiresAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
        setText(heading, "Thank you. Your book is ready.");
        setText(message, `Download all three now. This page works until ${until}, so bookmark it if you want to come back.`);
        payload.files.forEach((file) => {
          const item = document.createElement("li");
          const link = document.createElement("a");
          link.className = "btn btn-gold";
          link.href = file.href;
          link.setAttribute("download", file.filename);
          link.dataset.file = file.id;
          const label = document.createElement("span");
          label.textContent = file.label;
          const name = document.createElement("small");
          name.textContent = file.filename;
          link.append(label, name);
          item.append(link);
          list.append(item);
        });
      })
      .catch(() => fail("We could not check this order. Check your connection and refresh."));
  }
})();
