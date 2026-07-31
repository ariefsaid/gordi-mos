# Review ledger — fix/cf-redirects-base-path

Diff scope (`git diff main...HEAD`): `mos-app/public/_redirects` only. No `.tsx`/`.css` → design not
required. No migrations/auth/RLS → security not required.

## Verdicts
- spec: PASS — fixes the diagnosed staging blank-page: app references /mos/assets/* (base) but the build output is flat (dist/assets/*); the old single catch-all returned index.html (text/html) for .js requests → blank #root. Verified live via Playwright (asset probe returned 200 + content-type text/html).
- code-quality: PASS — Director: two CF Pages rewrite rules, asset rule before the SPA catch-all (order is load-bearing); :splat preserves the asset path; existing files still served first. CF-Pages-only (no effect on the self-hosted prod path, where Caddy serves /mos).
- design: N/A — no UI code.
- security: N/A — no migrations/auth/RLS.

## Gates
- Static config file; no app code → typecheck/lint/vitest unaffected.

## Decision
SHIP — corrects staging asset routing so the SPA boots.
