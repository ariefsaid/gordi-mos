# Review ledger — docs/environments-staging

Diff scope (`git diff main...HEAD`): `docs/environments.md` only — adds the `staging` (Supabase Cloud)
environment row + the op/connection-URL guidance. Doc-only.

## Verdicts
- spec: PASS — records the agreed staging topology (Cloud staging-only; prod self-hosted, ADR-0010); matches what was set up (project ref hvnwcsmkdeqmgqlbwflm, CF Pages, staging branch).
- code-quality: PASS — Director: doc registry update, no code; URL/publishable key correctly noted as public (not op); op reserved for the DB password only.
- design: N/A — no UI.
- security: N/A — no secret committed (URL + publishable key are public by design; DB password stays in op, not here).

## Gates
- Doc-only; no app code → typecheck/lint/vitest unaffected.

## Decision
SHIP — env registry now reflects the Supabase Cloud staging target.
