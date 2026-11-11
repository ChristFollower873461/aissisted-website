import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const excluded = new Set(["node_modules", ".git", "backups", "tests", "docs", "db", "migrations", "config"]);

async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await visit(target);
      continue;
    }
    if (!entry.name.endsWith(".html")) continue;
    const before = await readFile(target, "utf8");
    const after = before
      .replaceAll("<small>AI operations lab</small>", "<small>AI &amp; software implementation</small>")
      .replaceAll("Schedule a Free Consultation", "Request a 15-Minute Fit Call")
      .replaceAll("Get a Free Consultation", "Request a 15-Minute Fit Call")
      .replaceAll("free 30-minute consultation", "request-only 15-minute Fit Call")
      .replaceAll("free consultation", "request-only Fit Call");
    if (after !== before) await writeFile(target, after, "utf8");
  }
}

await visit(root);
