(() => {
  const form = document.querySelector("[data-deletion-form]");
  if (!form) return;

  const submitButton = form.querySelector("[data-deletion-submit]");
  const statusNode = form.querySelector("[data-deletion-status]");

  function createIdempotencyKey() {
    if (globalThis.crypto?.randomUUID) {
      return `grail-deletion-${globalThis.crypto.randomUUID()}`;
    }

    const random = Math.random().toString(36).slice(2);
    return `grail-deletion-${Date.now().toString(36)}-${random}`;
  }

  function setStatus(message, tone) {
    statusNode.textContent = message;
    statusNode.className = `form-status is-visible is-${tone}`;
  }

  function clearStatus() {
    statusNode.textContent = "";
    statusNode.className = "form-status";
  }

  async function readPayload(response) {
    const responseText = await response.text();
    if (!responseText) return {};

    try {
      return JSON.parse(responseText);
    } catch (error) {
      return { ok: false, error: responseText.slice(0, 240) };
    }
  }

  function buildPayload() {
    const formData = new FormData(form);
    const details = String(formData.get("message") || "").trim();
    const message = [
      "Grail account and associated data deletion request.",
      details ? `Workspace details: ${details}` : "No additional workspace details provided."
    ].join("\n\n");

    return {
      name: formData.get("name"),
      email: formData.get("email"),
      phone: "",
      company: formData.get("company"),
      audience: "privacy_and_control",
      message,
      sourcePage: "/grail/delete-account/",
      websiteLeaveBlank: formData.get("websiteLeaveBlank"),
      consentToSubmit: formData.get("consentToSubmit") === "on"
    };
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearStatus();

    if (!form.reportValidity()) return;

    submitButton.disabled = true;
    submitButton.textContent = "Submitting...";

    try {
      const response = await fetch("/api/contact/submit", {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "idempotency-key": createIdempotencyKey()
        },
        body: JSON.stringify(buildPayload())
      });
      const result = await readPayload(response);

      if (!response.ok || result.ok === false) {
        throw new Error(result.error || "The deletion request could not be submitted.");
      }

      setStatus(
        "Deletion request received. We will acknowledge it within three business days.",
        "success"
      );
      form.reset();
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "The deletion request could not be submitted.";
      setStatus(`${message} You can also email pj@aissistedconsulting.com.`, "error");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Submit deletion request";
    }
  });
})();
