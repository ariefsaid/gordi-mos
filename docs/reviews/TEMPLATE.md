# Review ledger — <branch>

Diff scope: `git diff <merge-base>..HEAD` — <brief description of what changed>

## Verdicts

<!-- Fill one verdict line per REQUIRED review before running pre-merge-check.sh.
     Format:  - <review>: <VERDICT> — <reviewer / short notes>
     Accepted verdicts: PASS  SHIP  FIX-THEN-SHIP
     Blocking verdicts: REWORK  FAIL  STILL-FAILING
     Required always:   spec, code-quality
     Required if UI (*.tsx / *.css changed):   design
     Required if auth/RLS/schema (supabase/migrations/, _rls, auth, rls paths):  security -->

- spec: <!-- PASS|SHIP|FIX-THEN-SHIP|REWORK|FAIL --> — <reviewer, date, link-or-notes>
- code-quality: <!-- PASS|SHIP|FIX-THEN-SHIP|REWORK|FAIL --> — <reviewer, date, link-or-notes>
- design: <!-- PASS|SHIP|FIX-THEN-SHIP|REWORK|FAIL (delete line if not required) --> — <reviewer, date, link-or-notes>
- security: <!-- PASS|SHIP|FIX-THEN-SHIP|REWORK|FAIL (delete line if not required) --> — <reviewer, date, link-or-notes>

## Gates

| Gate | Status |
|---|---|
| `npm run typecheck` | <!-- PASS / FAIL --> |
| `npm run lint` | <!-- PASS / FAIL --> |
| `npm test` (Vitest) | <!-- PASS / FAIL / N/A --> |
| `supabase test db` (pgTAP) | <!-- PASS / FAIL / N/A --> |

## Decision

<!-- MERGE | HOLD — one line rationale -->
