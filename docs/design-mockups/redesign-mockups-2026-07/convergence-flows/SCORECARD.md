# Convergence Flows Scorecard

PASS/FAIL per Experience Contract rule × flow, with one-line evidence.

| Rule | F1 — Ayu posts a Signal | F2 — Ayu completes Café opening | F3 — Rina acts on overdue Team work |
|---|---|---|---|
| 1. One job per rail item | PASS — `#/home` first viewport answers “What needs my attention right now?” with attention brief + Signals (`shots/f1-home-phone.png`). | PASS — `#/cafe` first viewport answers “Run today's café floor work” with opening occurrence card + primary action (`shots/f2-opening-phone.png`). | PASS — `#/work/team?view=overdue` first viewport answers “Find and do the work my Team owns” with overdue rows (`shots/f3-overdue-desktop.png`). |
| 2. Domain contract → UI family → destination | PASS — Signal contract renders as feed post/composer/Signal record only; no Task-shape erasure (`#/home`, posted card, `Create Task` after post). | PASS — occurrence surfaces as one Task record with internal checklist + derived roll-up; no separate run editor (`#/work/team?record=occ_cafe_open_today`). | PASS — overdue work stays Task-shaped in Team work table + shared drawer + canonical record page (`#/work/team?view=overdue&record=t_fix_chiller`, `#/record/t_fix_chiller`). |
| 3. Rail / surface budget caps | PASS — rail stays 4 roots + 3 Modules + flat 3-child Work switcher; launcher keeps stable universal actions (`shots/f1-posted-desktop.png`). | PASS — no extra roots/children added; Café uses one contextual action at most (`Start today's opening`). | PASS — Work switcher children remain exactly My work · Team work · Library at `#/work/team?view=overdue` (`shots/f3-overdue-desktop.png`). |
| 4. Canonical routes + URL state | PASS — composer/posting stays on canonical `#/home`; refresh/back return to `#/home` (`home_url`, `post_url`, `reload_url`, `back_url`). | PASS — start opens `#/work/team?record=occ_cafe_open_today`; refresh preserves drawer; panel back returns one level to `#/work/team` (`record_url`, `reload_record_url`, `panel_back_url`). | PASS — saved view lives at `#/work/team?view=overdue`; panel state lives at `&record=t_fix_chiller`; canonical page is `#/record/t_fix_chiller`; refresh preserves both (`panel_url`, `reload_panel_url`, `page_url`, `page_reload_url`). |
| 5. Exactly one `aria-current="page"` | PASS — DOM count is `1` on `#/home` before and after posting (`home_count=1`, `post_count=1`). | PASS — DOM count is `1` on `#/cafe` and `#/work/team?record=occ_cafe_open_today` (`cafe_count=1`). | PASS — DOM count is `1` on Team view, drawer route, and canonical page (`team_count=1`, `panel_count=1`, `page_count=1`). |
| 6. One four-region anatomy per route | PASS — Home renders header + context row + content + shared drawer host (`shots/f1-posted-desktop.png`). | PASS — Café landing and occurrence drawer use same 4-region shell (`shots/f2-opening-desktop.png`). | PASS — Team work and canonical record page both use same shell + shared drawer/page renderer (`shots/f3-overdue-desktop.png`). |
| 7. Verb+object action grammar | PASS — visible actions are `Share Signal`, `Create Task`, `Ask Deputy / dictate`; no bare Create/Add/New on Home. | PASS — primary action is exact verb+object `Start today's opening`; no `Process Run` noun in UI. | PASS — visible actions are `Mark complete`, `Create Task`, `Share Signal`; no bare Create/Add/New on Work routes. |
| 8. Capture-first disclosure on phone | PASS — 390px Home shows attention/work in first viewport, composer starts with content + Team + occurrence time + author, and `@` opens Person/Team grouped fuzzy results (`mention_groups="Person,Team"`, `shots/f1-posted-phone.png`). | PASS — 390px Café shows the opening work card immediately with 44px actions/checks in first viewport (`shots/f2-opening-phone.png`). | PASS — 390px Team work shows overdue work row in first viewport and view config is behind one `View options` control (`shots/f3-overdue-phone.png`). |
| 9. Responsive disclosure order | PASS — same Home/Signal meaning on phone and desktop; phone uses bottom nav + menu, desktop uses rail (`shots/f1-posted-phone.png`, `shots/f1-posted-desktop.png`). | PASS — same opening task/checklist and completion meaning on phone and desktop (`shots/f2-opening-phone.png`, `shots/f2-opening-desktop.png`). | PASS — same overdue Team work route, drawer action, and record reachability on phone and desktop (`shots/f3-overdue-phone.png`, `shots/f3-overdue-desktop.png`). |
| 10. Extension test | PASS — F1 adds Signal feed/composer/card inside existing shell with no new rail root or anatomy (`#/home`, existing Rule-6 shell). | PASS — F2 adds a Café occurrence collection/view + Task drawer reuse, not a new anatomy/root (`#/cafe`, `#/work/team?record=occ_cafe_open_today`). | PASS — F3 uses saved view + shared drawer + canonical page reuse; overdue is a query/view, not a new destination (`#/work/team?view=overdue`, `#/record/t_fix_chiller`). |

## Open defects

None found in the final verification pass.

## Director verification addendum (2026-07-13, Claude Director — rendered browser pass)

Independently re-verified in a live browser (not trusting the self-score): Rules 4/5/7 asserted by
DOM query on 5 routes; F1 posted end-to-end (post lands in feed, `Create Task` on the posted card,
FYI default, capture-minimal composer, grouped `@` results with type badges); F2 `Start today's
opening` → occurrence-as-Task with live roll-up (0/9 → 1/9) and function-provenance line; F3 URL /
Back / refresh / drawer semantics exact; 390px capture-first + ≥44px targets; "Process Run" absent
from the DOM. Three defects the self-score missed were found and FIXED post-scorecard:

1. `flows.js` — `[data-canonical]` click handler crashed on table rows (`null.split`, flows.js:877);
   rows are now excluded (handled by their `data-record-href` listener).
2. `flows.js` — desktop rail showed a gated "Money•" stub to unauthorized viewers while phone hid it
   (Rule 9 reachability parity + 90%-employee-first); Money entry now renders only with `money.view`.
3. `flows.css` — phone `.ctx-row` sticky used `top: var(--e7-header-h)` inside the `e7-main` scroll
   container, double-offsetting 56px and overlapping the page title; now `top: 0`. (Means
   `shots/*-phone.png` predate this fix and show a clipped title — re-render if screenshots matter.)

All three re-verified green after the fixes; `window.__cfErr` = [] across the exercised flows.

---

## Reframe 2026-07-14 — owner-frame shell rework

Re-scored against the amended `EXPERIENCE-CONTRACT.md` (owner frame directives:
Rule 1 Events row, Rule 3 new budgets — 5 dest roots / 4 Work children, Rule 6
header anatomy = brand+breadcrumb · search+Inbox+Deputy, no "+ Actions" button).
Flows F1/F2/F3 internals are unchanged; only the frame (navbar, sidebar, palette,
routes) was reworked. All evidence below is from a fresh live-browser pass
(serve + agent-browser), `window.__cfErr` = [] throughout.

### Rules 1–10 × F1–F3 (re-scored)

| Rule | F1 — Ayu posts a Signal (phone) | F2 — Ayu completes Café opening | F3 — Rina acts on overdue Team work |
|---|---|---|---|
| 1. One job per rail item | PASS — `#/home` first viewport answers “What needs my attention right now?” (`shots/f1-home-phone.png`). | PASS — `#/cafe` answers “Run today's café floor work” with the opening card + `Start today's opening` (`shots/f2-opening-phone.png`). | PASS — `#/work/tasks?view=overdue` answers “Find and do the work I own or my Team owns.” (`shots/f3-overdue-desktop.png`). |
| 2. Domain contract → UI family → destination | PASS — Signal = feed post / composer / Signal record only; archive reuses the same card family (`#/work/signals`). | PASS — occurrence = one Task with internal checklist + derived roll-up; no run editor (`#/work/tasks?view=team&record=occ_cafe_open_today`). | PASS — overdue work stays Task-shaped in the Tasks table + shared drawer + canonical page (`#/work/tasks?view=overdue&record=t_fix_chiller` → `#/record/t_fix_chiller`). |
| 3. Rail / surface budget | PASS — rail = Home · Work · Events · [Money gated] · Inbox + 3 Modules / 2 BU groups + Admin·profile; launcher = 3 universal + ≤1 contextual; Work switcher = **4** flat children (`shots/frame-desktop.png`). | PASS — no extra roots/children; ≤1 contextual (`Start today's opening`). | PASS — Work children remain Signals · Tasks · Projects & Processes · Objectives; Overdue is a saved-view chip, not a child (`shots/f3-overdue-desktop.png`). |
| 4. Canonical routes + URL state | PASS — posting stays on canonical `#/home`; Back/refresh return there. | PASS — Start → `#/work/tasks?view=team&record=occ_cafe_open_today`; refresh preserves drawer + roll-up; panel Back pops to `#/work/tasks?view=team`. | PASS — saved view at `#/work/tasks?view=overdue`; panel at `&record=`; canonical `#/record/…`; refresh preserves both; Back pops one level. |
| 5. Exactly one `aria-current="page"` | PASS — `count=1` on `#/home` before/after posting (phone + desktop). | PASS — `count=1` on `#/cafe` and the occurrence panel route. | PASS — `count=1` on Tasks view, drawer route, canonical page (desktop + phone). |
| 6. One four-region anatomy | PASS — header (brand·breadcrumb·search·Inbox·Deputy) + context row + content + drawer host (`shots/f1-posted-desktop.png`). | PASS — same shell on Café landing and occurrence drawer (`shots/f2-opening-desktop.png`). | PASS — same shell + shared drawer/page renderer (`shots/f3-overdue-desktop.png`). |
| 7. Verb+object action grammar | PASS — palette actions are `Ask Deputy · Share Signal · Create Task`; no bare Create; no "+ Actions" header button (`shots/palette-desktop.png`). | PASS — primary action is verb+object `Start today's opening`; no “Process Run” noun (`/Process Run/i` absent from DOM). | PASS — actions `Mark complete`, `Create Task`, `Share Signal`; no bare Create/Add/New. |
| 8. Capture-first disclosure (phone) | PASS — 390px Home shows attention/work first; composer initial fields = content + Team + occurrence time + author; `@` opens grouped Person/Team/BU results. | PASS — 390px Café shows the opening card immediately with ≥44px actions/checks. | PASS — 390px Tasks shows work rows in the first viewport; view config behind one `View options` control (`shots/f3-overdue-phone.png`). |
| 9. Responsive disclosure order | PASS — same Home/Signal meaning phone + desktop; bottom-nav (Home·Work·Café·Inbox·More) + FAB→palette. | PASS — same opening task/checklist meaning phone + desktop. | PASS — same overdue route/drawer/reachability phone + desktop; Money hidden for unauthorized on **both** form factors (Ayu: rail + More menu). |
| 10. Extension test | PASS — Signals added as a Work collection + search renderer inside the existing shell, no new root/anatomy. | PASS — occurrence reuses the Task drawer; no new anatomy. | PASS — Overdue/Follow-ups are saved views, not destinations; reuse intact. |

### New / changed routes (one line each — all `count=1`, `err=0`)

- `#/work/signals` — Signal archive/search; opens Signal panel (`?record=`) and canonical `#/record/sig_*`; breadcrumb `Work · Signals` (`shots/signals-desktop.png`).
- `#/work/tasks` — Tasks collection; `?view=all|mine|team|overdue|followups` saved-view chips. F3 lives at `?view=overdue`.
- `#/work/projects` — Projects & Processes definition list (Projects · Processes · Standards); opens `#/record/proj_*|proc_*|std_*`.
- `#/work/objectives` — Objectives definition list; opens `#/record/obj_*`.
- `#/events` — destination stub carrying its Rule-1 job sentence (“See what's happening around our outlets and when”) + labelled “not in this slice” body.
- Redirects (Rule 4 back-compat, `location.replace` so Back never lands on the legacy URL):
  - `#/work/mine` → `#/work/tasks?view=mine`
  - `#/work/team` → `#/work/tasks?view=team`
  - `#/work/team?view=overdue&record=t_fix_chiller` → `#/work/tasks?view=overdue&record=t_fix_chiller` (view + record preserved)
  - `#/work/library` → `#/work/projects` (record preserved)
  - `#/work` → `#/work/tasks`
- Frame chrome: header = brand + breadcrumb + search field (⌘K / opens palette) + Inbox(unread) + Deputy; **no** "+ Actions" button, **no** persona in header (moved to a pinned rail profile row: avatar · “{Site} {role}”). Sidebar = Home · Work (always-expanded: Signals · Tasks · Projects & Processes · Objectives) · Events · Money(gated) · Inbox · Retail Ops (Café · Ecommerce) · B2B Ops (Roastery) · Admin Settings(gated) + profile row. Phone bottom-nav unchanged (Home · Work · Café · Inbox · More) + FAB→palette.

### Verification method

`python3 ../serve-e7.py` (127.0.0.1:8766) + `agent-browser`: for each route,
assert (1) URL after each step, (2) browser Back at every depth, (3) refresh
restores state, (4) `document.querySelectorAll('[aria-current="page"]').length
=== 1`, (5) 390px first viewport shows work, (6) `window.__cfErr` empty.
Audited 14 desktop + 8 phone routes — **all `count=1`, all `err=0`** (stricter
than the prior build, which had `count=0` gaps on phone secondary/record routes
and on `#/profile`; the reframe closes those — phone bottom-nav + the “More”
owner now cover every authorized destination, and the desktop profile row owns
`#/profile`). Director-fix invariants preserved: `[data-canonical]` row guard
intact, Money hidden when unauthorized on both form factors, phone
`.ctx-row { top: 0 }` retained.

### Open defects

None blocking. Two conscious, by-design notes (not defects):

1. **Header search is a launcher trigger, not live search.** Per the owner frame
   it opens the ⌘K palette; the palette's own input filters the action list only.
   Universal record/people search is full-build scope, consistent with the slice.
2. **Work children carry icons** (Signals/Tasks/Projects & Processes/Objectives).
   The sketch showed indented labels; icons were added so the narrowed tablet
   rail (≤1099px) stays reachable/scannable without empty rows, and desktop
   gains scannability. Pure presentation; routes/labels/jobs unchanged.
