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
an empty value falls back to `GRAIL_EMAIL_PROVIDER` in the application. Every
checked-in CRM URL remains empty. The configuration gate also permits the exact
isolated receiver below for a separately verified staging integration; this
allowlist does not configure or enable forwarding.
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

## Isolated CRM receiver prerequisite

The only additional allowed `AIC_CRM_INTAKE_URL` is
`https://aiccrm-staging.pjaissist-0c5.workers.dev/intake/website`. The gate requires
literal equality: a different host or path, trailing slash, query, fragment,
userinfo, port (including explicit `:443`), or whitespace is rejected. The rule
applies independently to all three isolated slots in the table. Production
receiver URLs and the separately hosted Render/Neon staging application are not
interchangeable with this Worker target. All other isolation requirements stay
in force when this URL is selected.

The 2026-09-05 staging readback bound Cloudflare Worker `aiccrm-staging`, version
`65a35f60-8733-4623-92ab-f304ca625d9e`, to AICCRM receiver commit
`108e2391dc1a32edf249c113f8bd2acd736f7282`. The deployed bundle matched all 16
committed source inputs. Its staging D1 binding was
`dd4f9c66-9f77-4ec5-83cd-bbb3733bfffc`, with all 15 reviewed migrations including
`0015_website_booking_events.sql`. That database is separate from production CRM
D1 `d6d66c29-66e8-4fda-a918-11eafdd4b42c` and from the website's preview D1
`febf1ca7-efa3-4629-b250-7e294ff96a47`. These are dated deployment observations;
recheck the actual Worker version, source and database bindings immediately
before configuring a sender. A hostname or a successful source check alone does
not prove current isolation.

The sender requires `AIC_CRM_INTAKE_TOKEN` matching the existing staging Worker's
`PUBLIC_INTAKE_TOKEN`. Retrieve its approved location without recording its value;
do not substitute a Render credential or rotate an existing secret as setup.
`isAicCrmRelayConfigured` identifies a configured URL only. The actual relay
separately rejects a missing or blank intake token with `missing_token` and makes
no network request. Preview access and monitor tokens cannot supply that authority.
Keep `PREVIEW_ACCESS_TOKEN` and `BOOKING_MONITOR_TOKEN` as separately scoped
platform secrets, and keep `BOOKING_MONITOR_SCOPE = "contacts"`.

Before hosted contact/Fit Call acceptance, the reviewed sender still needs its
intended environment configured with this exact URL and the staging intake
credential, followed by a deployed-source and effective-setting readback. Then
verify the original durable queue items, receiver acknowledgements and stored
records, exact retry identity, and authenticated scheduled recovery. A successful
manual monitor invocation does not establish a running schedule. This allowlist
does not enable booking-event delivery, Checkout, email, calendar actions, or
payment reconciliation; those retain their own prerequisites.

## Checks and dedicated-project config selection

From the reviewed source checkout, run `npm ci`, `npm run check:pages-preview`,
and `npm test`. Site CI runs the same configuration gate and all test suites.
The gate parses TOML, checks all isolated slots, rejects production D1 or
unreviewed provider destinations and effects in preview, and requires review of
new resource types. Receiver regressions cover the exact allowed URL in every
slot, reject alternate URL forms, preserve all other isolation conditions, and
exercise the actual relay and authorization handlers without network requests.
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
Use only the verified isolated staging CRM credential for the separately
configured relay acceptance. Use no production CRM, live payment, calendar,
notification, or customer credentials for preview exercises. A source gate cannot
certify dashboard secrets or an old deployment's resource bindings. Existing
production configuration is preserved;
deployment and provider state must be verified separately.
