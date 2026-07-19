# Redesign decision index (2026-07 full redesign)

**Purpose:** one-page map of the 55 locked redesign decisions so future agents navigate to the
authoritative text instead of reinterpreting summaries. This index is a *pointer*, not an authority —
if it ever disagrees with the sources below, the sources win.

**Authority order (redesign era):**
1. `docs/decisions.md` § OD-REDESIGN-1…55 (LOCKED 2026-07-09/10, owner-approved)
2. `docs/adr/0025-ia-modules-in-rail-redesign-direction.md` (D1–D41, the binding ADR)
3. `CONTEXT.md` (domain glossary — current vocabulary only)
4. Older ADRs **as amended** (ADR-0020 amended by OD-REDESIGN-28/34/55; ADR-0014 wording amended by
   OD-REDESIGN-3/11/40; ADR-0019 D1–D3 and destination guidance amended/superseded by ADR-0025)
5. Historical specs/plans/mockups — evidence only, carry Superseded/Historical banners

## Retired concepts — do NOT read these as current

| Retired | Replaced by | Authority |
|---|---|---|
| Weekly Updates (mandatory filing) | Live period views + Signals | OD-REDESIGN-33/48 · ADR-0025 D20/D34 |
| Daily Log / `ops.log_entries` auto-mirror | Signal model (intentional posts) | OD-REDESIGN-33/44 · D20/D30 |
| Task-level RACI (R/A/C/I on Tasks) | Task = PIC + Supervisor; RACI only on Objective/Project/Process | OD-REDESIGN-3/14/41 |
| Five-destination IA (Home/Work/Operate/Plan/Inbox, ADR-0019 D2) | Two-zone rail: Home · Work · Money [gated] · Inbox + Modules grouped by BU | OD-REDESIGN-1 · D1 |
| Department/support-team modules; "Operate"/"Plan"/"Reference"/"Cascade"/"Dashboard" destinations | Universal Work runtime; Modules earned by workflow (Café · Ecommerce · Roastery) | OD-REDESIGN-8/15 · D1/D9 |
| Team as autonomous actor | Team = execution scope; Persons act via scoped Role-derived `can()` | OD-REDESIGN-55 · D41 |
| Global "Capture" FAB | Contextual primary actions + one prescribed Action Launcher | OD-REDESIGN-21/46 · D10/D32 |
| Template as first-class object | System Object Contracts; Duplicate-as-Draft; Blueprint deferred | OD-REDESIGN-29 · D16 |
| ADR-0020 "no per-person grants" clause | Role defaults + sparse individual allow/deny overrides | OD-REDESIGN-28 · D15 |
| "BU = team" conflation | BU (accountability) ≠ Site (place) ≠ Team (operating group) | OD-REDESIGN-50/53 · D36/D39 |

## Index by theme (OD-REDESIGN-n · ADR-0025 Dn)

**IA & navigation**
- OD-REDESIGN-1 · D1 — Modules are nav roots, grouped by BU (supersedes ADR-0019 D2)
- OD-REDESIGN-15 — Initial Modules stay at three (Café/Ecommerce/Roastery); support teams use universal Work
- OD-REDESIGN-20 — One canonical Inbox: full page or quick panel, one collection
- OD-REDESIGN-23 — Core nav is fixed; users customize saved-view pins only (narrows D3f)

**Interaction grammar (Twenty-adapted)**
- OD-REDESIGN-6 / OD-REDESIGN-10 · D3 — Six binding IxD rules; ref `docs/reference/twenty-ixd-patterns.md`
- OD-REDESIGN-7 · D2/D3a — One record, one canonical page, many views
- OD-REDESIGN-19 — One stack-navigated Record Panel; never nested physical drawers
- OD-REDESIGN-22 — Inline edit: Enter/Tab/click-outside saves, Escape discards (MOS divergence from Twenty)
- OD-REDESIGN-16 — Notion-like = typed structured canvas, not freeform data
- OD-REDESIGN-21 · D10 — Contextual primary actions (amended by OD-REDESIGN-46)
- OD-REDESIGN-46 · D32 — Mobile `+` FAB and desktop `+ Create` share one prescribed Action Launcher

**Work & Home**
- OD-REDESIGN-2 · D2 — One consolidated prototype (α IA + γ editor + β multiview + Standards/Shifts)
- OD-REDESIGN-8 · D9 — Work = one record workspace with collections and saved views (no widget composer)
- OD-REDESIGN-17 · D8 — Home = required attention brief + authorized personal/deputy canvas
- OD-REDESIGN-18 — Home region order is a per-user profile preference (brief cannot be removed)

**Task ownership**
- OD-REDESIGN-3 — Task = PIC + Supervisor; RACI only at Objective/Project/Process (glossary: `CONTEXT.md`)
- OD-REDESIGN-14 — Supervisor inherits parent A by default, explicit override (amended by OD-REDESIGN-41)
- OD-REDESIGN-40 · D26 — Tasks may be ad hoc; Project/Process optional (amends ADR-0014 wording)
- OD-REDESIGN-41 · D27 — Ad-hoc Supervisor resolves via PIC's manager chain; ambiguity never guesses

**Process, Run, Standard, Shift**
- OD-REDESIGN-11 — Process (definition) vs Process Run (occurrence); schema ADR deferred to eng planning
- OD-REDESIGN-12 — Generated work: ownership-boundary rule (Task vs Checklist vs form field vs Check vs evidence)
- OD-REDESIGN-13 · D7 — One guided Process designer; typed Object Contracts are the human/deputy safety boundary
- OD-REDESIGN-54 · D40/D41 — An authorized scoped Role holder adopts a published Process version and local
  execution configuration for a Team; Team is the scope, not the actor
- OD-REDESIGN-4 — Standard is first-class, versioned, typed steps; SOP is a sanctioned synonym (glossary)
- OD-REDESIGN-30 · D17–D18 — Standard is a BU asset; adoption belongs to each consuming definition
- OD-REDESIGN-31 · D18 — Standard upgrade = publish → notify → approve diff → adopt with effective date
- OD-REDESIGN-5 · D39 — Shift = person + station/area + time window, one Team; Café may span Kitchen
  + Bar Areas inside that Team (scoped by OD-REDESIGN-53)

**Signals** (replaces Weekly Update + Daily Log)
- OD-REDESIGN-33 · D20 — Signal supersedes both; clean data redesign authorized (resets/deploys owner-gated)
- OD-REDESIGN-36 · D22–D23 — Read reach flows upward through configured information layers
- OD-REDESIGN-37 · D23 — No confidential mode; sensitive content routed outside Signal
- OD-REDESIGN-38 / OD-REDESIGN-51 · D24/D37 — Person/Team/BU mentions grant + fan out; `@BU` capability-gated
- OD-REDESIGN-39 · D25 — Signal is fact; follow-up Tasks are separate, many-to-many linked, never a promotion
- OD-REDESIGN-42 · D28 — Category = optional post-capture enrichment over stable families
- OD-REDESIGN-43 · D29 — Attention = FYI / Needs attention / Urgent; never a Status
- OD-REDESIGN-44 · D30 — Intentional posts only; routine records/events never auto-mirror
- OD-REDESIGN-45 · D31 — Corrections = revisions; wrong provenance = retract + repost; no hard delete
- OD-REDESIGN-47 · D33 — Comments clarify, Acknowledge = seen; neither creates lifecycle
- OD-REDESIGN-49 · D35–D36 — Author independent from owning Team
- OD-REDESIGN-48 · D34 — Live sourced period views + optional delivery replace weekly filing

**Deputy (agent-native)**
- OD-REDESIGN-9 · D4/D5 — Deputy is a first-class surface; closes six PMO gaps (`docs/reference/pmo-deputy-gaps.md`)
- OD-REDESIGN-24 · D11/D19 — First slice: front-most, reversible direct Task writes, viewer's JWT/RLS
- OD-REDESIGN-25 · D12 — Persistent Draft only for Objective/Project/Process/Standard; else ephemeral Proposals
- OD-REDESIGN-32 · D11/D12/D19 — Reversal = archive/restore, revert, compensating undo, retract; never hard delete

**Access, org structure, admin**
- OD-REDESIGN-27 · D14 — Publishing = `can()` scope + record RACI
- OD-REDESIGN-28 · D15 — Role defaults + sparse allow/deny overrides (amends ADR-0020)
- OD-REDESIGN-55 · D41 — Team is scope; scoped Role-derived `can()` decides what a Person may do (amends ADR-0020 D3/D11)
- OD-REDESIGN-50 · D36 — Team below BU; Signal belongs to Team, derives BU/Site
- OD-REDESIGN-52 · D38 — Admin configures org structure + per-Person Team/Role/access assignments
- OD-REDESIGN-53 · D39 — Governance objects BU-scoped; execution objects Team-scoped

**Data, contracts, platform**
- OD-REDESIGN-26 · D13 — Personal UI compositions = versioned validated JSONB tenant rows (`mos.user_views`)
- OD-REDESIGN-29 · D16 — System Object Contracts; user Blueprints evidence-gated/deferred
- OD-REDESIGN-34 — Clean domain-ordered migration baseline (dedicated data-baseline ADR required before build)
- OD-REDESIGN-35 · D21 — Future MCP = per-person adapter over the same domain boundary (dedicated ADR required)

## Internal amendment chain

- OD-REDESIGN-14 amended by OD-REDESIGN-41 (ad-hoc Supervisor resolution)
- OD-REDESIGN-21 amended by OD-REDESIGN-46 (universal `+` Action Launcher sanctioned)
- OD-REDESIGN-23 replaces ADR-0025 D3f's broader "nav is customizable" wording
- OD-REDESIGN-5 is scoped by OD-REDESIGN-53 (each Shift belongs to one Team)
- OD-REDESIGN-8 supersedes its July-9 "Tasks + manager widgets" version
- OD-REDESIGN-3 supersedes OD-P2's Task-level RACI terminology

## Deferred to SDD / engineering planning (decided later, not open questions)

Dedicated ADRs required before build: Standard typed-step storage/versioning (OD-REDESIGN-4) · Process/Run
schema + scheduling/idempotency contract (OD-REDESIGN-11) · clean data baseline + reset/rollback plan (OD-REDESIGN-34) ·
MCP seam (OD-REDESIGN-35). Also reversible details: exact lifecycle enums, SQL normalization, RLS helpers,
audit design, loading states.

**Phase-0 next step:** owner reviews `docs/jtbd.md` v0.4 and the E7 `PROTOTYPE-BRIEF.md`, then update the
existing working mockups into one decision-complete interactive prototype (OD-REDESIGN-2) → owner
validation/approval →
SDD spec → eng plan → TDD build → review battery → BDD acceptance. Nothing beyond documentation and
mockups is authorized yet; environment resets and deploys remain owner-gated.

## Buildout phase (2026-07-14 —)

- `docs/experience-contract.md` — **BINDING Rules 1–11** for the mos-app build (URL grammar, page
  anatomy, budgets, verb+object, capture-first, extension test, component reuse).
- `docs/plans/2026-07-14-redesign-buildout.md` — the owner-approved 11-step build sequence, with
  per-step drill flags and owner gates (steps 2/4/6).
- `docs/decisions.md` § OD-REDESIGN-56..60 — mockup phase closed · frame directives (Events root,
  Work children, header anatomy) · occurrences-as-Tasks + job-function assignment · Signal home ·
  component-reuse rule.
- `docs/design-mockups/redesign-mockups-2026-07/CONVERGENCE-AUDIT.md` — how the 13 convergence
  changes map onto OD-REDESIGN-1..55 (classifications a/b/c).
- `docs/design-mockups/redesign-mockups-2026-07/SALVAGE-INVENTORY.md` — **which mockup owns which
  surface (presumed correct — port, don't re-invent) + the only explicit overrides.** Live refs:
  e7 shell (:8766) + convergence flows (:8134) in the `gordi-mos-e7-prototype` working copy.

- `docs/plans/AUTONOMOUS-RUN-STATE.md` — **live run state**: mode (owner present/AFK), branch/PR
  strategy, per-step status, THE next open item, and the non-negotiable both-reviews gate. Index over
  the review ledger; the ledger is ground truth if they disagree.
- `docs/decisions.md` OD-REDESIGN-65 (design iterates ONCE inside implementation; the per-slice design
  review carries the mockup judgment) · OD-REDESIGN-66 (two fronts: manager efficiency AND barista
  obviousness).

## Provenance — the source conversations these decisions came from

> **📁 EXTRACTED IN-REPO → `docs/reference/provenance/`** — the owner↔assistant prose from the threads
> below, **owner prompts byte-verbatim**, tool-noise/secrets stripped, secret-scanned. Start there; it
> is version-controlled and cloud-reachable. The raw transcripts (paths below) are local + unversioned.

The E7 redesign was decided in agent threads outside this repo. They are **the primary record** behind
ADR-0025 + OD-REDESIGN-1..55; the docs here are their distillation. Cited so the reasoning is
recoverable (transcripts are local, machine-bound, and **not** version-controlled — treat the docs as
authority and these as evidence/archaeology).

| Thread | What it is | Where |
|---|---|---|
| **Design critique → mockups (the origin)** | The owner asked for an unsparing critique of the then-current design ("be as critical for all the design it currently has"), then "build high fidelity mockups for all of them". This is where the redesign path **started** — the critique that concluded the app "behaved like several apps". | Codex `~/.codex/sessions/2026/07/08/rollout-2026-07-08T11-09-22-019f3fea-869f-77e1-8e42-dad5e34ce85a.jsonl` (~6.4 MB, 2026-07-08) |
| **★ THE 50+ QnA GRILL → OD-REDESIGN-1..55 + ADR-0025** | The marathon owner↔agent interrogation that produced the locked decision set. Contains the ODs being authored inline (e.g. "OD-REDESIGN-1 — IA: modules as nav roots, grouped by BU (supersedes ADR-0019 D2)"). **~7,200 turns spanning 2026-07-10T00:05 → 2026-07-12T15:40**; ~1,076 OD-REDESIGN references. This is the thread to open when asking "why is OD-REDESIGN-N what it is?" | Codex `~/.codex/sessions/2026/07/10/rollout-2026-07-10T07-02-16-019f4955-0695-7012-a976-14dbee3263b8.jsonl` (~28 MB) |
| **Parallel/continued redesign thread** | Opened "we have a few model iterating on the redesign of the app… pick up where they have left" — a pick-up session continuing the redesign + prototype work. | Codex `~/.codex/sessions/2026/07/11/rollout-2026-07-11T08-50-33-019f4ede-83d0-7a12-a4a4-72fe86ea00aa.jsonl` (~11 MB) |
| **Later redesign follow-up** | Smaller continuation thread. | Codex `~/.codex/sessions/2026/07/13/rollout-2026-07-13T07-56-27-019f58f9-b2d6-76e0-b493-abc7ceb92596.jsonl` (~264 KB) |
| **zcode prototype build** | Build-substrate work only — **contains NO redesign QnA** (verified 2026-07-16). The only readable zcode artifact is the plan committed in-repo: `.zcode/plans/plan-sess_1becba75-1a74-4b48-a45d-1e0174d14ddd.md` (SOPs + shifts + Projects screen + editor conversion, 2026-07-15). | repo `.zcode/plans/…` |

### Follow-up threads — from the grill to the current buildout (Claude side)

The grill produced the *decisions*; these threads are where the mockups were judged, the **owner's
frustration surfaced**, and that frustration was converted into the buildout + OD-REDESIGN-56..66.

| Thread | Span | What it is |
|---|---|---|
| **Claude — pre-redesign era running into the lock** | 2026-06-29 → **2026-07-09** | The MOS workstream (agent-native ADR port, kitchen, cascade) that was in flight when E7 was locked on 07-09/10. Context for what the redesign inherited. `~/.claude/projects/-Users-ariefsaid-Coding-gordi-mos/da880767-4e08-4533-974b-fde455dccd86.jsonl` (~43 MB) |
| **★ Claude — THE FRUSTRATION → this buildout** | **2026-07-13 → 2026-07-16** | **The thread you are in.** Opens: *"im working on the redesign and ask the same question to 2 agents… assess which of these agents answer better?"* Contains the owner's frustration stated directly — mockups after 50+ QnA still *"not repulsed with, not happy enough, but passable"*; *"when we did a new version to address 1 thing, the other part that is already good for me, get changed in the new version"* (the **fork problem**); *"might as well reiterate when building rather than reiterating twice"*. **This is where the redesign changed course.** `~/.claude/projects/-Users-ariefsaid-Coding-gordi-mos/7e03ff90-ef78-4491-8422-d103534d2d51.jsonl` (~8 MB) |
| **Claude — MOS origin era** | 2026-06-18 → 06-29 | Earliest MOS-as-management-OS framing, pre-redesign. `…/92581b7f-b291-4b14-b677-e6d20b20f5bb.jsonl` (~31 MB) |

**What the frustration thread produced** (i.e. why the current plan looks the way it does):
- **OD-REDESIGN-56** — mockup phase CLOSED; iterate in the app, not in throwaway drafts (*"might as well
  reiterate when building rather than reiterating twice"*).
- **OD-REDESIGN-57** — the owner's hand-sketched frame (breadcrumb + ⌘K header, Work ▸ 4 collections,
  Events rail root).
- **OD-REDESIGN-58** — process occurrences surface as **Tasks**; job-function → holder PIC binding.
- **OD-REDESIGN-59..64** — Signal home, component reuse (Rule 11), role-based disclosure, typed Task
  (RACI off tasks), record URL grammar, Home dead-links.
- **OD-REDESIGN-65** — *the direct answer to the quicksand*: design iterates **once, inside
  implementation**; the per-slice design review carries the mockup judgment incl. **cross-version
  fork-catching**.
- **OD-REDESIGN-66** — the **two fronts** (manager efficiency AND barista obviousness).
- `docs/experience-contract.md` (Rules 1–12) + `docs/plans/2026-07-14-redesign-buildout.md` (the 11
  steps) + steps 1–3 built on `feat/redesign-buildout`.

**Reading order if you need the "why":** the 07-08 critique thread (why a redesign at all) → the
07-10/12 grill (what was decided and why) → `docs/decisions.md` OD-REDESIGN-1..55 + ADR-0025 (the
distilled law) → `docs/experience-contract.md` (the falsifiable bar built from it) → **the 07-13→16
Claude frustration thread** (why the mockup loop was closed and the buildout looks like this) →
`docs/plans/AUTONOMOUS-RUN-STATE.md` (where it stands now).

### Format — what these files actually are (verified 2026-07-16)

- **Codex = readable owner↔assistant QnA.** `.jsonl`, one JSON object per line (the 07-10 grill = 7,206
  records). Record types `response_item` / `event_msg` / `turn_context` / `session_meta`; turns carry
  `role: user | assistant | developer`. **The grill Q&A is genuinely reconstructable from these.**
- **zcode = NOT a QnA record.** Two stores, neither is a conversation:
  - `~/.zcode/cli/artifacts/sess_*/…json` — tool-result blobs (`kind: workspace_file_before_change`,
    `toolName: Edit`), i.e. file snapshots. The `sess_c46f9ce4…` set is dated **2026-06-19** — the
    June TasksWorkspace era, **not** the redesign. (An earlier version of this doc cited it as redesign
    provenance; that was wrong.)
  - `~/.zcode/cli/rollout/model-io-sess_*.jsonl` — raw model API I/O envelopes
    (`requestId`/`model`/`durationMs`/`attempt`), 3 files, **zero OD-REDESIGN references**.
  - Net: **the redesign QnA exists ONLY in Codex.** zcode contributed build work; its one readable
    redesign artifact is the in-repo plan above.

**Caveats:** the Codex transcripts are huge (28 MB / 7k turns) — grep for the specific OD number rather
than reading linearly. The **docs are authority — a transcript may contain superseded mid-conversation
positions.** They are local, machine-bound and unversioned: if this machine is lost, the *why* behind
OD-REDESIGN-1..55 is lost with it (the decisions themselves survive here).
