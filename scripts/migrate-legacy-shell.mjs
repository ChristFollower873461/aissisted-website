// One-time migration: put the long-form guide and blog pages on the 2026 site system without
// rewriting their content. Swaps the stylesheet, header, menu, footer and scripts for the shared
// shell, wraps blog articles in <main>, strips the inline colour styles the old blog carried, and
// drops the blog index's "newsletter coming soon" block. Idempotent: pages already on the shell are
// left alone.
//   node scripts/migrate-legacy-shell.mjs
import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const V = "20260907";

function shell(base, route) {
  const book = `${base}book/?entry_route=${route}&amp;cta_id=${route}_nav_paid_plan`;
  const header = `    <a class="skip-link" href="#main">Skip to content</a>

    <header class="site-header" data-header>
      <div class="container nav-wrap">
        <a class="brand" href="${base}" aria-label="AIssisted Consulting home">
          <img src="/assets/logo-mark-192.png" alt="" width="40" height="40">
          <strong>AIssisted Consulting</strong>
        </a>
        <div class="nav-cluster">
          <a class="btn btn-gold btn-sm" href="${book}">Book</a>
          <button class="menu-btn" type="button" data-menu-open aria-expanded="false" aria-controls="site-menu" aria-haspopup="dialog">
            <span class="menu-lines" aria-hidden="true"><i></i><i></i></span>
            <span>Menu</span>
          </button>
        </div>
      </div>
    </header>

    <div class="site-menu" id="site-menu" data-menu role="dialog" aria-modal="true" aria-label="Site menu" hidden>
      <div class="container menu-top">
        <a class="brand" href="${base}" aria-label="AIssisted Consulting home">
          <img src="/assets/logo-mark-192.png" alt="" width="40" height="40">
          <strong>AIssisted Consulting</strong>
        </a>
        <button class="menu-btn is-close" type="button" data-menu-close>
          <span class="menu-lines" aria-hidden="true"><i></i><i></i></span>
          <span>Close</span>
        </button>
      </div>
      <div class="container menu-body">
        <nav class="menu-nav" aria-label="Primary navigation">
          <ol>
            <li style="--i:0"><a href="${base}services/"><small class="num">01</small>Services</a></li>
            <li style="--i:1"><a href="${base}privacy-and-control/"><small class="num">02</small>Private AI</a></li>
            <li style="--i:2"><a href="${base}industries/"><small class="num">03</small>Industries</a></li>
            <li style="--i:3"><a href="${base}about/"><small class="num">04</small>About</a></li>
            <li style="--i:4"><a href="${base}contact/"><small class="num">05</small>Contact</a></li>
          </ol>
        </nav>
        <div class="menu-foot">
          <p class="menu-tag">Local. Trusted. <span class="accent">AI.</span></p>
          <a class="btn btn-gold" href="${book}">Book the $225 plan</a>
          <address>
            <a href="tel:+13528173567">(352) 817-3567</a>
            <a href="mailto:pj@aissistedconsulting.com">pj@aissistedconsulting.com</a>
            <span>Ocala, Florida</span>
          </address>
        </div>
      </div>
    </div>
`;
  const footer = `    <footer class="site-footer">
      <div class="container">
        <div class="footer-grid">
          <div>
            <a class="brand" href="${base}" aria-label="AIssisted Consulting home">
              <img src="/assets/logo-mark-192.png" alt="" width="40" height="40">
              <strong>AIssisted Consulting</strong>
            </a>
            <p class="footer-blurb">AI and software implementation for small businesses and individuals. Certified AI Scientist and Certified AI Consultant (USAII).</p>
          </div>
          <div>
            <h3>Work with us</h3>
            <a href="${base}services/">Services</a>
            <a href="${base}workflow-automation/">Workflow automation</a>
            <a href="${base}small-business-ai-help/">Small business</a>
            <a href="${base}family-ai-help/">Family</a>
            <a href="${base}industries/">Industries</a>
          </div>
          <div>
            <h3>Company</h3>
            <a href="${base}about/">About</a>
            <a href="${base}privacy-and-control/">Privacy &amp; control</a>
            <a href="${base}blog/">Blog</a>
            <a href="${base}book/">Book</a>
            <a href="${base}contact/">Contact</a>
          </div>
          <div>
            <h3>Products</h3>
            <a href="${base}grail/">Grail</a>
            <a href="${base}brightway/">BrightWay</a>
            <a href="${base}unrealtor/">UnRealtor</a>
            <a href="${base}terms/">Terms</a>
            <a href="${base}privacy/">Privacy policy</a>
          </div>
        </div>
        <div class="footer-bottom">
          <p>&copy; <span data-year>2026</span> AIssisted Consulting. Ocala, FL.</p>
          <p>Local. Trusted. AI.</p>
        </div>
      </div>
    </footer>
`;
  return { header, footer };
}

const headLinks = `    <link rel="preload" href="/assets/fonts/martian-mono-var.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="stylesheet" href="/assets/site/site.css?v=${V}">
    <link rel="stylesheet" href="/assets/site/page.css?v=${V}">`;
const siteScript = `    <script src="/assets/site/site.js?v=${V}"></script>`;

async function migrateGuide(file) {
  let html = await readFile(file, "utf8");
  if (html.includes("assets/site/site.css")) return false;
  const { header, footer } = shell("../../", "guide");
  html = html.replace(/    <link rel="stylesheet" href="\.\.\/\.\.\/styles\.css[^"]*">\n/, `${headLinks}\n`);
  html = html.replace(/    <a class="skip-link"[^\n]*\n\n    <header class="site-header">[\s\S]*?<\/header>\n/, header);
  html = html.replace(/    <footer class="site-footer">[\s\S]*?<\/footer>\n/, footer);
  html = html.replace(/    <script src="\.\.\/\.\.\/main\.js[^"]*"><\/script>\n/, `${siteScript}\n`);
  if (!html.includes("assets/site/site.css") || !html.includes("data-menu-open") || !html.includes("footer-grid") || !html.includes("site.js")) {
    throw new Error(`guide migration incomplete: ${file}`);
  }
  await writeFile(file, html);
  return true;
}

async function migrateBlog(file, isIndex) {
  let html = await readFile(file, "utf8");
  if (html.includes("assets/site/site.css")) return false;
  const { header, footer } = shell("../", "blog");
  html = html.replace(/<link rel="stylesheet" href="\.\.\/styles\.css[^"]*">\n/, `${headLinks.replace(/^ {4}/gm, "")}\n`);
  html = html.replace(/<script src="\.\.\/components\/header\.js[^"]*" defer><\/script>\n/, "");
  html = html.replace(/<script src="\.\.\/components\/footer\.js[^"]*" defer><\/script>\n/, "");
  html = html.replace(/<div id="header-container"><\/div>\n/, `${header}\n<main id="main">\n`);
  html = html.replace(/<div id="footer-container"><\/div>\n/, `</main>\n${footer}${siteScript}\n`);
  // Inline colours from the old blog (blue buttons, muted greys) fight the system; the classes are styled now.
  html = html.replace(/<main id="main">[\s\S]*<\/main>/, (block) => block.replace(/ style="[^"]*"/g, ""));
  if (isIndex) {
    html = html.replace(/<section[^>]*>\s*<div class="container[^"]*">\s*<h2 class="reveal">Want More Insights\?<\/h2>[\s\S]*?<\/section>\n/, "");
  }
  if (!html.includes("assets/site/site.css") || !html.includes("data-menu-open") || !html.includes("footer-grid") || !html.includes("<main id=\"main\">") || html.includes("header-container")) {
    throw new Error(`blog migration incomplete: ${file}`);
  }
  await writeFile(file, html);
  return true;
}

let changed = 0;
for (const dir of await readdir(path.join(root, "guides"), { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  if (await migrateGuide(path.join(root, "guides", dir.name, "index.html"))) changed += 1;
}
for (const name of await readdir(path.join(root, "blog"))) {
  if (!name.endsWith(".html")) continue;
  if (await migrateBlog(path.join(root, "blog", name), name === "index.html")) changed += 1;
}
console.log(`migrate-legacy-shell: ${changed} pages moved to the shell`);
