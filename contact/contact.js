(() => {
  const form = document.querySelector("[data-contact-form]");
  if (!form) return;

  const submitButton = form.querySelector("[data-contact-submit]");
  const statusNode = document.getElementById("contact-submit-status");

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

  async function readPayload(response) {
    const text = await response.text();
    if (!text) return {};

    try {
      return JSON.parse(text);
    } catch (error) {
      return { ok: false, error: text.slice(0, 240) };
    }
  }

  function buildPayload() {
    const formData = new FormData(form);
    return {
      name: formData.get("name"),
      email: formData.get("email"),
      phone: formData.get("phone"),
      company: formData.get("company"),
      audience: formData.get("audience"),
      message: formData.get("message"),
      sourcePage: formData.get("sourcePage") || "/contact/",
      websiteLeaveBlank: formData.get("websiteLeaveBlank"),
      consentToSubmit: formData.get("consentToSubmit") === "on"
    };
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearStatus();

    if (!form.reportValidity()) return;

    const idempotencyKey = createIdempotencyKey();
    const payload = buildPayload();

    submitButton.disabled = true;
    submitButton.textContent = "Sending...";

    try {
      const response = await fetch("/api/contact/submit", {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "idempotency-key": idempotencyKey
        },
        body: JSON.stringify(payload)
      });
      const result = await readPayload(response);

      if (!response.ok || result.ok === false) {
        throw new Error(result.error || "The inquiry could not be sent.");
      }

      setStatus("Inquiry received. AIssisted Consulting will reply directly.", "success");
      form.reset();
    } catch (error) {
      const message = error instanceof Error ? error.message : "The inquiry could not be sent.";
      setStatus(message, "error");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Send inquiry";
    }
  });
})();
