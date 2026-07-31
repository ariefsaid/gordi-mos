# Post-retrofit audit — Director triage → debt/todo backlog (2026-07-08)

Source: [design-audit-post-retrofit-2026-07-08.md](design-audit-post-retrofit-2026-07-08.md) (gpt-5.4, 41
findings: 0 P0 · 14 P1 · 23 P2 · 4 P3). Retrofit confirmed-good by the audit: DUE bleeds fixed, phone
content-header reflow fixed, `/ops` phone single-CTA held, cascade reads as a table, tasks+dashboard share
one view-tab. Director-verified the top systemic claim: `.ch-title` computes **20px** vs Home's 24px — real.

Triaged by **leverage × cost**, not raw severity. Four buckets.

## Bucket A — QUICK WINS (cheap + high-leverage; recommend a single "W6" wave now)
| # | Finding | Fix | Cost |
|---|---|---|---|
| 1 | `.ch-title` 20px vs Home 24px — title scale still not systemic across ~15 pages | bump `.ch-title` → 24px (DESIGN.md Page Title token) | 1 line |
| 18 | `/ops` desktop shows TWO `+ Add log entry` (toolbar + empty-state) | suppress the toolbar CTA in ready-empty (mirror the phone fix W4 did) | ~1 line |
| 8 | `/tasks/new` header `+ New task` still shown while the create drawer is open | hide/disable header CTA when drawer open | ~1 line |
| 27 | `/kitchen/stock` green "clear" `Negative balances` KPI on an all-zero/no-data page reads as false-healthy | neutral (not success-green) treatment when the page has no stock data | small |
| 25 | `/kitchen/plan` KPI literally renders the string `empty` | replace with human copy ("No plan created yet") | copy |
| 17 | `/updates` disabled `Submit update` reads nearly-primary (pale blue) | give disabled buttons a visibly-disabled value/contrast state (global button token) | small, global |

*Rationale:* #1 alone closes the single loudest "several apps" residue (title scale) for one line; the rest are
one-liners that erase "unfinished" tells. All are safe, testable, no design decision needed.

## Bucket B — PLANNED SYSTEMIC WAVES (P1; each its own TDD wave, owner-worth-a-look)
- **B-i · Mobile 44px tap-target token** [#39, #7, #10, #16, #20, #35] — a shared phone control token
  (`min-height:44px`) applied to header icons, form footer buttons, dashboard range chips. Systemic a11y;
  the app is "visually tidy but physically too small." One token + retrofit its consumers.
- **B-ii · One empty-state system** [#40, #21, #29, #30, #19, #34] — the residual the teardown flagged as
  "component-framing." W4 routed routes through state-kit but they still don't share ONE rhythm (Ops boxed,
  Inbox bare text, Review/Pushes text+refresh, Dashboard paragraph). Define 2–3 sanctioned empty-state
  archetypes (into DESIGN.md) + apply. This is the honest completion of A3/W4.
- **B-iii · Data-provenance / absence pattern** [#41, #2, #28, #22, #23, #26] — a universal "as of / last
  updated / next sync 03:30 WIB / why blank" treatment so `0` / `—` / `—%` / `empty` never read as broken
  instrumentation. Generalize the dashboard's `FreshnessLabel`; highest *trust* leverage. Coordinate with the
  reporting-snapshot model.
- **B-iv · Dashboard empty/skeleton + tab differentiation** [#34, #36] — the reporting surface looks like an
  unfinished shell when empty and Summary≡Detail. **Owned by the dashboard session** — hand these two back to
  them (their surface, their snapshot model), don't fix cross-lane.
- **B-v · `/tasks` phone: controls-first** [#6] — filters wrap into 4 rows before content; collapse secondary
  filters into a Filter drawer/bottom-sheet, keep only view-toggle + search visible.

## Bucket C — BACKLOG / DEBT (P2–P3 polish; file, do opportunistically)
Cascade group-chip binding + meaning [#14, #15] · kitchen stepper low contrast [#24] · kitchen phone
summary-strip labels ("Today 0 planned —%" debug-shorthand) [#23, #26] · catalog phone Rename/Archive read as
content not actions [#32, #33] · task-detail two-focal-points + phone info-order (metadata before activity)
[#9, #11, #12, #13] · deputy panel default state feels placeholder [#37] · phone command-palette chrome vs list
[#38] · admin/people utilitarian density [#31] · Home phone KPI 2-col too tight [#4] · Home DUE still
ellipsis-truncates [#3] · `/ops` desktop empty not vertically centered [#19] · kitchen/log KPI-vs-state cards
same tier [#22].

## Bucket D — CONFIRMED FIXED (no action; audit verified the retrofit held)
DUE-column bleeds (`/`, `/tasks`) · phone content-header reflow (`/updates`, `/work/objectives`,
`/work/projects-processes`) · `/ops` phone single-CTA · cascade-as-table coherence · unified view-tab pattern.

## Recommended sequence
1. **W6 quick-wins** (Bucket A) — one glm wave, immediate; erases the loudest residue for ~6 one-liners.
2. **B-i (44px)** + **B-ii (empty-state system)** + **B-iii (provenance)** — three planned waves; B-ii and
   B-iii carry the most "one premium product" and trust weight.
3. Hand **B-iv** to the dashboard session; keep **B-v** + Bucket C as backlog.
