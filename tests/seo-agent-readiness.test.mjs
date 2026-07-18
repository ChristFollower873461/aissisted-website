import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://aissistedconsulting.com";

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function routeFile(urlValue) {
  const url = new URL(urlValue, ORIGIN);
  assert.equal(url.origin, ORIGIN, `unexpected external route: ${urlValue}`);

  const relative = decodeURIComponent(url.pathname).replace(/^\//, "");
  const candidates = [];
  if (!relative) {
    candidates.push("index.html");
  } else if (relative.endsWith("/")) {
    candidates.push(`${relative}index.html`);
  } else {
    candidates.push(relative, `${relative}.html`, `${relative}/index.html`);
  }

  const match = candidates.find((candidate) => fs.existsSync(path.join(ROOT, candidate)));
  assert.ok(match, `no local file for ${url.href}`);
  return match;
}

function sitemapUrls() {
  return [...read("sitemap.xml").matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
}

test("every sitemap page resolves locally with core SEO metadata", () => {
  const urls = sitemapUrls();
  assert.ok(urls.length >= 38, "sitemap unexpectedly lost public pages");

  for (const url of urls) {
    const relativePath = routeFile(url);
    if (!relativePath.endsWith(".html")) continue;

    const html = read(relativePath);
    assert.match(html, /<title>[^<]+<\/title>/i, `${relativePath} is missing a title`);
    assert.match(html, /<meta[^>]+name=["']description["'][^>]+content=["'][^"']+/i, `${relativePath} is missing a description`);
    assert.match(html, new RegExp(`<link[^>]+rel=["']canonical["'][^>]+href=["']${url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`, "i"), `${relativePath} has the wrong canonical`);
    assert.doesNotMatch(html, /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i, `${relativePath} is noindex`);

    for (const script of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
      assert.doesNotThrow(() => JSON.parse(script[1]), `${relativePath} has invalid JSON-LD`);
    }
  }
});

test("OpenAI search crawling and public discovery files remain enabled", () => {
  const robots = read("robots.txt");
  assert.match(robots, /User-agent:\s*OAI-SearchBot\s+[\s\S]*?Allow:\s*\//i);
  assert.match(robots, /Sitemap:\s*https:\/\/aissistedconsulting\.com\/sitemap\.xml/i);

  const manifest = JSON.parse(read(".well-known/agent.json"));
  const skills = JSON.parse(read(".well-known/agent-skills/index.json"));
  assert.equal(manifest.site.domain, "aissistedconsulting.com");
  assert.equal(manifest.discovery.sitemap, "/sitemap.xml");
  assert.equal(manifest.discovery.llmsTxt, "/llms.txt");
  assert.ok(skills.skills.some((skill) => skill.id === "read-services"));
});

test("agent-facing references resolve to public files", () => {
  const llms = read("llms.txt");
  const urls = [...llms.matchAll(/https:\/\/aissistedconsulting\.com\/[A-Za-z0-9_./-]*/g)].map((match) => match[0]);
  assert.ok(urls.length >= 30, "llms.txt unexpectedly lost public references");
  for (const url of new Set(urls)) routeFile(url);

  const services = JSON.parse(read("api/services.json"));
  for (const service of services.services) {
    for (const url of service.related_pages || []) routeFile(url);
  }
});

test("ownership guide is connected across human and agent discovery paths", () => {
  const guideUrl = `${ORIGIN}/guides/ai-ownership-and-local-operator-control/`;
  assert.ok(sitemapUrls().includes(guideUrl));
  assert.match(read("llms.txt"), new RegExp(guideUrl));
  assert.match(read("knowledge/small-business-ai-help.md"), new RegExp(guideUrl));
  assert.match(read("small-business-ai-help/index.html"), /guides\/ai-ownership-and-local-operator-control\//);
  assert.match(read("privacy-and-control/index.html"), /guides\/ai-ownership-and-local-operator-control\//);

  const services = JSON.parse(read("api/services.json"));
  assert.ok(services.services.some((service) => service.related_pages?.includes(guideUrl)));
});
