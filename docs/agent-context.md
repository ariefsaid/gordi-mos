# Agent context — read me first (owner prefs · hard rules · gotchas · pointers)

Fast cold-start for a fresh agent (esp. post-compaction). This is the human/process layer; the
authoritative product/decision docs are linked at the bottom. Keep this file updated as things change.

> **This file owns STATE. `CLAUDE.md` / `AGENTS.md` own the standing RULES and deliberately carry no
> state** (tidied 2026-07-16, owner-directed: "it needs to be the rules spanning over time, it cannot
> be for ephemeral notes"). So: what's in flight, what's next, which gate is open, who's running it →
> **here**. A rule that outlives the workstream → there. Putting state back into `CLAUDE.md` is a
> regression, not an update.

> **Working in a fresh sandbox / cloud agent / new clone?** Run **`bash scripts/cloud-agent-bootstrap.sh`**
> first: `mos-app/.env*` are gitignored, so a clone has **no anon key** — the dev server boots but login
> is dead and **no design review is possible**. The script starts Supabase, writes the env, installs deps
> + Chromium, and verifies the app renders. Verified from a bare clone 2026-07-16 (bootstrap → login →
> Home with live data).

> **Product/IA direction below is superseded (2026-07-09/10) by ADR-0025 + `docs/decisions.md`
> OD-REDESIGN-1..79** (era **E8**, `docs/requirements-evolution.md`) — a full redesign, not a
> continuation of the "Current state" / "Headline current state" workstream dated 2026-07-07 below.
> Quick map: `docs/redesign-decision-index.md` (its **§ Provenance** maps the source threads).
> **Need the *why* behind a decision? → `docs/reference/provenance/`** — extracted grill + frustration
> threads, owner prompts verbatim, in-repo. Owner prefs, hard rules, multi-agent/git gotchas, and
> the delegation posture below are **not** superseded and remain binding.
>
> **WHERE ARE WE RIGHT NOW → `docs/reviews/v3-redesign.md` and `docs/reference/v3-live-inventory.md`.**
> V3 Issue 2 has green implementation evidence locally as a Storybook component/state/responsive
> proof checkpoint and is pending independent re-review and owner review at the issue boundary. The closed `docs/plans/AUTONOMOUS-RUN-STATE.md` /
> `CLOUD-AGENT-HANDOFF.md` material is historical; do not use it as the current V3 workstream state.

> **CURRENT WORKSTREAM (2026-07-20): V3 redesign Issue 2 local checkpoint**, workstream label
> `v3-redesign`, era E8. E7 owns visual styling; current owner law owns IA and interaction behavior.
> The Issue 2 plan is `docs/plans/2026-07-20-v3-storybook-matrix.md`; the governing spec is
> `docs/specs/v3-redesign.spec.md` §12; the generated proof is
> `docs/reference/v3-storybook-matrix.json` / `.md`; the live inventory is
> `docs/reference/v3-live-inventory.json` / `.md`; the visual evidence is
> `docs/reference/evidence/v3-storybook-2026-07-20/`; and the review ledger is
> `docs/reviews/v3-redesign.md`. The complete Issue 2 checkpoint is consolidated on the Director
> branch through `4fa90c1` (`d2aee27` initial workbench, `c744cf8` hardening, `4fa90c1` evidence
> reconciliation). The source worktree is clean and nothing has been pushed.
>
> Verified: 35 Storybook stories, 36 state entries, 3 responsive entries, and 23 canonical jobs;
> Storybook 10.5.2 with the external `@storybook/test-runner` 0.24.4 ran 7 suites / 35 tests with
> addon-backed a11y checks; plain `npm ci` succeeded without `--legacy-peer-deps`; Vitest remains
> 3.2.6. The Director’s Node guard evidence is 21/21 (12 matrix tests + 9 inventory tests), followed
> by 2/2 deterministic artifact-freshness CLI checks; targeted Vitest is 120/120; typecheck, ESLint,
> Stylelint,
> and the post-comment-fix production build pass. A resource-saturated full-suite attempt had two
> unrelated 5-second timeout flakes; both affected files reran alone at 30/30. Do not treat that
> attempt as a green full-suite gate.
>
> Not done: no route/page migration, no representative application acceptance, no Supabase or
> Supabase-dependent dev server, and no Issues 3–12 behavior. The exact recorded debts are the
> canonical Button loading state owned by Issue 3 and future shared RecordPanelHost behavior owned
> by Issue 4. Issue 2 maps to AC-V3-001 only as a workbench/evidence boundary and to NFR-V3-001/
> 002/003/004/005/006/007; it does not claim full master acceptance or close the Issue 9 rendered
> acceptance gate.
>
> **Next action:** independent re-review confirms the exact Director range `be8f854..4fa90c1`; then
> the owner reviews the linked matrix, browser evidence, and review ledger and explicitly approves
> the Issue 3 gate. Only after that approval may the next harness begin Issue 3 **Page-family
> primitives and migration guards**. The Issue 3 thread completed a clean preflight only: no code or
> commit was produced before Issue 2 integration.

### Consolidated V3 continuation map (2026-07-20)

All useful parallel planning work is committed on this Director branch; the source worktrees are
clean and no remote action occurred. A replacement harness should resume from this branch, not from
the source worktrees.

| Issue | Director commit / artifact | State and exact continuation |
|---:|---|---|
| 2 | `4fa90c1` plus prior Issue 2 commits | Implemented and locally verified; independent re-review and owner issue-boundary approval remain. |
| 3 | `80e5199`, `docs/plans/2026-07-20-v3-page-families.md` | Plan only. After Issue 2 approval, execute first with TDD; no Supabase required. |
| 4 | `2493506`, `docs/plans/2026-07-20-v3-shared-overlay-host.md` | Plan only. Execute after Issue 3; final async `leaveGuard(intent)` contract is binding. |
| 5 | `0d685d8` + `cf34354`, `docs/plans/2026-07-20-v3-record-viewer.md` | Plan only. Task adapter uses PIC/Supervisor and preserves distinct domain models. |
| 6 | `7798366`, `docs/plans/2026-07-20-v3-record-collection.md` | Plan only. Execute after Issues 3–5; owns persisted views and Tasks/Signals adapters. |
| 7 | `f0e585f`, `docs/plans/2026-07-20-v3-inbox-deputy.md` | Plan only. Owner must ratify provisional read-versus-handled semantics before implementation. |
| 8 | `6611c1b`, `docs/plans/2026-07-20-v3-cafe-canonical-records.md` | Plan only. Requires Issues 5–7 and explicit resolution of ambiguous legacy Task-to-Team mappings. |
| 10 | `afa9d35`, ADR-0052 + `docs/plans/2026-07-20-v3-structured-content.md` | ADR/plan only. Owner ratification and Issues 3–9 precede implementation. |

Issues 9, 11, and 12 remain specified by `docs/specs/v3-redesign.spec.md` and are not falsely marked
planned or implemented here. Do not collapse the above plans into one parallel implementation wave:
their dependency order is intentional, and the single local Supabase means database/e2e work must be
serialized.

## V3 Issue 2 resumable checkpoint (2026-07-20)

This is the canonical handoff for the locally implemented Issue 2 work, pending independent
re-review. Do not infer state from a running process or an uncommitted generated directory.

### Verified

- Scope: Storybook workbench only; the seven curated story files contain 35 indexed stories. The
  deterministic guard excludes only each file's `v3Matrix` metadata export from CSF indexing and
  derives canonical coverage from actual production named imports.
- Matrix totals: 36 state entries, 3 responsive entries (`desktop1280` 1280px, `intermediate`
  1024px, `phone390` 390px), and 23 canonical component/job representations.
- Package compatibility: Storybook `10.5.2`, `@storybook/react-vite` `10.5.2`,
  `@storybook/addon-a11y` `10.5.2`, and external `@storybook/test-runner` `0.24.4`; the existing
  Vitest `3.2.6` project and `mos-app/vite.config.ts` test behavior remain unchanged. No Vitest 4,
  `@vitest/browser`, `@vitest/browser-playwright`, or `@storybook/addon-vitest` was installed.
- Production corrections are locked in the existing ViewTabs, StatusPill, and CommandMenu suites;
  Button/CardHead/CommandMenu changes are narrow E7/interaction/a11y corrections with rendered or
  behavioral evidence. Storybook overlay mocks remain on the Storybook-only alias boundary and are
  absent from `mos-app/dist`.
- Evidence: [matrix](reference/v3-storybook-matrix.md), [live inventory](reference/v3-live-inventory.md),
  [rendered evidence](reference/evidence/v3-storybook-2026-07-20/), [plan](plans/2026-07-20-v3-storybook-matrix.md),
  and [review ledger](reviews/v3-redesign.md).

### Gate record

| Command | Result |
|---|---|
| `node --test scripts/v3-storybook-matrix.test.mjs` | 0; 12 passed (21/21 when combined with the 9 inventory tests) |
| `node --test scripts/v3-live-inventory.test.mjs` | 0; 9 passed |
| `node scripts/v3-storybook-matrix.mjs --check` / `node scripts/v3-live-inventory.mjs --check` | 0; current |
| Plain `npm ci` in `mos-app/` after clean `node_modules` | 0; no resolver flag |
| `npm ls --depth=0 ... vitest ...` | 0; Vitest 3.2.6, no Vitest 4/browser package |
| `npm run typecheck` | 0 |
| `npm run lint` | 0; ESLint and Stylelint, zero warnings |
| `npm test -- src/components/command/command-menu.test.tsx --run` | 0; 35 passed, including loading → ArrowDown → ready → Enter |
| Full `npm test` attempt | Inconclusive under resource contention: two unrelated 5-second timeout flakes; both affected files reran alone at 30/30 |
| `npm run test:coverage -- --reporter=dot` | 0; 2,878 passed; 92.52% statements/lines, 86.93% branches, 88.34% functions |
| `npm run build` | 0; 665 modules; post-comment-fix CSS syntax warning gone; only the pre-existing >500k chunk advisory remains |
| `npm run build-storybook` | 0; Storybook 10.5.2; generated output ignored |
| `npm run build-storybook && npm run lint` | 0 |
| `npm run lint && npm run build-storybook` | 0 |
| `npm run test-storybook` from `mos-app/` | 0; 7 suites / 35 tests passed in 83.085s after the final viewport-runner and hook-shape corrections |
| `git diff --check 0fd276f HEAD` and `git diff --check` | 0 |

### Remaining delivery sequence

3. Page-family primitives and migration guards.
4. Shared overlay/panel/navigation host.
5. RecordViewer contract, field primitives, and Task adapter.
6. RecordCollection/view engine and Tasks/Signals adapters.
7. Inbox triage plus Deputy host integration.
8. Café canonical-record integration and Team-context correction.
9. Representative-slice rendered/driven owner gate; provisional IA ratification.
10. Structured-content schema ADR, storage/RLS, editor, and typed embeds.
11. Remaining route migration by page/component family.
12. Full cross-surface acceptance, stale-style removal, documentation closure, and owner walkthrough.

Issue 3 unlock condition: owner approval of this Issue 2 evidence and explicit confirmation at the
issue boundary. No Issue 3+ claim is included in this checkpoint.

## Reading order for a cold start (30+ docs; these are the ones that bind)

Read in this order. Everything else is evidence you consult when a specific question arises.

**1. The LAW (what you must obey — read all four, they're short):**
- `CLAUDE.md` — the loop, the gates, model discipline. Rules only, no state.
- `docs/experience-contract.md` — Rules 1–12, the UI acceptance bar (incl. Rule 8-desktop no-clip).
- **`docs/interaction-contract.md`** — ONE behaviour per interaction class (I1–I10) + a per-surface
  conformance table. **Behaviour is first-class here** because three audit generations measured
  statics and let the interaction layer fracture. Lens (b) must DRIVE these, not read code.
- `CONTEXT.md` — the domain vocabulary. "Process Run" is not a user-facing noun; PIC/Supervisor,
  not RACI; Signal replaced Weekly Update + Daily Log.

**2. The DECISIONS (why anything is the way it is):**
- `docs/decisions.md` — OD-REDESIGN-1..79. The owner's word, chronological.
- `docs/reference/provenance/owner-directives-index.md` — **the composite oracle**: every verbatim
  owner directive across every era, traced to its shipped state. Use this before assuming intent.
  Its tiers: owner-word > lost-good (things an EARLIER mockup got right, including things e7 itself
  dropped) > owning-mockup default. **The oracle is the composite, never one snapshot** — the owner:
  "i dont want to look exactly like e7… that's why i keep calling it a moving quicksand."
- `docs/adr/` — architecture (0025 = the redesign direction; 0050/0051 = Signal + occurrence schema).

**3. The STATE (what's done / open):**
- `docs/reviews/v3-redesign.md` — current Issue 1 evidence, inventory totals, contradictions, and the exact Issue 2–12 delivery sequence/gates.
- `docs/reference/v3-live-inventory.md` — reproducible route/component/style evidence.
- `docs/backlog.md` — current V3 banner plus standing programs and historical strata.
- `docs/plans/AUTONOMOUS-RUN-STATE.md` and `docs/reviews/claude-redesign-buildout-completion-vdrd17.md` — historical E7 evidence only; do not treat them as the current V3 state.

**4. The DEBT MAPS (what's known-broken and why):**
- `docs/reviews/cohesion-debt-2026-07-19.md` — the mechanical sources of "several apps thrown
  together" + what shipped against them.
- `docs/reviews/parity-sweep-2026-07-18.md` — fidelity/provenance audits + the convention audit.

## The five traps this project has actually paid for (do not re-learn these)

1. **A check whose failure is silent is not a check.** Real instances: a secret scan that "passed"
   because grep crashed; a merge gate that skipped design+security when `git diff` failed; an auth
   e2e rewritten to a `localStorage.clear()` that never called `signOut()`; e2e runs piped through
   `tail` that ate a 6-failure block AND the exit code; the orphan-doc gate that exited 1 silently
   *at the moment it found an orphan*. **Always capture exit codes; never `| tail` a verification.**
2. **Measure the goal, not a proxy.** "Tokens are in-palette" passes with the WRONG token — the rail's
   selected-state shipped invisible that way. Design fidelity = **computed-style parity** against the
   owning mockup (`design-reviewer.md` Lens a); interaction = **driven**, not read.
3. **An owner artifact's omission IS a decision.** The frame sketch had no module blocks; that was
   flagged, unanswered, defaulted-around, and the default got enshrined in OD text — then six audits
   verified the text. Every build-time deviation from an owner artifact MUST become a
   `RATIFY-BEFORE-MERGE:` ledger line (CLAUDE.md, binding).
4. **"Stale" is quicksand.** Superseded ≠ wrong ≠ deletable. Prove it by diff, preserve on a branch,
   name the decision that supersedes.
5. **Parallel agents need isolation + the correct base.** Agents sharing a worktree while the Director
   runs `git reset --hard` lose their work; `isolation:worktree` branched off the WRONG base (main,
   not the feature tip) and three agents correctly refused to build. Create the worktree yourself off
   the verified tip, one branch each, and merge serially.

**Historical evidence of record:** `docs/reviews/feat-redesign-buildout.md` (steps 1–3 + base closure). Current evidence of record is `docs/reviews/v3-redesign.md`.
>
> **UPDATE 2026-07-14 — mockup phase CLOSED (historical; superseded by V3 Issue 1 evidence).** The
> E7/convergence mockups remain standing references with a presumption of correctness for later in-app
> migration, and their ownership map is `docs/design-mockups/redesign-mockups-2026-07/SALVAGE-INVENTORY.md`.
> Issue 1 creates no standalone mockups; direct in-app iteration and the owner-approved representative
> slice begins only at the separately numbered Issue 9 representative owner gate, after Issues 2–8 have
> completed their own acceptance and the owner approves that gate.

## Who the owner is (Arief) & how he works
- **Concise reporting** — sacrifice grammar for concision; lead with the answer, not the journey.
- **"Make it work", pragmatic, one-step infra** — prefers the shortest correct path; dislikes
  over-engineering (a `ponytail` lazy-mode is often active). But **not** at the cost of safety/correctness.
- **Director posture is expected** (you are the Director; he is the board): challenge bad decisions, ask
  clarifying questions, verify everything yourself — never rubber-stamp a subagent's summary
  (close-review the actual artifacts/diffs/code).
- **Visual fidelity bar** — he judges UI by *look-vs-mockup*, not green tests. Render + eyeball at real
  widths (incl. ≤380px phone) before claiming a UI change done. jsdom/RTL computes no layout.
- **Follows the verbatim product charter** (`docs/product-expectations.md`). The review battery is a
  **binding gate**, not optional (see Hard rules).
- **Credentials/secrets:** NEVER enter his credentials; NEVER read `~/.op-token` or any `.env`. Fetch
  secrets only via **`op-get.sh <item> <vault> <field>`** (1Password vaults **AS** + **Gordi**). When op
  isn't authenticated in the shell, ask him to unlock / provide — don't work around it.
- When Claude is overloaded/rate-limited, he's fine delegating heavy work to **pi CLI** (GLM builders +
  gpt-5.6-luna cross-family reviewers, `docs/pi-delegation.md`); vision/design-review stays Claude/Director.

## Hard rules (non-negotiable)
1. **Review battery before EVERY merge-to-main.** Run `bash scripts/pre-merge-check.sh` (exit 0) + record
   `docs/reviews/<branch>.md` (spec + code-quality always; security if auth/RLS/schema; design if
   `*.tsx`/`*.css`). Green tests ≠ reviewed. **Separate repos (`gordi-kitchen-app`) have NO gate script —
   they need the SAME battery, recorded in gordi-mos `docs/reviews/kitchen-app-worker-prs.md`.** (Missed
   this twice; the 2nd miss hid a real fail-open security bug — see `review-battery-before-merge` memory.)
2. **Secrets** — see owner section. `op-get.sh` only; never `.env`/`.op-token`.
3. **ESB GOO = TEST DATA ONLY** (spec FR-084). Never send Gordi's real GKID product/BOM IDs to GOO (it's a
   shared multi-tenant sandbox). Details: `docs/reference/esb-goo-integration.md`.
4. **De-reference firewall** — no external/brand/AGPL references in MOS design artifacts; the design kit is
   MOS's own. (ESB API coordinates are fine — ESB is the real integration partner, not a design reference.)
5. **Git hygiene** — branch → PR → merge; the concurrent agent works on its own branch; **`git push
   origin HEAD:main` is blocked**; **rebase onto latest `origin/main` before merging** (your local `main`
   ref goes stale — `git fetch` first, and rebase any worktree you cut from a stale local main).
6. **One issue / one PR.** Pause at issue boundaries; owner approves spec sign-off + prod deploy /
   irreversible infra; Director approves merge-to-main within the signed spec.

## Multi-agent dispatch — worktrees are the DEFAULT (owner-directed 2026-07-06)
Dispatch every role/build agent in its **own git worktree** (`isolation: "worktree"` on the Agent tool,
or the pi equivalent) so parallel agents never share one checkout. The shared-tree clobber that bit us on
2026-07-06 (a Codex session moved our HEAD mid-merge) does not happen when each agent has its own tree.
- **Never put `git checkout`/`checkout -b` in an agent's brief** — the harness already parks it on its own
  `worktree-agent-<id>` branch; a `checkout` in the brief leaks to the MAIN tree's HEAD. Tell it to work in
  place, commit to its branch, and report; the Director merges from `worktree-agent-<id>`.
- **After merging an agent's work, clean up:** `bash scripts/worktree-cleanup.sh [target=dev] [--remote]`
  removes merged worktrees + deletes merged local (and optionally remote) branches. Protected: main/dev/
  staging/current. It only ever deletes MERGED branches — unmerged work is safe.
- **After any worktree-agent dispatch,** confirm your own HEAD didn't wander:
  `git branch --show-current` + `git rev-parse --short HEAD`. See [[mos-multiagent-git-gotchas]].

## Gotchas (will bite you)
- **Stale local `main`:** `git worktree add … main` uses your *local* ref, which lags `origin/main` after
  you merge a PR. `git fetch` + rebase the worktree, or it'll miss/clobber recent merges.
- **Multi-agent repo:** subagents only see their own worktree; a separate session (even a non-Claude one
  like Codex) may share the primary checkout. Keep agents in worktrees; verify HEAD after dispatch.
- **Mocked unit tests miss DB reality:** a wrong column name / RPC signature passes mocked Vitest but 400s
  against real PostgREST (the `log_date` bug). Verify-live any DB-column/RPC change against a running stack.
- **GOO ≠ `stg-erp`:** GOO Core API is `stg7.esb.co.id/core-stg`; `stg-erp.esb.co.id` is the ESB web UI.
  Auth = login (not the static token, which is the OMS read API's bearer). `docs/reference/esb-goo-integration.md`.
- **Costing-model asymmetry:** GKID = actual-costing (`/assembly-actual`); GOO's SAE tenant = standard-
  costing (`/assembly`). The worker's assembly call can't be validated on GOO — GKID flip is its only proof.
- **Commit trailer (gordi-mos):** `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Dev-login orphan after schema work → `supabase db reset` relinks (or PR #57 heals it permanently).

## Current state — where to read what
| Need | Doc |
|---|---|
| **How the requirement evolved (era timeline — read before any older doc)** | `docs/requirements-evolution.md` |
| **Current redesign direction + next work** | `docs/specs/v3-redesign.spec.md` + `docs/plans/2026-07-20-v3-design-foundation.md` + `docs/reviews/v3-redesign.md` |
| **Legacy implementation + infrastructure status** | `docs/platform-workstream-status.md` |
| **Agent-native port (ADR-0018) — plans per train** | `docs/plans/2026-07-04-port-p1-substrate.md` · `docs/plans/2026-07-05-port-p2-panel-runtime.md` · `docs/plans/2026-07-06-port-p3-automations-inbox.md` |
| **Review battery ledgers (per branch)** | `docs/reviews/feat-port-p1-substrate.md` · `feat-port-p2-panel-runtime.md` · `feat-bu-taxonomy-remap.md` · `feat-home-v1-margin.md` · `feat-port-p3a-replay-inbox.md` · `feat-p2.1-db-side-aggregate.md` · `release-staging-bu-remap.md` · `feat-work-spine.md` · **MVP-push (2026-07-07): `feat-ia-nav-work-spine.md` · `feat-ar-followup-bridge.md` · `feat-plan-v1.md` · `feat-home-stacked-union.md`** · **pre-F hardening A1–A6: `feat-harden-round2.md`** |
| **MVP-readiness audits** | `docs/reviews/mvp-readiness-charter-audit-2026-07-06.md` (round 1, charter) · `mvp-readiness-audit-round2-2026-07-07.md` (round 2, gpt-5.5 ×3 — the pre-F hardening blocklist A1–A6, **now DONE**) |
| **Design reviews (rendered)** | `docs/reviews/design-mvp-push-2026-07-07.md` (4-lens, render-verified) · **`ui-coherence-audit-2026-07-07.md` (whole-app coherence — the task #19 retrofit plan; verdict: application-gap, not ground-up)** |
| **Current JTBD design oracle (Lens-D) — E7, pending written-form owner review** | `docs/jtbd.md` (**v0.4** — 9 job families · 23 journeys · 6 scenario threads) |
| **IA/product ADRs (Accepted 2026-07-06)** | `docs/adr/0022-plan-destination-cogs-budget.md` · `docs/adr/0023-multi-location-inventory-internal-replenishment.md` · `docs/adr/0024-roastery-esb-sales-order-push.md` · decisions.md "Continued grill session 2" block |
| **Work-spine slice (D14 step 3, held on `feat/work-spine`)** | `docs/specs/work-spine.spec.md` · `docs/plans/2026-07-06-work-spine.md` · `docs/reviews/feat-work-spine.md` |
| **Roastery Operate requirements (10 owner-decisions in §6)** | `docs/specs/roastery-module.requirements.md` |
| **PMO→MOS agent-capability expansion (feeds next grill)** | `docs/specs/agent-capability-expansion.md` |
| Full task list / backlog | `docs/backlog.md` |
| Locked owner decisions (OD-*) + ADRs | `docs/decisions.md`, `docs/adr/` (0017–0021 = agent-native/IA/can()/i18n; **0022 Plan-COGS-budget · 0023 multi-location-inventory · 0024 roastery-ESB-sales-order-push = Accepted 2026-07-06**) |
| Domain glossary | `CONTEXT.md` (repo root) |
| Binding charter + per-layer Definition of Done | `docs/product-expectations.md` |
| Director runbook / loop / UI cycle | `docs/director-playbook.md`, `docs/design-workflow.md` |
| **ESB / GOO integration (coords, auth, recipe, gotchas)** | `docs/reference/esb-goo-integration.md` |
| **ESB warehouse online (box · op map · cron · observability · owner-actions)** | `docs/reference/warehouse-online.md` |
| Kitchen module spec (FR/AC) | `docs/specs/kitchen-module.spec.md` |
| Delegation via pi CLI | `docs/pi-delegation.md` |
| Staging env + gotchas | `docs/environments.md` |

## V3 Issue 1 local checkpoint (2026-07-20)

- **Status:** documentation truth reset, deterministic inventory, and binding DESIGN.md reconciliation are complete locally; owner review is pending.
- **Evidence:** [`docs/plans/2026-07-20-v3-design-foundation.md`](plans/2026-07-20-v3-design-foundation.md), [`docs/reference/v3-live-inventory.json`](reference/v3-live-inventory.json), [`docs/reference/v3-live-inventory.md`](reference/v3-live-inventory.md), [`DESIGN.md`](../DESIGN.md), and [`docs/reviews/v3-redesign.md`](reviews/v3-redesign.md).
- **Inventory:** 58 route declarations (29 page, 25 redirect, 4 DEV-only), 13 shared interaction jobs, 67 CSS families; 7 route records are bespoke/missing frames and 13 are bespoke/missing heads in the current source scan.
- **Resolved contradictions:** old Page Archetypes/Write-Review/Catalog-Manage language and deleted-route examples are gone from DESIGN.md; rail geometry is 232px; E7 row geometry is 52px; V3 separates E7 styling from owner IA/IxD law; record opening, focus, Back, direct editing, and responsive rules are explicit.
- **Not migrated:** no Storybook, route migration, RecordViewer/RecordCollection application code, shared overlay host migration, CSS/token consumer migration, database/JSONB work, Supabase command, dev server, or rendered application acceptance.
- **Gate:** Issue 2 starts only after owner approval of the plan, inventory, and DESIGN.md foundation. Issue 2 is Storybook component/state/responsive proof only; Issues 3–8 own the application migrations by capability, and Issue 9 owns the later representative rendered/driven owner gate.

## Legacy headline state (historical — do not use as current V3 state; 2026-07-07 late)
- **⚠️ READ the `## Current focus (2026-07-07 late)` block in `docs/platform-workstream-status.md` first** — full state + branch map + ▶ NEXT. Summary: `dev` includes the UI-coherence merge, closure regression guards, and post-merge IA cleanup. **Pre-F hardening A1–A6 DONE + merged** (`docs/reviews/feat-harden-round2.md`; pgTAP 570 · unit 2345 · cov 95.43%). **Nav catalog FR-424** (Objectives/Projects&Processes back as capability-gated Work rail entries). **MVP-push design review render-verified** (`design-mvp-push-2026-07-07.md`). **UI-coherence polish + deputy battery DONE + merged** (`docs/reviews/feat-ui-coherence.md`): Select retrofit, shared tables/state/header cleanup, no-FAB deputy launcher, phone MyTasks reflow, and Deputy **C2 safe markdown + C3 typed widgets**; closure guards and IA cleanup also landed. **F (task #16, owner-gated)** = promote + deploy + secrets + backup drill + prod security gate + A4 job-GUC org-scope.
- *(Prior, 2026-07-07 — now history:)* MVP push shipped 5 slices A–E to `dev` dark behind flags; round-2 gpt-5.5 ×3 audit → SHIP-WITH-FIXES (blocklist A1–A6, now done).
- *(Prior, 2026-07-06 EOD — now history:)* staging LIVE up-to-BU-remap; COGS root-cause fix deployed; ADR-0022/0023/0024 + JTBD v0.3 accepted + merged to dev; grill session-2 decisions in `docs/decisions.md`.
- Kitchen Module + access roles + UI-revamp + Strategy→Execution cascade first slice **SHIPPED to main**.
- Agent-native platform port P1/P2/**P3a/P2.1 all on `dev`** (green CI, PRs #88/#89 MERGED 2026-07-06). `main`/`staging` deliberately conservative at up-to-BU-remap (`669ee0a`).
- CI-fix pass (task-detail async races, Home-v1 e2e `My Week`→Home route, Sales KPI locator scope,
  recovery password-policy, coverage timing budgets) landed via `c96fb5a` + `4f67080`; full local battery
  re-verified green (typecheck/eslint/2217 unit/449 pgTAP/22 e2e/build) + fresh GitHub `verify`+`db` green
  before merge.
- **Multi-agent hazard (hit + resolved 2026-07-06):** a parallel Codex session shared this working tree and
  moved HEAD mid-work. Two agents on one checkout = clobber risk. Owner stopped Codex; Director took sole
  ownership, adopted Codex's clean rebased stack (verified byte-identical code), merged, cleaned up stale
  branches. If HEAD ever looks wrong, check `git branch --show-current` + reflog before acting.
- **Delegation posture (owner-directed 2026-07-06):** orchestrate heavy build/fix via **pi** (GLM-4.7/GLM-5.2
  builders, gpt-5.6-luna cross-family reviewers — `docs/pi-delegation.md`) to preserve Anthropic tokens;
  Director retains verify + merge/git + final visual taste. (The #88/#89 close-out needed no code fix — it
  was git orchestration + CI-watch, no pi spend.)
- Remaining user-facing rollout work is owner-gated: staging db push, edge-function model secret/live
  deputy verify, P3b generateLink hook check, VAPID keys, and ESB PIC settlement answer.
