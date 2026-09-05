# Pages preview isolation

The website has two Pages project configurations. A project's name containing
`preview` does not make all of its deployments use the preview environment.

| Source configuration | Pages project | Default / production slot | Preview slot |
| --- | --- | --- | --- |
| [`wrangler.toml`](../../wrangler.toml) | `aissisted-website` | Existing live booking settings and production D1 | Explicit isolated D1 and disabled provider effects |
| [`wrangler.preview.toml`](../../wrangler.preview.toml) | `aissisted-offer-v2-preview` | Isolated D1 and disabled provider effects | Explicit isolated D1 and disabled provider effects |

Both preview slots and the dedicated project's production slot use the existing
`aissisted-booking-preview-v2-20260815` database. They keep Checkout, Google
Calendar requirements and event creation, open-session expiry, email, notification
webhooks, and CRM relay disabled. `AIC_EMAIL_PROVIDER = "disabled"` is intentional:
an empty value falls back to `GRAIL_EMAIL_PROVIDER` in the application. The CRM URL
is empty until a separate integration change identifies and verifies an isolated
receiver; that change must also update the configuration gate's allowed target.
Fit-call/contact persistence remains available against the isolated database.

The browser's Google Ads/GA4, Axon and Grail wrappers also allow measurement only on
`https://aissistedconsulting.com` and `https://www.aissistedconsulting.com`.
All other origins, including both Pages projects' default, deployment and branch
hosts, local servers and unrecognized hosts, suppress external SDK loading and
measurement calls. Suppression also prevents these wrappers from queuing events
or dispatching tracking events to existing listeners. The first-party wrappers
can still load, and local campaign attribution and form payload construction
remain available. Adding a production origin requires an explicit update to all three
independently loaded wrappers and their regression tests.

Retained HTML templates, including Grail, blog and legacy standalone pages, use
the guarded shared Google loader without inline SDK loading or configuration.
The HTML inventory regression exercises the actual preview middleware to exclude
blocked private templates, and inspects redirected legacy templates as well.
HTML canonicalization and legacy redirects are not measurement-isolation controls.
Grail retains its page, activation and purchase event names, conversion labels,
revenue and local campaign attribution; its separate event wrapper also suppresses
existing Google/Facebook SDK calls, measurement queues and tracking listeners on
nonproduction origins.

Every preview slot also requires `BOOKING_MONITOR_SCOPE = "contacts"`. An
authenticated monitor invocation in that mode processes only the contact/Fit Call
delivery queue and records its own completion event. It does not read or process
existing booking fulfillment, payment recovery or notification outbox work. The
production site's unset scope retains the existing full monitor. See
[contact-only recovery](contact-crm-delivery.md#contact-only-recovery) for the
separate preview and monitor credentials and the hosted receiver checks.

These slots set `PREVIEW_ACCESS_REQUIRED = "true"`. Store `PREVIEW_ACCESS_TOKEN`
as a Cloudflare secret in each intended environment, never in committed vars.
Without that secret the middleware returns 503 before dispatch, including API
and webhook routes. With it configured, existing token/cookie authentication
remains in force; the Stripe webhook retains its existing signature-protected
machine endpoint exception. The live site's default config does not opt in.
Authenticated preview canonical redirects and booking return URLs retain the
request's deployment origin, including branch and hash hosts. They must not send
a reviewer to the project's default `pages.dev` host, which serves its production
slot. The configured preview origin identifies the project when no request is
available; it does not override the origin of a private preview request.

Cloudflare Pages supports `env.production` and `env.preview`; a deployment's
branch selects the slot. All non-production branches share `env.preview`. When
overriding non-inherited groups such as `vars` and `d1_databases`, both groups must
be explicit. `preview_database_id` inside a default binding alone does not select
the remote Pages preview database. See the official
[Pages Wrangler configuration reference](https://developers.cloudflare.com/pages/functions/wrangler-configuration/).

## Checks and dedicated-project config selection

From the reviewed source checkout, run `npm ci`, `npm run check:pages-preview`,
and `npm test`. Site CI runs the same configuration gate and all test suites.
The gate parses TOML, checks both environment slots, rejects production D1 or
enabled provider effects in preview, and requires review of new resource types.
Regression tests also execute the actual access middleware and notification
handler with synthetic data. Marketing regression tests execute both browser
wrappers across preview origins, with and without existing SDKs, and preserve
production destinations, consent defaults, conversion labels and lead values.

Wrangler Pages 4.125.0 rejects custom `--config` paths and the `--env` flag on
`pages deploy`. It discovers a canonical `wrangler.toml`/JSON file in the project
directory. Therefore `--project-name aissisted-offer-v2-preview` alone is unsafe
from the normal source checkout: it does not select `wrangler.preview.toml`.

For a dedicated preview deployment, prepare a **disposable checkout of the exact
reviewed commit**. Run the source checks before config promotion. In that disposable
checkout only, copy `wrangler.preview.toml` to `wrangler.toml`; verify they are byte
identical and that no alternative `wrangler.json`/`wrangler.jsonc` or generated
config redirect supersedes it. Keep the original checkout unchanged. Build the
Pages Functions from this staged directory and verify the resolved project,
database, variables, and source commit before upload. The deployment command must
explicitly identify project `aissisted-offer-v2-preview` and the intended branch;
`preview-v2` was that project's production branch at the 2026-09-05 readback.
Recheck current branch settings before using that mapping. Do not use `--env` or
an unsupported `--config` workaround.

## Hosted acceptance and limits

This source repair does not change existing deployments or dashboard state.
Apply it through the normal deployment process and read back the exact deployed
commit, selected environment, isolated D1 binding, disabled effect destinations,
and required secret presence without recording secret values. Check anonymous
access is denied and authenticated access works before synthetic form exercises.
Before submitting a browser canary, inspect the authenticated deployment's loaded
scripts and browser network evidence for production marketing loaders or requests.
Server-side binding checks alone cannot prove browser measurement isolation.
The wrapper tests cover their own calls; they cannot certify unrelated scripts,
browser extensions, provider receipt or a deployment running older JavaScript.
Use no live payment, calendar, notification, CRM, or customer credentials for
those exercises. A source gate cannot certify dashboard secrets or an old
deployment's resource bindings. Existing production configuration is preserved;
deployment and provider state must be verified separately.
