import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { htmlScripts } from "./helpers/html-scripts.mjs";

const cases = JSON.parse(await readFile(new URL("./fixtures/html-script-inventory.json", import.meta.url), "utf8"));

for (const fixture of cases) {
  test(`HTML script inventory: ${fixture.name}`, () => {
    assert.deepEqual(htmlScripts(fixture.html), fixture.scripts);
  });
}
