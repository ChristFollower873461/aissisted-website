(function () {
  const form = document.querySelector("[data-fit-call-form]");
  if (!form) return;
  const status = form.querySelector("[data-fit-call-status]");
  const button = form.querySelector("button[type='submit']");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    button.disabled = true;
    status.textContent = "Sending your request...";

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
          sourcePage: "/book/#fit-call",
          consentToSubmit: data.get("consentToSubmit") === "on",
          websiteLeaveBlank: data.get("websiteLeaveBlank")
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || "We could not send the request.");
      form.reset();
      status.textContent = "Request received. AIssisted Consulting will review the fit before scheduling anything.";
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "We could not send the request.";
    } finally {
      button.disabled = false;
    }
  });
})();
