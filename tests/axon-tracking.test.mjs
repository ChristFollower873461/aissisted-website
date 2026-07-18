import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

import { onRequest } from "../functions/_middleware.js";

function loadPixelHarness(source) {
  const insertedScripts = [];
  const listeners = new Map();
  const firstScript = {
    parentNode: {
      insertBefore(script) {
        insertedScripts.push(script.src);
      }
    }
  };
  const document = {
    readyState: "loading",
    addEventListener(name, callback) {
      listeners.set(name, callback);
    },
    createElement() {
      return { async: false, src: "" };
    },
    getElementsByTagName() {
      return [firstScript];
    }
  };
  const window = { location: { hostname: "aissistedconsulting.com" } };
  const context = vm.createContext({
    Date,
    Number,
    Object,
    String,
    document,
    window
  });

  vm.runInContext(source, context);
  return { insertedScripts, listeners, window };
}

function loadContactHarness(source, response) {
  let submitListener;
  let leadPayload;
  let resetCount = 0;
  const submitButton = { disabled: false, textContent: "Send inquiry" };
  const statusNode = {
    className: "",
    textContent: "",
    classList: {
      add(name) {
        statusNode.className += ` ${name}`;
      }
    }
  };
  const formValues = new Map([
    ["name", "Test Person"],
    ["email", "test@example.com"],
    ["phone", ""],
    ["company", ""],
    ["audience", "family_ai_question"],
    ["message", "A family AI question"],
    ["sourcePage", "/contact/"],
    ["websiteLeaveBlank", ""],
    ["consentToSubmit", "on"]
  ]);
  const form = {
    addEventListener(name, callback) {
      if (name === "submit") submitListener = callback;
    },
    querySelector() {
      return submitButton;
    },
    reportValidity() {
      return true;
    },
    reset() {
      resetCount += 1;
    }
  };
  class FakeFormData {
    get(name) {
      return formValues.get(name) ?? null;
    }
  }
  const context = vm.createContext({
    Date,
    Error,
    FormData: FakeFormData,
    JSON,
    Map,
    Math,
    aissistedAxon: {
      trackGenerateLead(payload) {
        leadPayload = payload;
      }
    },
    document: {
      getElementById() {
        return statusNode;
      },
      querySelector() {
        return form;
      }
    },
    fetch: async () => response
  });

  vm.runInContext(source, context);
  return {
    async submit() {
      await submitListener({ preventDefault() {} });
      return { leadPayload, resetCount, statusNode, submitButton };
    }
  };
}

test("Axon pixel initializes once and queues required lead-gen events", async () => {
  const source = await readFile(new URL("../axon-pixel.js", import.meta.url), "utf8");
  const harness = loadPixelHarness(source);

  assert.deepEqual(harness.insertedScripts, [
    "https://s.axon.ai/pixel.js",
    "https://res4.applovin.com/p/l/loader.iife.js"
  ]);
  assert.equal(harness.window.axon.eventKey, "9b5458fd-2266-46fe-ad11-76bfcf5ce6ee");
  assert.equal(harness.window.axon.operationQueue.length, 1);
  assert.deepEqual(Array.from(harness.window.axon.operationQueue[0]), ["init"]);

  harness.listeners.get("DOMContentLoaded")();
  harness.window.aissistedAxon.trackGenerateLead({ currency: "usd", value: 25 });

  assert.deepEqual(Array.from(harness.window.axon.operationQueue[1]), ["track", "page_view"]);
  assert.equal(harness.window.axon.operationQueue[2][0], "track");
  assert.equal(harness.window.axon.operationQueue[2][1], "generate_lead");
  assert.equal(harness.window.axon.operationQueue[2][2].currency, "USD");
  assert.equal(harness.window.axon.operationQueue[2][2].value, 25);

  vm.runInContext(source, vm.createContext({
    Date,
    Number,
    Object,
    String,
    document: { readyState: "complete" },
    window: harness.window
  }));
  assert.equal(harness.window.axon.operationQueue.length, 3);
});

test("middleware mirrors a valid Axon identifier into the recommended first-party cookie", async () => {
  const request = new Request("https://aissistedconsulting.com/contact/", {
    headers: { cookie: "session=one; _axwrt=abc_123-XYZ" }
  });
  const response = await onRequest({
    request,
    next: async () => new Response("ok", { status: 200 })
  });

  const cookie = response.headers.get("set-cookie");
  assert.match(cookie, /^axwrt=abc_123-XYZ;/);
  assert.match(cookie, /Domain=\.aissistedconsulting\.com/);
  assert.match(cookie, /SameSite=Lax/);
  assert.doesNotMatch(cookie, /HttpOnly/i);
});

test("middleware refuses malformed Axon cookie values", async () => {
  const request = new Request("https://aissistedconsulting.com/contact/", {
    headers: { cookie: "_axwrt=bad%0D%0Aset-cookie" }
  });
  const response = await onRequest({
    request,
    next: async () => new Response("ok", { status: 200 })
  });

  assert.equal(response.headers.get("set-cookie"), null);
});

test("contact form tracks a lead only after the API confirms success", async () => {
  const source = await readFile(new URL("../contact/contact.js", import.meta.url), "utf8");
  const harness = loadContactHarness(source, {
    ok: true,
    async text() {
      return JSON.stringify({ ok: true });
    }
  });
  const result = await harness.submit();

  assert.equal(result.leadPayload.currency, "USD");
  assert.equal(result.leadPayload.value, 25);
  assert.equal(result.resetCount, 1);
  assert.match(result.statusNode.className, /is-success/);
});

test("contact form does not track a lead when submission fails", async () => {
  const source = await readFile(new URL("../contact/contact.js", import.meta.url), "utf8");
  const harness = loadContactHarness(source, {
    ok: false,
    async text() {
      return JSON.stringify({ ok: false, error: "Rejected" });
    }
  });
  const result = await harness.submit();

  assert.equal(result.leadPayload, undefined);
  assert.equal(result.resetCount, 0);
  assert.match(result.statusNode.className, /is-error/);
});
