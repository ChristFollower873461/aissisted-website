(() => {
  const form = document.querySelector("[data-contact-form]");
  if (!form) return;

  const submitButton = form.querySelector("[data-contact-submit]");
  const statusNode = document.getElementById("contact-submit-status");
  const pendingAttempts = new Map();
  const trackedInquiries = new Set();
  const requestTimeoutMs = 15000;
  const uncertainMessage = "We couldn't confirm receipt. Your message is still here. Keep it unchanged and choose Send inquiry to retry.";
  let inFlight = false;

  function createIdempotencyKey() {
    if (globalThis.crypto?.randomUUID) {
      return `contact-${globalThis.crypto.randomUUID()}`;
    }

    const random = Math.random().toString(36).slice(2);
    return `contact-${Date.now().toString(36)}-${random}`;
  }

  function setStatus(message, tone = "") {
    if (!statusNode) return;
    statusNode.textContent = message;
    statusNode.className = "contact-submit-status is-visible";
    if (tone) statusNode.classList.add(`is-${tone}`);
  }

  function clearStatus() {
    if (!statusNode) return;
    statusNode.textContent = "";
    statusNode.className = "contact-submit-status";
  }

  function readFormFields() {
    const formData = new FormData(form);
    return {
      name: formData.get("name"),
      email: formData.get("email"),
      phone: formData.get("phone"),
      company: formData.get("company"),
      audience: formData.get("audience"),
      message: formData.get("message"),
      websiteLeaveBlank: formData.get("websiteLeaveBlank"),
      consentToSubmit: formData.get("consentToSubmit") === "on"
    };
  }

  function getAttempt(fields, signature) {
    if (pendingAttempts.has(signature)) return pendingAttempts.get(signature);
    const fallbackSourcePage = new FormData(form).get("sourcePage") || "/contact/";
    let sourcePage = fallbackSourcePage;
    try {
      sourcePage = globalThis.AicAdsTracking?.attributionSourcePage?.(fallbackSourcePage) || fallbackSourcePage;
    } catch (_) {
      // Attribution is optional and cannot prevent the enquiry from being sent.
    }
    const payload = { ...fields, sourcePage };
    const attempt = { key: createIdempotencyKey(), body: JSON.stringify(payload), payload };
    // Keep uncertain requests in this page only, including when the user edits then reverts.
    pendingAttempts.set(signature, attempt);
    return attempt;
  }

  async function sendAttempt(attempt) {
    const controller = new AbortController();
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(uncertainMessage));
        controller.abort();
      }, requestTimeoutMs);
    });
    try {
      return await Promise.race([
        (async () => {
          const response = await fetch("/api/contact/submit", {
            method: "POST",
            headers: {
              accept: "application/json",
              "content-type": "application/json",
              "idempotency-key": attempt.key
            },
            body: attempt.body,
            signal: controller.signal
          });
          const result = JSON.parse(await response.text());
          if (!response.ok || result?.ok !== true) {
            if (result?.ok === false && typeof result.error === "string" && result.error.trim()) {
              return { error: result.error };
            }
            throw new Error(uncertainMessage);
          }
          if (typeof result.inquiry?.id !== "string" || !result.inquiry.id.trim()) {
            throw new Error(uncertainMessage);
          }
          return { inquiryId: result.inquiry.id };
        })(),
        deadline
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  function bestEffort(callback) {
    try {
      Promise.resolve(callback()).catch(() => {});
    } catch (_) {
      // Analytics must never change a confirmed submission outcome.
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (inFlight) return;
    clearStatus();

    if (!form.reportValidity()) return;

    inFlight = true;
    submitButton.disabled = true;
    submitButton.textContent = "Sending...";

    try {
      const fields = readFormFields();
      const signature = JSON.stringify(fields);
      const attempt = getAttempt(fields, signature);
      const result = await sendAttempt(attempt);
      if (result.error) {
        setStatus(result.error, "error");
        return;
      }

      pendingAttempts.delete(signature);
      const fieldsUnchanged = JSON.stringify(readFormFields()) === signature;
      if (fieldsUnchanged) form.reset();
      setStatus(fieldsUnchanged
        ? "Inquiry received. AIssisted Consulting will reply directly."
        : "Inquiry received. Your newer edits are still here and have not been sent.", "success");
      if (!trackedInquiries.has(result.inquiryId)) {
        trackedInquiries.add(result.inquiryId);
        bestEffort(() => globalThis.aissistedAxon?.trackGenerateLead?.({ currency: "USD", value: 25 }));
        bestEffort(() => globalThis.AicAdsTracking?.emit?.("aic_contact_submit", {
          channel: "website_contact",
          creative_angle: "local_ai_implementation",
          inquiry_topic: attempt.payload.audience || "not_selected"
        }));
      }
    } catch (_) {
      setStatus(uncertainMessage, "error");
    } finally {
      inFlight = false;
      submitButton.disabled = false;
      submitButton.textContent = "Send inquiry";
    }
  });
})();
