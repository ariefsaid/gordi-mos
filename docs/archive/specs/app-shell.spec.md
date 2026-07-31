# Feature: App shell — rail, header, routes, My Week empty home (P1-4)

## Overview

The persistent application shell for Gordi MOS: 224px left rail (My Week · Tasks · Updates · Ops ·
Settings stub), 56px header (breadcrumb + user chip with sign-out menu), and four deep-linkable
section routes — each rendering an honest empty/placeholder page shell. The My Week home renders the
full OD-P0-8 structure (urgency-grouped task-table frame, two strips, role-conditional manager team
module) with EMPTY data; real data features are Phase 2. Design authority: the signed
`docs/design-mockups/proposal-IA-8-balanced-myweek.html` (OD-P0-6) + `DESIGN.md` incl. the MOS
density mode (OD-P0-7). Chrome is English (OD-P0-2); desktop-first, mobile-usable (OD-P0-3).
Builds on P1-3 auth: `AuthProvider` exposes `viewer{person, roles, isManager}` and `signOut`;
routes live under the existing `ProtectedRoute` guard with `basename: '/mos'` (OD-P0-5).

## Functional Requirements

### Rail

**FR-001 — Persistent rail.** While a viewer is authenticated, the system shall render a persistent
left rail of width `--rail-w` (224px) containing a brand block — 28px primary logo square ("G"),
name **"Gordi MOS"**, overline subtitle **"MANAGEMENT OS"** (OD-P0-4) — above the primary nav.

**FR-002 — Primary nav.** The rail shall present exactly four primary nav items, in order:
**My Week** (`/`) · **Tasks** (`/tasks`) · **Updates** (`/updates`) · **Ops** (`/ops`), each an
icon + label link (mockup icon set), with **no badge counts** (OD-P0-7 density mode).

**FR-003 — Active nav state.** While a section route is current, the system shall style its nav
item active (primary/10% bg + primary text + 600 weight) and set `aria-current="page"` on it, and
on no other item.

**FR-004 — Settings stub.** The rail shall pin a **Settings** item in the rail foot (border-top),
rendered **visible but disabled** — non-navigating, `aria-disabled="true"`, disabled affordance per
DESIGN.md proposed disabled treatment, with `title="Settings — coming soon"`.
`[OWNER-DECISION: AS-1]` default = visible-but-disabled; alternative = hide entirely until a
Settings surface exists. Build proceeds on the default.

### Header

**FR-005 — Header bar.** While a viewer is authenticated, the system shall render a 56px
(`--header-h`) header containing a breadcrumb **"Gordi MOS › \<section\>"** — the current section
label bold/foreground, the "Gordi MOS" segment muted — that follows the current route
(My Week / Tasks / Updates / Ops).

**FR-006 — User chip + menu.** The header shall show a user chip — initials avatar (blue→violet
gradient), the viewer's `full_name`, and their primary role title (FR-007) — that opens a popover
menu containing **Sign out**, which invokes the auth context `signOut` (preserving auth FR-012
sign-out + back-guard behavior).

**FR-007 — Primary role title.** The chip's role line shall show the name of the viewer's
earliest-assigned held role (`person_roles.created_at` ascending); IF the viewer holds no roles,
THEN the chip shall show the name only (no empty role line). `[OWNER-DECISION: AS-2]` default =
earliest-assigned role; alternative = topmost role in the reporting chain.

### Routes & page shells

**FR-008 — Section routes.** The system shall serve `/` (My Week), `/tasks` (Tasks), `/updates`
(Updates), and `/ops` (Ops) inside the shell layout under the existing `ProtectedRoute` guard, each
**deep-linkable** (direct URL load renders that section with correct breadcrumb, title, and active
nav).

**FR-009 — Guarded sections.** When an unauthenticated user navigates to any section route, the
system shall redirect to `/mos/login` (extends auth FR-010 to the three new routes).

**FR-010 — Document title.** When a section route renders, the system shall set `document.title`
to **"\<Section\> — Gordi MOS"** (e.g. "My Week — Gordi MOS", "Tasks — Gordi MOS").

**FR-011 — Empty page shells.** The Tasks, Updates, and Ops routes shall each render a page shell —
page title + honest empty state (headline + muted explainer, product voice, no roadmap/phase talk):
- **Tasks:** "No tasks yet." / "Tasks you're Responsible or Accountable for will show up here."
- **Updates:** "No weekly updates yet." / "Weekly updates from you and your team will show up here."
- **Ops:** "No ops events yet." / "Events from the floor will show up here as they're logged."

**FR-012 — Unknown route.** When an authenticated user loads an unknown path under `/mos`, the
system shall render a minimal "Page not found." shell page with a link back to My Week.

### My Week home (empty OD-P0-8 structure)

**FR-013 — Page head.** The My Week route shall render page title **"My Week"** with the subtitle
"Week of \<D–D Mon YYYY\> · \<Day D Mon\> · what needs you, your update, and today on the floor",
where the week range is the current Monday–Sunday week and the day is today, both computed in
Asia/Jakarta (OD-P1-4).

**FR-014 — Task-table frame, empty.** The My Week route shall render the dominant task-table card
(OD-P0-8): card head ("My tasks" · "Where you're Responsible or Accountable · off track first" ·
"All tasks →" link to `/tasks`) and the 5 overline column headers (Task · Status · Owner · Due ·
Activity); while no task data exists, the body shall be a single centered empty row — **"No tasks
where you're R or A this week — you're clear."** (mockup-canonical empty copy) — with no group
headers rendered.

**FR-015 — Weekly-update strip, empty.** The My Week route shall render the weekly-update strip
with neutral empty content — neutral pill + **"No weekly update for this week yet."** (muted
explainer "Due \<Fri D Mon\>", WIB) — and a "Open Updates →" link to `/updates`. No "N of M filed"
copy and no CTA button in the empty shell.

**FR-016 — Ops strip, empty.** The My Week route shall render the ops strip with neutral empty
content — **"No ops events logged today."** — and a "Today on Ops →" link to `/ops`. No needs-me
amber state while no data exists (OD-P0-8 strip kept as count + needs-me when data arrives).

**FR-017 — Manager team module.** Where `viewer.isManager` is true (the real auth-context flag,
auth FR-015 / OD-P1-7), the My Week route shall render — after the strips — the overline label
**"Your team — Week of \<D–D Mon\>"** and the team card containing a single calm empty row
**"Nothing from your team yet."**; while `viewer.isManager` is false, the system shall render no
team module DOM at all (OD-P0-8 role-conditional exception).

### Responsive

**FR-018 — Rail drawer below 920px.** While the viewport is narrower than 920px (DESIGN.md
§Navigation Mobile — the PMO rail-collapse breakpoint; 768px remains the separate DataTable-reflow
breakpoint and is not the rail's), the system shall hide the persistent rail and show a hamburger
button at the header's left; when activated, the system shall open the rail content as a modal
drawer over a scrim. (OD-P0-3 mobile-usable.)

**FR-019 — Drawer behavior.** While the drawer is open: focus shall be trapped inside it, `Esc` and
scrim-click shall close it returning focus to the hamburger, and choosing a nav item shall navigate
and close it. The drawer shall carry `role="dialog"` + `aria-modal="true"` + an accessible name.

**FR-020 — Compact header.** While the viewport is narrower than 920px, the user chip shall show
the avatar only (name/role hidden per DESIGN.md mobile rule); the menu (FR-006) stays reachable.

## Non-Functional Requirements

**NFR-001 — Tokens only.** All shell styling uses `DESIGN.md` tokens and named rules (One Blue,
Flat-By-Default, Single-Border, Tinted-Status, Tabular-Numbers) plus the OD-P0-7 density-mode
composition (single ~1080px column on My Week). No new hues, fonts, radii, or border colors.
`--rail-w: 224px`, `--header-h: 56px` defined as CSS vars.

**NFR-002 — No new dependencies; inline SVG icons.** Nav/UI icons are inline SVG lifted from the
signed mockup (stroke-2, 18px) — **no icon library** and no other new runtime dependency. (Flagged
choice: inline SVG over `lucide-react`; 5 icons don't justify a dep. Revisit only if Phase-2
surfaces need a broad icon set.)

**NFR-003 — WCAG-AA.** Landmarks: rail nav as `<nav aria-label="Primary">`, header as `<header>`,
page content as `<main>`. Icons `aria-hidden` with text labels carrying meaning. Global
`:focus-visible` ring on every focusable. Contrast via DESIGN.md AA-darkened tokens. Drawer focus
management per FR-019.

**NFR-004 — Auth suite stays green.** Existing P1-3 unit + pgTAP tests pass unchanged. The auth
e2e journeys (AC-001/002/004) keep their goal-oracles; only their *steps* may be updated for the
deliberate UX change that sign-out now lives in the user-chip menu (BDD authoring rule).

**NFR-005 — EN chrome.** All shell labels, empty-state copy, titles, and menu items are English
(OD-P0-2); date formatting in the en locale.

## Acceptance Criteria

Owning layer named per AC (test pyramid; AC id tagged in the owning test's title).

### E2E (Playwright — 1 curated journey)

**AC-001 — Authenticated cross-section navigation journey** *(e2e)*
Given a provisioned signed-in viewer on My Week,
When they navigate via the rail to Tasks, then Updates, then Ops, and finally reload the browser on
`/mos/updates`,
Then at each section the URL path, `document.title` ("\<Section\> — Gordi MOS"), breadcrumb
("Gordi MOS › \<Section\>"), and `aria-current="page"` nav item all match that section, each page
shell shows its empty-state headline, and the reload lands back on Updates with the same three
signals intact (FR-002/003/005/008/010/011).

### Unit (Vitest/RTL, mocked auth context + router)

**AC-002 — Rail contents** *(unit)*
Given an authenticated shell render,
When the rail is inspected,
Then it shows the brand block ("Gordi MOS" + "MANAGEMENT OS"), exactly the four nav items
My Week/Tasks/Updates/Ops in order with no badge-count elements, and a Settings item in the rail
foot that is `aria-disabled`, does not navigate on click, and carries the coming-soon title
(FR-001/002/004, OD-P0-7).

**AC-003 — Active nav per route** *(unit)*
Given the shell rendered at each of `/`, `/tasks`, `/updates`, `/ops`,
When the nav is inspected,
Then exactly the matching item has the active treatment and `aria-current="page"` (FR-003).

**AC-004 — Breadcrumb and document title per route** *(unit)*
Given the shell rendered at each section route,
When header and `document.title` are inspected,
Then the breadcrumb reads "Gordi MOS › \<Section\>" with the section segment emphasized and
`document.title` is "\<Section\> — Gordi MOS" (FR-005/010).

**AC-005 — User chip and sign-out menu** *(unit)*
Given a viewer with full name "Dina Pratiwi" and a held role "Kitchen Lead",
When the header renders and the chip is activated by keyboard,
Then the chip shows initials "DP", the name, and "Kitchen Lead"; the menu opens with a Sign out
item; `Esc` closes it returning focus to the chip; and choosing Sign out calls the auth context
`signOut` exactly once (FR-006).

**AC-006 — Role-title rule** *(unit)*
Given (a) a viewer with two held roles where role X was assigned earliest, and (b) a viewer with
zero roles,
When the chip renders,
Then it shows role X's name in case (a) and no role line in case (b) (FR-007).

**AC-007 — Section empty shells** *(unit)*
Given the shell rendered at `/tasks`, `/updates`, and `/ops`,
When each page body is inspected,
Then each shows its page title and its exact FR-011 empty headline + muted explainer, and no
phase/roadmap wording appears (FR-011, NFR-005).

**AC-008 — Guard on new routes** *(unit)*
Given an unauthenticated state,
When `/tasks`, `/updates`, and `/ops` each render under the router,
Then each redirects to the login route and renders no shell content (FR-009).

**AC-009 — Unknown route** *(unit)*
Given an authenticated viewer,
When an unknown path renders,
Then a "Page not found." page shows inside the shell with a working link to `/` (FR-012).

**AC-010 — My Week head with WIB week math** *(unit, clock-mocked)*
Given the clock fixed to a known instant whose Asia/Jakarta date is mid-week (and a second instant
that crosses the Monday boundary in WIB but not UTC),
When My Week renders,
Then the subtitle shows the correct Monday–Sunday range and today for each instant per WIB, not the
runner's timezone (FR-013, OD-P1-4).

**AC-011 — Empty task-table frame** *(unit)*
Given My Week rendered with no task data,
When the dominant card is inspected,
Then the card head shows "My tasks", the R-or-A subtitle, and an "All tasks →" link targeting
`/tasks`; the five column headers render; the body is the single "No tasks where you're R or A this
week — you're clear." row; and no urgency group headers exist (FR-014).

**AC-012 — Empty strips link to their surfaces** *(unit)*
Given My Week rendered with no data,
When the strips are inspected,
Then the update strip shows "No weekly update for this week yet." with the WIB Friday due date and
links to `/updates`, and the ops strip shows "No ops events logged today." and links to `/ops`,
with no amber/needs-me state present (FR-015/016).

**AC-013 — Team module is manager-conditional** *(unit)*
Given (a) auth context with `viewer.isManager === true` and (b) `false`,
When My Week renders,
Then case (a) shows the "Your team — Week of …" overline and the "Nothing from your team yet."
empty row after the strips, and case (b) contains no team-module DOM at all (FR-017, OD-P0-8).

**AC-014 — Mobile drawer** *(unit, viewport <920px)*
Given the shell at a narrow viewport,
When rendered, the rail is hidden and a hamburger shows; when the hamburger is activated, a
`role="dialog"` `aria-modal` drawer opens containing the nav; `Tab` cycles only within it; `Esc`
closes it and focus returns to the hamburger; and activating "Tasks" navigates to `/tasks` and
closes the drawer (FR-018/019).

**AC-015 — Landmarks and icon semantics** *(unit)*
Given the authenticated shell,
When queried by accessible role,
Then exactly one `navigation` landmark named "Primary", one `banner`, and one `main` exist, and
every nav SVG icon is `aria-hidden` (NFR-003).

## Error Handling

| Condition | Surface | Behavior / user message (EN chrome) |
|---|---|---|
| Unknown path under `/mos` (authenticated) | shell page | "Page not found." + "Back to My Week" link (FR-012) |
| Viewer holds zero roles | user chip | Name renders alone; no blank role line (FR-007) |
| `signOut` network failure | user menu | Supabase clears the local session regardless; guard redirect to `/mos/login` proceeds (auth FR-012 posture) |
| Unauthenticated deep link to a section | router | Redirect to `/mos/login`; no shell flash (FR-009, auth FR-013) |

## Implementation TODO

- [ ] `AppShell` layout (rail + header + `<Outlet/>`); `--rail-w`/`--header-h` vars; tokens only (FR-001..006, NFR-001)
- [ ] Inline SVG icon components from the mockup set (NFR-002)
- [ ] Router: shell layout route wrapping `/`, `/tasks`, `/updates`, `/ops` under `ProtectedRoute`; catch-all not-found (FR-008/009/012)
- [ ] Per-route breadcrumb + `document.title` mechanism (FR-005/010)
- [ ] User chip + accessible menu wired to `useAuth().signOut`; role-title rule (FR-006/007)
- [ ] Section page shells with FR-011 empty copy
- [ ] My Week: WIB week/date helper (pure, AC-010) + page head; empty table frame; two strips; manager-conditional team module (FR-013..017)
- [ ] <920px drawer with focus trap/Esc/scrim; compact chip (FR-018..020)
- [ ] Update auth e2e AC-002 *steps* for chip-menu sign-out; keep goal-oracle (NFR-004)
- [ ] Tests per AC ownership above (1 e2e, 14 unit)

## Out of Scope

- Any real data: tasks, urgency groups, update filed-status, ops counts, team rows (Phase 2)
- Notification bell + dot (in mockup header; no notifications exist yet — add with its feature)
- ⌘K / search, Settings surface, profile editing
- Loading skeletons and per-surface error/retry states for data modules (specified in the mockup's
  STATE notes; owned by the Phase-2 data features that introduce fetching)
- DataTable 768px card-list reflow (applies to real table rows — Phase 2; the empty row renders
  fine at all widths)
- RACI chip color sign-off (mockup open question 5 — task-detail surface, Phase 2)

## Open Questions

- `[OWNER-DECISION: AS-1]` Settings stub: visible-but-disabled with "coming soon" title (**default,
  build proceeds**) vs hidden until real.
- `[OWNER-DECISION: AS-2]` Primary role title on the user chip for multi-role people:
  earliest-assigned held role (**default, build proceeds**) vs topmost role in the reporting chain.
- Resolved here without owner input: rail-collapse breakpoint = **920px** per DESIGN.md
  §Navigation Mobile (issue brief said "<768px"; 768px is the separate DataTable-reflow breakpoint
  — DESIGN.md is the identity authority, FR-018).
