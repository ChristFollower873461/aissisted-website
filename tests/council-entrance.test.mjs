import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../assets/site/council.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

function harness({ supported = true, fails = false } = {}) {
  const document = { activeElement: null };
  const node = () => ({
    listeners: {}, attributes: {},
    addEventListener(type, handler) { this.listeners[type] = handler; },
    setAttribute(name, value) { this.attributes[name] = value; },
    focus() { document.activeElement = this; }
  });
  const opener = node(), close = node(), sail = node(), dialog = node();
  dialog.id = "council-dialog";
  dialog.open = false;
  dialog.querySelector = (selector) => selector === ".council-sail" ? sail : close;
  if (supported) dialog.showModal = () => {
    if (fails) throw new Error("Synthetic unavailable dialog");
    dialog.open = true;
  };
  dialog.close = () => { dialog.open = false; dialog.listeners.close(); };
  document.querySelector = () => opener;
  document.getElementById = () => dialog;
  // No fetch, timers, storage, window, or renderer is needed by the enhancement.
  vm.runInNewContext(source, { document });
  function click(extra = {}) {
    const event = { button: 0, prevented: false, preventDefault() { this.prevented = true; }, ...extra };
    opener.listeners.click?.(event);
    return event;
  }
  return { document, opener, close, sail, dialog, click };
}

test("the homepage has a real fallback anchor and no embedded game or speculative connection", () => {
  assert.match(html, /data-council-open href="https:\/\/play\.dripcouncil\.org\/"/);
  assert.match(html, /class="council-sail" href="https:\/\/play\.dripcouncil\.org\/"/);
  assert.match(html, /aria-labelledby="council-title" aria-describedby="council-description"/);
  assert.doesNotMatch(html, /<(?:iframe|script|link)[^>]*(?:src|href)="https:\/\/play\.dripcouncil\.org/);
  assert.doesNotMatch(source, /\b(?:fetch|import|setInterval|requestAnimationFrame|localStorage|sessionStorage)\b/);
});

test("unsupported or failed dialog enhancement keeps default navigation", () => {
  const unsupported = harness({ supported: false });
  assert.equal(unsupported.opener.listeners.click, undefined);
  assert.equal(unsupported.opener.attributes["aria-haspopup"], undefined);
  const failed = harness({ fails: true });
  assert.equal(failed.click().prevented, false);
  assert.equal(failed.dialog.open, false);
});

test("plain activation opens the dialog, wraps focus, and returns focus on close", () => {
  const run = harness();
  assert.equal(run.click().prevented, true);
  assert.equal(run.dialog.open, true);
  assert.equal(run.document.activeElement, run.sail);
  let prevented = false;
  run.dialog.listeners.keydown({ key: "Tab", shiftKey: true, preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(run.document.activeElement, run.close);
  run.dialog.listeners.keydown({ key: "Tab", shiftKey: false, preventDefault() {} });
  assert.equal(run.document.activeElement, run.sail);
  run.close.listeners.click();
  assert.equal(run.dialog.open, false);
  assert.equal(run.document.activeElement, run.opener);
});

test("modified and nonprimary clicks retain link behavior", () => {
  for (const extra of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
    const run = harness();
    assert.equal(run.click(extra).prevented, false);
    assert.equal(run.dialog.open, false);
  }
});
