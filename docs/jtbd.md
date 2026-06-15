# Jobs-to-Be-Done map — the Lens-D oracle (role × job)

**Status:** v0.1 seed (2026-06-15). The **oracle** that **Lens D — Product / Intent** grades every
first-slice screen against. Adapted from PMO's `docs/jtbd.md` STRUCTURE (intro → role table →
screen × job rows → cross-cutting paradigms → the 5 questions → calibration anchors); the *content* is
100% Gordi MOS — its roles, its screens (My Week · Tasks · Task detail · Weekly update · Daily Log),
its domain language (`CONTEXT.md`). PMO paid for this fourth lens with real shipped intent-failures;
MOS adopts the lens, not PMO's product nouns.

This is a **living foundation artifact**: each new feature adds/updates its role's job stories during
intake (the grill captures the job story *before* spec), and the Director keeps the §2 screen rows in
sync as features ship. Owner-refinable — the seed below is grounded in the real first-slice roles
(`docs/project-brief.md`, `CONTEXT.md` "People & structure") and the real built screens
(`mos-app/src/pages/`), so sharpen the priorities/expectations as the owner corrects them.

> **How to use this doc (for reviewers, both rounds):** for the screen under review — a **Phase-0
> mockup** (`docs/design-mockups/`, before any code) *or* the **built UI** — find its row(s) in §2.
> Each job story is a test oracle. Walk the **Lens-D 5 questions** (§4) against the *primary* job for
> the *primary* role on that screen. A screen passes Lens D when the primary role can, on arrival:
> recognise the job is doable here (information scent), see the decision-relevant facts first
> (priority/placement), and **act in one step** on what they see (actionability) — using the **same
> interaction paradigm** as analogous MOS screens (§3). Lens D can be run against a mockup before code
> exists — the job story does not need a running app.

The job-story format (Klement): **"When _[situation]_, a _[role]_ wants to _[motivation]_, so they can
_[expected outcome]_."** Grade against the **outcome**, never the spec.

---

## 1. Roles (from `docs/project-brief.md` "First Users" + `CONTEXT.md`) and their overarching job

The first slice ships to **Gordi managers and a few selected ops/floor people, plus Arief** — not the
whole company (brief "First Users"). "Manager" is derived from the role chain, never a flag
(`CONTEXT.md` "Manager"). The three Lens-D personas:

| Role | The one thing they come to MOS to do |
|---|---|
| **Manager** (a lead with direct reports — e.g. Kitchen Lead, Roastery Lead, Sales Lead) | *"What needs me this week, is my team filing, and who owns what?"* Triages their own R/A tasks, reviews their reports' weekly updates (upward-only), scans task ownership/RACI across units. Lives in My Week + Updates review + Tasks. |
| **Ops / floor user** (a selected person on the floor — barista, kitchen hand, roastery operator) | *"Record what just happened on the floor, fast, and get back to work."* Files a Daily Log entry in **under a minute** from a phone (OD-P0-3 mobile-usable); rarely owns tasks; narrow write surface. |
| **Arief / owner-director** | *"Across all units, what's drifting, who owns it, and what waits on me?"* Cross-cutting ownership + a "what-needs-me" view; reads everyone's updates (top-of-chain), files his own; scans the floor and the cross-unit task picture. Same screens as a manager, but org-wide scope. |

Each as a job story:

- **Manager** — *When I start my work week, a manager wants to see what's drifting in my own R/A
  tasks, whether my team filed their weekly updates, and who owns what across the units, so I can
  intervene where it actually matters before things slip.*
- **Ops / floor user** — *When something just happened on the floor (a delivery arrived, a batch
  roasted, a QC fail), an ops user wants to record it in one short pass on my phone, so the fact is
  captured for management visibility without pulling me off the floor.*
- **Arief / owner-director** — *When I check the operating picture, the owner-director wants to see
  cross-unit ownership, what needs my sign-off, and where delivery is drifting, so I can direct
  attention without chasing people one-by-one.*

---

## 2. First-slice screens × the jobs users bring to them

Ordered by the MOS mental model (personal home → the work list → one piece of work → the weekly
rhythm → the floor record). For each screen: **primary role(s)**, the **top job** as a job story, the
**decision-relevant info that must be above the fold**, and the **one next action that must be adjacent**
to that information (the actionability test).

### Personal home
| Screen (route) | Primary role | Top job — job story | Above the fold (decision-relevant) | The one adjacent next action |
|---|---|---|---|---|
| **My Week** (`/`) | Manager / Arief (every viewer) | *When I start my week, I want to see what's drifting in my R/A tasks first, so I can act on what needs me.* | The **dominant urgency-grouped task table** (R-or-A tasks, off-track first: overdue → ≤3d → the rest), each row carrying status · owner (R-avatar + "+N") · due · last-activity age (OD-P0-8). Auxiliary strips (weekly-update state, ops-today + needs-me amber) are *one-line* and **below** the table — never above it (OD-P0-7 ≤2 strips). | Click a task row → its **detail** (one click into the work that's drifting). Each strip carries its own single next action ("Write update →" / "See what needs attention →"). A number is never a dead end. |
| **My Week — team module** (`/`, manager-conditional) | Manager / Arief | *When I lead a team, I want to see at a glance who hasn't filed their weekly update and who has overdue tasks, so I can nudge the right person.* | Each report: name + **filed-status pill** for the week + overdue-task count (OD-P0-8). Role-conditional third module, below the strips. | Each report's status → **their weekly update** (review pane); their overdue count → **their filtered task list** (OD-P0-9c). Not a passive roster. |

### The work list
| **Tasks** (`/tasks`) | Manager / Arief (any member can read; cross-unit visibility is the product, OD-P1-3) | *When I scan the work, I want to filter by owner / RACI-role / status and spot what's off track, so I can open the one that needs attention.* | The **dense task table** (PMO DataTable posture, OD-P0-7) with the off-track signal (overdue / blocked) visible **in the row**, and the **owner / status / RACI / BU filters** present and obvious (OD-DIR-5: RACI is filterable on lists). | Each row → the **canonical task detail** (one home per task, Lens C invariant). Create-task is a clearly-placed primary, not buried (OD-P2-2: any member creates). |

### One piece of work
| **Task detail** (`/tasks/:id`) | Manager / Arief / whoever is R or A | *When I open a task, I want to know "what's its status, who's R/A, what's blocking, what's the next checklist step" and change it, so I can move it forward without leaving the page.* | **Status + R/A** above the fold (the decision-drivers: is this on track, and is it mine to move). C/I and checklist follow; the activity age frames staleness. | **Change status inline** (no view transition — OD-P2-1, ui-implementer invariant "no needless state transitions"); **edit RACI inline** for editors (R/A/manager, OD-P2-3); check off a checklist item in place. Archive (A/manager only) is the one consequential action that *does* confirm (OD-P2-3). |

### The weekly rhythm
| **Weekly update — write pane** (`/updates`, top) | Manager / Ops / Arief (everyone files, incl. top-of-chain — OD-P2-14) | *When the week wraps, I want to write a short recap (summary + a few progress-marked lines) and submit it, so my manager has what they need without a meeting.* | The viewer's **own current-week** draft/summary + update-line list with **progress markers** (Done / In progress / Blocked, OD-P2-10), and the **filed/draft state + Friday due** signal. The write pane is **always the current week** even while a manager browses prior weeks below (the C1 fix). | **Submit** (locks read-only; Reopen to revise — OD-P2-11) sits with the draft, co-located from first paint. Adding an update line is single-action. No FK-to-task picker (deliberate: narrative, not task-tracking — OD-P2-10). |
| **Weekly update — review pane** (`/updates`, manager-conditional) | Manager / Arief | *When my reports have filed, I want to read their updates and see who's still missing, so I know my team's week without chasing.* | The team's per-person **filed / draft / not-started** state for the selected week (on-time-vs-late signal, OD-P2-14), each expanding to the **read-only submitted update**. Independent week navigation from the write pane (§3.5 model). **Upward-only** — only the author + their manager chain + top-of-chain see it (OD-P1-3). | **Read** the update (review is READ-ONLY in v1 — no ack, no comment — OD-P2-12). The "next action" is *recognition*, not a button: the missing-filers must be obvious so the manager can nudge off-screen. (See anchor A2 — the review pane must not invent a write affordance.) |

### The floor record
| **Daily Log — feed** (`/ops`) | Manager / Arief (read for visibility); Ops (read their unit) | *When I want to know what happened on the floor today, I want a chronological feed badged by unit and type, with anything needing attention flagged, so I can scan it and follow up only where flagged.* | The **reverse-chronological feed** of log entries: time (WIB) · **source/BU badge** · **type** (production / receiving / QC / follow-up / other) · the happening · **needs-attention amber** · any **linked-task ref** (OD-P2-17/18). Org-readable (floor visibility, OD-P1-3). | Open the **linked task** where one exists (the follow-up seam); the **Add entry** primary for filing a new one. **A log entry is read, not reviewed** — it is a past-tense fact, not work-to-do (OD-P2-16); there is no approve/review verb on it (see anchor A1). |
| **Daily Log — add / edit** (`/ops` add form) | **Ops / floor user** (primary) | *When something just happened, I want to record it in one short pass on my phone, so it's captured and I'm back on the floor in under a minute.* | The **minimal capture form**: what happened + type + (defaulted) occurred-at + unit + needs-attention toggle + optional task link. `occurred_at` defaults to now but is **editable** (log a 9am happening at noon — OD-P2-18). No owner / RACI / status fields (a log entry has none — OD-P2-16). Mobile-first (OD-P0-3). | **Save** as a single quiet write with confirmation (ui-implementer invariant: routine writes are single-click + quiet confirm). Edit-own only (author or manager-of-author, OD-P2-19); archive is soft + reversible, no hard delete. |

---

## 3. Cross-cutting interaction paradigms (MOS's record verbs + the read/review distinction)

Lens D's mental-model-consistency question (§4.5) grades against these. Analogous MOS objects **must**
share one model — divergence is the exact defect class the anchors target:

1. **Name** — one noun per concept, per `CONTEXT.md`. A task is a **Task** (never action-item / ticket);
   a floor record is a **Log entry** on the **Daily Log** (never "event" — collides with cafe events;
   never "Ops Log" — superseded label, OD-P2-15); the owner field reads **Owner** = the R person
   (never assignee / PIC). The work list calls the R person's column "Owner"; detail spells out R/A/C/I.
2. **Create** — one create paradigm per entity: a task via the create-task form (any member, R+A default
   to creator — OD-P2-2); a log entry via the Daily Log add form (any org member — OD-P2-19); a weekly
   update is implicit (one per person per week, OD-P2-13 — you don't "create" it, you write it).
3. **Open** — one record-open paradigm: **one canonical home per entity** (a task resolves to exactly
   one `/tasks/:id` detail regardless of whether you arrived from My Week, Tasks, or a Daily Log linked
   ref — Lens C invariant). A weekly update opens read-only in the review pane; a log entry has no
   separate detail page (the feed row *is* the record).
4. **Change-in-place** — routine lifecycle changes happen **without a view transition**: task status
   and RACI change inline on detail (OD-P2-1/3); a checklist item toggles in place; a weekly update
   adds a line inline. Only **consequential** actions confirm (task archive, OD-P2-3).
5. **Read vs review** — the load-bearing MOS distinction. A **weekly update** is *reviewed*
   (a manager reads a report's submitted recap — read-only in v1, OD-P2-12). A **Daily Log entry** is
   *read*, never *reviewed* — it is a past-tense floor fact with no approve/ack lifecycle (OD-P2-15/16).
   Conflating the two verbs is the canonical MOS intent trap (anchor A1).
6. **Visibility direction** — weekly updates are **upward-only** (author + manager chain + top-of-chain,
   OD-P1-3); tasks and the Daily Log are **org-readable** (cross-unit visibility is the product). A
   screen that exposes a downward or peer-lateral update view violates the model (anchor A3).

---

## 4. The Lens-D 5 questions (the interrogation, per screen × primary job)

1. **Job** — what job did the user come here to do? State it as a job story (use §2).
2. **Expectation** — does the user *expect* this feature/affordance **here**? Does placement + naming
   match their mental model and management-tool convention, and Gordi's own language (`CONTEXT.md`)?
   (where-it-lives + what-it's-called.)
3. **Priority / placement** — is information/affordance ordered by **decision-relevance to the job**
   (most-decision-relevant above the fold)? On My Week, is the drifting-task table truly first, with
   the strips quiet and below (OD-P0-7)?
4. **Actionability** — *"so what / now what?"* — can the user **act** on what they see in one step? Is
   the next action **adjacent** to the insight? (A display that drives no decision fails. A number that
   doesn't drill in is a dead end.)
5. **Mental-model consistency** — do analogous objects share one interaction paradigm (§3) — including
   the **read-vs-review** verb and the **visibility direction**, not just create/open/back?

## 5. Calibration anchors (must always be caught)

Three real Gordi-shaped intent traps. Each passes code review + security + Lenses A/B/C (the markup is
clean, the flow is smooth, the IA is one-home-per-entity) but **fails the user's actual job**. These are
the regression line for Lens D — if the lens ever stops catching these, it has drifted.

| # | The trap | Lens-D Q that catches it | Why A/B/C miss it |
|---|---|---|---|
| **A1** | **"Review" verb on a Daily Log entry.** A log entry surfaces a "Review" / "Approve" / "Acknowledge" affordance, treating a past-tense floor fact like work-to-do or like a weekly update awaiting sign-off. (This is the real owner rename: "Ops Log" → "Daily Log", and the OD-P2-16 ruling that a log entry is *read, not reviewed* — past-tense, no owner/RACI/status/lifecycle.) | **Q5** (mental-model consistency: the read-vs-review verb, §3.5) + **Q2** (the user doesn't expect a review action on a fact). | **(a) Visual** sees a clean, on-brand button. **(b) IxD** finds the click-to-review flow *smooth* — naturalness, not job-fit. **(c) IA** sees one canonical feed. Only the **job** ("record what happened, then get back to work" — not "approve it") exposes the wrong verb. (PMO's analog was a different conflated verb; the MOS trap is read-vs-review.) |
| **A2** | **A write affordance on the upward weekly-update review pane.** The manager review pane sprouts a comment box, an "Acknowledge" button, or an edit control on a report's submitted update — when v1 review is explicitly **READ-ONLY** (OD-P2-12), and the report's job is "submit and be done", not "get edited by my manager". | **Q1/Q4** (the screen's job is *read the team's week*; an unasked-for write action is a non-job action) + **Q2** (the report doesn't expect their manager to mutate their submitted recap). | **(a)** the control is styled correctly. **(b)** the comment flow may even feel *natural* in isolation. **(c)** the update still has one canonical home. Only the **job + the OD-P2-12 lifecycle** reveal the affordance does a job nobody on this screen has in v1 — it's scope-creep that fails the read-only intent. |
| **A3** | **A downward / lateral weekly-update view.** Any My Week or Updates surface that lets a viewer see a *peer's* or a *subordinate-of-a-different-manager's* weekly update — breaking the **upward-only** visibility model (OD-P1-3: author + manager chain + top-of-chain only). E.g. the team module linking to an update the viewer isn't up-chain of, or a "browse all updates" list. | **Q5** (mental-model consistency: visibility direction, §3.6) + **Q2** (a person does not expect their weekly recap visible sideways). | **(a)** renders fine. **(b)** the click-through is a *smooth* flow. **(c)** it's the same canonical update surface. RLS may even still block the *data* (OD-P1-3) — so the screen shows an empty/forbidden state that looks like a *bug*, not an *intent* error. Only the **job + the upward-only model** name it as a screen that offers a view the product deliberately does not grant. |

---

*Owner maintains the job priorities; the Director keeps the §2 screen rows in sync as features ship and
syncs the design-reviewer agent + `CLAUDE.md` to the four-lens battery. This is the input every
feature's intent check grades against — on both the Phase-0 mockup round and the built-UI round
(`docs/design-workflow.md` §1, §2).*
