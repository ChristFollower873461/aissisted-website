(function () {
  const form = document.querySelector("[data-fit-call-form]");
  if (!form) return;
  const status = form.querySelector("[data-fit-call-status]");
  const button = form.querySelector("button[type='submit']");

  function setStatus(message, tone = "") {
    status.textContent = message;
    status.className = `contact-submit-status is-visible${tone ? ` is-${tone}` : ""}`;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    button.disabled = true;
    setStatus("Sending your request...");

    try {
      const response = await fetch("/api/book/fit-call", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
          phone: data.get("phone"),
          company: data.get("company"),
          routeId: data.get("routeId"),
          reason: data.get("summary"),
          sourcePage: globalThis.AicAdsTracking?.attributionSourcePage?.("/book/#fit-call") || "/book/#fit-call",
          consentToSubmit: data.get("consentToSubmit") === "on",
          websiteLeaveBlank: data.get("websiteLeaveBlank")
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || "We could not send the request.");
      form.reset();
      setStatus("Request received. AIssisted Consulting will review the fit before scheduling anything.", "success");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "We could not send the request.", "error");
    } finally {
      button.disabled = false;
    }
  });
})();
