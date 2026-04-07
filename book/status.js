(function () {
  const root = document.getElementById("booking-state");
  if (!root) {
    return;
  }

  const heading = document.getElementById("state-heading");
  const description = document.getElementById("state-description");
  const meta = document.getElementById("state-meta");
  const pill = document.getElementById("state-pill");
  const query = new URLSearchParams(window.location.search);
  const bookingId = query.get("booking_id") || "";
  const sessionId = query.get("session_id") || "";

  function setState(kind, title, message) {
    pill.textContent = kind;
    heading.textContent = title;
    description.textContent = message;
  }

  function renderRows(booking) {
    const rows = [
      ["Appointment window", booking.slot.label],
      ["Reservation amount", booking.reservationAmountFormatted],
      ["Prospect", booking.prospect.name || booking.prospect.emailMasked || "Pending"],
      ["Company", booking.prospect.company || "Not provided"],
      ["Deposit credit", booking.depositCredit.available ? "Available for future invoice credit" : "Created after payment confirmation"]
    ];

    meta.innerHTML = rows
      .map(
        ([label, value]) => `
          <div class="state-row">
            <span>${label}</span>
            <strong>${value}</strong>
          </div>
        `
      )
      .join("");
  }

  async function loadStatus() {
    if (!bookingId && !sessionId) {
      setState(
        "Missing reference",
        "We could not find a booking reference.",
        "Return to the booking page and start the reservation again."
      );
      return;
    }

    try {
      const response = await fetch(
        `/api/book/status?booking_id=${encodeURIComponent(bookingId)}&session_id=${encodeURIComponent(sessionId)}`,
        { headers: { accept: "application/json" } }
      );
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Booking status could not be loaded.");
      }

      renderRows(payload.booking);

      switch (payload.confirmationState) {
        case "confirmed":
          setState(
            "Confirmed",
            "Your appointment is reserved.",
            "Payment is confirmed and the booking record now carries a one-time $200 deposit credit for future service."
          );
          return;
        case "awaiting_webhook":
          setState(
            "Processing",
            "Payment received. Final confirmation is still syncing.",
            "Stripe has completed checkout, but the backend is still waiting for the webhook to mark the slot as confirmed. This page refreshes automatically."
          );
          window.setTimeout(loadStatus, 3000);
          return;
        case "expired":
          setState(
            "Expired",
            "This reservation hold expired before final confirmation.",
            "No appointment window remains reserved. Return to the booking page to choose a new slot."
          );
          return;
        case "failed":
          setState(
            "Payment failed",
            "The reservation did not complete.",
            "No booking was confirmed. Choose a new slot or try payment again from the booking page."
          );
          return;
        case "manual_review":
          setState(
            "Manual review",
            "Payment succeeded, but the reservation needs a manual check.",
            "This usually means the temporary hold became stale or the slot needs conflict review before it can be confirmed. AIssisted has the payment record and will follow up directly."
          );
          return;
        default:
          setState(
            "Processing",
            "Your reservation is still being finalized.",
            "If you just completed payment, stay on this page for a moment while the confirmation signal arrives."
          );
          window.setTimeout(loadStatus, 3000);
      }
    } catch (error) {
      setState(
        "Status unavailable",
        "We could not load the reservation status.",
        `${error.message} If this persists, email pj@aissistedconsulting.com with your receipt and requested appointment window.`
      );
    }
  }

  loadStatus();
})();
