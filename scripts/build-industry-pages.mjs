// The three trade pages share one layout and differ only in copy. This writes them from the data
// below so they stay identical in structure.
//   node scripts/build-industry-pages.mjs
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const V = "20260907";

const trades = [
  {
    slug: "hvac",
    name: "HVAC",
    title: "HVAC AI Workflow Examples | AIssisted Consulting",
    description: "HVAC workflow examples for seasonal call pressure, emergency intake, scheduling support, maintenance follow-up, and owner visibility.",
    h1: "Bring the call pressure into one reviewable workflow.",
    sub: "Seasonal spikes, emergency intake, scheduling friction, maintenance follow-up. Map one of them clearly before adding anything.",
    review: "Calls and handoffs need context. AI can organize notes, reminders, and follow-up drafts. Dispatch choices and customer commitments still get a person.",
    steps: [
      ["Emergency intake", "What matters when a customer calls under pressure, and who needs to see it next."],
      ["Scheduling support", "Reminders, handoffs, and appointment notes that cut confusion without replacing dispatch judgment."],
      ["Maintenance follow-up", "Check-in and reminder language a person reviews before it reaches a customer."],
      ["Owner visibility", "The daily friction points summarized so the owner can decide where support is worth adding."],
    ],
    boundary: "No tool should make trade judgment invisible.",
    boundaryNote: "Urgency, customer trust, and on-site context are the job. AI supports the admin around it. People make the commitments.",
    ctaPrimary: ["../../contact/", "Ask about an HVAC workflow"],
    ctaSecondary: ["../../industries/", "Compare trades"],
  },
  {
    slug: "pest-control",
    name: "Pest control",
    title: "Pest Control AI Workflow Examples | AIssisted Consulting",
    description: "Pest control workflow examples for lead intake, recurring follow-up, scheduling support, customer communication, and owner visibility.",
    h1: "Make recurring service communication easier to see.",
    sub: "Lead intake, recurring follow-up, scheduling, customer updates. Start with the repeat handoff that creates the admin drag.",
    review: "Recurring work still needs relationship context. AI can draft reminders and surface follow-ups. Customer communication stays reviewable by the office.",
    steps: [
      ["Lead intake", "The details that come in, the questions that repeat, and the handoff that needs a look."],
      ["Recurring follow-up", "Reminders and check-ins that keep communication consistent with a person in control."],
      ["Scheduling support", "Reminder points and handoffs organized, without claiming the route or calendar runs itself."],
      ["Customer communication", "Notes, next steps, and reply drafts that are easy to review before they go out."],
    ],
    boundary: "Keep service judgment and customer trust with people.",
    boundaryNote: "Homes, businesses, sensitive details, recurring relationships. AI makes the admin clearer. It does not take over the conversation.",
    ctaPrimary: ["../../contact/", "Ask about a pest control workflow"],
    ctaSecondary: ["../../small-business-ai-help/", "See the starting method"],
  },
  {
    slug: "plumbing",
    name: "Plumbing",
    title: "Plumbing AI Workflow Examples | AIssisted Consulting",
    description: "Plumbing workflow examples for urgent calls, dispatch details, quote follow-up, customer updates, and owner visibility.",
    h1: "Turn urgent details into a clearer handoff.",
    sub: "Urgent calls, dispatch details, quote follow-up, customer updates. Map what gets lost on a busy day.",
    review: "Urgency makes the handoff matter. AI can organize details and draft follow-up. Priorities, commitments, and sensitive details still get reviewed by people.",
    steps: [
      ["Urgent calls", "What the caller shares, which details matter, and where human judgment is required."],
      ["Dispatch details", "Clearer notes and handoffs, without making the tool responsible for trade decisions."],
      ["Quote follow-up", "Reviewable reminders and summaries around estimates, open questions, and next steps."],
      ["Customer updates", "Communication that is easy to review so nobody is left wondering what happens next."],
    ],
    boundary: "Support the admin work without hiding the decision.",
    boundaryNote: "Urgent conditions, property details, customer trust. People stay responsible for judgment. The workflow around them gets easier to review.",
    ctaPrimary: ["../../contact/", "Ask about a plumbing workflow"],
    ctaSecondary: ["../../privacy-and-control/", "Review the boundaries"],
  },
];

const escape = (s) => s.replace(/&/g, "&amp;");

function page(t) {
  const base = "../../";
  const url = `https://aissistedconsulting.com/industries/${t.slug}/`;
  const book = `${base}book/?entry_route=industries&amp;cta_id=industries_${t.slug.replace(/-/g, "_")}_nav_paid_plan`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${t.title}</title>
    <meta name="description" content="${t.description}">
    <meta name="theme-color" content="#06080f">
    <link rel="canonical" href="${url}">
    <meta property="og:type" content="website">
    <meta property="og:title" content="${t.title}">
    <meta property="og:description" content="${escape(t.sub)}">
    <meta property="og:url" content="${url}">
    <meta property="og:image" content="https://aissistedconsulting.com/assets/social-logo-20260713.jpg">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${t.title}">
    <meta name="twitter:description" content="${escape(t.sub)}">
    <meta name="twitter:image" content="https://aissistedconsulting.com/assets/social-logo-20260713.jpg">
    <link rel="preload" href="/assets/fonts/martian-mono-var.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="stylesheet" href="/assets/site/site.css?v=${V}">
    <link rel="stylesheet" href="/assets/site/page.css?v=${V}">
    <script type="application/ld+json">
    {
          "@context": "https://schema.org",
          "@type": "WebPage",
          "name": "${t.title}",
          "description": "${t.description}",
          "url": "${url}",
          "publisher": {
                "@type": "LocalBusiness",
                "name": "AIssisted Consulting",
                "telephone": "+13528173567",
                "email": "pj@aissistedconsulting.com",
                "address": {
                      "@type": "PostalAddress",
                      "addressLocality": "Ocala",
                      "addressRegion": "FL",
                      "addressCountry": "US"
                }
          }
    }
    </script>
  </head>
  <body data-page="industry-${t.slug}">
    <a class="skip-link" href="#main">Skip to content</a>

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

    <main id="main">
      <section class="page-hero" aria-labelledby="page-title">
        <div class="hero-stage" data-hero-scene="/assets/hero/hero-scene.min.js?v=${V}" data-hero-variant="page" aria-hidden="true">
          <picture>
            <source media="(max-width: 760px)" srcset="/assets/hero/poster-page-mobile.webp">
            <img class="hero-poster" src="/assets/hero/poster-page.webp" alt="" width="2880" height="1800" decoding="async" fetchpriority="high">
          </picture>
        </div>
        <div class="hero-scrim" aria-hidden="true"></div>
        <div class="container page-hero-copy">
          <p class="kicker">${t.name}</p>
          <h1 class="h1" id="page-title">${t.h1}</h1>
          <p class="sub">${t.sub}</p>
          <div class="hero-actions">
            <a class="btn btn-gold" href="${t.ctaPrimary[0]}">${t.ctaPrimary[1]}</a>
            <a class="btn btn-ghost" href="${t.ctaSecondary[0]}">${t.ctaSecondary[1]}</a>
          </div>
        </div>
      </section>

      <section class="section" aria-labelledby="review-title">
        <div class="container split">
          <p class="statement reveal" id="review-title">Look for the work that repeats under pressure.</p>
          <p class="sub reveal" data-delay="1">${t.review}</p>
        </div>
      </section>

      <section class="section" aria-labelledby="steps-title">
        <div class="container">
          <div class="head reveal">
            <p class="kicker">Starting points</p>
            <h2 class="h2" id="steps-title">Four places the first workflow usually lives.</h2>
          </div>
          <ol class="steps reveal" data-delay="1">
${t.steps.map(([h, p]) => `            <li>
              <h3>${h}</h3>
              <p>${p}</p>
            </li>`).join("\n")}
          </ol>
        </div>
      </section>

      <section class="section" aria-labelledby="boundary-title">
        <div class="container split">
          <p class="statement reveal" id="boundary-title">${t.boundary}</p>
          <p class="sub reveal" data-delay="1">${t.boundaryNote}</p>
        </div>
      </section>

      <section class="section cta" id="contact" aria-labelledby="contact-title">
        <div class="container cta-grid">
          <div class="reveal">
            <p class="kicker">Talk to us</p>
            <h2 class="h2" id="contact-title">Bring one workflow.<br>Or one idea.</h2>
            <p class="sub">We'll tell you straight whether it's worth doing.</p>
            <div class="hero-actions">
              <a class="btn btn-gold" href="${base}book/?entry_route=industries&amp;cta_id=industries_${t.slug.replace(/-/g, "_")}_footer_paid_plan">Book the $225 plan</a>
              <a class="btn btn-ghost" href="${base}contact/">Contact</a>
            </div>
          </div>
          <address class="contact-lines reveal" data-delay="1">
            <a href="tel:+13528173567">(352) 817-3567</a>
            <a href="mailto:pj@aissistedconsulting.com">pj@aissistedconsulting.com</a>
            <span>Ocala, Florida &middot; remote across the U.S.</span>
          </address>
        </div>
      </section>
    </main>

    <footer class="site-footer">
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

    <script src="/main.js?v=20260718"></script>
    <script src="/assets/aic-google-ads-tracking.js?v=20260817"></script>
    <script src="/assets/site/site.js?v=${V}"></script>
  </body>
</html>
`;
}

for (const trade of trades) {
  await writeFile(path.join(root, "industries", trade.slug, "index.html"), page(trade));
  console.log(`wrote industries/${trade.slug}/index.html`);
}
