# Gordi MOS

Vocabulary for Gordi's Management Operating System — the internal app for task ownership,
lightweight RACI, weekly updates, and daily ops visibility. Glossary only (per grill-with-docs
rules): no specs, no implementation notes. Heritage terms trace to the dormant Notion Management
OS constellation (see `docs/decisions.md` OD-P0-9).

## Work

**Task**:
The smallest unit of owned work; always carries R and A people. The only work entity in the first
slice (no projects/objectives yet).
_Avoid_: action item, to-do, work item, ticket

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
A person-keyed summary of one person's week, due Friday; managers review their people's. A
deliberate change from Notion's project-keyed "Project Updates" — per-task references inside a
weekly update bridge the two.
_Avoid_: project update, status report, check-in

**Ops Event**:
One typed, source-badged operational happening (production, receiving, QC, follow-up…) mirrored
from an ops app (kitchen, future roastery) or manually added. The chronological surface for a day
is the Daily Ops feed.
_Avoid_: activity, log entry, daily update (as the row noun)

**Needs attention**:
The amber state on an ops event or strip meaning something waits on the viewer (sign-off,
follow-up). Mock rule: a follow-up linked to a Blocked task.
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
