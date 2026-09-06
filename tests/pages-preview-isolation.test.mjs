import assert from "node:assert/strict";
import test from "node:test";
import { readPagesConfigs, validatePagesPreviewIsolation } from "../scripts/validate-pages-preview-isolation.mjs";
import { onRequest as middleware } from "../functions/_middleware.js";
import { getBookingConfig } from "../functions/api/_lib/config.js";
import { isAicCrmRelayConfigured } from "../functions/api/_lib/aic-crm.js";
import { sendContactInquiryNotification } from "../functions/api/_lib/notifications.js";

const configs = await readPagesConfigs();

test("both checked-in Pages configurations isolate every preview slot", () => {
  assert.deepEqual(validatePagesPreviewIsolation(configs), []);
});

for (const file of ["wrangler.toml", "wrangler.preview.toml"]) {
  test(`${file}: removing env.preview cannot silently restore production defaults`, () => {
    const changed = structuredClone(configs);
    delete changed[file].env?.preview;
    assert.ok(validatePagesPreviewIsolation(changed).some((error) => error.includes(`${file} env.preview: explicit environment`)));
  });
}

for (const [label, mutate, expected] of [
  ["production database with a safe local preview_database_id", (slot) => { slot.d1_databases[0].database_id = "702b49f1-4e87-4390-8b36-3da67bc126ff"; }, "D1 database_id"],
  ["omitted D1 group", (slot) => { delete slot.d1_databases; }, "explicit preview D1"],
  ["omitted vars group", (slot) => { delete slot.vars; }, "explicit vars"],
  ["enabled Checkout", (slot) => { slot.vars.BOOKING_CHECKOUT_ENABLED = "true"; }, "BOOKING_CHECKOUT_ENABLED"],
  ["calendar event writes", (slot) => { slot.vars.BOOKING_CREATE_GOOGLE_CALENDAR_EVENT = "true"; }, "BOOKING_CREATE_GOOGLE_CALENDAR_EVENT"],
  ["empty email provider permitting fallback", (slot) => { slot.vars.AIC_EMAIL_PROVIDER = ""; }, "AIC_EMAIL_PROVIDER"],
  ["owner webhook", (slot) => { slot.vars.BOOKING_NOTIFICATION_WEBHOOK_URL = "https://example.invalid/hook"; }, "BOOKING_NOTIFICATION_WEBHOOK_URL"],
  ["customer webhook", (slot) => { slot.vars.BOOKING_CONFIRMATION_WEBHOOK_URL = "https://example.invalid/hook"; }, "BOOKING_CONFIRMATION_WEBHOOK_URL"],
  ["CRM receiver", (slot) => { slot.vars.AIC_CRM_INTAKE_URL = "https://example.invalid/intake/website"; }, "AIC_CRM_INTAKE_URL"],
  ["missing private-preview flag", (slot) => { delete slot.vars.PREVIEW_ACCESS_REQUIRED; }, "PREVIEW_ACCESS_REQUIRED"],
  ["committed access secret", (slot) => { slot.vars.PREVIEW_ACCESS_TOKEN = "synthetic-test-only"; }, "platform secrets"],
  ["new unreviewed service binding", (slot) => { slot.services = [{ binding: "CRM", service: "production" }]; }, "resource services"]
]) {
  test(`configuration gate rejects ${label}`, () => {
    const changed = structuredClone(configs);
    mutate(changed["wrangler.toml"].env.preview);
    assert.ok(validatePagesPreviewIsolation(changed).some((error) => error.includes(expected)));
  });
}

test("dedicated project's production slot cannot bypass preview safety", () => {
  const changed = structuredClone(configs);
  changed["wrangler.preview.toml"].vars.BOOKING_CHECKOUT_ENABLED = "true";
  assert.ok(validatePagesPreviewIsolation(changed).some((error) => error.includes("default/production: BOOKING_CHECKOUT_ENABLED")));
});

test("preview notification handler makes no request even when fallback email credentials exist", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("unexpected provider request"); });
  t.mock.method(console, "log", () => {});
  const config = getBookingConfig({
    ...configs["wrangler.toml"].env.preview.vars,
    GRAIL_EMAIL_PROVIDER: "resend",
    GRAIL_EMAIL_API_KEY: "synthetic-email-key",
    GRAIL_EMAIL_FROM: "synthetic@example.invalid"
  });
  const result = await sendContactInquiryNotification({
    config, inquiry: { id: "preview-synthetic", status: "new", deliveryStatus: "skipped" },
    contact: { email: "synthetic@example.invalid" }
  });
  assert.equal(result.email.status, "skipped");
  assert.equal(result.webhook.status, "skipped");
  assert.equal(fetch.mock.callCount(), 0);
});

test("effective preview config disables email fallbacks, webhooks and CRM", () => {
  for (const vars of [configs["wrangler.toml"].env.preview.vars, configs["wrangler.preview.toml"].vars, configs["wrangler.preview.toml"].env.preview.vars]) {
    const env = { GRAIL_EMAIL_API_KEY: "synthetic-key", ...vars };
    const config = getBookingConfig(env);
    assert.equal(config.emailProvider, "disabled");
    assert.equal(config.emailFrom, "");
    assert.equal(config.googleCalendarRequired, false);
    assert.equal(config.googleCalendarCreateEvents, false);
    assert.equal(config.internalNotificationWebhook, "");
    assert.equal(config.customerNotificationWebhook, "");
    assert.equal(isAicCrmRelayConfigured(env), false);
  }
});

test("opt-in preview without a secret rejects page, API and webhook requests before dispatch", async () => {
  for (const [route, method] of [["/book/", "GET"], ["/__preview-auth", "POST"], ["/api/contact/submit", "POST"], ["/api/book/webhook", "POST"]]) {
    let nextCalls = 0;
    const response = await middleware({
      request: new Request(`https://aissisted-website.pages.dev${route}`, { method }),
      env: { PREVIEW_ACCESS_REQUIRED: "true" },
      next: async () => { nextCalls += 1; return new Response("unexpected dispatch"); }
    });
    assert.equal(response.status, 503);
    assert.equal(nextCalls, 0);
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.match(response.headers.get("x-robots-tag"), /noindex/);
  }
});

test("production without the preview opt-in retains public access", async () => {
  const response = await middleware({
    request: new Request("https://aissistedconsulting.com/book/"), env: {},
    next: async () => new Response("public production page")
  });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "public production page");
});

test("configured opt-in preview still requires the existing token and accepts valid auth", async () => {
  const env = { PREVIEW_ACCESS_REQUIRED: "true", PREVIEW_ACCESS_TOKEN: "synthetic-preview-token" };
  for (const [bearer, status] of [["", 401], ["wrong", 401], [env.PREVIEW_ACCESS_TOKEN, 200]]) {
    const response = await middleware({
      request: new Request("https://aissisted-website.pages.dev/book/", { headers: bearer ? { authorization: `Bearer ${bearer}` } : {} }),
      env, next: async () => new Response("authenticated preview")
    });
    assert.equal(response.status, status);
  }
});

for (const [file, host] of [
  ["wrangler.toml", "synthetic-review.aissisted-website.pages.dev"],
  ["wrangler.toml", "0123abcd.aissisted-website.pages.dev"],
  ["wrangler.preview.toml", "synthetic-review.aissisted-offer-v2-preview.pages.dev"],
  ["wrangler.preview.toml", "0123abcd.aissisted-offer-v2-preview.pages.dev"]
]) {
  test(`preview redirects and return URLs retain deployment origin: ${host}`, async () => {
    const origin = `https://${host}`;
    const env = { ...configs[file].env.preview.vars, PREVIEW_ACCESS_TOKEN: "synthetic-preview-token" };
    for (const [from, to] of [["/grail", "/grail/"], ["/grail/index.html", "/grail/"], ["/grail/activation.html", "/grail/activation"]]) {
      const response = await middleware({
        request: new Request(`${origin}${from}?source=synthetic`, { headers: { authorization: `Bearer ${env.PREVIEW_ACCESS_TOKEN}` } }),
        env, next: async () => { assert.fail("canonical route should redirect"); }
      });
      assert.equal(response.status, 301);
      assert.equal(response.headers.get("location"), `${origin}${to}?source=synthetic`);
      assert.match(response.headers.get("cache-control"), /no-store/);
      assert.match(response.headers.get("x-robots-tag"), /noindex/);
    }
    assert.equal(getBookingConfig(env, origin).siteOrigin, origin);
  });
}

test("production redirects and return URLs retain configured canonical origin", async () => {
  const env = configs["wrangler.toml"].vars;
  const response = await middleware({
    request: new Request("https://aissisted-website.pages.dev/grail?source=synthetic"),
    env, next: async () => { assert.fail("canonical route should redirect"); }
  });
  assert.equal(response.status, 301);
  assert.equal(response.headers.get("location"), "https://aissistedconsulting.com/grail/?source=synthetic");
  assert.equal(getBookingConfig(env, "https://aissisted-website.pages.dev").siteOrigin, "https://aissistedconsulting.com");
});
