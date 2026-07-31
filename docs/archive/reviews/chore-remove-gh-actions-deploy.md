# Review ledger — chore/remove-gh-actions-deploy

Diff scope (`git diff main...HEAD`): delete `.github/workflows/deploy-staging.yml`. No `.tsx`/`.css` →
design not required. No migrations/auth/RLS → security not required.

## Verdicts
- spec: PASS — owner pivoted to Cloudflare Pages' native git build (CF env vars, production branch = staging, previews None); the GH Actions deploy workflow is now redundant and would double-fire on staging pushes. Removing it matches the decision.
- code-quality: PASS — Director: pure deletion of the redundant workflow; the other CI workflows (integration.yml, verify.yml) and `mos-app/public/_redirects` + `mos-app/.env.example` are untouched.
- design: N/A — no UI.
- security: N/A — no migrations/auth/RLS.

## Gates
- No app code changed → typecheck/lint/vitest unaffected.

## Decision
SHIP — remove the redundant GH Actions deploy workflow; CF Pages native build is the staging path.
