import assert from "node:assert/strict";
import test from "node:test";
import { readPagesConfigs, validatePagesPreviewIsolation } from "../scripts/validate-pages-preview-isolation.mjs";
import { isAicCrmRelayConfigured, relayWebsiteIntakeToAicCrm } from "../functions/api/_lib/aic-crm.js";
import { onRequest as middleware } from "../functions/_middleware.js";
import { onRequest as monitor } from "../functions/api/book/monitor.js";

const configs = await readPagesConfigs();
const stagingUrl = "https://aiccrm-staging.pjaissist-0c5.workers.dev/intake/website";
const slots = [
  ["wrangler.toml env.preview", (copy) => copy["wrangler.toml"].env.preview],
  ["wrangler.preview.toml default/production", (copy) => copy["wrangler.preview.toml"]],
  ["wrangler.preview.toml env.preview", (copy) => copy["wrangler.preview.toml"].env.preview]
];

const rejectedDestinations = [
  ["production custom host", "https://crm.aissistedconsulting.com/intake/website"],
  ["production Worker", "https://aiccrm.pjaissist-0c5.workers.dev/intake/website"],
  ["Render staging is a different receiver", "https://aiccrm-staging.aissistedconsulting.com/intake/website"],
  ["different Worker", "https://other.pjaissist-0c5.workers.dev/intake/website"],
  ["host suffix", "https://aiccrm-staging.pjaissist-0c5.workers.dev.example.invalid/intake/website"],
  ["insecure scheme", stagingUrl.replace("https:", "http:")],
  ["base origin only", new URL(stagingUrl).origin],
  ["alternate path", stagingUrl.replace("/intake/website", "/intake/website/booking-events")],
  ["trailing slash", `${stagingUrl}/`],
  ["encoded path", stagingUrl.replace("/intake/", "/%69ntake/")],
  ["normalized parent path", stagingUrl.replace("/intake/", "/unused/../intake/")],
  ["query", `${stagingUrl}?target=production`],
  ["empty query", `${stagingUrl}?`],
  ["fragment", `${stagingUrl}#receiver`],
  ["userinfo", stagingUrl.replace("https://", "https://synthetic-user@")],
  ["userinfo credentials", stagingUrl.replace("https://", "https://synthetic-user:synthetic-value@")],
  ["alternate port", stagingUrl.replace(".dev/", ".dev:8443/")],
  ["explicit default port", stagingUrl.replace(".dev/", ".dev:443/")],
  ["leading whitespace", ` ${stagingUrl}`],
  ["trailing whitespace", `${stagingUrl} `],
  ["omitted value", undefined],
  ["non-string value", null]
];

// Selecting the reviewed receiver must leave each other isolation condition enforced.
const unsafeChanges = [
  ...[
    ["PREVIEW_ACCESS_REQUIRED", "false"],
    ["BOOKING_MONITOR_SCOPE", "all"],
    ["BOOKING_CHECKOUT_ENABLED", "true"],
    ["STRIPE_EXPECTED_LIVEMODE", "true"],
    ["BOOKING_REQUIRE_GOOGLE_CALENDAR", "true"],
    ["BOOKING_CREATE_GOOGLE_CALENDAR_EVENT", "true"],
    ["GOOGLE_CALENDAR_SEND_UPDATES", "all"],
    ["BOOKING_OPEN_SESSION_EXPIRY_ENABLED", "true"],
    ["AIC_EMAIL_PROVIDER", ""],
    ["GRAIL_EMAIL_PROVIDER", "resend"],
    ["AIC_EMAIL_FROM", "synthetic@example.invalid"],
    ["GRAIL_EMAIL_FROM", "synthetic@example.invalid"],
    ["BOOKING_NOTIFICATION_WEBHOOK_URL", "https://example.invalid/owner"],
    ["BOOKING_CONFIRMATION_WEBHOOK_URL", "https://example.invalid/customer"]
  ].map(([key, value]) => [key, (slot) => { slot.vars[key] = value; }, key]),
  ["omitted vars", (slot) => { delete slot.vars; }, "explicit vars"],
  ["production origin", (slot) => { slot.vars.PUBLIC_SITE_ORIGIN = "https://aissistedconsulting.com"; }, "origin must identify"],
  ["committed relay credential", (slot) => { slot.vars.AIC_CRM_INTAKE_TOKEN = "synthetic-only"; }, "platform secrets"],
  ["committed preview credential", (slot) => { slot.vars.PREVIEW_ACCESS_TOKEN = "synthetic-only"; }, "platform secrets"],
  ["committed monitor credential", (slot) => { slot.vars.BOOKING_MONITOR_TOKEN = "synthetic-only"; }, "platform secrets"],
  ["no D1 binding", (slot) => { delete slot.d1_databases; }, "exactly one explicit preview D1"],
  ["extra D1 binding", (slot) => { slot.d1_databases.push({ ...slot.d1_databases[0], binding: "OTHER_DB" }); }, "exactly one explicit preview D1"],
  ["different D1 binding", (slot) => { slot.d1_databases[0].binding = "OTHER_DB"; }, "D1 binding must be"],
  ["different D1 name", (slot) => { slot.d1_databases[0].database_name = "production"; }, "D1 name must identify"],
  ["production D1", (slot) => { slot.d1_databases[0].database_id = "702b49f1-4e87-4390-8b36-3da67bc126ff"; }, "D1 database_id"],
  ["production preview D1", (slot) => { slot.d1_databases[0].preview_database_id = "702b49f1-4e87-4390-8b36-3da67bc126ff"; }, "D1 preview_database_id"],
  ["remote local D1", (slot) => { slot.d1_databases[0].remote = true; }, "local D1 must not"],
  ...["kv_namespaces", "r2_buckets", "services", "analytics_engine_datasets", "ai", "vectorize", "hyperdrive", "durable_objects", "queues", "browser"]
    .map((key) => [key, (slot) => { slot[key] = []; }, `resource ${key}`])
];

for (const [label, select] of slots) {
  test(`${label}: checked-in relay stays empty and only the exact isolated receiver is additionally allowed`, () => {
    assert.equal(select(configs).vars.AIC_CRM_INTAKE_URL, "");
    assert.deepEqual(validatePagesPreviewIsolation(configs), []);
    const copy = structuredClone(configs);
    select(copy).vars.AIC_CRM_INTAKE_URL = stagingUrl;
    assert.deepEqual(validatePagesPreviewIsolation(copy), []);
  });

  test(`${label}: receiver allowlist rejects alternate destinations and URL normalization`, () => {
    for (const [description, value] of rejectedDestinations) {
      const copy = structuredClone(configs);
      select(copy).vars.AIC_CRM_INTAKE_URL = value;
      assert.ok(validatePagesPreviewIsolation(copy).some((error) => error.startsWith(`${label}: AIC_CRM_INTAKE_URL`)), description);
    }
  });

  test(`${label}: the allowed receiver cannot relax other isolation requirements`, () => {
    for (const [description, mutate, expected] of unsafeChanges) {
      const copy = structuredClone(configs);
      const slot = select(copy);
      slot.vars.AIC_CRM_INTAKE_URL = stagingUrl;
      mutate(slot);
      assert.ok(validatePagesPreviewIsolation(copy).some((error) => error.startsWith(`${label}:`) && error.includes(expected)), description);
    }
  });

  test(`${label}: a receiver URL and other machine credentials cannot send without the intake credential`, async (t) => {
    const fetch = t.mock.method(globalThis, "fetch", async () => assert.fail("missing intake credential must prevent a network request"));
    t.mock.method(console, "warn", () => {});
    for (const token of [undefined, "", " \t\n "]) {
      const env = {
        ...select(configs).vars,
        AIC_CRM_INTAKE_URL: stagingUrl,
        AIC_CRM_INTAKE_TOKEN: token,
        PREVIEW_ACCESS_TOKEN: "synthetic-preview-only",
        BOOKING_MONITOR_TOKEN: "synthetic-monitor-only"
      };
      // This helper identifies URL configuration only; the sender separately requires its own token.
      assert.equal(isAicCrmRelayConfigured(env), true);
      assert.deepEqual(await relayWebsiteIntakeToAicCrm(env, { sourceEventId: "synthetic-no-send" }), {
        ok: false, skipped: true, reason: "missing_token"
      });
    }
    assert.equal(fetch.mock.callCount(), 0);
  });

  test(`${label}: allowing a receiver supplies neither preview access nor monitor authority`, async () => {
    const env = { ...select(configs).vars, AIC_CRM_INTAKE_URL: stagingUrl };
    let nextCalls = 0;
    const response = await middleware({
      request: new Request("https://synthetic.aissisted-website.pages.dev/api/book/monitor", { method: "POST" }),
      env,
      next: async () => { nextCalls += 1; return new Response("unexpected dispatch"); }
    });
    assert.equal(response.status, 503);
    assert.equal(nextCalls, 0);
    for (const [monitorToken, status] of [[undefined, 503], ["synthetic-monitor-only", 403]]) {
      const monitorResponse = await monitor({
        request: new Request("https://synthetic.aissisted-website.pages.dev/api/book/monitor", {
          method: "POST", headers: { authorization: "Bearer synthetic-preview-only" }
        }),
        env: { ...env, PREVIEW_ACCESS_TOKEN: "synthetic-preview-only", BOOKING_MONITOR_TOKEN: monitorToken }
      });
      assert.equal(monitorResponse.status, status);
    }
  });
}
