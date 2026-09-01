import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

test("Grail publishes a discoverable account deletion resource", () => {
  const page = readFileSync("grail/delete-account/index.html", "utf8");
  const support = readFileSync("grail/support/index.html", "utf8");
  const privacy = readFileSync("privacy/grail/index.html", "utf8");
  const redirects = readFileSync("_redirects", "utf8");
  const sitemap = readFileSync("sitemap.xml", "utf8");

  assert.match(page, /Delete your Grail account and data\./);
  assert.match(page, /AIssisted Consulting LLC/);
  assert.match(page, /No sign-in is required/);
  assert.match(page, /data-deletion-form|data-deletion-form/i);
  assert.match(page, /complete verified requests within 30 days/);
  assert.match(page, /tax, accounting, fraud prevention, security/);
  assert.match(page, /href="mailto:pj@aissistedconsulting\.com\?subject=Grail%20account%20deletion%20request"/);
  assert.match(page, /rel="canonical" href="https:\/\/aissistedconsulting\.com\/grail\/delete-account\/"/);

  assert.match(support, /href="\/grail\/delete-account\/">Delete account/);
  assert.match(privacy, /id="account-deletion"/);
  assert.match(privacy, /href="\/grail\/delete-account\/"/);
  assert.match(redirects, /\/grail\/delete-account \/grail\/delete-account\/ 301/);
  assert.match(sitemap, /https:\/\/aissistedconsulting\.com\/grail\/delete-account\//);
});

test("Grail deletion form submits a categorized, replay-safe request", async () => {
  const fields = new Map([
    ["name", "Test User"],
    ["email", "test@example.com"],
    ["company", "Test Workspace"],
    ["message", "Workspace created for review."],
    ["websiteLeaveBlank", ""],
    ["consentToSubmit", "on"]
  ]);
  const submitButton = { disabled: false, textContent: "Submit deletion request" };
  const statusNode = { textContent: "", className: "form-status" };
  let submitHandler = null;
  let resetCalled = false;
  const form = {
    querySelector(selector) {
      if (selector === "[data-deletion-submit]") return submitButton;
      if (selector === "[data-deletion-status]") return statusNode;
      return null;
    },
    addEventListener(eventName, handler) {
      if (eventName === "submit") submitHandler = handler;
    },
    reportValidity() {
      return true;
    },
    reset() {
      resetCalled = true;
    }
  };
  const fetchCalls = [];
  const context = vm.createContext({
    console,
    crypto: { randomUUID: () => "deletion-test-id" },
    document: {
      querySelector(selector) {
        return selector === "[data-deletion-form]" ? form : null;
      }
    },
    FormData: class {
      get(name) {
        return fields.get(name) ?? null;
      }
    },
    async fetch(url, options) {
      fetchCalls.push({ url, options });
      return Response.json({ ok: true });
    },
    Response
  });

  vm.runInContext(readFileSync("grail/delete-account/delete-account.js", "utf8"), context);
  assert.equal(typeof submitHandler, "function");

  await submitHandler({ preventDefault() {} });

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, "/api/contact/submit");
  assert.equal(fetchCalls[0].options.headers["idempotency-key"], "grail-deletion-deletion-test-id");
  const body = JSON.parse(fetchCalls[0].options.body);
  assert.equal(body.audience, "privacy_and_control");
  assert.equal(body.sourcePage, "/grail/delete-account/");
  assert.match(body.message, /Grail account and associated data deletion request/);
  assert.equal(resetCalled, true);
  assert.match(statusNode.textContent, /Deletion request received/);
  assert.equal(submitButton.disabled, false);
  assert.equal(submitButton.textContent, "Submit deletion request");
});
