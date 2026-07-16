# Redesign buildout — live run state (update this doc as work lands)

**What this is:** the single "where are we RIGHT NOW" tracker for the redesign buildout
(`docs/plans/2026-07-14-redesign-buildout.md`). The **review ledger**
(`docs/reviews/feat-redesign-buildout.md`) is the evidence of record; this file is the index over it.
If the two disagree, **the ledger is ground truth** — and this file is stale: fix it.

**Last updated:** 2026-07-16 (owner present; docs consolidated after a fresh-agent comprehension audit).

## Mode (READ THIS FIRST — it changes what you're allowed to do)

- **Owner is PRESENT.** Normal per-issue gates are in force: spec sign-off, owner walkthroughs at
  steps 2/4/6, owner visual diff every step, owner approves push/merge/deploy.
- *(Historical: a 2026-07-15 AFK window authorized building all steps unattended on conservative
  defaults with everything held locally. That window is CLOSED. Do not act on it.)*

## Branch / PR strategy (owner-directed 2026-07-15)

- `feat/redesign-buildout` = **steps 1–3 + their design remediation**. This branch is **one PR unit**.
  It is **held local — never pushed, no PR opened, nothing merged.** Owner reviews + merges.
- **Steps 4–11: each gets its OWN branch**, `feat/redesign-stepN-<slug>`, stacked on the prior step's
  tip (to satisfy dependencies), each an independent PR-able unit. Also held pending owner approval.
- Steps 4 & 6 touch schema/RLS → conservative/fail-closed defaults, every ambiguous decision flagged
  **"ratify before merge"**, `security-auditor` mandatory.

## Where the work stands

| Step | Built | Code review | Design review | Status |
|---|---|---|---|---|
| 1 Styling pass | ✅ | BLOCK → fixed → **APPROVE** | ✅ (light+dark) | **Done** (pending owner visual sign-off) |
| 2 Shell + routes | ✅ | BLOCK → fixed → **APPROVE** | ✅ | **Done** (pending owner walkthrough) |
| 3 Tasks re-home | ✅ | BLOCK → fixed → **APPROVE** | ✅ | **Done** (pending owner visual sign-off) |
| Remediation waves 1/2/2b | ✅ | BLOCK → fixed → **APPROVE** | OD-61..64 all **RESOLVED**, 0 new regressions | Done |
| **Wave 2c** (desktop table density) | ✅ `8ab3235` | gates green (typecheck 0, lint 0, ~2619 unit, 49 e2e) | ⛔ **NOT re-verified — the open item** | **Built, design-review PENDING** |
| 4–11 | ❌ not started | — | — | Blocked on the item below + owner gates |

## ▶ THE NEXT OPEN ITEM (do this first)

**Re-run the design review to confirm Wave 2c cleared the last BLOCK.** The design re-review
(`docs/reviews/feat-redesign-buildout.md` § "Design RE-review steps 1–3") returned **BLOCK** on exactly
one in-scope finding: the desktop Tasks table at 1280px overflowed (10 columns / ~1284px inside a 994px
viewport), pushing the decision-critical **Due** column off-screen vs the e7 reference. Wave 2c
(`8ab3235`) trimmed the table to e7 priority columns and moved the optional ones to the drawer.
**No APPROVE has been recorded** — steps 1–3 are NOT closed until it is.

Acceptance: at 1280px the Due column is visible with no horizontal clip; the optional fields remain
reachable in the drawer/full page; none of the other four resolved OD-61..64 findings regress.

**⚠ Blocker:** the design review needs the **live app**, which needs **Gordi's local Supabase**
(`supabase start`, api :44321). It is currently **DOWN** (stopped after an OOM; the running docker
containers are PMO-portal's — a different project — do not touch them). Without Supabase you can build
and code-review, but you **cannot** run the design half of the gate, and **no step may be marked done
without it** (see the gate below).

## ⚑ NON-NEGOTIABLE GATE — BOTH reviews per step, every feature (owner-directed 2026-07-15)

No step/feature is "done" until BOTH are run and recorded in `docs/reviews/<branch>.md`:
1. **CODE review** — cross-family Luna (`gpt-5.6-luna --thinking max`): spec conformance + code quality
   (+ `security-auditor` when the step touches auth/RLS/schema — steps 4 & 6 REQUIRE it).
2. **DESIGN review** — 4-lens (Visual·IxD·IA·Product/Intent), vision-capable reviewer, per
   **OD-REDESIGN-65** (double duty: all mockup iterations incl. fork-catching + the IA/IxD/UX
   fundamentals) and **OD-REDESIGN-66** (both fronts: manager efficiency AND barista obviousness).
   Scope card mandatory (say what's in-scope vs deferred, or the reviewer fails future-step work).
A **BLOCK must be fixed and re-verified** (BLOCK → fix → APPROVE) — never waved through. Green tests
alone are never sufficient. If substrate churn makes a review impossible, stop the step at
**"built, review-pending"** — never mark it done.

## Loop per step (project convention — unchanged, see CLAUDE.md)

`grill → spec → mockup → implement → code/spec review battery → design review battery (IA/IxD/UX) → loop`.
Grill/spec/mockups are DONE for this redesign; per **OD-REDESIGN-65** mockup re-iteration is closed and
its judgment lives in the per-slice design review, so design iterates **once, inside implementation** —
this removes no phase, spec, review, or gate.

## Substrate notes (they cost real time — plan around them)

- Builders: `zai/glm-5.2` (hard/cross-cutting), `zai/glm-4.7` (routine). Reviews: `gpt-5.6-luna
  --thinking max` (cross-family, vision-capable — it drives agent-browser itself). Overflow when z.ai
  is capped: NIM `nvidia/nemotron-3-ultra` (**lower-trust → verify harder**; 40-RPM key **shared with
  the PMO project** — one worker, no fan-out). Full routing: `docs/pi-delegation.md`.
- **z.ai capped repeatedly** (5-hour windows) during 2026-07-15/16 and killed runs mid-slice. Mitigation
  that worked: tmux-detached dispatches + **commit-after-each-task** + WIP checkpoints, so a killed run
  loses nothing. Keep doing this.
- **OOM crashed a session.** Keep runs lean: one pi worker at a time, logs to files (never held in
  context), minimal screenshots. `/private/tmp` is wiped on restart — dispatch scripts must be
  recreated; anything durable belongs in the repo.

## Mockups: where they actually live (they are VERSIONED HERE)

The mockups are **tracked in this repo** at `docs/design-mockups/redesign-mockups-2026-07/` (e7 shell +
`convergence-flows/` + `SALVAGE-INVENTORY.md`). They are load-bearing evidence for every UI review and
are **not** at risk of being lost.

The sibling working copy `../gordi-mos-e7-prototype` is only a **convenience for serving them live**
(`serve-e7.py` → :8766, `convergence-flows/serve-flows.py` → :8134) while the main repo sits on a
feature branch. If it's missing, serve the same files straight from this repo — nothing is lost.

## Open-question trackers — ONE source of truth

`docs/backlog.md` § THE WALL is the **single source of truth for open/unratified items**. The buildout
plan's "Q-status" section is a *convenience summary* of the redesign-specific ones; if the two ever
disagree, **the backlog wins** and the Q-status is stale.

Current standing ratifications:
- **Q1 Signal-on-Home** — *provisionally approved* (OD-REDESIGN-59); final ratification at the step-4
  walkthrough. Step 5 must not treat it as final.
- **Q2 job-function assignment** — **APPROVED** (OD-REDESIGN-58).
- **Events as a rail root** — **RATIFIED** by the owner's frame sketch (OD-REDESIGN-57); it is built and
  live in the shell. The phrase "third ratification slot" in `experience-contract.md` Rule 3 is
  historical wording from when it was still a pending call — it is decided, not pending.
- **Modules stay in the rail** — Director default, owner may still override. The window is **OPEN**:
  "before step 2 merges" means before this branch is merged; step 2 being *built* does not close it,
  and nothing has merged.

## Step-level "done" vs PR-level "done" — same bar

They are the same bar, applied once per step rather than once per PR. `CLAUDE.md`'s battery gates
merge-to-main; this buildout applies it **per step** because each step is an independent PR unit
(steps 4–11) or part of one (steps 1–3). Passing it per step is what makes the eventual PR reviewable;
it is not a second, different standard.

## Branch stacking — how step 4+ actually cuts (nothing is pushed)

`feat/redesign-buildout` is **local-only and never pushed**, so remote-tracking stacking is not
available. Stack **locally off the local branch tip**:
`git checkout -b feat/redesign-step4-signals feat/redesign-buildout`.
Each subsequent step cuts from the previous step's local tip. They become independent PRs later, in
order, once the owner approves and the base is pushed — until then the whole chain stays local. Do not
try to push an intermediate base to create a stack.

## Related

`docs/plans/2026-07-14-redesign-buildout.md` (the 11-step plan) · `docs/experience-contract.md`
(Rules 1–12) · `docs/reviews/feat-redesign-buildout.md` (evidence of record) ·
`docs/decisions.md` OD-REDESIGN-56..66 · `docs/redesign-decision-index.md` (map) ·
`docs/design-mockups/redesign-mockups-2026-07/SALVAGE-INVENTORY.md` (which mockup owns what) ·
`docs/plans/briefs/` (per-dispatch agent instruction packets — working artifacts, not authority).
