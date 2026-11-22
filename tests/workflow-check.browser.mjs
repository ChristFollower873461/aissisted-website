// Run on Neo. Browser routes serve only local files and isolated handler sinks.
// No requests reach the public website, CRM, notification services or ad SDKs.
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { onRequest } from "../functions/api/contact/submit.js";
import { createBookingSqliteFixture } from "./fixtures/booking-sqlite.mjs";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = fileURLToPath(new URL("../", import.meta.url));
const out = process.env.QA_OUTPUT || path.join(root, "qa-output");
await mkdir(out, { recursive: true });
const cleanup = [];
const fixture = createBookingSqliteFixture({ after(fn) { cleanup.push(fn); } });
const crm = new Map(), received = [], requests = [], external = [];
const env = {
  BOOKING_DB: fixture.db,
  AIC_CRM_INTAKE_URL: "https://crm.example.test/intake/website",
  AIC_CRM_INTAKE_TOKEN: "synthetic-not-a-real-secret"
};
const oldFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  assert.equal(String(url), env.AIC_CRM_INTAKE_URL, "unexpected outbound service");
  const payload = JSON.parse(init.body);
  received.push(payload);
  if (!crm.has(payload.qualifiedSourceEventId)) crm.set(payload.qualifiedSourceEventId, payload);
  return Response.json({ ok: true, submission: { id: "901" } });
};
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_EXECUTABLE || undefined });
let loseReceipt = true;
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2" };
async function prepare(viewport, origin = "https://aissistedconsulting.com", gpc = false) {
  const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
  if (gpc) await context.addInitScript(() => Object.defineProperty(navigator, "globalPrivacyControl", { get: () => true }));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) {
      external.push(url.hostname);
      if (url.hostname === "bzrcdn.openai.com" && url.pathname.startsWith("/pixel-config/v1/")) {
        return route.fulfill({ status: 200, contentType: "application/json",
          body: JSON.stringify({ automatic_advanced_matching_enabled: false }) });
      }
      // Leave SDK queues intact; tests inspect the exact calls, not vendor delivery.
      return route.fulfill({ status: 200, contentType: "text/javascript", body: "" });
    }
    if (url.pathname === "/api/contact/submit") {
      const tasks = [];
      requests.push({ key: request.headers()["idempotency-key"], body: request.postDataJSON() });
      const response = await onRequest({ env,
        request: new Request(origin + url.pathname, { method: "POST", headers: request.headers(), body: request.postData() }),
        waitUntil(task) { tasks.push(task); }
      });
      await Promise.all(tasks);
      const body = await response.text();
      if (loseReceipt) { loseReceipt = false; return route.abort("failed"); }
      return route.fulfill({ status: response.status, contentType: "application/json", body });
    }
    let relative = decodeURIComponent(url.pathname).replace(/^\//, "");
    if (!relative || relative.endsWith("/")) relative += "index.html";
    const filename = path.resolve(root, relative);
    assert.ok(filename.startsWith(root));
    try {
      let body = await readFile(filename);
      if (url.pathname.endsWith("aic-lead-tracking-config.js")) {
        body = Buffer.from('window.AIC_LEAD_TRACKING_CONFIG={metaPixelId:"123456",openaiPixelId:"test_pixel"};');
      }
      return route.fulfill({ status: 200, contentType: mime[path.extname(filename)] || "application/octet-stream", body });
    } catch {
      return route.fulfill({ status: 404, body: "Not found" });
    }
  });
  return { page, context, errors };
}
const formValues = {
  name: "TEST Workflow Check", email: "test-workflow@example.test",
  company: "TEST isolated fixture", message: "TEST repeating task, no customer data."
};
async function fill(page) {
  for (const [name, value] of Object.entries(formValues)) await page.locator('[name="' + name + '"]').fill(value);
  await page.locator('[name="helpTiming"]').selectOption("yes");
  await page.locator('[name="consentToSubmit"]').check();
}
async function counts(page) {
  return page.evaluate(() => ({
    google: (window.dataLayer || []).filter(a => a[0] === "event" && a[1] === "conversion").length,
    meta: (window.fbq?.queue || []).filter(a => a[0] === "trackSingle").length,
    openai: (window.oaiq?.q || []).filter(a => a[0] === "measure").length
  }));
}
try {
  const desktop = await prepare({ width: 1440, height: 1000 });
  await desktop.page.goto("https://aissistedconsulting.com/contact/");
  await desktop.page.screenshot({ path: path.join(out, "existing-contact-desktop.png"), fullPage: true });
  await desktop.page.goto("https://aissistedconsulting.com/workflow-check/?utm_source=meta&utm_medium=paid_social&utm_campaign=test_workflow");
  await desktop.page.screenshot({ path: path.join(out, "workflow-check-desktop.png"), fullPage: true });
  assert.equal(external.length, 0, "no SDKs before a successful receipt");
  assert.equal(await desktop.page.locator('input:not([type="hidden"]):not([type="checkbox"]):not([name="websiteLeaveBlank"]), textarea, select').count(), 5);
  assert.equal(await desktop.page.locator('[name="measurementConsent"]').count(), 0);
  await fill(desktop.page);
  await desktop.page.locator("[data-contact-submit]").click();
  await desktop.page.getByText("We couldn't confirm receipt.", { exact: false }).waitFor();
  assert.deepEqual(await counts(desktop.page), { google: 0, meta: 0, openai: 0 });
  await desktop.page.locator("[data-contact-submit]").click();
  await desktop.page.getByText("Inquiry received. AIssisted Consulting will reply directly.", { exact: true }).waitFor();
  await desktop.page.waitForFunction(() => (window.oaiq?.q || []).some(a => a[0] === "measure"));
  assert.deepEqual(await counts(desktop.page), { google: 1, meta: 1, openai: 1 });
  assert.equal(requests[0].key, requests[1].key);
  assert.deepEqual(requests[0].body, requests[1].body);
  await fill(desktop.page);
  await desktop.page.locator("[data-contact-submit]").click();
  await desktop.page.getByText("A matching inquiry was already received recently.", { exact: true }).waitFor();
  // Explicit successful receipt replay must also remain deduplicated.
  const storedId = fixture.sqlite.prepare("SELECT id FROM contact_inquiries").get().id;
  await desktop.page.evaluate(id => window.AicLeadTracking.trackReceipt(id), storedId);
  await desktop.page.waitForFunction(() => (window.oaiq?.q || []).some(a => a[0] === "measure"));
  assert.deepEqual(await counts(desktop.page), { google: 1, meta: 1, openai: 1 });
  assert.equal(crm.size, 1);
  assert.equal(fixture.sqlite.prepare("SELECT count(*) AS n FROM contact_inquiries").get().n, 1);
  const payload = [...crm.values()][0];
  assert.equal(payload.sourceChannel, "website");
  assert.match(payload.sourcePage, /^\/workflow-check\/\?utm_source=meta/);
  assert.equal(payload.utmSource, "meta");
  assert.match(payload.message, /Looking for help in the next 30 days\? Yes/);
  const phone = await prepare({ width: 390, height: 844 });
  await phone.page.goto("https://aissistedconsulting.com/workflow-check/");
  await phone.page.screenshot({ path: path.join(out, "workflow-check-phone.png"), fullPage: true });
  assert.equal(await phone.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await phone.page.locator("[data-menu-open]").click();
  assert.equal(await phone.page.locator("[data-menu]").isVisible(), true);
  await phone.page.locator("[data-menu-close]").click();
  assert.equal(await phone.page.locator("[data-menu]").isVisible(), false);
  const preview = await prepare({ width: 390, height: 844 }, "https://preview.pages.dev");
  const priorExternal = external.length;
  await preview.page.goto("https://preview.pages.dev/workflow-check/");
  await preview.page.evaluate(() => window.AicLeadTracking.trackReceipt("inq_preview"));
  assert.equal(external.length, priorExternal);
  assert.deepEqual(await counts(preview.page), { google: 0, meta: 0, openai: 0 });
  const gpc = await prepare({ width: 390, height: 844 }, "https://aissistedconsulting.com", true);
  const beforeGpc = external.length;
  await gpc.page.goto("https://aissistedconsulting.com/workflow-check/");
  await fill(gpc.page);
  await gpc.page.locator('[name="email"]').fill("test-gpc@example.test");
  await gpc.page.locator("[data-contact-submit]").click();
  await gpc.page.getByText("Inquiry received. AIssisted Consulting will reply directly.", { exact: true }).waitFor();
  assert.deepEqual(await counts(gpc.page), { google: 0, meta: 0, openai: 0 });
  assert.equal(external.length, beforeGpc, "GPC must prevent every advertising SDK request");
  assert.equal(crm.size, 2, "one ordinary inquiry plus one separately accepted GPC inquiry");
  assert.deepEqual([...desktop.errors, ...phone.errors, ...preview.errors, ...gpc.errors], []);
  const inquiry = fixture.sqlite.prepare("SELECT id, created_at, source_page FROM contact_inquiries").get();
  await writeFile(path.join(out, "isolated-lead.json"), JSON.stringify({
    inquiry, crm: { id: 901, ...payload }, receivedCount: received.length,
    storedLeads: 1, gpcStoredLeads: 1, conversions: await counts(desktop.page)
  }, null, 2));
  await writeFile(path.join(out, "browser-results.json"), JSON.stringify({
    status: "passed", storedLeads: 1, source: payload.sourcePage,
    lostAcknowledgementRetry: "same idempotency key; no events until successful receipt",
    duplicateSubmit: "one CRM record, one conversion per provider",
    conversions: await counts(desktop.page), preview: "silent", measurement: "default on after successful receipt; GPC off", gpc: "inquiry accepted, zero SDK requests or events",
    phoneOverflow: false, menu: "passed", pageErrors: []
  }, null, 2));
} finally {
  await browser.close();
  globalThis.fetch = oldFetch;
  for (const fn of cleanup) fn();
}
