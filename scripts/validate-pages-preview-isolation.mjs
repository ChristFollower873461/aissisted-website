import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import TOML from "@iarna/toml";

export const PREVIEW_DATABASE_ID = "febf1ca7-efa3-4629-b250-7e294ff96a47";
const PREVIEW_DATABASE_NAME = "aissisted-booking-preview-v2-20260815";
const SAFE_VARS = Object.freeze({
  PREVIEW_ACCESS_REQUIRED: "true",
  BOOKING_CHECKOUT_ENABLED: "false",
  STRIPE_EXPECTED_LIVEMODE: "false",
  BOOKING_REQUIRE_GOOGLE_CALENDAR: "false",
  BOOKING_CREATE_GOOGLE_CALENDAR_EVENT: "false",
  GOOGLE_CALENDAR_SEND_UPDATES: "none",
  BOOKING_OPEN_SESSION_EXPIRY_ENABLED: "false",
  AIC_EMAIL_PROVIDER: "disabled",
  GRAIL_EMAIL_PROVIDER: "disabled",
  AIC_EMAIL_FROM: "",
  GRAIL_EMAIL_FROM: "",
  BOOKING_NOTIFICATION_WEBHOOK_URL: "",
  BOOKING_CONFIRMATION_WEBHOOK_URL: "",
  AIC_CRM_INTAKE_URL: ""
});

// New resource types need an explicit isolation review, not a default inherited binding.
const OTHER_RESOURCE_KEYS = [
  "kv_namespaces", "r2_buckets", "services", "analytics_engine_datasets",
  "ai", "vectorize", "hyperdrive", "durable_objects", "queues", "browser"
];

export async function readPagesConfigs(root = fileURLToPath(new URL("../", import.meta.url))) {
  const entries = await Promise.all(["wrangler.toml", "wrangler.preview.toml"].map(async (file) => [
    file, TOML.parse(await readFile(path.join(root, file), "utf8"))
  ]));
  return Object.fromEntries(entries);
}

export function validatePagesPreviewIsolation(configs) {
  const errors = [];
  const requireValue = (condition, message) => { if (!condition) errors.push(message); };
  function checkSlot(slot, label, projectName, top) {
    requireValue(Boolean(slot), `${label}: explicit environment is required`);
    if (!slot) return;
    const vars = slot.vars;
    requireValue(Boolean(vars), `${label}: explicit vars are required`);
    for (const [key, value] of Object.entries(SAFE_VARS)) {
      requireValue(vars?.[key] === value, `${label}: ${key} must be ${JSON.stringify(value)}`);
    }
    requireValue(vars?.PUBLIC_SITE_ORIGIN === `https://${projectName}.pages.dev`, `${label}: origin must identify this preview project`);
    for (const key of Object.keys(top.vars || {})) {
      requireValue(Object.hasOwn(vars || {}, key), `${label}: non-inherited variable ${key} must be explicit`);
    }
    for (const key of Object.keys(vars || {})) {
      requireValue(!/(?:TOKEN|SECRET|API_KEY|PRIVATE_KEY|CREDENTIAL)(?:_|$)/.test(key), `${label}: ${key} belongs in platform secrets, not committed vars`);
    }
    const db = slot.d1_databases;
    requireValue(Array.isArray(db) && db.length === 1, `${label}: exactly one explicit preview D1 binding is required`);
    if (Array.isArray(db) && db.length === 1) {
      requireValue(db[0].binding === "BOOKING_DB", `${label}: D1 binding must be BOOKING_DB`);
      requireValue(db[0].database_name === PREVIEW_DATABASE_NAME, `${label}: D1 name must identify the isolated database`);
      requireValue(db[0].database_id === PREVIEW_DATABASE_ID, `${label}: D1 database_id must identify the isolated database`);
      requireValue(db[0].preview_database_id === PREVIEW_DATABASE_ID, `${label}: D1 preview_database_id must identify the isolated database`);
      requireValue(db[0].remote !== true, `${label}: local D1 must not opt into remote access`);
    }
    for (const key of OTHER_RESOURCE_KEYS) {
      requireValue(!Object.hasOwn(top, key) && !Object.hasOwn(slot, key), `${label}: resource ${key} needs an explicit isolation review`);
    }
  }
  for (const [file, projectName, dedicated] of [
    ["wrangler.toml", "aissisted-website", false],
    ["wrangler.preview.toml", "aissisted-offer-v2-preview", true]
  ]) {
    const config = configs[file];
    requireValue(Boolean(config), `${file}: config is required`);
    if (!config) continue;
    requireValue(config.name === projectName, `${file}: unexpected Pages project name`);
    requireValue(config.pages_build_output_dir === ".", `${file}: Pages build output must remain explicit`);
    for (const name of Object.keys(config.env || {})) {
      requireValue(["production", "preview"].includes(name), `${file}: Pages does not support environment ${name}`);
    }
    checkSlot(config.env?.preview, `${file} env.preview`, projectName, config);
    if (dedicated) {
      checkSlot(config, `${file} default/production`, projectName, config);
      if (config.env?.production) checkSlot(config.env.production, `${file} env.production`, projectName, config);
    }
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const errors = validatePagesPreviewIsolation(await readPagesConfigs());
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("Pages preview isolation: both projects have explicit isolated preview settings; dedicated production slot is isolated.");
  }
}
