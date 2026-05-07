(function () {
  const availabilityRoot = document.getElementById("availability-root");
  const statusBanner = document.getElementById("booking-status");
  const submitStatus = document.getElementById("booking-submit-status");
  const bookingForm = document.getElementById("booking-form");
  const submitButton = document.getElementById("booking-submit");
  const selectedSlotLabel = document.getElementById("selected-slot-label");
  const selectedSlotMeta = document.getElementById("selected-slot-meta");
  const reservationAmount = document.getElementById("reservation-amount");
  const policyText = document.getElementById("policy-text");

  if (!availabilityRoot || !bookingForm || !submitButton) return;

  const isLocalPreview = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)?$/.test(window.location.hostname) || window.location.protocol === "file:";

  const state = {
    slots: [],
    selectedSlotId: "",
    timezone: "America/New_York",
    reservationAmountCents: 22500,
    currency: "usd",
    reservationAmountFormatted: "$225.00",
    policyVersion: "2026-04-06",
    submitting: false,
    usingPreviewSlots: false
  };

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function createIdempotencyKey() {
    if (globalThis.crypto?.randomUUID) {
      return `checkout-${globalThis.crypto.randomUUID()}`;
    }

    return `checkout-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  function addDays(date, days) {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    return copy;
  }

  function createSlot(date, hour, index) {
    const startsAt = new Date(date);
    startsAt.setHours(hour, 0, 0, 0);
    const endsAt = new Date(startsAt);
    endsAt.setHours(hour + 1, 0, 0, 0);
    return {
      slotId: `local-preview-${index}`,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      timezone: state.timezone,
      label: new Intl.DateTimeFormat("en-US", {
        timeZone: state.timezone,
        weekday: "long",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      }).format(startsAt),
      status: "available",
      availabilitySource: "local-preview"
    };
  }

  function previewSlots() {
    const today = new Date();
    return [
      createSlot(addDays(today, 3), 10, 1),
      createSlot(addDays(today, 4), 13, 2),
      createSlot(addDays(today, 5), 15, 3)
    ];
  }

  function formatDayHeading(slot) {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: slot.timezone,
      weekday: "long",
      month: "long",
      day: "numeric"
    }).format(new Date(slot.startsAt));
  }

  function formatSlotTime(slot) {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: slot.timezone,
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date(slot.startsAt));
  }

  function showStatus(message, kind, shouldScroll) {
    [statusBanner, submitStatus].filter(Boolean).forEach((node) => {
      node.textContent = message;
      node.className = "status-banner is-visible";
      if (node === submitStatus) node.classList.add("booking-submit-status");
      node.classList.add(kind === "success" ? "is-success" : "is-error");
    });
    if (shouldScroll) {
      (submitStatus || statusBanner).scrollIntoView({ block: "center" });
    }
  }

  function clearStatus() {
    [statusBanner, submitStatus].filter(Boolean).forEach((node) => {
      node.textContent = "";
      node.className = node === submitStatus ? "status-banner booking-submit-status" : "status-banner";
    });
  }

  function getSelectedSlot() {
    return state.slots.find((slot) => slot.slotId === state.selectedSlotId && slot.status !== "booked") || null;
  }

  function syncSummary() {
    const slot = getSelectedSlot();
    reservationAmount.textContent = state.reservationAmountFormatted;
    selectedSlotLabel.textContent = slot ? slot.label : "Choose a time window";
    selectedSlotMeta.textContent = slot
      ? `Availability source: ${String(slot.availabilitySource || "booking API").replace("-", " ")}`
      : "A slot remains temporary until Stripe payment succeeds.";
  }

  function groupSlots(slots) {
    return slots.reduce((groups, slot) => {
      const key = formatDayHeading(slot);
      if (!groups[key]) groups[key] = [];
      groups[key].push(slot);
      return groups;
    }, {});
  }

  function renderAvailability() {
    if (!state.slots.length) {
      availabilityRoot.innerHTML = '<p class="loading-copy">No open appointment windows are currently published. Contact AIssisted Consulting if you need manual scheduling.</p>';
      syncSummary();
      return;
    }

    const groups = groupSlots(state.slots);
    availabilityRoot.innerHTML = Object.entries(groups).map(([heading, slots]) => {
      const options = slots.map((slot) => {
        const isBooked = slot.status === "booked";
        const selectedClass = slot.slotId === state.selectedSlotId ? " is-selected" : "";
        if (isBooked) {
          return `
            <button type="button" class="slot-option is-booked" data-slot-id="${escapeHtml(slot.slotId)}" disabled aria-disabled="true">
              <strong>${escapeHtml(formatSlotTime(slot))}</strong>
              <span class="slot-badge">Booked</span>
            </button>
          `;
        }
        return `
          <button type="button" class="slot-option${selectedClass}" data-slot-id="${escapeHtml(slot.slotId)}">
            <strong>${escapeHtml(formatSlotTime(slot))}</strong>
            <span>${escapeHtml(slot.timezone)}</span>
          </button>
        `;
      }).join("");

      return `
        <section class="slot-day">
          <h3>${escapeHtml(heading)}</h3>
          <div class="slot-options">${options}</div>
        </section>
      `;
    }).join("");

    availabilityRoot.querySelectorAll("[data-slot-id]:not([disabled])").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedSlotId = button.getAttribute("data-slot-id") || "";
        renderAvailability();
        syncSummary();
      });
    });

    syncSummary();
  }

  async function loadAvailability() {
    availabilityRoot.innerHTML = '<p class="loading-copy">Checking upcoming availability...</p>';

    try {
      const response = await fetch("/api/book/availability?days=14", {
        headers: { accept: "application/json" }
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Availability could not be loaded.");

      state.slots = payload.slots || [];
      state.timezone = payload.timezone || state.timezone;
      state.reservationAmountCents = Number(payload.reservationAmountCents || state.reservationAmountCents);
      state.currency = payload.currency || state.currency;
      state.reservationAmountFormatted = payload.reservationAmountFormatted || state.reservationAmountFormatted;
      state.policyVersion = payload.policyVersion || state.policyVersion;
      state.usingPreviewSlots = false;
      if (payload.policyText) policyText.textContent = payload.policyText;
      renderAvailability();
    } catch (error) {
      if (!isLocalPreview) {
        availabilityRoot.innerHTML = '<p class="loading-copy">Availability is temporarily unavailable. Call 352-817-3567 or email pj@aissistedconsulting.com while the booking service is being checked.</p>';
        showStatus(error.message, "error");
        syncSummary();
        return;
      }

      state.slots = previewSlots();
      state.usingPreviewSlots = true;
      showStatus("Preview slots are shown locally. Stripe checkout is not called from this preview.", "error");
      renderAvailability();
    }
  }

  bookingForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearStatus();

    if (!state.selectedSlotId) {
      showStatus("Select an appointment window before continuing.", "error", true);
      return;
    }

    const formData = new FormData(bookingForm);
    const policyAccepted = formData.get("policyAccepted") === "on";
    if (!policyAccepted) {
      showStatus("Accept the reservation policy before checkout.", "error", true);
      return;
    }

    if (state.usingPreviewSlots) {
      showStatus("Local preview stops before Stripe. On the deployed site this submits to /api/book/create-checkout and redirects to Stripe.", "error", true);
      return;
    }

    if (state.submitting) return;
    state.submitting = true;
    submitButton.disabled = true;
    submitButton.textContent = "Creating secure checkout...";

    try {
      const idempotencyKey = createIdempotencyKey();
      const response = await fetch("/api/book/create-checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "idempotency-key": idempotencyKey
        },
        body: JSON.stringify({
          slotId: state.selectedSlotId,
          websiteLeaveBlank: formData.get("websiteLeaveBlank"),
          policyAccepted,
          checkoutConsent: true,
          confirmedReservationAmountCents: state.reservationAmountCents,
          confirmedCurrency: state.currency,
          confirmedPolicyVersion: state.policyVersion,
          contact: {
            name: formData.get("name"),
            email: formData.get("email"),
            phone: formData.get("phone"),
            company: formData.get("company")
          },
          intake: {
            companyWebsite: formData.get("companyWebsite"),
            industry: formData.get("industry"),
            primaryGoal: formData.get("primaryGoal"),
            notes: formData.get("notes")
          }
        })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok || !payload.checkoutUrl) {
        throw new Error(payload.error || "Checkout could not be created.");
      }

      showStatus("Redirecting to Stripe checkout...", "success", true);
      window.location.href = payload.checkoutUrl;
    } catch (error) {
      showStatus(error.message, "error", true);
      submitButton.disabled = false;
      submitButton.textContent = "Reserve with $225 deposit";
      state.submitting = false;
      await loadAvailability();
    }
  });

  syncSummary();
  loadAvailability();
}());
