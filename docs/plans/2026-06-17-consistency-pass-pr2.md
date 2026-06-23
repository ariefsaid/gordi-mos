# Plan — Whole-app consistency pass, PR-2 (shared primitives + full-bleed data) — 2026-06-17

**Source:** opus four-lens design review (2026-06-17) deferred items + owner-directed max-width
release. **Builds on** PR-1 (`b219c5c`) + the layout-consistency fix (`390378a`) on branch
`chore/consistency-pass-pr1`. **Goal (result-based):** finish the consistency pass — every repeated
UI pattern collapses to ONE shared primitive, and the data pages use the full screen width. Behavior-
preserving; no feature/logic/route/RLS/schema/data change. You have full latitude to decompose, spawn
sub-workers, and add tests. Honor every invariant below.

## Read first (oracles)
- `DESIGN.md` (repo root) — design-system SoT (button §5, badge-status, One-Blue, Structural-Navy,
  Tinted-Status, field-error rules). Never re-invent identity.
- `mos-app/src/index.css` — runtime tokens.
- `docs/plans/2026-06-17-consistency-pass-pr1.md` — the conventions already established (chevron,
  PageHead, tokens, avatar, error-text). PR-2 extends them; do NOT regress them.
- `mos-app/src/consistency.regression.test.tsx` — the RI-* invariants already locked. Keep them green;
  add new ones in the same file/style.

## Scope — PR-2 (do ALL)

### 1. Full-bleed data pages (owner-directed: "release the max width") — Important
The Tasks workspace is capped at 1280px, wasting ~1/3 of a wide screen and leaving the (global,
top-right) account chip detached from the content. Release it:
- Remove `.split { max-width: 1280px }` and any sibling 1280 cap in `TasksWorkspace.css`
  (the region/`.page-head-row` remnants), and remove `maxWidth={1280}` from the PageHead in
  `TasksWorkspace.tsx:538`. The workspace (head + toolbar + table + split drawer) now runs **full-bleed**
  inside PageFrame's 24px gutters — which equals the topbar's `px-6` gutter, so the table's right edge
  aligns with the account chip. The table's other columns are fixed-px; only the Task column (1fr/auto)
  absorbs the extra width (no ugly balloon — that was the old %-column problem, now gone).
- **Prose pages stay capped at 1080px** (My Week / Weekly Updates / Daily Log): readability for
  forms/text. The account chip is the conventional global top-right user menu and is ACCEPTED as-is on
  capped prose pages (standard pattern for prose/form surfaces) — do NOT full-bleed prose.
- Verify at 1920px (drawer open AND closed): Task column fills, drawer sits at the right gutter, nothing
  clips. Sanity-check ≥2560 isn't absurd; if the Task column looks comically wide, add a generous
  `max-width: 1760px` to `.split` (NOT 1280) — otherwise leave uncapped.

### 2. VIS-4 — One pill component — Important
Extract a single `<Pill variant tone>` (+ a `<StatePill>` for lifecycle) primitive (e.g.
`src/components/ui/Pill.tsx`). One shell: height 22, padding 0 9px, leading dot, 12/600. Tint differs by
variant only. Replace every hand-rolled copy: MyWeek `pillStyle` objects (`MyWeek.tsx` OpsStrip +
WeeklyUpdateStrip), `WeeklyUpdateReviewPane` `wup-state-*` + its exported `StatePill`, `ProgressMarker`,
`OpsPage` source-badge. StatusPill (tasks) re-skins onto the same primitive.

### 3. VIS-5/6 — One pill radius + dot size — Minor (owner taste resolved)
Unify ALL pill families to **border-radius 6px** (rounded-rect) and an **8px** leading dot. RESOLUTION:
the owner chose rounded-rect status chips + the 8px task dot earlier — so converge the OTHER families
(progress/state/source, currently 999px/6px-dot) DOWN to 6px/8px, NOT StatusPill up to 999px. One pill
language, owner's taste.

### 4. IXD-4 — One button hierarchy — Important
One `.btn-primary` / `.btn-outline` / `.btn-ghost` / `.btn-destructive` (DESIGN.md §5), as token classes
or a `<Button variant>` primitive. Replace all per-surface re-implementations + inline-styled buttons:
`TasksWorkspace.css` (.btn-outline/.retry-btn/.btn-primary), `TaskSurface.css`
(.btn-outline-link/.confirm-cancel), `OpsAddForm` (.tc-btn-cancel/.tc-btn-submit), `OpsPage`
(.ops-add-btn/.ops-retry-btn/.ops-clear-btn), inline buttons in `WeeklyUpdateWritePane` +
`WeeklyUpdateReviewPane`. Identical hierarchy everywhere.

### 5. IXD-5 — One error/empty/skeleton kit — Minor
Shared `<ErrorState onRetry>` (role=alert + `.btn-outline` Retry), `<EmptyState>`, `<SkeletonRows>` used
across all data panes (Tasks, Ops, weekly panes). Keep the lightweight inline "Retry" link ONLY in the
My Week 56–64px density strips (their height can't fit the full block).

### 6. IA-3 — One card-head — Important
Shared `<CardHead title meta action>` (padding, title 18/600, trailing-action slot). Unify MyWeek's
"My tasks" card head + the weekly panes' inline-styled h2 head rows. Distinct from `<PageHead>` (page
title) — this is the in-card section header.

### 7. IA-2 — One breadcrumb system — Important
ONE separator `›` (matches the shell `Breadcrumb` + DESIGN.md top-bar). The shell breadcrumb is the
single wayfinding home; EXTEND it to the leaf on sub-pages ("Daily Log › Add log entry", "Tasks › New
task"). REMOVE the redundant in-page `/`-separated crumbs (`TaskSurface.css .tc-breadcrumb` +
`OpsAddForm.tsx`). No page shows two breadcrumbs at once.

## Definition of Done (acceptance — paste gate tails in your report)
- `cd mos-app && npm run typecheck` → 0; `npm run lint -- --max-warnings=0` → 0; `npm test` → all green.
- Update any test asserting an OLD pattern to the NEW canonical — **never bend the convention to a stale
  test; never weaken a behavior assertion to go green.**
- Add regression invariants in `consistency.regression.test.tsx` (AC-style RI-* titles), at least:
  RI-VIS-4 (no bespoke `pillStyle`/`wup-state-*` raw pill outside the shared Pill), RI-IXD-4 (no bespoke
  `.tc-btn-*`/`.ops-*-btn`/`.retry-btn` button classes — all via the shared button), RI-IA-2 (no
  `.tc-breadcrumb`; only `›` separators), RI-LAYOUT-2 (`.split` has no `max-width: 1280px`).
- Keep the existing RI-VIS-1/2, RI-IXD-1/2, RI-IA-1, RI-LAYOUT-1 green.
- Grep proofs: no `▸/▾/▴`; no `262 83% 58%` in avatars; no `.tc-breadcrumb`.

## Invariants (do NOT touch)
No route/URL/RLS/schema/`lib/db` signature/product-behavior change. Drawer/split-view semantics,
keyboard cursor, virtualization, modal/non-modal regimes unchanged. No copy changes. Don't resolve git
conflicts (escalate). Prose stays 1080-capped (only data goes full-bleed).

## Verification handback
The Director will independently re-run all gates AND render every page + the Tasks drawer via the
Playwright MCP at 1920px (full-bleed alignment, pill/button/breadcrumb consistency, no visual
regressions) before commit. Report what you could NOT do to spec and why.
