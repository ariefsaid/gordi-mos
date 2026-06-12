# Gordi MOS

Vocabulary for Gordi's Management Operating System — the internal app for task ownership,
lightweight RACI, weekly updates, and daily ops visibility. Glossary only (per grill-with-docs
rules): no specs, no implementation notes. Heritage terms trace to the dormant Notion Management
OS constellation (see `docs/decisions.md` OD-P0-9).

## Work

**Task**:
The unit of owned work and the **cascade-bridgeable unit** — always carries R and A people, a
business unit, and a status. The only first-slice work entity; it is what will later link UP to an
Output/Objective (additive seam, ADR-0003), so the cascade grows in without reshaping the task.
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

## Ownership (RACI)

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
A named position; a person may hold several roles at once. Roles form the reporting line via
reports-to between roles. Notion heritage: Roles DB with "Reports to / Subordinate".
_Avoid_: job title (as a field), position

**Manager**:
A person any of whose roles has subordinate roles with current holders; sees the team module and
reviews their people's weekly updates. Derived from the role chain, never a flag on the person.
A dual-hat person appears in ALL their managers' teams (union), and any of those managers may
review their one weekly update.
_Avoid_: supervisor, lead (except inside role names like "Kitchen Lead")

## Surfaces

**My Week**:
The personal home surface: R-or-A task table grouped by urgency + weekly-update strip + ops strip
(+ team module for managers).
_Avoid_: dashboard, home page (in UI copy)
