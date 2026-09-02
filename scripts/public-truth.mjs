import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { BOOKING_RELEASES } from "../functions/api/_lib/booking-releases.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "config/public-truth/manifest.v2.json");
const projectionPath = path.join(root, "config/public-truth/public-projection.generated.json");
const HASH = /^[a-f0-9]{64}$/;
const FORBIDDEN_PUBLIC = [
  /reservation deposit/i,
  /\$125/i,
  /12 businesses/i,
  /20 systems/i,
  /40 agents/i,
  /100\+\s*skills/i,
  /200,?000\s+interactions/i,
  /AI operations lab/i,
  /free consultation/i,
  /30-minute consultation/i,
  /\/Users\//,
  /evidence\//,
  /IC-0[1-8]/
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function hasNull(value) {
  if (value === null) return true;
  if (Array.isArray(value)) return value.some(hasNull);
  if (value && typeof value === "object") return Object.values(value).some(hasNull);
  return false;
}

export function validateManifest(manifest) {
  assert(manifest.schemaVersion === 2, "schemaVersion must be 2");
  assert(manifest.registryId === "aissisted_public_truth", "registryId mismatch");
  assert(HASH.test(manifest.approvedRegistrySha256), "approved registry hash invalid");
  assert(HASH.test(manifest.approvedPublicProjectionSha256), "approved projection hash invalid");
  assert(manifest.company.category === "Founder-led AI and software implementation company", "company category drift");
  assert(manifest.company.oneLiner.includes("small businesses and individuals"), "company audience drift");
  assert(manifest.lanes.length === 2, "exactly two lanes required");
  assert(manifest.lanes[0].laneId === "workflow_improvement", "workflow lane drift");
  assert(manifest.lanes[1].laneId === "custom_development", "development lane drift");
  assert(manifest.offer.releaseId === "aissisted_booking_v2_2026_08_15", "release ID drift");
  assert(manifest.offer.offerId === "workflow_map_build_discovery_225", "offer ID drift");
  assert(manifest.offer.offerVersion === 2, "offer version drift");
  assert(manifest.offer.title === "Workflow Map & First-Build Plan", "offer title drift");
  assert(manifest.offer.amountCents === 22500 && manifest.offer.currency === "usd", "offer price drift");
  assert(manifest.offer.sessionMinutes === 60, "session duration drift");
  assert(manifest.offer.publicOutcomes.length === 4, "exactly four public outcomes required");
  assert(new Set(manifest.offer.internalChecklistIds).size === 8, "exactly eight unique internal checklist IDs required");
  assert(manifest.offer.internalChecklistIds.every((id) => /^IC-0[1-8]_/.test(id)), "internal checklist ID invalid");
  assert(HASH.test(manifest.offer.termsSha256), "terms hash invalid");
  assert(manifest.offer.implementationCreditEnabled === false, "v2 credit must be disabled");
  assert(manifest.offer.paymentMethodPolicy === "synchronous_card_only", "payment policy drift");
  assert(manifest.offer.confirmationRequires === "paid", "paid confirmation rule drift");
  assert(manifest.offer.delivery.calendarId === "aissisted_us_federal_observed_2026_v1", "calendar drift");
  assert(manifest.offer.delivery.observedDates.length === 11, "approved 2026 holiday list drift");
  assert(manifest.fitCall.durationMinutes === 15 && manifest.fitCall.stripeBookable === false, "Fit Call drift");
  assert(Array.isArray(manifest.proof.websiteCustomerClaimIds) && manifest.proof.websiteCustomerClaimIds.length === 0, "website proof allowlist must be empty");
  assert(manifest.products.mayImplyConsultingTractionOrRevenue === false, "product hierarchy drift");
  return true;
}

export function buildPublicProjection(manifest) {
  validateManifest(manifest);
  return {
    schemaVersion: 2,
    registryVersion: manifest.registryVersion,
    registrySha256: manifest.approvedRegistrySha256,
    termsVersion: manifest.offer.termsVersion,
    termsSha256: manifest.offer.termsSha256,
    company: manifest.company,
    lanes: manifest.lanes.map(({ laneId, label, audiences }) => ({ laneId, label, audiences })),
    primaryOffer: {
      releaseId: manifest.offer.releaseId,
      offerId: manifest.offer.offerId,
      offerVersion: manifest.offer.offerVersion,
      title: manifest.offer.title,
      amountCents: manifest.offer.amountCents,
      currency: manifest.offer.currency,
      sessionMinutes: manifest.offer.sessionMinutes,
      deliverable: manifest.offer.deliverable,
      delivery: manifest.offer.delivery,
      publicOutcomes: manifest.offer.publicOutcomes,
      implementationCreditEnabled: false,
      paymentMethodPolicy: manifest.offer.paymentMethodPolicy,
      confirmationRequires: manifest.offer.confirmationRequires
    },
    fitCall: manifest.fitCall,
    proof: { websiteCustomerClaimIds: [] },
    products: manifest.products
  };
}

export function validatePublicProjection(projection) {
  assert(!hasNull(projection), "public projection contains null");
  assert(projection.primaryOffer.publicOutcomes.length === 4, "public outcome count drift");
  assert(projection.primaryOffer.implementationCreditEnabled === false, "public v2 credit drift");
  const serialized = JSON.stringify(projection);
  FORBIDDEN_PUBLIC.forEach((pattern) => assert(!pattern.test(serialized), `forbidden public output: ${pattern}`));
  return true;
}

export function validateReleaseParity(manifest) {
  const release = BOOKING_RELEASES[manifest.offer.releaseId];
  assert(release, "runtime release record missing");
  const pairs = [
    [release.offerId, manifest.offer.offerId, "offerId"],
    [release.offerVersion, manifest.offer.offerVersion, "offerVersion"],
    [release.termsVersion, manifest.offer.termsVersion, "termsVersion"],
    [release.termsSha256, manifest.offer.termsSha256, "termsSha256"],
    [release.projectionSha256, manifest.approvedPublicProjectionSha256, "projectionSha256"],
    [release.amountCents, manifest.offer.amountCents, "amountCents"],
    [release.currency, manifest.offer.currency, "currency"],
    [release.paymentMethodPolicy, manifest.offer.paymentMethodPolicy, "paymentMethodPolicy"],
    [release.confirmationRequires, manifest.offer.confirmationRequires, "confirmationRequires"],
    [release.implementationCreditEnabled, manifest.offer.implementationCreditEnabled, "implementationCreditEnabled"],
    [release.deliveryCalendarId, manifest.offer.delivery.calendarId, "deliveryCalendarId"]
  ];
  pairs.forEach(([actual, expected, field]) => assert(actual === expected, `runtime release ${field} drift`));
  return true;
}

export async function run(mode = "check") {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  validateManifest(manifest);
  validateReleaseParity(manifest);
  const projection = buildPublicProjection(manifest);
  validatePublicProjection(projection);
  const expected = `${JSON.stringify(projection, null, 2)}\n`;
  if (mode === "write") {
    await writeFile(projectionPath, expected, "utf8");
  } else {
    const actual = await readFile(projectionPath, "utf8");
    assert(actual === expected, "generated public projection drift; run npm run generate:public-truth");
  }
  return { manifest, projection };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const mode = process.argv.includes("--write") ? "write" : "check";
  run(mode)
    .then(() => console.log(`public-truth:${mode}:pass`))
    .catch((error) => {
      console.error(`public-truth:${mode}:fail`, error.message);
      process.exitCode = 1;
    });
}
