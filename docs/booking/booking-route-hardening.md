# Booking Route Hardening Notes

## Goal
Keep `/book/` and `/api/book/*` reliably available on production.

## What was hardened
- Added explicit `Cache-Control: no-store` headers for:
  - `/book/`
  - `/book/*`
  - `/api/book/*`
- Kept canonical redirects in `_redirects` so `/book` resolves to `/book/`.
- Confirmed booking code is present in `main` and production deploys were built from `main`.

## Operational risk that remains
The website repo still contains many unrelated local working-tree changes outside the booking work. Future manual `wrangler pages deploy .` runs from a dirty tree can still publish unrelated site edits.

## Safer deploy rule
For this repo, prefer one of these:
1. Git-based production deploys from committed `main`
2. Clean worktree deploys when doing route-critical work
3. Avoid ad hoc deploys from a dirty local working tree

## Quick health checks
- `https://aissistedconsulting.com/book/`
- `https://aissistedconsulting.com/api/book/availability`
- `curl -I -L https://aissistedconsulting.com/book/`
- `curl -I https://aissistedconsulting.com/api/book/availability`
