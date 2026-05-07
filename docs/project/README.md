# AIssisted Consulting V11.11 Website

Local V11.11 website package for AIssistedConsulting.com. Nothing in this repo deploys, pushes, edits DNS, changes crawler rules, or touches live hosting by itself.

## Run Locally

```bash
python3 -m http.server 4192
```

Then open `http://127.0.0.1:4192/`.

## Integration Notes

V11.11 includes the polished human website, SEO/ASEO/AEO support files, SlipperyAPeI agent manifests, real local contact submission, and the local/deployable booking flow for Stripe Checkout and Google Calendar-backed availability.

Live publication still requires explicit approval, D1 migration execution, Stripe webhook verification, and controlled deployed smoke testing. The local package now includes non-secret Cloudflare Pages config in `wrangler.toml` for the existing `aissisted-website` project and a V11.11 production D1 upgrade migration at `migrations/0002_v1111_transactional_hardening.sql`.

## Source Content

The V11.11 package follows the local planning docs under `docs/`:

- `docs/avos/`
- `docs/slipperyapei/`
- `docs/pjario/`
- `docs/booking/`

The current package preserves the source-truth positioning: AIssisted Consulting is founder-led practical AI workflow help based in Ocala, Florida, with a small-business path and a conservatively scoped family AI guidance path.
