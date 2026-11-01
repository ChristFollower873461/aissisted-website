import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { onRequest as checkout } from "../functions/api/store/checkout.js";
import { onRequest as sessionStatus } from "../functions/api/store/session.js";
import { onRequest as download } from "../functions/api/store/download.js";
import { STORE_DOWNLOAD_DAYS, STORE_FILES, STORE_PRODUCT_ID } from "../functions/api/_lib/store.js";
import { readPagesConfigs, validatePagesPreviewIsolation } from "../scripts/validate-pages-preview-isolation.mjs";

const ORIGIN = "https://aissistedconsulting.com";
const SESSION_ID = "cs_test_a1B2c3D4e5F6g7H8";
const NOW_S = Math.floor(Date.now() / 1000);

function fakeBucket() {
  const objects = new Map(Object.values(STORE_FILES).map((file) => [
    file.objectKey,
    new TextEncoder().encode(`bytes of ${file.filename}`)
  ]));
  return {
    keysRequested: [],
    async get(key) {
      this.keysRequested.push(key);
      const bytes = objects.get(key);
      return bytes ? { body: new Blob([bytes]).stream(), size: bytes.byteLength } : null;
    }
  };
}

function env(overrides = {}) {
  return {
    PUBLIC_SITE_ORIGIN: ORIGIN,
    STRIPE_SECRET_KEY: "sk_test_local",
    STRIPE_EXPECTED_LIVEMODE: "false",
    BOOK_SALE_ENABLED: "true",
    BOOK_FILES: fakeBucket(),
    ...overrides
  };
}

function paidSession(overrides = {}) {
  return {
    id: SESSION_ID,
    object: "checkout.session",
    livemode: false,
    status: "complete",
    payment_status: "paid",
    created: NOW_S - 60,
    amount_total: 2900,
    currency: "usd",
    metadata: { store_product: STORE_PRODUCT_ID },
    ...overrides
  };
}

function mockStripe(t, handler) {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return handler(String(url), options);
  });
  t.mock.method(console, "warn", () => {});
  t.mock.method(console, "error", () => {});
  return calls;
}

function stripeJson(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

function get(handler, path, environment = env()) {
  return handler({ request: new Request(`${ORIGIN}${path}`), env: environment });
}

function downloadPath(file, sessionId = SESSION_ID) {
  return `/api/store/download?session_id=${encodeURIComponent(sessionId)}&file=${file}`;
}

test("checkout creates a one-time $29 Session with inline price data and product metadata", async (t) => {
  const calls = mockStripe(t, () => stripeJson({ id: SESSION_ID, livemode: false, url: "https://checkout.stripe.com/c/pay/cs_test" }));
  const response = await checkout({
    request: new Request(`${ORIGIN}/api/store/checkout`, { method: "POST", headers: { origin: ORIGIN }, body: "{}" }),
    env: env()
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, url: "https://checkout.stripe.com/c/pay/cs_test" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.stripe.com/v1/checkout/sessions");
  assert.equal(calls[0].options.method, "POST");
  const body = new URLSearchParams(calls[0].options.body);
  assert.equal(body.get("mode"), "payment");
  assert.equal(body.get("line_items[0][price_data][unit_amount]"), "2900");
  assert.equal(body.get("line_items[0][price_data][currency]"), "usd");
  assert.match(body.get("line_items[0][price_data][product_data][name]"), /Sell Them a Hammer/);
  assert.equal(body.get("line_items[0][price]"), null, "no pre-created Price");
  assert.equal(body.get("metadata[store_product]"), STORE_PRODUCT_ID);
  assert.equal(body.get("payment_intent_data[metadata][store_product]"), STORE_PRODUCT_ID);
  assert.equal(body.get("success_url"), `${ORIGIN}/sell-them-a-hammer/thanks/?session_id={CHECKOUT_SESSION_ID}`);
  assert.equal(body.get("cancel_url"), `${ORIGIN}/sell-them-a-hammer/`);
});

test("checkout rejects GET, foreign origins, and stays closed when disabled or unbound", async (t) => {
  const calls = mockStripe(t, () => { throw new Error("unexpected Stripe call"); });
  assert.equal((await get(checkout, "/api/store/checkout")).status, 405);
  const post = (headers, environment) => checkout({
    request: new Request(`${ORIGIN}/api/store/checkout`, { method: "POST", headers, body: "{}" }),
    env: environment
  });
  assert.equal((await post({ origin: "https://evil.example" }, env())).status, 403);
  assert.equal((await post({}, env({ BOOK_SALE_ENABLED: "false" }))).status, 503);
  assert.equal((await post({}, env({ BOOK_FILES: undefined }))).status, 503);
  assert.equal((await post({}, env({ STRIPE_SECRET_KEY: "" }))).status, 503);
  assert.equal(calls.length, 0);
});

test("checkout refuses a Session from the wrong Stripe mode", async (t) => {
  mockStripe(t, () => stripeJson({ id: "cs_live_x", livemode: true, url: "https://checkout.stripe.com/x" }));
  const response = await checkout({ request: new Request(`${ORIGIN}/api/store/checkout`, { method: "POST" }), env: env() });
  assert.equal(response.status, 503);
});

test("paid session lists all three files and each download streams the right object", async (t) => {
  const calls = mockStripe(t, (url) => {
    assert.equal(url, `https://api.stripe.com/v1/checkout/sessions/${SESSION_ID}`);
    return stripeJson(paidSession());
  });
  const environment = env();
  const status = await get(sessionStatus, `/api/store/session?session_id=${SESSION_ID}`, environment);
  assert.equal(status.status, 200);
  const payload = await status.json();
  assert.deepEqual(payload.files.map((file) => file.id), ["pdf", "epub", "toolkit"]);
  assert.equal(payload.files[0].href, downloadPath("pdf"));
  assert.equal(new Date(payload.expiresAt).getTime(), (NOW_S - 60 + STORE_DOWNLOAD_DAYS * 86400) * 1000);

  for (const [id, file] of Object.entries(STORE_FILES)) {
    const response = await get(download, downloadPath(id), environment);
    assert.equal(response.status, 200, id);
    assert.equal(response.headers.get("content-type"), file.contentType);
    assert.equal(response.headers.get("content-disposition"), `attachment; filename="${file.filename}"`);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(await response.text(), `bytes of ${file.filename}`);
  }
  assert.deepEqual(environment.BOOK_FILES.keysRequested, Object.values(STORE_FILES).map((file) => file.objectKey));
  assert.ok(calls.every((call) => call.options.method === "GET"));
});

for (const [label, session, code] of [
  ["unpaid", paidSession({ payment_status: "unpaid", status: "open" }), "unpaid"],
  ["complete but not paid", paidSession({ payment_status: "no_payment_required" }), "unpaid"],
  ["wrong product", paidSession({ metadata: { booking_id: "bk_1" } }), "wrong_product"],
  ["no metadata", paidSession({ metadata: undefined }), "wrong_product"],
  ["wrong Stripe mode", paidSession({ livemode: true }), "wrong_mode"],
  ["mismatched id", paidSession({ id: "cs_test_someoneElse123" }), "unknown_session"],
  ["expired", paidSession({ created: NOW_S - (STORE_DOWNLOAD_DAYS * 86400 + 60) }), "expired"]
]) {
  test(`${label} session gets 403 and no file`, async (t) => {
    mockStripe(t, () => stripeJson(session));
    const environment = env();
    for (const [handler, path] of [[sessionStatus, `/api/store/session?session_id=${SESSION_ID}`], [download, downloadPath("pdf")]]) {
      const response = await get(handler, path, environment);
      assert.equal(response.status, 403);
      const payload = await response.json();
      assert.equal(payload.code, code);
      assert.ok(payload.error.length > 10, "friendly message");
    }
    assert.deepEqual(environment.BOOK_FILES.keysRequested, []);
  });
}

test("missing or malformed session_id is 404 without calling Stripe", async (t) => {
  const calls = mockStripe(t, () => { throw new Error("unexpected Stripe call"); });
  for (const query of ["", "?session_id=", "?session_id=pi_123", "?session_id=cs_test_../../etc"]) {
    const response = await get(sessionStatus, `/api/store/session${query}`);
    assert.equal(response.status, 404, query);
  }
  assert.equal((await get(download, "/api/store/download?file=pdf")).status, 404);
  assert.equal(calls.length, 0);
});

test("unknown session at Stripe is 404", async (t) => {
  mockStripe(t, () => stripeJson({ error: { message: "No such checkout.session" } }, 404));
  const response = await get(download, downloadPath("epub"));
  assert.equal(response.status, 404);
  assert.equal((await response.json()).code, "unknown_session");
});

test("file parameter is a whitelist, never a path", async (t) => {
  const calls = mockStripe(t, () => stripeJson(paidSession()));
  for (const file of ["", "PDF", "mobi", "../wrangler.toml", "sell-them-a-hammer/v1/Sell-Them-a-Hammer.pdf", "constructor", "__proto__", "toString"]) {
    const response = await get(download, `/api/store/download?session_id=${SESSION_ID}&file=${encodeURIComponent(file)}`);
    assert.equal(response.status, 400, file);
  }
  assert.equal(calls.length, 0);
});

test("download is 503 when the private bucket is not bound or the object is missing", async (t) => {
  mockStripe(t, () => stripeJson(paidSession()));
  assert.equal((await get(download, downloadPath("pdf"), env({ BOOK_FILES: undefined }))).status, 503);
  const empty = { async get() { return null; } };
  assert.equal((await get(download, downloadPath("pdf"), env({ BOOK_FILES: empty }))).status, 503);
});

test("past buyers can still download after the sale is switched off", async (t) => {
  mockStripe(t, () => stripeJson(paidSession()));
  assert.equal((await get(download, downloadPath("toolkit"), env({ BOOK_SALE_ENABLED: "false" }))).status, 200);
});

test("book files are never committed or static; R2 binding is production-only", async () => {
  for (const path of ["sell-them-a-hammer/index.html", "sell-them-a-hammer/thanks/index.html"]) {
    const html = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
    assert.doesNotMatch(html, /\.(?:pdf|epub|zip)\b/i, `${path} must not link files directly`);
  }
  const thanks = readFileSync(new URL("../sell-them-a-hammer/thanks/index.html", import.meta.url), "utf8");
  assert.match(thanks, /<meta name="robots" content="noindex, nofollow">/);
  assert.doesNotMatch(thanks, /<script[^>]+(?:main\.js|aic-google-ads-tracking|axon)/, "no tracking on the page whose URL unlocks files");

  const configs = await readPagesConfigs();
  assert.deepEqual(configs["wrangler.toml"].r2_buckets, [{ binding: "BOOK_FILES", bucket_name: "aic-store-private" }]);
  assert.equal(configs["wrangler.toml"].env.preview.r2_buckets, undefined);
  assert.equal(configs["wrangler.toml"].env.preview.vars.BOOK_SALE_ENABLED, "false");
  assert.equal(configs["wrangler.preview.toml"].r2_buckets, undefined);
  assert.deepEqual(validatePagesPreviewIsolation(configs), []);

  for (const [label, mutate] of [
    ["preview slot binding", (c) => { c["wrangler.toml"].env.preview.r2_buckets = [{ binding: "BOOK_FILES", bucket_name: "aic-store-private" }]; }],
    ["different bucket", (c) => { c["wrangler.toml"].r2_buckets[0].bucket_name = "public-bucket"; }],
    ["extra bucket", (c) => { c["wrangler.toml"].r2_buckets.push({ binding: "OTHER", bucket_name: "other" }); }],
    ["dedicated preview project", (c) => { c["wrangler.preview.toml"].r2_buckets = [{ binding: "BOOK_FILES", bucket_name: "aic-store-private" }]; }]
  ]) {
    const changed = structuredClone(configs);
    mutate(changed);
    assert.ok(validatePagesPreviewIsolation(changed).some((error) => error.includes("resource r2_buckets")), label);
  }
});
