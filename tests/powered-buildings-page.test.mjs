import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const html = readFileSync(new URL("powered-buildings/index.html", root), "utf8");

test("Powered Buildings page links every worksheet file, and each file is committed", () => {
  const files = [...html.matchAll(/href="\/powered-buildings\/worksheets\/([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(files)].sort(), [
    "Building-Scorecard.pdf",
    "Building-Scorecard.xlsx",
    "First-Call-Script.pdf",
    "Powered-Buildings-Worksheet-Pack.pdf",
    "State-Questions-Worksheet.pdf",
    "Thirty-Day-Plan.pdf",
    "Vendor-Bench-Checklist.pdf"
  ]);
  for (const file of files) {
    const url = new URL(`powered-buildings/worksheets/${file}`, root);
    assert.ok(existsSync(url), `${file} is missing`);
    assert.ok(statSync(url).size > 5000, `${file} looks empty`);
    if (file.endsWith(".pdf")) assert.equal(readFileSync(url).subarray(0, 5).toString(), "%PDF-");
  }
});

test("Powered Buildings downloads have no email gate, and Amazon stays an unlinked placeholder", () => {
  assert.doesNotMatch(html, /<form\b|<input\b|type="email"/i);
  assert.doesNotMatch(html, /store\.js/);
  assert.match(html, /data-amazon-availability>Available on Amazon\./);
  assert.doesNotMatch(html, /href="[^"]*(?:amazon\.|amzn\.)/i);
});

test("Powered Buildings cover images exist and the short URL redirects to the page", () => {
  for (const image of html.matchAll(/\/assets\/book\/powered-buildings-cover-[0-9]+\.(?:jpg|webp)/g)) {
    assert.ok(existsSync(new URL(image[0].slice(1), root)), `${image[0]} is missing`);
  }
  assert.match(readFileSync(new URL("_redirects", root), "utf8"), /^\/powered-buildings \/powered-buildings\/ 301$/m);
});
