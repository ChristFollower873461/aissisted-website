(function () {
  const availabilityRoot = document.getElementById("availability-root");
  const statusBanner = document.getElementById("booking-status");
  const bookingForm = document.getElementById("booking-form");
  const submitButton = document.getElementById("booking-submit");
  const selectedSlotLabel = document.getElementById("selected-slot-label");
  const selectedSlotMeta = document.getElementById("selected-slot-meta");
  const reservationAmount = document.getElementById("reservation-amount");
  const policyText = document.getElementById("policy-text");

  if (!availabilityRoot || !bookingForm || !submitButton) {
    return;
  }

  const state = {
    slots: [],
    selectedSlotId: "",
    timezone: "America/New_York",
    reservationAmountFormatted: "$200.00",
    submitting: false
  };

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

  function showStatus(message, kind) {
    statusBanner.textContent = message;
    statusBanner.className = "status-banner is-visible";
    statusBanner.classList.add(kind === "success" ? "is-success" : "is-error");
  }

  function clearStatus() {
    statusBanner.textContent = "";
    statusBanner.className = "status-banner";
  }

  function getSelectedSlot() {
    return state.slots.find((slot) => slot.slotId === state.selectedSlotId && slot.status !== "booked") || null;
  }

  function syncSummary() {
    const slot = getSelectedSlot();
    reservationAmount.textContent = state.reservationAmountFormatted;
    selectedSlotLabel.textContent = slot ? slot.label : "Choose a time window";
    selectedSlotMeta.textContent = slot
      ? `Availability source: ${slot.availabilitySource.replace("-", " ")}`
      : "A slot remains temporary until Stripe payment succeeds.";
  }

  function groupSlots(slots) {
    return slots.reduce((groups, slot) => {
      const key = formatDayHeading(slot);
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(slot);
      return groups;
    }, {});
  }

  function renderAvailability() {
    if (!state.slots.length) {
      availabilityRoot.innerHTML =
        '<p class="loading-copy">No open appointment windows are currently published. Contact AIssisted directly if you need an exception or manual scheduling.</p>';
      syncSummary();
      return;
    }

    const groups = groupSlots(state.slots);
    availabilityRoot.innerHTML = Object.entries(groups)
      .map(([heading, slots]) => {
        const options = slots
          .map((slot) => {
            const isBooked = slot.status === "booked";
            if (isBooked) {
              return `
                <button type="button" class="slot-option is-booked" data-slot-id="${slot.slotId}" disabled aria-disabled="true" title="This time is already booked">
                  <strong>${formatSlotTime(slot)}</strong>
                  <span class="slot-badge">Booked</span>
                </button>
              `;
            }
            const selectedClass =
              slot.slotId === state.selectedSlotId ? " slot-option is-selected" : " slot-option";
            return `
              <button type="button" class="${selectedClass.trim()}" data-slot-id="${slot.slotId}">
                <strong>${formatSlotTime(slot)}</strong>
                <span>${slot.timezone}</span>
              </button>
            `;
          })
          .join("");

        return `
          <section class="slot-day">
            <h3>${heading}</h3>
            <div class="slot-options">${options}</div>
          </section>
        `;
      })
      .join("");

    availabilityRoot.querySelectorAll("[data-slot-id]:not([disabled])").forEach((button) => {
      button.addEventListener("click", function () {
        state.selectedSlotId = button.getAttribute("data-slot-id") || "";
        renderAvailability();
        syncSummary();
      });
    });

    syncSummary();
  }

  async function loadAvailability() {
    availabilityRoot.innerHTML =
      '<p class="loading-copy">Checking upcoming availability and current calendar conflicts...</p>';

    try {
      const response = await fetch("/api/book/availability?days=14", {
        headers: { accept: "application/json" }
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Availability could not be loaded.");
      }

      state.slots = payload.slots || [];
      state.timezone = payload.timezone || state.timezone;
      state.reservationAmountFormatted =
        payload.reservationAmountFormatted || state.reservationAmountFormatted;
      policyText.textContent = payload.policyText || policyText.textContent;
      renderAvailability();
    } catch (error) {
      availabilityRoot.innerHTML =
        '<p class="loading-copy">Availability is temporarily unavailable. Call 352-817-3567 or email pj@aissistedconsulting.com while the booking service is being checked.</p>';
      showStatus(error.message, "error");
    }
  }

  bookingForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    clearStatus();

    if (!state.selectedSlotId) {
      showStatus("Select an appointment window before continuing to payment.", "error");
      return;
    }

    if (state.submitting) {
      return;
    }

    const formData = new FormData(bookingForm);
    const policyAccepted = formData.get("policyAccepted") === "on";
    if (!policyAccepted) {
      showStatus("You must accept the reservation policy before checkout.", "error");
      return;
    }

    state.submitting = true;
    submitButton.disabled = true;
    submitButton.textContent = "Creating secure checkout...";

    try {
      const response = await fetch("/api/book/create-checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json"
        },
        body: JSON.stringify({
          slotId: state.selectedSlotId,
          websiteLeaveBlank: formData.get("websiteLeaveBlank"),
          policyAccepted,
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

      showStatus("Redirecting to Stripe checkout...", "success");
      window.location.href = payload.checkoutUrl;
    } catch (error) {
      showStatus(error.message, "error");
      submitButton.disabled = false;
      submitButton.textContent = "Reserve with $200 deposit";
      state.submitting = false;
      await loadAvailability();
    }
  });

  syncSummary();
  loadAvailability();
})();
