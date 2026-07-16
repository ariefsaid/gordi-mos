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
- `docs/plans/2026-07-14-redesign-buildout.md` — the owner-approved 10-step build sequence, with
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
