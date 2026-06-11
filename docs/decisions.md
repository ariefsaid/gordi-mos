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

### OD-DIR-4 — Auth
Supabase Auth is the shared identity layer. Cloudflare Access is NOT the long-term MOS auth model
(50-user free-tier cap); CF Access may remain where already useful.

### OD-DIR-5 — Lightweight RACI v1
RACI = fields on tasks (`responsible_person_id`, `accountable_person_id`, `consulted_person_ids`,
`informed_person_ids`), visible + filterable on lists and detail. NO matrix UI until usage shows the shape.

### OD-DIR-6 — Kitchen stays put
Kitchen app keeps running unchanged. Near-term: mirror approved kitchen activity into `ops` as daily
updates. Migration/cockpit ideas deferred until MOS first slice is stable.

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

## OPEN OD items live in `docs/backlog.md` → THE WALL.
