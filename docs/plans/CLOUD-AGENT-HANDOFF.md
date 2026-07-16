# Cloud agent handoff — run redesign steps 4→11 autonomously (owner-directed 2026-07-16)

**Mission:** finish the redesign buildout **steps 4 through 11 independently**, with **both review
batteries on every step**, and present the result to the owner **only after step 11**. The owner is
deliberately not looking before then.

**Read first (in order):** `CLAUDE.md` → `docs/agent-context.md` → this file →
`docs/plans/AUTONOMOUS-RUN-STATE.md` (live state + THE next open item) →
`docs/plans/2026-07-14-redesign-buildout.md` (the 11 steps) → `docs/experience-contract.md` (Rules
1–12, the acceptance bar) → `docs/reviews/feat-redesign-buildout.md` (evidence of record).
**Why any decision is what it is → `docs/reference/provenance/`** (the 50+ QnA grill + the owner's
frustration thread, his prompts verbatim). Docs are authority; transcripts are evidence.

---

## 1. Authority — what changed with this handoff (OD-REDESIGN-67)

The buildout plan says owner walkthroughs gate steps 2/4/6 and a visual sign-off gates every step.
**Those per-step owner gates are SUSPENDED for steps 4–11** and collapse into **one owner review after
step 11**. Nothing else relaxes.

| Still binding | Suspended until step 11 |
|---|---|
| **BOTH reviews per step** (code + 4-lens design), recorded in the ledger | Owner walkthrough at steps 4/6 |
| BLOCK → fix → **re-verify** → APPROVE (never wave through) | Owner visual diff per step |
| Experience Contract Rules 1–12 scored pass/fail | — |
| Coverage ≥80% changed lines, typecheck/lint 0 | — |
| RLS on every business table; `security-auditor` on 4 & 6 | — |
| TDD/BDD (assert the goal; never weaken a test) | — |
| Rule 11 component reuse (never re-implement a shipped/mockup surface) | — |

## 2. Decision policy without the owner (this is the crux)

Steps **4 (Signal v1)** and **6 (occurrence-as-tasks)** were flagged **"full grill required"** — schema,
RLS, visibility, mention fan-out, recurrence, function→holder. **That grill cannot happen.** Therefore:

- **Derive from locked law first:** `docs/decisions.md` OD-REDESIGN-1..66 + `docs/adr/0025-*` (D1–D41)
  + `CONTEXT.md`. Most of what a grill would ask is already decided there — read before inventing.
- **Where genuinely ambiguous → take the most CONSERVATIVE / fail-closed option**, and record it inline
  as **`RATIFY-BEFORE-MERGE:`** with the alternatives and your recommendation. Collect them into
  `docs/reviews/<branch>.md` § "Ratify before merge" per step.
- **Never guess a business rule silently.** Fail-closed beats permissive on anything RLS/visibility.
- **Do NOT reopen the domain grill** (OD-REDESIGN-1..55 is closed).

**Open ratifications you must NOT treat as settled:**
- **Q1 Signal-on-Home** — *provisionally* approved (OD-REDESIGN-59); it was to be ratified at the
  step-4 walkthrough, which is now deferred. Build it as specified, mark it `RATIFY-BEFORE-MERGE`.
- **Modules stay in the rail** — Director default; the owner's override window is open until this
  branch merges. Don't remove them; flag if a step pressures the decision.

## 3. Environment / piping — what you need to run both reviews

**Code review needs nothing** (reads the diff + spec).

**Design review needs a RENDERED, LOGGED-IN app** — that is the whole gate. **One command gets you
there:**

```bash
bash scripts/cloud-agent-bootstrap.sh
```

It starts Supabase (same container-exclusion list as CI), **writes `mos-app/.env` + `.env.e2e`**,
runs `npm ci`, installs Chromium, and verifies the app actually serves and auth answers. Idempotent;
never clobbers an existing `.env`.

**Why you can't skip it: `mos-app/.env*` are GITIGNORED.** A clone gives you no anon key → the dev
server boots but login is dead → no design review. This is the single thing that breaks a fresh
sandbox, and the script exists only to close it.

**Verified end-to-end 2026-07-16** from a bare clone of this branch: bootstrap → `npm run dev` →
login screen → demo persona button (`Passw0rd!dev`) → Home renders with live local data. So this
path is known-good, not theoretical.

Then: **a browser** — Playwright (`npx playwright test`, in-repo) or `agent-browser`. The reviewer
drives it itself and reads its own screenshots.

**No Docker in your runtime?** Then in order: (1) enable it — everything works; (2) point
`VITE_SUPABASE_URL`/key at a **separate** cloud Supabase project — **never the staging project**,
which holds REAL migrated data (48 wip / 521 logs / 524 plans, `docs/backlog.md`); a design review
that clicks "Mark complete" would mutate it; (3) stop the step.

**⚠ If you cannot render, you cannot run the design half of the gate → STOP that step at
"built, review-pending" and say so. Never mark a step done on code review alone.**

**pgTAP / integration:** `supabase test db` against the **ephemeral** stack (as CI does). **Never**
against cloud staging.

**Cloudflare/staging: NOT needed for reviews.** Staging is only for the owner's step-11 look, and it
deploys from the `staging` branch (downstream of `main`) — so deploying there before merge would
invert the review gate. Budget ~3–4 staging builds total, at the end, for the owner.

## 4. Git — what you may and may not do

- Base: **`origin/feat/redesign-buildout`** (pushed 2026-07-16; steps 1–3 + remediation; **not merged**).
- **Each step gets its own branch**, stacked on the previous step's tip:
  `git checkout -b feat/redesign-step4-signals origin/feat/redesign-buildout`, then step 5 off step 4's
  tip, etc.
- **You MAY push step branches** (needed so the owner can review). **You MAY NOT** open PRs to
  dev/main/staging, merge anything, or deploy. Merge + deploy are the owner's, after step 11.
- Commit **after every task** (substrate rate-caps have killed long runs; only committed work survives).
- Commit trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## 5. The loop per step (unchanged — project convention)

`spec → plan → TDD build → code review → design review → fix→re-verify → next step`.
Per **OD-REDESIGN-65**, design iterates ONCE inside implementation: the **per-slice design review
carries the mockup judgment** — judge against **all mockup versions** (`SALVAGE-INVENTORY.md` says which
mockup owns which surface) and **flag cross-version regressions** (something an earlier mockup got right
that the build lost) as **blocking**. Assess **rules-in-docs FIRST** (Contract 1–12 → `docs/jtbd.md`
→ `docs/reference/twenty-ixd-patterns.md`), **THEN** the mockups.
Score **both fronts** (**OD-REDESIGN-66**): manager efficiency/density AND barista zero-training
obviousness. **Every design-review dispatch carries a SCOPE CARD** (what's in-scope this step vs
deferred to step N) or the reviewer floods the ledger with future-step false failures.

**Serve the mockups to compare against** — they ARE in-repo (verified from a clean checkout
2026-07-17; before that, `convergence-flows/` and `serve-e7.py` were in **no git ref** and this
instruction would have dead-ended):
```bash
cd docs/design-mockups/redesign-mockups-2026-07
python3 serve-e7.py                              # :8766  e7 shell
cd convergence-flows && python3 serve-flows.py   # :8134  convergence flows
```
`SALVAGE-INVENTORY.md` says which mockup owns which surface. **Superseded ≠ wrong:** an older
mockup or doc that a newer decision moved past is still evidence — read it, don't dismiss it, and
never delete it. Where an earlier version answered something the current one lost, that's a
**cross-version regression → blocking** (OD-REDESIGN-65). Mockup-era material that the buildout
branch doesn't carry is preserved on `codex/e7-prototype`.

## 6. Substrate

Builders `zai/glm-5.2` (hard) / `glm-4.7` (routine); reviews **`gpt-5.6-luna --thinking max`**
(cross-family, **vision-capable — it drives agent-browser itself**); overflow NIM
`nvidia/nemotron-3-ultra` (**lower-trust → verify harder**; 40-RPM key shared with the PMO project — one
worker, no fan-out). Full routing: `docs/pi-delegation.md`. If you're a single cloud agent with your own
model, the substrate table is advisory — **the gates are not**.

## 7. Deliver at step 11

1. All step branches pushed, each with its ledger entry: both reviews, BLOCK→fix→APPROVE.
2. `docs/reviews/<branch>.md` per step: Rules 1–12 pass/fail, mockup-regression list, Rule-12
   cold-start verdict, and the **"Ratify before merge"** list (every conservative default you took).
3. `docs/plans/AUTONOMOUS-RUN-STATE.md` kept CURRENT as you go (it is the tracker; the ledger is truth).
4. A single summary: what shipped, what needs ratification, what you'd flag as risk.
5. **Then stop.** Owner reviews, ratifies, merges, deploys.

## 8. Known traps (paid for in blood)

- **"Stale" is the quicksand — don't reach for it.** The recurring failure of this project: an agent
  focused on one thing declares everything else stale/superseded, acts on that, and then the work has
  to return to what was dismissed (owner, 2026-07-17). **Superseded ≠ wrong ≠ deletable.** Before
  calling anything stale: (a) prove it — a line count or a date is not proof; diff for content the
  newer copy *lacks*; (b) **preserve it on its own branch instead of judging it**; (c) say what
  supersedes it and *by which decision*. This is the same instinct OD-REDESIGN-65 exists to stop:
  every round re-deciding what earlier rounds already got right.
- **Verify the machine before recording a blocker — or a reassurance.** A false "Supabase is down"
  note (a mis-read of a transient port-forward failure) stopped work that wasn't blocked. Worse, the
  docs claimed the mockups were "not at risk of being lost" while `convergence-flows/` sat in **no git
  ref at all** — a false reassurance fails silently, later, in someone else's sandbox. `git ls-tree`
  the thing before you promise it's there.
- **Edit one section → check its dependents.** Four self-contradictions shipped this way.
- **Two RACI leaks** were found only because *both* reviews ran — code review caught the one the design
  review missed, and vice-versa. Don't drop either.
- **Fresh-agent audits are cheap and keep finding real defects.** Run one (a neutral "explore and tell
  me what you understand + what's missing" pass) at each milestone.
- `/private/tmp` is wiped on restart; anything durable belongs in the repo.
