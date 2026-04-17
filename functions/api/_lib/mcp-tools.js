// MCP tool implementations for AIssisted Consulting.
//
// Every tool exports:
//   - name, description, inputSchema (JSON Schema for MCP tools/list)
//   - handler(env, params, ctx) => result object
//
// Handlers reuse the existing booking stack in functions/api/_lib/*.

import { listAvailableSlots } from "./availability.js";
import { getBookingConfig, isStripeConfigured } from "./config.js";
import {
  createStripeCustomer,
  createCheckoutSession
} from "./stripe.js";
import { getBookingStore, SlotUnavailableError } from "./storage.js";
import { sendBookingNotifications } from "./notifications.js";
import {
  addMinutes,
  formatSlotLabel,
  parseSlotId
} from "./time.js";
import {
  FREE_BOOKING_LIMITS,
  cleanupRateCounters
} from "./mcp-rate-limit.js";
import { countFreeBookings, recordFreeBooking } from "./mcp-log.js";

// ---------- Static service catalog ----------

export const SERVICES = [
  {
    id: "ai-hardware-setup",
    name: "AI Hardware + Setup Bundle",
    description:
      "Configured local AI computer delivered and set up at your business, including training and handoff. Hardware and on-site setup are bundled in this single one-time price.",
    price_usd: 1500,
    price_type: "one_time",
    location: "On-site, Ocala, Florida and surrounding area",
    duration_minutes: null,
    bookable_via_mcp: false,
    notes:
      "To purchase, start with a free discovery consult. Hardware orders are confirmed by the AIssisted team after the consult."
  },
  {
    id: "monthly-service",
    name: "Monthly AI Service & Support",
    description:
      "Ongoing support, updates, and agent maintenance for deployed AIssisted systems.",
    price_usd: 500,
    price_type: "recurring_monthly",
    location: "Remote + on-site as needed",
    duration_minutes: null,
    bookable_via_mcp: false,
    notes: "Added to active customers after hardware setup."
  },
  {
    id: "discovery-consult",
    name: "Discovery Consultation",
    description:
      "Free 30-minute call to evaluate whether AIssisted's local-AI approach fits your business. No payment or credit card required.",
    price_usd: 0,
    price_type: "one_time",
    location: "Remote (phone or video)",
    duration_minutes: 30,
    bookable_via_mcp: true,
    notes: "This is the correct entry point for agents booking on behalf of a human."
  },
  {
    id: "paid-consult",
    name: "Paid Deep-Dive Consult",
    description:
      "Paid 30-minute scoping session with Philip Standley for qualified prospects who want a reservation-backed slot.",
    price_usd: 105,
    price_type: "one_time",
    location: "Remote (phone or video)",
    duration_minutes: 30,
    bookable_via_mcp: true,
    notes:
      "Reservation deposit is credited toward service if you become a customer. Non-refundable otherwise."
  }
];

const BOOKABLE_IDS = new Set(
  SERVICES.filter((s) => s.bookable_via_mcp).map((s) => s.id)
);
const KNOWN_IDS = new Set(SERVICES.map((s) => s.id));

function getService(id) {
  return SERVICES.find((s) => s.id === id) || null;
}

// ---------- Small helpers ----------

const FLORIDA_TAX_RATE = 0.07;

function roundCents(value) {
  return Math.round(value * 100) / 100;
}

function validIsoDate(value) {
  if (typeof value !== "string") {
    return false;
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

function daysFromNow(toIsoDate) {
  const today = new Date(Date.now());
  const todayKey = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-${String(today.getUTCDate()).padStart(2, "0")}`;
  const fromMs = Date.parse(`${todayKey}T00:00:00Z`);
  const toMs = Date.parse(`${toIsoDate}T00:00:00Z`);
  return Math.max(1, Math.round((toMs - fromMs) / 86400000) + 1);
}

function isDisposableEmailDomain(email) {
  const domain = String(email || "").toLowerCase().split("@")[1] || "";
  if (!domain) {
    return true;
  }
  return /(?:mailinator|tempmail|guerrillamail|10minutemail|yopmail|sharklasers|getnada|trashmail|dispostable|mintemail)/.test(
    domain
  );
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ""));
}

function limitString(value, fieldName, max) {
  const v = String(value ?? "").trim();
  if (v.length > max) {
    throw new McpToolError(
      -32602,
      `${fieldName} must be ${max} characters or fewer.`
    );
  }
  return v;
}

export class McpToolError extends Error {
  constructor(code, message, data = null) {
    super(message);
    this.name = "McpToolError";
    this.code = code;
    this.data = data;
  }
}

// ---------- Tool: list_services ----------

export const listServicesTool = {
  name: "list_services",
  description:
    "List every service AIssisted Consulting offers, including price, type (one_time or recurring_monthly), and whether it can be booked directly by an AI agent.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  async handler() {
    return { services: SERVICES };
  }
};

// ---------- Tool: get_business_info ----------

export const getBusinessInfoTool = {
  name: "get_business_info",
  description:
    "Return structured information about AIssisted Consulting: location, contact, founder credentials, service area, and a summary of offerings. Use this when a human asks their agent 'what do they do?' or 'where are they?'",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  async handler(env) {
    const config = getBookingConfig(env || {}, "https://aissistedconsulting.com");
    return {
      name: "AIssisted Consulting",
      tagline: "Engineer-Led AI Advice for Real Businesses",
      location: {
        city: "Ocala",
        state: "Florida",
        country: "US",
        service_area: "Ocala, Marion County, and greater Florida"
      },
      contact: {
        email: config.supportEmail || "pj@aissistedconsulting.com",
        website: "https://aissistedconsulting.com",
        booking: "https://aissistedconsulting.com/book"
      },
      founder: {
        name: "Philip James Standley",
        credentials: ["BSET", "CAIC", "CAIS"],
        background:
          "Former Lockheed Martin testing engineer, 3+ years of pest-control operations, building local-first AI systems for small businesses."
      },
      offerings_summary:
        "Local AI systems (hardware + on-site setup + ongoing service), AI consulting, agent operations, and private/on-prem AI deployments for small businesses.",
      policies: {
        hours: "By appointment",
        timezone: config.timezone || "America/New_York",
        languages: ["en"]
      }
    };
  }
};

// ---------- Tool: get_quote ----------

export const getQuoteTool = {
  name: "get_quote",
  description:
    "Return a quote for a specific service, including taxes and estimated shipping where applicable. The quote is valid for 7 days.",
  inputSchema: {
    type: "object",
    required: ["service_id"],
    properties: {
      service_id: {
        type: "string",
        description: "Service id from list_services (for example: 'ai-hardware-setup')"
      },
      shipping_zip: {
        type: "string",
        description:
          "Optional US ZIP for on-site delivery quoting. Ocala/Marion County is always free."
      }
    },
    additionalProperties: false
  },
  async handler(env, params = {}) {
    const serviceId = limitString(params.service_id, "service_id", 80);
    const service = getService(serviceId);
    if (!service) {
      throw new McpToolError(-32602, `Unknown service_id: ${serviceId}`);
    }

    const base = service.price_usd || 0;
    const tax = roundCents(base * FLORIDA_TAX_RATE);
    const shipping = 0; // On-site delivery in the service area is included.
    const total = roundCents(base + tax + shipping);
    const validUntil = new Date(Date.now() + 7 * 86400000).toISOString();

    return {
      service_id: service.id,
      service_name: service.name,
      base_price_usd: base,
      tax_usd: tax,
      shipping_usd: shipping,
      total_usd: total,
      currency: "usd",
      price_type: service.price_type,
      valid_until: validUntil,
      notes:
        service.price_type === "recurring_monthly"
          ? "Recurring monthly price. Tax shown is the first-month Florida sales-tax estimate (7%); actual billing is handled when your service agreement is created."
          : "On-site delivery in Marion County is included. Florida sales tax estimated at 7%."
    };
  }
};

// ---------- Tool: check_availability ----------

function slotInRange(slot, fromMs, toMs) {
  const startMs = new Date(slot.startsAt).getTime();
  return startMs >= fromMs && startMs <= toMs;
}

export const checkAvailabilityTool = {
  name: "check_availability",
  description:
    "Return open appointment slots between date_from and date_to (inclusive) for a bookable service. Slots are 30 minutes in America/New_York and already exclude held/confirmed bookings and calendar busy-time.",
  inputSchema: {
    type: "object",
    required: ["date_from", "date_to", "service_id"],
    properties: {
      date_from: { type: "string", description: "Start date, YYYY-MM-DD" },
      date_to: { type: "string", description: "End date, YYYY-MM-DD (inclusive)" },
      service_id: {
        type: "string",
        description: "One of discovery-consult, paid-consult"
      }
    },
    additionalProperties: false
  },
  async handler(env, params = {}) {
    const dateFrom = limitString(params.date_from, "date_from", 20);
    const dateTo = limitString(params.date_to, "date_to", 20);
    const serviceId = limitString(params.service_id, "service_id", 80);

    if (!validIsoDate(dateFrom) || !validIsoDate(dateTo)) {
      throw new McpToolError(
        -32602,
        "date_from and date_to must be valid YYYY-MM-DD dates."
      );
    }
    if (Date.parse(dateFrom) > Date.parse(dateTo)) {
      throw new McpToolError(-32602, "date_from must be on or before date_to.");
    }
    if (!BOOKABLE_IDS.has(serviceId)) {
      throw new McpToolError(
        -32602,
        `service_id '${serviceId}' is not directly bookable via MCP. Use list_services to see which services are bookable_via_mcp=true.`
      );
    }

    const config = getBookingConfig(env || {}, "https://aissistedconsulting.com");
    const store = getBookingStore(env || {});
    // listAvailableSlots generates slots from today forward, so we ask it for
    // enough days to cover through date_to, then filter to the requested window.
    const days = Math.min(daysFromNow(dateTo), config.lookaheadDays);

    const allSlots = await listAvailableSlots({
      env: env || {},
      origin: "https://aissistedconsulting.com",
      store,
      days
    });

    const fromMs = Date.parse(`${dateFrom}T00:00:00-04:00`);
    const toMs = Date.parse(`${dateTo}T23:59:59-04:00`);
    const windowed = allSlots.filter((slot) => slotInRange(slot, fromMs, toMs));

    return {
      timezone: config.timezone,
      service_id: serviceId,
      slots: windowed.map((slot) => ({
        slot_id: slot.slotId,
        starts_at: slot.startsAt,
        ends_at: slot.endsAt,
        label: slot.label
      }))
    };
  }
};

// ---------- Tool: start_booking ----------

function extractContact(params) {
  const c = params?.contact || {};
  const name = limitString(c.name, "contact.name", 100);
  const email = limitString(c.email, "contact.email", 200).toLowerCase();
  const phone = limitString(c.phone, "contact.phone", 40);
  const company = limitString(c.company, "contact.company", 120);
  const notes = limitString(c.notes, "contact.notes", 2000);

  if (!name || !email) {
    throw new McpToolError(
      -32602,
      "contact.name and contact.email are required."
    );
  }
  if (!isValidEmail(email)) {
    throw new McpToolError(-32602, "contact.email is not a valid email.");
  }

  return { name, email, phone, company, notes };
}

function extractAgentMetadata(params) {
  const m = params?.agent_metadata || {};
  return {
    agent_name: limitString(m.agent_name, "agent_metadata.agent_name", 120),
    agent_version: limitString(
      m.agent_version,
      "agent_metadata.agent_version",
      40
    ),
    initiated_at: limitString(
      m.initiated_at,
      "agent_metadata.initiated_at",
      40
    )
  };
}

async function handleFreeBooking({ env, ip, config, service, slot, contact, agent }) {
  // Abuse controls for free bookings
  if (isDisposableEmailDomain(contact.email)) {
    throw new McpToolError(
      -32602,
      "Free bookings require a real business email. Disposable domains are not accepted."
    );
  }

  const sinceTs = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
  const counts = await countFreeBookings(env, {
    email: contact.email,
    ip,
    sinceTs
  });
  if (counts.byEmail >= FREE_BOOKING_LIMITS.perEmailPerDay) {
    throw new McpToolError(
      -32000,
      "This email already has a free discovery consult booked in the last 24 hours.",
      { retry_after_hours: 24 }
    );
  }
  if (counts.byIp >= FREE_BOOKING_LIMITS.perIpPerDay) {
    throw new McpToolError(
      -32000,
      "Too many free discovery consults from this IP in the last 24 hours.",
      { retry_after_hours: 24 }
    );
  }

  const store = getBookingStore(env);
  const createdAt = new Date().toISOString();
  const intakeSummary = [
    `Agent: ${agent.agent_name || "unknown"} ${agent.agent_version || ""}`.trim(),
    contact.notes ? `Notes: ${contact.notes}` : "",
    contact.company ? `Company: ${contact.company}` : ""
  ]
    .filter(Boolean)
    .join(" | ");

  const prospect = await store.upsertProspect({
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
    company: contact.company,
    intakeJson: JSON.stringify({
      source: "mcp",
      agent,
      notes: contact.notes
    })
  });

  let booking;
  try {
    booking = await store.createBookingHold({
      prospectId: prospect.id,
      slotId: slot.slotId,
      selectedTimeWindowStart: slot.startsAt,
      selectedTimeWindowEnd: slot.endsAt,
      selectedTimeZone: slot.timezone,
      reservationAmount: 0,
      currency: config.currency,
      temporaryHoldExpiresAt: addMinutes(createdAt, config.holdMinutes),
      createdAt,
      policyVersion: config.policyVersion,
      policyAcceptedAt: createdAt,
      intakeSummary
    });
  } catch (error) {
    if (error instanceof SlotUnavailableError) {
      throw new McpToolError(
        -32001,
        "That appointment window is no longer available.",
        { retry_with: "check_availability" }
      );
    }
    throw error;
  }

  // Immediately confirm — no payment step.
  const confirmation = await store.confirmBookingFromCheckout({
    bookingId: booking.id,
    sessionId: `mcp_free_${booking.id}`,
    paymentReference: "mcp_free_discovery",
    stripeCustomerId: "",
    confirmedAt: createdAt
  });
  const confirmed = confirmation.booking || booking;

  await store.logEvent({
    bookingId: confirmed.id,
    eventType: "mcp.booking.free_confirmed",
    payload: {
      serviceId: service.id,
      agent,
      source: "mcp",
      ip
    }
  });

  await recordFreeBooking(env, {
    email: contact.email,
    ip,
    bookingId: confirmed.id
  });

  // Best-effort notification. Never block the response on this.
  try {
    await sendBookingNotifications({ config, booking: confirmed });
  } catch (error) {
    console.warn("[mcp] free booking notifications failed", error);
  }

  return {
    booking_id: confirmed.id,
    status: "confirmed",
    service_id: service.id,
    slot: {
      starts_at: confirmed.selectedTimeWindowStart,
      ends_at: confirmed.selectedTimeWindowEnd,
      timezone: confirmed.selectedTimeZone,
      label: formatSlotLabel(
        confirmed.selectedTimeWindowStart,
        confirmed.selectedTimeWindowEnd,
        confirmed.selectedTimeZone
      )
    },
    confirmation_sent_to: contact.email,
    status_url: `https://aissistedconsulting.com/book/success/?booking_id=${encodeURIComponent(
      confirmed.id
    )}`,
    human_action_required: null
  };
}

async function handlePaidBooking({ env, config, service, slot, contact, agent }) {
  if (!isStripeConfigured(config)) {
    throw new McpToolError(
      -32603,
      "Stripe is not configured on this deployment; paid bookings are not yet available via MCP."
    );
  }

  const store = getBookingStore(env);
  const createdAt = new Date().toISOString();
  const holdExpiresAt = addMinutes(createdAt, config.holdMinutes);
  const intakeSummary = [
    `Source: MCP (${agent.agent_name || "unknown"} ${agent.agent_version || ""})`.trim(),
    contact.notes ? `Notes: ${contact.notes}` : "",
    contact.company ? `Company: ${contact.company}` : ""
  ]
    .filter(Boolean)
    .join(" | ");

  const prospect = await store.upsertProspect({
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
    company: contact.company,
    intakeJson: JSON.stringify({
      source: "mcp",
      agent,
      notes: contact.notes
    })
  });

  let booking;
  try {
    booking = await store.createBookingHold({
      prospectId: prospect.id,
      slotId: slot.slotId,
      selectedTimeWindowStart: slot.startsAt,
      selectedTimeWindowEnd: slot.endsAt,
      selectedTimeZone: slot.timezone,
      reservationAmount: config.reservationAmountCents,
      currency: config.currency,
      temporaryHoldExpiresAt: holdExpiresAt,
      createdAt,
      policyVersion: config.policyVersion,
      policyAcceptedAt: createdAt,
      intakeSummary
    });
  } catch (error) {
    if (error instanceof SlotUnavailableError) {
      throw new McpToolError(
        -32001,
        "That appointment window is no longer available.",
        { retry_with: "check_availability" }
      );
    }
    throw error;
  }

  let stripeCustomerId = prospect.stripeCustomerId || "";
  if (!stripeCustomerId) {
    try {
      const customer = await createStripeCustomer(config, {
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        company: contact.company
      });
      stripeCustomerId = customer.id;
    } catch (error) {
      console.warn("[mcp] Stripe customer creation failed; continuing.", error);
    }
  }

  let session;
  try {
    session = await createCheckoutSession(config, booking, {
      ...prospect,
      stripeCustomerId
    });
  } catch (error) {
    await store.markCheckoutFailure(booking.id);
    throw new McpToolError(
      -32002,
      `Stripe checkout session creation failed: ${
        error instanceof Error ? error.message : "unknown error"
      }`
    );
  }

  await store.attachCheckoutSession(booking.id, {
    sessionId: session.id,
    stripeCustomerId:
      typeof session.customer === "string" ? session.customer : stripeCustomerId
  });

  await store.logEvent({
    bookingId: booking.id,
    eventType: "mcp.booking.paid_initiated",
    payload: {
      serviceId: service.id,
      sessionId: session.id,
      agent
    }
  });

  return {
    booking_id: booking.id,
    status: "pending_payment",
    service_id: service.id,
    checkout_url: session.url,
    expires_at: holdExpiresAt,
    human_action_required:
      "The human must open checkout_url and complete payment within 30 minutes to confirm this booking. The slot is held until then.",
    status_url: `https://aissistedconsulting.com/book/success/?booking_id=${encodeURIComponent(
      booking.id
    )}&session_id=${encodeURIComponent(session.id)}`,
    slot: {
      starts_at: booking.selectedTimeWindowStart,
      ends_at: booking.selectedTimeWindowEnd,
      timezone: booking.selectedTimeZone,
      label: formatSlotLabel(
        booking.selectedTimeWindowStart,
        booking.selectedTimeWindowEnd,
        booking.selectedTimeZone
      )
    }
  };
}

export const startBookingTool = {
  name: "start_booking",
  description:
    "Begin a booking for a bookable service. For free services (discovery-consult) this confirms the appointment immediately and emails a confirmation. For paid services this returns a Stripe Checkout URL the human must open to complete payment.",
  inputSchema: {
    type: "object",
    required: ["service_id", "slot_id", "contact"],
    properties: {
      service_id: { type: "string" },
      slot_id: { type: "string" },
      contact: {
        type: "object",
        required: ["name", "email"],
        properties: {
          name: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
          company: { type: "string" },
          notes: { type: "string" }
        },
        additionalProperties: false
      },
      agent_metadata: {
        type: "object",
        properties: {
          agent_name: { type: "string" },
          agent_version: { type: "string" },
          initiated_at: { type: "string" }
        },
        additionalProperties: false
      }
    },
    additionalProperties: false
  },
  async handler(env, params = {}, ctx = {}) {
    const serviceId = limitString(params.service_id, "service_id", 80);
    const slotId = limitString(params.slot_id, "slot_id", 200);

    const service = getService(serviceId);
    if (!service) {
      throw new McpToolError(-32602, `Unknown service_id: ${serviceId}`);
    }
    if (!BOOKABLE_IDS.has(serviceId)) {
      throw new McpToolError(
        -32602,
        `service_id '${serviceId}' is not directly bookable via MCP. Use list_services to see which services are bookable_via_mcp=true.`
      );
    }

    const contact = extractContact(params);
    const agent = extractAgentMetadata(params);
    const config = getBookingConfig(
      env || {},
      ctx.origin || "https://aissistedconsulting.com"
    );

    // Validate slot_id shape + confirm it's still available.
    const parsedSlot = parseSlotId(slotId);
    if (!parsedSlot) {
      throw new McpToolError(-32602, "slot_id is not in the expected format.");
    }

    const store = getBookingStore(env || {});
    const allSlots = await listAvailableSlots({
      env: env || {},
      origin: "https://aissistedconsulting.com",
      store,
      days: config.lookaheadDays
    });
    const slot = allSlots.find((s) => s.slotId === slotId);
    if (!slot) {
      throw new McpToolError(
        -32001,
        "That appointment window is no longer available.",
        { retry_with: "check_availability" }
      );
    }

    // Cheap housekeeping: clear old counter rows opportunistically.
    cleanupRateCounters(env || {}).catch(() => {});

    if ((service.price_usd || 0) === 0) {
      return handleFreeBooking({
        env: env || {},
        ip: ctx.ip || "",
        config,
        service,
        slot,
        contact,
        agent
      });
    }

    return handlePaidBooking({
      env: env || {},
      config,
      service,
      slot,
      contact,
      agent
    });
  }
};

// ---------- Tool: get_booking_status ----------

function maskEmailForAgent(email) {
  if (!email || !email.includes("@")) {
    return "";
  }
  const [local, domain] = email.split("@");
  if (local.length <= 1) {
    return `${local}@${domain}`;
  }
  return `${local[0]}***@${domain}`;
}

export const getBookingStatusTool = {
  name: "get_booking_status",
  description:
    "Check the status of a booking previously created via start_booking. Returns the status (pending_payment, confirmed, expired, cancelled) and appointment details. Does not return full PII.",
  inputSchema: {
    type: "object",
    required: ["booking_id"],
    properties: {
      booking_id: { type: "string" }
    },
    additionalProperties: false
  },
  async handler(env, params = {}) {
    const bookingId = limitString(params.booking_id, "booking_id", 160);
    if (!bookingId) {
      throw new McpToolError(-32602, "booking_id is required.");
    }
    const store = getBookingStore(env || {});
    await store.cleanupExpiredHolds();
    const booking = await store.getBookingById(bookingId);
    if (!booking) {
      throw new McpToolError(-32602, `No booking found with id ${bookingId}.`);
    }

    const rawStatus = booking.bookingStatus;
    const statusMap = {
      hold: "pending_payment",
      confirmed: "confirmed",
      expired: "expired",
      payment_failed: "cancelled",
      manual_review: "pending_payment"
    };
    const status = statusMap[rawStatus] || rawStatus;

    return {
      booking_id: booking.id,
      status,
      raw_status: rawStatus,
      slot: {
        starts_at: booking.selectedTimeWindowStart,
        ends_at: booking.selectedTimeWindowEnd,
        timezone: booking.selectedTimeZone,
        label: formatSlotLabel(
          booking.selectedTimeWindowStart,
          booking.selectedTimeWindowEnd,
          booking.selectedTimeZone
        )
      },
      confirmed_at: booking.confirmedAt || null,
      customer_email_masked: maskEmailForAgent(booking.prospectEmail)
    };
  }
};

// ---------- Registry ----------

export const TOOLS = [
  listServicesTool,
  getBusinessInfoTool,
  getQuoteTool,
  checkAvailabilityTool,
  startBookingTool,
  getBookingStatusTool
];

export const TOOL_BUCKET = {
  list_services: "read",
  get_business_info: "read",
  get_quote: "read",
  check_availability: "read",
  get_booking_status: "read",
  start_booking: "write"
};

export function getToolByName(name) {
  return TOOLS.find((t) => t.name === name) || null;
}

export const TOOL_NAMES = TOOLS.map((t) => t.name);
export { KNOWN_IDS as KNOWN_SERVICE_IDS, BOOKABLE_IDS as BOOKABLE_SERVICE_IDS };
