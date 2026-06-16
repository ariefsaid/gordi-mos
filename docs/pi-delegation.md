# Delegating role work to pi — Director guide (Gordi MOS)

**Status: ACTIVE** (adopted 2026-06-12 from PMO's pi-delegation trial). This document tells any agent
acting as **Director** (`docs/director-playbook.md` §1 posture) how to dispatch role work to the
**pi CLI** instead of (or alongside) Claude subagents. It changes **who executes a phase — nothing
else**. The per-issue loop, gates, and checkpoints in `docs/director-playbook.md` §2 (including the
`grill-with-docs` intake gate and the Phase-0 mockup-first gate), the UI cycle in
`docs/design-workflow.md` (§1 mockup-first + §2 four-lens battery), and the per-layer DoD in
`docs/product-expectations.md` are unchanged and binding.

Verified live on this machine 2026-06-12: `pi` 0.79.1, `agent-browser` 0.27.0; providers
`zai/glm-5.1` and `openai-codex/gpt-5.4` both smoke-tested green. **`zai/glm-5.2`** (newest GLM, out
2026-06) trialed-good as a builder 2026-06-16 — now the **preferred builder** and a capable
**orchestrator/Director of a parallel pi team** (§3e, owner-directed for max Claude-token economy).

## 1. Division of labor (binding)

| Who | Keeps |
|---|---|
| **pi dispatches** | Spec/plan authoring, implementation slices, mockup HTML builds, code-level reviews & audits — i.e. the role-agent work of playbook §2 steps 2–7 · **rendered UI/UX/FE verification via the `agent-browser` CLI** (§3a) |
| **Director (you)** | Dispatch briefs · verification of every claim (§5) · the **final rendered visual-taste lens** + owner-facing screenshots (design-workflow §2.3 lens (a) sign-off — taste needs vision; pi text models work from the a11y tree) · merge + git hygiene (playbook §6) · prod operations (`supabase/README.md`, ris-dev) |
| **Owner** (Arief) | Spec sign-off, mockup/IA approval, production/irreversible approvals — exactly as in CLAUDE.md "Quality gates & checkpoints" |

pi agents may **commit on the issue branch** (implementer discipline) but never push, open PRs, or
merge — the release-engineer flow and the Director merge gate (playbook §6) are unchanged.

## 2. Model routing (by task complexity)

Replaces playbook §3 / the model-delegation-discipline memory's opus/sonnet/haiku mapping when running pi:

| Substrate | Use for | Claude analog |
|---|---|---|
| `zai` / `glm-5.2` | **Newest GLM (out 2026-06; trialed-good as builder 2026-06-16 — first-pass-correct, none of the §6 tendencies).** Preferred **builder** for implementation slices; also a capable **orchestrator/Director** of a parallel pi team (§3e) | opus/sonnet |
| `zai` / `glm-5.1` | Planning, specs, complex or security-sensitive slices (schema, RLS, RPC, auth), orchestrator / manager-grade judgment | opus |
| `zai` / `glm-4.7` | Routine implementation, mechanical edits, QA runs, mockup builds | sonnet/haiku |
| `openai-codex` / `gpt-5.4` | ALL reviews and audits — spec-review, code-quality, design-review, security. Deliberately **cross-family** vs the GLM builders | opus reviewers |
| `openrouter` / **Nemotron 3 Ultra (free)** → **Nex N2 Pro (free)** | LAST-RESORT free fallback **only when BOTH z.ai AND OpenAI are rate-limited** — keeps the loop moving rather than stalling on a 429 | best-effort |

> **⚑ GLM-only degraded review mode (gpt-5.4 / openai-codex unavailable).** When the cross-family
> reviewer is down, route reviews to a **different GLM than the builder** (build `glm-5.2` → review
> `glm-5.1`): gives *some* independence but is **same-family** — weaker than the intended cross-family
> check. OK for low-risk / presentational slices; for **security / RLS / RPC / auth or money-path**
> changes, escalate to the Director's own review or wait for cross-family — never ship those on a
> same-family-only sign-off.

OpenRouter slugs (confirmed live 2026-06-12): Nemotron 3 Ultra (free) = `nvidia/nemotron-3-ultra-550b-a55b:free`; Nex N2 Pro (free) = `nex-agi/nex-n2-pro:free`. Both reachable via `--provider openrouter`.

The agent's own `model:` frontmatter is IGNORED under pi (pi uses `--model`); route by this table.
**Fallback (owner rule):** z.ai limit → use `gpt-5.4`; OpenAI limit → use GLM; **BOTH rate-limited →
the OpenRouter free models** (owner directive 2026-06-12): try **Nemotron 3 Ultra (free)** first, then
**Nex N2 Pro (free)**, via `--provider openrouter --model <slug>` (confirm the exact OpenRouter model
slugs from the OpenRouter model list at first use — the names above are the owner's shorthand). These
are last-resort capacity, not quality-matched to GLM/gpt-5.4 — the Director's double-verification (§5)
matters more, not less, when running on them. Smoke-test any provider with
`pi --provider <p> --model <m> -p --no-session --no-tools "Reply with exactly: OK" < /dev/null`.

## 3. Invocation pattern

```bash
cd <issue-worktree-or-repo-root>   # dispatch from where the work happens (worktree per issue, playbook §6)
pi --provider zai --model glm-5.1 -p --no-session \
  --append-system-prompt .claude/agents/<role>.md \
  "<self-contained brief>" < /dev/null
```

- **`< /dev/null` is load-bearing** — without it `-p` can block on stdin.
- **`--append-system-prompt`** injects the role contract. `.claude/agents/*.md` are **tracked**
  (present in every worktree). `.claude/skills/*` are **gitignored** (vendored) — reference them by
  **absolute path from the primary checkout**, e.g.
  `--append-system-prompt /Users/ariefsaid/Coding/gordi-mos/.claude/skills/feature-forge/SKILL.md`.
  (Stack multiple `--append-system-prompt` flags: role contract + the skill[s] it owns.)
- Run long dispatches as **harness-tracked background tasks** with a generous timeout. **Never
  `nohup … &`** — the wrapper is reaped when the parent shell exits and the run dies silently.
  (macOS has no `timeout`; rely on `< /dev/null` + the background-task timeout, or `gtimeout`.)
- Avoid `--mode json` unless piping to a file — a single long run once emitted 664 MB of stdout.
- pi has no MCP and no built-in subagents; its power tool is Bash. Default tools: read/bash/edit/write.

### 3a. Rendered UI/FE verification from pi — `agent-browser` CLI

pi agents drive a real browser through Bash with the **`agent-browser`** CLI
([vercel-labs/agent-browser](https://github.com/vercel-labs/agent-browser), installed globally).
Use it in design-review / qa dispatches and in ui-implementer self-checks:

- **Tell the agent to start with** `agent-browser skills get core --full` — the CLI ships its own
  version-matched usage skill (workflows, ref/selector usage, examples). Put that line in the brief;
  don't paste flag docs. (The vendored `.claude/skills/agent-browser/SKILL.md` is only a discovery stub.)
- Core verbs: `open <url>` · `click/fill/type/press` · `wait <sel|ms>` · `screenshot [path]` ·
  snapshot/refs per the core skill. Serve static mockups with `python3 -m http.server <port>` from the
  mockup dir; the app via `npm run dev` from `mos-app/` (serves `http://localhost:5173/mos/`). The local
  Supabase stack is `supabase start -x edge-runtime` from repo root (ports **44321** api / 44322 db /
  44324 mailpit — NEVER touch the pmo-portal stack).
- **Text models verify against the accessibility tree / DOM assertions** (snapshot + selector checks:
  states, labels, focus order, counts) — that covers design-workflow §2.3 lens (b) IxD-flow and lens
  (c) IA walks plus functional FE verification. **Screenshots are for vision-capable reviewers** — have
  the pi agent save them to a known path; the Director (a vision model) judges lens (a) pixel/taste from
  the files. (This is exactly where Claude's design-reviewer caught the cross-schema bug, the transparent
  Submit button, and the dead roster rows — keep that Director lens on every UI slice.)
- The owner-approval artifact (design-workflow §2.5, §3) is still produced/curated by the Director — pi
  screenshots feed it, they don't replace the gate.

### 3b. Dispatch mechanics — background, never block or poll (Claude Code harness)

- Launch EVERY pi dispatch with **`Bash(run_in_background: true)`** + a generous `timeout` +
  `< /dev/null`, and **redirect output to a file**: `pi … "$brief" </dev/null > /tmp/pi-<id>.log 2>&1`.
  The tool returns immediately with a task id; **your turn ends and your context is freed.**
- The harness sends a **`<task-notification>`** when the command exits and **re-invokes you**. On that
  wake, **Read the output FILE once** (tail it / grep the sentinel + load-bearing claims), then verify.
- ❌ **Foreground Bash** — ties up the turn for the whole run, burns context.
- ❌ **Polling loops** — repeatedly `TaskOutput`/`Read`-ing the run while it's live. This pulls large
  output into the context window and grows the app's RAM. Do NOT use `TaskOutput` to watch a pi run;
  wait for the notification, then read the file ONCE.

### 3c. Resource isolation — pi is a CHILD of the Claude app (RAM + crash survival)

A `Bash(run_in_background)` pi dispatch is spawned **inside the Claude-app process tree**:
- pi's **model inference is remote** (z.ai/OpenAI) — zero local RAM. But pi's own process, **retained
  background-task output buffers, and any screenshots read into context** grow the app's RAM over a long
  session (the transcript itself also grows). The app has crashed past ~20 GB.
- Because pi is a child of the app, **a Claude-app crash kills the in-flight pi run** → half-applied
  edits (`git diff` before trusting anything; re-dispatch as a COMPLETION round, never a blind retry).
- **Levers when local RAM is the binding constraint:** (1) redirect pi stdout to a file and tail the
  FILE — never hold a full run's output in context; (2) verify UI by grep/DOM/a11y-tree assertions and
  let the vision pass open image files only when a visual judgment is actually due (don't read every
  screenshot into context); (3) for heavy-toolchain runs (Docker `db reset`, full e2e) when session RAM
  is already high, prefer a git-worktree-isolated dispatch so a crash can't corrupt the primary checkout.
  See `docs/environments.md` "Local stack hygiene" for the canonical cleanup runbook (RAM/disk release, Docker prune patterns, worktree lifecycle).

### 3c-bis. ⚑ A *non-main* orchestrator (Claude subagent OR a pi/GLM orchestrator) must keep pi IN-TURN

The §3b "background + the harness re-invokes you" pattern is **main-Director-only**. Anything that is NOT
the main Claude session is never auto-re-invoked when a background task finishes:
- A **Claude subagent** acting as orchestrator that fires `Bash(run_in_background)` pi and ends its turn
  → the child is **orphaned** (verified in PMO: empty worktree, idle pi). It must dispatch pi **blocking
  foreground** `Bash(timeout: 600000)` (≤10-min slices) and stay alive to verify + continue; split longer
  work, or detached-tmux + poll the `__PI_EXIT_0__` sentinel **within the same turn**. (detached-tmux can
  fail in a sandboxed subagent — `fork failed: Device not configured`; foreground-blocking is the safe default.)
- A **pi / GLM orchestrator** (§3e) is a CLI process, not on the Claude harness at all — it likewise can't
  rely on notifications; it dispatches its sub-pi workers via **blocking Bash** (pi-calling-pi) or its own
  tmux + sentinel loop, all **within its own run**.
Make this explicit in any orchestrator brief. Only the **main Director** uses §3b background + auto-notify.

### 3e. Parallel GLM teams — GLM as a separate orchestrator/Director (max Claude-token economy)

For a **large, well-scoped, independent workstream** where Claude's per-step judgment isn't needed mid-loop
(a multi-slice series, a bulk codemod/migration across many files, a parallel set of independent issues),
hand the **whole inner loop** to a **GLM orchestrator** so the Claude Director spends ~zero tokens until it
finishes. This is the owner-directed "pi + GLM as a separate parallel team, GLM as the director" mode
(2026-06-16).

**Shape:**
- One `pi --provider zai --model glm-5.1` (orchestrator judgment) **or** `glm-5.2` (builder-strong) run
  whose brief = *"You are the Director for workstream X. Run the per-issue loop (`docs/director-playbook.md`
  §2): for each item, dispatch a sub-`pi` role-worker via Bash (pi-calling-pi,
  `--append-system-prompt .claude/agents/<role>.md`), verify it (gates + grep + sentinel), then the next;
  produce a final report + a sentinel."* The orchestrator commits on its branch.
- It runs as **ONE** Claude-backgrounded task (§3b) — or detached-tmux (§3c) for heavy/long — so **Claude
  gets a single notification when the entire workstream finishes**, not per slice. Per §3c-bis the
  orchestrator keeps its own sub-dispatches in-turn (blocking / tmux-sentinel).
- **Parallelism:** launch several GLM-orchestrator runs in **separate git worktrees** at once (one
  workstream each) — a true parallel team. **Stagger anything that drives the single local Supabase stack**
  (migrations / `db reset` / pgTAP / e2e) — never two at once (playbook §3).
- **Models inside the team:** orchestrator = glm-5.1/5.2; builders = glm-5.2; reviewers = **gpt-5.4
  cross-family** (or the GLM-only degraded mode in §2 if codex is down — then Claude's own review carries
  more weight on load-bearing slices).

**Binding boundaries (the GLM team runs the inner loop, NOT the gates):**
- The GLM team **never pushes, opens PRs, or merges.** Claude (the human-facing Director) still owns
  **merge + git hygiene** (rebase, conflict-marker scan, the merge gate), the **final rendered
  visual-taste lens** (vision — GLM works the a11y tree), and **owner gates** (spec sign-off, mockup/IA
  approval, production/irreversible) per CLAUDE.md.
- Claude **verifies the team's output before merge** (§5, doubly): gates green, `git diff` the branch,
  render the UI, scan for conflict markers + e2e-softening (§6). A GLM-orchestrated workstream is
  **lower-trust** than a Claude-run one — verify harder; **security/RLS/RPC/auth/money-path must not ship
  on a GLM-only review**.
- **When NOT to use it:** novel architecture/security/auth design, anything needing the owner mid-loop, or
  work where Claude's judgment/taste is the point. Use it for **breadth + token economy**, not the hard calls.

## 4. Brief structure — the quality lever

pi agents see NOTHING of your session. The brief must stand alone:

1. **Task in one line**, naming the phase + binding role rules ("per docs/design-workflow.md §2").
2. **READ FIRST list** — exact paths: the locked `OD-*` decisions (`docs/decisions.md`), the
   `CONTEXT.md` glossary, the spec/plan, the **reference slice** (the shipped Tasks DB-view — ADR-0007
   split-view + ADR-0008 DB-view, spec `docs/specs/tasks-dbview.spec.md`):
   `mos-app/src/pages/TasksLayout.tsx` +
   `mos-app/src/components/tasks/{TasksWorkspace,TaskDrawer,TaskSurface,GroupHeaderRow,ViewTabStrip,useTasksViewPref}.tsx`
   + `mos-app/src/lib/db/tasks.ts` (`TaskSurface` is the one editor; `TaskDetail.tsx`/`TaskCreate.tsx`/
   `TasksPage.tsx` are thin/un-routed — don't brief from them) — and for schema/RLS the
   `supabase/migrations/20260611000007..09_mos_*` + their pgTAP), relevant ADRs.
   The agent reads them itself; don't paste content.
3. **Output path** — exact file(s) the agent must write.
4. **Conventions verbatim** — spec/plan/test conventions from CLAUDE.md (EARS, AC-### Given/When/Then,
   no-placeholder 2–5-min tasks, AC-id tagging, one-owning-layer test pyramid).
5. **Do-NOT list** — scope fences ("spec is signed — do not re-litigate", "do not redesign the shell").
6. **End marker** — require a final sentinel line (`SPEC-DONE`, `BUILD-DONE`, `FIX-DONE`…) so you can
   detect truncated/killed runs cheaply.
7. **"Verify your own work"** — instruct the agent to re-read its output against the input list and
   report deviations. (Then verify yourself anyway — §5.)
8. **Fix rounds:** numbered findings, "fix ALL, change nothing else". **Completion rounds** (after a
   killed run): list ONLY the missing items, "do not rework what already landed".

### 4a. Manager (orchestrator) briefs — result-based, NOT step-by-step (owner-directed 2026-06-16)

§4 above is the **single-role WORKER** brief (one bounded spec/build/review slice). When dispatching a
**GLM manager/orchestrator** (§3e) — which **may spin up its own sub-`pi` subagents** — brief it by
**OUTCOME, not steps**, and grant it the latitude to decide the decomposition, so the Director stays in
the **review/verify** seat instead of supervising every move:

1. **The goal / outcome** — what "done" looks like, not a step list.
2. **The Definition of Done + acceptance criteria** it must hit — the *verifiable bar* (gates green; the
   specific ACs preserved/added; the final sentinel). This is what you'll check, so make it concrete.
3. **Non-negotiable invariants** (binding even with full latitude): the **BDD rule** (assert the goal,
   never weaken/soften/`.catch` an assertion), the **gates** (typecheck/lint/test/build), **never
   push/PR/merge**, the scope fences, and **security/RLS/RPC/auth/money-path is never sole-signed by a
   GLM** (§2 degraded mode, §5).
4. **READ-FIRST pointers** (decisions/spec/reference slice) so it grounds itself — but let it choose the path.
5. **Latitude grant, explicit:** "you decide how to decompose; you MAY dispatch sub-`pi` role-workers via
   Bash and run an inner review loop; keep sub-dispatches **in-turn** (§3c-bis); spawn a cross-family or
   different-GLM reviewer for load-bearing slices."
6. **A final verifiable report + sentinel** — so the Director verifies the **result against the DoD**
   (§5), not the steps.

**The trade (say it in the brief):** the *how* is delegated; the *rigor* moves entirely into **outcome
verification** — a looser brief ⇒ a **tighter** verify, never a lighter one. Fall back to the §4
prescriptive worker brief for a single bounded slice, or when a prior result-based run drifted.

## 5. Verification — playbook §7, applied doubly

Never accept a pi completion report. Minimum per dispatch:

- **Artifact exists** (`wc -l`, `git status`) and **ends with the sentinel line**.
- **Grep the load-bearing claims** (the fix-list items, the AC ids, the constants, the OD ids).
- **Structure-check HTML/JSX bulk edits** — balance-count tags or parse before trusting a bulk edit
  (a GLM builder once dropped a `<section>` and silently swallowed every later section).
- **Render UI work yourself** (the playwright/preview MCP or `agent-browser` + your own screenshot read)
  — design-workflow §2.3 lens (a); it catches what source review can't.
- **Run the gates yourself** before any phase transition: from `mos-app/` `npm run typecheck` ·
  `npm run lint:ci` · `npm test`/`test:coverage` · `npm run build` · `npx playwright test`; and
  `supabase test db` (+ the CI definer-revoke lint) for DB changes.
- **Killed/timed-out runs leave HALF-APPLIED edits.** `git diff` first; re-dispatch as a completion
  round, never a blind retry.

**Cross-family review is complementary, not sufficient.** Run **both** lenses on anything load-bearing
— the cross-family reviewer (gpt-5.4) AND the Director's own read. (Trial empirics from PMO: gpt-5.4
caught 3 criticals a GLM author missed — a fake progress bar, e2e not proving their ACs, an org_id seam
violation — while the Director's own read caught 2 the reviewer missed. Both lenses, always.)

**Result-based (§4a) dispatches raise the verification bar, not lower it.** When you delegated the *how*,
the outcome check is the only safety net: verify the **DoD line-by-line** (each AC preserved/added, the
gates re-run *by you*, the diff read, the UI rendered), and treat a manager run that touched
security/RLS/auth/money-path as **lower-trust** until your own review clears it. Latitude on the path is
fine; latitude on the verify is not.

## 6. Known failure tendencies (watch for these in review)

- **e2e softening** — `.catch(...)` around assertions, or "element exists" instead of the journey goal.
  Violates the binding BDD rule (CLAUDE.md). Reject on sight. (This project has already caught this
  class via the design-review battery — keep it ruthless.)
- **Honest-UX shortcuts** — e.g. a fake/indeterminate progress bar where real progress is specced; a
  clickable-looking row with no handler (the P2-2c FR-031 miss).
- **Stopping partway** on long multi-item briefs (glm-4.7) — hence sentinel lines + completion rounds.
- **Scope drift in mockups** — page-level reframing of tab-level UI, invented vocabulary; pin terms to
  the real component and `CONTEXT.md` in the brief.
- **Schema/security gaps mocks hide** — cross-schema PostgREST embeds (resolve names client-side),
  mutable `created_by`/`org_id`, public-execute SECURITY DEFINER funcs (the definer-revoke CI lint
  guards this). Always run `supabase test db` + the security-auditor lens on data/auth slices.

## 7. Where this fits

- Sequencing + status: `docs/STATUS.md` (read-first) + `docs/backlog.md` (current: MVP feature-complete;
  Tasks DB-view redesign SHIPPED #19; **P3-1 production deploy** is the next milestone).
- The loop being executed: `docs/director-playbook.md` §2; UI issues additionally
  `docs/design-workflow.md` §1 (Phase-0 mockup gate) + §2 (per-UI-issue loop + 4-lens battery).
- Grading: playbook §10 rubric applies to pi-produced work unchanged.
- **Substrate-agnostic fallback:** if pi or the providers are unavailable, fall back to the standard
  Claude role agents (the Agent tool, `.claude/agents/`, playbook §3 model tiers + the
  model-delegation-discipline memory) — the loop is substrate-agnostic by design. The Director may mix:
  e.g. pi for a bulk implementation slice, a Claude design-reviewer for the vision lens.
