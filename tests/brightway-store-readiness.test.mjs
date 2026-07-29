import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appStorePages = [
  "brightway/index.html",
  "brightway/support/index.html",
  "brightway/terms/index.html",
  "privacy/brightway/index.html",
  "tools.html"
];

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("BrightWay App Store pages use production release language", async () => {
  for (const path of appStorePages) {
    const source = await read(path);
    assert.doesNotMatch(source, /\bprivate[- ]beta\b|\bbeta\b/i, path);
    assert.doesNotMatch(source, /sslip\.io|34-24-14-158/i, path);
  }
});

test("BrightWay public legal and support URLs remain mutually linked", async () => {
  const product = await read("brightway/index.html");
  const support = await read("brightway/support/index.html");
  const terms = await read("brightway/terms/index.html");
  const privacy = await read("privacy/brightway/index.html");

  for (const source of [product, support, terms, privacy]) {
    assert.match(source, /\/brightway\/support\//);
    assert.match(source, /\/privacy\/brightway\//);
    assert.match(source, /\/brightway\/terms\//);
  }
});

test("BrightWay privacy caveat and parent controls remain explicit", async () => {
  const privacy = await read("privacy/brightway/index.html");

  assert.match(
    privacy,
    /not a claim that every legal or operational requirement for an unrestricted public children's service has been completed/i
  );
  assert.match(privacy, /parent password confirmation/i);
  assert.match(privacy, /Parent Zone PIN/i);
  assert.match(privacy, /controlled invitation flow/i);
});
