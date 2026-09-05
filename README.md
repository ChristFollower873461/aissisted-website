# AIssisted Consulting website

Source for the AIssisted Consulting public website. The repository contains static HTML, CSS, and JavaScript pages, plus Cloudflare Pages Functions for booking, contact, and related application flows.

## Start here

- [Project overview](docs/project/README.md) and [project document index](docs/project/V11.11-website-project-index.md) provide the existing project context.
- [Booking setup](docs/booking/booking-setup.md) and [booking route hardening](docs/booking/booking-route-hardening.md) describe the integration architecture and configuration.
- [Package scripts](package.json) and [Site CI](.github/workflows/site-ci.yml) define the available checks and the current pull-request checks.

The project documents include versioned handoff and readiness notes; their historical status statements are not a verification of the current hosted deployment.

## Local static preview

Use Node.js and npm; CI currently uses Node.js 22. The static preview also requires Python 3. From the repository root:

```bash
npm run serve -- --bind 127.0.0.1
```

Open [http://127.0.0.1:4173/](http://127.0.0.1:4173/). This serves the frontend files. It does not run Cloudflare Pages Functions or provide the D1, payment, calendar, and notification integrations.

## Local checks

Use Node.js 22 and the `sqlite3` command-line tool. These commands match Site CI and check source syntax, public-offer consistency, booking migrations, and every regression suite:

```bash
npm run check:site
npm run check:booking-functions
npm run check:public-truth
npm run check:booking-migrations
npm test
```

`npm test` discovers all `tests/*.test.mjs` suites, including MCP, offer-contract architecture, and Grail account deletion. The checks use Node.js built-ins, repository fixtures, and temporary local SQLite databases; they do not require provider credentials. For work that needs the declared npm dependencies, install the locked versions with `npm ci`. Focused suite commands and additional checks remain available in [package.json](package.json).

## Source layout

| Path | Contents |
| --- | --- |
| [index.html](index.html), [main.js](main.js), [styles.css](styles.css) | Main public page and shared frontend behavior/styles |
| [book/](book/), [contact/](contact/) | Booking and contact frontend pages |
| [functions/](functions/) | Cloudflare Pages Functions and shared server-side helpers |
| [config/](config/) | Versioned application and public-content configuration |
| [db/](db/), [migrations/](migrations/) | Booking schema and SQL migrations |
| [tests/](tests/), [scripts/](scripts/) | Regression tests and maintenance/validation scripts |
| [docs/](docs/) | Project, integration, and handoff documentation |

Deployment and provider configuration are separate operational steps. The checked-in Site CI workflow runs checks on pull requests and pushes to `main`; it contains no deployment step.
