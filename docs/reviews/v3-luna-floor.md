# Review ledger — v3/luna-floor

Diff scope: `git diff 9558d8c..HEAD` — the RESIDUAL Luna floor violations (interim verdict 27/40,
docs/reviews/v3-redesign.md "Luna INTERIM verdict") plus the ratified Signal-record JTBD anatomy
(OD-REDESIGN-90, docs/specs/record-page-anatomy.spec.md §2.1). H3 · H6 · H8(a/b/c) + the Signal
record composition. NO push/merge from this lane.

## Per-floor status

| Floor | Fix | Shared seam | Rendered evidence |
|---|---|---|---|
| **H3** — Signal record has no Back; panel controls icon-only | New `RecordPageChrome` (shell): source-aware "Back to <collection>" + Ask Deputy + kind-trailing. Task page adopts it (`showPanelUtility=false`), Signal page adopts it. Panel "Open full page" gains a visible label. | `src/shell/record-page-chrome.tsx` — ONE record-page chrome for every kind; Back lives at the page host, never the shared RecordViewer (its ownership boundary). | `shots/after-signal-record-page-1280.png` (Back to Signals), tasks-layout P1-2 test (Task Back at `.record-page-chrome`) |
| **H6** — signal title truncates to meaninglessness | 2-line clamp (shared vocab) on the archive TABLE title (desktop + phone card), the Home ambient-tail title, AND the phone card title; the record identity title is now the UNTRUNCATED first line (adapter `firstLine`). NB: the desktop table clamp had a latent selector bug (`td.signal-table-title-cell` — the cell is a DIV, so it never matched; the file-text guard passed while the render stayed a hard clip) — fixed to `.signal-collection-table .signal-table-title-cell …` + a cascade-winning message rule. | ONE clamp vocabulary reused from `.task-name` / `.stream-row-title`. | `shots/after-signal-record-page-1280.png` (wrapping unclipped identity), `shots/after-signals-table-cards-390.png` (2-line card titles), `shots/after-home-390.png`; desktop table via DOM measure @1400: `white-space:normal`, 2 lines, `scrollWidth==clientWidth` (the CDP screenshot capture hangs on the table view — a capture-side timeout, not a page error, so measured instead) |
| **H8(a)** — Home 390 ~700px horizontal scroll | Root cause = the same `.home-signal-body-text` nowrap (forced 680px min-content on the stacked phone row). The H6 clamp fixes it. | — | `shots/after-home-390.png` — re-measured `main.scrollWidth` **700 → 390** (== clientWidth), zero overflow offenders |
| **H8(b)** — Task page 390 double vertical scroll (document + main) | Pin `html, body { height:100%; overflow:hidden }` so the `h-dvh` shell root (taller than `innerHeight` on a dvh mismatch) never leaks a second document scroller. | Shell-wide (index.css) — one scroll owner (main) for every page. | Re-measured Task page 390: document scrollbar gone, exactly **one** user scroll owner (main) |
| **H8(c)** — Signals phone table = raised card stacks | Flatten the shared DataTable card mode for Signals only: drop per-card border/radius/resting-shadow + inter-card gap, hairline dividers → E7's single calm surface. | Signal-scoped; dashboard DataTables untouched. | `shots/after-signals-table-cards-390.png` — card box-shadow none, radius 0, gap 0 |
| **Anatomy** — Signal record composition (OD-90) | Re-composed to `Message → Reach&response → Discussion → Facts → History`: content leads unclipped (F1/F2), one action register (F5), quiet Facts with ONE note & no per-field captions (F3/LAW-6), disclosed readable History with no raw diff in the default view (F4/LAW-5). | Per-kind: the Signal packs its five regions into ORDERED content slots; the shared RecordViewer region order is untouched. | `shots/after-signal-record-page-1280.png` + `shots/after-signal-record-facts-history-1280.png` (matches mockup signal-record-anatomy.html) |

## Census Step 2.5 — Signal record anatomy conformance (AC-ANAT-009)

Executable body: `src/components/signals/signal-record-anatomy.test.tsx` (composes the record the way
the live host does → the shared RecordViewer → extracts the observed order vector from the rendered
DOM via `data-content-slot`). The observed order is DOM-based (width-invariant), so it holds at
desktop **and** phone.

- **Declared vector:** `[message, reach, discussion, facts, history]`
- **Observed (edited signal):** `[message, reach, discussion, facts, history]` — **== declared** ✓
- **Observed (unedited, no history):** `[message, reach, discussion, facts]` ✓
- **Observed (retracted):** `[message, facts]` (reach/discussion drop) ✓
- **FAIL gates:** F1 content-leads ✓ · F2 unclipped title (full body in a content region; h1 not an ellipsized slice) ✓ · F3 ≤1 provenance caption/section (exactly one `.signal-facts-note`) ✓ · F4 no raw diff in default view + revision list in exactly one region ✓ · F5 mutating actions in one register ✓ — **all false (pass)**.

> Note on F2 (owner-ratified): a single-line body means the identity h1 and the message body coincide
> (visible in `after-signal-record-page-1280.png`). Accepted per coordinator ("honesty over
> cleverness") — the full body MUST live in a content region for F2, so the message region always
> renders it.

## Gates

| Gate | Status |
|---|---|
| `npm run typecheck` | PASS (0 errors) |
| `npm run lint` (changed files, `--max-warnings=0`) | PASS (eslint exit 0) |
| `npm test` (Vitest) — FULL suite | PASS — **327 files / 3398 tests, exit 0** (`--maxWorkers=2`) at commit `677183f`; the one later commit (`7b55f68`) is CSS + its guard, re-run green (signals/* + guards, 245 tests) |

## Guards added / extended

- `src/components/signals/guard-signal-title-clamp.css.test.ts` — pins the 2-line clamp on BOTH
  Signal title surfaces (H6/H8a) + the flat single-surface grammar (H8c).
- `src/components/signals/signal-record-anatomy.test.tsx` — the Step-2.5 order + F1–F5 gates.
- `tasks-layout.test.tsx` (Task) + `signals-archive-page.test.tsx` (Signal) — BOTH record kinds
  pinned to the shared record-page Back seam.
- `record-panel-host.test.tsx` — the visible "Open full page" label pinned.

## Verdicts

<!-- The review battery (spec / code-quality / design / Luna) is run by the reviewers + Director,
     not self-scored by this implementation lane (HARD rule: never self-score design gates). -->

- spec: PENDING — reviewer
- code-quality: PENDING — reviewer
- design: PENDING — Luna (live-drive, fresh renders; E7 floor + JTBD lens). Residual floors H3/H6/H8 addressed + anatomy conformed; awaiting the OFFICIAL re-score.
- security: N/A — no auth/RLS/schema path changed (presentation + i18n + shell CSS only).

## RATIFY-BEFORE-MERGE

- **Content-first for the Signal record** supersedes the `DESIGN.md` RecordViewer region table
  (Identity → metadata → Content → …) and E7's Facts-first `renderSignal` for this kind (OD-90 §2.1).
  The shared RecordViewer render-order + Task/Follow-up content-first (FR-ANAT-009/010) remain
  **downstream conformance debt on their own surfaces** — deliberately NOT changed in this lane
  (a global region-order flip would not make Task content-first, which composes its own content in
  TaskSurface, and would endanger every other RecordViewer consumer).
