# Design audit — post-retrofit — 2026-07-08

Audit scope: rendered review of `/mos` in `agent-browser`, desktop `1440×900` and phone `390×844`.

Screenshots: `/tmp/mos-audit-2/shots/{desktop,phone}/*.png`

Reachability: all requested routes were reachable with the seeded `Dewi Director` persona; no persona switch was required.

## Confirmed good from the recent retrofit

- **DUE-column bleed is fixed** on `/mos/` and `/mos/tasks`; neither desktop nor phone showed the old right-edge overflow.
- **Phone content-header reflow is fixed** on `/mos/updates`, `/mos/work/objectives`, and `/mos/work/projects-processes`; title + supporting copy now stack without collisions.
- **`/mos/ops` phone single-CTA fix held**; only one `+ Add log entry` is visible on phone.
- **`/mos/work/cascade` is now a grouped table/list** and reads materially closer to `/mos/tasks` than before.
- **`/mos/tasks` and `/mos/dashboard` do share the same orange-underline view-tab pattern** for their inner view tabs.

## Route findings

### `/mos/` — Home

1. **Route(s):** `/mos/`  
   **Element:** page header `h1` vs sibling pages  
   **Tell:** Home is still `24px` while nearly every other audited page title renders at `20px` (`/tmp/mos-audit-2/shots/desktop/home.png`; route metrics show `24px` on Home vs `20px` elsewhere).  
   **Why it undermines the product:** the new archetype system still does not feel truly systemic; Home reads like a different product tier.  
   **Concrete fix:** normalize page-title tokens so every top-level page uses one title size/line-height.  
   **Lens:** hierarchy/craft  
   **Suggested severity:** P1

2. **Route(s):** `/mos/`  
   **Element:** top KPI cards  
   **Tell:** two of four cards show only em dashes with no as-of date, loading explanation, or source status (`Trailing 7-day revenue`, `Gross margin (interim)` in `/tmp/mos-audit-2/shots/desktop/home.png` and `/tmp/mos-audit-2/shots/phone/home.png`).  
   **Why it undermines the product:** blank KPIs read as broken instrumentation, not intentional absence.  
   **Concrete fix:** add explicit empty/data-unavailable states with provenance, e.g. `No finance snapshot yet · next sync 03:30 WIB`.  
   **Lens:** UX/trust  
   **Suggested severity:** P1

3. **Route(s):** `/mos/`  
   **Element:** `My tasks` table, DUE cells on desktop  
   **Tell:** overdue dates still truncate to ellipsis (`Overdue · Tue 30 J…`) even after the bleed fix, visible in `/tmp/mos-audit-2/shots/desktop/home.png`.  
   **Why it undermines the product:** the page technically fits, but critical urgency info still looks cramped and unfinished.  
   **Concrete fix:** slightly widen the due column or shorten the label pattern on Home cards/tables only.  
   **Lens:** craft/hierarchy  
   **Suggested severity:** P2

4. **Route(s):** `/mos/` phone  
   **Element:** KPI grid  
   **Tell:** each KPI card is only about `165×83px` (`/tmp/mos-audit-2/shots/phone/home.png`), forcing a very tight two-column layout before any real numeric values exist.  
   **Why it undermines the product:** once real finance numbers land, this layout will feel pinched and harder to scan than a single-column stack.  
   **Concrete fix:** stack KPI cards on phone or let only one hero KPI occupy full width.  
   **Lens:** responsive/hierarchy  
   **Suggested severity:** P2

### `/mos/tasks`

5. **Route(s):** `/mos/tasks` phone  
   **Element:** header cluster (`h1`, counts, primary CTA)  
   **Tell:** title, item count, blocked/overdue meta, and `+ New task` compete inside the first ~72px of content; the status summary wraps under the title while the CTA sits beside it (`/tmp/mos-audit-2/shots/phone/tasks.png`).  
   **Why it undermines the product:** the first glance is busy instead of orienting; users have to parse structure before doing work.  
   **Concrete fix:** move counts under the title as a single muted summary line and place the CTA on its own row or as a sticky footer action.  
   **Lens:** hierarchy/responsive  
   **Suggested severity:** P2

6. **Route(s):** `/mos/tasks` phone  
   **Element:** filter bar  
   **Tell:** filters wrap into four stacked rows before content starts (`Mine/RACI/All`, group, unit/status, person, search, archive) in `/tmp/mos-audit-2/shots/phone/tasks.png`.  
   **Why it undermines the product:** the page becomes controls-first and job-second; task content is pushed far down.  
   **Concrete fix:** collapse secondary filters into a bottom sheet or `Filter` drawer; keep only view toggle + search visible.  
   **Lens:** UX/responsive  
   **Suggested severity:** P1

7. **Route(s):** `/mos/tasks` phone  
   **Element:** top utility actions and primary CTA  
   **Tell:** top icons are `32×32px` and `+ New task` is `102×32px` per route metrics; screenshot confirms undersized touch targets (`/tmp/mos-audit-2/shots/phone/tasks.png`).  
   **Why it undermines the product:** this misses the common `44px` touch target expectation and makes a premium app feel fiddly.  
   **Concrete fix:** raise tappable height to `44px` minimum for header icons and key CTAs.  
   **Lens:** a11y/responsive/IxD  
   **Suggested severity:** P1

### `/mos/tasks/new`

8. **Route(s):** `/mos/tasks/new` desktop  
   **Element:** page header CTA + right drawer  
   **Tell:** the page still shows the global `+ New task` button in the header while the `New task` drawer is already open (`/tmp/mos-audit-2/shots/desktop/tasks-new.png`).  
   **Why it undermines the product:** this creates duplicate primaries in one context and weakens the page’s action hierarchy.  
   **Concrete fix:** hide or disable the header CTA while the create drawer is open.  
   **Lens:** IxD/hierarchy  
   **Suggested severity:** P1

9. **Route(s):** `/mos/tasks/new` desktop  
   **Element:** split-view canvas  
   **Tell:** the task table remains fully visible behind the creation form, so the eye keeps bouncing between two equally strong surfaces (`/tmp/mos-audit-2/shots/desktop/tasks-new.png`).  
   **Why it undermines the product:** creation feels like an interrupted browsing state, not a focused compose state.  
   **Concrete fix:** dim the table more aggressively, narrow the visible table, or promote create to a modal/full-page write surface.  
   **Lens:** hierarchy/IxD  
   **Suggested severity:** P2

10. **Route(s):** `/mos/tasks/new` phone  
   **Element:** bottom action row  
   **Tell:** `Cancel` and `Create task` are only about `32px` tall in `/tmp/mos-audit-2/shots/phone/tasks-new.png`.  
   **Why it undermines the product:** the final submit controls are the worst place to save vertical pixels.  
   **Concrete fix:** make footer buttons `44–48px` tall and pin them as a safe-area-aware sticky footer.  
   **Lens:** a11y/responsive  
   **Suggested severity:** P1

### `/mos/tasks/<detail>`

11. **Route(s):** task detail desktop  
   **Element:** selected row + detail drawer composition  
   **Tell:** the selected row gets a strong blue outline while the right drawer is also fully active (`/tmp/mos-audit-2/shots/desktop/task-detail.png`).  
   **Why it undermines the product:** two focal points compete; the user’s attention is split between list state and detail editing state.  
   **Concrete fix:** soften the row selection once the drawer is open, or treat the drawer as the clear active surface.  
   **Lens:** hierarchy/IxD  
   **Suggested severity:** P2

12. **Route(s):** task detail phone  
   **Element:** detail sheet top bar  
   **Tell:** the top bar only says `Task` while expand/close controls are icon-only and visually small (`/tmp/mos-audit-2/shots/phone/task-detail.png`).  
   **Why it undermines the product:** the sheet feels generic and the controls rely on icon literacy alone.  
   **Concrete fix:** use the task title as the header context or add labels/tooltips and larger hit areas for sheet actions.  
   **Lens:** a11y/IxD/craft  
   **Suggested severity:** P2

13. **Route(s):** task detail phone  
   **Element:** information ordering  
   **Tell:** the first viewport is mostly ownership fields; actual activity/timeline context is pushed below the fold (`/tmp/mos-audit-2/shots/phone/task-detail.png`).  
   **Why it undermines the product:** for a detail view, users need recent history before they need metadata maintenance.  
   **Concrete fix:** surface activity summary above RACI, or default the phone sheet to the `Activity` tab first.  
   **Lens:** UX/IA  
   **Suggested severity:** P2

### `/mos/work/cascade`

14. **Route(s):** `/mos/work/cascade` desktop  
   **Element:** top manage links  
   **Tell:** `Manage objectives` and `Manage projects & processes` read like plain text links floating above the table, not like page tools or tabs (`/tmp/mos-audit-2/shots/desktop/work-cascade.png`).  
   **Why it undermines the product:** the page grammar wobbles between browse mode and admin mode.  
   **Concrete fix:** style these as secondary actions in the header or move them to an overflow/tool row.  
   **Lens:** IA/craft  
   **Suggested severity:** P2

15. **Route(s):** `/mos/work/cascade` desktop and phone  
   **Element:** group header status chips  
   **Tell:** group labels sit left while `Daily / ongoing` or `Project` chips float far right on desktop and as detached pills on phone (`/tmp/mos-audit-2/shots/desktop/work-cascade.png`, `/tmp/mos-audit-2/shots/phone/work-cascade.png`).  
   **Why it undermines the product:** the chip reads like row status, objective type, and taxonomy badge all at once.  
   **Concrete fix:** bind the badge closer to the group title and label it with one clear meaning only.  
   **Lens:** IA/hierarchy  
   **Suggested severity:** P2

### `/mos/updates`

16. **Route(s):** `/mos/updates` phone  
   **Element:** form action buttons  
   **Tell:** `Add line`, `Save draft`, and `Submit update` are `32px` tall (`/tmp/mos-audit-2/shots/phone/updates.png`; measured in route metrics).  
   **Why it undermines the product:** a write/review surface should feel generous and deliberate, not compressed.  
   **Concrete fix:** promote these to full-height mobile action buttons and use a sticky submit area.  
   **Lens:** a11y/responsive/IxD  
   **Suggested severity:** P1

17. **Route(s):** `/mos/updates` desktop and phone  
   **Element:** disabled/secondary action styling  
   **Tell:** `Submit update` uses a pale brand-blue fill that still reads nearly-primary even while unavailable (`/tmp/mos-audit-2/shots/desktop/updates.png`, `/tmp/mos-audit-2/shots/phone/updates.png`).  
   **Why it undermines the product:** users have to infer state from subtle saturation shifts, which weakens action clarity.  
   **Concrete fix:** make disabled buttons visibly disabled via contrast/value change and cursor/state messaging.  
   **Lens:** IxD/a11y/craft  
   **Suggested severity:** P2

### `/mos/ops`

18. **Route(s):** `/mos/ops` desktop  
   **Element:** header toolbar CTA + empty-state CTA  
   **Tell:** the duplicate `+ Add log entry` is still present: one at roughly `x1270,y159` and one at `x281,y292` (`/tmp/mos-audit-2/shots/desktop/ops.png`; measured via DOM).  
   **Why it undermines the product:** this breaks the “one primary action per context” rule and makes the retrofit feel unfinished.  
   **Concrete fix:** keep only one primary CTA in the empty state or only in the toolbar, not both.  
   **Lens:** IxD/hierarchy  
   **Suggested severity:** P1

19. **Route(s):** `/mos/ops` desktop  
   **Element:** empty-state canvas  
   **Tell:** after the top-left card, the remaining ~70% of the page is blank white field (`/tmp/mos-audit-2/shots/desktop/ops.png`).  
   **Why it undermines the product:** the page reads sparse rather than intentionally empty.  
   **Concrete fix:** vertically center the empty state or use a fuller archetype shell with illustration/helpful next steps.  
   **Lens:** craft/UX  
   **Suggested severity:** P2

### `/mos/ops/new`

20. **Route(s):** `/mos/ops/new` desktop and phone  
   **Element:** form footer actions  
   **Tell:** primary and secondary buttons are visually small against a large, airy form; on phone the action row again lands at ~`32px` tall (`/tmp/mos-audit-2/shots/desktop/ops-new.png`, `/tmp/mos-audit-2/shots/phone/ops-new.png`).  
   **Why it undermines the product:** the final action lacks the confidence expected on a write surface.  
   **Concrete fix:** use a sticky 44px+ footer and stronger primary emphasis.  
   **Lens:** responsive/IxD  
   **Suggested severity:** P2

### `/mos/inbox`

21. **Route(s):** `/mos/inbox` desktop and phone  
   **Element:** empty state  
   **Tell:** Inbox is just headline + sentence on a blank page, with no card, no icon treatment beyond the header, and no next-step affordance (`/tmp/mos-audit-2/shots/desktop/inbox.png`, `/tmp/mos-audit-2/shots/phone/inbox.png`).  
   **Why it undermines the product:** it feels absent rather than designed; this is noticeably weaker than the Home and Ops surfaces.  
   **Concrete fix:** give Inbox a first-class empty-state module with triage guidance, sample triggers, or quick links.  
   **Lens:** UX/craft  
   **Suggested severity:** P2

### `/mos/kitchen/log`

22. **Route(s):** `/mos/kitchen/log` desktop  
   **Element:** summary cards  
   **Tell:** cards mix hard metrics (`0`) with placeholder phrases like `no plan set` and `—%` in the same visual tier (`/tmp/mos-audit-2/shots/desktop/kitchen-log.png`).  
   **Why it undermines the product:** users cannot quickly distinguish measured facts from system status.  
   **Concrete fix:** separate KPI cards from state cards, or visually distinguish unavailable metrics from real zeroes.  
   **Lens:** hierarchy/UX  
   **Suggested severity:** P2

23. **Route(s):** `/mos/kitchen/log` phone  
   **Element:** compact summary strip  
   **Tell:** the top chip compresses too much meaning into one line: `Today 0 planned —%` (`/tmp/mos-audit-2/shots/phone/kitchen-log.png`).  
   **Why it undermines the product:** it reads like debug shorthand rather than a user-facing summary.  
   **Concrete fix:** break this into labeled mini-stats or stack the status below the date.  
   **Lens:** hierarchy/responsive/craft  
   **Suggested severity:** P2

24. **Route(s):** `/mos/kitchen/log` desktop and phone  
   **Element:** quantity steppers  
   **Tell:** minus/plus controls are very low-contrast white-on-white outlines; the disabled minus is especially faint (`/tmp/mos-audit-2/shots/desktop/kitchen-log.png`, `/tmp/mos-audit-2/shots/phone/kitchen-log.png`).  
   **Why it undermines the product:** production logging should feel tactile and obvious; these controls feel tentative.  
   **Concrete fix:** increase border contrast, icon weight, and active-state fill; enlarge hit areas.  
   **Lens:** IxD/a11y/craft  
   **Suggested severity:** P2

### `/mos/kitchen/plan`

25. **Route(s):** `/mos/kitchen/plan` desktop  
   **Element:** KPI card `Plan status`  
   **Tell:** the card literally says `empty` in large type (`/tmp/mos-audit-2/shots/desktop/kitchen-plan.png`).  
   **Why it undermines the product:** this reads like a placeholder string or system state leak, not polished product language.  
   **Concrete fix:** replace with human language such as `No plan created yet`.  
   **Lens:** craft/UX  
   **Suggested severity:** P2

26. **Route(s):** `/mos/kitchen/plan` phone  
   **Element:** top summary strip  
   **Tell:** `Plan 0 dishes Production` is terse to the point of opacity in `/tmp/mos-audit-2/shots/phone/kitchen-plan.png`.  
   **Why it undermines the product:** it assumes the user already knows the information grammar.  
   **Concrete fix:** use labeled stacked stats: `Dishes planned: 0` and `Current action: Production`.  
   **Lens:** IA/responsive  
   **Suggested severity:** P2

### `/mos/kitchen/stock`

27. **Route(s):** `/mos/kitchen/stock` desktop  
   **Element:** `Negative balances` KPI  
   **Tell:** a green success-style bar labeled `clear` sits beside a page where all 32 items are zero/empty (`/tmp/mos-audit-2/shots/desktop/kitchen-stock.png`).  
   **Why it undermines the product:** green implies health, but the rest of the page suggests the kitchen has no usable stock data.  
   **Concrete fix:** reserve success green for genuinely healthy, populated states; use neutral empty-state treatment here.  
   **Lens:** hierarchy/trust/craft  
   **Suggested severity:** P1

28. **Route(s):** `/mos/kitchen/stock` phone  
   **Element:** top summary + zero list  
   **Tell:** the page opens with `Stock 32 items 0 available`, followed by cards where every quantity is `0` (`/tmp/mos-audit-2/shots/phone/kitchen-stock.png`).  
   **Why it undermines the product:** users cannot tell whether stock is truly empty or whether logging/integration has failed.  
   **Concrete fix:** add provenance and an explicit empty-data explanation before the item list.  
   **Lens:** UX/trust  
   **Suggested severity:** P2

### `/mos/kitchen/review`

29. **Route(s):** `/mos/kitchen/review` desktop and phone  
   **Element:** empty state  
   **Tell:** this is still bare text + `Refresh`, with no card/container and no indication of poll timing or expected cadence (`/tmp/mos-audit-2/shots/desktop/kitchen-review.png`, `/tmp/mos-audit-2/shots/phone/kitchen-review.png`).  
   **Why it undermines the product:** it feels like an unfilled route, not a confident empty workflow state.  
   **Concrete fix:** use the same empty-state frame as other review surfaces and explain when items appear here.  
   **Lens:** UX/craft  
   **Suggested severity:** P2

### `/mos/kitchen/pushes`

30. **Route(s):** `/mos/kitchen/pushes` desktop and phone  
   **Element:** empty state  
   **Tell:** same issue as Review: text + `Refresh`, no designed container, no sync explanation beyond `The ESB outbox is empty.` (`/tmp/mos-audit-2/shots/desktop/kitchen-pushes.png`, `/tmp/mos-audit-2/shots/phone/kitchen-pushes.png`).  
   **Why it undermines the product:** an integration-facing screen especially needs provenance and system-status confidence.  
   **Concrete fix:** add last checked time, auto-refresh behavior, and a stronger empty-state shell.  
   **Lens:** UX/trust  
   **Suggested severity:** P2

### `/mos/admin/people`

31. **Route(s):** `/mos/admin/people` desktop  
   **Element:** search + filter + add row  
   **Tell:** the page header is clean, but the manage surface below immediately becomes a wide utilitarian grid with little personality or hierarchy (`/tmp/mos-audit-2/shots/desktop/admin-people.png`).  
   **Why it undermines the product:** admin surfaces are allowed to be plain, but this one now feels noticeably less premium than Tasks or Home.  
   **Concrete fix:** give the filter row and list cards a little more structure: stronger row grouping, clearer role badges, and denser but more intentional spacing.  
   **Lens:** craft/hierarchy  
   **Suggested severity:** P3

### `/mos/work/objectives`

32. **Route(s):** `/mos/work/objectives` phone  
   **Element:** objective cards, action region  
   **Tell:** `Rename` and `Archive` sit centered like content inside each card rather than reading as actions (`/tmp/mos-audit-2/shots/phone/work-objectives.png`).  
   **Why it undermines the product:** weak affordance makes admin actions feel accidental or inactive.  
   **Concrete fix:** move actions to a right-aligned button row or overflow menu.  
   **Lens:** IxD/hierarchy  
   **Suggested severity:** P2

### `/mos/work/projects-processes`

33. **Route(s):** `/mos/work/projects-processes` phone  
   **Element:** list cards, action region  
   **Tell:** same centered `Rename` / `Archive` treatment as Objectives (`/tmp/mos-audit-2/shots/phone/work-projects-processes.png`).  
   **Why it undermines the product:** this pattern looks like placeholder text, not controls.  
   **Concrete fix:** use a consistent card-action pattern shared with People or Tasks row actions.  
   **Lens:** IxD/craft  
   **Suggested severity:** P2

### `/mos/dashboard` and `/mos/dashboard/detail`

34. **Route(s):** `/mos/dashboard`, `/mos/dashboard/detail` desktop and phone  
   **Element:** entire empty-state body  
   **Tell:** both routes are effectively the same sparse canvas: title, tiny range chips, tabs, then one empty paragraph (`/tmp/mos-audit-2/shots/desktop/dashboard.png`, `/tmp/mos-audit-2/shots/desktop/dashboard-detail.png`, `/tmp/mos-audit-2/shots/phone/dashboard.png`).  
   **Why it undermines the product:** this is a trust-sensitive reporting surface; it currently looks closer to an unfinished shell than a decision tool.  
   **Concrete fix:** add a purposeful empty/reporting skeleton with source status, last snapshot, next snapshot, and what summary vs detail will show.  
   **Lens:** UX/trust  
   **Suggested severity:** P1

35. **Route(s):** `/mos/dashboard` phone  
   **Element:** date-range chips (`7d`, `30d`, `60d`, `Custom`, `Branch`)  
   **Tell:** these chips are only `26px` tall per measured bounds; screenshot confirms very small tap areas (`/tmp/mos-audit-2/shots/phone/dashboard.png`).  
   **Why it undermines the product:** filters on a reporting page are core interactions and should not be tiny targets.  
   **Concrete fix:** convert them to 40–44px segmented controls or a compact filter sheet on phone.  
   **Lens:** a11y/responsive/IxD  
   **Suggested severity:** P1

36. **Route(s):** `/mos/dashboard/detail`  
   **Element:** view differentiation  
   **Tell:** `Detail` looks nearly identical to `Summary` in the current empty state (`/tmp/mos-audit-2/shots/desktop/dashboard-detail.png` vs `/tmp/mos-audit-2/shots/desktop/dashboard.png`).  
   **Why it undermines the product:** users learn nothing about the meaning of the tabs, so the tab model itself loses credibility.  
   **Concrete fix:** even in empty states, explain the distinct purpose of each tab or show scaffolded placeholders that differ.  
   **Lens:** IA/UX  
   **Suggested severity:** P1

### Deputy panel

37. **Route(s):** deputy panel desktop  
   **Element:** side panel default state  
   **Tell:** the panel consumes a large column but only offers three canned prompts and a disabled-looking footer input (`/tmp/mos-audit-2/shots/desktop/deputy-panel.png`).  
   **Why it undermines the product:** the feature reads more like a placeholder assistant shell than a dependable copilot.  
   **Concrete fix:** add capability framing, recent examples, response expectations, and a stronger ready state for the composer.  
   **Lens:** UX/trust  
   **Suggested severity:** P2

### Command/search

38. **Route(s):** command/search phone  
   **Element:** modal list + footer  
   **Tell:** the phone palette uses most of the viewport but still crops the navigation list quickly; footer help text occupies space while options are truncated (`/tmp/mos-audit-2/shots/phone/search-panel.png`).  
   **Why it undermines the product:** on the smallest screen, the command palette spends too much real estate on chrome and too little on actual commands.  
   **Concrete fix:** reduce footer chrome and let the list breathe; consider full-screen search on phone.  
   **Lens:** responsive/IxD  
   **Suggested severity:** P2

## Systemic / cross-route patterns

39. **Route(s):** many (`/mos/tasks`, `/mos/updates`, `/mos/ops/new`, `/mos/dashboard`, top utilities globally)  
   **Element:** mobile tap targets  
   **Tell:** repeated `32px` controls show up in global header icons, form buttons, and reporting chips (`/tmp/mos-audit-2/shots/phone/tasks.png`, `updates.png`, `ops-new.png`, `dashboard.png`).  
   **Why it undermines the product:** the app is visually tidy but physically too small in too many key interactions.  
   **Concrete fix:** enforce a shared mobile control token with `min-height: 44px` for tappables.  
   **Lens:** a11y/system  
   **Suggested severity:** P1

40. **Route(s):** empty routes across Inbox, Kitchen Review, Kitchen Pushes, Dashboard, Ops  
   **Element:** empty-state system  
   **Tell:** these pages do **not** yet share one rhythm: Ops uses a boxed empty module, Inbox is just text on canvas, Review/Pushes are text + refresh, Dashboard is a reporting paragraph (`/tmp/mos-audit-2/shots/desktop/ops.png`, `inbox.png`, `kitchen-review.png`, `kitchen-pushes.png`, `dashboard.png`).  
   **Why it undermines the product:** the product still feels like several teams’ screens rather than one app system.  
   **Concrete fix:** define 2–3 sanctioned empty-state archetypes and apply them consistently.  
   **Lens:** craft/system/UX  
   **Suggested severity:** P1

41. **Route(s):** Home, Dashboard, Kitchen surfaces  
   **Element:** data absence / provenance  
   **Tell:** the app repeatedly shows `0`, `—`, `—%`, or `empty` without enough source-time context (`home.png`, `dashboard.png`, `kitchen-log.png`, `kitchen-plan.png`, `kitchen-stock.png`).  
   **Why it undermines the product:** leaders cannot tell the difference between real zeroes, unconfigured workflows, and missing pipelines.  
   **Concrete fix:** add a universal provenance pattern: `as of`, `last updated`, `next sync`, and `why blank`.  
   **Lens:** UX/trust/system  
   **Suggested severity:** P1

## Severity count

- **P1:** 14
- **P2:** 23
- **P3:** 4
- **P0:** 0
