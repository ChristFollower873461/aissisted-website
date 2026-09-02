import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TOOLS } from "../functions/api/_lib/mcp-tools.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registryVersion = "2026-09-02.1";
const registryHash = "3ca531e1a0fcf19268f6182e6510f965a9328738f1885dc3e197027874b19923";
const activeFiles = [
  "index.html",
  "services/index.html",
  "about/index.html",
  "contact/index.html",
  "book/index.html",
  "book/success/index.html",
  "book/cancel/index.html",
  "thank-you.html",
  "small-business-ai-help/index.html",
  "family-ai-help/index.html",
  "privacy-and-control/index.html",
  "industries/index.html",
  "tools.html",
  "api/business-profile.json",
  "api/services.json",
  "api/service-areas.json",
  "llms.txt",
  "knowledge/small-business-ai-help.md",
  "agent.json",
  ".well-known/agent.json",
  "docs/mcp.html"
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function listPublicHtmlFiles(directory, prefix = "") {
  const files = [];
  const blockedDirectories = new Set([
    ".git",
    "backups",
    "config",
    "db",
    "docs",
    "migrations",
    "node_modules",
    "scripts",
    "tests"
  ]);
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (blockedDirectories.has(entry.name)) continue;
    const relative = path.join(prefix, entry.name);
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listPublicHtmlFiles(absolute, relative));
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      files.push(relative);
    }
  }
  return files.sort();
}

const bodies = new Map();
for (const file of activeFiles) bodies.set(file, await readFile(path.join(root, file), "utf8"));

const combined = [...bodies.entries()].map(([file, body]) => `FILE:${file}\n${body}`).join("\n");
const forbidden = [
  [/AI operations lab/i, "old company category"],
  [/12 businesses/i, "blocked aggregate businesses claim"],
  [/20 installed systems/i, "blocked aggregate systems claim"],
  [/40 configured agents/i, "blocked aggregate agents claim"],
  [/100\+ operational skills/i, "blocked aggregate skills claim"],
  [/200k\+|200,000 interactions/i, "blocked interaction claim"],
  [/reservation deposit/i, "legacy deposit language"],
  [/credited once toward/i, "legacy credit language"],
  [/\$125/i, "unapproved price"],
  [/\[[A-Z][A-Z0-9 _-]+\]/, "public placeholder token"]
];
for (const [pattern, label] of forbidden) assert(!pattern.test(combined), `${label} remains in active projection`);

const publicHtmlFiles = await listPublicHtmlFiles(root);
const retiredPublicPatterns = [
  [/Book an AI Operations Consult/i, "retired v1 booking title"],
  [/Book a consult/i, "retired v1 CTA"],
  [/\b(?:book|schedule)\s+(?:a\s+)?(?:local\s+AI\s+)?consult(?:ation)?\b/i, "generic consultation booking CTA"],
  [/Free Consultation/i, "broad retired consultation CTA"],
  [/\bfree,?\s+(?:no-pressure\s+)?consultation\b/i, "broad free consultation promise"],
  [/\$225(?:\.00)?\s+(?:reservation\s+)?deposit/i, "retired v1 deposit offer"],
  [/35%\s+(?:build-slot\s+)?deposit/i, "retired build-slot deposit"],
  [/Reserve Your (?:AI )?Agent/i, "retired reserve CTA"],
  [/\breserve (?:your|a) build slot\b/i, "retired build-slot CTA"],
  [/href\s*=\s*["'][^"']*\/reserve(?:[/?#"'])/i, "retired reserve link"]
];
for (const file of publicHtmlFiles) {
  const body = await readFile(path.join(root, file), "utf8");
  for (const [pattern, label] of retiredPublicPatterns) {
    assert(!pattern.test(body), `${label} remains in public HTML: ${file}`);
  }
}

for (const file of ["index.html", "services/index.html", "about/index.html", "contact/index.html", "book/index.html"]) {
  const body = bodies.get(file);
  assert(body.includes(registryVersion), `${file} missing registry version`);
  assert(body.includes(registryHash), `${file} missing registry hash`);
}

const home = bodies.get("index.html");
assert(home.includes("Fix how something works") && home.includes("Build something new"), "homepage must show both lanes");
assert(home.includes("Book the $225 plan"), "homepage paid-plan CTA missing");
assert(!home.includes("scoreboard-metrics"), "homepage scoreboard markup remains");
assert(home.indexOf("Workflow Map &amp; First-Build Plan") < home.indexOf("Products &amp; R&amp;D"), "products must remain secondary");

const services = bodies.get("services/index.html");
assert(services.includes("Small businesses and individuals") || services.includes("small businesses and individuals"), "services audience mismatch");
assert(services.includes("Fix how something works") && services.includes("Build something new"), "services lanes missing");

const book = bodies.get("book/index.html");
const outcomes = [
  "Problem or build goal.",
  "Recommended direction and material known constraints.",
  "Smallest useful first build.",
  "Next decision and validation needed before a reliable implementation quote."
];
outcomes.forEach((outcome) => assert(book.includes(outcome), `booking outcome missing: ${outcome}`));
assert(book.includes("No implementation credit"), "no-credit boundary missing");
assert(book.includes("second qualifying business day after the completed session"), "delivery clock missing");
assert(book.indexOf("Book") < book.indexOf("Request a free 15-minute Fit Call"), "Fit Call must remain secondary");

const business = JSON.parse(bodies.get("api/business-profile.json"));
const serviceFeed = JSON.parse(bodies.get("api/services.json"));
const areas = JSON.parse(bodies.get("api/service-areas.json"));
assert(business.registry_version === registryVersion && business.registry_sha256 === registryHash, "business-profile trace mismatch");
assert(business.primary_offer.implementation_credit === false, "business-profile v2 credit must be false");
assert(serviceFeed.services.filter((item) => ["workflow_improvement", "custom_development"].includes(item.id)).length === 2, "service-feed lane mismatch");
assert(serviceFeed.services.find((item) => item.id === "workflow_map_build_discovery_225")?.public_outcomes.length === 4, "service-feed outcome count mismatch");
assert(areas.audience_fit.some((item) => item.includes("Individuals")), "service-area individual audience missing");

assert(bodies.get("agent.json") === bodies.get(".well-known/agent.json"), "agent manifest duplicates drifted");
const agent = JSON.parse(bodies.get("agent.json"));
assert(agent.site.registryVersion === registryVersion && agent.site.registrySha256 === registryHash, "agent trace mismatch");
assert(agent.commands.some((entry) => entry.id === "draft_custom_development_question"), "agent custom-development route missing");
assert(!TOOLS.some((tool) => tool.name === "start_booking"), "unsafe direct MCP booking remains exposed");

const redirects = await readFile(path.join(root, "_redirects"), "utf8");
assert(/^\/reserve \/book\/ 301$/m.test(redirects) && /^\/reserve\.html \/book\/ 301$/m.test(redirects), "reserve redirects missing");
const sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");
assert(!sitemap.includes("/reserve") && !sitemap.includes("/openclaw"), "retired routes remain in sitemap");
const middleware = await readFile(path.join(root, "functions/_middleware.js"), "utf8");
for (const value of ["/config/", "/scripts/", "/STATUS.md", "/DEPLOY-READY.md"]) assert(middleware.includes(value), `public-file block missing: ${value}`);

console.log(`public-projection-v2:pass projection_files=${activeFiles.length} public_html_files=${publicHtmlFiles.length} registry=${registryVersion}`);
