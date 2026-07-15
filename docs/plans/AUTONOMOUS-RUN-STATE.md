# Autonomous run state (owner AFK, 2026-07-15)

**Owner directive:** push ALL redesign steps automated while AFK. Build 4 & 6 (DB slices) on
CONSERVATIVE/fail-closed defaults from locked ODs, flag each schema/RLS decision "ratify before
merge", security-review. **Each step on its own stacked feat branch** (independent PR). **Hold all —
merge nothing, deploy nothing.** Owner ratifies + merges on return.

## Branch strategy
- `feat/redesign-buildout` = steps 1–3 + design-review remediation (waves 1–2). Finish here.
- Each of steps 4–11: own branch `feat/redesign-stepN-<slug>`, stacked on the prior step's tip
  (dependencies), each an independent PR-able unit. Hold local.

## ⚑ NON-NEGOTIABLE GATE — BOTH reviews per step, every feature (owner-directed 2026-07-15)
No step/feature is "done" or eligible to hold-as-shippable until BOTH batteries have run and are
recorded in `docs/reviews/<branch>.md`:
1. **CODE review** — cross-family Luna (`gpt-5.6-luna --thinking max`): spec conformance + code quality
   (+ security-auditor when the step touches auth/RLS/schema — steps 4 & 6 REQUIRE it).
2. **DESIGN review** — autonomous Luna (agent-browser): 4-lens (Visual·IxD·IA·Intent) vs docs Rules
   1–12 FIRST then the owning mockups (cross-version regressions), reusability, Rule-12 cold-start,
   A/B forks. Scope card mandatory.
A review that returns BLOCK must be fixed + re-verified (BLOCK→fix→APPROVE), not waved through. No
shipping a step on green tests alone or on one review. If substrate churn makes a review impossible,
STOP that step at "built, review-pending" — never mark it done.

## Loop per step (unchanged)
spec → plan → build → code review (Luna gpt-5.6-luna --thinking max, cross-family) → design review
(Luna autonomous, agent-browser, docs-rules-first THEN mockups, SCOPE CARD to avoid future-step
pedantry, A/B forks for owner) → Director verify. Contract Rules 1–12. Commit-per-task.

## Substrate (glm + nim back 2026-07-15)
Build hard/cross-cutting = glm-5.2; routine = glm-4.7; overflow when z.ai capped = NIM
nvidia/nemotron-3-ultra (LOWER-TRUST → verify harder; 40-RPM shared w/ PMO, single worker) or Luna.
Reviews = gpt-5.6-luna --thinking max. OOM history: owner cut Supabase docker; keep runs lean
(logs→files, one pi worker at a time, minimal screenshots).

## Progress
- [x] Steps 1–3 built + code-approved (ledger docs/reviews/feat-redesign-buildout.md)
- [x] Design review steps 1–3 → BLOCK; 4 forks decided (OD-REDESIGN-61..64)
- [x] Remediation wave 1 (mobile role-based, phone aria, Home dead-links) — done, verified
- [ ] Remediation wave 2 (Task record RACI→typed + Mark complete + canonical page) — WIP@4e4a952, completion running
- [ ] Re-run scoped design review on steps 1–3 (waves applied) → close BLOCK
- [ ] Steps 4–11 (own branches)
