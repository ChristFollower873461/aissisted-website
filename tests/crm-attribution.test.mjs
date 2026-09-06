import test from "node:test";
import assert from "node:assert/strict";
import { buildCrmAttribution } from "../functions/api/_lib/crm-attribution.js";

const ORIGIN = "https://aissistedconsulting.com";

test("an absolute URL at the receiver limit retains its original encoding and fragment", () => {
  const prefix = "/book/?utm_source=email%20newsletter&extra=";
  const suffix = "#fit-call";
  const sourcePage = prefix + "x".repeat(500 - ORIGIN.length - prefix.length - suffix.length) + suffix;
  const attribution = buildCrmAttribution({ sourcePage, fallbackPath: "/book/" });
  assert.equal(attribution.sourceUrl, ORIGIN + sourcePage);
  assert.equal(attribution.sourceUrl.length, 500);
  assert.equal(attribution.utmSource, "email newsletter");
});

test("overflow preserves encoded path and complete parameters without corrupting Unicode or fragments", () => {
  const params = new URLSearchParams({
    gclid: "x".repeat(140),
    utm_source: "é".repeat(20),
    utm_medium: "m".repeat(93),
    utm_campaign: "c".repeat(80)
  });
  const sourcePage = `/b%6Fok/?${params}#fit-call`;
  assert.ok(sourcePage.length <= 500);
  assert.ok((ORIGIN + sourcePage).length > 500);
  const attribution = buildCrmAttribution({ sourcePage, fallbackPath: "/book/" });
  assert.ok(attribution.sourceUrl.length <= 500);
  const result = new URL(attribution.sourceUrl);
  assert.equal(result.pathname, "/b%6Fok/");
  for (const [key, value] of result.searchParams) assert.equal(value, params.get(key));
  assert.ok(result.hash === "" || result.hash === "#fit-call", "retain or omit the whole fragment");
  assert.equal(attribution.sourcePage, sourcePage);
  assert.equal(attribution.utmSource, "é".repeat(20));
  assert.equal(attribution.utmCampaign, "c".repeat(80));
});

for (const sourcePage of ["/" + "p".repeat(499), "/" + "é".repeat(100)]) {
  test(`an over-budget pathname leaves optional URLs empty (${sourcePage.length} source characters)`, () => {
    const attribution = buildCrmAttribution({ sourcePage, fallbackPath: "/book/" });
    assert.ok(new URL(sourcePage, ORIGIN).href.length > 500);
    assert.equal(attribution.sourceUrl, "");
    assert.equal(attribution.landingPage, "");
    assert.equal(attribution.sourcePage, sourcePage);
  });
}
