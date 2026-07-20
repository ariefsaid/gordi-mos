# V3 Issue 4 — Shared Overlay/Panel/Navigation Host Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` in an isolated, visible Codex task to implement this plan task-by-task. Do not use subagents for this issue. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Issue 4 of `docs/specs/v3-redesign.spec.md`: one overlay/panel/navigation grammar with one active panel host, a 40–45% right-side record panel from collections, an internal linked-record stack, canonical full-page/direct URL behavior, the Deputy in the same panel host, centered modal jobs, anchored menus, phone full-screen behavior, and tested Escape/Close/browser Back/internal Back/focus entry/focus return semantics.

**Architecture:** Add one shell-level `OverlayHostProvider` and `useOverlayHost` controller. The controller owns the active tenant, stack frames, router history markers, focus return targets, root replacement, internal push/pop, the no-double-panel invariant, and one domain-neutral asynchronous leave-guard transaction. `OverlayHostSlot` is the only route/shell mount allowed to render the stateless physical `RecordPanelHost`; collection slots remain inside their existing desktop split grid, while the shell slot hosts ephemeral/fixed tenants such as Deputy. `RecordPanelHost` owns panel chrome, desktop/intermediate/phone regime, panel sizing, scrim, focus boundary, and Back/Close controls. A separate `ModalShell` owns centered command/composer/confirm/form dialogs. `useMenuPopover` remains the anchored-menu behavior owner and never enters the record stack.

**Tech Stack:** React 19, TypeScript, React Router 7, existing Vitest/Testing Library, existing Playwright configuration in `mos-app/playwright.config.ts`, and the current CSS token system in `DESIGN.md`/`mos-app/src/index.css`. No new runtime dependency, database change, Supabase command, or route family is needed.

## Global Constraints

- This is **V3 Issue 4 only**. The plan is provisional until it is rebased and reviewed against the completed Issue 2 Storybook proof and Issue 3 page-family primitives/migration guards. The first implementation action after those issues land is the dependency revalidation in Task 1; do not silently preserve an obsolete pre-Issue-2 interface.
- Authority order is binding: owner decisions OD-REDESIGN-72 through OD-REDESIGN-79, current domain/ADR law, `docs/jtbd.md`, `docs/experience-contract.md`, `docs/interaction-contract.md`, `docs/reference/twenty-ixd-patterns.md`, `SALVAGE-INVENTORY.md`, E7/lost-good evidence, then existing implementation details. E7 supplies visual language; owner law supplies IA and IxD.
- Issue 4 may refactor the existing `RecordPanelHost`, Task/Signal route plumbing, Deputy shell tenant, command/composer/modal shells, and menu behavior. It must preserve typed Task, Signal, and Deputy content and must not create a universal record model.
- Issue 4 must **not** implement RecordViewer domain adapters, field primitives, or the Task adapter owned by Issue 5. It may pass existing `TaskSurface` and `SignalRecordHost` content through the generic host and may centralize only route/history metadata. It must not introduce `TaskRecordAdapter`, `SignalRecordAdapter`, field schemas, JSONB blocks, or a new RecordViewer data contract.
- Issue 4 must **not** implement Inbox integration owned by Issue 7: do not change `mos-app/src/pages/inbox-page.tsx`, `mos-app/src/components/inbox/InboxList.tsx`, `mos-app/src/hooks/useNotifications.ts`, `notificationRoute`, or the top-bar bell’s `/inbox` behavior. Issue 4 exposes and tests a generic `tenant: 'quick'` host seam with a synthetic entry only; Issue 7 supplies the real Inbox list, notification record push, read state, bell behavior, and phone `/inbox` door.
- The explicit Issue 4 brief moves the Deputy’s **shell-host cutover** into this issue so there is one physical panel host. Issue 7 remains responsible for Inbox-to-Deputy/contextual wiring and the Inbox quick door. `AgentRuntimeProvider`, transcript state, tool behavior, and Deputy content remain unchanged except for the wrapper needed to render them through the shared host.
- Keep `CommandMenu` centered because the owner/SALVAGE rule explicitly overrides the Twenty bottom-sheet pattern. Keep confirmation centered. Keep menus/pickers anchored to their triggers. A navigation drawer is a different interaction job: `MobileDrawer` remains the navigation surface and does not become a record-stack tenant; it may consume the shared focus boundary but must not render a second record host.
- Desktop behavior is checked at 1280×900 and uses an inline split at the existing `useIsSplitWidth` threshold of 1100px so the collection remains mounted. Intermediate behavior is checked at 1024×900 and uses a right sheet with scrim. Phone behavior is checked at 390×844 and uses a full-screen page-stack surface. The panel’s desktop grid track is 40–45% of the available content width, not 33vw and not a centered near-full record popup.
- At every regime: a panel has an accessible name; modal regimes have `role="dialog"` and `aria-modal="true"`; focus enters the first usable control or a labelled panel heading; Escape/Close returns one navigation level and focus; internal Back pops one frame; browser Back follows the same history marker; the root Close returns to the opener; and an unconnected opener falls back to the underlying page landmark.
- Every leave-like transition—explicit Close, Escape, internal Back, browser Back/Forward, root/current replacement, related-record push, and page promotion—passes through the active entry’s optional asynchronous `leaveGuard(intent)`. The host owns only the typed intent, one in-flight request, URL/history restoration, and an approval token consumed exactly once; it owns no dirty boolean, Deputy state, or confirmation copy. A tenant owns its draft decision and composes `ModalShell` for confirmation. A denied request leaves the entry and focus in place; an allowed request completes the original transition; an unguarded entry resolves immediately enough to remain synchronous-feeling.
- Modal precedence is one grammar: an open menu closes before a panel; a centered modal closes before a panel; the current panel then handles Escape. Do not add document-level Escape listeners to individual tenants that compete with the controller.
- No panel may mount another physical panel, drawer, or record editor inside itself. Related records use the controller’s stack. Explicit full-page escalation leaves the panel host and renders the canonical route with the same future viewer content.
- Preserve query state (`?view=`, `?q=`, `?retracted=`) through collection-to-panel, close, page escalation, Back, refresh, bookmark, and new-tab paths. A hard load of a panel-shaped URL resolves to the canonical full page; an in-app collection click remains panel mode.
- Apply the existing `DESIGN.md` tokens and current CSS architecture. Do not add a component library, new font, gradient, shadow family, motion family, or standalone mockup. Respect `*:focus-visible`, `--scrim`, `--z-popover`, `--z-drawer`, `--z-modal`, `--dur-med`, `--dur-slow`, 44×44px phone targets, and `prefers-reduced-motion`.
- Every production behavior change follows red → implementation → green. Each acceptance criterion has one owning test at the lowest sufficient layer. Changed-line coverage remains ≥80%; `npm run typecheck`, `npm run lint`, and the relevant Playwright slice must be green before the issue checkpoint.
- Do not touch Supabase, migrations, environment files, package manifests/lockfiles, staging/cloud data, push, merge, deploy, or unrelated dirty files. Future implementation commits use `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## Master 12-issue sequence check

| Issue | Binding owner from `docs/specs/v3-redesign.spec.md` §12 | This plan’s boundary |
|---:|---|---|
| 1 | Documentation truth reset, live inventory, and `DESIGN.md` reconciliation | Completed local foundation; not reimplemented here. |
| 2 | Storybook component/state/responsive matrix | Prerequisite; revalidated in Task 1, not implemented here. |
| 3 | Page-family primitives and migration guards | Prerequisite; consumed through final slots, not reimplemented here. |
| 4 | Shared overlay/panel/navigation host | This plan: controller, physical host, URL/history/focus, guard-capable leave seam with synthetic tenant proof, modal/menu grammar, Task/Signal host seams, and Deputy shell tenant. |
| 5 | RecordViewer contract, field primitives, and Task adapter | Explicitly deferred; exact next issue after this checkpoint. |
| 6 | RecordCollection/view engine and Tasks/Signals adapters | Explicitly deferred; Issue 4 supplies only host/history plumbing. |
| 7 | Inbox triage plus Deputy host integration | Real Inbox quick door, Deputy/Inbox domain dirty-state guard and copy, and contextual Inbox/Deputy wiring remain here; Issue 4 supplies only the generic host seam and synthetic proof plus the core Deputy shell-host cutover. |
| 8 | Café canonical-record integration and Team-context correction | Explicitly deferred; Issue 4 tests only generic host behavior. |
| 9 | Representative-slice rendered/driven owner gate and provisional IA ratification | Explicitly deferred; Issue 4’s rendered checks are issue verification, not the owner gate. |
| 10 | Structured-content schema ADR, storage/RLS, editor, and typed embeds | Explicitly deferred; no schema or Supabase work. |
| 11 | Remaining route migration by page/component family | Explicitly deferred; no broad route sweep. |
| 12 | Full cross-surface acceptance, stale-style removal, documentation closure, and owner walkthrough | Explicitly deferred; Task 11 updates only current canonical state, not final whole-app closure. |

## Current implementation audit and exact boundary

| Interaction job | Current source evidence | Issue 4 consolidation/migration | Explicitly deferred |
|---|---|---|---|
| Record panel shell | `mos-app/src/shell/record-panel-host.tsx`, `record-panel-host.test.tsx`, `record-panel-host.css`, `mos-app/src/styles/drawer.css`; Task and Signal already use the component, but desktop CSS is `clamp(360px, 33vw, 480px)`, focus is stored per mount, and split Escape behavior differs from the current I2 contract. | Keep `RecordPanelHost` as the one physical record-panel implementation; add controller-backed stack/Back/Close/focus hooks, the 40–45% grid track, intermediate sheet, phone full-screen, and one `data-overlay-host` oracle. | The host does not own record data, fetches, field rendering, or object-specific headers. |
| Tasks | `mos-app/src/components/tasks/task-drawer.tsx`, `mos-app/src/pages/tasks-layout.tsx`, `mos-app/src/components/tasks/task-page-mode.ts`, `mos-app/src/components/tasks/task-surface.tsx`, `mos-app/src/components/tasks/task-drawer-header.tsx`, `mos-app/src/components/tasks/tasks-workspace.tsx`, `mos-app/src/components/tasks/row-menu.tsx`; in-list route state is `{ taskSurface: 'panel' }`; direct/refresh detection is in `mos-app/src/components/tasks/task-page-mode.ts`. | Preserve `TaskSurface`/`TaskDrawerHeader` behavior, route `/work/tasks/:id`, `/work/tasks/new`, saved-view query, optimistic outlet callbacks, and current page-vs-panel distinction. Replace only route/history and host plumbing with the generic controller. Add stack metadata for future related records without creating an adapter. | Issue 5 owns the RecordViewer contract/field primitives/Task adapter. Issue 6 owns the eventual RecordCollection and Tasks adapter. |
| Signals | `mos-app/src/pages/signals-archive-page.tsx`, `mos-app/src/components/signals/signal-page-mode.ts`, `mos-app/src/components/signals/signal-record-host.tsx`; `?record=` opens the existing shared host and hard-load redirects to `/work/signals/:signalId`; `mos-app/src/shell/signal-composer-host.tsx` is a separate right-side sheet. | Keep `SignalRecordHost` content and current canonical page route. Route the existing panel through the controller and move the capture composer to the centered modal job so it no longer masquerades as a competing record drawer. | Issue 6 owns the RecordCollection/view engine and object adapter; Issue 4 does not redesign Signal fields, feed data, or query semantics. |
| Inbox | `mos-app/src/pages/inbox-page.tsx` navigates the bell target to `/inbox`; `InboxList.tsx` is a full-page list; `top-bar.tsx` owns `NotificationBell`; no quick panel exists. | Define `OverlayEntry.tenant = 'quick'`, the shell slot, history/focus contract, and synthetic quick-tenant controller tests so Issue 7 has a real seam. Do not wire the bell or notification data in this issue. | Issue 7 owns bell quick triage, notification record push, read-state reuse, `/inbox` full-page behavior, and AC-V3-006/AC-RPH-4/AC-RPH-6. |
| Deputy | `mos-app/src/components/assistant/AssistantPanel.tsx` owns its own fixed panel, scrim, phone trap, body scroll lock, and Escape; `AgentRuntimeContext.tsx` owns open/close/runtime state; `app-shell.tsx` mounts it separately. | Preserve `AgentRuntimeProvider`, transcript and content tests; extract the existing body into the shared host’s `tenant: 'deputy'` entry, using the same width/chrome/stack/focus contract and replacing the current panel wrapper. A top-bar Deputy open replaces the current root tenant; contextual future pushes are represented by the generic stack API. The entry may carry the generic `leaveGuard`, but Issue 4’s Deputy fixture stays clean and has no domain dirty state or copy. | Issue 7 owns Inbox/contextual Deputy journeys and wires Deputy/Inbox draft dirty state plus confirmation copy through the seam. No agent/data/runtime behavior changes. |
| Command launcher | `mos-app/src/components/command/command-menu.tsx`, `use-command-menu.ts`, `command-menu.css`; already centered with its own focus trap and return-focus path. | Compose the existing command content with `ModalShell` and keep centered geometry, Ctrl/Cmd+K, command activation, scrim, focus entry, Escape, and focus return. Remove duplicate shell-level Escape/focus logic only after the new modal tests are green. | No command catalog rewrite or new universal action. |
| Confirmation | `mos-app/src/components/ui/confirm-dialog.tsx` is the canonical centered confirm; `components/admin/confirm-dialog.tsx` re-exports it; `components/tasks/confirm-archive.tsx` composes it. `occurrence-assign-dialog.tsx` and `admin/create-person-dialog.tsx` still hand-roll non-confirm modals. | Keep `ConfirmDialog` API and presets; make it compose `ModalShell`. Migrate the two non-confirm dialogs to `ModalShell` without changing their data/mutation/reveal flows. | Do not turn a form or assignment dialog into a confirmation or a RecordViewer. |
| Menus/pickers | `mos-app/src/lib/use-menu-popover.ts` owns open focus, Arrow/Up/Home/End, Escape, outside-click; `row-menu.tsx`, `admin/user-table.tsx`, `user-chip.tsx`, and `admin/menu-position.ts` consume the behavior. | Keep `useMenuPopover` as the canonical behavior owner, normalize z-index/anchor/return-focus assertions, and remove any local competing keyboard/outside listeners found in those consumers. Menus remain anchored and outside the record stack. | Do not route menus through `OverlayHostProvider`, create a second menu engine, or redesign menu actions. |
| Navigation drawer | `mos-app/src/shell/mobile-drawer.tsx` is the “More” navigation sheet with its own focus trap and opener callback. | Leave the navigation job and route ownership intact; share only the tested focus-boundary helper if the extraction is mechanically safe. Assert it cannot create a second `data-overlay-host`. | No rail/bottom-nav IA change and no navigation drawer inside a record stack. |

## Target architecture and interfaces

The implementation must create one controller, one physical host per active session, and no domain-shaped controller types. The controller stores React content only at the presentation boundary; the router stores only a serializable marker.

Create `mos-app/src/shell/overlay-navigation.ts` with this exact public contract:

```ts
import type { Location, To } from 'react-router-dom'

export const OVERLAY_HISTORY_KEY = '__mosOverlay'

export type OverlayHistoryMode = 'route' | 'ephemeral'

export type OverlayOwner = 'shell' | 'tasks' | 'signals'

export type OverlayHistoryMarker = {
  sessionId: string
  depth: number
  entryKey: string
  mode: OverlayHistoryMode
  historyIndex: number
}

export type OverlayEntrySummary = {
  key: string
  owner: OverlayOwner
}

export type OverlayLeaveIntent =
  | {
      kind: 'close'
      via: 'explicit-close' | 'escape'
      from: OverlayEntrySummary
    }
  | {
      kind: 'back'
      via: 'internal-back'
      from: OverlayEntrySummary
      depth: number
    }
  | {
      kind: 'replace'
      via: 'push' | 'replace-root' | 'replace-current'
      from: OverlayEntrySummary
      to: OverlayEntrySummary
    }
  | {
      kind: 'open-page'
      via: 'open-page'
      from: OverlayEntrySummary
      to: To
    }
  | {
      kind: 'browser-pop'
      direction: 'back' | 'forward'
      from: OverlayHistoryMarker
      to: OverlayHistoryMarker | null
      delta: number
    }

export type OverlayLeaveDecision =
  | { decision: 'allow' }
  | { decision: 'deny' }

export type OverlayLeaveGuard = (
  intent: OverlayLeaveIntent,
) => Promise<OverlayLeaveDecision>

export type OverlayLeaveRequest = {
  id: string
  intent: OverlayLeaveIntent
}

export type OverlayTransitionResult = {
  status: 'committed' | 'denied'
}

export type RecordRouteAdapter = {
  toPanel: (recordId: string, source: Location) => To
  toPage: (recordId: string, source: Location) => To
  toCollection: (source: Location) => To
  readPanelId: (location: Location) => string | null
}

export function readOverlayMarker(state: unknown): OverlayHistoryMarker | null
export function withOverlayMarker(
  state: unknown,
  marker: OverlayHistoryMarker,
): Record<string, unknown>
export function preserveSearch(source: Location, target: To): To
export function historyDeltaForClose(depth: number): number
```

`readOverlayMarker` must validate `sessionId`, `entryKey`, `mode`, and non-negative integer `depth`/`historyIndex`; malformed router state is treated as no overlay. `withOverlayMarker` must preserve unrelated Router state keys. `historyDeltaForClose(0)` returns `-1`; `historyDeltaForClose(2)` returns `-3`, because explicit Close exits the entire root-plus-two-push history segment while internal Back uses one `-1` step. `RecordRouteAdapter` contains URL plumbing only; it must never accept a Task/Signal database row or viewer field map.

Create `mos-app/src/shell/overlay-host.tsx` with this exact controller shape:

```tsx
import type { ReactNode } from 'react'
import type { To } from 'react-router-dom'
import type {
  OverlayLeaveGuard,
  OverlayLeaveRequest,
  OverlayOwner,
  OverlayTransitionResult,
} from './overlay-navigation'

export type OverlayTenant = 'record' | 'deputy' | 'quick'

export type OverlayHistoryDriver = {
  index: () => number | null
  go: (delta: number) => void
}

export type OverlayEntry = {
  key: string
  owner: OverlayOwner
  tenant: OverlayTenant
  label: string
  title?: ReactNode
  pageTo?: To
  content: ReactNode
  leaveGuard?: OverlayLeaveGuard
}

export type OverlayFrame = {
  entry: OverlayEntry
  returnFocus: HTMLElement | null
}

export type OverlaySession = {
  id: string
  mode: 'route' | 'ephemeral'
  frames: readonly OverlayFrame[]
}

export type OverlayHostApi = {
  session: OverlaySession | null
  pendingLeave: OverlayLeaveRequest | null
  openRoot: (
    entry: OverlayEntry,
    mode: OverlaySession['mode'],
  ) => Promise<OverlayTransitionResult>
  replaceRoot: (entry: OverlayEntry) => Promise<OverlayTransitionResult>
  push: (entry: OverlayEntry) => Promise<OverlayTransitionResult>
  replaceCurrent: (entry: OverlayEntry) => Promise<OverlayTransitionResult>
  back: () => Promise<OverlayTransitionResult>
  close: (
    via?: 'explicit-close' | 'escape',
  ) => Promise<OverlayTransitionResult>
  openPage: (to: To) => Promise<OverlayTransitionResult>
}

export function OverlayHostProvider({
  children,
  historyDriver,
}: {
  children: ReactNode
  historyDriver?: OverlayHistoryDriver
}): JSX.Element
export function useOverlayHost(): OverlayHostApi
export function OverlayHostSlot({ owner }: { owner: OverlayOwner }): JSX.Element | null
```

Rules for this API are fixed:

1. `openRoot` captures `document.activeElement`, creates depth 0, and pushes a router marker unless the caller is already in the same owned route. If a session is already active, it uses the guarded `replace-root` transition. `replaceRoot` replaces the current tenant and clears its frames without creating a second host. A top-bar Deputy open therefore replaces a record/quick tenant; a related record uses the guarded `push` transition.
2. `push` captures the current active element as the previous frame’s `returnFocus`, rejects a duplicate key by popping to the existing frame, and pushes one serializable marker. Leaving the current frame for that push still uses `OverlayLeaveIntent.kind === 'replace'` with `via: 'push'`. The physical DOM remains one `RecordPanelHost`.
3. `back` pops exactly one frame; at depth 0 it closes the root. Browser Back/Forward is observed through React Router location/state synchronization and produces the same guarded transition. Forward restores a known in-memory frame; a hard reload never restores an ephemeral panel and is resolved by the route’s direct-page rule.
4. `close('explicit-close')` and `close('escape')` both use `OverlayLeaveIntent.kind === 'close'`; `back` uses `kind === 'back'`; root/current replacement and related-record push use `kind === 'replace'`; and `openPage` uses `kind === 'open-page'`. Every one awaits the active entry’s optional `leaveGuard`. A missing guard commits immediately and returns `{ status: 'committed' }`; a denied guard returns `{ status: 'denied' }` without removing content or moving focus. `openPage` navigates to `pageTo` with `taskSurface: 'page'` only for the existing Task route seam; the generic host does not know that field and must receive it through the route adapter.
5. `OverlayHostSlot` is the only component that renders `RecordPanelHost` and adds `data-overlay-host="true"`, `data-overlay-owner`, and `data-overlay-entry`. It renders only when `session.frames.at(-1)?.entry.owner === owner`; therefore the Tasks slot and shell slot can both exist in the tree while only one physical host is in the DOM. It passes `pendingLeave !== null` as `transitionPending` so chrome controls cannot start a second visual transition while the original confirmation is pending.
6. `pendingLeave` is one request per host session. While it is non-null, every repeated Close/Escape/Back/replace/open-page action returns the same in-flight Promise and does not call the guard or commit a second transition. The request is cleared after allow or deny; guard rejection is treated as deny and leaves the current frame mounted.
7. On an allowed transition, the controller creates a private approval token bound to the request id and transition signature. The synchronous commit consumes it before cleanup; a resulting router POP consumes the matching token on the next marker synchronization. No public `force` API exists. This is the one forced-cleanup bypass after a confirmed leave, and the token is cleared immediately after its single consumption, so a later independent transition invokes the guard again.
8. Browser POP is restored before the asynchronous guard runs: read the current and target `historyIndex`, call `history.go(-delta)` under a private restoration flag, then call the same `requestLeave` with `kind === 'browser-pop'`. Deny leaves the pre-pop URL and marker in place. Allow calls `history.go(delta)` with the one-use approval token; the matching POP applies the original target and cannot invoke the guard again. If the browser index is unavailable, replace the current location/state with the saved marker before checking the guard; tests must assert URL and marker restoration in both driver paths.
9. The active tenant owns the confirmation. Its `leaveGuard` may set tenant-local state and return a Promise that resolves when its shared `ModalShell` resolves `{ decision: 'allow' | 'deny' }`; the generic host never reads a Deputy dirty boolean and never supplies domain confirmation copy. Denial leaves focus in the draft or tenant-owned confirmation; allow uses the existing frame/root return-focus path. Clean tenants do not provide `leaveGuard`, so event handlers remain synchronous-feeling.
10. The controller handles panel navigation only. Centered modals and anchored menus use their own job primitives but share the same focus/ordering rules. A modal takes precedence over panel Escape; a menu takes precedence over both.

Extend `RecordPanelHostProps` in `mos-app/src/shell/record-panel-host.tsx` with the following exact additions while preserving existing optional `title` compatibility for the Task surface during migration:

```ts
export type RecordPanelHostProps = {
  label: string
  onClose: (via?: 'explicit-close' | 'escape') => void
  children: ReactNode
  expanded?: boolean
  focusKey?: string
  title?: ReactNode
  onOpenPage?: () => void
  onBack?: () => void
  canGoBack?: boolean
  rootClassName?: string
  owner?: OverlayOwner
  entryKey?: string
  transitionPending?: boolean
}
```

When `canGoBack` is true, the host renders one 44px-capable Back control in the host chrome/stack bar. The host Close control always closes the current session, not merely the visible frame. Desktop split is non-modal for pointer interaction but still handles Escape through the shared controller; this is the deliberate V3 correction to the current split test and the old “non-modal does not Escape-close” behavior.

Create `mos-app/src/components/ui/modal-shell.tsx` with this exact centered-modal contract:

```tsx
import type { ReactNode } from 'react'

export type ModalShellProps = {
  open: boolean
  onClose: () => void
  children: ReactNode
  ariaLabel?: string
  ariaLabelledBy?: string
  ariaDescribedBy?: string
  role?: 'dialog' | 'alertdialog'
  closeOnBackdrop?: boolean
  closeOnEscape?: boolean
  surface?: 'centered' | 'sheet'
  phoneMode?: 'centered' | 'fullscreen'
}
```

`ModalShell` owns the shared scrim, modal z-index, focus entry, Tab trap, Escape, backdrop policy, return focus, `aria-*` wiring, body-scroll lock for phone full-screen mode, reduced-motion handling, and an explicit 16px phone gutter for centered surfaces. `ConfirmDialog`, `CommandMenu`, `SignalComposerHost`, `OccurrenceAssignDialog`, and `CreatePersonDialog` compose it; none may retain a second document Escape/focus-trap implementation after migration.

The synthetic tenant proof must demonstrate the ownership boundary with a real tenant-local Promise and the shared shell. This is the shape Issue 4 tests; Issue 7 later supplies Deputy/Inbox draft state and product copy without changing the host API:

```tsx
import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ModalShell } from '../components/ui/modal-shell'
import { useOverlayHost } from './overlay-host'
import type { OverlayEntry } from './overlay-host'
import type {
  OverlayLeaveDecision,
  OverlayLeaveIntent,
} from './overlay-navigation'

type PendingDraftLeave = {
  intent: OverlayLeaveIntent
  resolve: (decision: OverlayLeaveDecision) => void
}

function useSyntheticGuardEntry(): OverlayEntry {
  const [pending, setPending] = useState<PendingDraftLeave | null>(null)
  const leaveGuard = useCallback(
    (intent: OverlayLeaveIntent) =>
      new Promise<OverlayLeaveDecision>((resolve) => {
        setPending({ intent, resolve })
      }),
    [],
  )

  const content: ReactNode = (
    <>
      <div data-testid="synthetic-draft">Uncommitted draft</div>
      <ModalShell
        open={pending !== null}
        role="alertdialog"
        ariaLabel="Leave draft confirmation"
        onClose={() => {
          pending?.resolve({ decision: 'deny' })
          setPending(null)
        }}
      >
        <p>Leave this draft?</p>
        <button
          type="button"
          onClick={() => {
            pending?.resolve({ decision: 'deny' })
            setPending(null)
          }}
        >
          Stay
        </button>
        <button
          type="button"
          onClick={() => {
            pending?.resolve({ decision: 'allow' })
            setPending(null)
          }}
        >
          Leave
        </button>
      </ModalShell>
    </>
  )

  return useMemo(
    () => ({
      key: 'synthetic:draft',
      owner: 'shell',
      tenant: 'quick',
      label: 'Synthetic draft',
      content,
      leaveGuard,
    }),
    [content, leaveGuard],
  )
}

function SyntheticGuardLauncher() {
  const entry = useSyntheticGuardEntry()
  const api = useOverlayHost()
  return (
    <button type="button" onClick={() => void api.openRoot(entry, 'ephemeral')}>
      Open synthetic draft
    </button>
  )
}
```

The snippet intentionally shows no host-level `isDirty` field and no Deputy/Inbox copy. In the real fixture, the tenant-local callback and `ModalShell` live together inside the entry content. The host awaits the Promise, ignores repeat intents while `pendingLeave` is set, and never renders or controls the confirmation itself.

## Acceptance and ownership matrix

| Contract | Owning proof in Issue 4 | Boundary |
|---|---|---|
| `AC-RPH-1` / current Task host contract | `mos-app/src/shell/record-panel-host.test.tsx` plus existing `mos-app/src/components/tasks/task-drawer.test.tsx`/`mos-app/src/pages/tasks-layout.test.tsx`; one split Escape expectation changes deliberately to the V3 I2 rule | Task content remains unchanged; no RecordViewer adapter |
| `AC-RPH-2` / Signal shell parity | `mos-app/src/pages/signals-archive-page.test.tsx` and host computed-style assertions in `mos-app/e2e/v3-overlay-host.spec.ts` | Signal data/content remains unchanged |
| `AC-RPH-3` / Signal panel vs canonical page | `mos-app/src/pages/signals-archive-page.test.tsx`, `mos-app/src/components/signals/signal-page-mode.test.ts`, and the focused Playwright route test | Issue 6 still owns collection/adapter work |
| `AC-RPH-5` / one active tenant | `mos-app/src/shell/overlay-host.test.tsx` with record → Deputy → record replacement and `data-overlay-host` count | Synthetic quick tenant only; no Inbox integration |
| `AC-RPH-7` / asynchronous leave guard | `mos-app/src/shell/overlay-host.test.tsx`, `overlay-navigation.test.ts`, `record-panel-host.test.tsx`, and the router/focus matrix in Task 3A; clean, denied, allowed, repeated, and browser POP paths | Issue 4 owns only the domain-neutral seam and synthetic tenant proof; Issue 7 wires Deputy/Inbox dirty state and copy |
| `AC-V3-002` / same panel grammar | host unit matrix for Task/Signal/Deputy entry metadata plus Task/Signal Playwright journeys | Café is revalidated by Issue 8 |
| `AC-V3-003` / no overlapping side panels | controller unit and desktop/intermediate Playwright assertions that exactly one host/scrim exists | No nested physical drawer/editor |
| `AC-V3-013` / consecutive manager triage | Task Playwright open → internal fake stack/back contract and real consecutive collection opens | Full RecordCollection filtering/presentation is Issue 6 |
| `I1`, `I2`, `I3`, `I4`, `I7` | `mos-app/src/shell/record-panel-host.test.tsx`, `mos-app/src/components/ui/modal-shell.test.tsx`, `mos-app/src/shell/overlay-host.test.tsx`, menu consumer tests, existing command e2e | `I9` Inbox bell remains Issue 7 |
| `NFR-V3-001` | semantic role/name, keyboard, focus, modal boundary, contrast/token and 44px assertions | WCAG review is still required at the issue gate |
| `NFR-V3-003` | `npm run test:coverage` with changed-file coverage ≥80% | No coverage inflation with snapshot-only tests |
| `NFR-V3-004` | `npm run typecheck` and `npm run lint` | Both run inside `mos-app/` |
| `NFR-V3-005` / `NFR-V3-006` | Playwright 1280/1024/390 rendered suite; no-overflow/touch-target/computed-width checks | Screenshots are review evidence, not the sole oracle |
| `NFR-V3-007` | static search and one-host DOM invariant; duplicate wrappers removed in the same issue | Existing typed content is ported, not duplicated |
| `NFR-V3-009` | command audit and final diff; no Supabase/staging action | Local ephemeral e2e only when implementation begins |

`AC-V3-006`, `AC-RPH-4`, and `AC-RPH-6` are explicitly **not claimed by Issue 4**. The final ledger must say that the generic quick-tenant seam is verified while the real Inbox bell/triage flow remains Issue 7.

---

## Implementation tasks

### Task 1: Rebase and revalidate the Issue 2–3 dependency contract (2–5 minutes per step)

**Files:** read-only `docs/agent-context.md`, `docs/reviews/v3-redesign.md`, the completed Issue 2/3 review/plan files, `mos-app/src/shell/page-frame.tsx`, `page-head.tsx`, and the actual current branch tip.

- [ ] **Step 1 (2 min):** Confirm the implementation worktree is rebased onto the completed Issue 2 and Issue 3 commits and contains no unrelated changes.

  ```sh
  git status --short --branch
  git log --oneline --decorate -20
  git diff --name-only
  ```

  Expected result: the worktree is on the approved V3 implementation base, the diff is either empty or contains only Issue 4 files, and no package/Supabase file is present.

- [ ] **Step 2 (3 min):** Read the completed Issue 2/3 evidence and confirm the host may use the final page-family slot without reintroducing a local frame/head.

  ```sh
  rg -n "Issue 2|Issue 3|PageFrame|PageHead|overlay|host|revalidation" docs/agent-context.md docs/reviews/v3-redesign.md docs/reviews docs/plans
  sed -n '1,220p' mos-app/src/shell/page-frame.tsx
  sed -n '1,220p' mos-app/src/shell/page-head.tsx
  ```

- [ ] **Step 3 (3 min):** Run the dependency-level tests before touching Issue 4 source.

  ```sh
  cd mos-app
  npm test -- src/shell/page-frame.test.tsx src/shell/page-head.test.tsx src/shell/app-shell.test.tsx
  npm run typecheck
  cd ..
  ```

  Do not begin Task 2 if the completed Issue 2/3 contract has changed the named slot or route boundary; record the exact changed interface in the Issue 4 review ledger before proceeding.

### Task 2: Lock the serializable history and route contract with red tests (2–5 minutes per step)

**Files:** create `mos-app/src/shell/overlay-navigation.test.ts`, then create `mos-app/src/shell/overlay-navigation.ts`.

- [ ] **Step 1 (3 min):** Add the failing tests before the implementation import can resolve. Tag every test title with its owning behavior.

  ```ts
  import { describe, expect, it } from 'vitest'
  import {
    historyDeltaForClose,
    readOverlayMarker,
    withOverlayMarker,
  } from './overlay-navigation'

  describe('overlay navigation markers', () => {
    it('AC-V3-003: rejects malformed router state instead of opening a host', () => {
      expect(readOverlayMarker({ __mosOverlay: { depth: -1 } })).toBeNull()
      expect(readOverlayMarker({ __mosOverlay: { depth: 0, mode: 'route' } })).toBeNull()
    })

    it('AC-V3-003: preserves unrelated router state while adding a marker', () => {
      expect(withOverlayMarker({ taskSurface: 'panel' }, {
        sessionId: 'session-1', depth: 0, entryKey: 'task:1', mode: 'route', historyIndex: 12,
      })).toEqual({
        taskSurface: 'panel',
        __mosOverlay: {
          sessionId: 'session-1',
          depth: 0,
          entryKey: 'task:1',
          mode: 'route',
          historyIndex: 12,
        },
      })
    })

    it('AC-RPH-7: rejects a marker without a browser history index', () => {
      expect(readOverlayMarker({
        __mosOverlay: {
          sessionId: 'session-1', depth: 0, entryKey: 'task:1', mode: 'route',
        },
      })).toBeNull()
      expect(readOverlayMarker({
        __mosOverlay: {
          sessionId: 'session-1', depth: 0, entryKey: 'task:1', mode: 'route', historyIndex: -1,
        },
      })).toBeNull()
    })

    it('I2: closes a root and all internal frames with one deterministic delta', () => {
      expect(historyDeltaForClose(0)).toBe(-1)
      expect(historyDeltaForClose(2)).toBe(-3)
    })
  })
  ```

  Run the red test from `mos-app/`:

  ```sh
  npm test -- src/shell/overlay-navigation.test.ts
  ```

- [ ] **Step 2 (4 min):** Implement the exact `OverlayHistoryMarker`, `RecordRouteAdapter`, marker validation, state-preserving helper, and close-delta functions from the interface section. Validate `historyIndex` as a non-negative integer and write it from the active browser history entry when creating a marker. Do not put React nodes, database rows, dirty booleans, confirmation copy, or domain field names into router state.

- [ ] **Step 3 (3 min):** Add route-plumbing tests for Task and Signal adapter shapes in the same test file: Task panel/page/collection preserves `?view=mine`; Signal panel preserves `?q=loss&retracted=1` while setting/removing only `record`; no adapter accepts an object row. Add the exact browser-index fixture used by the POP tests: the current marker has index `12`, a Back target has index `11`, and a Forward target has index `13`.

  ```sh
  npm test -- src/shell/overlay-navigation.test.ts src/components/tasks/task-page-mode.test.ts src/components/signals/signal-page-mode.test.ts
  ```

### Task 3: Lock the one-session controller and slot invariant with red tests (2–5 minutes per step)

**Files:** create `mos-app/src/shell/overlay-host.test.tsx`, then create `mos-app/src/shell/overlay-host.tsx`.

- [ ] **Step 1 (4 min):** Write a MemoryRouter test harness with a focused opener, two collection slots, and fake record/Deputy/quick entries. Assert one host only, not visual snapshots.

  ```tsx
  function TestSurface({ owner, label }: { owner: OverlayOwner; label: string }) {
    return (
      <OverlayHostSlot owner={owner}>
        <button type="button">{label} control</button>
      </OverlayHostSlot>
    )
  }
  ```

  The red tests must cover:

  ```text
  AC-V3-003: opening a Deputy root while a Task root is open leaves one data-overlay-host and one active frame.
  AC-V3-003: push(record:2) creates two logical frames but one physical host; pushing record:1 again pops to record:1.
  I2: internal Back pops exactly one frame; root Close returns to the underlying route.
  I2: focus enters the first control, returns to the link that opened the frame, then returns to the original opener on root close.
  AC-V3-003: a shell slot and a collection slot mounted together never render two physical hosts.
  ```

  ```sh
  npm test -- src/shell/overlay-host.test.tsx
  ```

- [ ] **Step 2 (5 min):** Implement `OverlayHostProvider`, `useOverlayHost`, and `OverlayHostSlot` with the exact interfaces above. Mount one provider from `AppShell`; use React Router `useLocation`/`useNavigate` and marker synchronization rather than a separate `window.popstate` state machine. Keep the optional `OverlayHistoryDriver` injectable only for deterministic router tests; the production default reads `window.history.state?.idx` and calls `window.history.go`.

- [ ] **Step 3 (4 min):** Add router synchronization tests for clean browser-style POP: a marker at depth 1 renders the previous frame, a marker-free location closes the host, and a forward marker restores a known frame. A marker from a different session is ignored and cannot steal the active host. Leave the dirty POP deny/allow and restoration assertions to Task 3A so the async contract has one owning matrix.

- [ ] **Step 4 (3 min):** Add the controller’s explicit `replaceRoot` behavior and verify that opening Deputy from the top bar replaces the record tenant without a second scrim/panel. Route the replacement through the guard-capable seam when a current entry supplies `leaveGuard`; keep contextual future Deputy push semantics available through `push`; do not add Inbox or notification code.

### Task 3A: Add the domain-neutral asynchronous leave guard and POP transaction (2–5 minutes per step)

**Files:** modify only `mos-app/src/shell/overlay-navigation.ts`, `mos-app/src/shell/overlay-navigation.test.ts`, `mos-app/src/shell/overlay-host.tsx`, `mos-app/src/shell/overlay-host.test.tsx`, `mos-app/src/shell/record-panel-host.tsx`, and `mos-app/src/shell/record-panel-host.test.tsx`. Do not add Deputy, Inbox, notification, schema, or source-domain dirty-state code.

- [ ] **Step 1 (5 min):** Add red tests for the exact public types and transition matrix before implementing the state machine. Use one `dirtyEntry` with a deferred `leaveGuard` Promise and assert the received intent for each action: `close('explicit-close')` → `{ kind: 'close', via: 'explicit-close' }`, Escape → `{ kind: 'close', via: 'escape' }`, internal Back → `{ kind: 'back', via: 'internal-back' }`, `replaceRoot` → `{ kind: 'replace', via: 'replace-root' }`, `replaceCurrent` → `{ kind: 'replace', via: 'replace-current' }`, `push` → `{ kind: 'replace', via: 'push' }`, and `openPage` → `{ kind: 'open-page', via: 'open-page' }`. Assert every `from`/`to` summary is `{ key, owner }` only and no React node, dirty flag, domain row, or confirmation copy appears in the intent.

  ```tsx
  import { act, render, screen, waitFor } from '@testing-library/react'
  import { MemoryRouter } from 'react-router-dom'
  import { describe, expect, it, vi } from 'vitest'
  import {
    OverlayHostProvider,
    OverlayHostSlot,
    useOverlayHost,
    type OverlayEntry,
    type OverlayHostApi,
  } from './overlay-host'
  import type {
    OverlayLeaveDecision,
    OverlayLeaveGuard,
  } from './overlay-navigation'

  function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((next) => {
      resolve = next
    })
    return { promise, resolve }
  }

  function ApiProbe({ onReady }: { onReady: (api: OverlayHostApi) => void }) {
    onReady(useOverlayHost())
    return <OverlayHostSlot owner="shell" />
  }

  const nextEntry: OverlayEntry = {
    key: 'synthetic:next',
    owner: 'shell',
    tenant: 'record',
    label: 'Next record',
    content: <button type="button">Next control</button>,
  }

  describe('leave guard transaction', () => {
    it('AC-RPH-7: coalesces every repeated leave action into one pending guard', async () => {
      const decision = deferred<OverlayLeaveDecision>()
      const leaveGuard: OverlayLeaveGuard = vi.fn(() => decision.promise)
      const dirtyEntry: OverlayEntry = {
        key: 'synthetic:draft',
        owner: 'shell',
        tenant: 'quick',
        label: 'Synthetic draft',
        content: <button type="button">Draft control</button>,
        leaveGuard,
      }
      let api!: OverlayHostApi

      render(
        <MemoryRouter initialEntries={['/work/tasks']}>
          <OverlayHostProvider>
            <ApiProbe onReady={(value) => { api = value }} />
          </OverlayHostProvider>
        </MemoryRouter>,
      )

      await act(() => api.openRoot(dirtyEntry, 'ephemeral'))
      const closePromise = api.close('explicit-close')
      await waitFor(() => expect(api.pendingLeave?.intent.kind).toBe('close'))
      void api.close('escape')
      void api.back()
      void api.replaceRoot(nextEntry)
      void api.replaceCurrent(nextEntry)
      void api.push(nextEntry)
      void api.openPage('/work/tasks/1')
      expect(leaveGuard).toHaveBeenCalledTimes(1)
      expect(api.pendingLeave?.intent).toMatchObject({
        kind: 'close',
        via: 'explicit-close',
        from: { key: 'synthetic:draft', owner: 'shell' },
      })

      decision.resolve({ decision: 'deny' })
      await expect(closePromise).resolves.toEqual({ status: 'denied' })
      expect(screen.getByRole('button', { name: 'Draft control' })).toBeInTheDocument()
      expect(api.session?.frames.at(-1)?.entry.key).toBe('synthetic:draft')
    })
  })
  ```

  Run the red unit slice from `mos-app/`:

  ```sh
  npm test -- src/shell/overlay-navigation.test.ts src/shell/overlay-host.test.tsx src/shell/record-panel-host.test.tsx
  ```

- [ ] **Step 2 (5 min):** Implement `requestLeave(intent, commit)` as the only path into a leave-like transition. If the active entry has no `leaveGuard`, call `commit` immediately and resolve `{ status: 'committed' }`. Otherwise create one `{ id, intent }`, store the in-flight Promise in `pendingLeave`, and return that same Promise to duplicate callers. Await the typed `{ decision: 'allow' | 'deny' }`; treat a rejected guard as deny, clear the request, and never unmount or focus another surface on denial. Pass `transitionPending` to `RecordPanelHost` and make its Close, Escape, Back, and Open controls call the same API rather than local cleanup.

- [ ] **Step 3 (5 min):** Add the approval/bypass red→green tests and implementation. An allowed request must commit the requested transition and invoke `leaveGuard` exactly once. The controller may use only a private `{ requestId, signature }` approval token: synchronous cleanup consumes it before applying the transition; a matching router POP consumes it on the next marker sync. A second Close/Back/replace after the token is consumed must start a new guard request. Assert a confirmed root Close, internal Back, replacement, and page promotion each bypass cleanup once—not zero times (which re-prompts) and not twice (which permits a later transition to skip the guard).

- [ ] **Step 4 (5 min):** Add router tests for both browser directions with the injected `OverlayHistoryDriver`. Simulate a dirty overlay at marker index `12`, a Back POP to index `11`, and a Forward POP to index `13`. On POP, immediately call `go(-delta)` under a restoration flag, keep the original entry mounted, then invoke the same guard with `{ kind: 'browser-pop', direction, from, to, delta }`. Deny must leave the original URL and `__mosOverlay` marker at index `12`; allow must call `go(delta)` once, apply the target marker/frame, and consume the approval token without a second guard call. Repeat a POP while `pendingLeave` is non-null and assert no second guard or transition is started. Include the no-index fallback: replace the current location with the saved URL/state before checking the guard and assert the same marker restoration on deny.

  ```ts
  import { RouterProvider, createMemoryRouter } from 'react-router-dom'
  import { readOverlayMarker } from './overlay-navigation'

  it('AC-RPH-7/I2: restores a denied browser Back marker and URL', async () => {
    const historyDriver = {
      index: vi.fn().mockReturnValueOnce(12).mockReturnValue(11),
      go: vi.fn(),
    }
    const decision = deferred<OverlayLeaveDecision>()
    const leaveGuard: OverlayLeaveGuard = vi.fn(() => decision.promise)
    const dirtyEntry: OverlayEntry = {
      key: 'synthetic:draft',
      owner: 'shell',
      tenant: 'quick',
      label: 'Synthetic draft',
      content: <button type="button">Draft control</button>,
      leaveGuard,
    }
    let api!: OverlayHostApi
    const router = createMemoryRouter([
      {
        path: '*',
        element: (
          <OverlayHostProvider historyDriver={historyDriver}>
            <ApiProbe onReady={(value) => { api = value }} />
          </OverlayHostProvider>
        ),
      },
    ], {
      initialEntries: ['/work/tasks', '/work/tasks?record=synthetic:draft'],
      initialIndex: 1,
    })

    render(<RouterProvider router={router} />)
    await act(() => api.openRoot(dirtyEntry, 'route'))
    const sessionId = api.session?.id
    if (!sessionId) throw new Error('overlay session did not open')
    await act(() => router.navigate(-1))
    await waitFor(() => expect(historyDriver.go).toHaveBeenCalledWith(1))
    await act(() => router.navigate('/work/tasks?record=synthetic:draft', {
      replace: true,
      state: {
        __mosOverlay: {
          sessionId, depth: 0, entryKey: 'synthetic:draft', mode: 'route', historyIndex: 12,
        },
      },
    }))
    expect(leaveGuard).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'browser-pop', direction: 'back', delta: -1,
    }))
    decision.resolve({ decision: 'deny' })
    await waitFor(() => expect(readOverlayMarker(router.state.location.state)?.historyIndex).toBe(12))
    expect(router.state.location.pathname + router.state.location.search).toBe('/work/tasks?record=synthetic:draft')
    expect(leaveGuard).toHaveBeenCalledTimes(1)
  })
  ```

- [ ] **Step 5 (4 min):** Add focus red→green tests for denial and approval. After the guard opens its tenant-owned confirmation, focus must remain inside the draft/confirmation when the decision is denied; the host must not run frame/root focus return. After approval, the existing `RecordPanelHost` path returns focus to the previous frame opener or root opener exactly once. Check explicit Close, Escape, internal Back, browser Back/Forward, replacement, and page promotion through the same matrix at unit/router level; the responsive Playwright suite owns the visible 1280/1024/390 geometry and focus oracle.

  ```sh
  npm test -- src/shell/overlay-host.test.tsx src/shell/record-panel-host.test.tsx
  ```

### Task 4: Make `RecordPanelHost` the single physical panel grammar (2–5 minutes per step)

**Files:** modify `mos-app/src/shell/record-panel-host.tsx`, `record-panel-host.test.tsx`, `record-panel-host.css`, `mos-app/src/styles/drawer.css`, `mos-app/src/components/tasks/TasksWorkspace.css`, and the existing token file only if a named token is missing in the rebased Issue 3 base.

- [ ] **Step 1 (4 min):** Extend `record-panel-host.test.tsx` with failing tests for the new owner/entry attributes, internal Back button, Escape in the ≥1100 split regime, one focus return per frame, the intermediate/phone roles, and `transitionPending`. When pending, Close/Back/Open controls expose the existing disabled/`aria-busy` affordance while focus remains in tenant content or its confirmation. Keep the existing Task/Signal role/name tests and change only the split-Escape expectation that conflicts with the current V3 I2 contract.

- [ ] **Step 2 (4 min):** Implement the host’s focus boundary:

  ```ts
  const FOCUSABLE = [
    'a[href]',
    'button:not([disabled]):not([aria-disabled="true"])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',')
  ```

  Capture focus only when a root or frame key changes; use the previous frame’s `returnFocus` on internal Back and the root opener on Close. Focus a visible first control, otherwise a labelled heading with `tabIndex={-1}`. Install one controller-owned Escape path that calls `onClose('escape')`; remove the host’s competing document listener when rendered under `OverlayHostProvider`. On a denied `leaveGuard`, do not run this return-focus effect; on an allowed commit, run it exactly once.

- [ ] **Step 3 (4 min):** Replace the current 33vw split track and 50vw intermediate sheet with the V3 geometry:

  ```css
  .record-split {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(360px, 44%);
    align-items: start;
    gap: 12px;
  }

  .drawer-modal.drawer-sheet {
    width: min(45vw, 520px);
    max-width: 100%;
  }

  @media (max-width: 767px) {
    .drawer-modal.drawer-sheet { width: 100%; }
    .drawer-modal.drawer-fullscreen { inset: 0; }
    .record-panel-btn { min-width: 44px; min-height: 44px; }
  }
  ```

  Apply the same `minmax(360px, 44%)` rule to `.split` in `mos-app/src/components/tasks/TasksWorkspace.css`; retain the existing `max-width: 1760px`, `minmax(0, 1fr)`, and below-1100 single-column behavior. Do not add a centered record popup.

- [ ] **Step 4 (3 min):** Run the physical-host slice and inspect the exact failures before proceeding. Confirm that the guard-capable host test proves Escape and explicit Close use the same `requestLeave` path rather than a local drawer shim.

  ```sh
  npm test -- src/shell/record-panel-host.test.tsx src/shell/overlay-host.test.tsx src/components/tasks/task-drawer.test.tsx
  npm run lint:css
  ```

### Task 5: Migrate Task and Signal route seams without implementing RecordViewer adapters (2–5 minutes per step)

**Files:** modify `mos-app/src/components/tasks/task-drawer.tsx`, `mos-app/src/pages/tasks-layout.tsx`, `mos-app/src/components/tasks/task-page-mode.ts`, `mos-app/src/components/tasks/tasks-workspace.tsx`, their current tests, `mos-app/src/pages/signals-archive-page.tsx`, `mos-app/src/components/signals/signal-page-mode.ts`, `mos-app/src/components/signals/signal-record-host.tsx` only for host props, and current Signal page tests. Do not create a RecordViewer directory or data adapter.

- [ ] **Step 1 (4 min):** Add failing route tests that distinguish the three existing intents:

  ```text
  collection click → panel marker + TaskSurface presentation="panel"
  explicit Open full page → canonical /work/tasks/:id + TaskSurface presentation="page"
  hard /work/tasks/:id load or refresh → canonical page, no collection shell and no data-overlay-host
  Signal SPA ?record=<id> → panel; hard ?record=<id> → /work/signals/<id> page while preserving q/retracted
  ```

  Tag the tests with `AC-RPH-3`, `FR-V3-004`, and `FR-V3-005`. Run:

  ```sh
  npm test -- src/pages/tasks-layout.test.tsx src/components/tasks/task-page-mode.test.ts src/pages/signals-archive-page.test.tsx src/components/signals/signal-page-mode.test.ts
  ```

- [ ] **Step 2 (5 min):** Replace duplicated close/page route calculations with the generic navigation helpers while preserving the actual current paths: `/work/tasks`, `/work/tasks/:taskId`, `/work/signals`, `/work/signals/:signalId`, and `?record=`. Keep `TaskSurface` and `SignalRecordHost` as the content nodes passed to the host slot. Preserve `taskSurface: 'panel'`/`'page'` only as a route-local compatibility field; the generic controller must not inspect it.

- [ ] **Step 3 (4 min):** Make the Task and Signal collection slots use `OverlayHostSlot owner="tasks"`/`owner="signals"`; make the route-driven entry key stable (`task:<id|new>` and `signal:<id>`), pass `pageTo` only when the current content exposes canonical escalation, and set `title`/`label` from existing i18n strings. The collection remains mounted in the desktop split; below 1100px it remains underneath the host scrim.

  All route-driven root opens, linked-record pushes, current replacements, page promotions, Back, and Close calls use the host API. Do not add a Task/Signal-specific dirty flag or confirmation; a future domain adapter may supply `leaveGuard` through `OverlayEntry`.

- [ ] **Step 4 (4 min):** Run the targeted route and existing behavior tests. Any failure involving content mutation, status, archive, Signal fetch, or saved-view query is fixed in the route/host seam only; do not weaken the content oracle.

  ```sh
  npm test -- src/components/tasks/task-drawer.test.tsx src/components/tasks/task-surface.test.tsx src/pages/tasks-layout.test.tsx src/pages/signals-archive-page.test.tsx src/components/signals/signal-record-host.test.tsx
  ```

### Task 6: Move Deputy into the shared panel tenant without changing runtime/content (2–5 minutes per step)

**Files:** modify `mos-app/src/shell/app-shell.tsx`, `mos-app/src/components/assistant/AssistantPanel.tsx`, `mos-app/src/components/assistant/AssistantPanel.test.tsx`, `mos-app/src/shell/app-shell-assistant.test.tsx`, and only the narrowest `AgentRuntimeContext.tsx` seam required to close the shared host.

- [ ] **Step 1 (4 min):** Add the failing tenant test: opening the existing top-bar button renders the same Deputy transcript/composer body inside `data-overlay-tenant="deputy"`; opening a Task first then Deputy leaves exactly one `data-overlay-host`; Escape/Close calls the runtime close path and returns focus to the Deputy launcher.

  ```sh
  npm test -- src/shell/overlay-host.test.tsx src/shell/app-shell-assistant.test.tsx src/components/assistant/AssistantPanel.test.tsx
  ```

- [ ] **Step 2 (5 min):** Extract only the current Assistant body into the host slot. Preserve `useAssistantPanel`, safe Markdown, typed widgets, History/New Conversation, question/rating/approval controls, `SHOW_ASSISTANT`, keep-mounted transcript state, and `AgentRuntimeProvider`. Delete the Assistant-specific fixed-position panel/scrim/focus/Escape wrapper after the shared host is the only owner.

- [ ] **Step 3 (4 min):** Verify replacement semantics for Task ↔ Deputy and Deputy ↔ Task, plus flag-off absence. The Issue 4 Deputy entry remains clean and uses no guard copy; assert the generic host seam can accept the synthetic guard entry without a local Assistant drawer shim. Do not change `Inbox`, notification routes, agent APIs, or runtime storage. Issue 7 later wires Deputy/Inbox draft dirty state and confirmation copy through `leaveGuard`.

### Task 7: Extract the centered `ModalShell` and migrate command/composer/confirm/form overlays (2–5 minutes per step)

**Files:** create `mos-app/src/components/ui/modal-shell.tsx`, `mos-app/src/components/ui/modal-shell.test.tsx`; modify `mos-app/src/components/command/command-menu.tsx`, `mos-app/src/components/command/command-menu.test.tsx`, `mos-app/src/shell/signal-composer-host.tsx`, `mos-app/src/shell/signal-composer-host.test.tsx`, `mos-app/src/components/ui/confirm-dialog.tsx`, `mos-app/src/components/admin/confirm-dialog.test.tsx`, `mos-app/src/components/tasks/confirm-archive.test.tsx`, `mos-app/src/components/tasks/occurrence-assign-dialog.tsx`, `mos-app/src/components/tasks/occurrence-assign-dialog.test.tsx`, `mos-app/src/components/admin/create-person-dialog.tsx`, and `mos-app/src/components/admin/create-person-dialog.test.tsx`.

- [ ] **Step 1 (4 min):** Write red `ModalShell` tests for `aria-modal`, accessible name/description, first-control focus, Tab wrap, Escape, optional backdrop close, focus return, busy/reveal non-dismissal, phone full-screen, 16px centered phone gutter, and reduced-motion-safe classes.

  ```sh
  npm test -- src/components/ui/modal-shell.test.tsx
  ```

- [ ] **Step 2 (5 min):** Implement `ModalShell` from the exact interface above. It must render one `.scrim` at `--z-modal`, one labelled surface, and no duplicate document listeners when nested content changes. A modal with no focusable control focuses its labelled heading.

- [ ] **Step 3 (4 min):** Wrap `CommandMenu` with `ModalShell surface="centered" phoneMode="centered"`. Preserve its current centered placement, query/search results, command activation, `onShareSignal`, `Ctrl+K`/`Meta+K`, and existing `AC-017` goal oracle. Remove only its duplicate shell focus/Escape/scrim code after the modal tests are green.

- [ ] **Step 4 (4 min):** Wrap `SignalComposerHost` with `ModalShell surface="centered" phoneMode="fullscreen"`; keep `useSignalComposer`, roster loading, post count, `SignalComposer`, and `onShared`. It is a centered capture job, not a record panel.

- [ ] **Step 5 (5 min):** Make `ConfirmDialog` a `ModalShell` preset without changing `ConfirmDialogProps`, async busy/error behavior, Cancel-first focus, destructive tone, or `ConfirmArchive`/admin re-export. Wrap `OccurrenceAssignDialog` and `CreatePersonDialog` in `ModalShell` while preserving their current data/loading/error/reveal flows, roles, IDs, and dismiss-on-reveal rules. These are centered dialogs, not record tenants.

- [ ] **Step 6 (4 min):** Run the synthetic tenant proof from the interface section with the real `ModalShell`: mount its `leaveGuard`, trigger explicit Close/Escape/internal Back/browser Back/Forward/replaceRoot/replaceCurrent/openPage, assert the tenant-owned confirmation receives focus, click Stay and assert the draft/URL/marker/focus remain, then click Leave and assert the original transition completes with one approval-token consumption. This test owns the confirmation composition boundary; it must not mention Deputy dirty state or Inbox copy.

- [ ] **Step 7 (3 min):** Re-run all modal/command/composer/guard tests and the existing command e2e.

  ```sh
  npm test -- src/components/ui/modal-shell.test.tsx src/components/admin/confirm-dialog.test.tsx src/components/tasks/confirm-archive.test.tsx src/components/tasks/occurrence-assign-dialog.test.tsx src/components/admin/create-person-dialog.test.tsx src/components/command/command-menu.test.tsx src/shell/signal-composer-host.test.tsx src/shell/overlay-host.test.tsx src/shell/record-panel-host.test.tsx
  npx playwright test e2e/shell-command-palette.spec.ts --project=chromium
  ```

### Task 8: Normalize anchored menus and keep navigation out of the record stack (2–5 minutes per step)

**Files:** create `mos-app/src/lib/use-menu-popover.test.ts` if the existing hook behavior has no direct test; modify only `mos-app/src/lib/use-menu-popover.ts` if needed, `mos-app/src/components/tasks/row-menu.tsx`, `mos-app/src/components/admin/user-table.tsx`, `mos-app/src/shell/user-chip.tsx`, `mos-app/src/components/admin/menu-position.ts`, and their current tests. `mos-app/src/shell/mobile-drawer.tsx` is read/verified, not migrated into the record stack.

- [ ] **Step 1 (3 min):** Add/extend the hook test for the one anchored-menu contract: trigger `aria-expanded`, first-item focus, Arrow/Up/Home/End, Escape/outside close, return focus, `--z-popover`, and no `data-overlay-host` creation.

- [ ] **Step 2 (4 min):** Remove any local competing keyboard/outside-click listener in the named menu consumers and route all behavior through `useMenuPopover`/`menu-position.ts`. Keep PersonActionMenu’s mobile presentation only as its existing navigation/menu job; do not convert it to a record panel.

- [ ] **Step 3 (3 min):** Add a regression assertion to `mobile-drawer.test.tsx` that opening More while a record panel is active does not produce two panel hosts; closing More returns to the same record frame and opener focus. Do not alter rail, bottom-tab, or route IA.

  ```sh
  npm test -- src/lib/use-menu-popover.test.ts src/components/tasks/row-menu.test.tsx src/components/admin/user-table.test.tsx src/shell/user-chip.test.tsx src/shell/mobile-drawer.test.tsx
  ```

### Task 9: Drive URL, Back, focus, no-double-panel, and responsive behavior in Playwright (2–5 minutes per step)

**Files:** create `mos-app/e2e/v3-overlay-host.spec.ts`; use existing `e2e/helpers/login.ts`, `e2e/helpers/tasks.ts`, and `e2e/fixtures/users.ts`. Do not add an Inbox journey to this file.

- [ ] **Step 1 (5 min):** Add the 1280×900 desktop journey tagged `AC-V3-003`/`AC-V3-013`: log in as `VIEWER`, create/open a Task from `/work/tasks`, assert the table and exactly one `data-overlay-host` remain visible, assert the panel is on the right and its width divided by the available content width is between `0.40` and `0.45`, then assert `Escape` closes to the collection URL and focus returns to the row trigger.

  ```ts
  const geometry = await page.locator('[data-overlay-host="true"]').evaluate((node) => {
    const panel = node.getBoundingClientRect()
    const shell = document.querySelector<HTMLElement>('[data-anatomy="content"]')?.getBoundingClientRect()
    return { panelWidth: panel.width, contentWidth: shell?.width ?? 0, right: panel.right }
  })
  expect(geometry.panelWidth / geometry.contentWidth).toBeGreaterThanOrEqual(0.40)
  expect(geometry.panelWidth / geometry.contentWidth).toBeLessThanOrEqual(0.45)
  ```

- [ ] **Step 2 (5 min):** Add the 1024×900 intermediate journey: open the same in-list record, assert `role="dialog"`, `aria-modal="true"`, one scrim, right sheet, focus trap, Escape/Close, and no horizontal document overflow. Use `test.use({ viewport: { width: 1024, height: 900 } })`.

- [ ] **Step 3 (5 min):** Add the 390×844 phone journey: open an in-list Task card, assert full-screen `role="dialog"`, no side-by-side clipped content, `document.documentElement.scrollWidth <= window.innerWidth`, all visible host buttons have a 44px minimum hit box, and Back/Close restores the card list and focus. Use `test.use({ viewport: { width: 390, height: 844 } })`.

- [ ] **Step 4 (5 min):** Add the canonical URL journey at desktop and phone: direct `page.goto(recordUrl)`, reload, and open the same URL in a second context; assert the full `TaskSurface` page is visible, `data-overlay-host`/dialog/scrim are absent, and `?view=overdue` remains intact. Use the existing `tasks-canonical-page.spec.ts` oracle as the goal, not a CSS class-only proxy.

- [ ] **Step 5 (5 min):** Add browser Back/Forward assertions at all three viewports. From an in-list panel, `page.goBack()` must restore the collection URL and remove the host once; `page.goForward()` must restore the known in-memory frame and exactly one host. Assert the marker/depth, collection visibility, no duplicate scrim/panel, and focus entry/return at 1280×900, 1024×900, and 390×844. The unit/router matrix in Task 3A owns dirty POP deny/allow; this rendered test owns the clean visible outcome.

- [ ] **Step 6 (4 min):** Add the shell-tenant journey with a unit-backed Deputy/quick fixture if the live feature flag is off: record → Deputy replacement → one host → Back/Close. Do not use `useNotifications`, `/inbox`, or live Inbox data; mark the real Inbox bell journey as Issue 7.

- [ ] **Step 7 (3 min):** Add a rendered evidence case that captures the actual host at 1280×900, 1024×900, and 390×844 to Playwright’s ignored `test-results/v3-overlay-host/` directory and checks computed geometry/roles. The test must not commit screenshots or use them as the only assertion.

Run the exact rendered slice from `mos-app/`:

```sh
npx playwright test e2e/v3-overlay-host.spec.ts --project=chromium
npx playwright test e2e/v3-overlay-host.spec.ts e2e/shell-command-palette.spec.ts --project=chromium
```

Visually inspect the three generated PNGs in the desktop app at their native widths. Record computed width, role, scrim, no-overflow, and 44px results in the Issue 4 review ledger; do not claim visual acceptance from jsdom.

### Task 10: Run the complete Issue 4 verification battery (2–5 minutes per step)

**Files:** no new source; test/ledger evidence only.

- [ ] **Step 1 (3 min):** Run the complete unit suite and changed-file coverage from `mos-app/`.

  ```sh
  npm test
  npm run test:coverage
  ```

  Confirm changed-line coverage is ≥80% and that the test titles contain `AC-RPH-`, `AC-V3-`, `I1`, `I2`, `I3`, or `I4` for the owned behavior. Do not count Inbox ACs as Issue 4 evidence.

- [ ] **Step 2 (2 min):** Run typecheck, lint, and build.

  ```sh
  npm run typecheck
  npm run lint
  npm run build
  ```

- [ ] **Step 3 (3 min):** Run the focused browser suite again without piping output and inspect its exit code.

  ```sh
  npx playwright test e2e/v3-overlay-host.spec.ts e2e/shell-command-palette.spec.ts e2e/tasks-canonical-page.spec.ts --project=chromium
  ```

- [ ] **Step 4 (2 min):** Verify changed-file scope, whitespace, package/schema safety, and no duplicate physical host.

  ```sh
  git diff --check
  git diff --name-only
  rg -n "data-overlay-host|RecordPanelHost|ModalShell|drawer-modal-root|AssistantPanel" mos-app/src mos-app/e2e
  ! rg -n -U 'OverlayHostProvider\(\{\s*\n\s*children,\s*\n\s*children,' docs/plans/2026-07-20-v3-overlay-host.md
  git status --short
  ```

  The final source diff may include the named Issue 4 app/tests/e2e files and the three canonical state surfaces in Task 11, but no package, migration, environment, or Inbox integration file. The duplicate-property check must stay green: the `OverlayHostProvider` destructuring snippet contains one `children` property only.

### Task 11: Record the resumable checkpoint in canonical state surfaces only (2–5 minutes per step)

**Files allowed:** `docs/agent-context.md`, `docs/backlog.md`, `docs/reviews/v3-redesign.md` only. Do not create `docs/plans/*STATE*`, a handoff document, a second review ledger, or a duplicate authority.

- [ ] **Step 1 (3 min):** Replace/update only the current V3 status block at the rebased tip in `docs/agent-context.md` so it clearly separates evidence from remaining work. Use this exact structure; retain the historical strata and existing authority links:

  ```md
  ## V3 Issue 4 local checkpoint (2026-07-20)

  - **Verified completion:** the shared overlay controller/host is implemented and tested for the Task and Signal panel seams, Deputy shell tenant replacement, internal stack/back, canonical direct-page escalation, the guard-capable leave seam with synthetic tenant allow/deny/repeat/approval and browser POP marker restoration, Escape/Close/browser Back, focus entry/return, centered command/composer/confirmation/modal jobs, anchored menus, 1280px desktop, 1024px intermediate, and 390px phone behavior. The desktop host is 40–45% of available content width; the DOM contains one physical panel host.
  - **Evidence:** `docs/plans/2026-07-20-v3-overlay-host.md`, the Issue 4 section in `docs/reviews/v3-redesign.md`, `mos-app/src/shell/overlay-host.tsx`, `mos-app/src/shell/overlay-navigation.ts`, the named host/modal tests, and the focused Playwright/rendered checks.
  - **Remaining work:** Issue 5 still owns the RecordViewer contract, field primitives, and Task adapter; Issue 6 still owns RecordCollection plus Tasks/Signals adapters; Issue 7 still owns the real Inbox bell quick door, notification record push, Deputy/Inbox domain dirty-state wiring and confirmation copy, and Inbox/Deputy contextual integration; Issue 8 owns Café integration; Issue 9 owns the representative rendered/driven owner gate. Issue 4 does not claim those outcomes.
  - **Next action:** start V3 Issue 5 by rebasing onto the verified Issue 4 checkpoint and implementing the RecordViewer contract, field primitives, and Task adapter; re-run the Issue 2–3 dependency checks before changing viewer code.
  ```

- [ ] **Step 2 (3 min):** Replace the current V3 banner in `docs/backlog.md` with a concise pointer to the Issue 4 plan and ledger, preserving the master sequence and explicitly stating that real Inbox integration remains Issue 7. The banner must include the verified host/focus/URL/responsive scope, the exact next action “start V3 Issue 5: RecordViewer contract, field primitives, and Task adapter,” and the owner gate status.

- [ ] **Step 3 (5 min):** Append an `## Issue 4 — Shared overlay/panel/navigation host` section to `docs/reviews/v3-redesign.md` containing: authority read; exact changed source/test paths; AC/NFR ownership table; exact commands and exit codes; rendered widths and no-overflow/touch/focus results; verified completion; exclusions for Issues 5–9; and the exact next Issue 5 action. State explicitly that `AC-V3-006`, `AC-RPH-4`, and `AC-RPH-6` remain open for Issue 7.

- [ ] **Step 4 (2 min):** Mechanically verify that only the three canonical state surfaces were changed by this checkpoint and that no new state/handoff authority exists.

  ```sh
  git diff --name-only -- docs/agent-context.md docs/backlog.md docs/reviews/v3-redesign.md
  git status --short
  rg -n "Issue 4|Verified completion|Remaining work|Next action|Issue 5|Issue 7|AC-V3-006|AC-RPH-4|AC-RPH-6" docs/agent-context.md docs/backlog.md docs/reviews/v3-redesign.md
  ```

### Task 12: Commit the reviewed Issue 4 checkpoint locally (2–5 minutes per step)

- [ ] **Step 1 (2 min):** Review the complete diff and ensure no plan/task was marked complete without command evidence.

  ```sh
  git diff --stat
  git diff --check
  git diff -- docs/agent-context.md docs/backlog.md docs/reviews/v3-redesign.md
  ```

- [ ] **Step 2 (2 min):** Create a local checkpoint commit after all tests and state-surface updates are green. Use a focused message and the required trailer:

  ```sh
  git add mos-app/src/shell/overlay-host.tsx mos-app/src/shell/overlay-host.test.tsx \
    mos-app/src/shell/overlay-navigation.ts mos-app/src/shell/overlay-navigation.test.ts \
    mos-app/src/shell/record-panel-host.tsx mos-app/src/shell/record-panel-host.test.tsx \
    mos-app/src/shell/record-panel-host.css mos-app/src/styles/drawer.css \
    mos-app/src/components/ui/modal-shell.tsx mos-app/src/components/ui/modal-shell.test.tsx \
    mos-app/src/components/tasks/TasksWorkspace.css mos-app/src/components/tasks/task-drawer.tsx \
    mos-app/src/pages/tasks-layout.tsx mos-app/src/components/tasks/task-page-mode.ts \
    mos-app/src/components/tasks/tasks-workspace.tsx mos-app/src/components/tasks/row-menu.tsx \
    mos-app/src/components/tasks/row-menu.test.tsx mos-app/src/pages/tasks-layout.test.tsx \
    mos-app/src/components/tasks/task-drawer.test.tsx mos-app/src/components/tasks/task-page-mode.test.ts \
    mos-app/src/pages/signals-archive-page.tsx mos-app/src/pages/signals-archive-page.test.tsx \
    mos-app/src/components/signals/signal-page-mode.ts mos-app/src/components/signals/signal-page-mode.test.ts \
    mos-app/src/components/signals/signal-record-host.tsx mos-app/src/components/signals/signal-record-host.test.tsx \
    mos-app/src/shell/signal-composer-host.tsx mos-app/src/shell/signal-composer-host.test.tsx \
    mos-app/src/components/assistant/AssistantPanel.tsx mos-app/src/components/assistant/AssistantPanel.test.tsx \
    mos-app/src/shell/app-shell.tsx mos-app/src/shell/app-shell-assistant.test.tsx \
    mos-app/src/components/command/command-menu.tsx mos-app/src/components/command/command-menu.test.tsx \
    mos-app/src/components/ui/confirm-dialog.tsx mos-app/src/components/admin/confirm-dialog.test.tsx \
    mos-app/src/components/tasks/confirm-archive.test.tsx \
    mos-app/src/components/tasks/occurrence-assign-dialog.tsx mos-app/src/components/tasks/occurrence-assign-dialog.test.tsx \
    mos-app/src/components/admin/create-person-dialog.tsx mos-app/src/components/admin/create-person-dialog.test.tsx \
    mos-app/src/lib/use-menu-popover.ts mos-app/src/lib/use-menu-popover.test.ts \
    mos-app/src/components/admin/user-table.tsx mos-app/src/components/admin/user-table.test.tsx \
    mos-app/src/shell/user-chip.tsx mos-app/src/shell/user-chip.test.tsx \
    mos-app/src/components/admin/menu-position.ts mos-app/src/shell/mobile-drawer.test.tsx \
    mos-app/e2e/v3-overlay-host.spec.ts docs/agent-context.md docs/backlog.md docs/reviews/v3-redesign.md
  git commit -m "feat: unify V3 overlay host grammar" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```

- [ ] **Step 3 (2 min):** Confirm the commit contains no package, Supabase, Inbox integration, or Issue 5/6 adapter work. Do not push, open a PR, merge, or deploy; owner approval remains required at the Issue 4 boundary.

  ```sh
  git show --stat --oneline --decorate HEAD
  git status --short
  ```

## Final self-review checklist

- [ ] The plan names only real current seams before proposing new files, and every proposed new interface has an implementation path and test owner.
- [ ] The interface/fixture snippets type-check conceptually: imports match the named files, `useSyntheticGuardEntry` is called only from a component, `OverlayHostProvider` destructures `children` once, and no duplicate-property pattern remains.
- [ ] The one active physical panel host is distinct from centered modal jobs, anchored menus, and the navigation drawer; no interaction job is selected by module name.
- [ ] The panel is 40–45% of available content at desktop, right-side sheet at intermediate, and full-screen at 390px; no near-full centered record popup or 33vw legacy track remains.
- [ ] Collection click, linked-record push, internal Back, root Close, browser Back, direct URL, refresh, bookmark/new tab, Escape, focus entry, and focus return are all named with a concrete test layer.
- [ ] Task and Signal content remains typed and existing; Issue 5 RecordViewer adapters and Issue 6 collection adapters are explicitly excluded.
- [ ] The real Inbox bell/triage journey is explicitly excluded for Issue 7 while the generic quick-tenant seam is testable.
- [ ] Deputy shell replacement is explicit, runtime/content behavior is preserved, and Issue 7 contextual Inbox/Deputy wiring remains separate.
- [ ] Centered command, composer, confirmation, and form dialogs use `ModalShell`; anchored menus use `useMenuPopover`; no duplicate Escape/focus/scrim owners remain.
- [ ] AC/NFR ownership, 80% coverage, typecheck/lint/build, accessibility, responsive, rendered, no-overflow, and 44px checks are explicit.
- [ ] The leave guard is one domain-neutral async seam: all listed transitions use typed intents, pending requests coalesce, denied POP restores URL/marker, and confirmed cleanup bypasses exactly once without host-owned dirty state or copy.
- [ ] The `OverlayHostProvider` snippet destructures `children` exactly once; the Task 10 `rg -U` duplicate-property check passes.
- [ ] The last implementation task updates only `docs/agent-context.md`, `docs/backlog.md`, and `docs/reviews/v3-redesign.md`, separates verified completion from remaining work, and names Issue 5 plus its exact next action; Issue 7’s domain dirty-state/copy work remains explicit.
