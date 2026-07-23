# Journey-quality audit R1 — the six highest-value cross-page journeys (V3)

**Date:** 2026-07-23 · **Branch:** `v3-redesign` (worktree) · **Type:** the first audit of quality
**dimension F / D6 (journey quality)** — the biggest structural gap in `docs/quality-model.md`. Every
other battery layer scores ONE screen; this walks the WHOLE path to a goal and scores the path.

**Method.** Six journeys chosen from `docs/jtbd.md` (highest cross-page value) walked **live** end-to-end
on a dedicated dev server (port 5710, isolated agent-browser session `journeys`), against the seeded
local stack, using the demo personas at the role each journey actually belongs to — **not Director for
everything** (member cold-start as Cahya/Cafe-Ops; kitchen day as Krishna/Kitchen; Money dip as
**Fitri/Finance**, whose seed is populated where Director's was empty; onboarding + org-scan as
Dewi/Director). Each journey scored on five path-properties and logged as a DO/DEFER ledger — no
floating suggestions. Evidence = route + observed behavior; screenshots under
`scratchpad/j{A..F}-*.png` (session-local, not committed).

**Convergence note (OD-REDESIGN-87 order).** These findings feed the queues, not a re-litigation of
grammar. Where a finding matches an already-tracked divergence (interaction-consistency plan, census
sweep R2), it is cited, not re-opened. New journey-only defects are the audit's yield.

---

## 1. Scores

Five path-properties, each 1–5 (5 = at/near the minimum-conceivable ideal; 1 = severe friction):
**Steps** = step count vs the fewest conceivable · **Flow** = round-trips / dead-ends (5 = none) ·
**Context** = context preserved (5 = nothing retyped, no lost position/focus) · **Feedback** =
wait/feedback gaps (5 = every action acknowledged) · **Clarity** = comprehension for a non-technical
15-person-org user (5 = no stall).

| Journey (persona) | Steps | Flow | Context | Feedback | Clarity | Overall | One-line verdict |
|---|:-:|:-:|:-:|:-:|:-:|:-:|---|
| **J-A** Signal capture → right person's Home → triage → follow-up Task (Director→Cahya) | 4 | 3 | 4 | 2 | 4 | **3.4** | Capture + routing to the mentioned person's Home/Inbox works cleanly; the triage-and-act tail leaks (silent post, non-addressable open, door-card dead-end, whole-narrative task title). |
| **J-B** Member checks "what do I do now" cold (Cahya) | 5 | 3 | 4 | 3 | 5 | **4.0** | The attention-first Home is the strongest surface in the app — plain-language bands answer the cold question at a glance. The Inbox triage path undercuts it with a non-actionable summary door. |
| **J-C** Kitchen lead runs the day: plan → log → review → push (Krishna) | 4 | 2 | 2 | 3 | 3 | **2.8** | Plan/Log/Stock are purpose-built and dense-clean, but **Review dead-ends to Home**, the Log batch form loses staged work with no guard, and a fresh day renders all-red deficits. |
| **J-D** Ops/finance investigates a Money dip → drills to detail (Fitri) | 4 | 2 | 5 | 4 | 4 | **3.4** | Labeled, basis-annotated KPIs + addressable Detail tab serve "trust the figure"; but the **drill dead-ends at the branch aggregate** — no click-through to the contributing records the journey exists to reach. |
| **J-E** Admin onboards a person → they log in → find their work (Director) | 4 | 2 | 3 | 2 | 5 | **3.2** | The best-explained form in the app (plain-language roles, no-email path). But the **"Create a login now" intent is silently lost** and no sign-in credential is surfaced — the onboarded person cannot actually log in. |
| **J-F** Owner scans org health (Director) | 5 | 4 | 5 | 4 | 4 | **4.4** | Attention-first Home + gated Money give a fast, honest scan; there is no single consolidated org-health rollup, so the picture is assembled by hopping destinations (by design, mild). |

**Cross-journey pattern.** The **capture / orient / enter-data** half of every journey is strong
(Home attention, the Café Plan/Log surfaces, the Money summary, the onboarding form). The **act / drill
/ hand-off** half is where journeys leak: the second surface is a read-only summary (Inbox door,
Money branch row), a dead-end route (Café Review), or a silently-dropped intent (login toggle, log
leave-guard). Journey quality fails at the *seam between surfaces*, exactly where single-screen audits
cannot look — which is why D6 was invisible until now.

---

## 2. Findings ledger — DO / DEFER (no floating suggestions)

Severity: **P1** = blocks/loses the user's goal or work · **P2** = real friction, goal still reachable ·
**P3** = polish/comprehension. Each: evidence (route + what happened) · fixDirection · owning dimension
(`docs/quality-model.md`) · cross-ref.

### DO-now — P1

**JQ-1 · Café "Review" dead-ends to Home [P1 · J-C · D5 integration seams / D7 IA].**
Evidence: `/mos/cafe/review` and the "Review" link on the Café opening surface both redirect to `/mos`
(Home). Plan/Log/Stock render; Review does not exist as a route. The day's plan→log→**review**→push
spine is broken at "review". fixDirection: build the Review surface (day rollup + failed-check/exception
resolve queue) or, if deferred, replace the link with an honest disabled/"coming soon" affordance — a
primary day-step must never bounce the user to Home. Cross-ref: census sweep DO-8 listed the Café
"started-panel (rollup, resolve queue)" as NOT REVIEWED — this audit shows the entry point is a dead-end.

**JQ-2 · Kitchen LOG loses staged production on navigation, no guard [P1 · J-C · D4 interaction verbs].**
Evidence: entered a "Made today" quantity on `/mos/cafe/log` (a "Discard" control + "Submit 1 entry"
appeared, confirming staged state), clicked the Home nav link → navigated straight to `/mos`, **no
"unsaved changes?" prompt**, staged entry gone. A lead who logs 20 dishes then clicks any nav link
loses all of it. fixDirection: add a route-leave dirty-guard to the batch-staging form, matching the
record surfaces' `requestLeave`/`leaveGuard`. Cross-ref: interaction-consistency **D-C3 (CRITICAL,
GAP-4)** — this audit is the live confirmation; the owner ruling GAP-4 (recommend: yes, guard it) is owed.

**JQ-3 · Onboarding "Create a login now" intent silently lost + no credential surfaced [P1 · J-E · D5 seams / D13 feedback].**
Evidence: created "New Hire" with the "Create a login now" switch enabled and a Member role; the tall
Add-person dialog scroll-resets to top on interaction, the switch reverted, and the person was created
with **LOGIN = "No login"** — yet the only feedback was a generic "New Hire added." toast that says
nothing about login state. No show-once sign-in credential was ever displayed. The onboarded person
cannot log in, and the admin has no signal that the login step didn't happen. fixDirection: (a) keep the
login toggle state stable across dialog scroll; (b) make the success confirmation state the login
outcome ("added · sign-in created" vs "added · no login yet"); (c) surface the show-once credential
when a login IS created; (d) ensure the row `⋯` menu (currently opacity-0 at rest, census P2-A) offers
a "Create sign-in" recovery. Cross-ref: admin-user-mgmt "show-once password reveal" (MEMORY) — the
reveal did not fire on this path.

### DO-now — P2

**JQ-4 · Inbox item opens a read-only summary door, not the actionable record [P2 · J-B · D4 verbs].**
Evidence: as Cahya, Inbox (quick-panel, desktop) → clicked the sole item → panel shows a "SIGNAL / You
were mentioned in a Signal / <body>" **summary card with zero actions** (no Acknowledge, Comment, or
Create-Task); to actually triage, the member must click "Open full page" — an extra hop onto the real
record. Triage — the entire point of the Inbox — cannot happen in the Inbox. fixDirection: open the
shared canonical RecordViewer (with its actions) in the panel, not the summary door. Cross-ref:
interaction-consistency **D-A4** (one shared RecordViewer for every "open").

**JQ-5 · Money drill dead-ends at the branch aggregate [P2 · J-D · D5 seams].**
Evidence: `/mos/money?tab=detail` renders the branch table (REVENUE/TXNS/SHARE/AVG/COGS/MARGIN); clicking
a branch row (Gordi Kemang) does nothing — no panel, URL unchanged. There is no click-through from a
figure to its contributing records/transactions. J19's core ("see its basis, freshness, and
**contributing records** … rather than stare at a dead-end KPI") is only half-met: basis + freshness are
served (visible "as of", per-tile "?"), but the canonical drill target is absent. fixDirection: make a
branch/metric row open its contributing records (the reporting read-model rows) in the panel.
Cross-ref: census sweep money F-6 (populated/drill states were NOT REVIEWED — now reviewed).

**JQ-6 · Signal opened from Home/feed is not URL-addressable [P2 · J-A · D4 verbs / D5 seams].**
Evidence: opening the "Ice machine…" signal from the Home ambient feed shows the record in a side panel
while the URL stays `/mos` — not shareable, lost on refresh. The archive's `?record=` form is
addressable; the Home-feed entry point is not. fixDirection: reuse the addressable form (or rule Home
strictly ambient — owner GAP-1). Cross-ref: interaction-consistency **D-A2 / GAP-1**.

**JQ-7 · Follow-up-Task prefills the whole signal narrative as the Task title [P2 · J-A · D8 copy].**
Evidence: "Create follow-up Task" on the Signal (OD-39 — now BUILT, previously listed UNBUILT) pushes an
inline composer whose **title is prefilled with the entire signal sentence including "@Cahya Cafe"**
("Ice machine at HQ bar is leaking onto the floor — flagged for repair. @Cahya Cafe"). A task title
should be an actionable phrase; the composer is also title-only + Save, so PIC/Supervisor/Team aren't
set at creation (divergent from OD-39's "canonical Task composer"). fixDirection: prefill a short
action title (or leave the title empty and carry the signal as the source/description); decide whether
the follow-up uses the canonical composer (recommend: yes, so ownership is set at creation).

**JQ-8 · No visible success confirmation on Signal post [P2 · J-A · D13 performance-as-UX].**
Evidence: sharing the signal closed the composer and the row appeared silently — no toast/inline "shared"
ack (a sighted keyboard user gets nothing). fixDirection: one transient inline/toast create-confirmation.
Cross-ref: interaction-consistency **DIV-G2 / GAP-7** (one success-feedback channel).

### DO-now — P3

**JQ-9 · Kitchen Log renders all-red deficits at day-start [P3 · J-C · D10 scale / D15 emotional fit].**
Evidence: on a fresh day (nothing logged) the Log KPI row shows "Made so far 0 · **−562 vs plan**",
"Items remaining 22 · **−562 units short**" in alarm-red. Before the lead has begun, the dashboard reads
as a crisis. fixDirection: treat the not-started state as neutral (grey "not started", or suppress the
red delta until the first entry), reserving red for genuine end-of-day shortfalls.

**JQ-10 · Signal composer owning-team defaults to arbitrary "B2B Sales Team" [P3 · J-A · D8/D16].**
Evidence: the composer defaults Owning Team to `teamOptions[0]` "B2B Sales Team", unrelated to the author
(Director/HQ Ops); "never blocks capture" lets a mis-targeted signal post. fixDirection: default to the
author's primary team (or force an explicit pick). Cross-ref: census sweep signals **F-6** (owner FLAG-4
— confirm seed gap vs safe-default bug).

**JQ-11 · Café Plan shows a naked "326" count pill [P3 · J-C · D8 copy].**
Evidence: `/mos/cafe/plan` title carries a bare "326" beside "next 14 days" — a count with no unit/label.
fixDirection: label it or drop it (the "next 14 days" already frames the scope). Cross-ref: GUARD-R2
naked-number precedent (extend the guard's enumeration to the Café page-heads).

### DEFER

**DEFER-JQ-A · No single consolidated org-health rollup for the owner scan [P3 · J-F · D7 IA].**
The owner assembles org health by visiting Home (attention) → Money (financials) → Work. This is the
adopted five-destination model (Home = attention, not a dashboard-destination — OD-REDESIGN-8/17). Not a
defect; track only if the owner later wants a cross-team health rollup. Reason to defer: contradicts the
"no Dashboard-as-destination" language rule; needs an owner decision, not an engineering fix.

**DEFER-JQ-B · Home task rows don't open the task from the "MY WORK TODAY" band [P3 · J-B · D4].**
Clicking a task in the Home my-work band did not open the record (URL stayed `/mos`). Likely the same
non-addressable-open seam as JQ-6 rather than a separate defect; fold into the D-A1/D-A2 URL-addressable
task work (interaction Tier-1 item 4) rather than tracking separately.

---

## 3. Top-5 journey findings (ranked by goal-impact)

1. **JQ-1 — Café "Review" dead-ends to Home.** A named step of the kitchen day bounces the user out of
   the section entirely. Highest flow-breakage of any journey. (P1, J-C)
2. **JQ-2 — Kitchen LOG silently loses staged production on nav.** Real, daily work-loss for the exact
   role the app most needs to trust it. (P1, J-C; confirms interaction D-C3.)
3. **JQ-3 — Onboarding login intent silently lost, no credential surfaced.** "Onboard → they log in"
   cannot complete; the admin isn't even told. (P1, J-E)
4. **JQ-4 — Inbox opens a non-actionable summary, so triage can't happen in the Inbox.** Undercuts the
   otherwise-best-in-app member Home. (P2, J-B; confirms interaction D-A4.)
5. **JQ-5 — Money drill dead-ends at the branch aggregate.** The investigate-the-dip journey stops one
   level short of the contributing records it exists to reach. (P2, J-D)

**What this closes.** D6 (journey quality) moves GAP → PARTIAL in `docs/quality-model.md`: the audit
protocol now exists and has run once. To reach COVERED, the top journeys (especially J-A capture→act,
J-C the café day, J-D the money drill) should become curated Playwright E2E so their *shape* is a
standing regression, and this audit re-runs each convergence milestone. Per the meta-rule, each P1 here
should also gain an owning check the same day it is fixed (Café route-exists assertion; log leave-guard
test; onboarding login-outcome assertion).
