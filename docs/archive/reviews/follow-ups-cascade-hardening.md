# Review ledger — follow-ups/cascade-hardening

Diff scope (`git diff main...HEAD`): app-shell + page-frame + TasksWorkspace.css (mobile overflow fix);
`mos-app/e2e/AC-230.spec.ts` (curated e2e); ADR-0015 + spec banner; `scripts/pre-merge-check.sh` +
review ledger/template + CLAUDE.md. Touches `.tsx`/`.css` → **design required**. No migrations/auth/RLS →
security not required.

## Verdicts
- spec: PASS — no new product behaviour; ADR-0015 + the spec banner reconcile the doc to shipped reality; e2e AC-230 validates the existing spec (Director).
- code-quality: PASS — gpt-5.4 cross-family review returned FIX-THEN-SHIP; both Important findings fixed (the gate's verdict-parse bug on FIX-THEN-SHIP, and this ledger's accuracy) + the security-regex over-match tightened.
- design: SHIP — Director live-verified via Playwright at 375px on /tasks, /my-week, /kitchen/log (scrollWidth == viewport, was 762/788/747), desktop 1280 rail+table intact, content not clipped, mobile card meta readable.
- security: N/A — no migrations / auth / RLS / schema in the diff (not required).

## Gates
- typecheck: 0 errors · lint: 0 (`--max-warnings=0`) · vitest: 1173 pass (107 files) · e2e AC-230: 1/1 pass.

## Decision
SHIP — merge follow-ups/cascade-hardening to main.
