# Review ledger — Step 4 "Signal v1" (branch `claude/redesign-buildout-completion-vdrd17`)

Diff scope: the Signal v1 slice — Track A (`supabase/migrations/20260716*`,
`supabase/tests/{83..89}_signal*.sql`), Track B (`mos-app/src/lib/db/signals*`,
`mos-app/src/components/signals/*` minus the C-added hosts, `mos-app/src/pages/signals-archive-page.tsx`
initial shell), Track C (this pass — wiring/retirement/e2e/gates, see commits `feat(signals): C1`
through `test(signals): C5` on this branch). This branch carries other concurrent steps (7/8/10 specs
— see other commits interleaved in `git log`); **this ledger covers Step 4 only**. Full command:
`git log --oneline --grep='(signals):' `.

## Scope card (Step 4)

**In scope (built, this step):**
- `mos.signals` + child tables (`signal_mentions`, `signal_acknowledgements`, `signal_revisions`,
  `signal_tasks`) + fail-closed RLS (`mos.can_read_signal`, R1–R5) + the `mos.fan_out_signal_mention`
  RPC + the minimal `shared.teams`/`shared.sites`/`shared.team_memberships` substrate.
- The capture-minimal FB-style **composer** (`SignalComposer` + `SignalMentionPicker`), the **posted
  card** (`SignalCard`), the **Home ambient feed** (`SignalFeed` + `SignalFeedSection`), the
  **Work → Signals archive/search** (`SignalsArchivePage`), and the **Signal record** surface
  (`SignalRecord` + `SignalRecordHost`): correct (category) · acknowledge · comment (reused
  `record-feed`/`CommentThread` grammar) · Create follow-up Task · Link existing Task.
- Wiring: the global `SignalComposerHost` (one command, many entry points — ⌘K / phone Action
  Launcher / Home feed row), `/work/signals` routed to the real archive, `?record=<id>` drawer,
  retirement confirmation (no residual Weekly Update/Daily Log entry points), the F1 e2e journey
  (AC-430).

**DEFERRED (do NOT fail these in this review — explicitly out of Step 4):**
- **Home attention brief from real queries** (overdue / due-today / failed checks / mentions) →
  **Step 5**. Step 4 ships the feed as the *ambient* region only; the attention region above it stays
  today's placeholder, untouched.
- **Occurrence-as-tasks / Process Runs** (the "occurrence spawner") → **Step 6** (OD-58); ADR-0051 +
  spec + plan already drafted on this branch (`docs(step6)` commit) but not built here.
- **Café rename** → **Step 7** (separate spec/plan track on this branch, not part of Signal v1).
- Also out of Step 4 per the spec's own non-goals (§1): Admin CRUD of Teams/Sites/visibility layers
  (OD-52), deputy dictation/suggestion, auto-emitted Signals (`source != 'human'`), generated period
  views, Urgent PWA/doorbell delivery, free-form tags, a confidential-case channel, Followers.

## Rules 1–12 checklist (unfilled — reviewers fill this in)

| Rule | Compliant? | Notes |
|---|---|---|
| 1 — one job per rail item | | |
| 2 — three-layer boundary (domain → UI family → destination) | | |
| 3 — rail/surface budget caps | | |
| 4 — canonical routes + URL state (`?record=<id>`, `?q=`) | | |
| 5 — exactly one `aria-current="page"` | | |
| 6 — one page anatomy per route (no second drawer host) | | |
| 7 — verb+object action grammar ("Share Signal", never bare Create) | | |
| 8 — capture-first disclosure (composer's 4 fields at ≤390px) | | |
| 9 — responsive disclosure order (mobile↔desktop parity) | | |
| 10 — extension test (Signal ships without a new rail root/anatomy) | | |
| 11 — component reuse (PORT convergence grammar; `record-feed`/`CommentThread`/`createTask` reuse) | | |
| 12 — usable by a high-school graduate, no training | | |

## Verdicts

<!-- Fill one verdict line per REQUIRED review before running pre-merge-check.sh.
     Accepted: PASS SHIP FIX-THEN-SHIP   Blocking: REWORK FAIL STILL-FAILING
     Required always: spec, code-quality. Required (UI changed): design. Required (schema/RLS changed): security. -->

- spec: <!-- PASS|SHIP|FIX-THEN-SHIP|REWORK|FAIL --> — <reviewer, date, notes>
- code-quality: <!-- PASS|SHIP|FIX-THEN-SHIP|REWORK|FAIL --> — <reviewer, date, notes>
- design: <!-- PASS|SHIP|FIX-THEN-SHIP|REWORK|FAIL --> — <reviewer, date, notes>
- security: <!-- PASS|SHIP|FIX-THEN-SHIP|REWORK|FAIL --> — <reviewer, date, notes>

## Gates (C7, this pass — see the Director's session report for exact numbers)

| Gate | Status |
|---|---|
| `npm run typecheck` | <!-- PASS / FAIL --> |
| `npm run lint -- --max-warnings=0` | <!-- PASS / FAIL --> |
| `npm test` (Vitest) + coverage ≥80% changed lines | <!-- PASS / FAIL --> |
| `supabase test db` (pgTAP, 89 files) | <!-- PASS / FAIL --> |
| `npx playwright test --list` (execution deferred to CI — no Docker here) | <!-- PASS / FAIL --> |
| `bash scripts/pre-merge-check.sh` | <!-- expected FAIL until Verdicts above are filled --> |

## Ratify before merge

- Q1 Signal-on-Home — provisionally approved (OD-REDESIGN-59); ratify at owner's post-step-11 review.
- can_read_signal is SECURITY DEFINER (deviation from ADR-0050 D4's INVOKER — INVOKER recurses to
  stack overflow on self-referential RLS; DEFINER is boolean-only, JWT-scoped, PUBLIC-revoked).
  Ratify into ADR-0050.
- comments_select tightened for entity_type='signal' with can_read_signal (entity guard alone covers
  only INSERT/UPDATE; spec matrix demands reader-of-parent for SELECT).
- A7 test fixture strips Peer's inherited BU role so AC-403/406 assert Team-membership-alone ≠ read
  under BU-scoped R2 (fail-closed reading; R2 breadth is ADR-0050 accepted debt until role
  `team_scope` exists).
- Attention pill (tap-to-raise FYI→Needs attention→Urgent) from spec §4 NOT built — no owning
  AC/task; owner to decide defer vs follow-up.
- Composer fan-out preview roster wiring + signal-record host wiring were Track-B→C handoffs — how
  Track C resolved them:
  - **Gap 1 (composer roster props defaulted to `{}`):** added `loadMentionRosters()` to
    `signals.ts` (Team-active-membership ∪ BU-scoped-Role holders, mirroring the fan-out RPC's `@BU`
    union client-side) and wired it into the new `SignalComposerHost` — every open() now loads real
    rosters instead of the `{}` default. This is a client-side **preview approximation**; the RPC
    itself stays the authoritative recipient count/cap at post time (unchanged).
  - **Gap 2 (signal-record.tsx has no data/mutation wiring):** added `SignalRecordHost` (fetch:
    `getSignal` + the new `listSignalRevisions` + `listAllTeams`/`getTeamSite`/`getBusinessUnits`/
    `getPeople` for name resolution + `listComments`/`listTasks`; mutations: `acknowledgeSignal`,
    `correctSignal` for Add-category, `postComment` (reused, `entityType:'signal'`),
    `createFollowUpTask`, `linkSignalTask`). Two deliberate scope decisions inside this gap, both
    flagged here rather than silently expanded:
    1. **No Retract UI was wired.** `signal-record.tsx` (B15) exposes no `onRetract` prop and no
       retraction affordance was built in Track B; retraction's owning ACs (AC-411/412) are pgTAP-
       only per the spec's AC table (no unit/e2e AC owns a retract *control*). Rather than invent an
       un-owned UI element (same discipline as the excluded attention pill), Track C left retraction
       UI-less in v1 — the DB gate (author-or-`signal.retract`, reason required) is fully proven at
       the RLS layer. Owner to decide: add a Retract control as a fast follow, or accept DB-only for
       v1 (Signals are rare enough that a direct-DB/support-assisted retract may be acceptable).
    2. **Create follow-up Task is a minimal title-only capture**, not an embed of the full canonical
       Task composer (`TaskDrawer`/`TaskSurface`) as the spec's §5.3 prose suggests. `TaskSurface`'s
       `createTask` call requires a full RACI capture (title/BU/Responsible/Accountable) that Track
       C self-fills from context (title defaults to the Signal body, BU from the owning Team,
       R=A=viewer) rather than re-opening the entire Task creation surface inside the record drawer
       (which would need new `TaskSurface` embedding work well beyond a wiring pass, and risks
       nesting a second drawer inside the record drawer — Rule 6). This satisfies FR-413 and AC-430's
       "Create follow-up Task is available" bar; it does not satisfy the spec prose's "opens the
       canonical Task composer on the same panel stack" literally. Recommend design-architect/
       eng-planner assess whether the minimal capture is acceptable for v1 or whether a follow-up
       task should embed the full Task composer.
