# Plan brief — Buildout step 1: redesign styling pass (eng-planner)

You are the eng-planner. Turn the OWNER-APPROVED spec into a no-placeholder implementation plan.
Plan only — write NO code, change no source file except the plan doc you output.

## READ FIRST (exact paths, in `gordi-mos`)

1. `docs/specs/redesign-styling-pass.spec.md` — the approved spec. It is SIGNED; do not re-litigate
   scope. Your plan implements exactly its FRs/NFRs/ACs, incl. the §9 implementation TODO checklist
   and the §10 deviations (D-1..D-6 are accepted).
2. `docs/plans/2026-07-14-redesign-buildout.md` — master plan; step-1 row + standing acceptance
   (owner visual diff EVERY step; contract rules scored).
3. `docs/experience-contract.md` — Rule 11 (component reuse) is the binding NFR; Rules 1–10 untouched.
4. `mos-app/src/index.css` — the ACTUAL token file (verify the real token names + the `.dark` scope +
   the `--warning-foreground` → `--status-lost-text` bug at ~line 117/180 before planning edits).
5. `mos-app/DESIGN.md` (or repo `DESIGN.md`) — identity authority to update (FR-014).
6. The E7 reference token set: `e7-prototype.css` `:root` in the `gordi-mos-e7-prototype` working
   copy (`docs/design-mockups/redesign-mockups-2026-07/`) — the source `hsl()` values.

## Output

`docs/plans/2026-07-14-redesign-styling-pass.plan.md` — implementation plan with:

- **Exact file list** to touch (real paths under `mos-app/`; verify which CSS files hold tokens vs
  chrome literals — index.css, any component CSS, Tailwind config if tokens live there).
- **2–5 minute tasks**, each: exact file, exact token/selector, the E7 `hsl()` → `color(display-p3 …)`
  conversion to apply (give the computed display-p3 triple where you can; else name the exact source
  value and mark "implementer converts"), and which AC it satisfies.
- **Test tasks**: the AC-001 token-resolution Vitest (light + dark), the AC-002 file-allow-list
  guard wiring into `scripts/pre-merge-check.sh`, and the AC-007 contrast check. Name exact test
  file paths and the assertion shape.
- **The screenshot-matrix task** (spec §7): exact routes, widths (1280/390), before+after+E7-ref,
  deterministic capture (animations off), output into `docs/reviews/` assets.
- **Ordering + verify command per task** (the exact `npm run …` that proves it).
- A **risk/rollback** note (it's CSS-only; rollback = revert the CSS commit).

## Conventions

No-placeholder (exact paths, real values, exact verify commands). Respect the spec's fences: zero
`*.ts`/`*.tsx` except the new AC-001 test file and the AC-002 guard script; no layout/geometry; no
new token names; no `e7-*` token in the app.

## Verify your own work

Re-read the plan against the spec's FR/NFR/AC list — every FR must map to ≥1 task, every AC to a
verify step. Confirm every file path you name actually exists (you have read access — check). List
any file whose real token names differ from the spec's §3 assumption as a deviation note.

End your final message with the sentinel line: PLAN-DONE
