# Agent context — read me first (owner prefs · hard rules · gotchas · pointers)

Fast cold-start for a fresh agent (esp. post-compaction). This is the human/process layer; the
authoritative product/decision docs are linked at the bottom. Keep this file updated as things change.

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
  gpt-5.4 cross-family reviewers, `docs/pi-delegation.md`); vision/design-review stays Claude/Director.

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

## Gotchas (will bite you)
- **Stale local `main`:** `git worktree add … main` uses your *local* ref, which lags `origin/main` after
  you merge a PR. `git fetch` + rebase the worktree, or it'll miss/clobber recent merges.
- **Multi-agent repo:** subagents only see the current tree; another agent may hold a branch
  (`feat/admin-user-mgmt` does the kitchen data migration). Keep paths disjoint; use worktrees.
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
| **Where everything stands + outstanding** | `docs/platform-workstream-status.md` (canonical handoff) |
| Full task list / backlog | `docs/backlog.md` |
| Locked owner decisions (OD-*) + ADRs | `docs/decisions.md`, `docs/adr/` |
| Domain glossary | `CONTEXT.md` (repo root) |
| Binding charter + per-layer Definition of Done | `docs/product-expectations.md` |
| Director runbook / loop / UI cycle | `docs/director-playbook.md`, `docs/design-workflow.md` |
| **ESB / GOO integration (coords, auth, recipe, gotchas)** | `docs/reference/esb-goo-integration.md` |
| Kitchen module spec (FR/AC) | `docs/specs/kitchen-module.spec.md` |
| Delegation via pi CLI | `docs/pi-delegation.md` |
| Staging env + gotchas | `docs/environments.md` |

## Headline current state (2026-06-26)
- Kitchen Module + access roles + UI-revamp + Strategy→Execution cascade first slice **SHIPPED to main**.
- **ESB outbox worker BUILT + SHIPPED** (extends `gordi-kitchen-app`; PRs #1/#2/#3 + gordi-mos #76/#77).
  GOO transfer round-trip validated live; **deploy + the GKID flip remain owner-gated.**
- **Mid-flight / not merged:** kitchen UI redesign `feat/kitchen-log-redesign` (awaiting owner visual
  sign-off); kitchen data migration LOAD (Teable→`ops`); curated kitchen e2e.
