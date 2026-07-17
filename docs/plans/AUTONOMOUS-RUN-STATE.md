# Redesign buildout — live run state (update this doc as work lands)

**What this is:** the single "where are we RIGHT NOW" tracker for the redesign buildout
(`docs/plans/2026-07-14-redesign-buildout.md`). The **review ledger**
(`docs/reviews/feat-redesign-buildout.md`) is the evidence of record; this file is the index over it.
If the two disagree, **the ledger is ground truth** — and this file is stale: fix it.

**Last updated:** 2026-07-16 (owner present; docs consolidated after a fresh-agent comprehension audit).

## Mode (READ THIS FIRST — it changes what you're allowed to do)

- **▶ CLOUD-AGENT AUTONOMOUS RUN (OD-REDESIGN-67, 2026-07-16):** steps 4–11 run independently; the
  owner reviews **once, after step 11**. Per-step owner gates are suspended; **both review batteries
  remain mandatory**. Charter + piping: **`docs/plans/CLOUD-AGENT-HANDOFF.md`** — read it before
  starting any step.

- **Owner is PRESENT.** Normal per-issue gates are in force: spec sign-off, owner walkthroughs at
  steps 2/4/6, owner visual diff every step, owner approves push/merge/deploy.
- *(Historical: a 2026-07-15 AFK window authorized building all steps unattended on conservative
  defaults with everything held locally. That window is CLOSED. Do not act on it.)*

## Branch / PR strategy (owner-directed 2026-07-15)

- `feat/redesign-buildout` = **steps 1–3 + their design remediation**. This branch is **one PR unit**.
  **PUSHED to `origin/feat/redesign-buildout` (2026-07-16)** so a cloud agent can reach it —
  **no PR opened, nothing merged.** Seeing/working this branch is expected, not a rule violation.
  Merge remains the owner's call. *(It was local-only until 2026-07-16; older notes saying "never
  pushed" are stale.)*
- **Steps 4–11: each gets its OWN branch**, `feat/redesign-stepN-<slug>`, stacked on the prior step's
  tip (to satisfy dependencies), each an independent PR-able unit. Also held pending owner approval.
- Steps 4 & 6 touch schema/RLS → conservative/fail-closed defaults, every ambiguous decision flagged
  **"ratify before merge"**, `security-auditor` mandatory.

## Owner sign-off status (reconciles the ledger's "owner AFK" notes)

Ledger entries for steps 1–3 say "owner visual sign-off pending (owner AFK)" — that was true when
written. **The AFK window is closed; the owner is present.** Those sign-offs are **still outstanding** —
"pending" is accurate, only the reason changed. Steps 1–3 need: the Wave-2c design APPROVE, then the
owner's visual sign-off + the step-2 walkthrough.

## Where the work stands — RUN COMPLETE (2026-07-17, steps 4–11 all shipped)

**▶ THE AUTONOMOUS RUN IS DONE.** All of steps 4–11 are built, reviewed (full battery per step:
spec · code-quality · design 4-lens rendered · security where schema/RLS changed), every BLOCK
fixed and re-verified, and `bash scripts/pre-merge-check.sh` exits **0** on
`claude/redesign-buildout-completion-vdrd17`. What remains is the OWNER's single post-step-11
review: ratify the consolidated list, then merge and deploy (owner's calls, per OD-REDESIGN-67).

| Step | Built | Battery | Status |
|---|---|---|---|
| 4 Signal v1 | ✅ | spec ✅ · CQ ✅ · design BLOCK→fix→✅ · security BLOCK→fix→✅ | **Done** |
| 5 Home proper | ✅ | spec ✅ · CQ ✅ · design BLOCK→fix→✅ | **Done** |
| 6 Occurrence-as-tasks | ✅ | spec ✅ · CQ ✅ (fix-then-ship items fixed) · security ✅ (Lows hardened) · design BLOCK→fix→✅ | **Done** |
| 7 Café retrofit | ✅ | spec ✅ · CQ ✅ · design ✅ | **Done** |
| 8 Catalog re-home | ✅ | spec ✅ · CQ ✅ · design ✅ | **Done** |
| 9 Money+Inbox (flag-gated) | ✅ | spec ✅ · CQ ✅ · design ✅ | **Done** |
| 10 Events stub | ✅ | spec ✅ · CQ ✅ · design ✅ | **Done** |
| 11 Decommission sweep | ✅ | spec ✅ · CQ ✅ · holistic design pass SHIP | **Done** |

**Branch tip gates:** typecheck 0 · lint 0 · Vitest 273/2760 · pgTAP 100/727 · live e2e 52 passed
(F1/F2/F3/AC-630/AC-720 green) · pre-merge-check exit 0.

**Evidence of record:** `docs/reviews/claude-redesign-buildout-completion-vdrd17.md` (branch ledger:
consolidated verdicts, gates, the owner's 15-item ratify list, deferred debt) + one ledger per step.
**Owner's next action:** review the ratify list there, walk the app, then merge/deploy.

*(Historical per-step live-state entries below this point are superseded by the table above.)*

## (superseded) Where the work stood

| Step | Built | Code review | Design review | Status |
|---|---|---|---|---|
| 1 Styling pass | ✅ | BLOCK → fixed → **APPROVE** | ✅ (light+dark) | **Done** (pending owner visual sign-off) |
| 2 Shell + routes | ✅ | BLOCK → fixed → **APPROVE** | ✅ | **Done** (pending owner walkthrough) |
| 3 Tasks re-home | ✅ | BLOCK → fixed → **APPROVE** | ✅ | **Done** (pending owner visual sign-off) |
| Remediation waves 1/2/2b | ✅ | BLOCK → fixed → **APPROVE** | OD-61..64 all **RESOLVED**, 0 new regressions | Done |
| **Wave 2c** (desktop table density) | ✅ `8ab3235` | spec + code-quality **APPROVE** (2026-07-16, cloud) | **APPROVE** (2026-07-16, rendered, pixel evidence) | **Done** |
| Security BLOCK (HIGH-1/2, MED-1, LOW-1) | ✅ fixed `54afd98`+`0088246` | re-audit **APPROVE** | shell fix 4-lens **APPROVE** | **Done** |
| 4 Signal v1 | 🔨 in progress (cloud run) | — | — | spec+plan+ADR-0050 done; building |
| 5–11 | ❌ not started | — | — | queued behind step 4 |

## ▶ BASE IS CLOSED (2026-07-16, cloud autonomous run — OD-REDESIGN-67)

All four STEP-0 verdicts are honest APPROVEs and `bash scripts/pre-merge-check.sh` exits **0** on
`claude/redesign-buildout-completion-6vu4tr` (= `origin/feat/redesign-buildout` + the base-closing
commits; `feat/redesign-buildout` itself left untouched — merge remains the owner's). Steps 4–11
proceed on step branches stacked on this tip. Owner-facing sign-offs (visual diffs, walkthroughs,
Q1 ratification) collapse into the single post-step-11 review per the handoff.

**Environment: NOT blocked (corrected 2026-07-16).** Gordi's local Supabase **is UP** — all
`supabase_*_gordi-mos` containers healthy, api :44321 returns 200, and the app authenticates. An earlier
entry in this doc claimed Supabase was "DOWN after an OOM" and treated it as *the* blocker on the whole
workstream; **that was wrong** (a mis-read at a moment when port-forwarding was transiently broken — see
the `docker restart` gotcha in `docs/agent-context.md`). **Lesson: verify the machine before recording a
blocker in the docs — a false blocker stops real work.** The design review can run now.

*(Also note: `docker ps` shows a second, unrelated `*_pmo-portal` Supabase stack — a different project.
Do not stop those.)*

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

## Mockups: where they actually live (VERSIONED HERE — true as of 2026-07-17, was NOT before)

The mockups are tracked at `docs/design-mockups/redesign-mockups-2026-07/` (e7 shell +
`convergence-flows/` + `SALVAGE-INVENTORY.md`). Serve them **straight from this repo**:
`python3 serve-e7.py` → :8766 · `cd convergence-flows && python3 serve-flows.py` → :8134
(both verified HTTP 200 + rendering from a repo checkout, 2026-07-17).

**⚠ This section used to say the mockups were tracked and "not at risk of being lost." That was
FALSE and went unchallenged for days.** `convergence-flows/` (19 files) and `serve-e7.py` existed in
**no git ref at all** — only as untracked files in the sibling `../gordi-mos-e7-prototype` worktree,
on one disk — while 10 committed docs pointed at them and `SALVAGE-INVENTORY.md` named
convergence-flows the **owner** of specific surfaces. Fixed 2026-07-17 (commit `962de90`); the
worktree is preserved verbatim on `codex/e7-prototype` (`6f0a46a`).

**Lesson (same shape as the false-Supabase-blocker below): verify the machine before writing a
reassurance into the docs.** "Nothing is lost" is a claim about the filesystem — check it with
`git ls-tree`, don't infer it. A false reassurance is more dangerous than a false blocker: a blocker
stops work loudly; a reassurance fails silently, at the worst moment, in someone else's sandbox.

The sibling worktree `../gordi-mos-e7-prototype` is now **optional** — nothing depends on it.

## Open-question trackers — ONE source of truth

**For the REDESIGN, this doc's list below is the source of truth** for open/unratified items — a fresh
-agent audit (2026-07-16) found `docs/backlog.md` § THE WALL contains only closed *pre-redesign* items
(WALL-1..4) and no redesign-era ones, so pointing there was wrong. `docs/backlog.md` remains the
source of truth for **non-redesign** open items + risks; the buildout plan's "Q-status" is a summary of
the list below (if they disagree, **this list wins**).

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

## Branch stacking — how step 4+ actually cuts

`feat/redesign-buildout` **is pushed** (`origin/feat/redesign-buildout`, 2026-07-16) but **not merged**.
Cut each step off the previous step's tip — local or remote-tracking both work now:
`git checkout -b feat/redesign-step4-signals origin/feat/redesign-buildout` (or the local ref; they're
in sync — `git fetch` first if unsure). Each subsequent step cuts from the previous step's tip. They
become independent PRs, merged in order, once the owner approves. **Pushing a step branch is fine
(a cloud agent needs it); opening a PR / merging is the owner's call.**

## Related

`docs/reference/provenance/` — **the why**: the 50+ QnA grill, the origin critique, and the owner's frustration
thread (prompts verbatim) that produced the mockup-quicksand fix (OD-65) + the two fronts (OD-66).

`docs/plans/2026-07-14-redesign-buildout.md` (the 11-step plan) · `docs/experience-contract.md`
(Rules 1–12) · `docs/reviews/feat-redesign-buildout.md` (evidence of record) ·
`docs/decisions.md` OD-REDESIGN-56..66 · `docs/redesign-decision-index.md` (map) ·
`docs/design-mockups/redesign-mockups-2026-07/SALVAGE-INVENTORY.md` (which mockup owns what) ·
`docs/plans/briefs/` (per-dispatch agent instruction packets — working artifacts, not authority).
