# Design review — MVP-push slices A–E (4-lens battery)

- **Basis:** design-reviewer (opus; skills `design-review`·`impeccable`·`taste`·`ui-ux-pro-max`) over `dev` @ `f99acc0`.
  Four lenses (Visual · IxD · IA · Product/JTBD) vs `DESIGN.md` + `docs/jtbd.md` v0.3 + `docs/design-mockups/`.
- **Verdict: fix-then-ship.** No AI-slop, no DESIGN.md identity drift — the near-monochrome One-Blue system
  holds throughout. All findings are on surfaces **dark behind flags** (`SHOW_FOLLOWUPS`, `SHOW_PLAN_BUDGET`,
  `SHOW_HOME_STACKED`) → **none block current `dev`**; they are the **pre-rollout UI-polish gate** (flip-on before F cohort).

## ⚠ Render gap (must close before rollout sign-off)
Authenticated states could **not** be rendered: local Supabase port mismatch (`config.toml` → 44321/44322,
running stack on 54321) + unseeded schema/auth → demo-login fails, every authed route redirects to `/login`.
**Only the login page is render-verified** (clean, on-brand, phone-correct). Everything below is **code-read**;
items tagged `[NEEDS RENDER]` need a human render pass against a seeded local stack. Owner judges UI by
look-vs-mockup (`visual-fidelity-bar` memory) — Director owes a real render taste-check pre-rollout.
(Also: review worktrees must branch from `dev`, not a staging release — reviewer had to reset from `669ee0a`.)

## Merge-blockers before rollout (flag-flip)
| # | Finding | Slice | Evidence |
|---|---|---|---|
| **B-1/C-1** | Follow-up row links `/work/follow-ups/${id}` ("Read-only source") but **no `:id` route exists** → 404. The one affordance to verify the underlying invoice before chasing is dead. Add the read-only detail route **or** pull the link. Fails Lens-C one-home invariant. | C | `follow-ups-page.tsx:102`, `router.tsx:91` |
| **D-2** | Home cockpit **AR + AP placeholder slots are dead-end** (label, no drill) — violates anchor A4 (every Home tile declares a drill target). Point AR slot at `/work/follow-ups?filter=overdue` (queue already reads that param, `follow-ups-page.tsx:44`); give AP a drill or explicit "visibility-only" affordance. | E | `money-position-section.tsx` |

## Important (pre-rollout polish)
- **A-1 [NEEDS RENDER]** Follow-up status pill has no dot + no per-state tint — all 5 states render uniform grey; CSS only styles `.is-settled`/`.is-confirmed`. Violates DESIGN.md Tinted-Status Rule on a queue whose whole job is scanning state. Give each state dot+tint via `StatusPill` tokens. `follow-ups-page.tsx:105`, `follow-ups-page.css`
- **A-2** Follow-up action buttons + Submit are bare `<button>`, zero CSS → browser-default grey on the AR signature surface. Use `Button` variants (primary=confirming verb). `follow-ups-page.tsx:109,118`
- **A-3** Cascade `Mine`/`All` are bare unstyled buttons, no active state — user can't see current filter. Use the `seg` segmented control (same as Tasks toolbar). `cascade-page.tsx:182-183`
- **B-2 [NEEDS RENDER]** Loading inconsistency: budget/pricing use `SkeletonRows`; follow-ups + cascade use bare `<p>Loading…</p>`. Route both through `state-kit`. `follow-ups-page.tsx:88`, `cascade-page.tsx:188`
- **B-3** No post-action feedback on follow-up transitions (chase/promise/partial/settle just `load()`) — no toast on a rapid-work queue. Fire success toast + reflect new state/balance. `follow-ups-page.tsx:72,81`
- **C-3 [owner confirm]** Plan destination gates `anyOf:['finance','admin']`, but jtbd assigns the **pricing pre-flight to Marketing/BU-head** (not finance/admin) → they can't reach it as gated. Confirm intended Plan visibility. `destinations.tsx:70-77`
- **D-6 [NEEDS RENDER]** Visibility-direction (anchor A3/§3.6) reads correct in `home-stack.ts` (BU scope shows only its own money slot; member gets no cockpit) but is the exact thing Lens-D must *see* — render per persona (owner-director/BU-head/lead/member).

## Minor
- **A-4** `--border-strong` on budget thead = second divider color, violates Single-Border Rule → `var(--border)`. `budget-page.css:65`
- **A-5** Overline/column-header weight 400 vs DESIGN.md 600 (reads washed). `budget-page.css:37,61,77,102`, `pricing-page.css:24,76`
- **A-6** Cascade leaf rows built from inline hardcoded px (`paddingLeft:48`…) + nested `<table>`-in-`<td>` grouping — off-scale + fragile. Move to the DB-view grid grammar the phone card already uses. `cascade-page.tsx:26-31,172,181`
- **A-7 [NEEDS RENDER]** Budget/pricing inputs hand-rolled `6px 8px` vs the 32px control shell → shorter than the rest of the form system. `budget-page.css`
- **B-5** Budget "Saved scenario." is a quiet inline span, no next-step (wire "→ run pricing pre-flight"). `budget-page.tsx:323`
- **D-7** Follow-up pill prints the raw DB enum, not localized Gordi lifecycle language via `t()` ("confirmed" vs "settled" is load-bearing: chaser settles, Finance confirms). `follow-ups-page.tsx:105`

## Passes (confirmed working — do not regress)
- **Cascade IA** — Objective→Project/Process→Task ladder legible, up/down line-of-sight preserved, Manage-mode capability-gated + reachable only from cascade, task leaves drill to `/tasks/:id`.
- **A5 link-never-copy** — Budget resolves unit cost from the linked ingredient cost line + drills to it; pricing reads linked budgeted COGS, never pasted. `budget-page.tsx:257-264`
- **A6 settle-requires-evidence** — settle Submit `disabled` until evidence + amount + cash-in date present. `follow-ups-page.tsx:99`
- **A7 stale/uncertified COGS** — `FailLoudBadge` + pricing freshness `role="alert"` fire when `!status.fresh`.
- **Login page (RENDER-verified)** — One-Blue primary, near-monochrome, correct radii, on-brand demo block, phone reflow correct.

## Regression-invariant tests to add (lowest sufficient layer)
1. Follow-up `settle` Submit stays disabled with empty evidence (component — anchor A6).
2. Every Home cockpit tile/slot exposes a drill target — no label-only slots (component — anchor A4).
3. `/work/follow-ups/:id` resolves to a real read-only surface, not NotFound (routing — Lens-C one-home).
4. BU-scope Home renders no whole-company money tiles for a non-finance BU-head (component — anchor A3/§3.6).

## Per-surface
| Slice | Verdict |
|---|---|
| A — five-destination nav shell | ship-as-is (pending authed-rail render confirm) |
| B — Work spine (cascade + catalog) | fix-then-ship (A-3, A-6, B-2) |
| C — Follow-ups (AR bridge) | fix-then-ship — **B-1/C-1 is the blocker** |
| D — Plan (budget + pricing) | ship-as-is (A-4/A-5 polish; C-3 owner confirm) |
| E — Home stacked-union | fix-then-ship (D-2 dead-ends); **D-1** cockpit *substance* (AR/AP/ops-KPI still placeholder) tracked as a follow-on slice, not this slice's defect |
