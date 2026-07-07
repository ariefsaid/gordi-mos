# feat/ui-coherence — working ledger + agent handoff (2026-07-07)

Branch `feat/ui-coherence` off `dev` @ `6b36295`. Executes the retrofit plan in
[docs/reviews/ui-coherence-audit-2026-07-07.md](ui-coherence-audit-2026-07-07.md) §F. **NOT merged.**
Review battery + `scripts/pre-merge-check.sh` still owed before any merge (see bottom).

## Owner decisions locked
- **FAB: RESOLVED (owner-agreed).** No floating action button paradigm. Deputy launcher = neutral
  top-bar icon on **every** viewport (desktop + phone). DESIGN.md ruling written (below).
- Delegation: pi CLI — **glm-5.2** = opus-tier (hard rebuilds), **glm-4.7** = sonnet-tier (mechanical).
  Invocation: `pi --provider zai --model glm-4.7 -p --no-session -t read,write,edit,bash,grep,glob "<brief>" < /dev/null`
  ⚠️ pi stdout is sometimes swallowed — **verify by `git status`/reading files, do NOT trust an empty return.**
  glm-5.2 was 429-saturated during this session; pace it, fall to glm-4.7 for templated work.

## DONE (committed on branch)
- `5739c70` — **Select primitive** `mos-app/src/components/ui/select.tsx` (+`Select.css`,`select.test.tsx`,
  10/10 green). Mirrors `text-input.tsx`. Wraps native `<select>` + token chrome (appearance:none,
  chevron, disabled/error parity). **Not yet wired to any call site.** Plus **DESIGN.md** ratifications:
  the `[NEW]` Select spec (in §Inputs/Fields) + the **Deputy-Launcher/No-FAB Rule** (near the
  Orange-Sprinkle Rule; supersedes ADR-0019 D11).
- `0832bd1` — **shell/IA/FAB**: deleted `AssistantFab` (orange float) → `AssistantTopBarButton` now
  renders on all viewports (`top-bar.tsx` dropped the `!isNarrow`); Kitchen **"Log"→"Kitchen Log"**
  (`messages.ts` en `Kitchen Log`/id `Log Dapur`, `sections.tsx`); breadcrumb **self-crumb collapse**
  ("Inbox › Inbox"→"Inbox"). AC-AP-001 narrow assertion migrated to the top-bar launcher tests.
  Shell suite green (186), typecheck+lint clean. Fixes audit **D8/B3/B4, C1, C3**.

## REMAINING (retrofit plan §F, do in this order)
1. **Select swap — the 11 native `<select>`.** ⚠️ NUANCE (verified this session): NOT all are plain.
   - **Safe to swap → `@/components/ui/select`:** `pages/budget-page.tsx`, `pages/pricing-page.tsx`,
     `pages/ops-add-form.tsx`, `pages/ops-page.tsx`, `pages/dev-views-page.tsx`,
     `components/catalog/catalog-manager.tsx`, `components/kitchen/kitchen-toolbar.tsx`,
     `components/kitchen/kitchen-log-table.tsx`.
   - **DO NOT blanket-swap Tasks — judgment required:** `tasks-toolbar.tsx` deliberately wraps a native
     `<select>` as a *transparent overlay inside the DB-view `control` chip* (intentional re-skin, has
     `.chip-select`) — leaving it is correct; swapping regresses the signature toolbar.
     `task-surface.tsx` (`.tc-select`) + `record-details-panel.tsx` (`.rd-inline-select`) are form/inline
     selects — swap only if it doesn't fight their layout; otherwise leave + note.
   - Preserve value/onChange/disabled/aria-label; carry `<option>` children as-is; drop redundant
     field-chrome classes. Then add regression guard test (a) below.
2. **Follow-ups rebuild-to-kit** (money-path, **glm-5.2**). `pages/follow-ups-page.tsx` (+`.css` to delete,
   `.test.tsx`). Move to DataTable (`components/dashboard/data-table.tsx`, has 768px card reflow — fixes
   **B1** phone overflow) + StatusPill (`components/tasks/status-pill.tsx`, retire `follow-ups-pill` **D3**)
   + Button (`components/ui/button.tsx`, retire bare verbs **D6**) + state-kit (`components/ui/state-kit.tsx`
   **D4**). Best UX: move the inline promise/partial/settle forms into the **detail drawer** at
   `/work/follow-ups/:id` (already routed) per audit E8. **PRESERVE behavior:** `?filter=overdue`;
   role gates (`canConfirm`=finance/admin, `canChase`=`canWorkAnyLane` via `lib/follow-up-lanes.ts`);
   transitions chase/promise/partial/settle/confirm via `lib/db/follow-ups.ts`; running_balance recon.
   This is the C money-path → run qa-acceptance after. Already uses PageHead (audit D5 was stale here).
3. **Kitchen retrofit** (rebuild, **glm-5.2**). `components/kitchen/*`. Shared DB-view toolbar + DataTable
   + state-kit; fix the floating Submit-bar collision (**B3**). Owns kitchen files exclusively.
4. **state-kit rollout** (glm-4.7): Kitchen Review/Pushes, Sales, Pricing, Inbox hand-rolled states →
   `state-kit`. **Strip the Sales schema-string leak** ("…from `reporting.sales_daily_revenue`" **D4**).
5. **PageHead standardize** (glm-4.7): bare `<h1>` → full `PageHead` on Sales, Pricing, Budget, Weekly
   Updates, Objectives, Projects (**D5**). (Follow-ups already has it.)
6. **Deputy C2 + C3** (glm-5.2). Spec: [docs/specs/agent-capability-expansion.md](../specs/agent-capability-expansion.md).
   C2 = safe-markdown in AssistantPanel; C3 = typed-widget results. ⚠️ ADR-0045 §1 / ADR-0049 are
   **referenced but NOT written** — re-read the spec, author the ADRs (eng-planner) before build.
   Battery/viewspec registry is already ported; AssistantPanel is plain-text by design (FR-P2-AP-004).

## Deferred (needs design-eyeball, NOT mechanical — own reviewed pass)
Kitchen **rail nesting/parent** (nest the 5 under a "Kitchen" sub-heading — audit C2 residue), 3-level
Kitchen **breadcrumb node** ("Operate › Kitchen › Plan"), **header-tint B5** (Inbox no `secondary/35%`
wash — fold into state-kit rollout), Admin bare-crumb parent.

## Regression guards still to add (audit §Regression-invariant)
(a) no raw `<select>` in `src/pages`/`src/components` (grep/lint guard, excl. the primitive + tests);
(b) every list page imports shared DataTable + state-kit; (c) Follow-ups renders card-list <768px
(RTL, no h-overflow); (d) no `brand-orange` on an interactive element (token guard).

## Before merge-to-main (BINDING gate)
Run the review battery (spec · code-quality · **design 4-lens rendered** since many `*.tsx`/`*.css` changed ·
security if any auth/RLS touched — none so far) and record verdicts in THIS file, then
`bash scripts/pre-merge-check.sh` (exit 0). Render-verify the whole app (owner judges by look-vs-mockup —
[[visual-fidelity-bar]]). Local stack gotchas: `supabase start --ignore-health-check -x studio,imgproxy,
inbucket,edge-runtime,vector,analytics,realtime`; `supabase db reset` reseeds dev personas (pw `Passw0rd!dev`);
clear localStorage on stale-session hangs. DB Postgres :44322 / API :44321 (gordi-mos stack).
