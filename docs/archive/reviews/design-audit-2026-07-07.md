Gordi MOS is close to a calm, credible operator tool: the shell, palette restraint, and dense-but-readable data posture are working. The audit found two real layout breakages that block trust in the data, then a second layer of cross-route drift: page titles are not on one scale, several mobile headers collapse into awkward two-column title/meta knots, phone CTA treatment is inconsistent, and empty states vary from well-framed to nearly unrendered. The app mostly reads as one product on desktop, but it still fractures at key route boundaries, especially on phone.

## P0

1. **`/` (Home) · `td.mini-td.mini-td-nowrap.tabular-nums.mini-due-overdue` in “My tasks” · the DUE value overruns its column and visually collides with ACTIVITY** (`Overdue · Tue 30 Jun` bleeds into `6d`; reproduced in `/tmp/mos-audit/shots/desktop/home.png`). Computed width is **150.9px** with **172px** of text content, so the row cannot contain the string. **Concrete fix:** reserve a real min-width for DUE on the home mini-table, rebalance adjacent columns, and enforce `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` on the DUE cell only after the column is wide enough to preserve a clear gutter from ACTIVITY. **Lens:** both.

2. **`/tasks` · `td.td-cell.td-nowrap.tabular-nums.due-overdue` and the right edge of the desktop table · the DUE column is clipped off the viewport** (`Overdue · Tue 30 Jun` is cut on the right in `/tmp/mos-audit/shots/desktop/tasks.png`). The first overdue cell renders from **x=1319 → 1469** on a **1440px** viewport, so the column extends past the visible table frame. The same table also over-compresses `th.th-cell.th-sortable` (“Last activity”), `.task-name`, and `td.td-cell.td-objective`. **Concrete fix:** reallocate desktop column widths so TASK/PROJECT/OBJECTIVE stop consuming the slack, or give the table shell an explicit horizontal-scroll container; do not let the DUE column sit outside the visible frame. **Lens:** both.

## P1

1. **Cross-route title role drift · page-level `h1` (`.ch-title` / page-head h1) · the same page-title role renders at two sizes**: `/`, `/ops`, `/admin/people`, `/work/cascade` render **24px**, while `/tasks`, `/updates`, `/sales`, all `/kitchen/*`, `/work/objectives`, and `/work/projects-processes` render **20px**. After the type normalization pass, this still reads as multiple products. **Concrete fix:** route every authenticated page through one shared page-head pattern with the DESIGN.md page-title token (**24px / 600 / 1.2**) and one shared subtitle/meta slot. **Lens:** both.

2. **`/updates`, `/work/objectives`, `/work/projects-processes` on phone · `.content-header` with `h1.ch-title` + `span.ch-meta` · the title and subtitle compete as two narrow columns instead of one readable stack** (see `/tmp/mos-audit/shots/phone/updates.png`, `work__objectives.png`, `work__projects-processes.png`). Example: on `/work/projects-processes` mobile, the title shrinks into a **98.8px** two-line block while the meta copy is forced into a separate **170.6px** column. **Concrete fix:** below `md`, stack icon/title/count on row 1 and move meta to a full-width row underneath; keep all header text left-aligned in one column. **Lens:** both.

3. **`/ops` on phone · duplicate primary CTA (`a.btn.btn-primary` + `a.btn.btn-primary.btn-touch`) · the empty state shows two “+ Add log entry” buttons at once, and they do not even share one type size** (15px inside the card, 16px in the bottom bar; visible in `/tmp/mos-audit/shots/phone/ops.png`). This splits hierarchy and makes the route feel unlike the rest of the app. **Concrete fix:** keep exactly one primary CTA in the empty phone state; either remove the inner button and let the sticky bar own the action, or suppress the sticky bar until the user scrolls. Normalize the label size to one button token. **Lens:** both.

4. **`/inbox`, `/sales`, `/kitchen/review`, `/kitchen/pushes` · `.empty-state` / `.empty-title` · empty states are too bare and inconsistent with the stronger framed empty treatment on `/ops`**. These routes currently land as headline + sentence on open white canvas, which reads more like an unfinished page than a designed zero-state. **Concrete fix:** introduce one shared empty-state pattern with consistent spacing, optional icon, explanatory body, and an action slot where relevant; at minimum, keep the same surface treatment and vertical rhythm across all empty routes. **Lens:** both.

## P2

1. **`/work/objectives` and `/work/projects-processes` on phone · stacked `button.btn.btn-ghost` actions (“Rename”, “Archive”) inside each card · the actions become two centered full-width rows detached from the item title** (`/tmp/mos-audit/shots/phone/work__objectives.png`, `work__projects-processes.png`). They read like loose page buttons, not row actions. **Concrete fix:** move mobile row actions into a compact trailing menu, or anchor them to a single bottom action row with stronger card-to-action association. **Lens:** taste.

2. **`/kitchen/log`, `/kitchen/plan`, `/kitchen/stock` on phone · top summary treatment · the mobile summary bars flatten desktop KPI cards into plain text strips, which is functional but visually reads like a different subsystem** (`Today 3 planned 0%`, `Plan 3 dishes Production`, `Stock 32 items 0 available`). **Concrete fix:** create one compact mobile summary-strip component with consistent label/value emphasis, separators, and spacing so all Kitchen routes share the same small-screen rhythm. **Lens:** both.

## Cross-cutting / systemic

- **Title token adoption is incomplete.** The 24px page-title correction has not propagated to all authenticated routes.
- **`content-header` is doing too much.** It handles icon, title, count, and long meta copy, but it does not reflow cleanly on phone. It needs a mobile-specific stacked layout.
- **Table width strategy is not tokenized.** The two P0 bugs are the same class: important date/age data has no protected width budget. Add column-width tokens or shared table presets for task-like tables.
- **Empty-state design is not shared.** `/ops` has a framed, intentional zero-state; `/sales`, `/inbox`, `/kitchen/review`, and `/kitchen/pushes` fall back to sparse text-only states.
- **Primary CTA behavior is not app-wide consistent on phone.** `/ops` duplicates the primary action; other routes use single-action framing. This should be unified.
- **Same-role typography still drifts.** Beyond page titles, identical action labels and utility text still vary by route and component (example: `/ops` phone duplicate CTA at 15px vs 16px). Move more of this into shared tokens/components instead of route-local styling.

## Coverage

| Route | Reached? | Desktop + phone screenshotted? |
|---|---|---|
| `/` | yes | yes |
| `/tasks` | yes | yes |
| `/work/cascade` | yes | yes |
| `/work/objectives` | yes | yes |
| `/work/projects-processes` | yes | yes |
| `/ops` | yes | yes |
| `/kitchen/log` | yes | yes |
| `/kitchen/plan` | yes | yes |
| `/kitchen/stock` | yes | yes |
| `/kitchen/review` | yes | yes |
| `/kitchen/pushes` | yes | yes |
| `/sales` | yes | yes |
| `/plan/budget` | redirected to `/` | yes |
| `/plan/pricing` | redirected to `/` | yes |
| `/inbox` | yes | yes |
| `/admin/people` | yes | yes |
| `/updates` | yes | yes |
