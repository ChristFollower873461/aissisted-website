import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("all hero pages request the versioned mesh bundle and matching fallback posters", () => {
  const root = new URL("../", import.meta.url);
  const pages = ["index.html", "404.html", "about/index.html", "contact/index.html",
    "privacy-and-control/index.html", "services/index.html", "workflow-automation/index.html",
    "small-business-ai-help/index.html", "industries/index.html", "industries/plumbing/index.html",
    "industries/hvac/index.html", "industries/pest-control/index.html", "family-ai-help/index.html"];
  for (const page of pages) {
    const html = readFileSync(new URL(page, root), "utf8");
    const references = [...html.matchAll(/(?:data-hero-scene|srcset|src)="([^\"]*assets\/hero\/[^\"]+)"/g)].map(match => match[1]);
    assert.equal(references.length, 3, page);
    for (const reference of references) {
      const url = new URL(reference, "https://aissistedconsulting.com/");
      assert.equal(url.searchParams.get("v"), "20260907-mesh", `${page}: stale ${reference}`);
      assert.ok(existsSync(new URL(url.pathname.slice(1), root)), `${page}: missing ${reference}`);
    }
  }
});
