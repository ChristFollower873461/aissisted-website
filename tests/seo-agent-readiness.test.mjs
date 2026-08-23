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

function robotRules(robots, requestedAgent) {
  const groups = [];
  let current = null;
  let acceptingAgents = false;

  for (const rawLine of robots.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    if (!line || !line.includes(":")) continue;
    const [rawKey, ...valueParts] = line.split(":");
    const key = rawKey.trim().toLowerCase();
    const value = valueParts.join(":").trim();

    if (key === "user-agent") {
      if (!current || !acceptingAgents) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      acceptingAgents = true;
      continue;
    }

    acceptingAgents = false;
    if (current && (key === "allow" || key === "disallow")) {
      current.rules.push(`${key}:${value}`);
    }
  }

  const agent = requestedAgent.toLowerCase();
  const exact = groups.filter((group) => group.agents.includes(agent));
  return (exact.length ? exact : groups.filter((group) => group.agents.includes("*")))
    .flatMap((group) => group.rules);
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

test("frontier search crawling stays open while training and private routes stay closed", () => {
  const robots = read("robots.txt");
  const allowedAgents = [
    "OAI-SearchBot",
    "ChatGPT-User",
    "Claude-SearchBot",
    "Claude-User",
    "PerplexityBot",
    "Perplexity-User",
    "Googlebot",
    "bingbot",
    "Twitterbot",
  ];
  const blockedTrainingAgents = [
    "GPTBot",
    "ClaudeBot",
    "Google-Extended",
    "Applebot-Extended",
    "meta-externalagent",
    "Amazonbot",
    "Bytespider",
    "CCBot",
  ];
  const privateRoutes = [
    "/api/",
    "/thank-you",
    "/book/success/",
    "/grail/activation",
    "/grail/thank-you/",
  ];

  for (const agent of allowedAgents) {
    const rules = robotRules(robots, agent);
    assert.ok(rules.includes("allow:/"), `${agent} lost public crawl access`);
    for (const route of privateRoutes) {
      assert.ok(rules.includes(`disallow:${route}`), `${agent} can crawl ${route}`);
    }
  }

  for (const agent of blockedTrainingAgents) {
    assert.ok(robotRules(robots, agent).includes("disallow:/"), `${agent} training access is not blocked`);
  }

  assert.match(robots, /Sitemap:\s*https:\/\/aissistedconsulting\.com\/sitemap\.xml/i);
  const headers = read("_headers");
  assert.match(headers, /Strict-Transport-Security:\s*max-age=31536000/i);
  assert.match(
    headers,
    /Content-Security-Policy:\s*base-uri 'self'; object-src 'none'; frame-ancestors 'self'/i
  );
  assert.match(headers, /\/grail\/activation\*[\s\S]*?X-Robots-Tag:\s*noindex, nofollow/i);
  assert.match(headers, /\/grail\/thank-you\/\*[\s\S]*?X-Robots-Tag:\s*noindex, nofollow/i);

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

test("local and private AI signals connect service, privacy, and discovery paths", () => {
  const localGuideUrl = `${ORIGIN}/guides/local-and-on-prem-ai/`;
  const localPage = read("small-business-ai-help/index.html");
  assert.ok(sitemapUrls().includes(localGuideUrl));
  assert.match(read("llms.txt"), new RegExp(localGuideUrl));
  assert.match(localPage, /guides\/local-and-on-prem-ai\//);
  assert.match(read("privacy-and-control/index.html"), /guides\/local-and-on-prem-ai\//);
  assert.match(localPage, /Ocala AI Help for Small Business/);
  assert.match(localPage, /Florida AI help, grounded in a local operator\./);
  assert.match(localPage, /AI help for Florida small businesses/);
  assert.match(localPage, /"@type": "State",\s+"name": "Florida"/);
});

test("workflow automation is a connected commercial service path", () => {
  const automationUrl = `${ORIGIN}/workflow-automation/`;
  const html = read("workflow-automation/index.html");

  assert.ok(sitemapUrls().includes(automationUrl));
  assert.match(read("llms.txt"), new RegExp(automationUrl));
  assert.match(read("knowledge/small-business-ai-help.md"), new RegExp(automationUrl));
  assert.match(read("index.html"), /href="\.\/workflow-automation\/"/);
  assert.match(read("services/index.html"), /href="\.\.\/workflow-automation\/"/);
  assert.match(read("small-business-ai-help/index.html"), /href="\.\.\/workflow-automation\/"/);
  assert.match(html, /<title>Workflow Automation for Small Business \| Ocala, FL<\/title>/);
  assert.match(html, /<h1[^>]*>Workflow automation for Ocala small businesses\.<\/h1>/);
  assert.match(html, /"@type": "Service"/);
  assert.match(html, /"@type": "FAQPage"/);

  const services = JSON.parse(read("api/services.json"));
  assert.ok(services.services.some((service) => service.id === "workflow_automation" && service.related_pages?.includes(automationUrl)));

  const redirects = read("_redirects");
  assert.match(redirects, /\/guides\/workflow-automation-with-control\/ \/workflow-automation\/ 301/);
  assert.ok(!sitemapUrls().includes(`${ORIGIN}/guides/workflow-automation-with-control/`));
});

test("workflow automation is a connected commercial service path", () => {
  const automationUrl = `${ORIGIN}/workflow-automation/`;
  const html = read("workflow-automation/index.html");

  assert.ok(sitemapUrls().includes(automationUrl));
  assert.match(read("llms.txt"), new RegExp(automationUrl));
  assert.match(read("knowledge/small-business-ai-help.md"), new RegExp(automationUrl));
  assert.match(read("index.html"), /href="\.\/workflow-automation\/"/);
  assert.match(read("services/index.html"), /href="\.\.\/workflow-automation\/"/);
  assert.match(read("small-business-ai-help/index.html"), /href="\.\.\/workflow-automation\/"/);
  assert.match(html, /<title>Workflow Automation for Small Business \| Ocala, FL<\/title>/);
  assert.match(html, /<h1[^>]*>Workflow automation for Ocala small businesses\.<\/h1>/);
  assert.match(html, /"@type": "Service"/);
  assert.match(html, /"@type": "FAQPage"/);

  const services = JSON.parse(read("api/services.json"));
  assert.ok(services.services.some((service) => service.id === "workflow_automation" && service.related_pages?.includes(automationUrl)));

  const redirects = read("_redirects");
  assert.match(redirects, /\/guides\/workflow-automation-with-control\/ \/workflow-automation\/ 301/);
  assert.ok(!sitemapUrls().includes(`${ORIGIN}/guides/workflow-automation-with-control/`));
});

test("Grail exposes truthful software and offer schema", () => {
  const html = read("grail/index.html");
  const schemas = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => JSON.parse(match[1]));
  const grail = schemas.find((schema) => schema["@type"] === "SoftwareApplication");

  assert.ok(grail, "Grail SoftwareApplication schema is missing");
  assert.equal(grail.name, "Grail");
  assert.deepEqual(grail.offers.map((offer) => offer.name), ["Local Agent", "Growth", "Premium"]);
});
