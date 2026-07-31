# Plan — Whole-app consistency pass, PR-1 (high-signal) — 2026-06-17

**Source:** opus four-lens design review (Director session, 2026-06-17). Owner decisions: **staged**
(this PR = high-signal/objective fixes; primitive extraction deferred to PR-2) and section noun =
**"Weekly Updates"**.

**Goal (result-based):** the four flagged convention *inconsistencies/regressions* below are gone,
app-wide, converged to ONE canonical pattern each, with all gates green. This is a behavior-preserving
consistency refactor — no feature/logic/route/data change. You have latitude to decompose and to add
the regression-invariant tests; do NOT change product behavior, copy (beyond the noun), or layout
semantics.

## Read first (oracles — these define "correct")
- `DESIGN.md` (repo root) — design-system SoT. Honor One-Blue Rule, Structural-Navy Rule (OD-P3-7),
  Tinted-Status Rule, field-error text rule (OD-P3-5). Never re-invent identity.
- `mos-app/src/index.css` — the actual runtime tokens (bare `H S% L%` triplets; consume as `hsl(var(--token))`).
- `mos-app/src/shell/UserChip.tsx:68` — the canonical avatar gradient (copy it).
- `mos-app/src/components/tasks/TaskSurface.css` (`.tc-field-error` / `.tc-submit-error`) — the canonical
  error-text treatment (uses `--status-lost-text`); converge the other forms onto it.

## Scope — PR-1 (do ALL of these)

### 1. VIS-1 — One avatar gradient (Critical: regression vs OD-P3-7)
Every avatar uses `linear-gradient(135deg, hsl(var(--brand-navy)), hsl(var(--primary)))`. Replace the
retired blue→violet at: `components/tasks/TaskSurface.css:182` (`.person-av`), `:187` (`.person-av-a`),
`:271` (`.event-av`), `components/weekly/WeeklyUpdateReviewPane.css:61` (`.wup-review-avatar`).
Violet (`--violet`) is KPI/timeline only — must NOT appear in any avatar after this.

### 2. VIS-2 — Error text = `--status-lost-text`; outline/asterisk stays `--destructive` (Critical: AA)
Error/helper **text** must use `hsl(var(--status-lost-text))` (base `--destructive` fails AA ~3.6:1 as
small text). Fix: `pages/OpsAddForm.tsx:391` (`.tc-field-error`), `:364` (`.tc-submit-error` text),
`pages/LoginPage.tsx:266` + `:309`. Field **outline** + required asterisk keep `--destructive`.

### 3. IXD-1/2/3 — One disclosure/dropdown chevron (Critical: the owner's "dot" complaint)
- Extract ONE shared `Chevron` SVG into `shell/icons.tsx` from the existing `FilterChevron`
  (`components/tasks/TasksWorkspace.tsx:104`, path `M6 9l6 6 6-6`, 14px, `stroke=currentColor`,
  `strokeWidth=2`, round caps, `aria-hidden`). Accept an optional `className`/size.
- Use it for EVERY dropdown/disclosure trigger. Replace the text triangles `▸/▾/▴`:
  - Group-collapse caret — `GroupHeaderRow.tsx:56` and `MobileGroupedCards.tsx:100`: render ONE chevron,
    rotated via CSS `transform: rotate(-90deg)` when collapsed (down = expanded), `transition` gated by
    `prefers-reduced-motion`. Do NOT swap glyphs.
  - Status dropdown — `StatusTrigger.tsx:42`.
  - Ops filter selects — `OpsPage.tsx:386,407`.
  - RACI person-field dropdown hint — `RaciCard.tsx:72,110`.
  - Sort-direction indicator — `TasksWorkspace.tsx:522`: must NOT reuse the dropdown chevron meaning;
    use a distinct small up/down arrow SVG (or keep but document) — never the `▾` that means "dropdown".
- After this, `grep -rn "▸\|▾\|▴" mos-app/src --include=*.tsx | grep -v test` returns nothing (affordances).

### 4. IA-1 — One page-header (`PageHead`) (Important)
`shell/PageHead.tsx` becomes the single header for all routes. Add props so the bespoke variants fold in:
- optional right-aligned `meta`/`count` slot (ReactNode) for the "N log entries"/"N tasks" count-lines,
- optional `maxWidth` (px) so the Tasks data-variant keeps its 1280 cap,
- settle the title→content gap at **16px** (the list/data value) for all; subtitle 14px / mt 6px stays.
Delete bespoke `.tasks-page-title`/`.page-head-row`/`.tasks-count-line` (`TasksWorkspace.css:9-20`) and
`.ops-page-head`/`.ops-page-title`/`.ops-count-line` (`OpsPage.tsx` inline `<style>`); route TasksWorkspace
(`:531`) and OpsPage (`:358`) through `<PageHead>`. Leave `.tc-page-title` (create-form head) for PR-2.

### 5. VIS-3 — Token sweep (Important)
Replace raw color literals that duplicate named tokens with `hsl(var(--token))` (CSS) or token Tailwind
classes (`text-muted-foreground`, `bg-secondary`, etc.) in TSX. Map: `240 4% 40%`→`--muted-foreground`,
`240 10% 3.9%`→`--foreground`, `240 5.9% 90%`→`--border`/`--input`, `0 0% 100%`→`--background`,
`221.2 83.2% 53.3%`→`--primary`, `262 83% 58%`→`--violet`, `0 72% 45%`→`--status-lost-text`,
`142 64% 30%`→`--status-won-text`, `240 4.8% 95.9%`→`--secondary`/`--muted`. Hot spots:
`components/weekly/WeeklyUpdateWritePane.tsx`, `WeeklyUpdateReviewPane.css`, `ProgressMarker.css`,
`TaskSurface.css` (non-avatar literals), `pages/MyWeek.tsx`, `pages/OpsPage.tsx`.
ALLOWED literal: alpha-on-var shadows must become `hsl(var(--primary) / 0.25)` (see `LoginPage.tsx:378`),
never the inlined number. Verify nothing renders differently (same resolved color).

### 6. JTBD-1 — One noun: "Weekly Updates" (Important)
Rail label (`shell/sections.tsx:13` `'Updates'`→`'Weekly Updates'`), page H1 + `useDocumentTitle`
(`pages/UpdatesPage.tsx:17,65` → "Weekly Updates"). Sub-pane captions ("my weekly update" / "my team's
updates") stay. Update the assertions in `RailNav.test`, `sections.test`, `UpdatesPage.test`.

## Definition of Done (acceptance — verify each)
- `cd mos-app && npm run typecheck` → 0 errors.
- `npm run lint -- --max-warnings=0` → 0.
- `npm test` → all green. Tests that asserted the OLD pattern (bespoke title classes, `▸/▾`, 'Updates')
  are updated to the NEW canonical — **update the test to the new convention, never bend the convention
  to an old test**; behavior assertions (what the user can do) must NOT change.
- Add regression-invariant tests (lowest sufficient layer, AC-style title so grep finds them):
  - **RI-VIS-1**: no avatar gradient string contains `262 83% 58%` (violet).
  - **RI-VIS-2**: no error-text class sets `color` to base `--destructive` (all use `--status-lost-text`).
  - **RI-IXD-1**: rendered toolbars/group headers contain no `▸/▾/▴` affordance glyph.
  - **RI-IA-1**: every page route renders the shared `PageHead` (assert its testid; no `*-page-title`).
- `grep -rn "▸\|▾\|▴" mos-app/src --include=*.tsx | grep -v test` → empty.

## Invariants (do NOT touch)
No route/URL, RLS, schema, `lib/db/*` signature, or product-behavior change. No copy changes beyond the
noun. Drawer/split-view semantics, keyboard cursor, virtualization unchanged. Don't resolve git conflicts.

## Deferred to PR-2 (do NOT do here)
VIS-4 shared `<Pill>`/`<StatePill>`, IXD-4 `.btn-primary`/`.btn-outline` consolidation, IXD-5 shared
error/empty/skeleton kit, IA-3 shared `<CardHead>`, IA-2 breadcrumb unification (`›` vs `/`, one home),
VIS-5 pill radius + VIS-6 dot size (flag: owner previously chose rounded-rect/6px + 8px task dot — do NOT
blindly apply the reviewer's 999px/uniform-dot; resolve the tension with the owner in PR-2).
