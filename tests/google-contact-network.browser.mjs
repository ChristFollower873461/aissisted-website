// Real Google SDK, isolated website/CRM. Every measurement request is captured
// and fulfilled locally: no fake conversion is delivered to any vendor.
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium } from "playwright";
import { onRequest } from "../functions/api/contact/submit.js";
import { createBookingSqliteFixture } from "./fixtures/booking-sqlite.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const out = process.env.QA_OUTPUT || path.join(root, "qa-output");
await mkdir(out, { recursive: true });
const after = [];
const fixture = createBookingSqliteFixture({ after(fn) { after.push(fn); } });
const env = { BOOKING_DB: fixture.db, AIC_CRM_INTAKE_URL: "https://crm.example.test/intake/website",
  AIC_CRM_INTAKE_TOKEN: "synthetic-only" };
const crm = new Map();
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  assert.equal(String(url), env.AIC_CRM_INTAKE_URL);
  const body = JSON.parse(init.body);
  crm.set(body.qualifiedSourceEventId, body);
  return Response.json({ ok: true, submission: { id: String(crm.size) } });
};
const origin = "https://aissistedconsulting.com";
const adsId = "17956049177";
const label = "BxPjCKTg9swcEJmijvJC";
const scripts = [], captured = [], errors = [], cases = [];
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_EXECUTABLE || undefined });
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".woff2": "font/woff2", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
function isConversion(request) {
  const url = new URL(request.url());
  return url.hostname !== new URL(origin).hostname &&
    url.pathname.includes(adsId) && url.searchParams.get("label") === label;
}
try {
  for (const routeName of ["workflow-check", "contact"]) {
    const context = await browser.newContext({ serviceWorkers: "block", reducedMotion: "reduce" });
    const page = await context.newPage();
    let loseReceipt = true;
    const submissions = [];
    page.on("pageerror", error => errors.push({ routeName, message: error.message }));
    await context.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin) {
        // Only these public code assets may reach the internet. Even Google
        // measurement URLs requested as scripts stay intercepted below.
        if (request.resourceType() === "script" &&
            url.origin === "https://www.googletagmanager.com" &&
            ["/gtag/js", "/gtag/destination"].includes(url.pathname) &&
            ["AW-" + adsId, "G-4PD9VYERRY"].includes(url.searchParams.get("id"))) {
          const response = await route.fetch({ maxRedirects: 0, timeout: 30000 });
          assert.equal(response.status(), 200);
          scripts.push({ routeName, url: url.href, status: response.status() });
          return route.fulfill({ response });
        }
        captured.push({ routeName, method: request.method(), url: url.href,
          body: request.postData(), resourceType: request.resourceType(),
          matchingContactConversion: isConversion(request), forwarded: false });
        return route.fulfill({ status: 200, contentType: request.resourceType() === "script"
          ? "application/javascript" : "text/plain", body: "" });
      }
      if (url.pathname === "/api/contact/submit") {
        const tasks = [];
        submissions.push({ key: request.headers()["idempotency-key"], body: request.postDataJSON() });
        const response = await onRequest({ env,
          request: new Request(request.url(), { method: "POST", headers: request.headers(), body: request.postData() }),
          waitUntil(task) { tasks.push(task); }
        });
        await Promise.all(tasks);
        const body = await response.text();
        if (loseReceipt) { loseReceipt = false; return route.abort("failed"); }
        return route.fulfill({ status: response.status, contentType: "application/json", body });
      }
      let relative = url.pathname.replace(/^\//, "");
      if (relative.endsWith("/")) relative += "index.html";
      const filename = path.resolve(root, relative);
      assert.ok(filename.startsWith(root));
      try {
        return route.fulfill({ status: 200, contentType: mime[path.extname(filename)] || "application/octet-stream",
          body: await readFile(filename) });
      } catch { return route.fulfill({ status: 404, body: "" }); }
    });
    await page.goto(origin + "/" + routeName + "/?utm_source=google&utm_campaign=isolated_network_test");
    assert.equal(scripts.filter(x => x.routeName === routeName).length, 0, "SDK must not load before opt-in");
    await page.locator('[name="name"]').fill("TEST Network Proof");
    await page.locator('[name="email"]').fill("test-" + routeName + "@example.test");
    await page.locator('[name="company"]').fill("TEST isolated sink");
    await page.locator('[name="message"]').fill("TEST Google request capture, no customer data.");
    if (routeName === "workflow-check") await page.locator('[name="helpTiming"]').selectOption("yes");
    await page.locator('[name="consentToSubmit"]').check();
    await page.locator('[name="measurementConsent"]').check();
    await page.waitForFunction(() => Boolean(window.google_tag_manager), { timeout: 30000 });
    await page.locator("[data-contact-submit]").click();
    await page.getByText("We couldn't confirm receipt.", { exact: false }).waitFor();
    assert.equal(captured.filter(x => x.routeName === routeName && x.matchingContactConversion).length, 0,
      "lost receipt must not generate a conversion request");
    const conversionRequest = page.waitForRequest(isConversion, { timeout: 30000 });
    await page.locator("[data-contact-submit]").click();
    const request = await conversionRequest;
    await page.getByText("Inquiry received. AIssisted Consulting will reply directly.", { exact: true }).waitFor();
    const inquiry = fixture.sqlite.prepare("SELECT id FROM contact_inquiries WHERE email_normalized = ?")
      .get("test-" + routeName + "@example.test");
    const conversionUrl = new URL(request.url());
    assert.equal(conversionUrl.searchParams.get("label"), label);
    assert.equal(conversionUrl.searchParams.get("oid"), inquiry.id, "network order ID must equal receipt ID");
    assert.equal(submissions[0].key, submissions[1].key);
    // Allow SDK secondary endpoints to settle, then prove no repeat on receipt replay.
    await page.waitForTimeout(1500);
    const beforeReplay = captured.filter(x => x.routeName === routeName && x.matchingContactConversion).length;
    await page.evaluate(id => window.AicLeadTracking.trackReceipt(id), inquiry.id);
    await page.waitForTimeout(1500);
    assert.equal(captured.filter(x => x.routeName === routeName && x.matchingContactConversion).length, beforeReplay);
    cases.push({ page: "/" + routeName + "/", status: "passed", inquiryId: inquiry.id,
      conversionId: adsId, label, generatedRequest: request.url(),
      retry: "same idempotency key; no conversion before successful receipt",
      receiptReplay: "no additional matching requests", forwardedToGoogle: false });
    await context.close();
  }
  assert.equal(crm.size, 2, "one isolated lead for each form");
  assert.deepEqual(errors, []);
} finally {
  await writeFile(path.join(out, "google-contact-network.json"), JSON.stringify({
    status: cases.length === 2 ? "passed" : "incomplete", cases, publicSdkLoads: scripts,
    capturedRequests: captured, pageErrors: errors,
    boundary: "Real Google SDK code; all measurement requests fulfilled locally. No vendor receipt or live Ads reporting claim."
  }, null, 2));
  await browser.close();
  globalThis.fetch = originalFetch;
  for (const fn of after) fn();
}
