import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { searchTasksByTitle } from '@/lib/db/tasks'
import { searchSignalsByBody } from '@/lib/db/signals'
import { searchFollowUpsByCounterparty } from '@/lib/db/follow-ups'
import { searchPeopleByName } from '@/lib/db/directory'
import { searchObjectivesByName } from '@/lib/db/objectives'
import { searchWorkLinesByName } from '@/lib/db/work-lines'
import { SHOW_ASSISTANT, SHOW_FOLLOWUPS, SHOW_WORK_COLLECTIONS } from '@/config/features'
import { useAuth } from '@/auth/use-auth'
import { canCaptureCafe } from '@/lib/cafe-affiliation'
import { canCreateForScope, useWorkWriteAuthority } from '@/components/catalog/use-work-write-authority'
import { isShipGated } from '@/lib/ship-gate'
import { goToDestinations } from '@/shell/destinations'
import { CAFE_LOG_ROUTE } from '@/lib/db/home-attention-data'
import {
  SignalsIcon, TasksIcon, MoneyIcon, CafeIcon, ProfileIcon, ObjectiveIcon, WorkLineIcon,
} from '@/shell/icons'
import { DeputyIcon } from '@/shell/top-bar'
import { useAgentRuntime } from '@/lib/agent/runtime/AgentRuntimeContext'
import { useIsNarrow } from '@/shell/use-is-narrow'
import { useIsCoarsePointer } from '@/shell/use-is-coarse-pointer'
import { useT } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
import { ModalShell } from '@/components/ui/modal-shell'
import { readRecentTasks, pushRecentTask } from './recent-tasks'
import { withResolvedRungs, type CommandItem } from './rungs'
import type { CommandMenuMode } from './use-command-menu'
import './command-menu.css'

export type CommandMenuProps = {
  open: boolean
  onClose: () => void
  /** Opens the Signal composer (`useSignalComposer().open()`, passed down by app-shell so the
   * palette stays a pure presentational consumer — AC-428/FR-417: never a route navigation). */
  onShareSignal: () => void
  /** Runtime signal.post authority from the shell composer host. */
  canShareSignal?: boolean
  /**
   * Opener mode (OD-REDESIGN-91 #15 / GAP-10, per OD-46). 'search' (default) — the full palette
   * (Recent · GO TO roots · ACT + record search). 'launcher' — the phone `+` reduced create-set:
   * the default (empty-query) view is the universal Actions only, NOT the full palette. Typing
   * escalates to the shared record search in BOTH modes (OD-46 "More opens the full authorized
   * object palette").
   */
  mode?: CommandMenuMode
  /** Focus target on close when the palette was opened by the ⌘K shortcut with nothing focused. */
  returnFocusRef?: React.RefObject<HTMLElement | null>
}

type ItemGroup = { key: string; label: string; items: CommandItem[] }

// `CommandItem` and `withResolvedRungs` live in ./rungs — pure logic in a
// non-component module, so the resolver stays exported and pinnable by unit test (a .tsx file
// exporting a function alongside a component breaks react-refresh).

// OD-REDESIGN-91 #4/B2: the palette searches every record kind the viewer can read — Tasks,
// Signals, Objectives, Projects & Processes, AR Follow-ups and people — so a hit carries its kind
// (drives the row icon, route, and kind label).
type RecordKind = 'task' | 'signal' | 'objective' | 'project' | 'process' | 'follow-up' | 'person'
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

// Per-kind record row config (OD-REDESIGN-91 #4/B2): the icon, the
// navigation target for a hit, and the muted kind label. Tasks, Signals, Objectives and Projects &
// Processes deep-link to their record pages; an AR Follow-up hit lands on the Money queue, behind
// its finance gate, because DD-WAY-36 (#369) deleted its record route. A person hit is deliberately
// NON-navigating (`to: null`): shared.people has no record route, and the palette's only /profile
// route is the VIEWER'S OWN — activating a row named for someone else must not open it.
const RECORD_KIND_CONFIG: Record<RecordKind, { Icon: React.ComponentType; to: ((id: string) => string) | null; kindLabelKey: MessageKey }> = {
  task: { Icon: TasksIcon, to: (id) => `/work/tasks/${id}`, kindLabelKey: 'commandMenu.kind.task' },
  signal: { Icon: SignalsIcon, to: (id) => `/work/signals/${id}`, kindLabelKey: 'commandMenu.kind.signal' },
  objective: { Icon: ObjectiveIcon, to: (id) => `/work/objectives/${id}`, kindLabelKey: 'commandMenu.kind.objective' },
  project: { Icon: WorkLineIcon, to: (id) => `/work/projects/${id}`, kindLabelKey: 'commandMenu.kind.project' },
  process: { Icon: WorkLineIcon, to: (id) => `/work/projects/${id}`, kindLabelKey: 'commandMenu.kind.process' },
  'follow-up': { Icon: MoneyIcon, to: () => '/money/follow-ups', kindLabelKey: 'commandMenu.kind.followUp' },
  person: { Icon: ProfileIcon, to: null, kindLabelKey: 'commandMenu.kind.person' },
}

// A stable kind order gives work records first dibs without comparing scores across unlike records.
const RECORD_KIND_ORDER: RecordKind[] = ['task', 'objective', 'project', 'process', 'signal', 'follow-up', 'person']

// ⌘K command palette (ADR-0013 D4 / Redesign Step 2 §8). Centered modal (e7
// presentation); contents = Recent + GO TO roots + ACT + async record search
// (the typed ACT adds the gated Café log entry, #407). The narrow/full-width
// branch is the shell's own `useIsNarrow()` seam — the one the bottom tab bar
// and the `+` launcher read. a11y: role=dialog + aria-modal + focus trap + Esc
// (returns focus) — all owned by ModalShell, the single interaction owner for
// centered dialogs.
export function CommandMenu({ open, onClose, onShareSignal, canShareSignal = true, mode = 'search', returnFocusRef }: CommandMenuProps): React.JSX.Element | null {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const auth = useAuth()
  const { scopes } = useWorkWriteAuthority(open)
  const t = useT()
  const { openPanel } = useAgentRuntime()
  // AC-032 uses the shell width seam: narrow palettes stay search-only, with an empty-state prompt
  // at rest and record results after typing beside the phone's existing navigation and launcher.
  const isNarrow = useIsNarrow()
  // OD-REDESIGN-91 #41 (G5): the ⌘K keyboard hints (footer + the esc chip) are meaningless on a
  // touch device — hide them on a coarse pointer so no viewport shows an un-pressable key. This
  // is a POINTER question and deliberately not the width seam above.
  const isCoarse = useIsCoarsePointer()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [records, setRecords] = useState<RecordsState>({ status: 'idle' })
  const [expandedKinds, setExpandedKinds] = useState<Set<RecordKind>>(() => new Set())

  const optionRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const pendingActiveId = useRef<string | null>(null)

  // Memoized so it is referentially stable across renders: `navigateItems` derives Work's child
  // rows from it, and a fresh `[]` on every render would defeat that memo.
  const accessRoles = useMemo<string[]>(
    () => (auth.status === 'authenticated' ? auth.viewer.accessRoles : []),
    [auth],
  )
  // #407/#755: `launcherActions` is the ONE shared list for the phone `+` launcher and the
  // typed ⌘K ACT filter. Café capture is a WRITE, so it uses canCaptureCafe, not route admission;
  // OD-WAY-51 admits /cafe/log to READ.
  const affiliated = auth.status === 'authenticated' ? auth.viewer.affiliated : []
  const cafeCaptureAdmitted = canCaptureCafe({ affiliated, accessRoles })

  const trimmed = query.trim()
  const isSearching = trimmed.length > 0

  // Build the action/navigate registries (Memoized so `run` closures stay stable per render).
  // Available actions keep their stable order (Rule 7); the gated Café log entry
  // (#407) appends after them, present exactly when the Café write gate admits the viewer.
  // Creating an Objective or a Project/Process is offered wherever the viewer holds the create
  // scope: the collection pages open their create draft from `?create=1`, from any route.
  const actionItems = useMemo<CommandItem[]>(
    () => {
      const items: CommandItem[] = [
        ...(SHOW_WORK_COLLECTIONS && canShareSignal ? [{ id: 'a-signal', label: t('commandMenu.action.shareSignal'), Icon: SignalsIcon, kind: 'action' as const, run: onShareSignal }] : []),
        ...(SHOW_WORK_COLLECTIONS
          ? [{ id: 'a-task', label: t('commandMenu.action.createTask'), Icon: TasksIcon, kind: 'action' as const, to: '/work/tasks?create=1' }]
          : []),
        ...(SHOW_WORK_COLLECTIONS && canCreateForScope('objective', scopes)
          ? [{ id: 'a-objective', label: t('catalog.objectives.add'), Icon: ObjectiveIcon, kind: 'action' as const, to: '/work/objectives?create=1' }]
          : []),
        ...(SHOW_WORK_COLLECTIONS && canCreateForScope('work-line', scopes)
          ? [{ id: 'a-work-line', label: t('catalog.projects.add'), Icon: WorkLineIcon, kind: 'action' as const, to: '/work/projects?create=1' }]
          : []),
      ]
      if (SHOW_ASSISTANT) items.unshift({
        id: 'a-deputy', label: t('commandMenu.action.askDeputy'), Icon: DeputyIcon, kind: 'action', run: () => openPanel(),
      })
      return items
    },
    [canShareSignal, openPanel, onShareSignal, scopes, t],
  )

  // On a catalog collection route (not its record pages) the page's own create action leads the
  // list. Below the rail-collapse width this entry is that page's one create door — the page
  // hides its header button there, as Tasks does.
  const pageCreateId = pathname === '/work/objectives' ? 'a-objective' : pathname === '/work/projects' ? 'a-work-line' : null

  const launcherActions = useMemo(
    () => {
      const lead = actionItems.find((i) => i.id === pageCreateId)
      return [
        ...(lead ? [lead] : []),
        ...actionItems.filter((i) => i !== lead),
        ...(cafeCaptureAdmitted
          ? [{ id: 'a-cafe-log', label: t('commandMenu.action.logCafe'), Icon: CafeIcon, kind: 'action' as const, to: CAFE_LOG_ROUTE }]
          : []),
      ]
    },
    [actionItems, cafeCaptureAdmitted, pageCreateId, t],
  )

  // Go to is the catalog, read through the same two questions the rail asks (`goToDestinations`):
  // every destination the viewer can open, each directly followed by the children the rail draws
  // under it, so a run of children always reaches back to its parent (issue 479). Per-row
  // VISIBILITY comes from the catalog; the query filter drops non-matching rows without
  // reordering, and `withResolvedRungs` clears a rung whose parent row was filtered away.
  const navigateItems = useMemo<CommandItem[]>(
    () => goToDestinations(accessRoles).flatMap(({ destination, path, children }) => {
      const parentId = `n-${destination.id}`
      return [
        { id: parentId, label: t(destination.labelKey), Icon: destination.Icon, kind: 'navigate' as const, to: path },
        ...children.map<CommandItem>((c) => ({
          id: `n-child${c.path.replace(/\//g, '-')}`,
          label: c.labelKey ? t(c.labelKey) : c.label,
          Icon: c.Icon,
          kind: 'navigate',
          to: c.path,
          child: true,
          parentId,
        })),
      ]
    }),
    [accessRoles, t],
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
    setExpandedKinds(new Set())
    pendingActiveId.current = null
  }, [open])

  // ── Debounced record search (~150ms) ─────────────────────────────────────────
  // OD-REDESIGN-91 #4/B2: one debounced fan-out across readable record kinds. Work records are
  // searched only when that collection is in the release profile; people stay shared, and AR
  // Follow-ups run only when SHOW_FOLLOWUPS is lit (the settlement bridge ships dark). RLS is the
  // read authority for every enabled search.
  // Any one search failing fails the group (the existing "Couldn't search records" affordance);
  // Navigate/Actions still filter client-side.
  useEffect(() => {
    if (!open) return
    if (!isSearching) { setRecords({ status: 'idle' }); return }
    setRecords({ status: 'loading' })
    let cancelled = false
    const timer = setTimeout(() => {
      Promise.all([
        SHOW_WORK_COLLECTIONS
          ? searchTasksByTitle(trimmed).then((rows) =>
              rows.map<RecordHit>((r) => ({ id: r.id, title: r.title, kind: 'task' })),
            )
          : Promise.resolve<RecordHit[]>([]),
        SHOW_WORK_COLLECTIONS
          ? searchSignalsByBody(trimmed).then((rows) =>
              rows.map<RecordHit>((r) => ({ id: r.id, title: firstLine(r.body), kind: 'signal' })),
            )
          : Promise.resolve<RecordHit[]>([]),
        SHOW_FOLLOWUPS
          ? searchFollowUpsByCounterparty(trimmed).then((rows) =>
              rows.map<RecordHit>((r) => ({ id: r.id, title: r.counterparty, kind: 'follow-up' })),
            )
          : Promise.resolve<RecordHit[]>([]),
        SHOW_WORK_COLLECTIONS
          ? searchWorkLinesByName(trimmed).then((rows) =>
              rows.map<RecordHit>((r) => ({ id: r.id, title: r.name, kind: r.type })),
            )
          : Promise.resolve<RecordHit[]>([]),
        SHOW_WORK_COLLECTIONS
          ? searchObjectivesByName(trimmed).then((rows) =>
              rows.map<RecordHit>((r) => ({ id: r.id, title: r.name, kind: 'objective' })),
            )
          : Promise.resolve<RecordHit[]>([]),
        searchPeopleByName(trimmed).then((rows) =>
          rows.map<RecordHit>((r) => ({ id: r.id, title: r.full_name, kind: 'person' })),
        ),
      ])
        .then(([tasks, signals, followUps, workLines, objectives, people]) => {
          if (!cancelled) setRecords({ status: 'ready', rows: [...tasks, ...signals, ...followUps, ...workLines, ...objectives, ...people] })
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
      out.push({ key: 'navigate', label: t('commandMenu.group.goTo'), items: navigateItems })
      out.push({ key: 'actions', label: t('commandMenu.group.act'), items: actionItems })
      return out
    }
    const actions = launcherActions.filter((i) => matches(i.label, trimmed))
    const recordRows = records.status === 'ready' ? records.rows : []
    const itemsByKind = new Map<RecordKind, CommandItem[]>()
    for (const r of recordRows) {
      const cfg = RECORD_KIND_CONFIG[r.kind]
      const item: CommandItem = {
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
        // Only Tasks feed the task-scoped Recent ring buffer; Signals/Follow-ups don't pollute it.
        record: r.kind === 'task' ? { id: r.id, title: r.title } : undefined,
      }
      const kindItems = itemsByKind.get(r.kind)
      if (kindItems) kindItems.push(item)
      else itemsByKind.set(r.kind, [item])
    }
    if (itemsByKind.size) {
      for (const kind of RECORD_KIND_ORDER) {
        const items = itemsByKind.get(kind)
        if (!items?.length) continue
        const expanded = expandedKinds.has(kind)
        const visibleItems = expanded ? items : items.slice(0, 1)
        if (items.length > 1) {
          const disclosureId = `record-toggle-${kind}`
          visibleItems.push({
            id: disclosureId,
            label: t(expanded ? 'commandMenu.action.showFewer' : 'commandMenu.action.showAll', { count: items.length }),
            Icon: RECORD_KIND_CONFIG[kind].Icon,
            kind: 'disclosure',
            // The route is only for the shared ship gate; activation runs the in-place toggle.
            to: items[0].to,
            keepOpen: true,
            run: () => {
              pendingActiveId.current = disclosureId
              setExpandedKinds((current) => {
                const next = new Set(current)
                if (next.has(kind)) next.delete(kind)
                else next.add(kind)
                return next
              })
            },
          })
        }
        out.push({
          key: `records-${kind}`,
          label: t(RECORD_KIND_CONFIG[kind].kindLabelKey),
          items: visibleItems,
        })
      }
    }
    // AC-032: typed searches stay results-only below 920px; at desktop width, matching
    // destinations and actions join the record results.
    if (isNarrow) return out
    const nav = navigateItems.filter((i) => matches(i.label, trimmed))
    if (nav.length) out.push({ key: 'navigate', label: t('commandMenu.group.goTo'), items: nav })
    if (actions.length) out.push({ key: 'actions', label: t('commandMenu.group.act'), items: actions })
    return out
  }, [isSearching, trimmed, records, expandedKinds, actionItems, launcherActions, navigateItems, t, mode, isNarrow])

  // The ship gate (#444), applied at the ONE seam every palette row passes through, rather than
  // as a flag per entry. The palette is a navigation surface like the rail, and OD-WAY-51
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

  useEffect(() => {
    setActive(0)
    setExpandedKinds(new Set())
    pendingActiveId.current = null
  }, [trimmed])
  useEffect(() => {
    if (active > flatItems.length - 1) setActive(flatItems.length ? flatItems.length - 1 : 0)
  }, [flatItems.length, active])
  useEffect(() => {
    const id = pendingActiveId.current
    if (!id) return
    const index = flatItems.findIndex((item) => item.id === id)
    if (index >= 0) setActive(index)
    pendingActiveId.current = null
  }, [flatItems])

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
    if (!item.keepOpen) onClose()
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
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
      returnFocusRef={returnFocusRef}
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
          {!visibleGroups.length && !isSearching && (
            <div className="cm-empty" role="status">{t('commandMenu.empty.prompt')}</div>
          )}
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
                           order guard reads (issue 479); `aria-describedby` points at the
                           PARENT ROW ITSELF (Work, Café), so the row is announced "Tasks … Work" and the pair
                           that share `/work/tasks` stop sounding like two unrelated options.

                           Not `aria-level`: it is not a supported property of `role="option"`
                           (ARIA 1.2 — option's properties are aria-selected/checked/posinset/
                           setsize plus the global set), so it would be dropped, and the listbox
                           has no tree to level. Not an accessible-NAME suffix either: the visible
                           label is the name a voice-control user speaks and the name the rail and
                           drawer give the same destination, and the parent is supplementary
                           information about the row — which is what `aria-describedby` is for.
                           The idref resolves only while the parent row is rendered, which is the
                           same condition that marks the child rung. */
                        data-to={item.keepOpen ? undefined : item.to}
                        data-child={item.child ? 'true' : undefined}
                        aria-describedby={item.child ? item.parentId : undefined}
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
