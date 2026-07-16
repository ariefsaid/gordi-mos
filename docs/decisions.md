# Owner Decisions Log — Gordi MOS

Durable record of resolved `[OWNER-DECISION]` (OD) items — the business-rule and direction answers
that unblock work. Each entry is locked by the owner in conversation, recorded here, then consumed by
the feature's spec at build time. This file is the source of truth for "what did the owner decide and
why"; per-feature specs cite it. THE WALL section of `docs/backlog.md` tracks which OD items remain open.

---

## OD-DIR — Direction (LOCKED 2026-06-10, from the planning discussion → `docs/project-brief.md`)

### OD-DIR-1 — Separate repo
MOS lives at `~/Coding/gordi-mos`, NOT inside PMO. PMO is a reference architecture, not the container.

### OD-DIR-2 — Production URL
`https://ops.gordi.id/mos` (path-based sibling of `/kitchen`, future `/roastery`).

### OD-DIR-3 — One self-hosted Supabase, schema-separated
One Supabase stack for MOS + future Gordi ops apps. Domain separation via Postgres schemas
(`shared` / `mos` / `ops` / `integrations`) + RLS + `org_id` + app/workspace fields — NOT separate
Supabase projects.

> **AMENDED 2026-06-19 (OD-P4-2, ADR-0010 D5): schema canon 4 → 5.** A fifth schema **`reporting`**
> is added — a curated ESB **financial read-model**, copied into Supabase by a scheduled snapshot job
> (warehouse → Supabase, NOT read-through), RLS-gated to the `finance` + `admin` access roles only
> (ADR-0011 D5), exposed to PostgREST via the ADR-0004/0006 mechanism. Canon is now
> `shared` / `mos` / `ops` / `integrations` / `reporting`. See OD-P4-2.

### OD-DIR-4 — Auth
Supabase Auth is the shared identity layer. Cloudflare Access is NOT the long-term MOS auth model
(50-user free-tier cap); CF Access may remain where already useful.

> **REINFORCED 2026-06-19 (ADR-0011 D1):** one auth model — Supabase Auth + RLS — now governs
> **everything**, including kitchen capture + review (was CF-Access-gated / public). CF Access stops
> being an app gate; it may remain only as infra-level Cloudflare Tunnel protection. See OD-P4-3.

### OD-DIR-5 — Lightweight RACI v1
RACI = fields on tasks (`responsible_person_id`, `accountable_person_id`, `consulted_person_ids`,
`informed_person_ids`), visible + filterable on lists and detail. NO matrix UI until usage shows the shape.

### OD-DIR-6 — Kitchen stays put
Kitchen app keeps running unchanged. Near-term: mirror approved kitchen activity into `ops` as daily
updates. Migration/cockpit ideas deferred until MOS first slice is stable.

> **SUPERSEDED 2026-06-19 by OD-P4-1 (ADR-0010 D10 + ADR-0012).** Kitchen now **migrates into MOS as
> its first ops Module before user rollout** — driven by RAM (retiring Teable frees ~2 GB on the single
> `ris-dev` box, the headroom the warehouse needs) and by the reframing of kitchen as a **MOS Module,
> not a separate app to rewrite**. The mirror-into-`ops` idea survives as the Daily Log summary-row seam
> (ADR-0012 D3), but "kitchen stays put / migration deferred" no longer holds. See OD-P4-1.

### OD-DIR-7 — First-slice scope
Task ownership + lightweight RACI + weekly updates + daily ops updates. Non-goals: Notion visual
clone, full RACI matrix, OKR cascade, kitchen rewrite.

### OD-DIR-8 — Design system adopted from PMO
`DESIGN.md` copied from PMO (2026-06-10) is MOS's identity authority; divergence only via
owner-approved additions. (Resolves the brief's "copy vs reference DESIGN.md" open question: COPIED.)

### OD-DIR-9 — Phase 0 is mockup-first
Static HTML mockups (IA proposals + first-slice key screens) in `docs/design-mockups/` gate all
scaffold/spec/build work. Owner picks before any app code. (LOCKED 2026-06-10, this session.)

---

## OD-P0 — Phase-0 intake (LOCKED 2026-06-10, this session)

### OD-P0-1 — Weekly updates are per person
Every manager + selected ops user files one weekly update; managers review their people's.
(Unit-level rollups deferred until usage shows the shape.)

### OD-P0-2 — Language: EN chrome, ID content
English labels/nav/buttons (matches PMO/kitchen conventions, no i18n work); people write update
content in Indonesian naturally. Mockups use realistic Indonesian update text under English chrome.

### OD-P0-3 — Desktop-first, mobile-usable
Managers' weekly/daily review surfaces are desktop-first; ops daily-update submission must work
well on a phone. One responsive surface, not two optimized apps.

### OD-P0-4 — App name: "Gordi MOS" (closes WALL-2)
Shell label **Gordi MOS**; "Management OS" as the login subtitle. People will say "MOS".

### OD-P0-5 — URL stays `/mos`; root redirects
OD-DIR-2 confirmed. `ops.gordi.id/` gets a Caddy redirect → `/mos` until a launcher page is worth
building; MOS is NOT root-mounted (preserves the path-based umbrella for /kitchen, /roastery, …).

### OD-P0-6 — IA pick: balanced "My Week" home (closes WALL-1)
`docs/design-mockups/proposal-IA-8-balanced-myweek.html` is the adopted IA: left rail (My Week ·
Tasks · Updates · Ops), personal "My Week" home with one dominant urgency-grouped task table +
≤2 one-line strips (weekly update, ops summary). Chosen over IA-1..7 and IA-9 after two density
redline rounds (IA-1..5 too dense, IA-6/7 too sparse). The home's exact information content is a
follow-up decision (OD-P0-8 pending); the structure is locked.

### OD-P0-7 — "MOS density mode" ratified into DESIGN.md
The mid-density calibration is a binding DESIGN.md amendment (composition only — hues/type/radii
unchanged): single ~1080px primary column, one dominant grouped table (44–48px rows, quiet overline
group headers), ≤2 auxiliary strips, progressive disclosure for RACI/meta (R-avatar + "+N" on rows;
full R/A/C/I on detail), due-date coloring overdue/≤3d only. PMO's dense DataTable posture stays for
full list surfaces (Tasks, Updates, Ops).

### OD-P0-8 — My Week home information inventory (LOCKED 2026-06-10)
- **Task scope:** tasks where the viewer is **R or A**.
- **Row fields:** title + business-unit subline · status pill · owner (R-avatar + name + "+N") ·
  due date · **last-activity age** (muted, e.g. "3h" / "4d").
- **Manager view:** users with direct reports get a **third role-conditional module** — a compact
  team list (each person: filed-status for the week + overdue-task count). Ratified exception to
  the ≤2-module budget (DESIGN.md density mode updated).
- **Ops strip:** event count + needs-me flag (amber when something waits on the viewer); no event
  preview text.

### OD-P0-9 — Open questions resolved by inference from the Notion Management OS schema
(Owner-directed 2026-06-10: "infer from the notion previous database setup". Source:
wiki "Notion Management OS" + `sources/260420-notion-management-os-schema.md`.)

- **(a) Reporting line is ROLE-based, not person-based.** Notion modeled it as
  `Roles.Reports to / Subordinate` (self-relation) with People→Role; a person's team was derived
  via the role chain ("Role Supervised", "# Subordinate" rollups). MOS mirrors it:
  `shared.roles.reports_to_role_id`; `shared.people.role_id`; a manager's team = holders of roles
  reporting to their role. (Phase 1.2 schema already plans people/roles/business-units — same shape.)
- **(b) Activity age = last any-write.** Notion leaned on `Last edited time` (any property write).
  MOS: `mos.tasks.last_activity_at` touched by status change, comment, field/RACI edit — one
  canonical timestamp for home/list/detail.
- **(c) Team-module row → that person's weekly update;** their overdue count → their filtered task
  list. (Heritage: Notion People rows were per-person dashboards — update stream + task stats. A
  full person page is the post-MVP descendant; not first slice.)
- **(d) RACI v1 maps onto the old Tasks fields.** Notion Tasks carried exactly two person
  relations: `Assigned to` (→ R) and `Supervisor` (→ A). RACI-as-fields is therefore the familiar
  model with C/I added — validates OD-DIR-5. Chip colors stay the working default (R=primary,
  A=violet, C/I=neutral) — pure-UI call, nothing to inherit.

**Context notes (for Phase-2 specs, not binding now):**
- Old `Project Updates` were **project-keyed** (+ Updated By + Week Ending). OD-P0-1 (person-keyed)
  stands as the deliberate change; per-task references inside a person's update bridge the two.
- Old task status vocabulary — [Not started, Doing, In Progress, Waiting Internal, Waiting External,
  Waiting Approval, Postponed, Done, Cancelled] — input for the P2-1 status-enum decision
  (mock's Open/In Progress/Blocked/Done is the simplified working set; "Blocked" ≈ the Waiting-*
  family).

---

## OD-P1 — Supabase foundation (LOCKED 2026-06-11, grill-with-docs session #1)

### OD-P1-1 — Org seam: orgs table + JWT-claim default
`shared.orgs` seeded with one row (Gordi). `org_id` NOT NULL + FK on every business table, stamped
server-side from the session's JWT claim — client-unspoofable (PMO pattern). Multi-org later = add rows.

### OD-P1-2 — Person-first auth link
`shared.people` exists independently of login; optional unique `user_id` → `auth.users`, filled when
someone is provisioned. People are RACI-referenceable before they can log in.

### OD-P1-3 — Day-one read posture: FIXED targeted matrix (not an engine)
Three hardcoded RLS rule-sets, each provable in pgTAP:
- **Tasks: org-readable** (cross-unit visibility is the product); writes gated by R/A/manager.
- **Weekly updates: upward-only** — author + their manager chain (union over all held roles) + CEO.
- **Ops events: org-readable**; writes = mirror service + unit members' manual adds.
A configurable role→permission ENGINE is explicitly post-MVP. (Grill sharpened the owner's initial
"role-matrix from day one" to exactly this.)

### OD-P1-4 — Time: Asia/Jakarta, Mon–Sun week
Store UTC timestamptz; business day/week boundaries computed in WIB. Weekly update due Fri 17:00 WIB.

### OD-P1-5 — Real business units (5)
Cafe Ops – General · Kitchen and Bar · Roastery · Sales – CRM · Finance and People.
(Mockup canon stays fictional dev data.)

### OD-P1-6 — Seed privacy (repo is public)
Committed seed = structure (units, role tree) + fictional dev people for local/test. Real
names/emails enter ONLY via an uncommitted, gitignored deploy-time seed.

### OD-P1-7 — Multi-role people; union manager chain
`person_roles` junction (a person may hold several roles). Manager relationships are the UNION over
all held roles: dual-hats appear in all their managers' team modules; any of those managers reviews
their single weekly update.

### OD-P1-8 — Login: password + magic link ("Both")
Supabase Auth email+password AND magic-link sign-in are both offered on the one login screen.
Password reset via email. (LOCKED 2026-06-11.)

### OD-P1-9 — Provisioning: admin-invite only
No self-registration (`enable_signup` off in prod per audit L5). Admin creates the person in the
directory and triggers a Supabase invite email; v1 invite mechanics may be CLI/dashboard — an
admin UI is post-MVP.

### OD-P1-10 — Orphan login fails closed
Authenticated user with no linked `shared.people` row sees a blocked screen ("account not set up —
contact Arief"); no auto-created directory rows (consistent with closing audit M1's pre-claim seam).

## OD-P2-OPS — Ops Log (daily ops, P2-3) — LOCKED 2026-06-12, schema-confirmed with owner

> **SUPERSEDED 2026-07-10 by OD-REDESIGN-33 / ADR-0025 D20.** Retained as shipped implementation
> history; Signal replaces this entity/feed in the clean redesign baseline.

Feature P2-3, the `ops.log_entries` entity (generic typed log, manual entry; kitchen/roastery mirror
deferred to P2-4). Anchored to mock-daily-ops-feed.html, OD-P0-8 (My Week ops strip), OD-P1-3 (read),
WALL-4 (generic, low-stakes until an external writer exists).

### OD-P2-15 — Naming: "Log entry" / "Daily Log" (NOT "event"; renamed from "Ops Log" 2026-06-12)
The row is a **Log entry**; the user-facing surface is the **Daily Log** (`/ops`). "Event" is avoided —
it collides with Gordi's cafe events (cuppings, workshops, bookings). **Owner rename 2026-06-12:** the
surface label "Ops Log" → **"Daily Log"** across all user-facing chrome (rail, breadcrumb, H1, document
title, aria-labels, copy). The internal seams are unchanged and stay terse-internal: schema `ops`,
route `/ops`, table `ops.log_entries`, data module `opsLog` (OD-DIR-3 — internal, not user-facing).

### OD-P2-16 — A Log entry is a past-tense FLOOR RECORD, distinct from a Task
A record that something happened: no owner/RACI/status (it's done), just `occurred_at`. High-frequency
floor visibility, vs Tasks = the few deliberate forward commitments. They touch only at the
`needs_attention` + `linked_task_id` follow-up seam. (Separate table, separate concept — see CONTEXT.md.)

### OD-P2-17 — Source = business_unit + origin marker
`business_unit_id` carries the badge (Kitchen and Bar / Roastery / …); a separate `origin` text+CHECK
(`manual` | `kitchen_app` | `roastery_app`, default `manual`) marks who wrote it. P2-3 = all `manual`;
future mirrors set `origin` with no schema change.

### OD-P2-18 — Typed + needs-attention + optional task link
`event_type` text+CHECK (`production`|`receiving`|`qc`|`follow_up`|`other`, default `other`, extensible).
`needs_attention` boolean (author-set, drives the My Week ops-strip amber). `linked_task_id` nullable
FK → `mos.tasks` (the "follow-up about that blocked task" thread; name resolved client-side, no
cross-schema embed). `occurred_at` timestamptz default now, **editable** (log a 9am happening at noon).

### OD-P2-19 — Lifecycle + RLS: edit-own + soft-archive; org-read, any-member manual-add
Edit-own (author or manager-of-author, reuse `is_manager_of`/the can_edit_task pattern); **soft-archive**
via `archived_at` (reversible, hidden from feed); **no hard delete**. RLS: **org-readable** (floor
visibility, OD-P1-3 — contrast weekly-updates' upward-only); **insert** by any org member (org_id +
created_by stamped server-side); edit/archive gated to author-or-manager; cross-org blocked.

---

## OD-P2-WU — Weekly updates (LOCKED 2026-06-11, grill-with-docs session #3)

> **SUPERSEDED 2026-07-10 by OD-REDESIGN-33 / ADR-0025 D20.** Retained as implementation history only;
> the clean redesign baseline removes mandatory Weekly Updates in favor of generated summaries over
> real work and Signals.

Feature P2-2, the `mos.weekly_updates` entity. Anchored to mock-weekly-update.html, OD-P0-1
(per-person), OD-P0-9 (person-keyed change from Notion project-keyed), OD-P1-3 (upward-only read) /
OD-P1-4 (Mon–Sun WIB week) / OD-P1-7 (union manager chain).

### OD-P2-10 — Content: summary text + free-text update lines (no task FK)
A weekly update has a free-text `summary` plus a list of **update lines** (a `mos.weekly_update_items`
child table). Each line = free text + a **progress marker** (Done / In progress / Blocked) for the
"what we've achieved" visual cue. Lines are NOT foreign-keyed to `mos.tasks` — deliberate: a weekly
recap is narrative + self-reported progress, not task-tracking; speed over linkage. (The task↔update
bridge can be added later as an additive nullable FK if usage demands, like ADR-0003's task cascade seam.)

### OD-P2-11 — Lifecycle: Draft → Submitted (Submit locks; Reopen to revise)
`status` is **draft | submitted**. Submit makes the update read-only (the stable artifact the manager
reviews). The author may **Reopen** → draft → edit → re-Submit. No hard immutability (a typo is fixable).

### OD-P2-12 — Manager review is READ-ONLY (v1)
A manager reads their reports' updates (upward-only per OD-P1-3: author + anyone up the manager chain).
No acknowledgement, no comment captured in v1. Managers are themselves authors — they file their own
update upward. (Acknowledge / comment can come later, like task comments deferred from P2-1.)

### OD-P2-13 — Week key: (person, week_start Monday WIB); one per person per week
Keyed by `week_start` = that week's Monday in Asia/Jakarta (OD-P1-4; reuse src/lib/week.ts).
`UNIQUE(org_id, person_id, week_start)` — exactly one weekly update per person per week.

### OD-P2-14 — Everyone files; late filing allowed; reminders deferred
Every person files their own update, including top-of-chain (who has no reviewer — files for
self-cadence/visibility). Late filing is allowed and weeks never hard-lock; the Friday due drives only
an **on-time vs late SIGNAL** (filed/draft/not-started shown in the manager review pane + the My Week
strip). Email/push **reminders are deferred** to a later notification issue — no SMTP dependency in P2-2.

---

## OD-P2 — Tasks + lightweight RACI (LOCKED 2026-06-11, grill-with-docs session #2)

> **Partially superseded by OD-REDESIGN-3 (2026-07-10).** The shipped database/RLS still uses legacy
> responsible/accountable columns, so the historical storage and permission decisions below remain
> evidence until a reversible compatibility migration is planned. Future product language, specs, and
> APIs use canonical **PIC + Supervisor**; Tasks have no C/I; RACI is reserved for Objective/Project/Process.

Feature: P2-1, the core `mos.tasks` entity. Anchored to the IA-8 task-list + task-detail mockups,
OD-DIR-5 (RACI as fields), OD-P0-8/9, OD-P1-3 (read posture) / OD-P1-7 (union manager chain).

### OD-P2-1 — Status: lean 4 as text + CHECK
`status` is **Open · In Progress · Blocked · Done**, stored as `text` + a `CHECK` constraint (not a
PG enum) so the allowed set is cheap to add/rename/remove later. Default `Open`. "Cancelled / decided
not to do" = archive, not a status. "Blocked" subsumes Notion's Waiting-Internal/External/Approval.

### OD-P2-2 — Create: any member; creator auto-fills R+A; required = Title + BU
Any org member creates a task (flat, Notion-like). On create, **both** `responsible_person_id` and
`accountable_person_id` default to the creator (both editable on the form). Required to create:
**Title + Business Unit**. BU defaults to the creator's **primary role's** business unit (earliest-
assigned role, the AS-2 rule; dual-hats get a deterministic default, editable). Due date, description,
C/I, checklist all optional.

### OD-P2-3 — Edit gated to R/A/manager; soft-archive to A/manager; no hard delete
**Edit** (fields/status/RACI) allowed for: R, A, or a manager-of-(R or A) via the union chain
(OD-P1-7). **Archive** (`archived_at`, reversible, no reason required): A or a manager only. **No one
hard-deletes** a task. All provable in pgTAP.

### OD-P2-4 — A may equal R
No separation-of-duties constraint: the Accountable person may also be the Responsible person (common
for solo work, e.g. the mockup's roasting-calibration task R=Raka A=Raka).

### OD-P2-5 — C/I as uuid[] arrays
`consulted_person_ids uuid[]` and `informed_person_ids uuid[]` are array columns on the task (matches
OD-DIR-5 wording). "Tasks I'm C/I on" = array-contains. R and A stay single FK columns.

### OD-P2-6 — Due date is a plain DATE; overdue computed in WIB
`due_date date` (no time-of-day). Overdue = `due_date < (today in Asia/Jakarta)`. ≤3 days = soon
(amber). Consistent with OD-P1-4 week semantics; matches the mockup's date-only display.

### OD-P2-7 — Subtasks are lightweight checklist items (NOT nested tasks)
A subtask = a `mos.task_checklist_items` row (`task_id`, `label`, `is_done`, `position`, timestamps) —
no RACI/status/BU/due of its own, does not bridge into the cascade. There is **no** `parent_task_id`
self-relation on tasks. Checklist items archive trivially with their task (no cascade-archive question).

### OD-P2-8 — Activity: change-events in P2-1; comments deferred to P2-1b
P2-1 logs **auto change-events** (status change, RACI/field edits) to a task activity log that drives
`last_activity_at` (OD-P0-9b). Free-text **comments** are a tight fast-follow issue (P2-1b), same
detail page — not in this slice.

### OD-P2-9 — Task is the cascade-bridgeable unit; upward link deferred (ADR-0003)
The Task is the unit that will later contribute UP to an Output/Objective. That bridge is an
**additive nullable FK** added to `mos.tasks` when the higher-cascade tables ship — it is NOT built
now, and the higher layers stay deferred (OD-DIR-7 upheld). Forward-migration path fixed in ADR-0003
so the cascade grows in without reshaping the task. (Grill reconciled an in-session tension: subtasks
landed as checklist items, so cascade bridging lives at the task, not a nested-task tree.)

---

### OD-P1-11 — Production email: Resend (LOCKED 2026-06-11)
Auth email (magic links, invites, password resets) sends via the owner's existing **Resend**
account over SMTP. Sender: `Gordi Admin <admin@gordi.id>` (existing alias of the owner's account).
Domain gordi.id verified in Resend (2026-06-11); API key in 1Password vault `AS`, fetched via
`op-get.sh` at deploy time (coordinates committed in `supabase/op.resend.env`). Local dev keeps
Mailpit — no real sends outside prod. Password login works independently of SMTP.

---

## OD-P3 — Tasks redesign (LOCKED 2026-06-15, via grill-with-docs + mockup-first A/B; mockups in `docs/design-mockups/tasks-redesign-{A,B}.html`)

_(OD-P3-1 is reserved for the production-deploy decision — the "P3-1" roadmap task; the Tasks-redesign rulings start at OD-P3-2.)_

### OD-P3-2 — Tasks: split-view drawer, "one UI / two widths"
The Tasks surface becomes a **table + actionable side drawer** (master-detail), not list→full-page navigation.
- **One UI, two widths.** The drawer **is** the fully-actionable task surface (inline Status, RACI, checklist — OD-P2-1/3 change-in-place preserved). "Open task page" **expands the same surface** to full width (focus mode). There is no second/separate task editor — avoids the "two homes per entity" Lens-C trap (`docs/jtbd.md`).
- **One canonical URL.** `/tasks/:id` = the table with that task's drawer open (deep-linkable from My Week / Daily Log linked tasks). Expand vs drawer is a **remembered view toggle on the same URL** (not a second route).
- **Drawer behavior = push/squash split-view** (no scrim): the table shrinks to ~2/3 and stays live so triage continues with the drawer open (Gmail/Linear/Outlook convention). Responsive fallback: overlay/full-screen when the remaining table would be too cramped (narrow laptops). **Mobile = card list + full-screen task** (no 1/3 drawer; same `/tasks/:id`).
- **Width:** ~1/3, **clamped 360–480px** (33vw); table condenses/drops low-priority columns as it narrows.
- **New task:** `+ New task` opens the drawer in **create mode**; on save it becomes the just-created task, ready to act in place (`/tasks/new` → `/tasks/:newId`).

### OD-P3-3 — Drawer layout = Variant B (pinned header + tabs)
Owner picked **B** over A (single-scroll) at the mockup gate. A **pinned action header** (title · inline Status · R/A · Archive) never scrolls; the body is **tabs** — Details · Checklist · Activity — so the decision drivers + primary write + the one confirmed action stay visible in the narrow drawer.
- **Default tab = Details** (Status + R/A + description — the jtbd "above-the-fold" drivers); remember last-used tab per task within a session.
- **Expand persistence = per-user global** (one preference applied to every task), not per-task.

### OD-P3-4 — Productivity-tool interaction layer (from ui-ux-pro-max "Productivity Tool")
Binding for the build: **keyboard-first** (`j/k` move · `Enter`/`o` open · `Esc` close · `n` new · `e` expand) with visible focus rings; snappy **~150–200ms** micro-interactions; **optimistic** inline writes (status, checklist); **inline validation on blur** in the create form (error below field); **archive-only** confirm (routine writes are single-click + quiet confirm); **virtualize** the table at 50+ rows.

### OD-P3-5 — Ratify field-error tokens into DESIGN.md §5
Owner approved closing the DESIGN.md §5 Inputs gap: `--field-error-border` = `destructive`, `--field-error-text` = AA-darkened (`--status-lost-text`). **design-architect** ratifies into DESIGN.md §5 during the design-plan; used by the create-form validation.

> **ADR candidate (eng-planner authors):** the "one UI / two widths + one canonical URL" master-detail model is hard-to-reverse and cross-cutting (routing, the 844-line `TaskDetail` refactor, the My Week / Daily Log deep-link contract) → warrants an ADR. CONTEXT.md untouched — "drawer"/"expand" are UI mechanics, not domain vocabulary.

### OD-P3-6 — Tasks = full-bleed DB-view workspace (monday IA, Gordi skin)
The post-split-view Tasks screen still read as a **personal to-do app**; root cause was **IA + layout width**, not color (owner, grill 2026-06-16; mockups `docs/design-mockups/tasks-dbview-{A,B,final}.html`). Adopt the **monday.com *information architecture*** (explicitly **not** its color), rendered in the restrained DESIGN.md register:
- **Full-bleed workspace** — kill the 1080px centered cap in `PageFrame.tsx` for **data/list surfaces** (Tasks now; My Week / Daily Log to follow). **Prose surfaces (Weekly-update write) keep a readable max-width** — full-bleed is for tables, not paragraphs.
- **View-tab strip** — **Table** (built) · **Board** / **Calendar** (visible but **stubbed/disabled** — owner deferred; separate later slices).
- **Collapsible group-by** — each group header carries a **count + overdue subtotal**. Group-by is the "database" signature; field = Status / Owner / BU. **⚠ The "default group-by = Status" clause is SUPERSEDED by OD-P5-1** (group-by is now a toolbar TOGGLE; default = flat/None).
- **Real toolbar** — Group · Business unit · Person · Mine/RACI/All · Search · New task.
- **Open paradigm unchanged** — the shipped split-view **drawer (ADR-0007) is kept** (it *is* Notion's side-peek); inline-cell editing is **not** adopted (drawer remains the editor).
- **Visual register (owner-iterated 2026-06-16, `tasks-dbview-final.html`):** **A's chrome** — bordered filter controls, thin **horizontal** gridlines only (no vertical "stripes"), denser rows, hover quick-actions — combined with **B's table-body simplicity**: clean hairline group headers (NO navy bands, NO left-edge swatch — left stripes removed as distracting), flat-grey selected row (no left bar). **Status chips = soft-tinted** (DESIGN.md "Tinted-Status Rule": In-Progress soft-blue, Blocked soft-red, Open soft-amber, Done soft-green) — the one place soft color lives; everything else neutral grey (grey owner avatars). Overdue dates stay red (off-track signal).
- **Build specs (grilled 2026-06-16):** group-by = **Status (default) · Owner · BU** only; within-group sort = **Due asc** (overdue first); **show ALL groups always** (incl. empty — owner accepts some empties when grouping by Owner/BU, for layout stability); **bulk-select DEFERRED** — **no row checkboxes in v1** (single-row actions + drawer only; bulk archive/status was scoped out — re-add post-rollout if wanted); **Person filter overrides the Mine/RACI/All segment** (segment disabled when a Person is chosen; the segment = "Person: me"); **mobile = grouped cards** (group headers + cards for the chosen group-by; no view-tabs); view / group-by / collapsed-group state persisted **per-user-global** (mirror `useExpandPref`); columns = current set, **no user column-customization** in v1; per-group "+ Add task" pre-fills the grouped dimension (status/owner/BU, editable); `j/k` skips group-header rows; the page-count "N overdue" + group subtotals are **click-to-filter**.

### OD-P3-7 — Adopt Gordi brand tokens: navy + burnt-orange (DESIGN.md amendment)
The adopted DESIGN.md is the RIS near-monochrome (one bright action-blue, no navy, no orange). Owner ratified **introducing the real Gordi brand colors** (grill 2026-06-16): **navy `hsl(218 46% 22%)`** + **burnt-orange `hsl(18 80% 48%)`**.
- **Navy = structural** (group-bars, active nav indicator, logo, avatar gradient) — carries weight the lone action-blue shouldn't (One-Blue Rule preserved: blue stays the only *action* color).
- **Orange = brand sprinkle only**, used **sparingly** (logo dot, active view-tab marker). **Kept OFF all status semantics** — burnt-orange sits between the red/amber status hues and would be misread as a warning. Never a status, never an action color.
- This is a **DESIGN.md amendment + an ADR** (hard-to-reverse identity change to an "identity authority, never re-invent" doc) — exact token names/usage rules ratified into DESIGN.md by **design-architect** in build PR-1.

### OD-P3-8 — Tasks table engine: adopt `@tanstack/react-table`
Owner agreed (2026-06-16). Refactor the **whole** `TasksTable` onto TanStack **headless** row-models — sorting, filtering, **grouping + aggregation** (group counts / overdue subtotals via `getGroupedRowModel` + `getExpandedRowModel`), and column-visibility (the condense ladder) — rendered entirely with our own DESIGN.md markup (no imposed styling). Pairs with the already-shipped `@tanstack/react-virtual`. Replaces the ~23 hand-rolled `useState`/`useMemo`; the keyboard layer, optimistic status overrides, and virtualization are retained. **Client-side** row models (`listTasks` already fetches all; data volume is tiny). Rationale: grouping/aggregation is TanStack's sweet spot and the bug-prone part, headless = zero visual compromise, future-proofs column ops. Cost: a one-time refactor + re-verification of the freshly-shipped split-view table (paid in PR-3).

> **ADR (eng-planner authors): ADR-0008** — one ADR for the redesign, covering the **navy/orange DESIGN.md amendment** (OD-P3-7), the **full-bleed DB-view IA** (OD-P3-6), and the **`@tanstack/react-table` engine** (OD-P3-8): identity-level + cross-cutting (shared `PageFrame`, the design-system authority doc, a new core dependency + table refactor), genuine trade-offs. **Build phasing (owner):** PR-1 tokens+amendment → PR-2 full-bleed layout + view-tab scaffold + toolbar → PR-3 TanStack refactor + group-by engine + group headers. **CONTEXT.md untouched** — view / group / board are UI mechanics, not domain vocabulary.

### OD-P3-9 — Fonts: Plus Jakarta Sans (display) + DM Sans (body/UI/table) *(back-filled 2026-06-19)*
Ratified 2026-06-18 (`docs/plans/2026-06-18-demo-aligned-visual-refresh.md`); recorded into `DESIGN.md` at the
time but back-filled here for log consistency. **Font pairing swapped** to Plus Jakarta Sans (display/headings)
+ DM Sans (body/UI/table). **Inter retired as primary family** (kept only as the `.tabular` numeric fallback —
DM Sans's tnum doesn't align digits). Jakarta wants looser tracking than Inter — title tracking relaxed from
`-0.02em`/`-0.01em` toward `-0.01em`/normal. Mono unchanged (SF Mono, IDs/codes only).

### OD-P3-10 — Radius: `--radius` 8px → 12px for cards/containers/overlays *(back-filled 2026-06-19)*
Ratified 2026-06-18. `--radius` bumped 8px → 12px for **cards/containers/overlays**. **Controls**
(buttons/inputs/badges/nav-items) stay tight at 8px (taste guard — don't let 32px controls go bubbly). Scale:
xs 4px / sm 8px (control) / md 10px / lg 12px (card).

### OD-P3-11 — Soft-Elevation: a single resting shadow on cards/KPI/kanban *(back-filled 2026-06-19)*
Ratified 2026-06-18. A single subtle **resting** shadow is permitted on cards/KPI/kanban (alongside, not
instead of, the border). All colors stay desaturated near-black / faintly navy-tinted — **No-Pure-Black-Shadow
Rule preserved**. Hover/pressed/overlay vocabulary unchanged. Token: `--shadow-rest`.

### OD-P3-12 — Restrained-Gradient: subtle navy gradients only, never purple *(back-filled 2026-06-19)*
Ratified 2026-06-18. **Subtle navy gradients only (NEVER purple).** Two bounded uses: `primary-sheen`
(optional button fill, ±3% L of primary) + `surface-wash` (home/digest only, 3.5% alpha navy, fades to
transparent at 220px). Both reuse brand-navy + primary; the gradient is a **sheen, not a new hue** — the
One-Blue Rule preserved.

> **ADR (eng-planner authors): ADR-0009** — adopt the `mos-design-kit` `--ds-*` token system (`color(display-p3 …)`)
> + light/dark theme + Google-design.md-formatted `DESIGN.md`. Identity-level + cross-cutting (every CSS call-site;
> a new theme capability). Gordi brand tokens (OD-P3-7) preserved as additions; OD-P3-9..12 (above) back-filled
> into this log by the same issue. Spec: `docs/specs/design-system-adoption.spec.md`. **CONTEXT.md untouched** —
> token/radius/font/shadow names are UI mechanics, not domain vocabulary.

---

## OD-P4 — Platform topology, auth/RBAC, ESB-outbox (LOCKED 2026-06-19, grill-with-docs session — ADR-0010/0011/0012)

Pre-production-deploy grill. MOS (Phase 2 complete, not yet deployed) is becoming Gordi's Management
Operating System with dashboards + operational **Modules** (kitchen first). Three pre-existing systems
share one small `ris-dev` box + a near-zero budget: the **ESB analytics warehouse** (`gordi-esb-pg`,
OLAP, on Arief's Mac), the **kitchen App** (FastAPI + Teable, ESB write-back live since 2026-05-18), and
**Teable** + its Postgres/Redis. These OD entries record the resolved direction; the ADRs carry the full
context + alternatives + reversibility. Vocabulary: **App** = MOS (one app); **Modules** = kitchen /
roastery; **Access role** (app authorization) ≠ **Role** (org chart) ≠ **RACI** (per CONTEXT.md).

### OD-P4-1 — Kitchen migrates into MOS as its first ops Module, before user rollout (supersedes OD-DIR-6)
Kitchen is **not a separate app to keep running / rewrite** — it is **MOS's first ops Module**. Sequence
(ADR-0010 D10): stand up prod Supabase on `ris-dev` → build + migrate kitchen into MOS (`ops.*` tables +
the ESB-outbox, ADR-0012) → **retire Teable** (frees ~2 GB) → bring the warehouse online into the freed
headroom → **then** MOS user rollout. Drivers: **RAM** (the only pressure window is the transient
Teable+Supabase overlap; retiring Teable before the warehouse arrives means **no forced box resize** — an
8→16 GB resize stays a documented trigger, not an action) + the **Module reframing** (kitchen logic is
*ported*, not rewritten). **Supersedes OD-DIR-6** ("kitchen stays put / migration deferred"). See
ADR-0010 (topology/sequencing) + ADR-0012 (the migration + outbox).

### OD-P4-2 — Schema canon 4 → 5: add `reporting` (amends OD-DIR-3)
A fifth Supabase schema **`reporting`** — a curated ESB **financial read-model**, **copied** into
Supabase by a scheduled snapshot job (warehouse → Supabase, **not** read-through, so dashboard
latency/uptime decouple from the warehouse), **RLS-gated to `finance` + `admin` access roles only**
(OD-P4-4 / ADR-0011 D5), exposed to PostgREST via the ADR-0004/0006 mechanism (`[api].schemas` +
per-schema client). Canon: `shared` / `mos` / `ops` / `integrations` / `reporting`. **Amends OD-DIR-3.**
Management dashboards are **MOS-native** over these snapshots — **no Metabase** (deferred behind a
concrete trigger: a non-technical user needing recurring visual self-serve). See ADR-0010 D4/D5.
*Open (confirm-at-spec): snapshot cadence (lean daily); warehouse→`reporting` contract versioning.*

### OD-P4-3 — One auth model (Supabase Auth + RLS) for everything; reverses umbrella Accepted-Risk A1
**Supabase Auth + RLS governs all surfaces** — kitchen capture **and** review **and** all MOS — dissolving
the kitchen-vs-MOS auth collision. **Reverses the umbrella "Ops Gordi Mini-Apps" Accepted-Risk A1**
(public, no-login `/kitchen/`): kitchen logging now requires login, for **real per-person attribution**
(owner accepts the login friction; made survivable by a long-lived personal-phone PWA session — 30-day
rolling + inactivity timeout, *confirm minutes at spec*). The **review queue stays the GIGO gate** via
RLS: a `member` inserts their own `Submitted` kitchen log; only `ops_lead` approves. CF Access stops being
an app gate (may remain as infra-level Tunnel protection — reinforces OD-DIR-4). Staff **without email**
get **synthetic emails** (`name@kitchen.gordi.local`, admin-provisioned password — GoTrue has no username
credential). PWA = installable + push + **online-only writes** (offline-first deferred — collides with the
ESB-outbox idempotency model). See ADR-0011 D1–D4.

### OD-P4-4 — RBAC: a fixed access-role set (admin · ops_lead · finance · member); configurable later
Four **access roles** (the app-authorization layer, distinct from org **Role** and **RACI**):
**admin** (system administrator — user management + system config; the **only** role that sees the admin
UI), **ops_lead** (review/approve operational logs + elevated surfaces), **finance** (review financial
data/dashboards from `reporting`/warehouse), **member** (default — own tasks, file own weekly update, log
ops activity if rostered). A person may hold several; **effective access = assigned roles ∪ derived
manager** (manager stays *derived from the role chain*, never assigned — OD-P1-7 / CONTEXT.md). Enforced at
**three layers**: route guard + RLS + backend authz. Granting **admin/finance** is **admin-only, never
self-assignable**; the **first admin is seeded at deploy**. A configurable role↔permission engine is the
**deferred upgrade path** (YAGNI at ~15–30 users; fixed enum is RLS-friendly — same posture as OD-P1-3's
fixed read matrix). **User base widens** to kitchen line staff (`member`), beyond the brief's "managers +
selected ops". See ADR-0011 D5/D6.

### OD-P4-5 — ESB-outbox: a Module-agnostic transactional outbox in `integrations` (first tenant)
ESB write-back becomes a **transactional outbox** — `integrations.esb_push`, **App/Module-agnostic** from
day 1 (`source_module`, `source_ref`, `endpoint`, `payload`, `dedup_key`, `status`, `esb_doc_num`,
`attempts`, `error`, `posted_at`), **one row per batch** (push fact stored once, **normalized out of**
operational rows — reverses the Teable-era 13-copies-per-batch denormalization). A **single idempotent
worker** on the thin backend (ADR-0010 D6) drains it; **`dedup_key` in one place** solves the ESB's
**no-idempotency** problem **once for all Modules** (ESB has no `X-Idempotency-Key`). Kitchen is the first
producer (worker stays kitchen-only — YAGNI; grows a handler per Module). Kitchen **operational data** →
typed, RLS'd `ops.*` tables (`ops.wip_items`, `ops.kitchen_logs`, `ops.kitchen_plans`, `ops.kitchen_stock`)
— **distinct from `ops.log_entries`** (kitchen logs carry status+qty+owner, so they cannot be `log_entries`
per OD-P2-16); on **approval**, a **summary `ops.log_entries` row** with `origin` = the kitchen Module
preserves the Daily Log mirror (OD-P2-17) without duplicating rich data. The **one-time Teable→Postgres
migration preserves `batch_id` / `esb_doc_num` / posted history / WIP ESB ids** so the audit trail +
idempotency survive the cutover. Finally **populates the `integrations` schema** (reserved for this since
P1-2). See ADR-0012. *Open (confirm-at-spec): retry/backoff + dead-letter policy; event-fire-vs-poll
boundary; `source_ref` shape.*

### OD-P4-6 — Staging-first ESB: all write logic validated against the ESB Staging Sandbox, never prod
**All ESB write logic is validated against the ESB Staging Sandbox first — the production ERP is never the
validation target.** The ESB is the immutable system of record (OD-P4-1 / ADR-0010 D1); a logic bug, a
smoke test, or a botched migration must never mutate production ERP data — the kitchen project's Phase-4
live-probe-vs-prod pain is exactly what this prevents. **The staging sandbox is real:** ESB branch **`GOO`**,
base URL **`stg7.esb.co.id/core-stg`** (verified live 2026-06-26 — the earlier `stg-erp.esb.co.id`
coordinate was the ESB **web UI**, not the API; see `docs/reference/esb-goo-integration.md`); production
is **GKID**, served at **`services.esb.co.id/core`**. The **outbox worker (OD-P4-5 / ADR-0012 D2) carries an explicit ESB-target
setting (staging vs production)**; **non-prod/dev/test environments default to staging (`GOO`)**. Logic
validation, smoke tests, and the **one-time migration's `posted_to_esb`-survival proof (ADR-0012 D4)** run
against **staging first**; production GKID is touched only **after** staging-verified, via the proven
**single-WIP proof-push gate** (dry-run → independent verify → one real push → batch-enable — the Phase-4
discipline). See ADR-0012 D5. *Open (confirm-at-spec): staging sandbox availability/parity — is `GOO`
up, credentialed for the MOS worker, and a faithful mirror of GKID's endpoint contracts?*

### OD-P4-7 — Security is a priority: server hardening + a GATING security review before any exposure/rollout
Security hardening + a security-auditor pass are **gating work — done before internet exposure and user
rollout, not after** (gates ADR-0010 D10 step 5). **Server-hardening invariants** (ADR-0010 D11): `ufw`
**default-deny inbound** with **zero inbound ports opened** (all ingress via CF Tunnel, outbound-only —
OD-P4-2's edge layer / ADR-0010 D3); **Postgres bound to `localhost`** (the `ris-dev` **Teable-port-exposure
incident** is the anti-pattern to avoid); **Supabase Studio never publicly exposed** (gated, not a public
route); **SSH key-only + hardened**; **`fail2ban`**; a **patching cadence** (unattended security upgrades +
a scheduled window — `ris-dev` carried ~50 pending updates; the **n8n-CVE retirement** is the precedent);
**least-privilege DB roles** (`gordi_readonly` for agents on the warehouse, `service_role` confined to the
thin backend, never the browser). **Observability/analytics security** (tightens ADR-0010 D7): **PostHog
must not capture financial data or PII** — session-replay + input masking on financial dashboards and auth
fields; the **scheduled monitoring agent runs with least-privilege credentials and must NOT read
sensitive/financial rows** (ties to the open question on agent access to `reporting`); all observability
tokens via 1Password (OD-P4-8). **The gating audit** (security-auditor, OWASP/STRIDE) covers the auth/RLS/
provisioning surface (ADR-0011), the thin-backend `service_role` surface, the outbox (incl. the staging-vs-
prod target seam, OD-P4-6), and the hardened box — **before any internet exposure or user rollout**. See
ADR-0010 D11.

### OD-P4-8 — All secrets via 1Password `op`; resolve the secret-zero bootstrap
**Every project `.env` is rendered from 1Password via `op`** (never committed, never baked into an image;
repo carries only committed coordinates, e.g. `supabase/op.resend.env`) — the project's never-read-secrets
rule, operationalized on the server. The remaining gap is **secret-zero**: the **op service-account token
itself** is a secret that must reach the box before anything else can be fetched. **Recommended (lean):** a
**single resident secret-zero token** — an op **service-account token scoped least-privilege/read-only to
just the MOS vault items**, stored in a **root-only `0600` file** (e.g. a systemd `EnvironmentFile`),
**injected once at provisioning over a secure channel**, and **rotatable**; everything else is fetched via
`op` at deploy/runtime. Never in git, never in an image layer. **Recorded alternative:** **deploy-time
injection from the authenticated Mac** (the deploy script, run from Arief's already-`op`-authenticated
machine, renders secrets into the container env so the **server never stores the op token**) — cleaner
blast radius, but **rotation = redeploy**; a long-running runtime-secret-needing backend (ADR-0010 D6)
favors the resident token. See ADR-0010 D9 + D12. *Open (confirm-at-deploy-spec): resident secret-zero
token vs deploy-time render — and whether 1Password Connect is worth it later as services grow.*

### OD-P4-9 — Keep the global top bar (rejects the UI-revamp proposal to retire it)
The UI-revamp design-plan proposed retiring the §5 global 56px top bar (breadcrumb→content-top,
everything else into the rail). **Owner rejected** — the top bar stays, populated with:
**⌘K search · breadcrumb · notification bell (icon-only stub, no function yet) · user chip.** This
**reverses part of #29**, which had moved ⌘K + the user chip into the rail; both move **back to the
top bar**, and the rail's in-rail search row + foot user chip are **removed**. The **rail keeps** the
`Gordi MOS ⌄` workspace switcher + the "Workspace" nav (accent-icon selection) + Settings. Net IA:
**rail = navigation + workspace identity; top bar = search + breadcrumb + notifications + user.** The
notification bell is a visual stub (the IA slot; reminders/notifications remain deferred per OD-P2-2).
Implementation lands in the UI-revamp build (eng-planner ADR covers it alongside the other revamp
surfaces).

### OD-P4-10 — Table column headers: lighter overline (UPPERCASE + tracking, weight 400)
Ratifies UI-revamp OD-OVERRIDE-2 as **variant (b)** (Director-decided, owner deferred): `thead th`
keeps the **UPPERCASE + 0.06em tracking** overline *shape* but drops **600→400 + lighter color**.
Keeps one "label voice" kin to the rail-group + KPI overlines (just softened) rather than splitting
into a separate sentence-case header style. **Fix needed:** #29 shipped these sentence-case/400/no-track
(over-corrected) — re-add uppercase + tracking, keep weight 400. The Overline token stays **600**
everywhere else (rail groups, KPI). Scoped to `thead th` only.

### Terminology note (grill 2026-06-19, no CONTEXT.md change)
The hybrid task-detail surface introduces **"record page"** (drawer → expand → full two-column page).
Per the OD-P3-6 precedent ("view / group / board are UI mechanics, not domain vocabulary"),
**"record page" / "record" are UI mechanics, not MOS domain terms** — CONTEXT.md is unchanged. The
generic-entity framing (Task today; Projects/Objectives later) is a *roadmap* aspiration, not current
glossary. ⌘K-with-record-search (v1, owner-chosen) implies a **search endpoint** — a build dependency
for the eng-planner ADR, not a term.

### OD-P4-11 — Mockup feedback: brand-left top bar · dark-mode AA legibility · no-bleed (owner, 2026-06-19)
Owner review of the UI-revamp mockups (against the hand sketch) settled three things:

1. **Top bar is brand-left.** Left→right: **brand lockup** (logo + "Gordi MOS", a 236px column sitting
   *over* the rail with a divider) · **breadcrumb** · spacer · **⌘K search** · **notification bell**
   (icon-only stub) · **user chip**. Search moves from the bar's far-left to the **right cluster**
   (next to bell + user) per the sketch. **The rail loses its workspace switcher** — workspace identity
   now lives in the top-bar brand; the rail is **navigation-only** (Workspace nav + Settings foot). The
   breadcrumb **dedups the brand** (drop the leading "Gordi MOS" crumb). Refines OD-P4-9 (which kept the
   top bar but placed search far-left + workspace switcher in the rail).
2. **Dark-mode legibility is a gate.** Label/meta text on `--ds-font-color-light` measured ≈3.1:1 on the
   dark bg (**fails WCAG-AA**). Those roles move to **`--ds-font-color-tertiary`** (≈4.6:1): table overline
   (OD-P4-10 intent preserved — still lighter than body + weight 400), rail group label, nav counts, ⌘K
   group labels. **Rule:** a themed scope must **set text color explicitly** — a body-level `var()` bakes
   the *light-theme* value into the computed color children inherit, so dark children render near-black on
   dark (this was the dim ⌘K palette the owner flagged). The kit may later add an AA-safe dark "label"
   step; until then map label roles to `--tertiary`.
3. **No-bleed is a standing build constraint.** Long brand/user/breadcrumb text must ellipsize; status
   tags `white-space: nowrap`; the brand column is fixed-width so the breadcrumb can't shove it; content
   columns scroll, never overflow the shell. Carried into the eng-planner ADR + every UI-revamp PR's
   design-review (the design-plan "No-bleed guardrails" appendix is the checklist).

Mockups updated (`docs/design-mockups/ui-revamp/`, PR #35) and re-rendered light+dark to verify.

---

## OD-P5 — Tasks group-by = first-class toolbar toggle (LOCKED 2026-06-20)

### OD-P5-1 — Group-by is a TOGGLE, default = flat/None (supersedes OD-P3-6's "default Status"; refines AC-123)
Group-by becomes a **first-class toolbar control** in the records-workspace / spreadsheet-style group-toggle
idiom — a `Group` chip that opens a small menu (**None · Status · Owner · Business unit**) — **not** a fixed
default. **This supersedes OD-P3-6's "default group-by = Status (the database signature)"** and **refines
AC-123** (the ratified default flips Status → None). Owner preference (2026-06-20): surfacing grouping as a
clean on/off + field-picker beats a fixed grouping; the toggle persists, so the default is no longer
load-bearing.
- **Default = None (flat).** Honors the signed mockup's clean first impression
  (`docs/design-mockups/ui-revamp/mock-shell-and-table.html` renders flat) **and** matches shipped code
  (`use-tasks-view-pref.ts` default `'none'`). A Status-first user flips the chip once; it sticks
  per-user-global.
- **Active read:** the chip reads `Group · <field> ▾`; grouped render = hairline `GroupHeaderRow`s
  (caret + label + count + `· N overdue` click-to-filter + "+ Add task" pre-fill), all groups shown incl.
  empty (layout stability), collapse state per-user-global. Flat render = a single Due-asc list.
- **No new behavior:** the app already supports group-by Status/Owner/BU + collapsible groups + per-group
  "+ Add task" (`tasks-toolbar.tsx`, `group-header-row.tsx`); this OD **ratifies the toggle framing + the
  flat default** and retires the OD-P3-6 "default Status" clause. **Not an ADR** — a UI control over existing
  grouping, no schema/routing/cross-cutting change. CONTEXT.md untouched (group/toggle are UI mechanics).
  Tokens: all from the design-plan §2.8 `--ds-*` set — **no new tokens.**

---

## Legacy naming to reconcile (do NOT churn now — fix opportunistically on the next relevant migration)

The codebase + brief carry **app-era** naming that predates the **Module** vocabulary (`CONTEXT.md`).
Reconcile these *when a migration/edit already touches the relevant object*, not as standalone churn:

- **`ops.log_entries.origin` CHECK** is `manual | kitchen_app | roastery_app`
  (`supabase/migrations/20260612000004_ops_log_entries.sql`; OD-P2-17). The **Module-canonical** values
  are `kitchen` / `roastery` (no `_app` suffix). Widen/rename the CHECK on the **next `ops` migration**
  (e.g. the ADR-0012 kitchen-Module migration is a natural home). The summary-row writer (ADR-0012 D3)
  must write the canonical value once reconciled.
- **The brief's "kitchen app / roastery app / ops apps" framing** (`docs/project-brief.md`) is **legacy**.
  Canonical: one **App** (MOS); kitchen / roastery are **Modules**. Update brief copy when it is next
  edited; do not churn it solely for this rename.

---

## OD-K — Kitchen ops Module scoping (LOCKED 2026-06-19, grill-with-docs + feature-forge; spec `docs/specs/kitchen-module.spec.md`, ADR-0012)

### OD-K-1 — Full parity, but Teable not retired until fully tested
The first cut replicates the **entire** current Teable kitchen workflow on MOS/Supabase (logging + daily
plan + review/approve + stock auto-compute + ESB push + the `pesanan` 14-day upcoming view). The live
Teable app is **NOT retired** until the Module is fully tested. Parity boundary (exploration-confirmed,
`gordi-kitchen-app`): **NOT** in scope — receiving/goods-receipt, stock-opname adjustments, ESB-inventory
reconciliation read-back, multi-plan versioning, opening-balance seed, reports.

### OD-K-2 — Parallel-run → manual-test → manual owner switch (never automatic)
The Module runs alongside live Teable but is **manual-testing-only** and **never in production** until a
**manual owner switch**. **No shadow ingestion, no dual-entry** — the two apps share no data flow; the new
ESB-outbox worker emits **GOO/dry-run only** until the switch. The switch ("the flip") is one atomic,
owner-gated action that (a) points the worker at production GKID and (b) stops the Teable poller; until
then the **Teable poller is the sole GKID writer**. In-person training + onboarding precede the switch.
Guardrail: an `ESB_PUSH_ENABLED`-style flag, default-safe (mirrors the existing app).

### OD-K-3 — GOO staging = functional parity, TEST DATA only
The ESB staging sandbox (branch `GOO`, Core API `stg7.esb.co.id/core-stg`) validates ESB **call mechanics**
but holds only test data — NOT GKID's real product/BOM IDs. Real-data/real-ID validation is the
**single-WIP proof-push on GKID** at the switch. (Refines OD-P4-6.) **Verified 2026-06-26:** the Transfer
path (`/simple-transfer`) round-trips on GOO; the Production path (`/assembly-actual`) **cannot** be
validated on GOO (GOO's `SAE` tenant is standard-costing → `/assembly-actual` returns `EC03100004`), so the
assembly proof is the GKID flip push only. Full details: `docs/reference/esb-goo-integration.md`.

### OD-K-4 — No double-post to production GKID (hard safety)
Across retries, crashes, both push paths, and the migration, the system guarantees **at most one** ESB
document per batch: central `dedup_key` (one `integrations.esb_push` row per batch) + pre-switch
GOO/dry-run-only + history-preserving migration (`posted_to_esb`/`esb_doc_num` survive). Spec NFR-001.

### OD-K-5 — Kitchen Log capture screen redesign (Phase-0 mockup pick, 2026-06-21)
Owner rejected the shipped kitchen UI (single-column 32-row steppers, no density, One-Blue violation).
Diverged 3 directions (GLM-generated mockups, `docs/design-mockups/kitchen/`): A dense data-table,
B floor-fast phone, C plan-vs-actual dashboard. **Owner pick: A + C-KPI + B hybrid** — one *responsive*
Log capture screen: the **A dense data-table** (desktop/tablet ≥768px) with **C's KPI strip** on top
(Planned total · Made so far · % complete · Items remaining), reflowing to **B's floor-fast cards** on
phone (<768px) via the existing DataTable reflow (`shell/use-is-desktop.ts`). Mirrors the Tasks-table
architecture; reuses `<Pill>`, `action-type-seg`, `wip-item-stepper`, `state-kit`. **Parity guardrails:**
the KPI strip is a **derived display only** (sums + made/plan %, no new tables/persistence/logic); capture
+ submit behavior **unchanged**; **drop** A's net-new "variance note" chip. Scope = Log screen first;
Plan/Stock/Review are fast-follows inheriting the same components.

> **AMENDED 2026-06-22 (owner directive — expanded scope):** the owner directed that the full Kitchen
> Module UI be redesigned to the locked Log-screen language before merge ("redesign the whole kitchen
> module to the locked design language before merge"). All 4 functional screens (Log · Plan · Pesanan ·
> Stock · Review) rebuilt on `feat/kitchen-log-redesign`. ESB-pushes page is out of scope (no redesign).
> Plan: `docs/plans/2026-06-22-kitchen-screens-redesign.md`. The original "Scope = Log screen first"
> clause is superseded; all other OD-K-5 guardrails remain unchanged.

### OD-C-1 — Strategy-to-Execution cascade: adopt the spine, build the foundation now (2026-06-23)
Grill-with-docs session #3 (owner + Director), against `CONTEXT.md`, ADR-0003, and the vault
(`Strategy-to-Execution Stack` / `Management OS Framework` / `Notion Management OS` + the 2026-05-02
ChatGPT transcript). Reframes MOS from "task-manager + RACI" toward the hierarchy spine, so project work
and daily recurring work both tie to the goals they serve and a person's effort split is visible. Locked:
- **Layer 4 = Program/Process**, one `Initiative` entity with `type ∈ {Program, Process}`; the single
  "Project" shape is superseded.
- **Six-level model is canonical vocabulary** (`CONTEXT.md` § Cascade); **build 3 tables now** (Objective ·
  Initiative · Task); Strategy/Outcome/Output stay additive concepts.
- **Topology rule (amended):** a Task may link directly to Project/Process; deferred layers (especially
  Output) hang off-the-side, never inserted-between. Ad-hoc Tasks may remain unparented; generated Run
  Tasks require their source. A/R ownership remains on the higher cascade layers.
- **Signal is not folded into the cascade** — it stays the factual layer; required action links a Task.
- **Measure v1 = structural load** (Programs/Processes a person is A/R on, by lane); weekly-Output and/or
  duration deferred.
Full rationale + the "why 6 not 3" + the additive-vs-rebuild design: **ADR-0014**. Open: entity name
`Initiative` (provisional, owner veto), umbrella stack name (unlocked), first-slice scope (Director
recommends Objective+Initiative create/own + attach Tasks + the person-load view).

### OD-C-2 — Cascade catalog management surfaces (grill-with-docs, owner 2026-06-26)
Owner asked for in-app management of Objectives and Projects/Processes (today they exist only via SQL
seed; the task form reads them but no one can add/edit them). Grilled against `CONTEXT.md` §Cascade +
§Access-role, ADR-0011, ADR-0014, ADR-0015. Locked:
- **Two nav items under Workspace** (not one combined page, not an admin page): **Objectives** and
  **Projects & Processes**. No umbrella term is invented (CONTEXT.md leaves it unlocked) — each entity
  gets its own simple list page. Each nav item is role-gated to exactly the roles that may write it, so
  a user who can't manage it never sees a dead-end page.
- **Canonical UI term = Project/Process** (honors ADR-0015 / CONTEXT.md). The shipped task-form field
  currently mislabeled **"Work-line" is re-labeled "Project/Process"** as part of this work. The physical
  table stays `mos.work_lines` (physical name ≠ UI term). `CONTEXT.md` §Cascade updated to retire
  "work-line" from UI copy.
- **Capabilities:** add · rename · archive (soft, no hard delete — NFR-002). Rename propagates to all
  referencing tasks (it's a lookup). Archive removes the row from task pickers (the picker queries already
  filter `archived_at is null`) but keeps the name on existing tasks via the intact FK; unarchive restores.
- **Permissions (admin = superset):** **Objectives — admin only** (tightens the shipped
  `admin OR ops_lead` policy to admin). **Projects & Processes — ops_lead + admin** (the *existing*
  `work_lines` policy — no RLS change). Derived-**manager** gating was considered and **deferred**: owner
  chose "use existing roles now" rather than build a new `shared.is_manager()` RLS primitive (ADR-0011
  keeps manager out of the JWT, so it would need a new live SQL predicate). True manager gating is a clean
  additive v2 (add `shared.is_manager()` + widen the `work_lines` write policy) if wanted. **Not an ADR** —
  the objectives tightening is a reversible policy change matching owner intent; no manager primitive built.
- **Build topology:** stacked on `feat/admin-user-mgmt` (worktree) to REUSE its committed role-route-guard
  + section-gating infra (the admin-users slice landed those first); merges additively after it.

---

## OD-AN — Agent-native / user-composed UI (LOCKED 2026-06-30, grill-with-docs; ADR-0017)

### OD-AN-1 — Adopt agent-native user-composed UI on the existing Supabase stack (ADR-0017, Accepted)
Let the team compose their own UI (analyse · input · present) without waiting for a dev cycle, and
**promote** views into the product. Adopt the *pattern*, not the framework as host (Supabase stays
authority). Core invariant = the **deputy agent** runs as the user's own JWT → RLS (security by
construction; never `service_role`/privileged/provisioning RPCs). **Dual-plane reach:** deputy reads base
tables + operational `security_invoker` views + the **finance/admin `reporting`** snapshot; the raw,
multi-company OLAP warehouse is reserved to a server-side analyst agent. Input = **existing entities only**
(novel shapes → a promotion request). Sharing = the derived `is_manager_of` chain (no new access role).
Financial visibility stays **finance+admin** (no new tier — owner, 2026-06-30). Build is **value-first**,
inverting PMO ADR-0036 §10 (MOS has no kit to register): Issue 1 = a mobile-first operational dashboard
that births the primitive kit. Agent-native runtime is config-over-fork behind a **MOS-specific spike**
(ADR-0017 D9 — PMO's green does not transfer: self-hosted, multi-schema, `access_roles`/`current_org_id`
claim shape). Full decision spine: `docs/adr/0017-agent-native-user-composed-ui.md`. Status: Accepted,
merged to `dev`.

> **AMENDED 2026-06-30 (ADR-0010 amendment A1; refines OD-P4-2):** the OLAP warehouse's **online home is
> the Tencent VPS** (`tencent-OpenClaw`), co-located with the agentic layer, off the OLTP box — PG17,
> loopback-only, self-sustaining op-native sync, monitored (CloudMonitor + resource-watch→Telegram),
> rebuildable-from-ESB so no backup. The `reporting` read-model + warehouse→Supabase snapshot job that
> OD-P4-2 specifies remain **to build** (the sales-dashboard enabler). Runbook + open owner-actions:
> `docs/reference/warehouse-online.md`.

### OD-AN-2 — `reporting` grows as a set of bounded read-models; drill-down is mostly a DSL problem, not a data problem (extends ADR-0017 D3, 2026-07-02)
Grilled against the first live `reporting` tenant, `sales_daily_revenue` (date × channel × branch →
revenue + txns, OD-P4-2/ADR-0010 D5). Owner asked whether the shallow-looking dashboard means shallow
data, whether the deputy should point at the raw OLAP warehouse instead, and whether curated read-models
mean "too many data duplicates." Locked:
- **`reporting` is a growing SET of curated, bounded read-models, never one table.** Cardinality =
  dimensions × grain, never transaction volume. `sales_daily_revenue` is v1; drill-down needs are met by
  **adding targeted read-models** (e.g. `sales_daily_by_item`, `sales_weekly`, `sales_by_hour`,
  `margin_daily`), each snapshot-fed + finance/admin-RLS'd like v1 — OD-P4-2/ADR-0010 D5 curation,
  applied incrementally.
- **Bounded curated duplication is the accepted OLTP/OLAP-federation trade (ADR-0010 D2), not wholesale
  duplication.** The OLAP holds millions of raw rows; `reporting` stays thousands (aggregates) — only
  the curated slices actually queried are copied, at aggregate grain.
- **Many drill-downs need no new data, only the query-spec DSL (ADR-0017 §4b / build-sequence Issue 3).**
  "Last X days" and week-over-week comparisons are computable from the existing daily-grain 60-day
  window via grouping/window comparison — the dashboard looked shallow because the UI shows one fixed
  cut, not because the read-model can't express it. New read-models are warranted only for cuts the
  daily aggregate structurally cannot express (item / hour / margin / customer).
- **Two-tier drill-down (extends ADR-0017 D3's dual-plane reach):** the **user deputy** (in MOS) reads
  only the curated `reporting` read-models, RLS-bounded — never the raw OLAP warehouse (owner-preferred,
  structurally required). The **server-side analyst agent** (OpenClaw on the VPS, `gordi_readonly`) does
  deep raw-OLAP exploration; useful findings get **promoted into new curated `reporting` read-models**
  (explore in OLAP → curate the valuable slice → deputy composes over it — mirrors the ADR-0017
  promotion concept, applied to read-models). **Net framing: MOS is the analysis *surface* (curated
  read-models + the query DSL), not the analysis *engine* (which stays in the OLAP).**
Full text: `docs/adr/0017-agent-native-user-composed-ui.md` D3 extension (2026-07-02). Cross-refs:
ADR-0010 D2/D5, OD-P4-2, ADR-0017 D3/D7 + build sequence.

### OD-AN-3 — Port PMO's native agent stack into MOS, copy-adapt, no shared package (ADR-0018, Accepted)
The upstream agent-native sidecar ADR-0017 D8 adopted was **retired upstream as a user surface** (PMO
ADR-0040, 2026-07-03 — builder/admin-grade, not app-user-grade; PMO's adoption PR closed UNMERGED; owner
ruled "cherry-pick"), and PMO **rebuilt its agent stack PMO-NATIVE** on its own substrate (in-app
`AssistantPanel` + same-origin Supabase Edge Functions + a caller-JWT deputy loop + a curated tool
catalog), now **complete + post-audit** on PMO dev with **no upstream-framework code** in it. MOS **ports
that stack maximum — substrate + agent + batteries — copy-adapt, and owns the fork outright** (no shared
package, no runtime dependency, no auto-sync; future PMO fixes arrive by deliberate cherry-pick
re-reviewed under MOS gates). Runtime home = **Supabase Edge Functions** (staging Cloud + self-hosted
edge-runtime container, ADR-0010) — **no bespoke MOS backend tier** (the VPS-Node option rejected, same
ops cost PMO ADR-0040 declined); the Tencent VPS stays the **server-side analyst agent's** OLAP home
(ADR-0017 D3 / OD-AN-2). The deputy tool catalog + DSL entity whitelist span **both planes** (mos OLTP
entities + `reporting` read-models; RLS already ceilings finance/admin — no extra gate); read tools
auto-execute, write tools v1 = only `create-task` + `post-update` behind approve/deny chips; the raw
warehouse (analyst-only) and the ADR-0016 provisioning RPCs (never a business action) are
**hard-excluded**. MOS adds a **binding, test-enforced grounding NFR** PMO lacks: every data claim traces
to a tool result; a data question must query, never recall; empty/failed read → say so + stop; non-live
figures carry as-of — applies even when the user has access (CONTEXT.md "Grounded answer"). Port ships
as **three trains** (P1 substrate → P2 panel+runtime → P3 batteries), each through the full loop, each
shippable, cherry-pick window between — starting **after** the `sales_margin_daily` read-model + the
My-Week-replacement dashboard. All agent tables live in `mos` with `org_id`+RLS; UI re-skinned to MOS
DESIGN.md; ADR-0017 D9's SSO half is **moot** (same-origin edge functions). **ADR-0017 D1–D7 survive
unchanged**; this supersedes only D8's runtime-adoption half and re-scopes D9 + §4a Issues 2–3 (registry +
DSL now arrive by port, not grown). Full decision spine + consequences:
`docs/adr/0018-port-pmo-native-agent-stack.md`. Cross-refs: ADR-0017 D1–D9, ADR-0010 D5/D6/A1, ADR-0011
D5, ADR-0016, PMO ADRs 0037–0046; CONTEXT.md "Port". Status: Accepted (owner, 2026-07-04, grill-with-
docs).

### OD-IA-1 — IA north-star: five destinations; taxonomy BU/Activity/Revenue-stream (ADR-0019, Accepted)
The bar is **viable, not minimum** — MOS becomes the operating system for all ~30 people, absorbing
kitchen/bar/roastery/ecommerce ops, KPI drill-down, COGS+budgeting, comms, and money follow-ups without
nav growth. Locked: **taxonomy** (BU = team: Marketing/HR/Finance/Retail Ops/B2B Ops/B2B Sales; Activity =
workstream within a BU; Revenue stream = money lens; old BU seed rows need re-mapping) · **five
destinations** (Home = KPI hub + My Week *panel*, every tile has a drill target; Work = tasks + everyone's
cascade view + follow-up queues + updates; Operate = per-Activity modules; Plan = reference data +
workbenches; Inbox = to-triage router) · **Home coded v1 → org-default user-view v2** (post-port) ·
**work-item comms only** (free-form stays in WhatsApp) · **MOS owns settlement grain** for B2B AR + retail
pending bills (ESB write-back only if the API spike validates — check `gordi-esb-bak` first) · **canonical
record, many presentations** + vendored `doc-editor`/`data-grid` primitives (MIT/Apache/MPL only; AGPL
out) · **reference data: ESB feeds, MOS owns** · **phone-first + bottom tabs** binding · **Inbox + PWA
push v1**, channel-adapter seam, WhatsApp only on evidence · **sheet-retirement playbook** (port →
time-boxed dual-run → gsheet permission-flip cutover → tombstone) · **agent = global panel**, not a
destination · **bilingual en/id** — string catalog from the Home slice on · **backup/restore drill gates
the AR bridge**. Sequencing: Home v1 + margin read-model → port (ESB spike parallel) → Work spine (enables
the live management-week validation) → AR bridge → Plan/reference data → activity roll-ins. Full spine:
`docs/adr/0019-ia-north-star.md`. Status: Accepted (owner, 2026-07-04, grill-with-docs).

### OD-IA-2 — Capability authorization: `can()` + role defaults + individual overrides (ADR-0020, amended 2026-07-10)
RLS policies stop naming roles and call **`shared.can(capability)`**; **capabilities are a code-owned
vocabulary** (new keys ship with features); editable access-role rows supply default grants and admins
may set sparse individual allow/deny overrides. The per-person admin matrix shows effective Inherited,
Allowed, or Denied state and Reset to role default; it does not copy every role grant onto each person.
For a given action/resource, applicable grants resolve explicit deny → explicit allow → union of role
grants → default deny. Grants/overrides carry a meaningful scope (self, own BU, selected BUs, or org).
Record governance remains a second gate and needs a distinct override capability to bypass. Guardrails:
protected admin capabilities, last-admin protection, and complete audit history. Migration remains
opportunistic and the deputy inherits effective access through the caller's JWT. Full spine:
`docs/adr/0020-capability-authorization.md`. Status: Accepted, amended by owner 2026-07-10.

### OD-WS-1 — Work spine v1: objective→task cascade as an everyone-surface (spec Accepted, ADR-0019 D14 step 3)
The first ADR-0019 Work-destination slice. Adds a **`/work/cascade`** view where **every** authenticated
org member reads the objective→work_line→task ladder and their own line-of-sight ("Mine"); the existing
admin `/objectives` + Projects & Processes pages become the **capability-gated manage mode** reached via an
inline affordance (no second editor). Elevates the shipped Tasks DB-view cascade machinery (group-by-work_line,
Workload caption, `useCascadeCatalogs`) — reuse, not rebuild. **READ stays org-wide** (already shipped; the
"admin-only read" premise was verified false). **WRITE migrates from `has_access_role` to `shared.can()`** —
this slice **introduces the minimal `shared.can()`** (function + `objective.manage`/`workline.manage` keys +
seeded grants: admin→both, ops_lead→workline; `org` scope for v1) as ADR-0020's named first consumer; the
admin-editable-roles UI is deferred. Follow-up queues / AR / pending-bills (D5/D14 step 4) explicitly OUT
(gated on ESB spike + backup gate). Security-sensitive (`can()` + RLS) → gpt-5.4 cross-family + security-auditor
review binding. Spec: `docs/specs/work-spine.spec.md`. Status: Accepted (owner, 2026-07-06).

---

### Accepted (owner, 2026-07-06 grill) — merged from `docs/jtbd-refresh`
From the E6 IA/JTBD grill-with-docs (2026-07-06). **Owner accepted all four 2026-07-06; ADR-0022/0023/0024
flipped to Accepted, JTBD v0.3 accepted as the Lens-D oracle.**
- **ADR-0022 — Plan destination / COGS-budget model** (extends ADR-0019 D7): Plan = budget-creation;
  ingredient cost basis = ESB `last_hpp` (trend/variance alert deferred); **read-and-budget MVP**;
  recipe-edit + ESB BOM write-back = one spike-gated v2; MOS is the pre-flight margin check, **never**
  the price-setter (price lands in ecommerce). `docs/adr/0022-plan-destination-cogs-budget.md`.
- **ADR-0023 — Multi-location inventory + internal replenishment** (new): stock is location-scoped
  (Roastery/HQ-retail/Ecommerce, each its own pool); internal replenishment (roastery→retail/ecommerce,
  GRI→GKID) is a first-class flow **≠ a B2B sale** (stays out of Follow-up); ecommerce fulfilment queue;
  additive to the Kitchen spine. `docs/adr/0023-multi-location-inventory-internal-replenishment.md`.
- **JTBD v0.3** (`docs/jtbd.md`) — the E6 Lens-D oracle (4 personas × 5 destinations), supersedes E1 v0.2.

### Continued IA/product grill — session 2 (2026-07-06, owner-confirmed turn-by-turn)
Extends the E6 grill above; each call confirmed by the owner in conversation (on `docs/jtbd-refresh`).
Feeds ADR-0024 + the roastery/agent/Home specs when their D14 turn comes. Terms captured in `CONTEXT.md`.

**Agent-capability** (`docs/specs/agent-capability-expansion.md`; OQ-7 answered — deputy = `claude-sonnet-5`, a strong tool-selector):
- **Experience batch is next, before automations** — ship C2 safe-markdown + C3 typed-widget tables + C4
  layered prompt (charter + tool-index + skills), *then* C1 automations (P3b). Reverses the doc's C1-first
  default: the felt "raw chatbot" UI pain outranks automations.
- **Adopt safe markdown** in the deputy transcript (react-markdown + remark-gfm, no raw HTML, url-scheme
  allowlist, hostile-markdown gate test) — consciously **reverses FR-P2-AP-004 "respond in plain text"**;
  compatible with the grounding NFR (grounding = sourcing, not formatting). PMO analog: ADR-0049.
- **Deferred (seams reserved):** attachments (C5, largest build; roastery cupping-photos are roll-in #6),
  credits/metering (C8, premature at ~15 interactive-only), conditional-approval (C7), live-context (C9),
  eval-harness (C6, low leverage on a strong selector).

**Roastery module** (`docs/specs/roastery-module.requirements.md §6` resolved):
- **Green stock = lot grain (lightweight)**; **roasted COGS = MOS computes floor-truth** (green `last_hpp` ÷
  actual yield%), reconciled vs ESB `Manufacturing In/Value` later. [CONTEXT: *Green lot*, *Yield costing*]
- **MVP scope expanded**: green+roasted stock + yield roast-log **+ blends (multi-level BOM) + repack →
  packed-FG + B2B sales-order entry**; **QC/cupping deferred v2** (owner pulled blends/repack/sales-order
  in — only QC stays out).
- **Sales-order → ESB push (create-and-authorize, kitchen-style)** — see **ADR-0024**. MOS pushes the SL
  (`POST /sales/product-sales` then `/authorize`) via the module-agnostic `integrations.esb_push` outbox
  (`source_module='roastery'`, additive, no schema change); ESB stays invoice-of-record (SI) + AR-of-record;
  Follow-up only reads ESB invoice status. Gate: sales-order-create GOO spike (FR-084 sandbox IDs) before
  build; GKID proof at flip.
- **Product master**: **B2B Ops curates; ESB owns identity (`productDetailID`)**; MOS = reference-data
  canonical + strict type axis (Raw/WIP/FG/Packaging/Consumable) + **alias table** (read-and-curate, no
  runtime write-back). The alias table bridges the GB/RB/Blend name chaos so roastery ships without waiting
  on a **one-time ESB product-master cleanup** (rename/restructure in ESB directly, at roll-in — a separate
  remediation track). Finance/Procurement own the cost lines.
- **Confirms:** labour = SGA, never per-batch COGS; ignore the sample-roaster PDF (equipment purchase).
  **Roll-in timing holds** — roastery stays D14 step 6.

**Home composition** (`docs/jtbd.md` §1/§2; [CONTEXT *Home*]):
- **Stacked-union cockpit** — Home composes the **union of the roles a person holds** as one scrollable
  surface, **widest-scope section first** (BU-head-who-is-lead → function cockpit with the My-Week panel
  below; pure lead → My-Week only; member → "what needs me"). **Not a toggle, not a separate login.**
  Deferred v2 only if the union gets too dense: separate workspaces or a toggle-with-layered-rails.
- **Contributor Home = capture-first** (Activity fast-capture + @mentions/assigned steps; team plan shown
  read-only as context) — **no rostering in MVP**. **Shift-scheduling deferred but NEAR-TERM** (manual today,
  "sooner than later") — leave the seam for a "your shift today" slot; backlogged.

**Whole-company reach — Marketing & HR** (tests the E6 all-6-BUs claim): Marketing/HR are project/knowledge
functions with **no Operate module** — they live in the **universal cross-cutting planes** (**Work**
tasks/RACI/cascade/updates/follow-ups · **Home** their cockpit + owned budgets, e.g. Marketing's promo
budgets · **Plan** budgets/pricing they consume · **Inbox**). For their varied, not-yet-modelled needs:
**tasks-first now, plus the composable Notion/Airtable-style UI as the escape hatch** — **already ADR'd**,
not new: user-composed **user views** + the **promotion** path (user view → coded Module) per **ADR-0017**,
rendered on the two vendored primitives **`doc-editor` (Notion-like blocks) + `data-grid` (Airtable-like
grid)** per **ADR-0019 D6**. A dedicated Marketing/HR module (content calendar; a recruitment/onboarding
queue — the latter *would* be an Operate queue Activity) lands only when a user view **demonstrates the
demand** (promotion), never speculatively. So the whole-company claim holds via **Work+Home+Plan+Inbox being
universal + the composable-UI escape hatch**, not via everyone getting a module on day one.

**AR bridge / Follow-up reconciliation** (D14 step 4; underpins the Home money-position strip; [CONTEXT *Follow-up*]):
- **MOS owns per-invoice reconciliation — it REPLACES Finance's per-invoice recon gsheet** (dual-run →
  cutover). MOS = invoice-grain settlement system-of-record; ESB's aggregate AR-reduction journal = a
  **secondary cross-check** (Σ MOS-confirmed per counterparty/period ties to ESB's drop; drift → a Finance
  exception). **No ESB write-back** — reconciliation replaces it (spike returned LIKELY-NOT).
- **settled = operationally settled + evidence; confirmed = Finance reconciled to bank/ESB** (two states).
- **Manual per-invoice evidence attach; bank-feed deferred.** Required field on partial/settle: **cash-in
  date** (money-landed date) — the bank-statement match key a bank feed would later auto-populate.

**Notifications / Inbox channel** (ADR-0019 D4/D9): **PWA push only for MVP**; add a **re-push trigger**
(re-nudge untriaged/unread after an interval — single push insufficient; near-term). External-channel
follow-up = **Telegram or in-app group chat** over WhatsApp (WA too tedious to integrate for the payoff);
channel-adapter seam takes either. D4 stays hard: external channel = doorbell only, conversation on the entity.

**Catalog placement** (owner feedback 2026-07-06 — confirms ADR-0019 line 44; origin OD-C-1/C-2, the
cascade came in pre-IA as "two nav items under Workspace"): the objective→task catalog belongs **in Work
as the manage-mode of the everyone-cascade**, **traced up and down**. Refinement over the held Work-spine
spec (FR-310–313 link out to the existing *flat* catalog pages, which persist as standalone `/objectives` +
`/projects-processes` routes): (a) **retire the standalone nav** — the catalog is reachable **only** from
the Work cascade (direct visits redirect into it), so it's genuinely "in the Work folder," not a separate
destination; (b) each manage page **shows the node's up/down trace context** (an objective → its child
work_lines + task count; a project/process → its parent objective) so managing is traceable both ways —
**reuse the existing pages + add the trace context, don't rebuild as an inline tree** (YAGNI). Lands with
the Work-spine merge (D14 step 3); update `docs/specs/work-spine.spec.md` FR-310–313 on that branch.

**Certified metrics** (anchor A7; *Director-defaulted from recommendation — flag to change*): **Finance
certifies** financial-statement figures + the second-class figures feeding them; **migration-seeded registry,
no runtime certification UI in MVP** (same discipline as `can()`); **uncertified/stale renders a fail-loud
badge** and Plan pricing pre-flight warns/blocks against it.

## OD-DASH — Dashboard analysis surface: `/sales` → `/dashboard` (LOCKED 2026-07-07, grill-with-docs session; spec `docs/specs/dashboard.spec.md`)

### OD-DASH-1 — Metabase deferred (third time); MOS-native dashboards, revisit only on the D4 guardrail

Metabase was proposed a third time (2026-07-07) as "easier than building drill-down in MOS." **Deferred
again, on the owner's own two constraints:** (i) no additional box/VPS to host it; (ii) no separate login.
Both are precisely the costs ADR-0010 D4 + the `reporting`-copied-into-Supabase design were built to avoid.
The owner's actual need ("drill-down that normal dashboards should have") is covered by work that is
**specced but not yet built** — the drill-down query-spec DSL (ADR-0017 §4b, OD-AN-2) + the next
read-models — not by a tool that would give a worse drill-down, bypass RLS, and add a box + login. **D4
guardrail holds:** revisit a BI tool only if, *after* the DSL + read-models ship, MOS dashboards drift
toward a generic charting/pivot playground — that drift is itself the signal. Decision is **reversible**:
if the shipped dashboard is still unusable for drill-down, the Metabase-revisit ADR gets written honestly.

### OD-DASH-2 — Route: `/sales` → `/dashboard` (rename + broaden); Home stays a light landing

The analytical KPI hub is **`/dashboard`**, not Home. `/sales` is renamed and broadened: it covered only
revenue, the name lied about scope. `/dashboard` covers all warehouse-backed KPIs (revenue + interim gross
margin/COGS first slice) and grows sections as warehouse facts arrive (opex, material usage, labor, roastery
yield). **Home (route `/`) stays a light role-aware landing** — its finance tiles link to `/dashboard`
instead of `/sales`. This **clarifies, not reverses, ADR-0019** ("Home = KPI hub"): Home is the role-aware
entry; `/dashboard` is the analytical hub + drill-down surface. The StackedUnionHome scaffold
(`SHOW_HOME_STACKED`) is left untouched — not finished, not deleted; a future slice may pick it up. Recorded
as a clarification (lightweight, not a new ADR).

### OD-DASH-3 — First slice = the data spine + drill-down on warehouse-backed KPIs (one slice)

One slice, not two: **(a) staging verify/fix** (verify post-`a3a2015` margin rows landed; merge `a3a2015`
to main/staging; wire Telegram snapshot alerting; correct stale `AGENTS.md`/`CLAUDE.md`
"migration not yet written" lines) + **(b) local data unblock** (run the *existing* `reporting_snapshot.py`
locally against `localhost:5432/gordi_esb` → local Supabase `:44322`, via a `scripts/reporting-snapshot-local.sh`
wrapper — no dump, no FastAPI, no domain, no new box; the snapshot job is the only writer in prod *and*
locally) + **(c) `/dashboard` rebuild** (Variant B Tabs, signed-off mockup). The spine is small and the
dashboards are only as trustworthy as the data feeding them, so they ship together.

### OD-DASH-4 — Drill-down = A (filter-in-place) + B (navigate-to-detail); deputy/analyst handoff (C) deferred

First-slice drill-down is two patterns: **A — filter-in-place** (clicking a KPI tile or changing the
cut/window re-filters chart + table on the same screen) and **B — navigate-to-detail** (a "full detail"
affordance opens `/dashboard/detail?window=…&branch=…` with the complete daily breakdown). **C — the
deputy↔analyst-agent handoff** (ADR-0017 D3, natural-language drill with raw-OLAP escalation) is **deferred**
to a follow-up: it's the differentiating long-term play but depends on the ADR-0018 port Issue 3 wiring,
a separate larger build. A+B already cover "what normal dashboards should have."

### OD-DASH-5 — KPIs: revenue-led, gross margin/COGS secondary (basis-labelled); not-yet-backed = honest stubs

First-slice KPIs (only these are warehouse-backed): **Revenue row** (trailing 7d +WoW, trailing 30d +MoM,
latest reporting-day, avg check, channel mix as a string "POS 77% · B2B 23%") leads. **Gross margin row**
(interim gross margin %, interim gross margin amount, interim COGS amount, BOM-coverage DQ badge) is
secondary and **basis-labelled "interim — stock-movement"** on every figure — never bare "margin" or bare
"COGS" (see CONTEXT.md canon). **Not-yet-backed KPIs** (opex, material usage/portion, labor %, roastery
yield) render as **one "What's coming" strip** (not four stub tiles) — gap-visibility as a feature, not
debt. Cuts: Branch (default) + Channel + Activity. Time-window: 30d default, presets [7d/30d/60d] + a
custom date picker **bounded to the 60-day snapshot window** (can't pick dates the warehouse doesn't
have); WoW on 7d, MoM on 30d, custom = same-length prior window auto. **No save/share/save-as-default**
(that's BI-tool territory — the D4 slope).

### OD-DASH-6 — Layout: Variant B (Tabs), signed-off mockup gate (Phase-0)

Owner picked **Variant B (Tabs)** from three design-architect mockups (`docs/design-mockups/dashboard-{A,B,C}-*.html`).
Summary tab = KPI tiles + chart (filter-in-place); Detail tab = full table. **One global Cut/Window
toolbar above the tabs** (filters apply to both — no per-tab duplication). Active tab persists in URL
(`?tab=summary|detail`). The Detail tab *is* the parameterized `/dashboard/detail` route (B's
navigate-to-detail), so it's shareable without per-KPI route sprawl. Both desktop and mobile are
first-class. Mockup open questions resolved: channel mix = string; stubs = one strip; ratify two semantic
token reuses in `DESIGN.md` (`--basis-chip` role for COGS-basis labels, DQ-as-warning/success); `?tab=`
persistence + global toolbar. Gate passed 2026-07-07.

## OD-REDESIGN — Full redesign direction + IxD grammar (LOCKED 2026-07-09, grill-with-docs session)

The current MOS app (ADR-0019) has never been used. A 2026-07 design teardown found its root problem:
it behaves like "several apps." The owner directed a **full redesign from the job**, treating the current
app, routes, DESIGN.md, prior mockups, and ADRs as *evidence, not authority* ("no ADR is sacred"). This
section records the direction decisions; the binding ADR is **ADR-0025**; the vocabulary is in
**`CONTEXT.md`** (Standard, Shift, PIC/Supervisor Task ownership, amended Process); the IxD target reference is
**`docs/reference/twenty-ixd-patterns.md`**. One-page map of all 55 (theme groups, OD↔ADR-0025
cross-refs, supersession chains): **`docs/redesign-decision-index.md`**.

### OD-REDESIGN-1 — IA: modules as nav roots, grouped by BU (supersedes ADR-0019 D2)

The rail is a **two-zone structure**: Destinations (Home · Work · Money [role-gated] · Inbox) then
**Modules grouped by Business Unit** (Retail Ops → Café / Ecommerce; B2B Ops → Roastery). A Module is
earned by one coherent operational workflow, not by every team, Activity, or station: Kitchen and Bar
share the **Café** operating workflow and therefore one Module, while Ecommerce and
Roastery remain distinct. Reverses ADR-0019 D2's "activity is a dimension, never a nav root" — for a
30-person F&B company the floor's daily workspace stays one click away, not hidden inside an abstract
"Operate" destination. BU grouping prevents the original failure mode (Kitchen's 5 loose links), and
the workflow-coherence test prevents one mini-app per station. First destination is **Home** (not
"Orient" — owner: "easier to understand"). Owner refinement 2026-07-10. See **ADR-0025 D1**.

### OD-REDESIGN-2 — One consolidated prototype (α IA + γ editor + β multiview + Standards/Shifts)

Consolidates three earlier mockup paradigms into one canonical prototype: **α's flat IA rail** +
**γ's Notion-like direct editing through a typed structured canvas** on every detail surface
(Objective/Project/Process/Task/Standard) +
**β's multi-view database** (Table/Kanban/Timeline) on Projects and Tasks-in-Project + the **Standards
quality-loop** + **Shifts** roster. The α/β/γ files retire as history. See **ADR-0025 D2**.

### OD-REDESIGN-3 — Task = PIC + Supervisor; RACI only on Objective/Project/Process (amended 2026-07-10)

Task ownership canonically uses **PIC + Supervisor**, not R/A aliases: PIC is the one person expected to
perform and close the Task; Supervisor is the one person who monitors, unblocks, and verifies it. Dense
surfaces say **PIC** and **Supervisor**; forms/details expand PIC to **Person in charge (PIC)** with helper
text. Always spell out Supervisor — **SPV** is a job-title abbreviation, not the Task relationship.
RACI is reserved for Objective, Project, and Process governance; Tasks have no C/I. The existing database
may retain responsible/accountable columns behind a compatibility mapping until a reversible migration is
planned, but future product language, specs, and APIs use PIC/Supervisor. Supersedes OD-P2's Task-level
RACI terminology and the 2026-07-09 Owner/Supervisor alias decision. Recorded in **`CONTEXT.md`**.

### OD-REDESIGN-4 — Standard is a first-class object; SOP is a sanctioned synonym

A **Standard** is the versioned execution specification a Process (and optionally a Project) runs to.
Owner refinement 2026-07-10 broadens it beyond numeric F&B controls: a Standard has typed steps of
**instruction/reference · confirmation · measured control · required form field · required
evidence/sign-off**. Checkable steps produce **Checks** → pass/fail → failed Check raises an
**Exception** → correction Task → evidence → audit trail. The Process owns recurrence and generated
work; the Standard defines how that work is performed correctly and proved. This supports espresso,
stock opname, monthly closing, onboarding, and procurement without introducing separate SOP/runbook
objects per department. "SOP" is a sanctioned synonym; never call the Process itself an SOP. Library
view in Work; canonical home remains the owning Process/Project page. Typed-step storage and versioning
require a dedicated ADR during engineering planning. Recorded in **`CONTEXT.md`**.

### OD-REDESIGN-5 — Shift is a roster unit; Café Areas share the pattern within one Team (amended by OD-REDESIGN-53)

A **Shift** = person + station/area + time window. OD-REDESIGN-53 later makes every Shift Team-scoped:
within a branch Team, one Café roster may span Kitchen + Bar Areas; HQ and Radiant do not share a Shift,
and Roastery carries its own. Drives check assignment (a
person's station's Standards → their checks today), records the on-shift context around an Exception,
and feeds Home's "your shift today." Correction-Task PIC/Supervisor follows the Process's generation
rules rather than silently redefining Task ownership from the roster. Week-view/swaps/recurring-builders
deferred. Recorded in **`CONTEXT.md`** (Shift entry).

### OD-REDESIGN-6 — IxD grammar target: Twenty CRM (one slide-over, one inline-cell, views-as-data)

The redesign's neatness/customisability target is the **Twenty CRM** interaction grammar, studied from
their codebase (`docs/reference/twenty-ixd-patterns.md`): (1) default open = right slide-over, escalate
to full page on "Open"; (2) the command palette IS the side panel (⌘K); (3) one inline-cell edit
primitive reused across table/board/page with a uniform commit contract (type/select → Enter/Tab/
click-outside commits, Escape cancels the uncommitted value—an intentional MOS divergence from Twenty) —
this is the rule that kills the scattered popovers/drawers/modals;
(4) tables/boards/calendars are views over the same records (a View = saved {filters, sorts, layout,
visible fields}); (5) create = new record + immediate inline title edit (no per-object modal);
(6) objects/fields/views/nav are metadata-driven and customizable. MOS adapts the *grammar*; the
*objects* differ (management-OS, not CRM). See **ADR-0025 D3** + **`docs/reference/twenty-ixd-patterns.md`**.

### OD-REDESIGN-7 — One record, one canonical page, many views (amended 2026-07-10)

A first-class record reached from Work, a Module, a parent record, Inbox, Home, search, or the deputy is
the **same object opening the same canonical renderer** (Lens-C invariant). Tasks list and a Project's
Task list are views of one Task collection; Work and Module Standard libraries are differently filtered
views of one Standard collection. Relationship sources show navigational pills or compact linked-record
lists, never embedded duplicate editors. Table/Kanban/Timeline are view renderers over the collection,
not alternate records. See **ADR-0025 D2/D3a**.

### OD-REDESIGN-8 — Work = one record workspace with collections and saved views (amended 2026-07-10)

Work is not a second dashboard and not a bundle of mini-apps. One compact collection switcher groups
**Execution** (Tasks, Process Runs), **Work systems** (Projects, Processes, Standards), **Direction**
(Objectives), and **Cadence/queues** (Signals, Follow-ups). Every collection follows the same
index grammar—filters, sorts, groupings, saved views, inline edit, inspector, full structured-canvas
page—with Table/Kanban/Timeline where applicable. Specialized queues may vary columns/actions but remain
views of canonical records. Work remembers the user's last view; a new user starts at **My Tasks**.
There is no Work widget composer: personal/deputy widgets belong on Home. Supersedes the July 9
Tasks-plus-manager-widgets version of this decision. See **ADR-0025 D9**.

### OD-REDESIGN-9 — The deputy is a first-class redesign surface; PMO is the floor to exceed

The deputy is **not a deferred port feature** — it is the headline interaction paradigm ("agent-native,
user-composed UI"; the owner: "it needs to be front-most since this should be an agent-native app"). The
redesign mockup builds it as a **real mocked surface**: a docked right panel (topbar sparkles opens it)
showing a grounded conversation tracing to real data, with the ability to compose a widget and drop it
into Home/Work. The PMO port (ADR-0018) wires the backend; the mockup proves the UX. PMO's deputy (the
battery) is well-engineered but only a side-panel UX — context-*aware*, not context-*acting*. Full gap
analysis: **`docs/reference/pmo-deputy-gaps.md`**. The redesign closes six gaps (ADR-0025 D5):
(1) inline `@` reach into any text surface; (2) the agent can navigate the user (`navigate` tool);
(3) composed UI drops into the workspace, not the panel transcript; (4) the agent is a first-class ⌘K
action, not a zero-results fallback; (5) write actions bind to the live in-context entity; (6)
per-surface agent threads scoped to the record/view. See **ADR-0025 D4 + D5**.

### OD-REDESIGN-10 — Interaction grammar: six binding IxD rules (Twenty-adapted)

The scattered popovers/drawers/modals of the current mockups converge to a **consistent grammar**
(ADR-0025 D3), adapted from the Twenty CRM (`docs/reference/twenty-ixd-patterns.md`):
(D3a) record click → right slide-over, "Open" escalates to full page; (D3b) ⌘K stays a fast popup for
nav/search/act, the deputy + inspector share the docked panel, ⌘K routes into it; (D3c) one inline-cell
edit primitive with a uniform commit contract (Enter/Tab/click-outside persists; Escape discards the
uncommitted edit and restores the saved value) across
table/board/page; (D3d) table/kanban/timeline are saved Views over the same records ({filters, sorts,
layout, fields}); (D3e) create = new record + immediate inline title edit (no per-object modal);
(D3f) views + widget composer + nav pinning are user-customizable (full data-model builder deferred).
See **ADR-0025 D3**.

### OD-REDESIGN-11 — Process definition and Process Run occurrence are distinct (owner 2026-07-10)

A **Process** is the permanent definition of recurring work and is never completed. Each scheduled or
manually started occurrence creates a first-class **Process Run** (for example, *July 2026 Monthly Close*
or *Retail Stock Opname · 31 July*) that owns the generated Tasks, required checks/forms/evidence,
progress, completion, and history for that occurrence. This gives Finance, HR, Marketing, Procurement,
Retail, Ecommerce, and Roastery one shared recurring-work runtime in **Work** without creating one Module
per department. A Process Run is an execution object, **not** a Project and not another cascade layer.
Rejected: generating detached dated Tasks with no run-level completion/history; generating a temporary
Project for every recurrence. The schema relationship and scheduling/idempotency contract require a
dedicated ADR during engineering planning.

### OD-REDESIGN-12 — Generated work uses the ownership-boundary rule (owner 2026-07-10)

When a Process Run is created, a generated step becomes a **Task** only when it needs an independent
R/A assignment, due date, status, blocker/dependency lifecycle, or reporting identity. A smaller step
that inherits all of those from its parent is a **Checklist item**. Structured values are captured as
form fields; assertions against a Standard are **Checks**; files/photos/sign-offs are evidence. Example:
*Reconcile Bank BCA* is a Task; *download statement* is a Checklist item; *closing balance* is a form
field; *difference = Rp0* is a Check; the reconciliation report is evidence. The author decides this
structure when defining the Process and linked Standard; the product must make that judgment explicit
and preview the resulting Process Run rather than converting every step into a Task automatically.

### OD-REDESIGN-13 — One guided Process designer; typed contracts are the human/deputy safety boundary (owner 2026-07-10)

Managers author recurring workflows through one progressive-disclosure **Process designer**: purpose,
owner/RACI, BU/Activity, trigger or cadence, generated Task definitions and dependencies, Checklist items,
typed Standard Steps (instructions, confirmations, measurements, input fields, evidence, sign-off),
exception rules, and a preview of the next Process Run. This is one authoring experience over separate
typed domain objects, not a freeform Notion document and not several disconnected admin editors.

Every core object (Project, Process, Task, Standard, and later Process Run) has a fixed typed Object
Contract with required and optional fields plus valid nested object types. Humans and the deputy use the
same contract. The deputy may draft a workflow from natural language or an uploaded SOP, but it cannot bypass
required fields, invent arbitrary shapes, or publish directly: validate → preview generated structure →
explicit manager confirmation → versioned publish. This is the ruthless abstraction that preserves a
Notion-like authoring experience while keeping agent generation fast, deterministic, and safe.

### OD-REDESIGN-14 — Task Supervisor inherits parent A by default, with an explicit override (owner 2026-07-10)

A Task under a Project or Process defaults its **Supervisor** from that parent's Accountable person. A
Process's generated Task definition may override Supervisor when a legitimate cross-functional ownership
boundary requires a different person; the normal path does not ask the author to repeat the inherited value. The designer
shows **Inherited from <parent>** or **Override** explicitly so a deputy cannot silently change oversight.
A Process Run snapshots the Process RACI and resolves each generated Task's PIC/Supervisor when it starts,
preserving historical ownership if the Process definition changes later. Correction Tasks follow the
same rule:
parent A by default, with an explicit Standard/generated-Task override when, for example, the on-shift
Supervisor must own the correction. Supersedes the stricter no-override recommendation considered during
the grill. **Amended by OD-REDESIGN-41:** an ad-hoc Task without a parent resolves Supervisor through
the PIC's BU-matching direct manager, ambiguity requires a choice, and a top-level PIC may self-supervise.

### OD-REDESIGN-15 — Initial Modules stay at three; support teams use the universal Work runtime (owner 2026-07-10)

The initial Module set is **Café (Kitchen + Bar Areas) · Ecommerce · Roastery**. The compact rail label
is **Café** and the expanded page title is **Café Operations**; "Retail" remains the owning BU context
and is not reused as the Module label because that BU also contains Ecommerce.
Finance, HR, Marketing, Procurement, and other support teams do not receive department shells merely
because they own Processes or Standards: they operate recurring work through Process definitions,
Process Runs, generated Tasks/Checklists, typed Standards/forms/evidence, and role-filtered views in
**Work**, with role-specific signals in Home and specialized Money/People surfaces where applicable.
A future workflow earns a Module only when it has specialized records and high-frequency interactions
that the universal Work runtime cannot express naturally—for example, a complete requisition → PO →
receiving → discrepancy lifecycle. The rail is a workflow map, never an org chart.

### OD-REDESIGN-16 — Notion-like means a typed structured canvas, not freeform data (owner 2026-07-10)

Every Project, Process, Task, and Standard opens as an immediately editable **structured canvas** with
no separate view/edit mode. Required typed properties are pinned and cannot be deleted; optional sections
and contract-valid nested objects can be added, hidden, and reordered; freeform text regions support
normal document blocks and mentions. The `/` menu only offers objects valid under the current contract
(for example, a generated Task definition, Checklist item, measured Check, input field, evidence requirement, or
sign-off inside a Process designer). The Object Contract and saved definition determine the initial
composition. Autosave must expose pending, saved, validation-error, and retry states. Humans and the
deputy manipulate the exact same typed
structure. This adopts Notion's immediacy and composability while rejecting arbitrary schemas, hidden
inference, removable governance, and unstructured source-of-truth data.

### OD-REDESIGN-17 — Home = required attention brief + authorized personal/deputy canvas (owner 2026-07-10)

Home's system-generated layer answers **"What needs my attention today?"**. It surfaces actionable,
role-scoped exceptions only: blocked Tasks, overdue/due Process Runs, failed Checks and Exceptions,
mentioned/actionable Signals, sign-off requests, and financial exceptions. Floor users also receive today's
Shift/Tasks/Checks; managers receive team and Process exceptions. Home does not duplicate Money's period
controls, KPI grids, trends, or detailed analysis. Every signal drills to its one canonical record.

Each user also receives a personal **structured canvas** that they or the deputy can compose from
contract-valid widgets. Composition is authorization-preserving: queries and actions execute with the
viewer's JWT/RLS/capabilities, never a deputy service-role shortcut, and cannot reveal inaccessible data
through summaries. Deputy proposals require preview + explicit acceptance before persistence. The
system brief is mandatory and cannot be removed; whether a user may place their personal canvas before
or after it is the next explicit preference decision rather than an accidental layout behavior.

### OD-REDESIGN-18 — Home region order is a user profile preference (owner 2026-07-10)

Personal Profile stores **Home order = Attention first | Personal canvas first**. Attention first is the
default for every role and new user. The required system brief cannot be removed; if the personal canvas
comes first, the Home header preserves a visible **Needs attention · N** summary and jump target so the
user does not lose awareness. The preference persists per user and the responsive layout adapts the two
regions without changing their chosen order. Only the user may change this top-level order: the deputy
can propose and arrange widgets inside the personal canvas but cannot move the system brief.

### OD-REDESIGN-19 — One stack-navigated Record Panel; no nested physical drawers (owner 2026-07-10)

Normal selection of a record or relationship pill opens its canonical record in one right-hand Record
Panel. Selecting a related record inside the panel pushes it onto the same internal stack; the product
never layers a second drawer. Panel Back and Browser Back pop one level and restore scroll/focus; Close
`×` closes the whole stack and returns to the underlying source page; "Open full page" escalates the
current record. Direct URL, refresh, new-tab, and copied links render the canonical full page because
every pill retains a real canonical `href`. Re-selecting an existing stack record pops to it; a fourth
panel level escalates to full page. The page and panel share one renderer with different presentation
modes. Sources use pills/linked lists instead of embedded record editors. References: Fluent Drawer
single-overlay and 2–3-step guidance; React Router background-location convention; Twenty panel stack.

### OD-REDESIGN-20 — One canonical Inbox, presented as full page or quick panel (owner 2026-07-10)

Inbox remains a router to originating records, not a second place to perform their work. Rail/bottom-nav
Inbox opens the full canonical collection for sustained triage; the top-bar badge opens the same
collection in quick-panel mode. Inbox, Deputy, and record inspection share one right-panel host and one
navigation stack, never competing drawers: selecting an Inbox item pushes its canonical record, Back
returns to Inbox, and Close returns to the underlying page. Read/handled state is shared. On phone Inbox
opens as a full page, not an overlay. This is dual presentation of one collection, not two inboxes.

### OD-REDESIGN-21 — Contextual primary actions replace the global Capture FAB (owner 2026-07-10)

There is no app-wide action ambiguously named **Capture**. Universal top-bar `+ Create` and ⌘K expose
every typed object the viewer is authorized to create. Each surface names its actual primary job: Work
creates the current collection's object; Process offers **Start run**; Standard offers **Run check**;
Café offers **Log production**; Roastery offers **Log roast**; Ecommerce uses its own fulfillment verb;
Money and Inbox show no unrelated floating action. On phone, a Module may use a thumb-reachable FAB or
sticky action only for its one high-frequency local capture flow. Typed object creation stays inline;
focused operational submissions may use a sheet/form. This supersedes the July 9 global Capture FAB
probe and requires the eventual `DESIGN.md` amendment to distinguish sanctioned local mobile FABs from
the rejected global FAB. **Amended by OD-REDESIGN-46:** a universal mobile `+` Action Launcher is allowed
because it opens prescribed actions and executes no ambiguous default.

### OD-REDESIGN-22 — Inline edit uses conventional save/cancel semantics (owner 2026-07-10)

One inline-edit primitive governs table, board, panel, and structured-canvas fields. **Enter** validates,
saves, and closes; **Tab/Shift+Tab** validates, saves, and moves; click-outside validates and saves;
**Escape discards the current uncommitted value and restores the last saved value**. Validation failure
keeps the field open with an inline error. Multiline Enter inserts a line and Cmd/Ctrl+Enter saves.
Autosave shows pending/saved/error/retry, with Undo after successful saves where practical. This is an
intentional MOS divergence from Twenty's Escape-persists behavior and supersedes every inconsistent
prototype implementation or label saying otherwise.

### OD-REDESIGN-23 — Core navigation is fixed; users customize saved-view pins only (owner 2026-07-10)

Home, Work, authorized Money, Inbox, BU groupings, and authorized Modules are organization-owned and
stable: users and deputies cannot rename, hide, or reorder them. Users may pin saved Work views beneath
their owning destination or Module, reorder/unpin those personal pins, and receive deputy proposals that
persist only after explicit acceptance. Examples include My overdue Tasks, this month's Finance runs,
Retail Exceptions, and Standards needing review. Phone bottom navigation contains core destinations only;
pins remain inside the owning destination menu. This preserves a learn-once company IA while providing
fast personal retrieval, and replaces ADR-0025 D3f's broader "nav is customizable" wording.

### OD-REDESIGN-24 — First deputy slice is front-most with reversible direct Task writes (amended 2026-07-10)

The deputy ships visibly through the top bar, ⌘K, inline `@`, authorized current-surface context,
grounded sources, navigation, and per-surface threads. It may propose Home widgets and Work saved
views/pins and persist typed Objective, Project, Process, and Standard drafts. It may directly
create/edit Tasks, add Task comments/activity updates, and change Task status when authorized. It acts
with the viewer's JWT/RLS/capabilities. Publishing/activation, Standard adoption, Run start/completion,
Check submission, approvals, and financial actions require explicit human confirmation. Every write
uses the same authorized, idempotent, audited domain command as the human UI. See ADR-0025 D11/D19.

### OD-REDESIGN-25 — Persistent Draft is limited; other deputy suggestions are ephemeral Proposals (owner 2026-07-10)

Objectives, Projects, Process definitions, and Standards have a persistent Draft before activation or
publication. Tasks have no Draft:
an authorized deputy writes the real Task directly. Home widgets, Work saved views, and pins persist only
after an accepted Proposal preview. Process Runs, Checks, Exceptions, and factual execution records are
never Drafts or Proposals; they exist only through the authorized operational action. See ADR-0025 D12.

### OD-REDESIGN-26 — Personal UI compositions are separate JSONB tenant rows, not a blob on Person (owner 2026-07-10)

Reuse and extend `mos.user_views` for personal Home canvases and Work saved views. A row carries
normalized owner/org/kind/context/name/scope/lifecycle metadata and a versioned, schema-validated JSONB
composition spec. The spec stores registered widgets, layout, presentation, and authorized query specs;
it never stores result rows or executable code, and it renders under the current viewer's JWT/RLS.
`shared.people` stays a login-optional directory record. Stable cross-device scalar settings such as
Home order use explicit columns in an RLS-protected `mos.user_preferences` row; per-viewer placement of
shared views uses separate pin rows. Device-only ergonomic state may remain local. See ADR-0025 D13 and
ADR-0017 D5–D6.

### OD-REDESIGN-27 — Definition publishing combines `can()` scope with record RACI (owner 2026-07-10)

Replace the old hard-coded `ops_lead`/admin assumption for operational definitions. `can()` determines
whether a person may author or publish within the relevant business-unit scope; record RACI determines
authority over that particular definition. Process R may create/edit its Draft and Process A publishes.
Standards have no RACI: scoped `standard.publish` governs their publication, and each consuming
Process/Project A governs adoption of a published Standard version. Admin has a
visible, audit-logged emergency override. The deputy inherits the human's effective access but cannot
publish in its first production slice. The UI says Edit draft, Send for approval, and Publish rather
than exposing the permission machinery. See ADR-0025 D14. The owner's further direction is an admin
effective-permission matrix with role-based defaults plus sparse individual configuration; precedence
and guardrails are fixed by OD-REDESIGN-28 and amended ADR-0020.

### OD-REDESIGN-28 — Role defaults plus sparse individual allow/deny overrides (owner 2026-07-10)

The admin settings UI presents an effective person-by-capability matrix backed by editable RBAC defaults
and sparse individual exceptions. A cell is Inherited, Allowed, or Denied and can Reset to role default.
Applicable permissions resolve explicit deny → explicit allow → union of role grants → default deny,
with self/own-BU/selected-BU/org scope where the capability supports it. Protected administration
invariants and last-admin safety cannot be overridden; every change is audited. Record-specific rules
remain a second gate and require a separate explicit override capability to bypass. This deliberately
amends ADR-0020's former "no per-person grants" clause without storing a copied matrix per employee.

### OD-REDESIGN-29 — System Object Contracts replace Template; user-authored Blueprint is evidence-gated (owner 2026-07-10)

The owner's earlier “template” means a system-wide, code-owned **Object Contract** defining each object
type's required/optional fields and relationships, validation, valid nested objects, and permitted canvas
blocks. It is not a business record or admin-editable schema. A Standard must have BU, name, version,
and Standard Steps, but a governing parent and measurements/units are optional. Remove Template as a
current first-class object. Reuse is **Duplicate as Draft**. A user-authored, versioned **Blueprint** is
deferred without tables or UI until multiple independent definitions are repeatedly copied and manually
synchronized across BUs; only that evidence justifies propagation, adoption, and upgrade machinery. See
ADR-0025 D16 and `CONTEXT.md`.

### OD-REDESIGN-30 — Standard is a canonical BU asset; adoption belongs to each consuming definition (owner 2026-07-10)

A Standard is versioned, scoped to an owning BU, may link to zero or many Processes/Projects, and has no
RACI. Scoped `standard.publish` controls publication. A consuming Process/Project A independently
controls whether and which published version its definition adopts. Links are version-aware; publishing
a Standard never silently mutates active operations. Pure reference material without executable
instruction/check/input/evidence/sign-off semantics is not a Standard. Approval, effective-date, and
notification behavior is fixed by OD-REDESIGN-31. See ADR-0025 D17–D18.

### OD-REDESIGN-31 — Standard upgrade = publish, notify each consumer, approve diff, adopt with effective date (owner 2026-07-10)

Publishing creates an immutable Standard version and never changes consumers directly. Each linked
Process/Project gets a deduplicated actionable Inbox item for its A and R showing the diff and current vs
proposed pin. Its A approves a new definition revision and effective date; R is notified, C may be engaged
during review, and I receives the adopted-change notice. New links visibly default to the latest published
version and require confirmation. Future unmaterialized Runs starting on/after the date use the adopted
version; started/completed/materialized Runs keep their snapshots. Adoption is audited and affected
future assignees are notified once assignments exist. Doorbell channels may link to Inbox, but approval
stays on the canonical record. Each consumer decides independently. See ADR-0025 D18.

### OD-REDESIGN-32 — Deputy writes Tasks directly; reversal is archive/restore or audited compensation, never deletion (owner 2026-07-10)

The deputy may persist Drafts for Objective, Project, Process, and Standard definitions and directly
create/edit Tasks, add Task comments/activity updates, and change Task status within its inherited
authorization. Consequential transitions require explicit human confirmation. Human UI, deputy, and
future external-agent writes use one capability-gated, idempotent, optimistic-concurrency-aware domain
command layer. Reverse create with Archive/Restore, edits with Revert, status with compensating Undo, and
comments with Retract plus an audit tombstone. Never hard-delete as “undo”; downstream effects and
notifications require their own correction event. See ADR-0025 D11/D12/D19.

### OD-REDESIGN-33 — Signal supersedes Weekly Update and Daily Log; clean data redesign is authorized (owner 2026-07-10)

Remove mandatory Weekly Update filing and replace the lightweight operations-only Daily Log/
`ops.log_entries` with one organization-wide, authorization-scoped Signal model. Signals are real-time,
attributable factual notes with occurrence/context/category/severity/mentions/links; deputy dictation
writes under the human's identity. They have no PIC/Supervisor/due/status: mentions create Inbox nudges,
required action becomes a linked Task, and failed Checks remain Exceptions. Specialized operational
records remain canonical and may emit linked summary Signals. Weekly/team summaries are generated from
Tasks, Projects, Process Runs, Signals, and domain events. Because the app has never been used, redesign
may replace legacy business schemas with a cleaner baseline rather than preserve Weekly Update/Daily Log
compatibility; actual environment resets and deploys remain owner-gated. See ADR-0025 D20.

### OD-REDESIGN-34 — Replace legacy migrations with a clean domain-ordered baseline (owner 2026-07-10)

Because MOS has never had production users, the redesign does not carry forward unused schema/API
compatibility. The engineering plan must replace the long legacy migration chain with a small ordered
baseline across `shared`, `mos`, `ops`, `integrations`, and `reporting`, grouped by coherent domains rather
than one mega-file. Remove retired Weekly Update/Daily Log storage, Task RACI compatibility, obsolete
enums/functions/policies, and other superseded seams. Rebuild app contracts, RLS, tests, and seeds against
the new baseline. Preserve external ESB/reporting boundaries only where they still serve the adopted
model, and revalidate the reporting snapshot job. Local/staging reset requires backup + verification;
staging reset and every deploy remain explicit owner gates. The eng-planner must author a dedicated data-
baseline ADR and rollback/reset plan before implementation; this grill decision is its accepted input.

### OD-REDESIGN-35 — Future MCP is a per-person adapter, never a parallel backend or authority model (owner 2026-07-10)

Build the clean baseline around one protocol-neutral query/domain-command/audit boundary used by UI,
deputy, and later remote MCP. Each MCP connection authenticates a human with resource-bound OAuth and
maps to `shared.people`; no direct database access, `service_role`, shared identity, or token passthrough.
Existing `can()` + record governance + RLS decide every call. Low-risk reversible Task/Signal writes may
execute; definitions become Drafts; consequential transitions create a MOS approval request. Audit human
actor, client/source agent, command, idempotency, result, and reversal. Admin trusts clients/providers;
each person connects/consents. Coarse MCP consent scopes do not replace fine-grained capabilities. MCP
transport is deferred, but its reusable seam is baseline work. Eng-planner must author a dedicated ADR
against the current MCP/OAuth spec before build. See ADR-0025 D21.

### OD-REDESIGN-36 — Signal read reach flows upward through information layers; mentions grant exceptions (owner 2026-07-10)

A Signal is readable by its owning Team, BU-scoped Roles over that Team's parent BU, viewers in a
configured higher BU Signal visibility layer, and explicitly mentioned people/Teams/BUs; sibling Teams
otherwise cannot read it. The information-layer order is
admin-configured and separate from org `reports_to`, with an initial example Operations < Marketing/
support < Finance/control < Management. RLS evaluates same Team → parent-BU scope → sufficient higher
layer → explicit person/Team/BU grant → authorized override → deny. Individual `can()` overrides apply. Read
reach does not notify everyone: mentions/action events, not visibility, drive Inbox. Confidential
narrowing is deliberately rejected by OD-REDESIGN-37; `@BU` delivery remains a subsequent decision.
See ADR-0025 D22–D23 and `CONTEXT.md`.

### OD-REDESIGN-37 — Signal stays operational; confidential matters use a separate future workflow (owner 2026-07-10)

Do not add a Restricted Signal mode. The Signal model is intentionally suitable for predictable upward
operational visibility. Confidential HR/legal/medical/whistleblowing or similarly sensitive content is
rejected from Signal capture and routed to Gordi's approved private channel until a separately specified
confidential case/reporting Object Contract exists. That future capability needs independent RLS,
retention, disclosure, audit, and escalation—not a boolean on Signal. UI/deputy detection is only a
pre-save warning; command/MCP logs must not echo rejected sensitive payloads. See ADR-0025 D23.

### OD-REDESIGN-38 — Person/Team/BU mentions explicitly grant and fan out (amended 2026-07-10)

A Signal mention is both access grant and intentional Inbox nudge. `@Person` targets one; `@Team` every
current Team member; `@BU` every current person across child Teams plus BU-scoped Roles. Deduplicate and
preview Team/BU recipient count; BU requires `signal.mention_bu`. Visibility alone never notifies. Future
members gain read but no retro-notification; each recipient has personal read/handled state. Mentions do
not create ownership—action requires Task PIC/Supervisor. See ADR-0025 D24/D37.

### OD-REDESIGN-39 — Signal is factual context; create/link separate Tasks through a many-to-many relation (owner 2026-07-10)

Never promote/convert a Signal or give it a resolved status. From Signal, **Create follow-up Task** pushes
the canonical Task composer in the same panel stack with Signal context prefilled; save returns to the
Signal with the Task under Linked work. **Link existing Task** prevents duplicates. One Signal may link
many Tasks and one corrective/prevention Task may link many Signals. Signal may display derived open/done
counts but owns no work lifecycle, and Task completion/archive never removes historical Signals. See
ADR-0025 D25 and `CONTEXT.md`.

### OD-REDESIGN-40 — Tasks may be ad hoc; Project/Process is an optional direct classification (owner 2026-07-10)

Every Task requires Team, PIC, Supervisor, and Status, but not a Project/Process. BU/Site derive from
Team. Tasks created inside a
Project/Process inherit it and Process-Run-generated Tasks require their generating Process/Run; other
Tasks may remain parentless or be linked later through an audited edit. UI derives **Ad hoc** for
unparented Tasks and provides a saved view/volume signal—never a new Status or fake Miscellaneous parent.
Deputy may suggest classification but cannot attach one silently. This amends ADR-0014's “direct and
permanent” wording: an existing link is direct and never routes through Output; it is not mandatory. See
ADR-0025 D26.

### OD-REDESIGN-41 — Ad-hoc Supervisor defaults through PIC's relevant manager; ambiguity never guesses (owner 2026-07-10)

Resolve Supervisor in order: explicit choice → generated-Task definition override → parent A → PIC's
direct manager for the Role matching Task BU → PIC when no manager exists. Multiple remaining manager
paths require human selection. Same-person PIC/Supervisor is valid. UI exposes the source and audits
changes. Signal mentions never imply ownership; deputy uses only explicit user ownership or asks before
commit. See ADR-0025 D27 and `CONTEXT.md`.

### OD-REDESIGN-42 — Signal category is optional post-capture enrichment over stable families (owner 2026-07-10)

Signal post requires only content, owning Team, occurrence time, and author/source. Category is optional:
stable system families (Supply/vendor, Equipment/facility, Inventory/availability, Quality, Customer,
People, Process, Other) support cross-team comparison; admin-managed BU subcategories provide local
detail. No initial free-form tags. Deputy suggests with confidence; low-confidence stays Uncategorised in
a saved review view, never blocks capture. Rename/merge/archive preserves historical mapping. Category is
not root cause, visibility, urgency, or Status. See ADR-0025 D28 and `CONTEXT.md`.

### OD-REDESIGN-43 — Signal attention = FYI / Needs attention / Urgent, never Status (owner 2026-07-10)

FYI is default; Needs attention and Urgent affect ordering, treatment, Home, and delivery to mentioned
recipients/subscribers. Attention never changes visibility or creates lifecycle, ownership, SLA, due
date, resolution, or Task. Higher levels merely suggest Create follow-up Task. Deputy may use explicit
wording; inferred Urgent requires confirmation. Urgent may invoke configured PWA/doorbell delivery but
not all readers. Changes are audited. See ADR-0025 D29 and `CONTEXT.md`.

### OD-REDESIGN-44 — Signals are intentional; routine records/events never auto-mirror into the feed (owner 2026-07-10)

Allow Signal creation only by explicit human/deputy post, deliberate Share as Signal from a canonical
record, or a published Process/Standard rule configured for a meaningful condition with previewed
audience/category/attention/source. Non-human Signals link their source/rule. Task/Run/module changes,
production logs, approvals, inventory movements, and audit events remain domain events; failed Checks
remain Exceptions. Generated summaries read those sources directly. Rule emissions require idempotency,
rate, and deduplication controls. This retires the Daily Log automatic-mirror pattern. See ADR-0025 D30.

### OD-REDESIGN-45 — Signal corrections create revisions; wrong provenance retracts and reposts (owner 2026-07-10)

Author/deputy may correct body, occurred-at, category, and attention only through immutable visible
revisions. Owning Team/source cannot change after post; use reasoned Retract + repost. Mention additions
grant/notify; removal revokes only its explicit grant, retracts the notification, and warns prior viewing
cannot be undone. Material body/attention edits notify mentioned recipients; category cleanup does not.
Rule-emitted body/source is immutable. Retraction removes default feed/analytics presence but preserves an
audit tombstone. No hard delete. See ADR-0025 D31 and `CONTEXT.md`.

### OD-REDESIGN-46 — Mobile FAB + desktop `+ Create` share one prescribed Action Launcher (owner 2026-07-10)

Use one command registry through a persistent phone `+` FAB and desktop/tablet top-bar `+ Create`.
Opening it shows stable Share Signal, Ask Deputy/dictate, Create Task, and More actions plus at most one
context action such as Start Run/Run Check/Log production/Log roast. Actions are capability-filtered,
context-prefilled, and never algorithmically reordered; More opens the full authorized object palette.
⌘K/keyboard/deputy invoke the same commands. The FAB is not navigation and does not execute an ambiguous
default, so core-only bottom navigation and the rejection of global Capture both remain intact. See
ADR-0025 D32.

### OD-REDESIGN-47 — Signal comments clarify; acknowledgement says seen; neither creates lifecycle (owner 2026-07-10)

Add entity comments plus optional per-person Acknowledge. Acknowledge is visible “seen,” separate from
private Inbox read/handled, and never means owner/completed/approved/promised; Signal remains statusless.
Comments may mention people/BUs under the normal access/fan-out rules. Notify author, explicit mentions,
and explicit Followers; a BU mention does not subscribe all members to every reply. If discussion creates
a commitment, offer Create/Link Task. Free unrelated chat remains outside MOS. See ADR-0025 D33.

### OD-REDESIGN-48 — Replace weekly filing with live sourced period views and optional Automation delivery (owner 2026-07-10)

Home/Work expose Today, This week, and Last week over authorized Tasks, Project progress, Process Runs,
Exceptions, Signals, and domain events. Deputy summaries are grounded and link canonical sources.
Managers may save/request them and optionally schedule Inbox/PWA-doorbell delivery with an as-of time.
No Weekly Brief object, employee filing, Draft/Submitted state, missing reminder, or review roster is
created. Context absent from structured records is captured as Signal when it happens. See ADR-0025 D34.

### OD-REDESIGN-49 — Signal author is independent from its owning Team (owner 2026-07-10)

Author records who reported; owning Team records where the observation applies and drives default layered
visibility. They may differ. Cross-Team post requires scoped capability; author retains read/correction
rights. One primary Team is required and other affected Teams/BUs are mentioned. Preview destination,
attention, and fan-out before cross-Team posting. Management may therefore post an FYI into Gordi HQ
Operations without making it management-only. See ADR-0025 D35–D36.

### OD-REDESIGN-50 — Team is below BU; Signal belongs to Team and derives BU/Site (owner 2026-07-10)

Correct the old “BU = team” conflation. BU is the functional/accountability parent; Team is the concrete
operating group under one BU; Site is an optional physical branch reference. Roles have BU and optional
Team scope; no Team means BU-wide. People join Teams through explicit effective-dated memberships and a
Team-scoped Role requires matching membership. Signal requires one owning
Team and derives BU/Site. Visibility walks Team → parent-BU-scoped Roles → configured higher BU layers;
sibling Teams such as HQ Operations and Radiant Operations do not see each other by default. Site and
Stock location remain distinct. See ADR-0025 D36 and `CONTEXT.md`.

### OD-REDESIGN-51 — `@Team` is branch-level nudge; `@BU` is capability-gated cross-Team fan-out (owner 2026-07-10)

Use `@Team` to grant/notify one concrete group and `@BU` to span all current people in its child Teams
plus BU-scoped Roles. BU fan-out requires `signal.mention_bu`; both preview and deduplicate recipients.
Owning Team alone never notifies. Future members gain read but no retroactive notification. No `@Site`
initially. This makes `Owning Team: HQ Operations + @HQ Operations` HQ-only, while `@Retail Ops`
deliberately includes Radiant. See ADR-0025 D37.

### OD-REDESIGN-52 — Admin configures org structure and each Person's separate Team/Role/access assignments (owner 2026-07-10)

Admin Settings—not SQL—creates/renames/archives/orders BUs, Sites, Teams, Signal visibility layers, org
Roles, and reporting lines. Per Person it assigns one primary plus optional additional effective-dated
Team memberships, org Roles, access-role defaults, and individual capability overrides. Team membership,
org Role, and Access role are separate concerns; BU derives from Team, while BU-scoped Roles express
BU-wide responsibility and Team-scoped Roles require membership. Transfers end/start membership history;
referenced structure archives; every change is audited and last-admin protections remain. See ADR-0025
D38 and ADR-0020.

### OD-REDESIGN-53 — Governance definitions are BU-scoped; execution records are Team-scoped (owner 2026-07-10)

Objectives, Projects, Processes, and Standards belong to a BU. Signals, Tasks, Process Runs, Shifts,
Checks, and Exceptions require one Team and derive BU/Site. Projects may list participating Teams, but
each Task has one executing Team; cross-Team work splits into Team Tasks under the shared Project. A
Person with scoped `process.adopt` acts for a Team to adopt BU Processes with local cadence/assignment
defaults; each Run belongs to one Team and generated
Tasks inherit it. Standards remain BU-canonical and Team/Process adoption pins their versions. The same
model covers central single-Team BUs. See ADR-0025 D39 and `CONTEXT.md`.

### OD-REDESIGN-54 — Process adoption is explicit and independently versioned per Team (actor amended by OD-REDESIGN-55; owner 2026-07-10)

Process A publishes an immutable BU version; each adopting Team gets a diff notification. Scoped
`process.adopt` reviews changed steps/Standards/cadence/generated Tasks/assignment defaults, confirms
local config, and chooses effective date. Publication never auto-upgrades Teams. Existing/materialized
Runs retain snapshots; future unmaterialized Runs use the new adoption. New Teams confirm latest version.
Adoption may pause/resume but cannot rewrite/fork the BU Process; structural changes return to Process
R/A. Notify Process R/A and Team operators; do not add Team RACI. See ADR-0025 D40.

### OD-REDESIGN-55 — Team is scope; scoped Role-derived `can()` determines what each Person may do (owner 2026-07-10)

Correct shorthand that implied a Team acts. People act through `can()` inherited from admin-configured
org-Role → Access-role defaults plus individual overrides, scoped to own Team, selected Teams, BU,
selected BUs, or org. Team membership, org Role, and Access role remain separate; Admin People & access
shows all inherited sources. Illustrative profiles: frontline roles execute assigned work and Signals;
branch Supervisor manages one Team; cross-branch manager operates selected Teams; Process publication
still needs A + capability. **Director assumption:** adoption edits only parameters/optional branches the
published Process declares Team-configurable; structural variation requires a Process revision. See
ADR-0025 D41 and amended ADR-0020 D3/D11.

## OPEN OD items live in `docs/backlog.md` → THE WALL.
</content>
