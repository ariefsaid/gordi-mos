# Review ledger — chore/cf-staging-deploy

Diff scope (`git diff main...HEAD`): `.github/workflows/deploy-staging.yml` (CI build+deploy to CF Pages,
staging-only) + `mos-app/public/_redirects` (SPA deep-link fallback). No `.tsx`/`.css` → design not
required. No migrations/auth/RLS → security not required. (`mos-app/.env.example` already existed/committed.)

## Verdicts
- spec: PASS — matches deploy-plan P5/P8 + the owner directive (Cloud = staging only; CF builds only via CI on the `staging` branch; no preview deployments). No product behaviour.
- code-quality: PASS — Director review: workflow triggers ONLY on push to `staging` (no `pull_request`/other-branch trigger → no CF previews), Direct-Upload via wrangler (CF runs zero builds), all creds via GitHub secrets (none in repo — verified), actions pinned (@v4/@v3), node 20 + npm cache; `_redirects` is the documented SPA fallback for the `/mos/` base. Trivial, low-risk infra.
- design: N/A — no UI (`.tsx`/`.css`) changed.
- security: N/A — no migrations/auth/RLS; no secret committed (workflow reads GH secrets only).

## Gates
- No app code changed → typecheck/lint/vitest unaffected (last green on main: typecheck 0 · lint 0 · vitest 1173). `npm run build` copies `public/_redirects` to `dist/` (vite public dir). YAML validated (`yaml.safe_load` OK).

## Decision
SHIP — staging deploy plumbing; prod remains self-hosted (ADR-0010).
