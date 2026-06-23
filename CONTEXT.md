# Gordi MOS

Vocabulary for Gordi's Management Operating System — the internal app for task ownership,
lightweight RACI, weekly updates, and daily ops visibility. Glossary only (per grill-with-docs
rules): no specs, no implementation notes. Heritage terms trace to the dormant Notion Management
OS constellation (see `docs/decisions.md` OD-P0-9).

## Work

**Task**:
The unit of owned work and the **cascade-bridgeable unit** (layer 6) — always carries R and A people, a
business unit, and a status. Its permanent cascade parent is an **Initiative** (Program/Process); the
link is an additive nullable seam (ADR-0003/0014) so the cascade grows in without reshaping the task. A
Task never routes *through* an Output — Output is an optional side-grouping, not a link in the chain.
_Avoid_: action item, to-do, work item, ticket

**Checklist item** (a.k.a. subtask):
A lightweight step under a task — a label + done flag + order, nothing more. It has NO RACI, status,
business unit, or due of its own, and does NOT bridge into the cascade (only its parent Task does).
Distinct from a Task; "subtask" in conversation means this, not a nested task.
_Avoid_: subtask (as a second full task), sub-item

**Status** (of a task):
One of **Open · In Progress · Blocked · Done**. "Decided not to do" is expressed by archiving, not a
status. ("Blocked" subsumes the old Notion Waiting-* family — see below.)
_Avoid_: state, stage

**Archived** (a task):
Soft-removed via an `archived_at` timestamp — hidden from default lists, still findable by filter,
reversible. Replaces hard deletion entirely; no task row is ever destroyed.
_Avoid_: deleted, closed, cancelled (as a verb for this)

**Business Unit**:
One of Gordi's operating areas — Cafe Ops – General, Kitchen and Bar, Roastery, Sales – CRM,
Finance and People. Every task and person belongs to one. (Mockups use a fictional 4-unit canon;
the real five are what gets seeded.)
_Avoid_: team, department, division

**Blocked**:
A task that cannot proceed until something outside the R person's control resolves. Subsumes the
old Notion "Waiting Internal / Waiting External / Waiting Approval" family.
_Avoid_: waiting, on hold, stuck

## Cascade (Strategy-to-Execution Stack)

The six-level spine the MOS grows into — **Strategy → Objective → Outcome → Program/Process → Output →
Task** (vault: Strategy-to-Execution Stack). Each level has its own owner, timebox, and measure; lower
levels *contribute* up, they don't copy down. The first slice builds three (Objective · Initiative ·
Task); the rest are vocabulary that folds in additively (ADR-0014). Adopted because a 3-level model
collapses the two cuts that make recurring work trackable — aspiration≠measurement (Objective≠Outcome)
and work-system≠artifact (Program/Process≠Output).

**Objective** (layer 2):
A yearly, measurable goal that work rolls up to — the "what we want this year." Carries A/R ownership and
a lane; it is the grouping a person's work is read against. (Strategy, layer 1, folds in above later as
the same self-similar shape, via a nullable parent.)
_Avoid_: goal, mission, OKR (that's the measurement layers)

**Outcome** (layer 3 — vocabulary now, table later):
The KPI/KR target that *proves* an Objective is being met — the number, distinct from the aspiration.
Deferred; folds in between Objective and Initiative additively.
_Avoid_: metric (the measurement act), KR (one kind), result

**Initiative** (layer 4 — canonical entity; **name provisional, owner to confirm**):
The owned work-system that moves an Outcome — one entity with a **type: Program | Process**. Carries A/R
ownership, a business unit, a lane, and a nullable Objective link. It is a Task's permanent cascade parent.
_Avoid_: project (superseded as the single shape), workstream, work (rejected umbrella term)

**Program** (an Initiative `type`):
Bounded, time-boxed **change** work (Transform/Optimize lane) — scope, an end, milestones. E.g. designing
a new menu.
_Avoid_: project (say Program), initiative (that's the entity, not the type)

**Process** (an Initiative `type`):
Standing, recurring **run** work (BAU lane) — never "done," produces repeating Outputs. E.g. daily IG
content, daily fulfillment. The home for daily ongoing *assigned* work — NOT the reserved term
**Activity** (a task timestamp), and distinct from the **Daily Log** (the factual record that something
*happened*, owner-less; a Process is owned recurring work). Person-load reads from Processes/Programs a
person is A/R on, never from Daily Log entries. A Process *uses* SOPs but is not one.
_Avoid_: SWP (the wiki's term — say Process), routine, SOP (that's documentation), activity (reserved)

**Output** (layer 5 — vocabulary now, table later):
A discrete deliverable a Program/Process produces in a week/month — the unit of committed load ("2–5 per
person per week; tasks are infinite, outputs are not"). Deferred; folds in as an optional grouping that
*also* belongs to the Initiative — never inserted between Task and Initiative (ADR-0014).
_Avoid_: deliverable, milestone (one kind), artifact

**Lane**:
*Why* a piece of work exists — **Run/BAU** (keep service steady, KPI-measured), **Optimize** (harden /
improve, OKR-measured), **Transform** (new capability, OKR-measured). A classification on Objectives and
Initiatives; incidents/fires sit inside Run as a sub-queue.
_Avoid_: category, stream, type (reserve `type` for Program|Process)

## Ownership (RACI)

**Accountable / Responsible per layer**:
The A/R split is not task-only — every cascade layer (Objective · Initiative · Output · Task) carries an
Accountable and a Responsible owner (the wiki's per-layer ownership model; a cross-functional Outcome gets
a single **DRI**). C/I stay task-level. A person's "load" is read from the layers they are A or R on — so
RACI-on-a-task is one instance of a uniform ownership shape, not the product's headline.
_Avoid_: owner (ambiguous as a field), single-owner-per-layer

**Responsible (R)**:
The one person doing the task. Notion heritage: "Assigned to" / "PIC". Shown as the row avatar in
lists (UI column label "Owner" = the R person).
_Avoid_: PIC, assignee, doer, owner (as a field name)

**Accountable (A)**:
The single person answerable for the task's outcome; may equal R. Notion heritage: "Supervisor".
_Avoid_: supervisor, approver

**Consulted (C)** / **Informed (I)**:
People whose input is sought (C) or who are kept in the loop (I). Multi-person; visible on task
detail only.
_Avoid_: watcher, CC, stakeholder

## Cadence

**Weekly Update**:
A person-keyed recap of one person's week — a free-text summary plus a list of update lines. Keyed by
(person, week). Everyone files one (incl. top-of-chain, who has no reviewer); a manager reads their
reports' (upward-only — author + manager chain, OD-P1-3) and files their own upward. Person-keyed is a
deliberate change from Notion's project-keyed "Project Updates".
_Avoid_: project update, status report, check-in

**Update line**:
One free-text row inside a weekly update — what was worked on — carrying a **progress marker**. It is
NOT linked to a Task (deliberate: a weekly recap is narrative + self-reported progress, not
task-tracking). Distinct from a Task and from a Checklist item.
_Avoid_: task (a line is not a task), entry

**Progress marker**:
The done/achieved cue on an update line — **Done · In progress · Blocked**. Distinct from a task's
**Status** (an update line has no Status; it is self-reported, not the task's real state).
_Avoid_: status (reserve that for tasks)

**Submitted** / **Draft** (a weekly update):
A weekly update is **Draft** (editable) until the author **Submits** it, which locks it read-only (the
stable thing a manager reviews). The author may **Reopen** a submitted update back to Draft, edit, and
re-Submit. Filing after the Friday due / week close is allowed ("filed late") — weeks never hard-lock.
_Avoid_: filed (as the status name — say Submitted), published, locked

**Log entry** (the **Daily Log**):
A record that something *happened* on the floor — past-tense and factual: a typed (production ·
receiving · QC · follow-up · other), business-unit-badged operational happening, manually added now
and mirrored from ops apps (kitchen, future roastery) later. It is NOT work-to-do (that's a Task) —
no owner / RACI / status, just *when it occurred*. The chronological surface is the **Daily Log** (the
`/ops` feed). A log entry may carry **needs attention** and link to a Task (the follow-up seam).
The user-facing surface name is **Daily Log** (owner rename 2026-06-12, was "Ops Log"); the internal
schema/route/module stay `ops` / `/ops` / `opsLog` (OD-DIR-3 — internal seams, not user-facing).
_Avoid_: event (collides with cafe events — cuppings, workshops, bookings), activity, daily update, ticket, "Ops Log" (superseded as a user-facing label)

**Needs attention**:
The amber state on a log entry or strip meaning something waits on the viewer (sign-off,
follow-up). Set explicitly on a log entry; often a follow-up linked to a Blocked task.
_Avoid_: alert, warning, flagged

**Activity**:
A task's last-any-write timestamp (status change, comment, field/RACI edit) shown as an age
("3h", "4d"). Notion heritage: "Last edited time".
_Avoid_: last touched, updated at (in UI copy)

**Week**:
Monday–Sunday in Asia/Jakarta time; the weekly update for a week is due Friday 17:00 WIB.
_Avoid_: sprint, cycle

## People & structure

**Org**:
The tenant container; Gordi is the only row for now. Every business row belongs to exactly one org
— the seam that lets future apps/tenants share the stack.
_Avoid_: company, workspace, tenant (in UI copy)

**Person**:
Anyone in `shared.people` — managers and selected ops users in the first slice. Identity is shared
across MOS and future ops apps.
_Avoid_: user (except in auth contexts), employee, member

**Role**:
A named **org position**; a person may hold several roles at once. Roles form the reporting line via
reports-to between roles. Notion heritage: Roles DB with "Reports to / Subordinate". Distinct from an
**Access role** (what a person may *do* in the app) and from a **RACI role** (R/A/C/I task ownership).
_Avoid_: job title (as a field), position; access role / permission (that's app authorization, below)

**Manager**:
A person any of whose roles has subordinate roles with current holders; sees the team module and
reviews their people's weekly updates. Derived from the role chain, never a flag on the person.
A dual-hat person appears in ALL their managers' teams (union), and any of those managers may
review their one weekly update.
_Avoid_: supervisor, lead (except inside role names like "Kitchen Lead")

**Access role** (a.k.a. Permission):
What a person may *do* in the app — the app-authorization layer, distinct from their org **Role**
(position) and from **RACI** (R/A/C/I task ownership). A person may hold several at once; effective
access is the union. First-slice set is **fixed** (a configurable role↔permission model is the deferred
upgrade path): **admin** (the *system administrator* — user management + system config; the only role
that sees the admin UI), **ops_lead** (review/approve operational logs + elevated surfaces), **finance**
(review financial data/dashboards sourced from the ESB warehouse), **member** (default — own tasks, file
own weekly update, log operational activity if rostered). **manager** is NOT an assigned access role — it
is *derived* from the role chain (see **Manager**); effective access = assigned access role(s) ∪ derived
manager. Granting **admin**/**finance** is admin-only and never self-assignable; the first admin is seeded.
_Avoid_: role (reserve for org position), permission group, RACI role

## Surfaces

**My Week**:
The personal home surface: R-or-A task table grouped by urgency + weekly-update strip + ops strip
(+ team module for managers).
_Avoid_: dashboard, home page (in UI copy)

## App structure

**App**:
There is exactly **one** app — **MOS**. Everything users do lives inside it.
_Avoid_: kitchen app, roastery app, mini-app, "ops apps" (legacy names from the separate-deployment era — now Modules of MOS)

**Module**:
A coarse functional area of MOS — e.g. Tasks, Weekly Updates, Daily Log, Kitchen, (future) Roastery.
What were once standalone "apps" become Modules within the one MOS app. Names the *producer* in
cross-cutting seams: the ESB-outbox `source_module` and a Daily Log entry's `origin` identify the
emitting Module. Distinct from a **Feature** (finer capability *within* a Module) and from a
**Business Unit** (a company operating area, e.g. Kitchen and Bar — a Module may serve one or more BUs).
_Avoid_: app / mini-app (for anything inside MOS); feature (that's finer-grained, below)

**Feature**:
A capability *within* a Module — e.g. task filtering, bulk-approve, the review queue. Finer-grained
than a Module.
_Avoid_: module (coarser), app
