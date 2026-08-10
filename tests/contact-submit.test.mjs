import test from "node:test";
import assert from "node:assert/strict";

import { onRequest } from "../functions/api/contact/submit.js";
import { getBookingStore } from "../functions/api/_lib/storage.js";

function resetMemoryStore() {
  delete globalThis.__aissistedBookingStore;
}

function createContactRequest(body, key = "contact-test-key-0001") {
  return new Request("https://aissistedconsulting.com/api/contact/submit", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://aissistedconsulting.com",
      "idempotency-key": key
    },
    body: JSON.stringify(body)
  });
}

function isAicCrmIntakeUrl(value) {
  const url = new URL(value instanceof Request ? value.url : String(value));
  return (
    url.origin === "https://aiccrm.aissistedconsulting.com" &&
    url.pathname === "/intake/website"
  );
}

async function submitContact(body, key, env = {}, options = {}) {
  const backgroundTasks = [];
  const response = await onRequest({
    request: createContactRequest(body, key),
    env,
    waitUntil(task) {
      backgroundTasks.push(Promise.resolve(task));
    }
  });
  const payload = await response.json();
  if (options.waitForBackground !== false) {
    await Promise.all(backgroundTasks);
  }
  return { response, payload, backgroundTasks };
}

function validPayload(overrides = {}) {
  return {
    name: "Pat Owner",
    email: "pat@example.com",
    phone: "352-555-0199",
    company: "Pat's Services",
    audience: "small_business_workflow",
    message: "I need help following up with missed calls.",
    sourcePage: "/contact/",
    websiteLeaveBlank: "",
    consentToSubmit: true,
    ...overrides
  };
}

test("contact submit creates a local inquiry and audit record", async () => {
  resetMemoryStore();
  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    throw new Error("External fetch should not be called.");
  };

  try {
    const { response, payload } = await submitContact(
      validPayload(),
      "contact-valid-key-0001"
    );
    const store = getBookingStore({});
    const inquiry = await store.getContactInquiryById(payload.inquiry.id);
    const audits = await store.listAgentTransactionAudits();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.match(payload.inquiry.id, /^inq_/);
    assert.equal(inquiry.emailNormalized, "pat@example.com");
    assert.equal(inquiry.deliveryStatus, "local_record_only");
    assert.equal(audits.length, 1);
    assert.equal(audits[0].result, "accepted");
    assert.equal(fetchCalls, 0);
  } finally {
    global.fetch = originalFetch;
  }
});

test("contact submit relays structured attribution to AICCRM", async () => {
  resetMemoryStore();
  const originalFetch = global.fetch;
  let crmPayload = null;
  global.fetch = async (_url, options = {}) => {
    crmPayload = JSON.parse(String(options.body || "{}"));
    return Response.json({ ok: true, submission: { id: "intake_contact_test" } });
  };

  try {
    const { response, payload } = await submitContact(
      validPayload({
        sourcePage:
          "/contact/?utm_source=codex&utm_medium=production_smoke&utm_campaign=aiccrm_relay&gclid=gclid-contact"
      }),
      "contact-crm-relay-key-0001",
      {
        AIC_CRM_INTAKE_URL: "https://aiccrm.aissistedconsulting.com/intake/website",
        AIC_CRM_INTAKE_TOKEN: "test-token"
      }
    );

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(crmPayload.sourceUrl, "https://aissistedconsulting.com/contact/?utm_source=codex&utm_medium=production_smoke&utm_campaign=aiccrm_relay&gclid=gclid-contact");
    assert.equal(crmPayload.sourcePage, "/contact/?utm_source=codex&utm_medium=production_smoke&utm_campaign=aiccrm_relay&gclid=gclid-contact");
    assert.equal(crmPayload.sourceChannel, "website");
    assert.equal(crmPayload.formName, "contact-page");
    assert.equal(crmPayload.utmSource, "codex");
    assert.equal(crmPayload.utmMedium, "production_smoke");
    assert.equal(crmPayload.utmCampaign, "aiccrm_relay");
    assert.equal(crmPayload.gclid, "gclid-contact");
    assert.match(crmPayload.qualifiedSourceEventId, /^website-contact-inq_/);
    assert.equal(payload.inquiry.deliveryStatus, "crm_relay_delivered");
    const store = getBookingStore({});
    const inquiry = await store.getContactInquiryById(payload.inquiry.id);
    assert.equal(inquiry.deliveryStatus, "crm_relay_delivered");
  } finally {
    global.fetch = originalFetch;
  }
});

test("contact submit preserves long paid click attribution", async () => {
  resetMemoryStore();
  const originalFetch = global.fetch;
  const gclid = `gclid-${"x".repeat(220)}`;
  let crmPayload = null;
  global.fetch = async (_url, options = {}) => {
    crmPayload = JSON.parse(String(options.body || "{}"));
    return Response.json({ ok: true, submission: { id: "intake_long_attribution" } });
  };

  try {
    const sourcePage =
      `/family-ai-help/?gclid=${gclid}` +
      "&utm_source=google&utm_medium=cpc&utm_campaign=family_back_to_school_202608";
    const { response, payload } = await submitContact(
      validPayload({
        audience: "family_ai_question",
        sourcePage
      }),
      "contact-long-attribution-0001",
      {
        AIC_CRM_INTAKE_URL: "https://aiccrm.aissistedconsulting.com/intake/website",
        AIC_CRM_INTAKE_TOKEN: "test-token"
      }
    );

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(crmPayload.sourcePage, sourcePage);
    assert.equal(crmPayload.gclid, gclid);
    assert.equal(crmPayload.utmCampaign, "family_back_to_school_202608");
  } finally {
    global.fetch = originalFetch;
  }
});

test("contact submit emails the owner through Resend after CRM relay", async () => {
  resetMemoryStore();
  const originalFetch = global.fetch;
  let resendRequest = null;
  global.fetch = async (url, options = {}) => {
    if (isAicCrmIntakeUrl(url)) {
      return Response.json({ ok: true, submission: { id: "intake_owner_email" } });
    }
    if (String(url) === "https://api.resend.com/emails") {
      resendRequest = {
        headers: new Headers(options.headers),
        body: JSON.parse(String(options.body || "{}"))
      };
      return Response.json({ id: "email_owner_alert_001" });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    const { response, payload } = await submitContact(
      validPayload({
        sourcePage:
          "/small-business-ai-help/?gclid=paid-click-001&utm_source=google&utm_medium=cpc&utm_campaign=local_ai_search"
      }),
      "contact-owner-email-key-0001",
      {
        AIC_CRM_INTAKE_URL: "https://aiccrm.aissistedconsulting.com/intake/website",
        AIC_CRM_INTAKE_TOKEN: "test-token",
        AIC_EMAIL_PROVIDER: "resend",
        AIC_EMAIL_API_KEY: "resend-test-key",
        AIC_EMAIL_FROM:
          "AIssisted Consulting <alerts@notify.aissistedconsulting.com>",
        AIC_OWNER_ALERT_EMAIL: "pj@aissistedconsulting.com"
      }
    );
    const notificationEvent = globalThis.__aissistedBookingStore.events.find(
      (event) => event.eventType === "contact.owner_email_delivered"
    );
    const notificationPayload = JSON.parse(notificationEvent.payloadJson);

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(resendRequest.body.from, "AIssisted Consulting <alerts@notify.aissistedconsulting.com>");
    assert.deepEqual(resendRequest.body.to, ["pj@aissistedconsulting.com"]);
    assert.equal(resendRequest.body.reply_to, "pat@example.com");
    assert.match(resendRequest.body.subject, /New AIssisted inquiry/);
    assert.match(resendRequest.body.text, /CRM delivery: crm_relay_delivered/);
    assert.match(resendRequest.body.text, /utm_campaign=local_ai_search/);
    assert.equal(
      resendRequest.headers.get("idempotency-key"),
      `aic-contact-owner-alert-${payload.inquiry.id}`
    );
    assert.equal(notificationPayload.provider, "resend");
    assert.equal(notificationPayload.providerMessageId, "email_owner_alert_001");
  } finally {
    global.fetch = originalFetch;
  }
});

test("contact submit does not wait for owner email delivery", async () => {
  resetMemoryStore();
  const originalFetch = global.fetch;
  let finishResend;
  let resendStarted = false;
  const resendResponse = new Promise((resolve) => {
    finishResend = resolve;
  });
  global.fetch = async (url) => {
    if (isAicCrmIntakeUrl(url)) {
      return Response.json({ ok: true, submission: { id: "intake_background_email" } });
    }
    if (String(url) === "https://api.resend.com/emails") {
      resendStarted = true;
      return resendResponse;
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    const { response, payload, backgroundTasks } = await submitContact(
      validPayload(),
      "contact-background-email-key-0001",
      {
        AIC_CRM_INTAKE_URL: "https://aiccrm.aissistedconsulting.com/intake/website",
        AIC_CRM_INTAKE_TOKEN: "test-token",
        AIC_EMAIL_PROVIDER: "resend",
        AIC_EMAIL_API_KEY: "resend-test-key",
        AIC_EMAIL_FROM:
          "AIssisted Consulting <alerts@notify.aissistedconsulting.com>",
        AIC_OWNER_ALERT_EMAIL: "pj@aissistedconsulting.com"
      },
      { waitForBackground: false }
    );

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(resendStarted, true);
    assert.equal(backgroundTasks.length, 1);
    assert.equal(
      globalThis.__aissistedBookingStore.events.some(
        (event) => event.eventType === "contact.owner_email_delivered"
      ),
      false
    );

    finishResend(Response.json({ id: "email_background_001" }));
    await Promise.all(backgroundTasks);

    assert.equal(
      globalThis.__aissistedBookingStore.events.some(
        (event) => event.eventType === "contact.owner_email_delivered"
      ),
      true
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("contact submit keeps the lead when the owner email fails", async () => {
  resetMemoryStore();
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (isAicCrmIntakeUrl(url)) {
      return Response.json({ ok: true, submission: { id: "intake_email_failure" } });
    }
    if (String(url) === "https://api.resend.com/emails") {
      return new Response("provider unavailable", { status: 503 });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    const { response, payload } = await submitContact(
      validPayload(),
      "contact-owner-email-failure-0001",
      {
        AIC_CRM_INTAKE_URL: "https://aiccrm.aissistedconsulting.com/intake/website",
        AIC_CRM_INTAKE_TOKEN: "test-token",
        AIC_EMAIL_PROVIDER: "resend",
        AIC_EMAIL_API_KEY: "resend-test-key",
        AIC_EMAIL_FROM:
          "AIssisted Consulting <alerts@notify.aissistedconsulting.com>",
        AIC_OWNER_ALERT_EMAIL: "pj@aissistedconsulting.com"
      }
    );
    const notificationEvent = globalThis.__aissistedBookingStore.events.find(
      (event) => event.eventType === "contact.owner_email_failed"
    );

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.inquiry.deliveryStatus, "crm_relay_delivered");
    assert.ok(notificationEvent);
  } finally {
    global.fetch = originalFetch;
  }
});

test("contact submit records a CRM relay failure without losing the local inquiry", async () => {
  resetMemoryStore();
  const originalFetch = global.fetch;
  global.fetch = async () =>
    Response.json({ ok: false, error: "Temporary CRM failure." }, { status: 503 });

  try {
    const { response, payload } = await submitContact(
      validPayload(),
      "contact-crm-failure-key-0001",
      {
        AIC_CRM_INTAKE_URL: "https://aiccrm.aissistedconsulting.com/intake/website",
        AIC_CRM_INTAKE_TOKEN: "test-token"
      }
    );
    const store = getBookingStore({});
    const inquiry = await store.getContactInquiryById(payload.inquiry.id);

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.inquiry.deliveryStatus, "crm_relay_failed");
    assert.equal(inquiry.deliveryStatus, "crm_relay_failed");
  } finally {
    global.fetch = originalFetch;
  }
});

test("contact submit requires explicit consent", async () => {
  resetMemoryStore();
  const { response, payload } = await submitContact(
    validPayload({ consentToSubmit: false }),
    "contact-consent-key-0001"
  );

  assert.equal(response.status, 400);
  assert.equal(payload.ok, false);
  assert.equal(payload.code, "consent_required");
});

test("contact submit rejects duplicate inquiries with a new idempotency key", async () => {
  resetMemoryStore();
  const first = await submitContact(validPayload(), "contact-duplicate-key-01");
  const second = await submitContact(validPayload(), "contact-duplicate-key-02");

  assert.equal(first.response.status, 200);
  assert.equal(second.response.status, 409);
  assert.equal(second.payload.code, "duplicate_inquiry");
  assert.equal(second.payload.existingInquiry.id, first.payload.inquiry.id);
});

test("contact submit replays exact idempotent retries", async () => {
  resetMemoryStore();
  const key = "contact-replay-key-0001";
  const first = await submitContact(validPayload(), key);
  const second = await submitContact(validPayload(), key);

  assert.equal(first.response.status, 200);
  assert.equal(second.response.status, 200);
  assert.equal(second.payload.ok, true);
  assert.equal(second.payload.replayed, true);
  assert.equal(second.payload.inquiry.id, first.payload.inquiry.id);
});

test("contact submit rejects conflicting idempotent retries", async () => {
  resetMemoryStore();
  const key = "contact-conflict-key-01";
  const first = await submitContact(validPayload(), key);
  const second = await submitContact(
    validPayload({ message: "This is a different contact request." }),
    key
  );

  assert.equal(first.response.status, 200);
  assert.equal(second.response.status, 409);
  assert.equal(second.payload.code, "idempotency_conflict");
});

test("contact submit blocks cross-origin and missing idempotency requests", async () => {
  resetMemoryStore();
  const crossOrigin = await onRequest({
    request: new Request("https://aissistedconsulting.com/api/contact/submit", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://example.com",
        "idempotency-key": "contact-origin-key-0001"
      },
      body: JSON.stringify(validPayload())
    }),
    env: {}
  });
  const missingKey = await onRequest({
    request: new Request("https://aissistedconsulting.com/api/contact/submit", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://aissistedconsulting.com"
      },
      body: JSON.stringify(validPayload())
    }),
    env: {}
  });
  const crossOriginPayload = await crossOrigin.json();
  const missingKeyPayload = await missingKey.json();

  assert.equal(crossOrigin.status, 403);
  assert.equal(crossOriginPayload.ok, false);
  assert.equal(missingKey.status, 400);
  assert.equal(missingKeyPayload.code, "missing_idempotency_key");
});
