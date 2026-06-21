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
base URL **`stg-erp.esb.co.id`** (Phase-4 follow-up); production is **GKID**, served at
**`services.esb.co.id`**. The **outbox worker (OD-P4-5 / ADR-0012 D2) carries an explicit ESB-target
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
The ESB staging sandbox (branch `GOO`, `stg-erp.esb.co.id`) validates ESB **call mechanics** but holds only
test data — NOT GKID's real product/BOM IDs. Real-data/real-ID validation is the **single-WIP proof-push on
GKID** at the switch. (Refines OD-P4-6.)

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

---

## OPEN OD items live in `docs/backlog.md` → THE WALL.
