import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "config/booking/migration-manifest.json");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function applySqlite(databasePath, sql, label) {
  const result = spawnSync("sqlite3", [databasePath], { input: sql, encoding: "utf8" });
  assert(result.status === 0, `${label} failed on a fresh database: ${result.stderr || result.stdout}`);
}

async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const logicalIds = manifest.migrations.map((entry) => entry.logicalId);
  const filenames = manifest.migrations.map((entry) => entry.filename);
  const hashes = manifest.migrations.map((entry) => entry.sha256);
  assert(new Set(logicalIds).size === logicalIds.length, "migration logical IDs are not unique");
  assert(new Set(filenames).size === filenames.length, "migration filenames are not unique");
  assert(new Set(hashes).size === hashes.length, "migration hashes are not unique");

  for (const entry of manifest.migrations) {
    const body = await readFile(path.join(root, "migrations", entry.filename));
    assert(sha256(body) === entry.sha256, `migration hash drift: ${entry.filename}`);
  }

  const freshDirectory = await mkdtemp(path.join(tmpdir(), "aissisted-full-migration-chain-"));
  const freshDatabase = path.join(freshDirectory, "fresh.sqlite");
  try {
    for (const entry of manifest.migrations) {
      const sql = await readFile(path.join(root, "migrations", entry.filename), "utf8");
      applySqlite(freshDatabase, sql, entry.filename);
    }
    const requiredTables = [
      "bookings",
      "agent_idempotency_records",
      "mcp_log",
      "grail_workspaces",
      "booking_contracts",
      "booking_deliverables",
      "integration_outbox"
    ];
    const query = `SELECT name FROM sqlite_master WHERE type='table' AND name IN (${requiredTables.map((name) => `'${name}'`).join(",")}) ORDER BY name;`;
    const result = spawnSync("sqlite3", [freshDatabase, query], { encoding: "utf8" });
    assert(result.status === 0, `fresh migration table query failed: ${result.stderr || result.stdout}`);
    const observed = result.stdout.trim().split("\n").filter(Boolean);
    assert(observed.length === requiredTables.length, `fresh migration chain missing tables: ${requiredTables.filter((name) => !observed.includes(name)).join(", ")}`);
  } finally {
    await rm(freshDirectory, { recursive: true, force: true });
  }

  const schema = await readFile(path.join(root, "db/booking-schema.sql"));
  assert(sha256(schema) === manifest.freshSchemaSha256, "fresh schema hash drift");

  const legacy = JSON.parse(
    await readFile(path.join(root, manifest.legacyPolicy.repositoryPath), "utf8")
  );
  assert(legacy.policyVersion === manifest.legacyPolicy.policyVersion, "legacy policy version drift");
  assert(
    legacy.sourceEvidenceSha256 === manifest.legacyPolicy.sourceEvidenceSha256,
    "legacy policy evidence hash drift"
  );

  const v2 = JSON.parse(await readFile(path.join(root, manifest.v2Terms.repositoryPath), "utf8"));
  assert(v2.termsVersion === manifest.v2Terms.termsVersion, "v2 terms version drift");
  assert(sha256(v2.renderedTerms) === manifest.v2Terms.renderedTermsSha256, "v2 rendered terms hash drift");
  assert(v2.renderedTermsSha256 === manifest.v2Terms.renderedTermsSha256, "v2 stored terms hash drift");
  console.log("booking-migrations:check:pass");
}

main().catch((error) => {
  console.error("booking-migrations:check:fail", error.message);
  process.exitCode = 1;
});
