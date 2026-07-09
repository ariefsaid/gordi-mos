# Review battery — `dev` branch → `main` promotion (MVP-push + agent port + dashboard + archetype retrofit)

**Scope:** `git diff main..dev` — **191 commits / ~453 files** since the last promotion (`main` @ `669ee0a`).
This is the full **F rollout**: the five-destination IA nav + work spine (cascade/catalog), AR/follow-up
bridge, Plan v1 (budget/COGS + certified metrics), Home v1 + polish, the agent-native port (P1 substrate /
P2 panel+runtime / P3 replay+notifications+Inbox), the `/dashboard` analytical rebuild, the **B2 page-archetype
retrofit** (W1–W5), plus the lint-gate fix, the tasks-workspace flake root-fix, and the post-retrofit design
audit. Backing schema: **18 migrations** (agent persistence, notifications, comments, push subscriptions,
aggregate-compiled, shared capabilities, cascade→can, follow-ups, plan/COGS read-models, certified-metrics,
budgets, tasks-tenancy-guard, comments-entity-guard, reporting-writer-tighten, capture-budget RPC) with
paired pgTAP suites (`supabase/tests/64–82`).

**Run:** 2026-07-08 (Director-orchestrated). Coverage model for this consolidated promotion:
- **Security** — a **fresh consolidated** OWASP/STRIDE audit of the whole `main..dev` auth/RLS/migration/RPC
  surface was run for this gate (the prior ledger only covered the 2026-07-02 reporting slice). See
  [security-audit-dev-main-2026-07-08.md](security-audit-dev-main-2026-07-08.md).
- **Spec · Code-quality · Design** — each feature merged to `dev` behind its **own** review-battery ledger
  (`docs/reviews/feat-*.md`: port-p1/p2/p3a, work-spine, ia-nav-work-spine, ar-followup-bridge, plan-v1,
  home-v1-margin, home-stacked-union, cascade-catalog, kitchen-log-redesign, ui-coherence,
  ui-coherence-followups, ui-polish-a, …), reinforced by two **MVP-readiness audits**
  (`mvp-readiness-charter-audit-2026-07-06.md`, `mvp-readiness-audit-round2-2026-07-07.md`), the
  **round-2 hardening** pass (`feat-harden-round2.md`), and the **post-retrofit all-routes design audit**
  (`design-audit-post-retrofit-2026-07-08.md` — **0 P0**, retrofit fixes confirmed held; residuals triaged to
  a debt/todo backlog). The B2 retrofit waves (W1–W5) + the lint/flake fixes were each Director-verified
  (typecheck + lint + targeted + full-suite at every reconcile). This ledger **consolidates** that cumulative
  coverage rather than re-running a fresh spec/CQ/design pass over all 191 commits; only the security lens was
  freshly re-run end-to-end for this gate (it was the one whose prior verdict was scope-stale).

## Machine-readable verdicts (parsed by `pre-merge-check.sh`)
- spec: SHIP — cumulative per-feature spec reviews + two MVP-readiness audits; no open Critical spec gap. Each
  feature's ACs were verified at its owning layer (unit / pgTAP / e2e) as it merged to `dev`.
- code-quality: SHIP — cumulative per-feature code-quality reviews + Director verification of the retrofit
  waves; full Vitest suite green; typecheck 0; lint 0 (the `--max-warnings=0` gate is now genuinely enforced).
- design: SHIP — the post-retrofit all-routes vision audit found **0 P0**; the headline retrofit fixes (DUE
  bleeds, phone header reflow, `/ops` phone single-CTA, cascade-as-table, unified view-tabs) confirmed held;
  the 41 residual findings are P1–P3, triaged to a backlog (Bucket A quick-wins + B systemic waves), not
  merge blockers.
- security: PASS — fresh consolidated OWASP/STRIDE audit: **no Critical, no High**. Every new business table
  FORCES RLS with correct per-verb org-scoped policies AND a negative-path pgTAP test; the two tenancy guards
  close the FK/immutability cross-org seams (tests 79/80 assert real 23514/42501 rejections); the DEFINER
  RPCs (`transition_follow_up`, `create_notification`, `capture_budget`) cross-org-guard before write, pin
  `search_path=''`, revoke public/anon EXECUTE; `aggregate_compiled` is INVOKER + injection-safe; no secrets
  in the delta. **pgTAP: 82 files / 570 tests — all PASS.**

## Verification evidence (this run, 2026-07-08)
- `npx vitest run` (mos-app) — full unit/RTL suite green (re-run for this promotion).
- `supabase test db` — **82 files / 570 pgTAP tests, Result: PASS** (all RLS + RPC + guard contracts).
- `security-auditor` (opus, read-only, verified against SQL) — `security: PASS`.
- `bash scripts/pre-merge-check.sh` — required lenses (spec/code-quality/design/security) all cleared.

## Tracked follow-ups (NOT promotion blockers)
- **M1 (Medium)** — `mos.budgets` grants direct INSERT/UPDATE to `authenticated`, bypassing the
  `capture_budget` RPC's COGS-recompute + same-org guard (no budgets guard trigger). Bounded blast radius
  (cogs.write actor, own-org rows). **Close before B2B onboarding** — revoke direct writes → route through the
  RPC, or add a guard trigger.
- **L1** — `capture_budget` "uncertified cost line" fail-loud only detects *missing* lines (no `certified`
  column) — semantic/doc gap.
- **L2** — `reporting_writer` cross-org write residual (A4): land the `app.reporting_org` GUC scope before the
  writer feed goes live on the shared DB; currently mitigated by write-only credential custody.
- **Design backlog** — audit Bucket A (quick-wins: `.ch-title` 24px, dup-CTAs, kitchen no-data KPIs) + Bucket
  B systemic waves (44px tap-targets, one empty-state system, data-provenance pattern) — post-promotion.

## Verdict
**SHIP.** Security freshly gated (PASS, 0 Crit/High; pgTAP 570 green); spec/CQ/design carried by cumulative
per-feature + MVP-readiness + post-retrofit review coverage (0 P0). M1/L1/L2 tracked. Staging deploy
(migrations on the staging DB + CF Pages) is **deferred** to a separate deliberate step per owner decision.
