(function () {
  const form = document.querySelector("[data-fit-call-form]");
  if (!form) return;
  const status = form.querySelector("[data-fit-call-status]");
  const button = form.querySelector("button[type='submit']");
  const statusBaseClasses = status.className;
  const requestTimeoutMs = 15000;
  const unconfirmedMessage = "We couldn't confirm whether your request was received. Your details are still here. Please contact us before submitting again.";
  let submitting = false;

  function setStatus(message, tone = "") {
    status.textContent = message;
    status.className = `${statusBaseClasses} is-visible${tone ? ` is-${tone}` : ""}`;
  }

  function fieldSignature(data) {
    return JSON.stringify(["name", "email", "phone", "company", "routeId", "summary", "consentToSubmit", "websiteLeaveBlank"]
      .map((name) => data.get(name)));
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting) return;
    submitting = true;
    let timeout;
    let requestStarted = false;

    try {
      if (!form.reportValidity()) return;
      const data = new FormData(form);
      const submittedFields = fieldSignature(data);
      let sourcePage = "/book/#fit-call";
      try {
        sourcePage = globalThis.AicAdsTracking?.attributionSourcePage?.(sourcePage) || sourcePage;
      } catch (_error) { /* Attribution is optional; keep the form's source fallback. */ }
      const body = JSON.stringify({
        name: data.get("name"),
        email: data.get("email"),
        phone: data.get("phone"),
        company: data.get("company"),
        routeId: data.get("routeId"),
        reason: data.get("summary"),
        sourcePage,
        consentToSubmit: data.get("consentToSubmit") === "on",
        websiteLeaveBlank: data.get("websiteLeaveBlank")
      });
      const controller = new AbortController();
      button.disabled = true;
      setStatus("Sending your request...");
      const deadline = new Promise((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(unconfirmedMessage));
          controller.abort();
        }, requestTimeoutMs);
      });
      requestStarted = true;
      const request = (async () => {
        const response = await fetch("/api/book/fit-call", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
          signal: controller.signal
        });
        return { response, payload: await response.json() };
      })();
      // Bound both the request and receipt body, even if the transport ignores abort.
      const { response, payload } = await Promise.race([request, deadline]);
      if (!response.ok) {
        setStatus(typeof payload?.error === "string" && payload.error.trim() ? payload.error : unconfirmedMessage, "error");
        return;
      }
      if (payload?.ok !== true || typeof payload.inquiryId !== "string" || !payload.inquiryId.trim() ||
          payload.status !== "pending_manual_review" || payload.scheduled !== false || payload.paymentRequired !== false) {
        throw new Error(unconfirmedMessage);
      }
      let fieldsUnchanged = false;
      try { fieldsUnchanged = fieldSignature(new FormData(form)) === submittedFields; } catch (_error) { /* Preserve input if it cannot be compared. */ }
      if (fieldsUnchanged) form.reset();
      setStatus(fieldsUnchanged
        ? "Request received. AIssisted Consulting will review the fit before scheduling anything."
        : "Original request received. Your newer changes are still here and have not been sent. AIssisted Consulting will review the fit before scheduling anything.", "success");
    } catch (_error) {
      setStatus(requestStarted ? unconfirmedMessage : "We could not prepare your request. Your details are still here. Please try again.", "error");
    } finally {
      clearTimeout(timeout);
      submitting = false;
      button.disabled = false;
    }
  });
})();
