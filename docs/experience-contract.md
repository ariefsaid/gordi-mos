# EXPERIENCE-CONTRACT — E7 prototype rebuild (binding)

**Status:** **BINDING for the mos-app redesign build** (promoted from the E7 prototype working set 2026-07-14; owner directive: mockup phase CLOSED, iteration continues in the app). Every flow / four-lens review scores each rule
below **pass/fail as a blocking acceptance check** — a failed rule blocks the rebuild from going to owner
approval, exactly like a `docs/jtbd.md` calibration anchor. Rules are **falsifiable**: a reviewer can mark
each one against a rendered screen at desktop and ≤390px phone, with no vibes.

**Authority:** `docs/design-mockups/redesign-mockups-2026-07/CONVERGENCE-AUDIT.md` (the classifications) → `docs/redesign-decision-index.md` →
`docs/adr/0025-ia-modules-in-rail-redesign-direction.md` (D1–D41) → `docs/decisions.md` OD-REDESIGN-1…55
→ `CONTEXT.md`. Where a rule operationalises a locked OD/D, it is cited inline.

**Scope:** these are *experience law* (URL semantics, rail budget, page anatomy, disclosure order, action
grammar). They do **not** re-litigate *domain law* (objects, authority, lifecycle) — that is closed. The
two owner ratification calls live in the audit (Q1 Signal home, Q2 function-based assignment); until
answered, the rules below assume the **recommended** answers and are written so a "no" only deletes the
affected clause, not the contract.

---

## Rule 1 — Every rail item answers one job (destination jobs)

Each persistent nav entry has exactly **one job sentence** in Gordi language, and the screen it opens
serves that job first.

| Rail entry | Job sentence | JTBD family |
|---|---|---|
| **Home** | "What needs my attention right now?" | Orient |
| **Work** | "Find and do the work I own or my Team owns." | Execute / Coordinate |
| **Events** | "See what's happening around our outlets and when." | Orient (calendar) |
| **Money** *(gated)* | "Trust the financial figures and act on money exceptions." | Control |
| **Inbox** | "Triage what asked for me and return to its source." | Triage |
| **Café** | "Run today's café floor work — openings, checks, stock, shifts." | Execute (Module) |
| **Ecommerce** | "Fulfil today's online orders against the right stock." | Execute (Module) |
| **Roastery** | "Record today's roasts, yield, and transfers truthfully." | Execute (Module) |

*Operationalises OD-REDESIGN-1 / D1 (rail), OD-REDESIGN-17 / D8 (Home), OD-REDESIGN-8 / D9 (Work),
OD-REDESIGN-20 / D1 (Inbox).*

**Pass if:** every rail entry maps to exactly one row above and the first viewport of its screen answers
that job before any configuration. **Fail if:** any rail entry has no single job sentence, or two entries
share a job (duplicate Home/Dashboard/Operate/Plan), or a screen buries its job behind selectors/empty
state.

## Rule 2 — Three-layer boundary: domain contract → UI family → destination (surfaces merge, schemas don't)

Every rendered surface is composed from **reusable UI families** over **typed, distinct domain contracts**,
assembled into **job-first destinations**. Merging of *surfaces* is aggressive; merging of *schemas* is
conservative (no Blueprint, no freeform data — OD-REDESIGN-29 / D16).

| Domain contract (typed, distinct) | Reusable UI family | Job-first destination |
|---|---|---|
| **Task** | work item (row/card) + record page + activity thread | Work → My work / Team work; Module queues |
| **Signal** | feed post + composer + mention pill | Home feed (ambient) / Work archive-search / Signal record page |
| **Process / Standard / Objective / Project** *(governed definitions)* | governed-definition page + guided designer | Work → Library |
| **Process occurrence** *(thin Run record)* | grouped task list under an occurrence caption + roll-up | Work occurrence grouping; Home attention |
| **Follow-up** | work item (money-shaped) + record page | Money queue entry; Work Tasks saved-view |
| **Check / Exception** | activity-thread entry / exception card | Process occurrence view; Home attention |
| **Inbox item** | triage row | Inbox (page + quick panel) |
| **Person / Team / BU** | mention pill / scope chip | composer; record context row |

*Operationalises OD-REDESIGN-16/29 / D2/D3a/D3d/D7/D16. Q2 (function→holder) adds "job function" as a
template binding that resolves to a Person UI family at spawn — the schema stays Task-shaped.*

**Pass if:** each destination row is built only from families in column 2 over contracts in column 1, and
no two contracts share a renderer that erases their type boundary (a Signal is never rendered as a Task, a
Follow-up never as a generic Task without its money fields). **Fail if:** a new screen introduces a
one-off record editor, embeds a duplicate record (D3a violation), or copies a value that should be linked
(anchor A8).

## Rule 3 — Rail / surface budget (numeric caps)

The rail and each surface obey fixed numeric budgets; growth is by **collection + view renderer + feed
posts**, never by new rail roots or new anatomies (see Rule 10).

| Budget | Cap |
|---|---|
| Destination roots in the rail | **5** (Home · Work · Events · Money *[gated]* · Inbox) — Events added by owner frame directive 2026-07-14 (amends OD-REDESIGN-1 / D1; third ratification slot) |
| Module roots | **3** initially (Café · Ecommerce · Roastery) |
| BU group headings above Modules | **2** (Retail Ops · B2B Ops) |
| Utility entries in the rail | **2** (Admin Settings · Personal Profile), gated, in their own group — never a destination zone |
| Work collection-switcher children | **4** (Signals · Tasks · Projects & Processes · Objectives) — owner frame directive 2026-07-14 after seeing the My work · Team work · Library variant rendered; My/Team/Overdue become saved-view chips inside Tasks |
| Family headings inside any collection switcher | **0** (flat; groups collapsed) |
| Contextual actions on any one screen (besides the Action Launcher) | **1** (OD-REDESIGN-46 / D32) |
| `aria-current="page"` on the whole document | **1** (see Rule 5) |

*Operationalises OD-REDESIGN-1/23 / D1/D3f, OD-REDESIGN-46 / D32, OD-REDESIGN-20 / D1.*

**Pass if:** every numeric cap holds at desktop and on phone. **Fail if:** any cap is exceeded, or a
destination/Module is duplicated, or the Work switcher re-sprouts family headings / >3 children.

## Rule 4 — Canonical routes + URL state semantics

Every collection and saved view has a **canonical route**; view/presentation state lives in **URL query
params**; Back / refresh / bookmark / new-tab all preserve location.

- Collection route shape: `#/work/tasks`, `#/work/team`, `#/work/library`, `#/money`, `#/inbox`, …
- Saved-view + presentation state as query params: `?view=mine&status=open&layout=board&group=team`.
- A first-class record has one canonical URL (OD-REDESIGN-7 / D3a): normal click → shared Record Panel;
  new-tab / direct URL / refresh → full canonical page; same renderer, `mode="panel" | "page"`.
- Phone panel-stack semantics become page-stack semantics **without changing URLs or Back behavior**
  (`PROTOTYPE-BRIEF.md` §8).

*Operationalises OD-REDESIGN-7/19 / D3a/D3d. Fixes the confirmed defect where every Work collection shares
`#/work` and refresh loses the collection.*

**Pass if:** on any collection/view, copying the URL into a new tab renders the same collection, saved
view, filters, and layout; browser Back and panel Back each pop exactly one level; deep-linking a record
opens its canonical page. **Fail if:** two collections share one URL, or any navigation mutates state
without updating the URL, or Back exits the app.

## Rule 5 — One current location (exactly one `aria-current="page"`)

At any moment, **exactly one** element in the document carries `aria-current="page"`. When a child
location is active (e.g. Work → My work), the child carries `page` and the parent collapses to
`aria-current="location"` (or none). Parent and child are **never** simultaneously `page`; sibling groups
never co-activate.

*Operationalises OD-REDESIGN-7/19 / D3a (one canonical location). Fixes the confirmed defect where the
Work parent and active Work child both announce `page`.*

**Pass if:** a DOM query for `[aria-current="page"]` returns exactly one element on every route, desktop
and phone. **Fail if:** it returns zero or more than one.

## Rule 6 — One page anatomy per route

Every route renders the same four-region anatomy: **(1) header → (2) context row → (3) content region →
(4) record drawer** (the shared right-panel host, D3b). The header carries brand + current-location
breadcrumb (left) and the ⌘K search field + Inbox + Deputy (right) — universal actions (Ask Deputy ·
Share Signal · Create Task) live in the ⌘K palette, not as header buttons (owner frame directive
2026-07-14); the context row carries scope (Person/Team/BU) + the route's job sentence;
the content region holds the collection/list/feed; the drawer holds the stack-navigated record, Inbox
quick triage, or deputy — never competing drawers.

*Operationalises OD-REDESIGN-2/16 / D2/D3a/D3b/D7. Phone collapses header + context row into a compact
sticky bar and the drawer becomes a page stack, but the four roles persist.*

**Pass if:** each of the 4 regions is identifiable on every route, and no route invents a fifth region or
a second drawer host. **Fail if:** a route re-invents its own chrome, nests a physical drawer inside the
record drawer, or omits the context row's job/scope.

## Rule 7 — Verb+object action grammar (no bare `Create`)

Every visible primary action is **verb+object** and names the current job: *"Start today's opening"*,
*"Share Signal"*, *"Add follow-up"*, *"Run check"*, *"Log roast"*, *"Create Task"*, *"Draft Process"*.
A bare **`Create`** is forbidden. The Action Launcher keeps its universal actions stable (Share Signal ·
Ask Deputy/dictate · Create Task · More) plus **at most one** contextual action (OD-REDESIGN-46 / D32);
⌘K, the desktop `+ Create`, the phone `+` FAB, and the deputy all dispatch the same commands.

*Operationalises OD-REDESIGN-21/46 / D10/D32. Fixes the confirmed defect where several Work collections
fall back to a generic `Create`.*

**Pass if:** every primary button, FAB contextual action, and Launcher entry is verb+object and names the
job; the Launcher shows ≤1 contextual action alongside the stable universal set. **Fail if:** any visible
action is a bare `Create`/`Add`/`New`, or the Launcher algorithmically reorders its universal actions.

## Rule 8 — Capture-first disclosure (mobile first)

On phone, **work appears before configuration.** A user opening any collection sees their work items in
the first viewport; the collection picker, saved-view selector, and view-as/presentation controls collapse
behind a **single** control. The composer (Rule: OD-REDESIGN-42 / D28) opens with only *content + owning
Team + occurrence time + author*; category, attention, and mentions are post-capture enrichments on
compact pills. Tap targets ≥44px; dense tables collapse to mobile record lists, never clipped grids.

*Operationalises OD-REDESIGN-42/43/46 / D28/D29/D32 and `PROTOTYPE-BRIEF.md` §8. Fixes the confirmed
defect where mobile Work front-loads three selectors before showing work, and the Signal composer is a
long form.*

**Pass if:** on a ≤390px viewport, the first viewport of every collection shows at least one work item
(not only selectors), all view-configuration controls are behind one affordance, and the Signal composer's
initial fields are exactly the four capture-minimal fields. **Fail if:** any phone screen leads with
configuration, or the composer demands category/attention before it will accept a post.

## Rule 9 — Responsive disclosure order (desktop mirrors mobile in meaning, not in density)

Desktop supports dense review (multi-column tables, board/timeline, inline cell editing, persistent
rail + panel); phone supports fast execution/capture. The **information hierarchy and command meanings stay
identical** across form factors — only density and the disclosure mechanism change. Phone uses bottom
navigation for the most relevant destinations, with remaining destinations and Modules behind a
conventional menu; no desktop rail squeezed into mobile.

*Operationalises OD-REDESIGN-46 / D32, `PROTOTYPE-BRIEF.md` §8, and `docs/jtbd.md` §6 "Responsive access."*

**Pass if:** the same job is completable on phone and desktop with the same action names and the same
reachable records; phone bottom-nav + menu cover every rail entry the viewer is authorised for; inline-edit
commit contract (Enter/Tab/click-outside saves, Escape discards — OD-REDESIGN-22 / D3c) is identical on
both. **Fail if:** a phone user cannot reach an authorised record/action, or copy/action meaning drifts
between form factors, or a desktop rail is horizontally squeezed onto phone.

## Rule 10 — The extension test (a new Module / calendar / record type ships without a new rail root or new anatomy)

A new Module (e.g. a future HR/Procurement Module), a calendar surface, or a new record type ships by
adding **(i) a collection + (ii) a view renderer + (iii) feed posts / activity-thread entries** — reusing
the existing UI families (Rule 2) and the existing page anatomy (Rule 6). It must **not** require a new
rail *root*, a new *destination* job that duplicates an existing one, a new *page anatomy*, or a new
*drawer host*.

*Operationalises OD-REDESIGN-1/15/29 / D1/D9/D16. Modules earn a rail root only via the BU-grouped
workflow-coherence test (D1); until then they live as collections/views inside Work. (Events was
promoted to a rail root by explicit owner directive 2026-07-14 — that is the owner exercising the
amendment path, not a Rule-10 violation; the rule still binds every future addition.)*

**Pass if:** a reviewer can describe how to add "a Standards compliance calendar" or "a future Procurement
Module" using only the three additions above, with no contract change. **Fail if:** adding the surface
forces a new rail root outside the BU-grouped Module rule, a new page anatomy, a second drawer, or a
duplicate destination job — that means **the contract is being violated**, not extended.

---

## How this contract is scored

- Every flow review (S1–S6 in `PROTOTYPE-BRIEF.md`) and every four-lens design review records **pass/fail
  per rule**, citing the screen + viewport. A single **fail** is a blocking defect on par with a
  `docs/jtbd.md` calibration anchor (A1–A14).
- Rules 1, 3, 4, 5, 7, 8 also fix **confirmed defects in the current shell** (single-`#/work` URL;
  co-active `aria-current`; generic `Create`; mobile selector-stacking; long-form composer; 8-collection
  Work rail). Those must visibly pass before owner approval.
- Rules 2, 6, 9, 10 are the **anti-re-invention** guardrails: they exist so the next build round does not
  re-invent the UI grammar — which is the root cause this sprint was opened to fix.
- Pending ratification: Rule 1's Signal-home row and Rule 2's Signal UI-family placement assume **Q1 =
  APPROVE**; Rule 2's "job function" note assumes **Q2 = APPROVE** (see `CONVERGENCE-AUDIT.md`). A "no" on
  either removes only the affected clause; the rest of the contract stands.

## Rule 11 — Component reuse (added 2026-07-14, owner-directed after the mockup lesson)

A builder may **never re-implement a surface or component that already exists** in `mos-app`
**or in a mockup reference**. Extend, re-home, or PORT the existing one. The mockups carry a
**presumption of correctness** (OD-REDESIGN-56): which mockup owns which surface, and the only
explicit overrides, is `docs/design-mockups/redesign-mockups-2026-07/SALVAGE-INVENTORY.md` —
binding read-first for every UI step. The shipped
Tasks DB-view (`TasksWorkspace` / `TaskSurface` / drawer — ADR-0007/0008), the record-panel host,
pickers, and any component under `mos-app/src/components/` are the canonical implementations.

*Why this rule exists: during the mockup phase each iteration re-created components (task table,
⌘K palette) and quality drifted randomly — the owner caught it. In the app, re-implementation is a
review-blocking defect.*

**Pass if:** the diff extends/moves existing components; any new component demonstrably has no
existing counterpart. **Fail if:** a new implementation duplicates an existing surface's job, even
"temporarily".

## Rule 12 — Usable by a high-school graduate with no training (added 2026-07-15, owner-directed)

The bar is **not** "a power user can figure it out" — it is **"a Gordi staff member with a
high-school education and zero training completes the job on the first try, unaided."** Usability and
speed beat model completeness and feature richness (CLAUDE.md charter). This rule is scored by a
**task-based cold-start walkthrough**, not by taste alone.

**Concretely, on every screen:**
- **Plain language, no system vocabulary.** UI never exposes internal object names or jargon a
  barista wouldn't say. "Today's opening checklist," not "Process Run"; "Share an update," not "emit
  a Signal." (Reinforces OD-58, Rule 7.)
- **The primary action is obvious without instruction** — one clear next step per screen, not a wall
  of equal-weight options.
- **Recognition over recall** — labels + icons the user recognizes; never require memorizing codes,
  paths, or which internal collection holds their work.
- **No configuration before the goal** — the user sees their work/does the job first; setup and
  options are optional and secondary (Rule 8 capture-first).
- **Helper text compensates for nothing** — if a screen needs a paragraph explaining what an object
  is, the entry point is wrong. Fix the entry point, don't add prose.

**Pass if:** in a cold-start walkthrough of the step's job (as the least technical persona — a Café
barista/member, not an admin), the user (a) identifies the starting point unaided, (b) completes the
job, (c) hits no unexplained noun, (d) always sees an obvious next action, in a reasonable step count
with no backtracking. **Fail if:** any of those breaks — measured, recorded in the ledger, not vibed.

*Oracle: `docs/jtbd.md` (the job each screen must serve) + `docs/reference/twenty-ixd-patterns.md`
(the "ruthless reuse → familiar grammar" target). Reusable grammar IS an ease-of-use lever: a user
who learns one screen already knows the next.*
