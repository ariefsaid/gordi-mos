# Lane A+B brief — inbox fail-closed + route-seam shell wiring (single worker)

**Branch:** work in the existing `.claude/worktrees/v3-inbox-failclosed` worktree
(currently at `fef7054`; the Director will reset it to `v3-redesign` tip `c9122b3` first).
**Model:** `gpt-5.6-luna --thinking max` (cross-family builder here per owner routing — Luna
verified live; GLM Coding Plan quota is preserved for heavier slices).
**Scope is UI convergence → owner-fast-path loop:** implement → smoke (typecheck + changed-file
lint + focused tests) → render check → tighten goal-level tests → commit. Do NOT manufacture
exhaustive red tests first; the seams below are already understood.

## Read-first (cold start, in order)
1. `docs/agent-context.md` + `docs/reviews/v3-redesign-convergence-handoff-2026-07-21.md` (state + the
   owner-directed UI convergence loop + the Luna audit findings you are closing).
2. `docs/experience-contract.md` Rules 1–12, `docs/jtbd.md`, `docs/reference/twenty-ixd-patterns.md`.
3. `docs/interaction-contract.md` (overlay/navigation/focus/Back grammar — Rule-8-desktop 40–45% panel).
4. `mos-app/src/shell/overlay-host.tsx`, `mos-app/src/shell/record-panel-host.tsx`,
   `mos-app/src/components/inbox/inbox-record-door.tsx`, `mos-app/src/components/inbox/inbox-target.ts`,
   `mos-app/src/shell/top-bar.tsx`, `mos-app/src/lib/agent/runtime/AgentRuntimeContext.tsx`,
   `mos-app/src/components/follow-ups/follow-up-queue-table.tsx`,
   `mos-app/src/components/follow-ups/follow-up-record-host.tsx`.

## The four fixes (do all four; they share files)

### A1 (Critical) — `buildInboxTargetDeps` is decorative
File: `mos-app/src/components/inbox/inbox-record-door.tsx:110-139`. Currently returns
`canOpen/isSameOrg/recordExists = () => true`. The resolver at `inbox-target.ts:147-152` runs these
in fail-closed order, so the door never actually refuses. Wire real sourcing:
- `canOpen(type, ref)` → host `can()` capability check for the typed ref (look at how
  `require-capability.tsx` / `capabilities.ts` derive the viewer's capabilities; reuse, do not invent).
- `isSameOrg(ref)` → viewer org scope vs. the notification/record's org. The viewer comes from
  `useAuth`/`AuthContext`; the notification row already carries the org. Compare honestly.
- `recordExists(ref)` → the row is already loaded; return `false` when the target record is
  not-found or archived (look at the row's fields; if existence isn't on the row, source it from
  the typed fetch — but prefer the row to avoid a network hop).
- The `UnavailableReason` union + message keys already exist at `inbox-target.ts:59-76`. Use them;
  do not invent new reasons.
- **BDD goal:** an Inbox row for a record the viewer cannot open (wrong org / no capability /
  missing) shows the honest reason and does NOT navigate. Add production-deps tests at
  `inbox-record-door.test.tsx` (or `.ts`) for permission-denied / cross-org / missing-record.
  Goal-level, not proxy.

### B1 — Bell shell-slot has no 44% track
File: `mos-app/src/shell/top-bar.tsx:153-169` opens the Bell via `host.openRoot({...owner:'shell',
tenant:'quick', content:<InboxTriageConnected mode="quick"/>}, 'ephemeral')`. `OverlayHostSlot
owner="shell"` renders it into a bare `<aside className="drawer">` with NO width/position (the
`.drawer` class at `styles/drawer.css` only sets bg/border/shadow). The 44% track exists only in
`.record-split`. Give the shell-mounted panel the same desktop track as Task/Signal by **reusing the
existing `minmax(360px, 44%)` token** (Rule 11 — one width; do NOT invent a new width). Cleanest:
wrap the shell `OverlayHostSlot` content in a `.record-split`-equivalent grid (or add a
`.drawer-shell-split` modifier) so the Bell/quick panel sits in the right 44% track at desktop and
falls back to the existing sheet at <1100px.

### B2 — Deputy can coexist with a record panel (no mutual-exclusion guard)
File: `mos-app/src/lib/agent/runtime/AgentRuntimeContext.tsx:110-113` — `openPanel` is just
`captureOpener(); setOpen(true)`, never consulting the overlay host. Add a mutual-exclusion guard:
Deputy's `openPanel` reads `useOptionalOverlayHost().session` and closes (or bails with an honest
"close the record first" state) the record overlay first; symmetrically, `openRoot` for a
shell-owner entry closes the Deputy via the runtime API. Keep `OverlayHostSlot`'s
`top.entry.owner === owner` arbitration as the single source of truth (do not replace it with a
DOM-string check). Test the journey: open record → open Deputy → record closes (or Deputy bails);
reverse direction too.

### B3 — Inbox record door omits `pageTo`
File: `mos-app/src/components/inbox/inbox-record-door.tsx:117-128`. `pageTo` is computed at line 117
but OMITTED from the returned `OverlayEntryDraft`. Add it to the object literal. This routes the
Inbox open-full-page action through `OverlayHostSlot.onOpenPage` → `host.openPage(pageTo)`, which
runs the active frame's `leaveGuard` before navigating — matching Task
(`task-collection-adapter.tsx:742`) and Signal (`signal-collection-adapter.tsx:330`). Then REMOVE
(or demote to non-primary) the bespoke `InboxRecordDoor.openFull` button at lines 72-75 so there is
one door, not two.

### B4 — Follow-up queue row links direct to page (I1)
File: `mos-app/src/components/follow-ups/follow-up-queue-table.tsx:90-95` — the counterparty cell
renders `<Link to={"/work/follow-ups/"+row.id}>`. `FollowUpRecordHost`
(`follow-up-record-host.tsx:20-28`) already accepts `mode?: 'panel' | 'page'` (default `'panel'`).
Replace the row `<Link>` with the shared `openRoot`/`push` pattern (same as Bell at
`top-bar.tsx:159-169`) so the row opens the panel through the host; the canonical page stays
available via the host's `pageTo` chrome once B3-style wiring is added to the follow-up adapter.
This file is collision-clean (no other lane touches it).

## Verify (run inside `mos-app/`, serial — do NOT fan out)
1. `npm run typecheck` — exit 0.
2. `npx eslint <changed-files>` — exit 0 (changed files only is fine for the smoke).
3. `npm test -- --run --maxWorkers=1 --no-file-parallelism <your new/changed test files>` — green.
4. `git diff --check` — clean (no whitespace drift).
5. Do NOT start Supabase, do NOT run `db reset`, do NOT run the full suite. The Director renders.

## Commit
One coherent commit per fix is fine (A1, B1, B2, B3, B4 may group if tightly coupled). Use the
`fix(v3):` prefix. Trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. Push/merge
is the Director's — do not push.

## Report back
- The exact files + line ranges changed per fix.
- The test names proving each goal (goal-level, not proxy).
- Typecheck/lint/test output tail.
- Any deviation from this brief and why (do not silently choose).
