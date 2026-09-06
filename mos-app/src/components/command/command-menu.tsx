import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchTasksByTitle } from '@/lib/db/tasks'
import { searchSignalsByBody } from '@/lib/db/signals'
import { searchFollowUpsByCounterparty } from '@/lib/db/follow-ups'
import { searchPeopleByName } from '@/lib/db/directory'
import { SHOW_FOLLOWUPS } from '@/config/features'
import { useAuth } from '@/auth/use-auth'
import { canViewRevenue } from '@/lib/capabilities'
import { canCaptureCafe } from '@/lib/cafe-affiliation'
import { isShipGated } from '@/lib/ship-gate'
import { DESTINATIONS, viewerAdmittedToRoute } from '@/shell/destinations'
import { visibleSections, type Section } from '@/shell/sections'
import { CAFE_LOG_ROUTE } from '@/lib/db/home-attention-data'
import {
  HomeIcon, WorkIcon, SignalsIcon, TasksIcon,
  MoneyIcon, InboxIcon, CafeIcon, ProfileIcon,
} from '@/shell/icons'
import { DeputyIcon } from '@/shell/top-bar'
import { useAgentRuntime } from '@/lib/agent/runtime/AgentRuntimeContext'
import { useIsNarrow } from '@/shell/use-is-narrow'
import { useIsCoarsePointer } from '@/shell/use-is-coarse-pointer'
import { useT } from '@/i18n/use-t'
import { ModalShell } from '@/components/ui/modal-shell'
import { readRecentTasks, pushRecentTask } from './recent-tasks'
import { WORK_PARENT_ID, withResolvedRungs, type CommandItem } from './rungs'
import type { CommandMenuMode } from './use-command-menu'
import './command-menu.css'

export type CommandMenuProps = {
  open: boolean
  onClose: () => void
  /** Opens the Signal composer (`useSignalComposer().open()`, passed down by app-shell so the
   * palette stays a pure presentational consumer — AC-428/FR-417: never a route navigation). */
  onShareSignal: () => void
  /**
   * Opener mode (OD-REDESIGN-91 #15 / GAP-10, per OD-46). 'search' (default) — the full palette
   * (Recent · GO TO roots · ACT + record search). 'launcher' — the phone `+` reduced create-set:
   * the default (empty-query) view is the universal Actions only, NOT the full palette. Typing
   * escalates to the shared record search in BOTH modes (OD-46 "More opens the full authorized
   * object palette").
   */
  mode?: CommandMenuMode
}

type ItemGroup = { key: string; label: string; items: CommandItem[] }

/**
 * Work's children, read from the ONE declared sequence (issue 446, issue 479).
 *
 * The palette used to re-type this list — Work, Signals, then Projects & Processes, then
 * Objectives — which was fine while every surface re-typed its own. Issue 446 made the desktop
 * rail and the phone drawer both render `destinations.tsx`'s `children` array as declared, and
 * left the palette as the last place the sequence existed twice: a third order, disagreeing with
 * the other two, that the issue-446 guard could not see because it rendered only the rail and the
 * drawer. Reading the array is what makes a re-sort impossible rather than merely currently-absent.
 *
 * Order only. Per-row VISIBILITY is unchanged and still comes from `visibleSections` (capability
 * gate + ship gate) below — the same filter the rail and the drawer apply, so Projects & Processes
 * stays behind `workline.manage` and a ship-gated child (Events) stays absent.
 */
const WORK_DEST = DESTINATIONS.find((d) => d.id === 'work')
const WORK_CHILDREN: readonly Section[] = WORK_DEST?.children ?? []

// `CommandItem`, `WORK_PARENT_ID` and `withResolvedRungs` live in ./rungs — pure logic in a
// non-component module, so the resolver stays exported and pinnable by unit test (a .tsx file
// exporting a function alongside a component breaks react-refresh).

// OD-REDESIGN-91 #4/B2: the palette searches ALL record kinds now — Tasks + Signals +
// AR Follow-ups — so a hit carries its kind (drives the row icon, route, and kind label).
type RecordKind = 'task' | 'signal' | 'follow-up' | 'person'
type RecordHit = { id: string; title: string; kind: RecordKind }

type RecordsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; rows: RecordHit[] }
  | { status: 'error' }

// Universal actions (stable order — Rule 7 forbids reordering them). verb+object.
// Ask Deputy opens the AssistantPanel; Share Signal calls onShareSignal (opens the shared Signal
// composer host — never a route navigation, AC-428/FR-417); Create Task opens inline on Tasks.
function matches(label: string, q: string): boolean {
  return label.toLowerCase().includes(q.trim().toLowerCase())
}

// Signals have no title — their body is the identity. Collapse to the first non-empty line so a
// multi-line body renders as one clean, CSS-truncated palette row (OD-REDESIGN-91 #4/B2).
function firstLine(body: string): string {
  const line = body.split('\n').map((s) => s.trim()).find((s) => s.length > 0)
  return line ?? body.trim()
}

// Per-kind row config for the widened Records group (OD-REDESIGN-91 #4/B2): the icon, the
// navigation target for a hit, and the muted kind label. Tasks/Signals deep-link to their record
// pages; an AR Follow-up hit lands on the Money queue, behind its finance gate. The Work record
// route is deleted (DD-WAY-36), so there is no record page to open. A person hit is deliberately
// NON-navigating (`to: null`): shared.people has no record route, and the palette's only /profile
// route is the VIEWER'S OWN — activating a row named for someone else must not open it.
const RECORD_KIND_CONFIG: Record<RecordKind, { Icon: React.ComponentType; to: ((id: string) => string) | null; kindLabelKey: 'commandMenu.kind.task' | 'commandMenu.kind.signal' | 'commandMenu.kind.followUp' | 'commandMenu.kind.person' }> = {
  task: { Icon: TasksIcon, to: (id) => `/work/tasks/${id}`, kindLabelKey: 'commandMenu.kind.task' },
  signal: { Icon: SignalsIcon, to: (id) => `/work/signals/${id}`, kindLabelKey: 'commandMenu.kind.signal' },
  'follow-up': { Icon: MoneyIcon, to: () => '/money/follow-ups', kindLabelKey: 'commandMenu.kind.followUp' },
  person: { Icon: ProfileIcon, to: null, kindLabelKey: 'commandMenu.kind.person' },
}

// ⌘K command palette (ADR-0013 D4 / Redesign Step 2 §8). Centered modal (e7
// presentation); contents = Recent + GO TO roots + ACT + async record search
// (the typed ACT adds the gated Café log entry, #407). The narrow/full-width
// branch is the shell's own `useIsNarrow()` seam — the one the bottom tab bar
// and the `+` launcher read. a11y: role=dialog + aria-modal + focus trap + Esc
// (returns focus) — all owned by ModalShell, the single interaction owner for
// centered dialogs.
export function CommandMenu({ open, onClose, onShareSignal, mode = 'search' }: CommandMenuProps): React.JSX.Element | null {
  const navigate = useNavigate()
  const auth = useAuth()
  const t = useT()
  const { openPanel } = useAgentRuntime()
  // AC-032 (#748 delta): search-only vs GO TO/ACT is a WIDTH decision — the same `useIsNarrow()`
  // seam (≤919.98px) that renders the bottom tab bar and the `+` launcher. A touch device at
  // desktop width still sees the rail, so its palette rests on the same GO TO roots.
  const isNarrow = useIsNarrow()
  // OD-REDESIGN-91 #41 (G5): the ⌘K keyboard hints (footer + the esc chip) are meaningless on a
  // touch device — hide them on a coarse pointer so no viewport shows an un-pressable key. This
  // is a POINTER question and deliberately not the width seam above.
  const isCoarse = useIsCoarsePointer()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [records, setRecords] = useState<RecordsState>({ status: 'idle' })

  const optionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // Memoized so it is referentially stable across renders: `navigateItems` derives Work's child
  // rows from it, and a fresh `[]` on every render would defeat that memo.
  const accessRoles = useMemo<string[]>(
    () => (auth.status === 'authenticated' ? auth.viewer.accessRoles : []),
    [auth],
  )
  // DELIBERATE DIVERGENCE FROM v4: v4 gated this entry on finance|admin. On this line the /money
  // route and the rail entry are both gated on REVENUE_VIEW_ROLES (ADR-0051 D4 — manager holds the
  // financial VIEW tier, supervisor the revenue-only one), so v4's narrower gate would hide from
  // the palette a destination the rail offers and the router admits. One gate, read through the
  // same helper destinations.tsx and the router read.
  const moneyAuthorized = canViewRevenue(accessRoles)
  // #407/#755: `launcherActions` is the ONE shared list for the phone `+` launcher and the
  // typed ⌘K ACT filter. Café capture is a WRITE, so it uses canCaptureCafe, not route admission;
  // OD-WAY-51 admits /cafe/log to READ.
  const affiliated = auth.status === 'authenticated' ? auth.viewer.affiliated : []
  const cafeCaptureAdmitted = canCaptureCafe({ affiliated, accessRoles })

  const trimmed = query.trim()
  const isSearching = trimmed.length > 0

  // Build the action/navigate registries (Memoized so `run` closures stay stable per render).
  // The three universal actions keep their stable order (Rule 7); the gated Café log entry
  // (#407) appends after them, present exactly when the Café write gate admits the viewer.
  const actionItems = useMemo<CommandItem[]>(
    () => {
      const items: CommandItem[] = [
        { id: 'a-deputy', label: t('commandMenu.action.askDeputy'), Icon: DeputyIcon, kind: 'action', run: () => openPanel() },
        { id: 'a-signal', label: t('commandMenu.action.shareSignal'), Icon: SignalsIcon, kind: 'action', run: onShareSignal },
        { id: 'a-task', label: t('commandMenu.action.createTask'), Icon: TasksIcon, kind: 'action', to: '/work/tasks?create=1' },
      ]
      return items
    },
    [openPanel, onShareSignal, t],
  )

  const launcherActions = useMemo(
    () => cafeCaptureAdmitted
      ? [...actionItems, { id: 'a-cafe-log', label: t('commandMenu.action.logCafe'), Icon: CafeIcon, kind: 'action' as const, to: CAFE_LOG_ROUTE }]
      : actionItems,
    [actionItems, cafeCaptureAdmitted, t],
  )

  const rootNavigateItems = useMemo<CommandItem[]>(() => [
    { id: 'n-home', label: t('dest.home'), Icon: HomeIcon, kind: 'navigate', to: '/' },
    { id: WORK_PARENT_ID, label: t('dest.work'), Icon: WorkIcon, kind: 'navigate', to: WORK_DEST?.primaryPath ?? '/work/tasks' },
    { id: 'n-inbox', label: t('dest.inbox'), Icon: InboxIcon, kind: 'navigate', to: '/inbox' },
    // The Café root asks the ONE route-admission question the launcher's Café action asks —
    // OD-WAY-51: navigation mirrors what the ROUTE admits, so the palette never offers a door
    // the router would bounce. (`/cafe` carries no access-role gate today, so this admits every
    // authenticated viewer; if the route ever narrows, this row follows it.)
    ...(viewerAdmittedToRoute('/cafe', accessRoles)
      ? [{ id: 'n-cafe', label: t('dest.cafe'), Icon: CafeIcon, kind: 'navigate' as const, to: '/cafe' }]
      : []),
    { id: 'n-money', label: t('dest.money'), Icon: MoneyIcon, kind: 'navigate', to: '/money', gated: true },
    { id: 'n-profile', label: t('dest.profile'), Icon: ProfileIcon, kind: 'navigate', to: '/profile' },
  ], [t, accessRoles])

  // Work's children sit ADJACENT to the Work row — emitted directly beneath it, before the
  // remaining roots — so in the typed view the run of rows the Child rung describes reaches back
  // to the parent unbroken by construction (issue 479). Per-row VISIBILITY still comes from
  // `visibleSections` and the query filter drops non-matching rows; neither reorders, so a child
  // can only lose its parent by the parent's row being filtered or gated away, which
  // `withResolvedRungs` answers by clearing the rung.
  const searchableNavigateItems = useMemo<CommandItem[]>(() => {
    const childRows = visibleSections(WORK_CHILDREN, accessRoles).map<CommandItem>((c) => ({
      id: `n${c.path.replace(/\//g, '-')}`,
      label: c.labelKey ? t(c.labelKey) : c.label,
      Icon: c.Icon,
      kind: 'navigate',
      to: c.path,
      child: true,
    }))
    const items: CommandItem[] = []
    for (const root of rootNavigateItems) {
      items.push(root)
      if (root.id === WORK_PARENT_ID) items.push(...childRows)
    }
    return items
  }, [rootNavigateItems, t, accessRoles])

  const visibleRoots = useMemo(
    () => rootNavigateItems.filter((i) => !i.gated || moneyAuthorized),
    [rootNavigateItems, moneyAuthorized],
  )
  const visibleSearchNavigate = useMemo(
    () => searchableNavigateItems.filter((i) => !i.gated || moneyAuthorized),
    [searchableNavigateItems, moneyAuthorized],
  )

  // CMDK-1: the palette is kept mounted across close→reopen (its host toggles `open`, it does
  // not unmount), so query/active/records would otherwise persist — a reopen landed mid-search
  // on a stale query with the default Recent/Actions/Navigate view unreachable. Reset the session
  // state whenever it closes, so the next open always starts from the default view.
  useEffect(() => {
    if (open) return
    setQuery('')
    setActive(0)
    setRecords({ status: 'idle' })
  }, [open])

  // ── Debounced record search (~150ms) ─────────────────────────────────────────
  // OD-REDESIGN-91 #4/B2: one debounced fan-out across every readable record kind — Tasks +
  // Signals always; AR Follow-ups only when SHOW_FOLLOWUPS is lit (the settlement bridge ships
  // dark). RLS is the read authority for each. Any one search failing fails the group (the
  // existing "Couldn't search records" affordance); Navigate/Actions still filter client-side.
  useEffect(() => {
    if (!open) return
    if (!isSearching) { setRecords({ status: 'idle' }); return }
    setRecords({ status: 'loading' })
    let cancelled = false
    const timer = setTimeout(() => {
      Promise.all([
        searchTasksByTitle(trimmed).then((rows) =>
          rows.map<RecordHit>((r) => ({ id: r.id, title: r.title, kind: 'task' })),
        ),
        searchSignalsByBody(trimmed).then((rows) =>
          rows.map<RecordHit>((r) => ({ id: r.id, title: firstLine(r.body), kind: 'signal' })),
        ),
        SHOW_FOLLOWUPS
          ? searchFollowUpsByCounterparty(trimmed).then((rows) =>
              rows.map<RecordHit>((r) => ({ id: r.id, title: r.counterparty, kind: 'follow-up' })),
            )
          : Promise.resolve<RecordHit[]>([]),
        searchPeopleByName(trimmed).then((rows) =>
          rows.map<RecordHit>((r) => ({ id: r.id, title: r.full_name, kind: 'person' })),
        ),
      ])
        .then(([tasks, signals, followUps, people]) => {
          if (!cancelled) setRecords({ status: 'ready', rows: [...tasks, ...signals, ...followUps, ...people] })
        })
        .catch(() => { if (!cancelled) setRecords({ status: 'error' }) })
    }, 150)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [open, trimmed, isSearching])

  // ── Group model ──────────────────────────────────────────────────────────────
  const groups = useMemo<ItemGroup[]>(() => {
    const out: ItemGroup[] = []
    if (!isSearching) {
      // OD-REDESIGN-91 #15 / GAP-10 (per OD-46): the phone `+` launcher opens the REDUCED
      // create-set — the universal Actions only, NOT the full palette. No Recent, no Navigate.
      // (Typing still escalates to the shared search below — OD-46's "More opens the full palette".)
      if (mode === 'launcher') {
        out.push({ key: 'actions', label: t('commandMenu.group.actions'), items: launcherActions })
        return out
      }
      if (isNarrow) return out
      const recent = readRecentTasks().map<CommandItem>((r) => ({
        id: `recent-${r.id}`, label: r.title, Icon: TasksIcon, kind: 'record',
        to: `/work/tasks/${r.id}`, record: { id: r.id, title: r.title },
      }))
      if (recent.length) out.push({ key: 'recent', label: t('commandMenu.group.recent'), items: recent })
      // e7's palette leads with destinations (GO TO) before actions (ACT).
      out.push({ key: 'navigate', label: t('commandMenu.group.goTo'), items: visibleRoots })
      out.push({ key: 'actions', label: t('commandMenu.group.act'), items: actionItems })
      return out
    }
    const actions = launcherActions.filter((i) => matches(i.label, trimmed))
    const recordRows = records.status === 'ready' ? records.rows : []
    const recordItems = recordRows.map<CommandItem>((r) => {
      const cfg = RECORD_KIND_CONFIG[r.kind]
      return {
        // Namespace the id by kind — a Task and a Signal can share a uuid across tables.
        id: `record-${r.kind}-${r.id}`,
        label: r.title,
        Icon: cfg.Icon,
        kind: 'record',
        // A person hit carries no target (see RECORD_KIND_CONFIG): a WITHHELD row, not a bounce
        // to the viewer's own profile — it reads disabled (aria-disabled, skipped by the roving
        // index, see CommandItem.disabled) and a press is refused instead of closing the palette.
        to: cfg.to ? cfg.to(r.id) : undefined,
        disabled: cfg.to === null,
        // Rows carry their kind (OD-REDESIGN-91 #4/B2): a muted kind label rides the row.
        meta: t(cfg.kindLabelKey),
        // Only Tasks feed the task-scoped Recent ring buffer; Signals/Follow-ups don't pollute it.
        record: r.kind === 'task' ? { id: r.id, title: r.title } : undefined,
      }
    })
    if (records.status === 'ready' && recordItems.length) {
      out.push({ key: 'records', label: t('commandMenu.group.records'), items: recordItems })
    }
    // AC-032: the narrow/full-width branch, not the pointer — below 920px the palette carries
    // results ONLY (navigation is the tab bar's job, actions the `+` launcher's); at desktop
    // width it keeps GO TO + ACT whatever the pointer modality (#41 owns the keyboard hints).
    if (isNarrow) return out
    const nav = visibleSearchNavigate.filter((i) => matches(i.label, trimmed))
    if (nav.length) out.push({ key: 'navigate', label: t('commandMenu.group.goTo'), items: nav })
    if (actions.length) out.push({ key: 'actions', label: t('commandMenu.group.act'), items: actions })
    return out
  }, [isSearching, trimmed, records, actionItems, launcherActions, visibleRoots, visibleSearchNavigate, t, mode, isNarrow])

  // The ship gate (#444), applied at the ONE seam every palette row passes through, rather than
  // as a `gated` flag per entry. The palette is a navigation surface like the rail, and OD-WAY-51
  // holds here too: it must never offer a door the router has closed. Applied to the assembled
  // groups so it covers Navigate rows, record hits (an AR Follow-up hit points into /money) and
  // anything a later entry adds — a new row cannot forget to ask. A group emptied by the gate is
  // dropped whole, so no heading survives with nothing under it.
  const visibleGroups = useMemo(
    () =>
      groups
        .map((g) => ({
          ...g,
          // Rungs resolve AFTER the gate, so a child orphaned by the gate loses its rung too.
          items: withResolvedRungs(g.items.filter((i) => i.to == null || !isShipGated(i.to))),
        }))
        .filter((g) => g.items.length > 0),
    [groups],
  )

  // The roving index walks ACTIVATABLE rows only: a disabled row (person hit — a withheld
  // target, see CommandItem.disabled) renders aria-disabled but ↑↓/Enter never rest on it, and
  // the active row can never be a press the palette must refuse.
  const flatItems = useMemo(
    () => visibleGroups.flatMap((g) => g.items).filter((i) => !i.disabled),
    [visibleGroups],
  )
  const activeId = flatItems[active]?.id

  useEffect(() => { setActive(0) }, [trimmed])
  useEffect(() => {
    if (active > flatItems.length - 1) setActive(flatItems.length ? flatItems.length - 1 : 0)
  }, [flatItems.length, active])

  useEffect(() => {
    if (!open || !activeId) return
    optionRefs.current[activeId]?.scrollIntoView?.({ block: 'nearest' })
  }, [activeId, open])

  if (!open) return null

  function activate(item: CommandItem | undefined) {
    if (!item) return
    if (item.record) pushRecentTask(item.record)
    if (item.run) item.run()
    else if (item.to) navigate(item.to)
    onClose()
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case 'Escape': e.preventDefault(); onClose(); break
      case 'ArrowDown': e.preventDefault(); setActive((i) => flatItems.length ? Math.max(0, Math.min(i + 1, flatItems.length - 1)) : 0); break
      case 'ArrowUp': e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); break
      case 'Home': e.preventDefault(); setActive(0); break
      case 'End': e.preventDefault(); setActive(Math.max(flatItems.length - 1, 0)); break
      case 'Enter': e.preventDefault(); activate(flatItems[active]); break
      default: break
    }
  }

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      ariaLabel={t('commandMenu.title')}
      closeOnBackdrop
      closeOnEscape
      surface="centered"
      phoneMode="centered"
      className="cm-modal-surface"
    >
      <div className="cm-panel">
        <div className="cm-input">
          <span className="cm-input-icon" aria-hidden="true">⌕</span>
          <input
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="cm-list"
            aria-activedescendant={activeId}
            aria-label={t('commandMenu.inputLabel')}
            className="tap-floor"
            placeholder={t('commandMenu.inputPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
          />
          {/* #41 (G5): the esc key chip hides on a coarse pointer (no keyboard to press it). */}
          {!isCoarse && <kbd className="cm-foot-key">esc</kbd>}
        </div>

        <div className="cm-body">
          <div
            className="cm-group-list"
            id="cm-list"
            role="listbox"
            aria-label={t('commandMenu.resultsLabel')}
            aria-busy={records.status === 'loading' ? 'true' : undefined}
            tabIndex={-1}
          >
            {isSearching && records.status === 'error' && (
              <div className="cm-records-error" role="option" aria-selected="false" aria-disabled="true">
                {t('commandMenu.error.searchRecords')}
              </div>
            )}
            {isSearching && records.status === 'loading' && (
              <div className="cm-item" data-testid="cm-records-skeleton" role="option" aria-selected="false" aria-disabled="true">
                <span className="cm-item-glyph" aria-hidden="true"><TasksIcon /></span>
                <span className="cm-skeleton" />
                <span className="sr-only">{t('commandMenu.status.searchingRecords')}</span>
              </div>
            )}
            {visibleGroups.length > 0 ? visibleGroups.map((group) => (
              <div key={group.key} role="group" aria-label={group.label}>
                <div className="cm-group text-muted-foreground" aria-hidden="true">{group.label}</div>
                <div className="cm-group-list">
                  {group.items.map((item) => {
                    const isActive = item.id === activeId
                    return (
                      <div
                        key={item.id}
                        id={item.id}
                        ref={(element) => { optionRefs.current[item.id] = element }}
                        role="option"
                        aria-selected={isActive}
                        aria-disabled={item.disabled ? 'true' : undefined}
                        /* The rung, said twice — once to the eye, once to the screen reader, from
                           the ONE resolved answer above. `data-child` is the style hook for the
                           ladder's Child rung (command-menu.css) and the marker the cross-surface
                           order guard reads (issue 479); `aria-describedby` points at the Work
                           PARENT ROW ITSELF, so the row is announced "Tasks … Work" and the pair
                           that share `/work/tasks` stop sounding like two unrelated options.

                           Not `aria-level`: it is not a supported property of `role="option"`
                           (ARIA 1.2 — option's properties are aria-selected/checked/posinset/
                           setsize plus the global set), so it would be dropped, and the listbox
                           has no tree to level. Not an accessible-NAME suffix either: the visible
                           label is the name a voice-control user speaks and the name the rail and
                           drawer give the same destination, and the parent is supplementary
                           information about the row — which is what `aria-describedby` is for.
                           The idref resolves only while the parent row is rendered, which is the
                           same condition that draws the indent. */
                        data-to={item.to}
                        data-child={item.child ? 'true' : undefined}
                        aria-describedby={item.child ? WORK_PARENT_ID : undefined}
                        className={`cm-item${item.kind === 'action' ? ' action' : ''}${isActive ? ' active' : ''}`}
                        onClick={() => { if (!item.disabled) activate(item) }}
                        onMouseMove={() => {
                          const idx = flatItems.findIndex((f) => f.id === item.id)
                          if (idx >= 0) setActive(idx)
                        }}
                      >
                        <span className="cm-item-glyph" aria-hidden="true"><item.Icon /></span>
                        <span className="cm-item-label truncate" title={item.label}>{item.label}</span>
                        {item.meta && <span className="cm-item-meta">{item.meta}</span>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )) : isSearching && records.status !== 'loading' && (
              <div className="cm-empty" role="option" aria-selected="false" aria-disabled="true" aria-live="polite">
                {t('commandMenu.empty.noMatches', { query: trimmed })}
              </div>
            )}
          </div>
        </div>

        {/* #41 (G5): the whole keyboard-hint footer hides on a coarse pointer — un-pressable keys. */}
        {!isCoarse && (
          <div className="cm-foot" aria-hidden="true">
            <span><span className="cm-foot-key">↑↓</span> {t('commandMenu.footer.navigate')}</span>
            <span><span className="cm-foot-key">↵</span> {t('commandMenu.footer.open')}</span>
            <span><span className="cm-foot-key">esc</span> {t('commandMenu.footer.close')}</span>
          </div>
        )}
      </div>
    </ModalShell>
  )
}
