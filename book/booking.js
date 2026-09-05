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
  const policyTitle = document.getElementById("policy-title");
  const policyAcceptanceText = document.getElementById("policy-acceptance-text");
  const FUNNEL_STORAGE_KEY = "aic_paid_plan_funnel_v1";
  const CHECKOUT_STORAGE_KEY = "aic_checkout_retry_v1";
  const CHECKOUT_RETRY_MAX_AGE_MS = 23 * 60 * 60 * 1000;
  const OFFER_FIELDS = ["timezone", "reservationAmountCents", "currency", "reservationAmountFormatted",
    "policyVersion", "policySha256", "releaseId", "offerId", "offerVersion"];
  const REVIEW_MESSAGE = "Your previous checkout needs checking. Call 352-817-3567 or email pj@aissistedconsulting.com before starting another checkout.";

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
    policySha256: "",
    releaseId: "",
    offerId: "",
    offerVersion: 0,
    submitting: false,
    usingPreviewSlots: false,
    pendingCheckout: null,
    recoveryBlocked: false,
    completed: false
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

  async function fingerprint(bodyJson) {
    if (!globalThis.crypto?.subtle || typeof TextEncoder === "undefined") {
      throw new Error("Your browser could not save a safe checkout retry. Please use an up-to-date browser and try again.");
    }
    const bytes = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(bodyJson));
    return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function saveCheckout(record) {
    // Store no contact, intake, free-text form fields, or attribution URLs.
    const saved = JSON.stringify({ version: 1, key: record.key, fingerprint: record.fingerprint,
      createdAt: record.createdAt, slot: record.slot, offer: record.offer, measurement: record.measurement });
    try {
      sessionStorage.setItem(CHECKOUT_STORAGE_KEY, saved);
      if (sessionStorage.getItem(CHECKOUT_STORAGE_KEY) !== saved) throw new Error("storage_readback_failed");
    } catch (_error) {
      throw new Error("Your browser could not save a checkout retry. Allow storage for this site, then try again. No checkout was started.");
    }
  }

  function clearCheckout() {
    state.pendingCheckout = null;
    // If removal fails, retaining the original key is safer than a new request on reload.
    try { sessionStorage.setItem(CHECKOUT_STORAGE_KEY, ""); } catch (_error) { /* keep the original durable record */ }
  }

  function restoreCheckout() {
    try {
      const raw = sessionStorage.getItem(CHECKOUT_STORAGE_KEY);
      if (!raw) return;
      if (raw.length > 5000) throw new Error("invalid_saved_checkout");
      const saved = JSON.parse(raw);
      const age = Date.now() - saved.createdAt;
      if (saved.version !== 1 || !/^checkout-[A-Za-z0-9-]{16,180}$/.test(saved.key || "")
          || !/^[a-f0-9]{64}$/.test(saved.fingerprint || "") || !Number.isSafeInteger(saved.createdAt)
          || age < 0 || age > CHECKOUT_RETRY_MAX_AGE_MS || !saved.slot?.slotId
          || !Number.isFinite(Date.parse(saved.slot.startsAt)) || !Number.isFinite(Date.parse(saved.slot.endsAt))
          || !saved.offer || OFFER_FIELDS.some((key) => !Object.hasOwn(saved.offer, key))
          || !saved.measurement || typeof saved.measurement.funnelId !== "string") {
        throw new Error("invalid_saved_checkout");
      }
      // Corrupt display context must fail closed before rendering a restored slot.
      new Intl.DateTimeFormat("en-US", { timeZone: saved.slot.timezone }).format(new Date(saved.slot.startsAt));
      state.pendingCheckout = { ...saved, bodyJson: null, uncertain: true };
      Object.assign(state, Object.fromEntries(OFFER_FIELDS.map((key) => [key, saved.offer[key]])));
      state.slots = [{ ...saved.slot, status: "available" }];
      state.selectedSlotId = saved.slot.slotId;
    } catch (_error) {
      // Missing/old recovery details never authorize a fresh key.
      state.recoveryBlocked = true;
    }
  }

  function checkoutBody(formData) {
    return {
      slotId: state.selectedSlotId,
      sourcePage: state.pendingCheckout?.bodyJson ? JSON.parse(state.pendingCheckout.bodyJson).sourcePage
        : globalThis.AicAdsTracking?.attributionSourcePage?.("/book/") || "/book/",
      websiteLeaveBlank: formData.get("websiteLeaveBlank"),
      policyAccepted: formData.get("policyAccepted") === "on",
      checkoutConsent: true,
      confirmedReservationAmountCents: state.reservationAmountCents,
      confirmedAmountCents: state.reservationAmountCents,
      confirmedCurrency: state.currency,
      confirmedPolicyVersion: state.policyVersion,
      confirmedTermsVersion: state.policyVersion,
      confirmedTermsSha256: state.policySha256,
      confirmedReleaseId: state.releaseId,
      confirmedOfferId: state.offerId,
      confirmedOfferVersion: state.offerVersion,
      contact: { name: formData.get("name"), email: formData.get("email"), phone: formData.get("phone"), company: formData.get("company") },
      intake: { companyWebsite: formData.get("companyWebsite"), industry: formData.get("industry"),
        primaryGoal: formData.get("primaryGoal"), routeId: formData.get("routeId"), notes: formData.get("notes") },
      measurement: state.pendingCheckout?.measurement || funnelContext
    };
  }

  function stripeCheckoutUrl(payload) {
    if (payload?.ok !== true || typeof payload.bookingId !== "string" || !payload.bookingId
        || !/^cs_[A-Za-z0-9_]+$/.test(payload.sessionId || "")) return null;
    try {
      const url = new URL(payload.checkoutUrl);
      return url.protocol === "https:" && url.hostname === "checkout.stripe.com" && !url.username && !url.password
        && !url.port && url.pathname.startsWith("/c/pay/") ? url.href : null;
    } catch (_error) { return null; }
  }

  function createFunnelContext() {
    const entryRoutes = new Set(["book", "home", "services", "navigation", "other"]);
    const ctaIds = new Set([
      "book_direct", "home_hero_paid_plan", "home_catalog_paid_plan",
      "home_footer_paid_plan", "services_hero_paid_plan", "primary_nav_book", "other"
    ]);
    const params = new URLSearchParams(window.location.search);
    const submittedEntryRoute = params.get("entry_route") || "";
    const submittedCtaId = params.get("cta_id") || "";
    let saved = {};
    try { saved = JSON.parse(sessionStorage.getItem(FUNNEL_STORAGE_KEY) || "{}"); } catch (_error) { saved = {}; }
    const funnelId = /^funnel_[A-Za-z0-9_-]{8,80}$/.test(saved.funnelId || "")
      ? saved.funnelId
      : `funnel_${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`}`;
    const context = {
      funnelId,
      entryRoute: entryRoutes.has(submittedEntryRoute)
        ? submittedEntryRoute
        : (entryRoutes.has(saved.entryRoute) ? saved.entryRoute : "book"),
      ctaId: ctaIds.has(submittedCtaId)
        ? submittedCtaId
        : (ctaIds.has(saved.ctaId) ? saved.ctaId : "book_direct")
    };
    try { sessionStorage.setItem(FUNNEL_STORAGE_KEY, JSON.stringify(context)); } catch (_error) { /* best effort */ }
    return context;
  }

  const funnelContext = createFunnelContext();

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
        if (state.pendingCheckout || state.submitting || state.recoveryBlocked || state.completed) {
          showStatus("Retry your previous checkout using the original time and details before choosing another time.", "error", true);
          return;
        }
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
      state.policySha256 = payload.policySha256 || "";
      state.releaseId = payload.releaseId || "";
      state.offerId = payload.offerId || "";
      state.offerVersion = Number(payload.offerVersion || 0);
      state.usingPreviewSlots = false;
      if (payload.policyText) policyText.textContent = payload.policyText;
      if (payload.policyHeading && policyTitle) policyTitle.textContent = payload.policyHeading;
      if (payload.policyAcceptanceText && policyAcceptanceText) {
        policyAcceptanceText.textContent = payload.policyAcceptanceText;
      }
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
    if (state.submitting || state.completed) return;
    clearStatus();
    if (state.recoveryBlocked) {
      showStatus(REVIEW_MESSAGE, "error", true);
      return;
    }
    if (!state.selectedSlotId) {
      showStatus("Select an appointment window before continuing.", "error", true);
      return;
    }
    const formData = new FormData(bookingForm);
    if (formData.get("policyAccepted") !== "on") {
      showStatus("Accept the booking terms before checkout.", "error", true);
      return;
    }
    if (state.usingPreviewSlots) {
      showStatus("Local preview stops before Stripe. On the deployed site this submits to /api/book/create-checkout and redirects to Stripe.", "error", true);
      return;
    }
    state.submitting = true;
    submitButton.disabled = true;
    submitButton.textContent = state.pendingCheckout ? "Retrying checkout..." : "Creating secure checkout...";
    let dispatched = false;
    let knownTerminal = false;
    let controller;
    let timer;
    try {
      const candidateBody = JSON.stringify(checkoutBody(formData));
      const candidateHash = await fingerprint(candidateBody);
      let pending = state.pendingCheckout;
      if (pending) {
        if (Date.now() - pending.createdAt > CHECKOUT_RETRY_MAX_AGE_MS) {
          state.recoveryBlocked = true;
          throw new Error(REVIEW_MESSAGE);
        }
        if (candidateHash !== pending.fingerprint) {
          throw new Error("A previous checkout is still pending. Restore the original details to retry checkout, or contact us for help.");
        }
        pending.bodyJson ||= candidateBody;
      } else {
        const slot = getSelectedSlot();
        pending = { key: createIdempotencyKey(), fingerprint: candidateHash, createdAt: Date.now(),
          bodyJson: candidateBody, uncertain: false,
          slot: Object.fromEntries(["slotId", "startsAt", "endsAt", "timezone", "label", "availabilitySource"].map((key) => [key, slot?.[key] || ""])),
          offer: Object.fromEntries(OFFER_FIELDS.map((key) => [key, state[key]])), measurement: funnelContext };
        saveCheckout(pending); // Must succeed before a request can create provider work.
        state.pendingCheckout = pending;
      }
      controller = new AbortController();
      timer = setTimeout(() => controller.abort(), 30_000);
      dispatched = true;
      const response = await fetch("/api/book/create-checkout", {
        method: "POST", signal: controller.signal,
        headers: { "content-type": "application/json", accept: "application/json", "idempotency-key": pending.key },
        body: pending.bodyJson
      });
      const payload = await response.json();
      const checkoutUrl = response.ok ? stripeCheckoutUrl(payload) : null;
      if (!checkoutUrl) {
        knownTerminal = !pending.uncertain && ((response.status === 400 && payload.code === "validation_failed")
          || (response.status === 409 && payload.code === "slot_unavailable"));
        if (knownTerminal) clearCheckout();
        if (String(payload.code || "").startsWith("checkout_recovery_")
          && !["checkout_recovery_pending", "checkout_recovery_paused"].includes(payload.code)) {
          state.recoveryBlocked = true;
          throw new Error(REVIEW_MESSAGE);
        }
        throw new Error(knownTerminal ? payload.error || "Checkout could not be started. Check your details and try again."
          : "Checkout has not been confirmed yet. Retry checkout using the same details.");
      }
      state.completed = true;
      showStatus("Redirecting to Stripe checkout...", "success", true);
      try {
        window.AicAdsTracking?.emit("aic_booking_checkout_start", {
          channel: "booking", creative_angle: "paid_consult", booking_goal: formData.get("primaryGoal") || "not_selected"
        });
      } catch (_error) { /* Analytics must not prevent an accepted checkout redirect. */ }
      window.location.href = checkoutUrl;
      clearCheckout();
    } catch (error) {
      if (dispatched && state.pendingCheckout) state.pendingCheckout.uncertain = true;
      const message = state.recoveryBlocked ? REVIEW_MESSAGE : dispatched && !knownTerminal
        ? (error.name === "AbortError" ? "Checkout is taking longer than expected. Retry checkout using the same details."
          : "Checkout has not been confirmed yet. Retry checkout using the same details.")
        : error.message;
      showStatus(message, "error", true);
      if (knownTerminal) await loadAvailability();
    } finally {
      clearTimeout(timer);
      state.submitting = false;
      submitButton.disabled = state.completed || state.recoveryBlocked;
      if (!state.completed) submitButton.textContent = state.pendingCheckout ? "Retry checkout" : "Continue to Stripe";
    }
  });

  restoreCheckout();
  syncSummary();
  if (state.recoveryBlocked) {
    submitButton.disabled = true;
    availabilityRoot.innerHTML = '<p class="loading-copy">Your previous checkout needs checking before another time can be selected.</p>';
    showStatus(REVIEW_MESSAGE, "error");
  } else if (state.pendingCheckout) {
    renderAvailability();
    submitButton.textContent = "Retry checkout";
    showStatus("Your previous checkout is still pending. Enter the same details to retry checkout.", "error");
  } else loadAvailability();
}());
