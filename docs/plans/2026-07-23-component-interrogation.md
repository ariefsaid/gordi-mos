# Component Redesign Work-Order — Interrogation Pass (2026-07-23)

> Source: full-tree component interrogation against V3 grammar, `DESIGN.md`, `PRODUCT.md`, ux-guidelines,
> and impeccable critique/distill. **Scope: the ledger is CLOSED over all 111 scanned components.**
> The consolidation payload was truncated (66 files made the main sections); the remaining **45
> verdicts were recovered verbatim from the workflow journal** and appear in the Appendix at the
> bottom. Every component in `mos-app/src/components/**` has a recorded verdict — "not listed" does
> not exist in this document.

## Counts (main sections — 66 files; the other 45 are in the Appendix)

| Disposition | Count | Meaning |
|---|---:|---|
| **Fossil — delete** | 12 | Dead code (zero live consumers, or only test/regression references). Remove outright. |
| **Fossil — replace** | 5 | Real, load-bearing, live-consumed function — but pre-redesign form. Keep the job, rebuild the component. |
| **Merge into other** | 8 | Real function, single consumer, duplicates a component that already owns this job. Fold in, delete the standalone. |
| **Earns its place** | 41 | Live, non-duplicated, correctly scoped — but 34 still owe a redesign pass (`redesign-proposed`), 6 owe only a `minor-polish` pass, and 1 (`RecordField`) is `highest-quality` as-is. |
| **Total (main sections)** | **66** | Plus 45 recovered entries in the Appendix (43 earns-place, 2 flag-owner) → **111 total, ledger closed**. |

### Earns-its-place, by verdict weight

| designVerdict | Count |
|---|---:|
| redesign-proposed | 34 |
| minor-polish | 6 |
| highest-quality | 1 |

---

## 1. Fossil — Delete (12)

Ordered by blast radius (shared-kit fossils first, then domain clusters). Every entry below has **zero
live product consumers** — only its own test file, or a dead sibling that is itself a fossil.

### `mos-app/src/components/ui/card-head.tsx`
- **Verdict:** minor-polish (on the *deletion*, not the component)
- **Why:** Zero consumers (`<CardHead`/import both return nothing; the only "card-head" grep hit is an unrelated CSS class in `mobile-grouped-cards.tsx`). Its one-in-card-section-header job was never adopted; call sites use inline heads instead.
- **Proposal:** Delete `card-head.tsx` only. **Do not delete `CardHead.css`** — it's load-bearing: it owns the shared state-kit error/empty/skeleton tokens and is imported by `state-kit.tsx` plus 4 other CSS files. Rename it `state-kit.css` (or split the state tokens out) and repoint the 5 imports so the shared state grammar stops living under a dead component's name.

### `mos-app/src/components/ui/chip.tsx`
- **Verdict:** minor-polish
- **Why:** No product consumers — only `primitives.test.tsx` and the dev-only `/dev/ui` gallery. The person/entity-chip job it claims is already served elsewhere (Tag for categorical, inline avatar+name clusters for people).
- **Proposal:** Delete now. If a canonical person-chip is needed later, build it as part of the RecordViewer/CollectionToolbar people grammar, not as a floating primitive.

### `mos-app/src/components/ui/state-pill.tsx`
- **Verdict:** minor-polish
- **Why:** Zero consumers (one stale comment in `pill.tsx`). Renders the Filed/Draft/Not-started state of a weekly `TeamUpdateRow` — "Weekly Update" is retired vocabulary superseded by Signal (OD-REDESIGN-33). Dead code on dead domain vocabulary.
- **Proposal:** Delete. If Signals ever need a filed-state pill, compose `<Pill>` directly at the call site with Signal vocabulary — don't resurrect the weekly-update mapping.

### `mos-app/src/components/tasks/status-trigger.tsx`
- **Verdict:** redesign-proposed (on removal path)
- **Why:** Its only consumer, `task-drawer-header.tsx`, is itself dead (tests/regression only). Status editing now lives on the RecordViewer's `status` RecordField control.
- **Proposal:** Delete. Any future need for an inline status editor outside RecordViewer should reuse the shared status RecordField / overlay-menu primitive, not this hand-rolled outside-click/Escape popover (it doesn't even use the shared `useMenuPopover` that `row-menu.tsx` uses).

### `mos-app/src/components/tasks/task-drawer-header.tsx`
- **Verdict:** redesign-proposed
- **Why:** Zero live consumers. Pre-redesign pinned drawer header (Variant B, ADR-0013 §1.2), fully superseded by `RecordPanelHost` chrome + RecordViewer identity/ownership sections.
- **Proposal:** Delete (and its dead dependency `status-trigger`). It also actively violates current law: relabels **Team = buName**, the exact Business-Unit→Team relabel `task-record-adapter` forbids.

### `mos-app/src/components/tasks/task-ownership-card.tsx`
- **Verdict:** redesign-proposed
- **Why:** Zero live consumers (only a CSS class reference + own test). Pre-redesign bespoke ownership block, superseded by the RecordViewer "Task ownership" section (BU · PIC · Supervisor value-first fields).
- **Proposal:** Delete. Also relabels **Team = teamName** and depends on the weak `PersonPicker` — both replaced by the adapter's honest fields.

### `mos-app/src/components/signals/signal-card.tsx`
- **Verdict:** redesign-proposed
- **Why:** Only non-test importer is `signal-feed.tsx`, which is itself dead. Fat bordered-card grammar explicitly superseded by `signal-feed-rows.tsx` per owner redirect 2026-07-22 ("Signals render as ROWS ... NOT fat cards").
- **Proposal:** Delete — the shipped replacement is `signal-feed-rows.tsx`'s row anatomy. Caveat: `signal-card.css` is still imported by `signal-record.tsx`; migrate the still-referenced classes when `signal-record` is dissolved (see its fossil-replace entry below), then drop the CSS.

### `mos-app/src/components/signals/signal-feed.tsx`
- **Verdict:** redesign-proposed
- **Why:** Zero live consumers (own test + `signal-css-coverage.test.ts` only). Home's ambient tail is now `signal-feed-section.tsx`; the archive Feed is `SignalFeedPresentation` — both render `SignalFeedRows`, not this. Renders the retired `SignalCard`.
- **Proposal:** Delete. Live feed path is `SignalFeedRows` via `signal-feed-presentation` (archive) and `signal-feed-section` (Home).

### `mos-app/src/components/kitchen/qty-cell.tsx`
- **Verdict:** minor-polish (on removal)
- **Why:** Zero live consumers — only its own test. `kitchen-log-page.tsx`'s "Made today" column (the surface this was clearly built for, per its own header comment) unified onto `<WipItemStepper>` for both desktop and phone. Orphaned, still passes its own tests.
- **Proposal:** Delete `qty-cell.tsx` + `.css` + `.test.tsx` outright. Its shape (compact `useInlineCommit`-backed stepper) is worth preserving conceptually — do that by generalizing `plan-qty-cell.tsx` into a shared primitive, not by reviving this orphan.

### `mos-app/src/components/admin/confirm-dialog.tsx`
- **Verdict:** minor-polish
- **Why:** Pure re-export shim from the 2026-07-19 cohesion-debt migration (own header says "moved to the shared primitive"). Only importer is its own test — every real consumer (`admin-users-page.tsx`, `task-drawer.tsx`, `confirm-archive.tsx`, `overlays.stories.tsx`) already imports `ConfirmDialog` directly from `@/components/ui/confirm-dialog`.
- **Proposal:** Delete the shim. Leaving a second dead import path for a component the redesign explicitly consolidated violates the "one control vocabulary" intent.

### `mos-app/src/components/inbox/InboxList.tsx`
- **Verdict:** redesign-proposed (on removal)
- **Why:** Zero live production consumers (own test + stale comments only). `InboxTriage`/`InboxTriageConnected` render the identical row markup PLUS filter chrome, Mark-handled, pending/busy row state, and dual page+quick-triage modes this never had. Someone is still spending upkeep on it (its empty-state was migrated to shared `EmptyState` in the 2026-07-19 pass) despite being unreachable from any real screen.
- **Proposal:** Delete `InboxList.tsx` + `.test.tsx`. Update `inbox-deputy-host.regression.test.ts`'s `INBOX_SEAMS` array to drop the entry (the live `inbox-triage.tsx` entry in the same array already covers the chrome-free guarantee); clean the stale comments in `v3-record-collection.ts` fixtures and `record-collection-conformance.test.ts`.

### `mos-app/src/components/processes/due-runs-trigger.tsx`
- **Verdict:** highest-quality *(sic — the source data records this verdict field as `highest-quality` even though the disposition is fossil-delete; likely a labeling slip in the interrogation pass upstream, flagging for the owner rather than silently correcting it)*
- **Why:** Zero live consumers anywhere except its own test. Its header comment claims it's "rendered inline in the Tasks toolbar," but `tasks-toolbar.tsx` never imports it — it reimplements an equivalent "attention pill" inline instead, per its own comment "F5 design fix, 2026-07-22." The component, its CSS (`.due-runs-trigger`/`.due-runs-chev*`), and its i18n key (`processes.due.summary`) are all dead weight from an unfinished cleanup.
- **Proposal:** Delete `due-runs-trigger.tsx`/`.test.tsx`; prune `.due-runs-trigger`/`.due-runs-chev*` rules from `due-runs.css`; remove the orphaned `processes.due.summary` key from both locale tables in `messages.ts`; confirm `TasksToolbar`'s own attention-pill markup remains the single owner of this job.

---

## 2. Fossil — Replace (5)

Real, load-bearing, live-consumed function — pre-redesign form. Ordered by how central the surface is.

### `mos-app/src/components/admin/user-table.tsx`
- **Verdict:** redesign-proposed
- **Why:** Real function (entire People list: desktop table + mobile-card reflow, search+status filter, per-row actions, empty/no-match states) with a live consumer (`admin-users-page.tsx`) — but pre-dates and duplicates the V3 `RecordCollectionSurface`/`CollectionToolbar` engine that Tasks and Signals already run on. Its own `DesktopTable`/`MobileCardList` reflow duplicates `RecordCollectionSurface` + `useIsDesktop`; its own `PeopleToolbar` duplicates `CollectionToolbar`'s ratified control grammar; its own `PersonActionMenu` portal duplicates the shared `row-menu` pattern.
- **Proposal:** Port People onto `RecordCollectionSurface`: build `people-collection-adapter.tsx` (mirroring `task-collection-adapter.tsx`); replace `PeopleToolbar` with `CollectionToolbar` (All/Active/No-login/Disabled/Archived as a `CollectionToolbarChoice`, search as `CollectionToolbarSearch`); replace the bespoke `PersonActionMenu` with the shared row-menu; wire the engine's `selectionBar` for bulk disable/archive (closes a real gap against ui-ux-pro-max's Bulk Actions guideline — today it's single-row-⋯-menu only, no multi-select, despite offboarding being exactly the batch case). Retires the one-off `menu-position.ts` and `people-toolbar.css`.

### `mos-app/src/components/follow-ups/follow-up-queue-table.tsx`
- **Verdict:** redesign-proposed
- **Why:** The one table+lifecycle-action+detail renderer for every Follow-up door (2 live consumers: `follow-ups-page.tsx`, `follow-up-queue-embed.tsx`). Earns to keep existing; does not earn to keep existing in this exact form.
- **Proposal — 5 concrete defects, one redesign:**
  1. The counterparty "open record" button (`.follow-up-queue-table__open-record`) has **zero matching CSS anywhere in the repo** — renders as an unstyled native button in an otherwise fully-tokenized surface. Style as a real link-button on the shared control vocabulary.
  2. The table isn't wired to the shared RecordCollection engine — Follow-ups is the *only* workspace-scale collection hand-rolling its own state, so it has no search/filter/sort/selection/saved-views. `useFollowUpQueue` already computes `overdueCount` from a URL param but `FollowUpsPage` renders it as an inert `<span>` with no toggle — the filter mechanism exists and is undiscoverable. Add a real clickable overdue filter (mirroring Tasks' `onOverdueFilter`) and wire columns through `DataTable`'s existing `sortable`/`onSort`.
  3. Up to 4 always-visible outline action buttons per row (chase/promise/partial/settle) will wrap at the mandated 52px row height — matches the ui-ux-pro-max Bulk Actions anti-pattern. Collapse to one primary action + an overflow trigger (mirroring `row-menu.tsx`'s ⋯ pattern).
  4. The inline "Follow-up detail" transition form is authored in raw `style={{}}` (every sibling record-panel ships its own `.css`), and gives **zero** Saving/Saved/error/retry feedback — `submit()` has no try/catch, so a failed money-lifecycle mutation (settling a debt) becomes a silent unhandled rejection. Direct violation of `DESIGN.md`'s Direct-editing-and-feedback contract. Rebuild with visible saving/error/retry state.
  5. The counterparty cell forks between an overlay-panel button (money door) and a bare `<Link>` (Work-Tasks embed door) for the identical action — violates `DESIGN.md`'s Overlay grammar (one consistent opening contract across collections).

### `mos-app/src/components/signals/signal-record.tsx`
- **Verdict:** redesign-proposed
- **Why:** Pre-redesign presentational blob that P1-3 hollowed out — identity/Facts/body/Acknowledge already moved to RecordViewer, leaving this mounted as a nested "workflow" content slot inside `signal-record-host` (its only consumer). Still carries real function (mentions, shield line, category correction, linked-work actions, comment thread) — hence replace, not delete. But its revision-history disclosure and "who's acknowledged" roster duplicate data the RecordViewer Activity timeline already shows (confirmed authored in `wrapSignalRecord.activity`).
- **Proposal:** Dissolve into first-class RecordViewer slots: mentions + shield line → identity/participants slot; linked-work → RecordViewer relations; comments → shared comment/activity slot; category correction → keep the shared picker as a Facts-adjacent affordance. **Delete** the revision disclosure and ack roster (both duplicate Activity — redundancy law). Result: no nested legacy content slot, one anatomy shared with Task's record.

### `mos-app/src/components/tasks/row-menu.tsx`
- **Verdict:** redesign-proposed
- **Why:** Live and correctly plumbed on the shared `useMenuPopover` — but the menu carries exactly ONE item, "Open," which duplicates the row's own click AND the name-chip link to the same route. A ⋯ column that delivers nothing beyond the row click.
- **Proposal:** A one-item overflow mirroring the row's primary action fails the earns-its-place test. Either remove the ⋯ column until it carries a genuine second action, or populate it with real per-row quick actions (Archive · Change status · Reassign PIC). Do not keep a menu whose sole item repeats the row click.

### `mos-app/src/components/plan/fail-loud-badge.tsx`
- **Verdict:** redesign-proposed
- **Why:** The only component in `components/plan/`. Two live, non-trivial consumers (`pricing-page.tsx`, `budget-page.tsx`), carries real business logic (ADR-0022 D6 / anchor A7 fail-loud freshness+certification gate via `assessCostStatus()`). Not a fossil — but reimplements a status-pill shell the codebase already has twice over in ratified form (`status-pill.tsx`, `dq-badge.tsx`).
- **Why (grammar, 3 violations):** (1) **A11y/AA-contrast bug** — `.fail-loud--warn`/`--ok` set `color: var(--destructive)`/`var(--success)` directly on a ~10% tint background; every other tinted-status usage in the app uses the AA-darkened tokens (`--status-lost-text`/`--status-won-text`) instead. Sole outlier in the codebase (verified by grep). (2) Hardcoded `font-size: 12px` (no type-scale token) and reaches past the semantic alias layer to the raw `--ds-border-radius-pill` token — the only file in the repo that does this. (3) A third, independently-authored status-pill implementation with its own 7px dot (matching neither the 6px Tinted-Status Rule nor the 8px task-chip exception).
- **Proposal — rebuild as `CostBasisStatusChip`:**
  - **Variants:** `fresh` (success@14%, `--status-won-text`, 6px success dot) · `stale` (warning@18%, `--warning-foreground`, 6px warning dot — a caveat, not a hard error, matching DQBadge's "partial" precedent) · `uncertified`/missing-cost-line (destructive@10%, `--status-lost-text`, 6px destructive dot — the true blocking case).
  - **Size:** 20px height (match DQBadge), 0 8px padding, 12px/600 type, `--radius-pill` via the semantic alias.
  - **Anatomy:** `[6px dot] [label]`, dot `aria-hidden`, label is the sole accessible name; `role=status`/`aria-live=polite` preserved.
  - **IxD change:** each consumer today re-derives its own second warning paragraph from `status.reasons` — the chip should own the full explanation (reasons render as adjacent inline text on non-fresh states) and the page-level duplicate paragraph gets deleted.
  - **Distill check:** does "stale" deserve the same destructive-red as "uncertified"? No — DQBadge's "partial" precedent says a caveat is warning-amber, not destructive-red; treating every non-fresh state as red today overstates severity and trains users to ignore the color.

---

## 3. Merge Into Other (8)

Real function, single consumer, duplicates a component that already owns the job. Grouped by cluster.

### `mos-app/src/components/tasks/confirm-archive.tsx`
- **Verdict:** minor-polish
- **Why:** A 15-line label-preset over the shared `ConfirmDialog`, consumed only by `task-surface`. `task-drawer` inlines `ConfirmDialog` directly for the identical unsaved-changes pattern — an inconsistent one-off wrapper, not a shared abstraction.
- **Proposal:** Inline the shared `ConfirmDialog` at the `task-surface` archive call site (matching `task-drawer`'s own usage) so there is ONE dialog pattern, not a per-dialog wrapper.

### `mos-app/src/components/dashboard/basis-chip.tsx`
- **Verdict:** redesign-proposed
- **Why:** Single consumer (`kpi-tile.tsx`). Duplicates `components/ui/pill.tsx` — documented as "the ONE status/state/source/progress pill primitive." `BasisChip` = `<Pill tone="neutral" dot={false}>` with bespoke geometry (20px height / raw 999px radius vs Pill's 22px / `--radius-sm`).
- **Proposal:** Delete `basis-chip.tsx`/`.css`. Render `<Pill tone="neutral" dot={false}>{basis.label}</Pill>` in `kpi-tile.tsx`. If the KPI foot-row genuinely needs a shorter chip, add `size?: 'sm' | 'default'` to `Pill` (sm = 20px/6px dot/`--radius-pill`) rather than keep a second component whose only job is "Pill, but shorter."

### `mos-app/src/components/dashboard/dq-badge.tsx`
- **Verdict:** redesign-proposed
- **Why:** Single consumer (`kpi-tile.tsx`). Its `--partial`/`--good` background+color formulas are **byte-identical** to `Pill.css`'s `.pill--warning`/`.pill--success` — a verbatim second copy of tones Pill already owns, with a different bespoke height/radius.
- **Proposal:** Delete `dq-badge.tsx`/`.css`. `const DQ_TONE = { good: 'success', partial: 'warning', unknown: 'neutral' }`; render `<Pill tone={DQ_TONE[dq]}>{LABEL[dq]}</Pill>` directly in `kpi-tile.tsx` (Pill's default `dot=true` already matches DQBadge's "always a leading dot" requirement).

### `mos-app/src/components/dashboard/cut-toggle.tsx`
- **Verdict:** redesign-proposed
- **Why:** Single consumer (`global-toolbar.tsx`). Hand-rolls a full roving-tabindex tablist (Arrow/Home/End) byte-for-byte duplicated in `window-selector.tsx`; CSS is line-for-line identical to `window-selector.css`'s seg block. This is exactly the fork `components/ui/view-tabs.tsx`'s documented-but-unused `mode="radiogroup"` variant was built to end.
- **Proposal:** Finish wiring `ViewTabs`' `radiogroup` mode with a pill-track visual variant (reusing the existing `.cut-toggle`/`.window-selector-seg` CSS) so both become `<ViewTabs mode="radiogroup" variant="seg" .../>` call sites. Delete `cut-toggle.tsx`/`.css`.

### `mos-app/src/components/dashboard/window-selector.tsx`
- **Verdict:** redesign-proposed
- **Why:** Same duplication as `cut-toggle.tsx` — its preset-seg row duplicates CutToggle's tablist wholesale, and its `handleKeyDown` is a *third* verbatim copy of the identical Arrow/Home/End logic. Single consumer (`global-toolbar.tsx`).
- **Proposal:** Once `ViewTabs`' radiogroup+seg variant lands (see `cut-toggle.tsx`), becomes `<ViewTabs mode="radiogroup" variant="seg" tabs={[...]}/>` plus a small `CustomDateRange` component carrying only the genuinely distinct bounded date-pair chip. Delete `.window-selector-seg`/`.window-selector-tab` and the local `handleKeyDown`.

### `mos-app/src/components/kitchen/action-type-seg.tsx`
- **Verdict:** redesign-proposed
- **Why:** Live consumers (`kitchen-log-page.tsx`, `kitchen-plan-page.tsx` via `KitchenToolbar`'s `children` slot). Re-implements the identical role=tablist segmented-control grammar `view-tabs.tsx`'s `mode="radiogroup"` variant was built and ratified specifically to absorb, in a bespoke `.kseg-*` CSS namespace.
- **Proposal:** Delete `action-type-seg.tsx`/`.css`. Replace both call sites with `<ViewTabs mode="radiogroup" tabs={[...]} active={value} onChange={onChange} ariaLabel="Action type" />`. If ViewTabs lacks the phone short-label truncation ActionTypeSeg has, add it once to ViewTabs rather than forking a second control.

### `mos-app/src/components/kitchen/kitchen-kpi-strip.tsx`
- **Verdict:** redesign-proposed
- **Why:** Live consumer across 4 kitchen pages. Its inline `KpiTile` render function re-implements `DESIGN.md`'s ratified "KPI Tile (signature)" anatomy as a second, thinner copy of the already-shared `KPITile` at `components/dashboard/kpi-tile.tsx` (whose own header literally names itself the general signature primitive). Kitchen's local tile drops the icon tile, the `help` affordance, `onClick`/`selected` filter-in-place, basis/dq chips, and the shared loading skeleton.
- **Proposal:** Keep `KitchenKpiStrip` as the kitchen-specific data-shaping layer (`buildLogKpiStripData` etc.) but have `DesktopStrip` render the shared `<KPITile>` per tile instead of local `.kks-tile` markup; delete the tile-shell rules from `kitchen-kpi-strip.css`. Straight win: kitchen tiles gain icon-tile treatment, help tooltips, consistent loading skeleton for free. Verify the phone summary (`kks-phone`) against `dashboard-page`'s phone treatment before keeping it as a third bespoke variant.

### `mos-app/src/components/kitchen/kitchen-toolbar.tsx`
- **Verdict:** redesign-proposed
- **Why:** Live consumer across 3 kitchen pages. Duplicates the job of `record-collection/collection-toolbar.tsx` (CollectionToolbar), which already owns search + typed filter + trailing-content grammar for every other V3 collection. Kitchen is the one module still on a hand-rolled `{search, categories?, onCategoryChange?, children?}` shape and a page-local `LoadState` union.
- **Proposal:** Port kitchen collection pages onto `RecordCollectionSurface` + `CollectionToolbar` the way `tasks-workspace.tsx`/`objectives-page.tsx`/`signals-archive-page.tsx` already do: category → `CollectionToolbarFilter`, search → `CollectionToolbarSearch`, `ActionTypeSeg` trailing control → CollectionToolbar's trailing-content seam (extend it once with a generic trailing slot if missing rather than solving this per-domain). Gives kitchen saved-views for free (it has none today). Delete `kitchen-toolbar.tsx`/`.css` once ported.

---

## 4. Earns Its Place — owes a design pass (41)

Live, non-duplicated, correctly scoped. Ordered core-shared-first: shared kit primitives → the
RecordCollection/RecordField engine itself → domain clusters.

### `components/ui/` — shared kit primitives

**`mos-app/src/components/ui/icon-button.tsx`** — redesign-proposed
- *Why:* Thin but real (1 product consumer + gallery). Icon-only 24px affordance Button doesn't offer, with required `ariaLabel` (WCAG 4.1.2).
- *Proposal:* `IconButton { variant: secondary|tertiary|primary, accent: default|danger, size: medium|small }` is a **second button vocabulary** next to `Button {primary|outline|ghost|destructive}` — same concept, two names (tertiary vs ghost, secondary vs outline, danger vs destructive). Unify: fold icon-only into `Button` as `iconOnly size="icon"|"icon-sm"`, OR at minimum rename IconButton's variants to Button's set and drop the `accent` axis. One control vocabulary is a stated V3 law.

**`mos-app/src/components/ui/text-input.tsx`** — redesign-proposed
- *Why:* 9 real consumers. The one text field shell — but its own header says "No help-text slot (add a sibling element if needed)," so every form re-implements its own helper/error line and `DESIGN.md §5`'s ratified field-error pair is applied inconsistently.
- *Proposal:* `TextInput { label?, Icon?, error?, fullWidth?, helperText?, errorText? }` — add `helperText`/`errorText` slots rendering the token-correct line, wire `aria-describedby`/`aria-invalid` automatically. Forms-guideline gap, not cosmetic.

**`mos-app/src/components/ui/confirm-dialog.tsx`** — minor-polish
- *Why:* The one centered-confirm primitive; composes ModalShell correctly.
- *Proposal:* Renders raw `<button className="btn btn-outline">` instead of `<Button>` (a stale comment claims it needs a manual ref for auto-focus, but no ref is actually attached — ModalShell already auto-focuses Cancel). Switch to `<Button>`; delete the stale comment. Once `Button` gains a `loading` prop, drop the manual busy-label swap too.

**`mos-app/src/components/ui/data-provenance-note.tsx`** — minor-polish
- *Why:* 3 real consumers (kitchen stock/log/plan pages). The "as of &lt;ts&gt;" / "No snapshot yet · next sync" provenance line, answering PRODUCT's "what number is trustworthy?"
- *Proposal:* Fine as a text primitive. Two fixes: (1) the "No snapshot yet" default hardcodes a `'03:30 WIB'` fallback — make `nextSyncLabel` required so no caller silently ships a wrong sync time. (2) A `ui/` primitive imports `@/components/dashboard/freshness-label.css` — cross-module CSS coupling; move those styles into a ui-owned stylesheet.

### `components/record-collection/` + `components/records/` — the collection/record engine itself

**`mos-app/src/components/record-collection/record-collection.tsx`** (`RecordCollectionSurface`) — minor-polish
- *Why:* 5 live consumers (tasks-workspace, catalog-collection-adapter, objectives-page, projects-processes-page, signals-archive-page). The spine component — owns state order, result-header, selection bar, read-only notice, delegates the 6 states to state-kit.
- *Proposal:* (1) Collapse the 5-branch early-return ladder (loading/error/empty/filtered-empty/ready) — each repeats the identical framing shell, only the inner body differs; a maintenance fossil where one state can silently drift from its siblings. Move to ONE framed shell + a state-switched body. (2) The projection-null fallback renders a bare `LoadingShell` with **no controls/header** — a hidden 7th state that drops chrome every other state keeps. Route it through the same framed loading branch.

**`mos-app/src/components/record-collection/collection-toolbar.tsx`** (`CollectionToolbar`) — minor-polish
- *Why:* 5 live consumers. The named "one visible RecordCollection control grammar" — view axis, presentation switch, search, "View & filters" disclosure, saved-view chips, Save-view form. Structurally sound (recent OD-84.1 lean+disclosure rework).
- *Proposal:* (1) Row 1 mixes two semantically different axes (presets vs user saved-views) under one label "Saved view" — presets are **not** saved views. Give the strip a truthful group label or split into "Views | + saved." (2) The collapsed-trigger active-dot only inspects `filters`, not group/sort/`toggles` — a domain passing a non-default group/sort via `toggles` hides active view-shaping state with no dot. Extend the dot predicate to cover every disclosed control.

**`.claude/worktrees/v3-redesign/mos-app/src/components/records/record-field.tsx`** (`RecordField`) — **highest-quality**
- *Why:* The ONE value-first field primitive of the record-document grammar; consumed by `record-viewer.tsx` and re-exported through the Task/Signal adapters. No redesign owed — value-first render, quiet pencil affordance, text-like commit on Enter/blur with capture-phase Escape-cancel, saving/saved/error feedback with `aria-busy`/`role=status`/`role=alert`, preserved draft + Retry, `commitsFrozen` guard. Best-in-class against every relevant UX-db rule.
- *Proposal:* Two token-fidelity fixes only: (1) controls use `var(--radius-md, 8px)` but `--radius-md` is actually the 10px mid-nesting token — `DESIGN.md`'s control radius is `--radius-sm` (8px); name it that. (2) `record-viewer.css` declares local `--rec-kv-label-size`/`--rec-kv-value-size` that duplicate the existing `--font-size-label`/`--font-size-control` tokens — alias instead of duplicating.

### `tasks/` cluster

**`tasks-table-body.tsx`** — redesign-proposed. *Why:* live desktop table + mobile dispatch, consumed by `task-collection-presentation`. `RecordCollectionSurface` now owns loading/error/empty/filtered-empty exactly once, and this presentation always receives `loading={false} error={null}` — so ~60 lines of this file's own state-kit-duplicating branches are dead. *Proposal:* strip them; component becomes purely the sortable virtualized table + mobile dispatch.

**`mobile-grouped-cards.tsx`** — redesign-proposed. *Why:* phone presentation, real function (grouped cards + occurrence rollup). *Proposal:* the card shows a 7-pair `<dl>` including Project/Process AND Objective AND a derived Source — repeating the same information three times, the exact redundancy the record adapter itself guards against. Desktop was deliberately pruned to decision columns (Task·Status·PIC·Supervisor·Due); the phone card should carry that same set plus at most one context line.

**`person-picker.tsx`** — redesign-proposed. *Why:* live in `pending-resolution.tsx` and `CommentThread.tsx`. *Proposal:* bare `role=listbox`, no search/type-ahead, no arrow-key roving, no no-results state — exactly the gaps the UX database flags for a person selector. Redesign as a proper combobox (filter-as-you-type, arrow roving, empty-with-suggestion) and **share it** across every person picker (comment @-mention, pending-resolution, the record's person RecordField).

**`task-collection-presentation.tsx`** — minor-polish. *Why:* the typed presentation the descriptor renders inside `RecordCollectionSurface`. *Proposal:* the followups branch hand-rolls `.empty-state empty-state--quiet` markup instead of the shared `EmptyState` — a second empty-state vocabulary. Route through state-kit.

**`activity-card.tsx`** — minor-polish. *Why:* renders task event history inside the feed. *Proposal:* wraps content in `<section className="card">` nested inside the RecordViewer document — card-in-card, against distill's "record is one calm document, never nest cards." Drop the card frame; use spacing/hairlines.

**`checklist-card.tsx`** — minor-polish. *Why:* editable checklist pane (add/toggle/reorder/delete). *Proposal:* reorder uses raw ▲▼× text glyphs as buttons (taste rule: no glyph-as-icon, SVG only). Replace with the shared icon set; consider drag-reorder. Also drop the nested `.card` frame.

**`CommentThread.tsx`** — minor-polish. *Why:* genuinely shared — consumed by both task record-feed and `signal-record.tsx`. *Proposal:* comments show author + body only, no avatar, no timestamp (though `created_at` exists on the type) — add relative time + avatar for parity with ActivityCard. Inherits person-picker's weak listbox for @-mention. Drop the nested `.card` frame.

### `signals/` cluster

**`signal-category-picker.tsx`** — redesign-proposed. *Why:* the shared 8-family category affordance (D28), consumed by `signal-feed-rows.tsx` and `signal-record.tsx` — real dedup value. *Proposal:* bespoke absolutely-positioned listbox-of-buttons with no keyboard model (no ↑/↓ roving, no Enter/Escape, no click-away, `aria-selected` on the wrong element). Rebuild on the shared menu/Select primitive with full combobox aria. Keep the 8 flat options and never-blocks-capture semantics.

**`signal-mention-picker.tsx`** — redesign-proposed. *Why:* grouped @-mention popover (Person/Team/BU with type badges, disabled-but-visible @BU when unauthorized), consumed by `signal-composer`. *Proposal:* a typeahead the user cannot drive by keyboard — no active-option roving, no Enter-to-select, no Escape, `aria-selected` hardcoded false. Rebuild as a real combobox (`aria-activedescendant` on the composer textarea, roving highlight, Enter/Escape) routed through the shared overlay/menu host. Preserve the group+type-badge IA and disabled-@BU affordance.

**`signal-composer.tsx`** — minor-polish. *Why:* the capture-minimal 4-field composer, live in 4 surfaces. *Proposal:* raw `<textarea>`/`<input type=datetime-local>` bypass the shared Input/Field controls; errors render as a bare `<p role=alert>` instead of the tokenized field-error grammar; validation is submit-only where the guideline is validate-on-blur. Give the embedded mention popover the same combobox-aria fix as `signal-mention-picker`.

**`signal-feed-rows.tsx`** — minor-polish. *Why:* THE single Signal row anatomy, owner-blessed, shared by Home tail and archive Feed. *Proposal:* (1) the in-feed "Share a Signal" row on the archive variant competes with CollectionToolbar's create affordance — pick ONE owner of compose so `/work/signals` doesn't show two entry points. (2) the empty state renders title-only; fold the share affordance in as its CTA.

**`signal-record-adapter.tsx`** — minor-polish. *Why:* `wrapSignalRecord` is the sole live projection of a Signal into RecordViewer, genuinely load-bearing. *Proposal:* the file also exports `createSignalRecordAdapter` (a large block) with **zero live callers** — delete it and its private context/options. Then resolve the authored duplication it participates in: `wrapSignalRecord.activity` feeds revisions+acks into the Activity timeline while `signal-record.tsx` re-renders the same data — one home per the redundancy law (tracked in `signal-record.tsx`'s fossil-replace entry above).

### `admin/` cluster (people & access management)

**`create-person-dialog.tsx`** — redesign-proposed. *Why:* live, real, non-duplicated (creates a directory entry + optional login handoff to PasswordReveal). *Proposal:* (1) one modal surfaces 4 simultaneous decisions (name/email, 5 role checkboxes, login toggle, submit) — a "wall of options" for a first-time admin. Default to zero roles selected and move role assignment out of the create flow (RoleEditor already exists for that job, opened right after create). (2) the bordered role-checkbox-list fieldset here is pixel-for-pixel duplicated in `role-editor.tsx` (~55 lines each) — extract one `RoleCheckboxList` component both compose.

**`role-editor.tsx`** — redesign-proposed. *Why:* live, owns unique guard logic (self-assign block on admin/finance, last-active-admin block) found nowhere else. *Proposal:* same role-checkbox-list duplication flagged above — extract the shared component. Separately: the inline form-level error hand-rolls its own destructive/10%-color-mix box instead of the shared `ErrorState` primitive that `create-person-dialog.tsx`, in the same folder, correctly uses for the identical case — two renderings of one state-kit concept inside one feature.

**`toast.tsx`** — redesign-proposed. *Why:* the sole toast implementation in the entire app (grep confirms no other notification component exists), correctly built (`aria-live=polite`, `role=status`, ~4s auto-dismiss matching the ux-guideline exactly).
- *Proposal:* Promote to `components/ui/toast.tsx` + `use-toast.ts` — the identical move already made for ConfirmDialog in the 2026-07-19 pass. It's the only notification pattern in the app but lives outside the `ui/` vocabulary. While promoting, deliberately decide the "last toast wins, no queue" behavior (a second `showToast` silently drops an in-flight message) — fine for the single-actor admin page today, not necessarily once other pages share the instance.

### `kitchen/` cluster

**`plan-qty-stepper.tsx`** — redesign-proposed. *Why:* sole live consumer `kitchen-plan-page.tsx` (phone branch); the plan editor's only touch-sized qty control. *Proposal:* it hand-rolls `useState`/`useEffect` and wires ± buttons + onBlur directly to `onSave` with **no `onKeyDown` at all** — so Escape-to-discard (mandatory per the I5 inline-edit contract this file's own header cites) doesn't exist on phone, and every blur fires `onSave` even when unchanged. Rebuild on the same `useInlineCommit` hook its desktop sibling `plan-qty-cell.tsx` already uses.

**`wip-item-stepper.tsx`** — redesign-proposed. *Why:* sole live consumer `kitchen-log-page.tsx`, load-bearing on both desktop and phone renders — carries the plan/stok/tersedia context line, transfer-cap cue, and mandatory variance-note gate (FR-022/023). *Proposal:* split it the way the Plan editor already correctly splits `PlanQtyCell`/`PlanQtyStepper` — a new slim desktop cell (generalized from `plan-qty-cell.tsx`, routed through `useInlineCommit`) for the DataTable column, keep the current `.kls-card` treatment strictly as the phone card. Today one card shape is forced into a 52px dense desktop table row ("the table is one card" contract + "never nest cards inside cards"). Its qty `<input>` also has zero draft/commit handling — the one stepper in kitchen not routed through `useInlineCommit`, no Escape-to-discard/Enter-to-commit/no-op guard.

### `dashboard/` cluster (Money page analytical primitives)

**`chart-frame.tsx`** — redesign-proposed. *Why:* 3 live consumers outside its own dir (AssistantWidgetSlot, viewspec renderer, dashboard-page); a11y table-fallback contract is mandatory (NFR-accessibility). *Proposal:* replace the bespoke `.chart-frame-skeleton` blank box with `<LoadingShell>` and the bespoke `.chart-frame-error` block with `<ErrorState onRetry>` from state-kit (`kpi-tile.tsx` already migrated). **Correctness, not cosmetic:** its error div carries no `role="alert"` (unlike its sibling `data-table.tsx`'s error, which gets this right), and its loading branch is silently `aria-hidden` with no `role=status`/`aria-busy` at all.

**`data-table.tsx`** — redesign-proposed. *Why:* widest reuse in the directory (7+ consumers across sales, signals, follow-ups, assistant, viewspec renderer, 5 kitchen pages, dashboard-page). *Proposal:* its local `SkeletonRows` function name-collides with state-kit's own exported `SkeletonRows` and renders plain grey blocks with no `role=status`/`aria-busy`. Swap for state-kit's `LoadingShell`/`SkeletonRows`. Its `.dt-error` block *does* correctly carry `role="alert"` (unlike `chart-frame.tsx`'s copy) — proof the two siblings drifted to two *different* ad hoc subsets of the one canonical contract, which is the actual bug to fix by unifying both on state-kit.

**`whats-coming-strip.tsx`** — redesign-proposed. *Why:* single consumer (dashboard-page) but the one place in the codebase that explicitly refuses to fake a number for Opex/Material-usage/Labor%/Roastery-yield ("NEVER a faked number") — a real honesty guardrail enacting PRODUCT.md's anti-slop ban. *Proposal:* the `STUBS` array (4 hardcoded label/note pairs) lives inside the component instead of as a `stubs` prop, so the honest-stub pattern is only reachable by copy-pasting the whole file. Lift to a prop-driven Card variant (dashed-glyph stub) so the next not-yet-backed metric reuses it instead of forking.

### `inbox/` cluster
*(NOTE: on `feat/redesign-buildout` this directory contains only the fossil `InboxList.tsx`; the live V3 Inbox implementation exists in the sibling worktree `.claude/worktrees/v3-sweep-inbox`, branch `v3/sweep-inbox`. Paths below are repo-relative within that worktree.)*

**`inbox-triage.tsx`** — redesign-proposed. *Why:* sole chrome-free triage content surface for both live doors (page route + bell overlay) — one component, two nav contexts, the correct shape (avoids the InboxList-style fork). *Proposal:* hand-rolls its own filter chips + bare `<ul>` list instead of `CollectionToolbar` + `RecordCollectionSurface` (every sibling collection uses these). Its 4px filter-chip gap also fails ui-ux-pro-max's 8px Touch Spacing floor between adjacent 44px targets. Adopt the shared toolbar/state-shell; source `font-size` from `var(--font-size-control)` not raw 13px; move filter state into the URL-synced collection-query seam so refresh doesn't silently reset to All.

**`inbox-triage-connected.tsx`** — redesign-proposed. *Why:* the one live wiring layer both doors depend on ("used by BOTH doors so page and bell open records identically" — the direct antidote to the InboxList fork that already happened once). *Proposal:* once `InboxTriage` adopts the shared engine, route this component's local filter `useState` through the same URL-query pattern Tasks/Signals use instead of local state (today, reloading `/inbox` while filtered to Unread silently drops back to All — no other V3 collection loses view state on refresh).

**`inbox-record-door.tsx`** — redesign-proposed. *Why:* the sole content InboxTriageConnected opens inside the shared overlay host — fail-closed target resolver, single canonical-route authority, capability-gated. *Proposal:* severity (info/warning/critical) is communicated **only by dot hue** — a real color-only-signaling gap for colorblind viewers, not polish. Add a severity icon+text chip using the existing AA-darkened status tokens, plus a right-aligned relative timestamp (currently absent entirely) and a quiet hairline separating "why it's here" from the host's action-bar chrome.

### `follow-ups/` cluster

**`follow-up-queue-embed.tsx`** — redesign-proposed. *Why:* a 4-line composition with zero duplicated logic of its own, but reached by **two structurally different hijack points** — `task-collection-presentation.tsx`'s `runtime.followups` branch (fires whenever the Task collection resolves to `ready`, i.e. almost always in production) and `tasks-workspace.tsx`'s `empty.create` ternary (fires only when the org has zero tasks). Only the second path has a dedicated test. *Proposal:* register Follow-ups as its own presentation on the shared RecordCollection engine (a `followUpCollectionDescriptor`, mirroring `taskCollectionDescriptor`) instead of piggybacking on the Task collection's `query.view==='followups'` magic string — the literal "second query grammar" `DESIGN.md`'s RecordCollection contract forbids. Lets you delete both existing hijack points in favor of one registration.

**`use-follow-up-queue.ts`** — redesign-proposed. *Why:* the single canonical data/behavior hook behind every Follow-up door, genuinely extracted (own header: "so the record has ONE canonical behavior implementation"). *Proposal:* (1) `run`/`submit` have no try/catch around `transitionFollowUp` — a failed money-lifecycle mutation becomes silent, `error`/`state` never update for this path. (2) the hook parses an `overdue` URL filter but exposes no setter — genuinely dead branch or missing control, pick one. (3) no `submitting`/in-flight flag returned, so the table can't disable the button mid-transition — a real double-post risk on a money action, not cosmetic.

### `processes/` cluster

**`due-runs-list.tsx`** — redesign-proposed. *Why:* live in `tasks-workspace.tsx`; the only surface where a capable viewer can see and start a due recurring-process occurrence. *Proposal:* (1) `useDueRuns()` exposes a `loading`/`error`/`ready` state this component never consumes — expanding before fetch resolves silently returns `null` instead of a skeleton. Add `loading` prop, render `SkeletonRows`. (2) each row renders `variant="primary"` — N due rows means N competing blue CTAs; switch to `variant="outline"`, matching row-action styling elsewhere. (3) CSS uses raw px font-sizes including an off-scale `15px` matching no token at all — replace with `var(--font-size-body)`/`var(--font-size-label)`.

**`pending-resolution.tsx`** — redesign-proposed. *Why:* two independent live consumers (`occurrence-assign-dialog.tsx`, `cafe-opening-panel.tsx`), both explicitly citing it as "the one resolution surface" (Rule 11 — never a second resolution UI). *Proposal:* within this one component, the two internal branches present the identical "choose a person" job in two different idioms — `reason==='multiple'` renders bare `.btn.btn-outline` pills, `reason==='none'` delegates to `PersonPicker` (avatar-initials rows). Collapse the `multiple` branch onto `PersonPicker` via an optional `onlyIds?: string[]` allow-list so both paths render identically. Also swap the remaining raw `.btn.btn-outline` usage for the `<Button>` component (its sibling `due-runs-list.tsx` already does).

### `catalog/` cluster

**`catalog-manager.tsx`** — redesign-proposed. *Why:* `DESIGN.md` names it verbatim as the reference body-component for the "Catalog-Manage" archetype; 2 live routes (objectives-page, projects-processes-page) are both listed DESIGN.md exemplars; full AC-tagged test coverage. Not a fossil — the canonical implementation of a sanctioned archetype. *Proposal:* (1) `EmptyState` is called with no `variant` prop (defaults to `quiet`) even though `DESIGN.md`'s own archetype text specifies the `next-step` variant with the create affordance as its one action — swap to `variant="next-step"` with an explicit `<Button>` action child, focusing the already-visible inline create field rather than duplicating the form. (2) `DESIGN.md`'s Catalog-Manage Responsive contract requires row actions collapse to a per-card menu at ≤767px — none exists; actions currently ragged-wrap. Add a `⋯` menu on phone (Rename/Archive), mirroring the not-yet-built DataTable phone-card pattern. **Deliberately not adding:** bulk-select or search — DESIGN.md is explicit these lists are "usually short" reference data; gate a lightweight search behind an item-count threshold (e.g. >12) as a future, evidence-triggered addition.

### `sales/` cluster

**`daily-revenue-chart.tsx`** — redesign-proposed. *Why:* 2 live route consumers, no duplicate performs this job. *Proposal:* aria-hidden decorative-only, no axis, no per-bar value, no hover/tooltip — no number is readable from the chart itself on either desktop surface where finance/admin actually work, against PRODUCT.md's "what number is trustworthy?" bar. Add native `<title>` per `<rect>` segment for zero-dependency tooltips; add per-day total labels; derive the legend from actual channel keys present in `series` instead of the hardcoded two-entry POS/B2B map (a third channel today renders muted-gray bars with **no legend entry** — a silent recognition failure the source code's own comment anticipates but never guards against). Consider a "View exact figures" `<details>` disclosure on desktop instead of clipping the table fallback to sr-only until 767px.

**`revenue-columns.tsx`** — redesign-proposed. *Why:* sole (and correct) instance of the column-def-factory pattern feeding the general `DataTable` primitive; fully respects the `DataTableColumn` contract. *Proposal:* `DataTable` supports a `footer` prop that's never wired for the revenue table — for a finance-facing breakdown, a totals row is standard for reconciling against the KPI strip above it. Add a co-located `revenueFooterRow(rows)` export summing revenue/transactions and recomputing `avgRevenuePerTxn` as `sum(revenue)/sum(transactions)` (never an average-of-averages).

### `home/` cluster

**`home-stream.tsx`** — redesign-proposed. *Why:* single consumer (`home-page.tsx`), the shipped implementation of the owner's 2026-07-22 redirect ("Home = ONE consequence-ranked stream"). Real function, five merged rank bands, correct grammar reuse elsewhere in the `.tsx` (EmptyState/ErrorState/LoadingShell, StatusPill, shared row rhythm tokens). One clean gap. *Proposal:* the reason chip (`ReasonChip`/`.stream-reason`) is a hand-rolled **second implementation** of `components/ui/pill.tsx` — its own CSS comment admits it "mirrors the Pill tint recipe but slightly smaller." The tint math is byte-identical to Pill's warning/primary/destructive/violet tones. Replace with `<Pill tone={...} dot={false}>{label}</Pill>` (map `StreamReason['tone']` → `PillTone`), delete `.stream-reason*` from `home-stream.css`. Pure CSS-vocabulary consolidation — zero IA/IxD change, the ranking/band-order/row anatomy is already correct.

### `command/` cluster

**`command-menu.tsx`** — redesign-proposed. *Why:* live, singly-mounted, wired to both `⌘K` and the phone action-launcher; owns the global hotkey (AC-K02, ADR-0013 D4). Not a fossil, not a duplicate — the listbox/combobox a11y pattern is textbook-correct and its inline micro-states are appropriately *not* routed through page-level `state-kit` (correct judgment call). *Proposal (substance, not visual — composition already matches the mockup):* (1) the "Share Signal" action is a labeled placeholder that silently navigates Home instead (own inline comment admits it) — wire it through `openPanel()` with an intent param, or remove it until the real composer ships. (2) `searchTasksByTitle` is the only record source wired in, yet results render under the generic label "Records" — either fan out to a real `searchRecords(q)` union (tasks+signals) tagged by type glyph, or rename the group/copy honestly to "Tasks." (3) the zero-match state is a dead end with no recovery hint — add "Try a shorter word, or press ↵ to search anyway." (4) architecture: extract a shared `useOverlayHost` hook (scrim + focus-trap + Esc + scroll-lock) out of the near-identical logic duplicated across `command-menu.tsx`, `confirm-dialog.tsx`, `mobile-drawer.tsx`, and `task-drawer.tsx`'s modal branch — no shared overlay host exists yet despite the V3 grammar naming one.

### `cafe/` cluster

**`cafe-opening-panel.tsx`** — redesign-proposed. *Why:* single consumer (`CafeOpeningPage`, route `/cafe`), real non-duplicated function (capability-gated Start action, derived rollup+caption, scoped link into `/work/tasks`, reuse of `PendingResolution`). Under active AC-tagged test coverage. Grammar is otherwise fully conformant (correct state-kit usage including the "awaiting" vs "quiet" distinction, correct Button/Link primitive usage, token-only CSS). *Proposal:* the not-started vs. started branches are structurally divergent — the team-name eyebrow line (added specifically to fix a prior "hiding WHICH team it auto-selected" audit finding) disappears entirely once Start is clicked, so a viewer eligible for multiple branches loses that context and the layout jumps. Hoist the eyebrow out of the `!started` conditional into a shared shell rendered above whichever body variant is active.

### `assistant/` cluster

**`AssistantPanel.tsx`** — redesign-proposed. *Why:* the only implementation of the deputy surface, singleton-mounted behind `SHOW_ASSISTANT`, wired to `useAssistantPanel`/`AgentRuntimeContext`, launched from top-bar and command-menu, covered by 3 dedicated test files (~590 lines). No duplicate to merge into. *Proposal:* substantial but mechanical — every button (header, approve/deny, retry, composer send/stop, rating, chips) is a bespoke `<button style={{raw px}}>` instead of the canonical `Button`/`IconButton` primitives; typography is 100% inline px rather than the type scale (colors/radii, notably, ARE correctly sourced from the alias layer — this is a control-vocabulary/type-scale drift, not a token-value drift). Also duplicates the shared-overlay-host grammar (scrim/focus-trap/Esc/scroll-lock, near-identical to `task-drawer.tsx`'s modal branch — see `command-menu.tsx`'s note above, same missing shared host). Specific redesign: drop the two-tone chat-bubble chrome for assistant turns (a distill.md anti-pattern match: "the single most category-interchangeable choice in the file," identical to Slack/Intercom/ChatGPT — reserve color for *state* not "who's speaking"); consolidate the 3 parallel hand-styled chip-row patterns (`ApprovalChip`/`QuestionChips`/`RatingControl`) into one shared `InlineChipGroup` primitive.

---

## 5. Storybook Coverage Plan

Grouped by cluster, in the same core-shared-first order. `story:"exists"` entries are listed for
completeness (verify they still cover the redesigned shape after the proposal above lands); everything
under "needed" has **zero** dedicated `*.stories.tsx` today.

### Already covered — verify post-redesign, don't re-author from scratch
| Component | Cluster | Note |
|---|---|---|
| `text-input.tsx` | ui-primitive-kit | Controls/foundation stories exist; add `helperText`/`errorText` states once shipped. |
| `confirm-dialog.tsx` (ui) | ui-primitive-kit | `overlays.stories.tsx`; swap raw-button states for `<Button>` states once migrated. |
| `data-table.tsx` | dashboard | Exists; add a loading-state variant once routed through `LoadingShell`/`SkeletonRows`. |
| `plan-qty-stepper.tsx` | kitchen | Exists; extend with an Escape-to-discard interaction state once rebuilt on `useInlineCommit`. |

### Needed — no story today, state-rich enough to warrant one

**Shared engine (highest priority — everything else composes on these):**
- `record-field.tsx` (records) — the single highest-priority story in the whole ledger: view/edit × saving/saved/error/idle × prose/chip/pill/status renderings × readonly-with-reason × required × empty × `commitsFrozen`. Only a unit test exists today.
- `record-collection.tsx` (RecordCollectionSurface) — the 7-state ladder (loading/error/empty/filtered-empty/ready/read-only/projection-pending) once collapsed to one framed shell.
- `collection-toolbar.tsx` (CollectionToolbar) — view axis × presets vs saved-views × disclosure open/closed × active-dot states.

**ui-primitive-kit:**
- `icon-button.tsx` — fold into `controls.stories.tsx` once its variant set is unified with `Button`.
- `data-provenance-note.tsx` — snapshot vs live × has-data vs empty.

**tasks:**
- `mobile-grouped-cards.tsx` — grouped states + occurrence rollup, once trimmed to the desktop decision-column parity set.
- `person-picker.tsx` — once rebuilt as a combobox: filter-as-you-type, roving, empty-with-suggestion.
- `activity-card.tsx` — once the card-in-card frame is dropped.
- `checklist-card.tsx` — add/toggle/reorder/delete states, once glyph buttons become SVG icons.
- `CommentThread.tsx` — with avatar+timestamp added, shared across Task and Signal.

**signals:**
- `signal-category-picker.tsx` — once rebuilt on the shared menu/Select primitive (full keyboard states).
- `signal-mention-picker.tsx` — once rebuilt as a real combobox (active-option, group+type-badge, disabled-@BU).
- `signal-composer.tsx` — 4-field states, error, mention popover.
- `signal-feed-rows.tsx` — ambient vs archive variant, once the duplicate compose entry point is resolved.
- `signal-record.tsx` (fossil-replace) — once dissolved into RecordViewer slots, story the resulting shape.

**admin:**
- `user-table.tsx` (fossil-replace) — once ported to `RecordCollectionSurface`, story the new people-collection-adapter presentation.
- `create-person-dialog.tsx` — once role-assignment is removed from the create flow, story the collapsed shape.
- `role-editor.tsx` — self-assign-blocked / last-admin-blocked / error states, once `RoleCheckboxList` is shared.
- `toast.tsx` — once promoted to `ui/`, story auto-dismiss + the "last toast wins" collision.

**kitchen:**
- `kitchen-kpi-strip.tsx` (merge-into-other) — once it renders shared `KPITile`, verify no story regression; if none exists, add one covering the 4-page data-shaping variants.
- `wip-item-stepper.tsx` — once split into desktop-cell + phone-card, story both plus the variance-note gate and transfer-cap cue.

**dashboard:**
- `chart-frame.tsx` — loading/error/ready × table-fallback, once routed through state-kit with correct `role=alert`/`role=status`.

**inbox** *(story in the `v3-sweep-inbox` worktree)*:
- `inbox-triage.tsx` — dual-mode (page/quick) × 4 states × filters × Mark-handled × pending/busy rows × unavailable-target messaging.
- `inbox-triage-connected.tsx` — the shared wiring seam both doors depend on; de-risks future changes without needing full auth+DB.
- `inbox-record-door.tsx` — severity × target-type × unavailable/denied/malformed-target states, opened from both nav contexts.

**follow-ups:**
- `follow-up-queue-table.tsx` (fossil-replace) — once the 5 defects are fixed, story the collapsed action-overflow + saving/error transition-form states.

**processes:**
- `due-runs-list.tsx` — loading/empty/ready × single-vs-competing-CTA, once switched to `outline` action styling.
- `pending-resolution.tsx` — once both branches share `PersonPicker`, story `multiple` vs `none` as one component.

**catalog:**
- `catalog-manager.tsx` — active/archived/editing row states × next-step empty state × phone `⋯` menu collapse.

**sales:**
- `daily-revenue-chart.tsx` — once tooltips + dynamic legend land, story with 2-channel and 3+-channel data to catch the legend-omission bug.

**plan:**
- `fail-loud-badge.tsx` (fossil-replace → `CostBasisStatusChip`) — fresh/stale/uncertified variants, once rebuilt on the DQBadge shell.

**home:**
- `home-stream.tsx` — 5 rank bands × reason-chip tones, once consolidated onto `Pill`.

**command:**
- `command-menu.tsx` — result groups (tasks-only vs unioned records, pending the scope decision) × zero-match-with-hint × real vs placeholder Share-Signal action.

**assistant:**
- `AssistantPanel.tsx` — transcript turn variants (assistant/user × text/widget) × approval/question/rating chip groups × composer send/stop/error, once consolidated onto `Button`/`IconButton`/`InlineChipGroup`.

### Not warranted (fossils being deleted, or thin/stable enough not to need one)
Every `fossil-delete` entry in §1; `confirm-archive.tsx`, `basis-chip.tsx`, `cut-toggle.tsx`,
`dq-badge.tsx`, `window-selector.tsx`, `action-type-seg.tsx`, `kitchen-toolbar.tsx` (merge-into-other,
§3 — dissolve into an existing story surface, not a new one); `tasks-table-body.tsx`,
`signal-record-adapter.tsx`, `revenue-columns.tsx`, `cafe-opening-panel.tsx`, `use-follow-up-queue.ts`
(a `.ts` hook, not a component), `follow-up-queue-embed.tsx` (thin composition, no visual surface of
its own).

---

## 6. Flag-Owner List — Direct Questions for the Owner

These are places the interrogation surfaced a real decision only the owner can make — not
implementation details the Director/role agents should decide unilaterally.

1. **`ui/chip.tsx`** — do we want a canonical person-chip at all? It's being deleted as a fossil
   (zero consumers today), but if the RecordViewer/CollectionToolbar people grammar will need one
   soon, should this be *ported forward* into that grammar now instead of deleted and rebuilt later?

2. **`ui/icon-button.tsx` vs `ui/button.tsx`** — two button vocabularies exist (`tertiary`/`ghost`,
   `secondary`/`outline`, `danger`/`destructive`). Fold `IconButton` into `Button` as an `iconOnly`
   mode, or keep it separate and just rename its variants to match? This is a public-API decision
   that touches every icon-only affordance in the app once made.

3. **`admin/user-table.tsx`** — porting People onto `RecordCollectionSurface` also unlocks bulk
   multi-select (disable/archive in one action). Is bulk offboarding actually wanted for a
   ~15-person rollout, or is single-row-at-a-time intentional restraint we shouldn't "fix"?

4. **`follow-ups/follow-up-queue-table.tsx`** — the counterparty-open-record button forks between
   an overlay panel (money door) and a full-page `<Link>` (Work-Tasks embed door) for the identical
   action. Which one is the *intended* single opening contract per `DESIGN.md`'s Overlay grammar —
   should both doors always open the panel, or should Follow-ups get an exception?

5. **`follow-ups/follow-up-queue-embed.tsx`** — registering Follow-ups as its own
   `RecordCollectionSurface` descriptor (rather than piggybacking on the Task collection's `view`
   flag) is a real architectural change to how the Work Tasks door surfaces Follow-ups. Confirm this
   is in scope for this redesign pass, or should it be deferred to a dedicated ADR given it touches
   the Task/Follow-up collection boundary?

6. **`plan/fail-loud-badge.tsx`** — the "stale" cost-basis state is currently destructive-red;
   the proposal downgrades it to warning-amber (matching DQBadge's partial-vs-good precedent). This
   changes what a finance user sees as blocking vs advisory on a real financial metric — needs
   explicit owner sign-off, not just a design-system consistency call.

7. **`command/command-menu.tsx`** — "Share Signal" is a labeled command that silently does nothing
   (navigates Home) today. Is the Step-4 composer still coming, in which case we wire the real
   intent now and ship it disabled/hidden until ready — or has that scope been dropped, in which case
   we delete the action entirely rather than ship a fake one?

8. **`command/command-menu.tsx`** (second question, same file) — record search today is
   Tasks-only but labeled generically "Records." Do we want to actually widen search to include
   Signals (a real scope increase), or just rename the label/copy to be honest about Tasks-only
   coverage? These are different amounts of work and should be picked deliberately, not defaulted.

9. ~~Truncated interrogation data~~ — **RESOLVED**: the 45 missing verdicts were recovered
   verbatim from the workflow journal and appear in the Appendix below; the ledger is closed over
   all 111 components. Two new flag-owner items surfaced in the recovered set: `records/dirty-leave-guard.ts`
   (zero live consumers but guards real function — dropped wiring or dead code?) and `home/home-page.tsx`
   (see Appendix entries for the specific questions).

10. **`assistant/AssistantPanel.tsx`** — the redesign proposal drops the two-tone chat-bubble
    chrome for assistant replies (citing distill.md's "category-interchangeable ... AI slop" concern).
    This is a visible identity change to the Deputy surface specifically, which is a flagship feature —
    confirm this reads as an improvement and not a regression in "does this look like our product" terms
    before it's built, ideally via a quick mockup rather than committing straight to code.

---

## Appendix: the 45 verdicts the truncated payload dropped (recovered verbatim from journal `wf_a893b30d`)

The consolidation input was cut mid-payload; every entry below was recovered from the workflow journal, so the interrogation ledger over all **111** components is now CLOSED — "not listed" no longer exists. Headline: **no additional fossil actions** hid in the gap. 43 of 45 are earns-place (mostly `highest-quality` or `minor-polish` — the healthy tail of the kit); 2 are flag-owner questions (`dirty-leave-guard.ts`, `home-page.tsx`), folded into the flag-owner list conceptually and detailed here.

### `mos-app/src/components/admin/password-reveal.tsx`
- **Existence:** earns-place — Live consumers: create-person-dialog.tsx (post-create) and pages/admin-users-page.tsx directly (post-reset). Governs a real security-sensitive moment (NFR-003, show-once temp password) with no duplicate implementation elsewhere.
- **Design:** minor-polish — The password renders in permanent plaintext the instant the panel opens, with only a warning banner ('copy this now') as mitigation — on a shared admin screen in an open office this is a real shoulder-surf window with no way to re-hide it. Default to a masked state with an explicit 'Reveal' action before showing plaintext (mirrors the ux-guideline 'password visibility toggle' pattern, just inverted for a show-once secret) — small, scoped change: a boolean + a masked <code> render, not a restructure.
- **Grammar:** conformant — Tokens (var(--warning)/var(--warning-foreground)), Button primitive, aria-live pattern consistent with state-kit conventions.
- **Story:** needed

### `mos-app/src/components/records/record-viewer.tsx`
- **Existence:** earns-place — THE single presentation grammar for a record. Live non-test consumers: task-surface.tsx (renders <RecordViewer> at :576), signals/signal-record-host.tsx, follow-ups/follow-up-record-host.tsx, inbox/inbox-record-door.tsx, plus router.tsx and the record-collection opening contract. Central, irreplaceable spine of the V3 record surface.
- **Design:** highest-quality — No redesign of its job warranted — it is the best version of 'one stable document hierarchy projected from an adapter': state-kit for loading/empty/error, identity-suppression contract for host-owned chrome, section/relations/content-slot/activity/actions regions, permission notes, intent->ButtonVariant one-vocabulary mapping, quiet edit-hint. Two polish-level notes only: (1) activity items render {item.occurredAt} verbatim as both the <time> text and dateTime — if an adapter passes a raw ISO string the reader sees ISO; the contract should require a formatted display string like every other field's displayValue. (2) relations render as full-width bordered 'control' rows with no kind/eyebrow — fine, but a leading kind glyph would aid scan when a record has mixed relation kinds.
- **Grammar:** conformant — Uses state-kit (LoadingShell/EmptyState/ErrorState), the shared Button + ButtonVariant, record-viewer.css section grammar, data-viewer-region seams, useT i18n. Conforms to the V3 vocabulary. (Radius-token drift lives in the shared CSS — attributed to the record-field entry.)
- **Story:** needed

### `mos-app/src/components/records/ask-deputy-action.tsx`
- **Existence:** earns-place — Record-scoped 'Ask Deputy' affordance for the RecordPanelHost actions seam (shares the .record-panel-btn host chrome, same slot as Close). Live non-test consumers: tasks/task-drawer.tsx, tasks/task-surface.tsx, tasks/tasks-workspace.tsx, pages/signals-archive-page.tsx. Returns null when no agent runtime (SHOW_ASSISTANT=false), so it never offers an inert affordance. Real single-purpose function.
- **Design:** minor-polish — Correct as an icon-button in the host chrome seam: 16px spark, aria-label + title from i18n (satisfies the icon-only-needs-label UX rule), muted->foreground hover per the No-FAB Deputy parity. Two small notes: (1) DeputySparkIcon is hand-duplicated to be 'visually identical to the launcher's DeputyIcon' — extract one shared DeputyIcon so the two never drift (code/design-consistency, not a redesign). (2) it opens the composer pre-seeded and never auto-sends — good; consider a brief on-hover tooltip already covered by title. No redesign of the job.
- **Grammar:** conformant — Reuses the shared .record-panel-btn control class (one control vocabulary), i18n copy, and the ratified neutral Deputy-spark treatment (never a FAB). Conformant.
- **Story:** needed

### `mos-app/src/components/records/dirty-leave-guard.ts`
- **Existence:** flag-owner — ZERO live consumers. grep across all of src (incl. shell/pages/tasks/signals/follow-ups) finds dirtyLeaveGuard referenced only by dirty-leave-guard.ts and dirty-leave-guard.test.ts — no tenant wires it into an OverlayEntry.leaveGuard. By the zero-consumer rule this is fossil, but because a record's unsaved-draft leave-guard is REAL required function (the header calls it 'the content-side half of the record-viewer.behavior.test.tsx contract'), the honest question for the owner is whether the tenant wiring was dropped (a bug/gap) rather than the helper being genuinely dead. task-surface.tsx forwards onDirtyChange + fieldCommitsFrozen but never imports this factory. Confirm: is the dirty->confirm-discard guard wired elsewhere (host handles it), or is this an unhooked safety net that leaves discard-on-close unguarded? If the former, delete this file + its test; if the latter, wire it in the record tenant.
- **Design:** highest-quality
- **Grammar:** conformant — 6-line factory returning the shell OverlayLeaveGuard contract (Stay->deny, Discard->allow); attach-only-while-dirty. Clean and correctly scoped — the issue is wiring/existence, not shape.
- **Story:** not-warranted

### `mos-app/src/components/records/record-viewer.types.ts`
- **Existence:** earns-place — The typed presentation contract that the whole cluster and both domains project into. Live consumers: tasks/task-record-adapter.tsx, signals/signal-record-adapter.tsx, follow-ups/follow-up-record-adapter.tsx, tasks/task-surface.tsx, lib/record-collection/record-opening-contract.ts, lib/team-context/*. It defines the V3 grammar itself; deleting it collapses the cluster.
- **Design:** highest-quality
- **Grammar:** conformant — Is the source of the grammar — RecordKind limited to live models (task|signal|follow-up), PIC/Supervisor vocabulary boundary honored, no DB abstraction. Well-documented boundary.
- **Story:** not-warranted

### `mos-app/src/components/ui/avatar.tsx`
- **Existence:** earns-place — 3 real product consumers (components/admin/user-table.tsx, pages/kitchen-review-page.tsx, and ui/chip.tsx) plus the gallery. Carries real function: deterministic seeded-pastel identity for list/entity people where no photo exists.
- **Design:** minor-polish — Add an <img> onError fallback: a broken avatarUrl currently renders an empty box (no initials, no icon) because the image branch wins unconditionally. On error, fall back to the seeded-initials branch. Also: alt="" is correct only while decorative — when the avatar is the sole identity carrier (chip lead) expose an optional alt.
- **Grammar:** conformant — Uses --radius-*/--ds-color-* tokens. One tension: the 24-color seeded-pastel palette is a parallel identity to DESIGN.md's ratified navy->blue user-chip avatar gradient (Structural-Navy Rule). Legitimate for list/entity avatars, but it must never be used for the header user chip. STORY: needed — shared display primitive with a non-trivial seed algorithm, no story today.
- **Story:** needed

### `mos-app/src/components/ui/button.tsx`
- **Existence:** earns-place — The single button primitive — 23 product consumers, the widest-used control in the kit. Class-based `.btn .btn-{variant}` also serves <Link>/<a> call sites.
- **Design:** minor-polish — Under-exposes the DESIGN.md Button spec: (1) no `size` prop though `.btn-sm` (28px) exists in Button.css — callers can't select it type-safely; (2) no loading/busy state though the spec's State table lists `loading` (opacity 0.7, wait cursor, spinner) — every async caller re-hand-rolls a busy label (see confirm-dialog); (3) no leading/trailing icon slots per the spec's anatomy. Add `size?: 'sm'|'default'`, `loading?: boolean` (renders spinner + aria-busy, disables), and icon slots.
- **Grammar:** conformant — One control vocabulary anchor; variants primary|outline|ghost|destructive match DESIGN §5. STORY: exists (controls.stories.tsx).
- **Story:** exists

### `mos-app/src/components/ui/checkbox.tsx`
- **Existence:** earns-place — 2 real consumers (components/admin/role-editor.tsx, components/admin/create-person-dialog.tsx) plus story+gallery. Real selection control with indeterminate/tri-state support.
- **Design:** minor-polish — Solid a11y (role=checkbox, aria-checked mixed/true/false, Space/Enter, focus). Polish: a user cannot clear an indeterminate state by clicking (toggle() early-returns on indeterminate) — standard tri-state UX is that a user click resolves mixed->checked. Confirm this is intended for the current callers (bulk row-select header); if not, resolve mixed->true on click.
- **Grammar:** conformant — 16/14px, --radius-xs (4px), primary fill — matches DESIGN §5 Inputs checkbox. STORY: exists (controls.stories.tsx).
- **Story:** exists

### `mos-app/src/components/ui/date-field.tsx`
- **Existence:** earns-place — 2 real consumers (components/tasks/task-surface.tsx, components/records/record-field.tsx). Real function: keeps the native date input (calendar popup, keyboard segments, a11y) but overlays a token-styled box showing an unambiguous '22 Jul 2026' — solves the ux 'Date Formatting' guideline (avoid ambiguous 01/02/03) and the field-chrome mismatch.
- **Design:** minor-polish — Strong pattern. Polish: no error-text line despite an `error` boolean (mirrors text-input's gap) — wire an optional errorText + aria-describedby so the field owns its message (ux Forms: error near field). Confirm the invisible native input still exposes a visible focus ring on the styled box (focus is on the hidden input).
- **Grammar:** conformant — Same 32px/8px box + chevron-slot grammar as Select/TextInput; --radius/--font-size tokens. STORY: needed — non-obvious native-over-styled trick, worth a story.
- **Story:** needed

### `mos-app/src/components/ui/modal-shell.tsx`
- **Existence:** earns-place — The shared overlay host — 6 real consumers (shell/signal-composer-host.tsx, ui/confirm-dialog.tsx, components/tasks/occurrence-assign-dialog.tsx, components/admin/role-editor.tsx, components/admin/create-person-dialog.tsx, components/command/command-menu.tsx) plus admin-users-page. Exactly the V3 'shared overlay/record-panel host' the grammar calls for.
- **Design:** highest-quality — Best-in-class: owns focus entry, roving Tab trap, Esc policy, scrim, phone-fullscreen body-scroll lock, and focus return to invoker. Optional hardening: the trap re-queries focusables per keydown (fine at this scale); consider `inert` on siblings for belt-and-suspenders. No redesign needed.
- **Grammar:** conformant — Shared --scrim/--z-modal tiers, centered|sheet surfaces, phone-fullscreen. This IS the V3 overlay grammar. STORY: needed — highly stateful interaction owner (focus/keyboard/responsive); currently only exercised transitively via confirm-dialog/overlays stories, warrants its own.
- **Story:** needed

### `mos-app/src/components/ui/pill.tsx`
- **Existence:** earns-place — The one status/state pill — 6 real consumers (components/kitchen/kitchen-kpi-strip.tsx, components/admin/user-table.tsx, components/dashboard/kpi-tile.tsx, lib/kitchen-status.ts, pages/kitchen-log-page.tsx, ui/state-pill.tsx). Single shell, tone-only tint. Replaces the hand-rolled pill zoo named in its header.
- **Design:** highest-quality — Correct expression of DESIGN's Tinted-Status Rule (dot + tinted bg + AA-darkened text, no solid fills). Keep. Only watch: callers must always pair the dot with a text label (WCAG 1.4.1) — the component allows dot-only; consider a dev warning if children is empty.
- **Grammar:** conformant — tones neutral|primary|success|warning|destructive|violet|skeleton map to DESIGN status families; optional dot for dotless neutral source badges. STORY: exists (controls.stories.tsx).
- **Story:** exists

### `mos-app/src/components/ui/select.tsx`
- **Existence:** earns-place — The ratified single dropdown shell — 11 real consumers (task-surface, record-field, signal-composer, signal-record-host, kitchen-toolbar, record-collection/collection-toolbar, pages profile/projects-processes/budget/pricing/cafe-opening/dev-views). Closes the '11 raw <select>' divergence (DESIGN §5 Select, ratified 2026-07-07).
- **Design:** highest-quality — Correct ponytail call: wraps a native <select> so keyboard, type-ahead, SR semantics, and the phone-native picker come free — no custom listbox to own. Keep. Minor: like text-input it has no helper/error-text slot despite `error`; add for form parity.
- **Grammar:** conformant — appearance:none reset + token chrome + 14px chevron, 32px/8px, error->destructive border, disabled->secondary. Matches DESIGN §5 verbatim. STORY: exists (controls.stories.tsx).
- **Story:** exists

### `mos-app/src/components/ui/state-kit.tsx`
- **Existence:** earns-place — The state grammar (ErrorState/EmptyState/SkeletonRows/LoadingShell) — the single most-imported kit module (~30 product consumers across Tasks, Ops, kitchen, weekly). Directly satisfies the V3 'state-kit for states' law and the ux Empty-State/Error/Loading guidelines.
- **Design:** highest-quality — Excellent: role=alert errors, region-landmarked EmptyState with variant-earned glyphs (the '✓ earned all-clear vs — blank-by-design vs ↻ awaiting' distinction is genuinely thoughtful, anti-slop), pickable suggestions, and LoadingShell as the one role=status+aria-busy loader that banishes literal 'Loading…'. Keep.
- **Grammar:** conformant — Only nit: its CSS lives in CardHead.css (see card-head verdict) — rename to state-kit.css so the state grammar owns its own stylesheet. STORY: exists (feedback/controls stories reference EmptyState/ErrorState/SkeletonRows).
- **Story:** exists

### `mos-app/src/components/ui/tag.tsx`
- **Existence:** earns-place — 6 real consumers (components/tasks/group-header-row.tsx, tasks/status-pill.tsx, tasks/mobile-grouped-cards.tsx, catalog/catalog-list-presentation.tsx, admin/user-table.tsx, kitchen pushes/review pages). Distinct job from Pill: categorical color labels (30-color palette, no status dot), correctly separated from status semantics.
- **Design:** highest-quality — Clean and correct — dotless tinted label over --ds-tag-background/text tokens that flip in dark mode. Keep. The Pill-vs-Tag boundary (status vs categorical) is exactly the right decomposition.
- **Grammar:** conformant — 30-color --ds-tag-* tokens, regular|medium weight, --radius/--font-size tokens. STORY: exists (controls.stories.tsx).
- **Story:** exists

### `mos-app/src/components/ui/toggle.tsx`
- **Existence:** earns-place — 2 real consumers (components/admin/create-person-dialog.tsx, pages/signals-archive-page.tsx) plus story+gallery. Real switch control.
- **Design:** minor-polish — Correct role=switch + aria-checked + Space/Enter + disabled focus removal. Polish: 28x16 medium is below the 44px touch minimum (ux Touch Target Size, HIGH) — ensure call sites wrap it in a >=44px label hit-area on phone surfaces, or add a .touch-target affordance like view-tabs does.
- **Grammar:** conformant — off->secondary, on->primary, knob->surface; --radius tokens. STORY: exists (controls.stories.tsx).
- **Story:** exists

### `mos-app/src/components/ui/view-tabs.tsx`
- **Existence:** earns-place — 3 real consumers (components/admin/user-table.tsx, components/record-collection/collection-toolbar.tsx, pages/dashboard-page.tsx). THE V3 view-tab strip primitive (OD-P3-6) that reconciled the forked dashboard TabStrip + tasks .vtab grammars — core to the CollectionToolbar surface.
- **Design:** highest-quality — Excellent: single strip serves both tablist (view switch) and radiogroup (mutually-exclusive setting) semantics with one visual grammar; roving tabindex + Arrow/Home/End across enabled tabs only, soon/disabled stubs out of tab order, optional count pill, data-touch-target for the 44px hit-area. Keep. Watch the 'soon' placeholders don't become permanent dead tabs (PRODUCT anti-reference: no decorative placeholders) — omit adapters that aren't functional rather than rendering them disabled.
- **Grammar:** conformant — Active = brand-navy-text + 2px accent underline, --font-size/--radius tokens; the 'one orange sprinkle' active marker per DESIGN §View-tab strip. STORY: exists (controls/accessibility-responsive stories).
- **Story:** exists

### `mos-app/src/components/dashboard/freshness-label.tsx`
- **Existence:** earns-place — 2 live consumers (global-toolbar.tsx, lib/viewspec/renderer.tsx), enacting the named D11 obligation that every reporting figure carries an 'as of' timestamp.
- **Design:** highest-quality
- **Grammar:** drift — `font-size: 12px` instead of `var(--font-size-label)` (12px — exact value match, purely a tokenization miss, not a scale problem).
- **Story:** not-warranted

### `mos-app/src/components/dashboard/global-toolbar.tsx`
- **Existence:** earns-place — Single consumer (pages/dashboard-page.tsx) but is the named single-source-of-truth toolbar for the Money page (FR-011/AC-011) — a legitimate route-bound composition, not a fossil.
- **Design:** minor-polish — Structurally sound composition (single flex row, divider, freshness trailing edge, sensible sticky mobile rail). Its only defect is inherited: it composes CutToggle, so it will automatically benefit once CutToggle/WindowSelector merge into ViewTabs's radiogroup+seg mode. Separately: its own source comment documents an unresolved mockup/spec mismatch ('mockup-mobile drops Activity by mistake — design-plan gap G2') worked around in code rather than closed in the decision log — per the owner's 2026-07-23 binding rule that deviations must be tracked, not left as inline comments, flag this to the Director/owner to confirm gap G2 is formally closed.
- **Grammar:** drift — `.global-toolbar-overline { font-size: 11.5px }` is off-scale — matches neither --font-size-overline (11px) nor --font-size-label (12px), a bespoke fractional value with no token backing it.
- **Story:** not-warranted

### `mos-app/src/components/dashboard/kpi-tile.tsx`
- **Existence:** earns-place — 4 live consumers: components/assistant/AssistantWidgetSlot.tsx, lib/viewspec/registry.ts, lib/viewspec/renderer.tsx, pages/dashboard-page.tsx — the canonical 'DESIGN.md KPI Tile (signature)' primitive and the most cohesion-debt-remediated component in the directory (already migrated to state-kit's LoadingShell per the 2026-07-19 fix, unlike its siblings chart-frame/data-table).
- **Design:** minor-polish — Best-behaved component here: correct LoadingShell usage, clean button/div dual-mode for filter-in-place, aria-current + ring/shadow layering for selected state, fluid clamp() sizing for long values. Its only gap is downstream of #basis-chip/#dq-badge: once those fold into Pill, swap the two imports for `<Pill tone="neutral" dot={false}>`/`<Pill tone={DQ_TONE[dq]}>` — no KPITile-specific defect otherwise.
- **Grammar:** drift — `.kpi-tile-label` raw 12px and `.kpi-tile-sub` raw 11px both match real tokens (--font-size-label, --font-size-overline) by value but aren't tokenized; `.kpi-tile-help` raw `border-radius: 999px` instead of `var(--radius-pill)`. The 23px/`clamp(17px,6.2vw,23px)` value-numeral size is an intentional, documented DESIGN.md signature size, not drift.
- **Story:** needed

### `mos-app/src/components/signals/signal-collection-actions.tsx`
- **Existence:** earns-place — The React-scoped callback seam (onCategorize/onShareClick/onSort) that lets the module-level collection descriptor render its Feed/Table presentations without threading router/composer state. Consumed by signal-feed-presentation, signal-table-presentation, and signals-archive-page. Minimal, correct provider+hook.
- **Design:** highest-quality
- **Grammar:** conformant — Non-visual context seam supporting the RecordCollection grammar; nothing to design.
- **Story:** not-warranted

### `mos-app/src/components/signals/signal-collection-adapter.tsx`
- **Existence:** earns-place — The V3 RecordCollection descriptor for Signals: typed query<->URL schema, load, filter/group/sort projection, Feed+Table presentation wiring, typed saved views, and the record-opening seam. Consumed by home-page, signals-archive-page (live /work/signals route), collection-view-spec, and inbox-record-door. Core of the surface, and faithful to 'Signals have no PIC/Supervisor/Status — never invent them.'
- **Design:** highest-quality — Optional SRP tidy only: 18KB combines query/URL schema + descriptor + view-store; the query schema half could split out. No behavioral change needed.
- **Grammar:** conformant — Reference implementation of the RecordCollection grammar for a non-Task record kind.
- **Story:** not-warranted

### `mos-app/src/components/signals/signal-feed-presentation.tsx`
- **Existence:** earns-place — The descriptor's Feed presentation; consumed by signal-collection-adapter. Thin adapter that reads the actions context and delegates to SignalFeedRows so Home and the archive Feed share exactly one row anatomy (the owner-mandated convergence).
- **Design:** highest-quality
- **Grammar:** conformant — Does one job and reuses the shared row anatomy — the correct way to satisfy the one-anatomy rule.
- **Story:** not-warranted

### `mos-app/src/components/signals/signal-feed-section.tsx`
- **Existence:** earns-place — Home's ambient FYI tail; consumed by home-page. Route-bound composition wiring overlay host + composer host + SignalRecordHost into the Home stream as a peer band with the same section-label grammar as the OVERDUE / MY WORK bands.
- **Design:** minor-polish — Peer section-label grammar and quiet-degradation policy are right. Keep the composition thin: its openRecord/navigate + categorize wiring overlaps SignalRecordHost's own concerns — lean on the shared opener contract rather than re-implementing routing here.
- **Grammar:** conformant
- **Story:** not-warranted

### `mos-app/src/components/signals/signal-record-host.tsx`
- **Existence:** earns-place — The fetch/mutate host for the Signal record (the chrome-free CONTENT of the shared RecordPanelHost); consumed by signal-feed-section, signals-archive-page, and signal-collection-adapter's opening seam. Owns data load, mutations (categorize/acknowledge/comment/link/follow-up), and loading/error/ready via state-kit.
- **Design:** minor-polish — Solid data host with panel/page mode and shared state-kit states. Transitional smell: it mounts the legacy SignalRecord as a second RecordViewer content slot ('workflow') — a nested pre-redesign blob rather than native slots. Complete the P1-3 migration so the host feeds first-class RecordViewer slots directly and SignalRecord dissolves (see its verdict).
- **Grammar:** conformant — Uses the shared RecordViewer correctly; the one seam is the nested legacy 'workflow' content slot.
- **Story:** not-warranted

### `mos-app/src/components/signals/signal-table-presentation.tsx`
- **Existence:** earns-place — The descriptor's Table presentation; consumed by signal-collection-adapter (live /work/signals). Reuses the generic DataTable with Signal-specific columns (message + provenance subline, Team, occurred-at, attention), a sort seam, mobile card fallback (useIsDesktop), retracted tombstone, and the shared Operations-event row treatment matching the Feed.
- **Design:** highest-quality — Optional only: no multi-select/bulk actions (ux-guideline, low severity) — add if triage-at-scale becomes a real JTBD; otherwise leave it lean.
- **Grammar:** conformant — Uses record-collection-table + collection-grammar.css and shares the attention row-state treatment with the Feed presentation — one collection grammar across both layouts.
- **Story:** not-warranted

### `mos-app/src/components/kitchen/plan-qty-cell.tsx`
- **Existence:** earns-place — Sole live consumer: kitchen-plan-page.tsx (desktop branch, `isDesktop ? <PlanQtyCell.../> : <PlanQtyStepper.../>`). Correctly routed through the shared `useInlineCommit` hook (Enter/Tab/blur commit, Escape cancels, no-op writes skipped) — the one kitchen qty control that fully honors the binding I5 interaction-contract. Not a live duplicate of anything: its would-be sibling QtyCell is dead code (see qty-cell.tsx verdict).
- **Design:** minor-polish — Two small fixes rather than a rebuild: (1) the −/+ buttons default to 0.45 opacity and only reach full 1.0 on `:hover`/`:focus-within` — a mouse user without hover and without keyboard focus (e.g. a low-vision desktop user scanning the row) sees a sub-3:1 icon glyph, which is thin against WCAG 1.4.11 non-text contrast for a primary editing affordance; raise the resting opacity floor. (2) Once qty-cell.tsx is deleted and its `.qcell` CSS is gone, rename this component's underlying shape into the ONE shared compact desktop qty-cell primitive (drop the 'Plan' prefix on the exported type, keep a thin PlanQtyCell wrapper if the Plan-specific saving/justSaved copy is worth preserving) so a redesigned Log desktop cell (see wip-item-stepper.tsx) can reuse it instead of a fourth reimplementation.
- **Grammar:** conformant — Token-only CSS (--radius-sm, --border, --card, One-Blue focus ring), tabular-nums, routed through useInlineCommit per the I5 contract.
- **Story:** exists

### `mos-app/src/components/tasks/tasks-workspace.tsx`
- **Existence:** earns-place — Route orchestrator (consumed by pages/tasks-layout.tsx). Already sits on the V3 engine — useRecordCollection + RecordCollectionSurface + OverlayHostSlot + PageFamilyFrame — and projects the task descriptor/runtime/toolbar into it. Not a parallel stack.
- **Design:** minor-polish — The LegacySavedView bridge (queryFromLegacySavedView / legacyViewFor / savedView prop) is pre-typed-URL cruft kept only for old tests/embeds; production derives the query from the URL. Distill it out so the workspace has ONE query owner (the controller), not two.
- **Grammar:** conformant
- **Story:** not-warranted

### `mos-app/src/components/tasks/task-collection-adapter.tsx`
- **Existence:** earns-place — The typed Task RecordCollection descriptor — the binding seam between the Task model and the shared engine. Consumed by presentation, toolbar, workspace, and lib/record-collection/collection-view-spec.ts.
- **Design:** highest-quality
- **Grammar:** conformant
- **Story:** not-warranted

### `mos-app/src/components/tasks/tasks-toolbar.tsx`
- **Existence:** earns-place — Thin typed projection of Task options into the shared CollectionToolbar (imports and renders @/components/record-collection/collection-toolbar). Consumed by workspace. This is exactly the intended one-toolbar-vocabulary pattern — no drift.
- **Design:** highest-quality
- **Grammar:** conformant
- **Story:** not-warranted

### `mos-app/src/components/tasks/task-row.tsx`
- **Existence:** earns-place — The live desktop collection row (consumed by task-collection-presentation), rendered into the shared collection-grammar.css skin. Domain-row-on-shared-skin is the accepted pattern (Signals mirrors it).
- **Design:** minor-polish — The title cell defers the PRIMARY open action by a 200ms timer to disambiguate single-click-open from double-click-rename. Delaying the app's most-used action to host an edit affordance is an IxD cost. Prefer F2/explicit-rename only (already wired) and make single-click open instantly, or move rename into the record; keep the primary door zero-latency.
- **Grammar:** conformant
- **Story:** needed

### `mos-app/src/components/tasks/group-header-row.tsx`
- **Existence:** earns-place — The shared desktop group header (caret/label/type-tag/count/overdue/rollup/assign/add). Consumed by task-collection-presentation; its semantics are mirrored by the mobile header. State-rich and well-factored.
- **Design:** highest-quality
- **Grammar:** conformant
- **Story:** needed

### `mos-app/src/components/tasks/occurrence-assign-dialog.tsx`
- **Existence:** earns-place — Real function: resolve unresolved occurrence PICs. Composes the shared ModalShell + state-kit + PendingResolution (no second resolution UI). Consumed by task-collection-presentation.
- **Design:** minor-polish — It hand-builds its own head/close-button + loading/error/empty stack inside ModalShell. Adopt a shared dialog-header/title pattern so the modal chrome matches ConfirmDialog and the other overlays rather than a bespoke lone 'Close' button top-left.
- **Grammar:** conformant
- **Story:** not-warranted

### `mos-app/src/components/tasks/record-feed.tsx`
- **Existence:** earns-place — The record's Activity/Checklist tabbed content, substituted by task-surface as the RecordViewer's single content slot (adapter's default activity/checklist are blanked in the live surface — no duplication). Notes tab already removed per owner law. Consumed by task-surface.
- **Design:** highest-quality
- **Grammar:** conformant
- **Story:** needed

### `mos-app/src/components/tasks/status-pill.tsx`
- **Existence:** earns-place — Shared status token: consumed by follow-ups/follow-up-queue-table, home/home-stream, tasks (row, card, drawer-header). Built on the shared Tag + semantic status tokens with an AA-corrected text role and a redundant (non-color-only) dot.
- **Design:** highest-quality
- **Grammar:** conformant
- **Story:** needed

### `mos-app/src/components/tasks/pic-cell.tsx`
- **Existence:** earns-place — The typed PIC display cell (avatar-initials + first name + optional role provenance). Consumed by task-row and mobile-grouped-cards.
- **Design:** minor-polish — Hand-rolls an initials avatar (`.ownav`); person-picker and task-ownership-card each hand-roll their own (`.person-av`). Extract ONE shared PersonAvatar/PersonChip primitive so avatars are consistent app-wide instead of three copies.
- **Grammar:** conformant
- **Story:** needed

### `mos-app/src/components/tasks/workload-caption.tsx`
- **Existence:** earns-place — The plain-English workload literacy sentence (workline groupBy + single person). Consumed by tasks-table-body and task-collection-presentation. Directly serves PRODUCT's 'a high schooler can understand' literacy bar.
- **Design:** highest-quality
- **Grammar:** conformant
- **Story:** needed

### `mos-app/src/components/tasks/task-drawer.tsx`
- **Existence:** earns-place — Route element for /work/tasks/:taskId and /new (router.tsx) and the overlay content (TaskOverlayContent, used by tasks-workspace). Composes the shared RecordPanelHost chrome + the one TaskSurface + the leave-guard; owns only task-specific plumbing. Clean.
- **Design:** highest-quality
- **Grammar:** conformant
- **Story:** not-warranted

### `mos-app/src/components/tasks/task-record-adapter.tsx`
- **Existence:** earns-place — Projects the real Task model into the shared RecordViewer grammar (createTaskRecordAdapter). Consumed by task-surface. The honest Team-gating, derived Classification, and the Source-collapses-when-equal-to-Classification logic are an exemplary application of the owner's 'every element earns its place by information' law.
- **Design:** highest-quality
- **Grammar:** conformant
- **Story:** not-warranted

### `mos-app/src/components/tasks/task-surface.tsx`
- **Existence:** earns-place — The ONE canonical task record surface (panel/page/create widths), consumed by task-drawer and pages/tasks-layout. Renders the shared RecordViewer (via task-record-adapter) + RecordFeed, blanking the adapter's default activity/checklist so there is no double render. This is the correct single record home.
- **Design:** minor-polish — At ~1100 lines it owns data loading, create, archive, checklist, comments, tab-memory and three widths in one file. Extract the data-loading/optimistic-mutation layer into a hook (create mode is already split) so the surface reads as composition, not a monolith. No grammar change — purely distill for maintainability.
- **Grammar:** conformant
- **Story:** not-warranted

### `mos-app/src/components/assistant/ThreadList.tsx`
- **Existence:** earns-place — Live consumer at AssistantPanel.tsx:226 (showHistory branch), with its own dedicated test file whose header explicitly states it closes a real P2 review gap ('always-empty History — the panel's History tab had no client-side thread index'). Single consumer today but non-trivial, real function (async listThreads() + 3 states), not a stub.
- **Design:** minor-polish — Swap the '…' loading branch for SkeletonRows (ui/state-kit.tsx) at 3 rows to match every other list surface in the app. Route each row through Button(variant=ghost) or a shared list-row primitive instead of a bespoke className/style button. Add a trailing muted relative-timestamp (thread.updated_at) per row via the app's existing date-formatting convention — with only 'title || (untitled conversation)' shown today, two untitled threads are visually indistinguishable, a Nielsen heuristic-6 (Recognition not Recall) gap for a history list whose whole job is letting the owner tell conversations apart.
- **Grammar:** drift — Loading state (lines 31-36) is a bare '…' character — violates the State-Kit Rule (DESIGN.md: loading is always SkeletonRows, 'never a white vacuum or a bare heading') and the UX-guideline database's Loading Indicators rule (spinner/skeleton required for >300ms async ops; confirmed via ui-ux-pro-max search). Each thread row (lines 50-58) is a hand-rolled <button className="text-left rounded-md border..."> — same un-primitived pattern as AssistantPanel's suggestion/option buttons, bypassing Button. Color/spacing tokens (border-border, bg-secondary, text-foreground/text-muted-foreground) are otherwise correctly sourced.
- **Story:** needed

### `mos-app/src/components/assistant/AssistantMarkdown.tsx`
- **Existence:** earns-place — Single consumer (AssistantPanel.tsx transcript, assistant-role turns via `item.role === 'assistant' ? <AssistantMarkdown .../> : item.text`), but it is a real, narrowly-scoped security boundary explicitly cited in AssistantPanel's file header ('safe markdown boundary (ADR-0049)') — an allowlisted element set + protocol allowlist + forced target=_blank/rel=noreferrer on links. One consumer is correct here: this class of sanitization boundary should stay a separate, independently auditable file rather than be inlined, even at N=1 usage.
- **Design:** minor-polish
- **Grammar:** drift — distill.md's 'strip to essence' test passes cleanly for the sanitization logic itself (allowlist + urlTransform + 3 renderer overrides, nothing decorative) — this is close to its essence already. The one confirmed gap: the Code component (lines 36-42) renders `<code>`/`<pre>` completely unstyled, not bound to the app's --font-mono token that DESIGN.md reserves for identifiers/codes — a code fence in a transcript won't visually match any other monospace usage in the app. Separately (not a grammar issue, a product-scope question worth flagging to the owner): ALLOWED_ELEMENTS omits headings and images — with unwrapDisallowed, text survives but structure silently collapses if the model ever emits a heading or references an image; confirm this is intentional before treating it as a gap.
- **Story:** not-warranted

### `mos-app/src/components/assistant/AssistantWidgetSlot.tsx`
- **Existence:** earns-place — Single consumer (AssistantPanel.tsx transcript, item.widget branch), and it is the best-executed file of the four: it does NOT reinvent table/KPI/chart rendering — it delegates directly to the canonical DataTable, KPITile, and ChartFrame components already used on /dashboard (confirmed imports at lines 1-3). This is exactly the intended seam where agent-produced structured data enters the existing dashboard grammar rather than spawning a parallel one.
- **Design:** minor-polish
- **Grammar:** drift — formatCell's boolean branch (line 9: `value ? 'Yes' : 'No'`) is a literal, un-i18n'd string — a confirmed violation of PRODUCT.md's binding Accessibility & Inclusion rule ('user-facing strings should route through the i18n seam from new work onward'); every other string in this file set (AssistantPanel, ApprovalChip, etc.) correctly routes through useT(), so this is a local, fixable miss, not systemic. (DataTable's own default emptyLabel 'No rows to show.' passed in at line 29 is also hardcoded English, but that default lives in data-table.tsx itself — pre-existing/systemic, out of this file's scope to fix alone.) DataChartWidgetView's hand-rolled bar-chart SVG (lines 45-120, manual rect/text math) is consistent with ChartFrame's own documented contract ('frame-agnostic — never knows the series', chart-frame.tsx:2-3 — every consumer supplies its own body), so this is not a duplicate-primitive violation; it is simply a thin v1 scope (single-series only, no legend, no color-by-series) appropriate for ad hoc agent charts, not a grammar break.
- **Story:** not-warranted

### `mos-app/src/components/follow-ups/follow-up-record-adapter.tsx`
- **Existence:** earns-place — Sole adapter translating the real Follow-up model (mos.follow_ups + lifecycle events) into the shared RecordViewerAdapter contract. Grep confirms its only non-test consumer is follow-up-record-host.tsx, and its own header comment states it deliberately mirrors createTaskRecordAdapter / createSignalRecordAdapter — verified those sibling files exist at src/components/tasks/task-record-adapter.tsx and src/components/signals/signal-record-adapter.tsx with the same factory-function shape. Not a duplicate of either: it encodes Follow-up-specific truth (counterparty/invoice/running-balance/PIC/lifecycle events) that a Task or Signal adapter cannot express.
- **Design:** highest-quality
- **Grammar:** conformant — Field-for-field match to DESIGN.md's RecordViewer contract table: Identity (title/typeLabel/eyebrow), ordered metadata sections (commitment/money/owner), activity (mapped from lifecycle events with human labels), honest permission (`readOnly: true` with a stated reason distinguishing closed-vs-open, no fake edit affordance), and content via a plain allow-listed `<p>` renderer for notes rather than inventing a universal JSON block renderer (explicitly the thing DESIGN.md says not to build yet). Also honors CONTEXT.md's binding vocabulary rule: exposes 'Person in charge (PIC)', never the raw `assigned_to` column name or any RACI noun.
- **Story:** not-warranted

### `mos-app/src/components/follow-ups/follow-up-record-host.tsx`
- **Existence:** earns-place — The fetch/state layer behind the canonical Follow-up record door. Grep confirms live non-test consumers at src/pages/follow-ups-page.tsx (mode='panel', opened from the shared overlay host) and src/pages/follow-up-record-page.tsx (mode='page', the direct-URL /work/follow-ups/:id destination) — exactly the panel/page duality DESIGN.md's RecordViewer contract requires ('The same anatomy works in panel mode and full-page mode'). Reading signal-record-host.tsx confirms this is a deliberate, faithful port of the established Task/Signal record-host pattern, not a bespoke one-off.
- **Design:** highest-quality
- **Grammar:** conformant — Matches the Task/Signal record-host pattern exactly: `mode: 'panel' | 'page'` prop, state-kit primitives (LoadingShell/ErrorState) for every non-ready state with a working `onRetry`, a cancellation-guarded async load (`let cancelled = false`) that avoids race conditions on rapid id changes, and chrome-free delegation to the shared RecordViewer + host slot per its own header comment ('Chrome... is owned by the host slot, never here') — the literal wording of DESIGN.md's overlay-host ownership rule. One cosmetic nit not rising to a grammar violation: `headingLevel={mode === 'page' ? 2 : 2}` always evaluates to 2 regardless of branch — dead ternary, harmless leftover from a refactor, worth a one-line cleanup but not a design defect.
- **Story:** needed

### `mos-app/src/pages/home-page.tsx`
- **Existence:** flag-owner — Not a components/home/ file (it's the route-bound page under src/pages/), included here only because it is HomeStream's sole consumer and the evidence for HomeStream's existence verdict lives in it. Flagging rather than a components/home/ verdict: this file is itself a strong, well-commented composition (shared signal read split attention/ambient per A12, single-flight fetch guards with token invalidation, StrictMode-safe mount ref) and outside this sweep's stated scope (components/home/), so no independent verdict is rendered on it — noting only that its quality directly substantiates HomeStream's 'earns-place' call and that it is NOT itself a components/home/ fossil to sweep.
- **Design:** minor-polish
- **Grammar:** conformant
- **Story:** not-warranted

