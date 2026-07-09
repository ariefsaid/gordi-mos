# Review battery — `feat/port-p2-panel-runtime` (ADR-0018 P2: the first live deputy)

**Scope:** `git diff dev...feat/port-p2-panel-runtime` — 75 files, +7865: the `agent-chat` +
`compose-view` Supabase Edge Functions (deputy loop, grounding prompt, 4-tool catalog, single LLM
call site, SSE), `mos.agent_threads/runs/events` persistence + pgTAP, the client runtime adapter +
`AssistantPanel` slide-over + FAB (behind `SHOW_ASSISTANT`, default off), i18n, firewall extension.
Plan: `docs/plans/2026-07-05-port-p2-panel-runtime.md` (+ §11 Director decisions + registry-manifest
build-note).
**Run:** 2026-07-05. Build: quota-killed sonnet (Phases A–C) finished by GLM-5.1 (E–I); Director
completed T18 + T33; reviews opus ×3; fix wave sonnet; Director design render-verify.

### Machine-readable verdicts (parsed by `pre-merge-check.sh`)
- spec: SHIP — MATCHES (opus): all P2 ACs owned at layer (437 targeted tests); grounding clauses present + tested; tool catalog exact (query_entity + create_task/post_update add-line-only + compose_view); compose-view server-side re-validation; deputy invariant (service_role only for auth.getUser); persistence to the landed schema; registry-manifest split; flag-gated. Its 1 minor (AC-CV-004 untagged) FIXED in the wave.
- code-quality: SHIP — fix-then-ship (opus): "edge-function core ship-ready as-is"; bounded deputy loop, consistent error model, RLS+indexes sound, tests are real proofs. All 3 Important (error-banner CTA, followUp/thread-continuity, text-text-primary) FIXED; cheap minors (loadMaxSeq order-limit-1, makeId dedup) FIXED.
- design: SHIP — Director render-verify (SHOW_ASSISTANT on, dev server): top-bar "Open deputy" → 400px "Deputy" slide-over (non-modal complementary landmark); empty state + 3 suggested prompts; input enables Send on type; send echoes user msg → working state with progressive "taking longer" + Stop; Stop aborts cleanly to composable; **text-foreground fix verified** (heading computes `--foreground`, 0 dead `text-text-primary`); phone FAB 76px above the tab bar. Screenshots p2-deputy-desktop.jpeg. Live model conversation = owner-gated (below).
- security: PASS — CLEAR-WITH-HARDENING (opus): **the deputy invariant holds by construction** — service_role at exactly 2 sites, both only auth.getUser; every read/write/tool/persistence call on the caller JWT → RLS is the reach; a model-emitted confirm:true CANNOT bypass the approve/deny gate (structural, model-independent); compose-view re-validates the LLM's spec server-side; the unverified JWT decode gates nothing (RLS on verified claims is the wall); persistence RLS owner+org on every branch with pgTAP cross-org/owner denial proofs; secrets Deno.env-only, unlogged. Medium (transcript cap) FIXED; 2 Low tenancy → spawned chip.

## Evidence
- **Vitest 2107 green** · **pgTAP 391 green** (Files=65, incl. 64_agent_persistence 16 assertions) ·
  typecheck + eslint clean · **both edge functions `deno check` exit 0** — all re-run post-rebase on
  the flake-fixed `dev`.
- Real-proof tests: `grounding.test.ts` drives two live model rounds asserting empty-read grounding;
  `handlerDeputyInvariant.test.ts` is a source-text guard that no handler/actions/persistence path
  touches service_role; `handlerPersistence.test.ts` asserts thread→run→event ordering + journal-in-
  same-insert.

## Owner-gated before any cohort un-gates `SHOW_ASSISTANT` (not merge-blocking; P2 ships flag-OFF)
- **Live model conversation / grounding behavior (AC-P2-GR-003)** — needs `AGENT_MODEL_API_KEY` +
  `_BASE_URL` + `_DEFAULT` (direct Anthropic, `claude-sonnet-5`) as op-managed edge-function secrets
  on staging, then a real conversation to verify grounding (no fabrication), approve/deny chips on a
  real tool call, and compose-view output. The plan designates this Director/live-verify; it is a
  staging activity requiring the owner to set the secret. Local verify covered the panel chrome only
  (edge functions aren't served locally, so a send correctly hangs in the Stop-able working state).
- **DB-side aggregation (T34 → P2.1)** — must land before `SHOW_USER_VIEWS` un-gates (P1 truncation).

## Follow-ups (tracked, non-blocking)
- **Deep thread-history replay (P3):** reopening a persisted thread has no transcript replay (client
  or server) — the server builds model context from client-sent messages, not journal replay. P2's
  fix stopped live-session fragmentation (followUp reuses the run) + capped the transcript; full
  server-side replay from `agent_events` is the notifications-inbox/thread-history scope (P3).
- **Tenancy WITH-CHECK hardening** (spawned chip `task_efd079ff`): business_unit_id same-org guard +
  created_by pinning on tasks/roles/updates — pre-existing, gates multi-org, not deputy-reachable.
- Panel is a **non-modal `complementary` landmark**, not a modal `dialog` — a deliberate choice (you
  reference the deputy while working); noted for owner awareness, not a defect.
- ThreadList shows an always-empty "History" until P3 populates it — owner call whether to hide it
  behind the flag in any shipped P2 cohort.

## Sign-off
- All four lenses green; every Important + the security Medium fixed and re-verified in-battery.
- Suite/gates green post-rebase on flake-fixed `dev`. Remaining before merge: `pre-merge-check.sh` exit 0.
