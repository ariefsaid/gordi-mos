# Review record — kitchen-app ESB-worker PRs (cross-repo)

The MOS ESB-outbox worker lives in a **separate repo** (`gordi-kitchen-app`) that does not carry the MOS
`scripts/pre-merge-check.sh` gate. This file records the review battery for those PRs in the MOS review
ledger system, since the worker is part of the MOS kitchen workstream (spec: `docs/specs/kitchen-module.spec.md`).

## PR #1 — `feat/mos-outbox-source` (origin/main dccefaf)
Full battery run before merge; recorded in `gordi-kitchen-app/docs/reviews/feat-mos-outbox-source.md`.
- spec: PASS · code-quality: PASS · security: PASS (no-gkid-leak defended in depth). FR-077 event-fire
  wiring deferred to the MOS app (recorded). ✅ compliant.

## PR #2 — `feat/goo-staging-config` (origin/main 20bb14e)
> **Gate miss (documented):** merged with only a security review; spec + code-quality were run
> **retroactively** 2026-06-26 (charter-compliance).
- spec: PASS — FR-080/081/083/084 + Teable-path regression conform; only stale spec host-text (fixed in this docs PR). (spec-reviewer)
- code-quality: **FIX-THEN-SHIP** — clean ContextVar creds seam + real Teable regression, BUT a fail-open: GOO route fell back to global GKID-prod creds when `ESB_GOO_*` unset (FR-084 leak risk). (code-quality-reviewer)
- security: PASS — credential isolation correct, no-gkid-leak intact, no secret logging. (security-auditor)
- **Resolution:** the FIX-THEN-SHIP finding is closed by **PR #3** (below).

## PR #3 — `fix/goo-creds-fail-closed` (origin/main 6dba5a7)
Closes the #2 fail-open: a real `goo` push with `ESB_GOO_*` unset now **dead-letters** (never sends
GKID-prod creds to the untrusted GOO staging env); `_active_credentials()` requires both creds.
- Tests: `test_goo_push_without_goo_creds_dead_letters_no_esb_call` (zero ESB calls) + partial-cred
  regression. 63 passed; coverage esb_client 82% / mos_outbox 85%; ruff clean. Teable→GKID path unchanged.
- spec/code-quality: PASS (the fix directly resolves the recorded Important finding; behaviour is the
  fail-closed the security model requires). ✅ no open Critical/Important issues remain on the worker.

## Net
All three worker PRs are now charter-compliant on the record. The #2 gate miss + its fail-open finding are
documented and **remediated** by #3 — no open Important/Critical issues.
