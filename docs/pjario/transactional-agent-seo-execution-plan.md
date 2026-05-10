# Transactional Agent + SEO Execution Plan

Status: active
Last updated: 2026-05-06

This is the single source of truth for the AIssisted Consulting local build from this point forward. The automation should follow this file, complete the next unchecked item only, update evidence, and stop. It should not carry a long duplicate plan inside the automation prompt.

## Fixed Direction

AIssisted Consulting should stay human-first and polished for visitors while becoming easier for agents to understand and use. Agents may eventually submit contact inquiries, reserve booking holds, and initiate Stripe Checkout payment when the local implementation makes those actions safe, truthful, idempotent, audited, and clearly marked by risk.

The site should not be framed as an agent testing ground. Agent support should be the path of least resistance through accurate manifests, static knowledge files, typed endpoints, clear schemas, and conservative fallbacks.

## Non-Negotiable Boundaries

- Keep all work local in `/Users/standley/Documents/New project 2` unless the user explicitly asks for publication in a normal chat message.
- Do not push, deploy, edit DNS, alter live hosting, use production credentials, submit live forms, run live prompt tests, crawl live systems, change live crawler rules, or make public/client-facing capability claims.
- Do not expose agent write/payment capabilities in `agent.json`, `.well-known/agent.json`, `.well-known/agent-skills/index.json`, `llms.txt`, or public support files before local code and tests prove those capabilities.
- Do not collect card details on the site. Stripe Checkout remains the payment entry surface.
- Do not add CRM/email/notification writes unless the adapter, storage, idempotency, audit, and tests are implemented locally.

## Current Evidence

- `docs/pjario/planning-briefs/010-transactional-agent-surface.md` defines the safe transactional model.
- `docs/pjario/qa/010-transactional-code-inventory.md` confirms the current implementation state.
- Booking has real local/deployable endpoints for availability, checkout creation, status, and Stripe webhook handling.
- Contact submission endpoint exists locally; the contact page is being upgraded from draft-only to a real form backed by `/api/contact/submit`.
- Booking checkout exists but lacks request-level agent idempotency, strong financial confirmation, Stripe idempotency propagation, normalized agent audit records, and tests for those requirements.
- Existing local checks passed before this plan was written: `npm run check:site`, `npm run check:booking-functions`, and `npm run test:booking`.

## Execution Rules For Each Automation Run

1. Read this file first.
2. Select the first unchecked item in the checklist.
3. Complete only that item.
4. If the item is too broad to safely complete in one run, split it into smaller checklist items in this file and complete the first new item.
5. Record changed files and evidence in the relevant QA or completion note.
6. Mark the item complete only after local evidence exists.
7. Report the completed item, files changed, evidence, limitation or fallback, and next unchecked item.

## Phase 1: Transactional Hardening Planning

- [x] Create `docs/pjario/tickets/011-transactional-agent-hardening.md` and `docs/pjario/planning-briefs/011-transactional-agent-hardening.md` from this plan, `010-transactional-agent-surface.md`, and `010-transactional-code-inventory.md`.
- [x] Define the exact local storage model for idempotency, contact inquiries, and agent transaction audit records.
- [x] Define the exact endpoint contracts for `POST /api/contact/submit` and hardened `POST /api/book/create-checkout`.
- [x] Define the exact manifest/support-file update rules that can happen only after code and tests pass.

## Phase 2: Shared Transaction Safety Primitives

- [x] Add pure transaction-safety helper module for normalization, `Idempotency-Key` validation, canonical JSON, hashing, request fingerprinting, duplicate fingerprinting, and Stripe-safe idempotency key derivation.
- [x] Add memory-store idempotency helper methods for lookup, started/succeeded/failed/conflict state changes, target lookup, and exact-replay response storage.
- [x] Add D1 idempotency helper methods for lookup, started/succeeded/failed/conflict state changes, target lookup, and exact-replay response storage.
- [x] Add storage-facing audit helper methods for append-only agent transaction audit writing.
- [x] Extend local schema/migration files for idempotency records, contact inquiries, and agent transaction audits.
- [x] Add unit tests for idempotency helper behavior: missing key, malformed key, first request, exact retry, conflicting retry, and audit record creation.

## Phase 3: Contact Submission

- [x] Implement `functions/api/contact/submit.js` as a same-origin JSON endpoint with consent, validation, duplicate prevention, idempotency, and audit records.
- [x] Update `contact/index.html` and supporting JS/CSS only enough to make the human form real and clear without making the page noisy.
- [x] Add contact submission tests covering valid submit, missing consent, duplicate submit, exact idempotent retry, conflicting idempotency retry, and no CRM/email writes unless configured.
- [x] Write contact QA evidence and completion notes.

## Phase 4: Booking Financial Hardening

- [x] Harden `functions/api/book/create-checkout.js` with required `Idempotency-Key`, strong financial confirmation, exact amount/policy verification, audit records, and replay-safe checkout reuse.
- [x] Propagate idempotency to Stripe customer/session creation where Stripe supports it.
- [x] Update `book/booking.js` so human booking uses a stable one-time idempotency key per checkout attempt.
- [x] Add booking tests for missing idempotency key, exact retry returning the existing checkout, conflicting retry rejection, missing financial confirmation, wrong amount, wrong policy version, and audit record creation.
- [x] Write booking transactional QA evidence and completion notes.

## Phase 5: Truthful Agent Manifest Upgrade

- [x] Add read-only booking commands first: `get_booking_slots` and reviewed `get_booking_status`.
- [x] Add `submit_contact_inquiry` only after the contact endpoint and tests pass.
- [x] Add `create_booking_checkout` only after booking hardening and tests pass.
- [x] Update `agent.json`, `.well-known/agent.json`, and `.well-known/agent-skills/index.json` with accurate risk tiers, schemas, idempotency requirements, duplicate-prevention notes, and human-approval language.
- [x] Keep browser fallback metadata secondary to typed endpoints.

## Phase 6: SEO, ASEO, AEO, And Support Files

- [x] Tighten `llms.txt`, `api/business-profile.json`, `api/services.json`, `api/service-areas.json`, and knowledge files so they reflect real transactional capabilities without overclaiming.
- [x] Verify canonical, Open Graph, Twitter card, and structured data across visible pages, especially `/book/` and `/contact/`.
- [x] Update `sitemap.xml` only for real local routes.
- [x] Keep human pages concise and polished; do not add agent jargon to visible copy unless it helps humans.

## Phase 7: Validation And Scoring

- [x] Run SlipperyAPeI `validate --strict`, `score --strict --min 100`, and `doctor --check-fallbacks --also-root-agent-json` locally.
- [x] Run local route checks for public pages, support files, manifest files, booking routes, and contact route.
- [x] Run JSON/XML parsing, one-H1 scan, broken local link scan, local asset check, forbidden-claim scan, and secret scan.
- [x] Run booking and contact tests.
- [x] Capture desktop/mobile screenshots for home, contact, booking, and any changed key pages.

## Phase 8: Final Local Review Package

- [x] Create final QA note under `docs/pjario/qa/` covering transactional safety, SEO/ASEO/AEO, SlipperyAPeI score, route inventory, screenshots, known limitations, and publication blockers.
- [x] Create final completion note under `docs/pjario/completion/` summarizing changed files, tests, evidence, and what remains before live publication.

## Current Next Step

All local launch-readiness checklist items are complete. Next step is live publication setup only after the user explicitly chooses the host/deploy path and provides or confirms production environment configuration.
