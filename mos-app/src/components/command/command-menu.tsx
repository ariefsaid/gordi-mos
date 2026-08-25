import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchTasksByTitle } from '@/lib/db/tasks'
import { searchSignalsByBody } from '@/lib/db/signals'
import { searchFollowUpsByCounterparty } from '@/lib/db/follow-ups'
import { SHOW_FOLLOWUPS } from '@/config/features'
import { useAuth } from '@/auth/use-auth'
import { can, canViewRevenue } from '@/lib/capabilities'
import { isShipGated } from '@/lib/ship-gate'
import { viewerAdmittedToRoute } from '@/shell/destinations'
import { CAFE_LOG_ROUTE } from '@/lib/db/home-attention-data'
import {
  HomeIcon, WorkIcon, SignalsIcon, TasksIcon, WorkLineIcon, ObjectiveIcon,
  MoneyIcon, InboxIcon, CafeIcon,
} from '@/shell/icons'
import { DeputyIcon } from '@/shell/top-bar'
import { useAgentRuntime } from '@/lib/agent/runtime/AgentRuntimeContext'
import { useIsCoarsePointer } from '@/shell/use-is-coarse-pointer'
import { useT } from '@/i18n/use-t'
import { ModalShell } from '@/components/ui/modal-shell'
import { readRecentTasks, pushRecentTask } from './recent-tasks'
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
   * (Recent · Actions · Navigate). 'launcher' — the phone `+` reduced create-set: the default
   * (empty-query) view is the universal Actions only, NOT the full palette. Typing escalates to
   * the shared record search in BOTH modes (OD-46 "More opens the full authorized object palette").
   */
  mode?: CommandMenuMode
}

// A flat, activatable item. `kind` discriminates: 'action' (runs a callback),
// 'navigate' (goes to `to`), 'record' (a Task row → pushRecent + navigate canonical).
// `run` extends the existing activate() so universal actions (Ask Deputy / Share
// Signal) that are not pure navigations can dispatch (D-PLN-7). `gated` hides an
// item (Money navigate) when the viewer is unauthorized.
type CommandItem = {
  id: string
  label: string
  /** SVG icon from the app icon system (parity A1 — the palette is one monochrome set, never emoji) */
  Icon: React.ComponentType
  kind: 'action' | 'navigate' | 'record'
  to?: string
  run?: () => void
  meta?: string
  gated?: boolean
  record?: { id: string; title: string }
}

type ItemGroup = { key: string; label: string; items: CommandItem[] }

// OD-REDESIGN-91 #4/B2: the palette searches ALL record kinds now — Tasks + Signals +
// AR Follow-ups — so a hit carries its kind (drives the row icon, route, and kind label).
type RecordKind = 'task' | 'signal' | 'follow-up'
type RecordHit = { id: string; title: string; kind: RecordKind }

type RecordsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; rows: RecordHit[] }
  | { status: 'error' }

// Universal actions (stable order — Rule 7 forbids reordering them). verb+object.
// Ask Deputy opens the AssistantPanel; Share Signal calls onShareSignal (opens the shared Signal
// composer host — never a route navigation, AC-428/FR-417); Create Task navigates /work/tasks/new.
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
// route is deleted (DD-WAY-36), so there is no record page to open.
const RECORD_KIND_CONFIG: Record<RecordKind, { Icon: React.ComponentType; to: (id: string) => string; kindLabelKey: 'commandMenu.kind.task' | 'commandMenu.kind.signal' | 'commandMenu.kind.followUp' }> = {
  task: { Icon: TasksIcon, to: (id) => `/work/tasks/${id}`, kindLabelKey: 'commandMenu.kind.task' },
  signal: { Icon: SignalsIcon, to: (id) => `/work/signals/${id}`, kindLabelKey: 'commandMenu.kind.signal' },
  'follow-up': { Icon: MoneyIcon, to: () => '/money/follow-ups', kindLabelKey: 'commandMenu.kind.followUp' },
}

// ⌘K command palette (ADR-0013 D4 / Redesign Step 2 §8). Centered modal (e7
// presentation); contents = universal actions + Navigate + Recent + async record
// search. a11y: role=dialog + aria-modal + focus trap + Esc (returns focus) — all
// owned by ModalShell, the single interaction owner for centered dialogs.
export function CommandMenu({ open, onClose, onShareSignal, mode = 'search' }: CommandMenuProps): React.JSX.Element | null {
  const navigate = useNavigate()
  const auth = useAuth()
  const t = useT()
  const { openPanel } = useAgentRuntime()
  // OD-REDESIGN-91 #41 (G5): the ⌘K keyboard hints (footer + the esc chip) are meaningless on a
  // touch device — hide them on a coarse pointer so a phone launcher shows no un-pressable keys.
  const isCoarse = useIsCoarsePointer()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [records, setRecords] = useState<RecordsState>({ status: 'idle' })

  const optionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const accessRoles: string[] = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  // DELIBERATE DIVERGENCE FROM v4: v4 gated this entry on finance|admin. On this line the /money
  // route and the rail entry are both gated on REVENUE_VIEW_ROLES (ADR-0051 D4 — manager holds the
  // financial VIEW tier, supervisor the revenue-only one), so v4's narrower gate would hide from
  // the palette a destination the rail offers and the router admits. One gate, read through the
  // same helper destinations.tsx and the router read.
  const moneyAuthorized = canViewRevenue(accessRoles)
  // Step 8 (catalog re-home, FR-802/803): the Work manage-mode screens are capability-gated
  // (90%-employee-first) and were only reachable from the desktop rail. Mirrors the existing
  // Signals entry below — a Work child reachable via ⌘K, not the phone More menu.
  const projectsAuthorized = can(accessRoles, 'workline.manage')
  // #407 — the floor's one-tap capture path. The Daily Log retirement (#226/#405) repointed
  // Home's capture CTA at /cafe/log, but on a component only the DEV-only fossil Home mounted —
  // the shipped shell offered no capture entry at all. The Actions group (and so the phone `+`
  // launcher, whose reduced set IS this group) carries the Café log entry for viewers the
  // /cafe/log ROUTE admits, read through the ONE route-admission seam Home's failed-checks band
  // already uses (viewerAdmittedToRoute — OD-WAY-51: navigation mirrors what the route admits,
  // never job-role-name matching).
  const cafeLogAdmitted = viewerAdmittedToRoute(CAFE_LOG_ROUTE, accessRoles)

  const trimmed = query.trim()
  const isSearching = trimmed.length > 0

  // Build the action/navigate registries (Memoized so `run` closures stay stable per render).
  // The three universal actions keep their stable order (Rule 7); the gated Café log entry
  // (#407) appends after them, present exactly when the /cafe/log route admits the viewer.
  const actionItems = useMemo<CommandItem[]>(
    () => {
      const items: CommandItem[] = [
        { id: 'a-deputy', label: t('commandMenu.action.askDeputy'), Icon: DeputyIcon, kind: 'action', run: () => openPanel() },
        { id: 'a-signal', label: t('commandMenu.action.shareSignal'), Icon: SignalsIcon, kind: 'action', run: onShareSignal },
        { id: 'a-task', label: t('commandMenu.action.createTask'), Icon: TasksIcon, kind: 'action', to: '/work/tasks/new' },
      ]
      if (cafeLogAdmitted) {
        items.push({ id: 'a-cafe-log', label: t('commandMenu.action.logCafe'), Icon: CafeIcon, kind: 'action', to: CAFE_LOG_ROUTE })
      }
      return items
    },
    [openPanel, onShareSignal, t, cafeLogAdmitted],
  )

  const navigateItems = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [
      { id: 'n-home', label: t('dest.home'), Icon: HomeIcon, kind: 'navigate', to: '/' },
      { id: 'n-work', label: t('dest.work'), Icon: WorkIcon, kind: 'navigate', to: '/work/tasks' },
      { id: 'n-signals', label: t('nav.signals'), Icon: SignalsIcon, kind: 'navigate', to: '/work/signals' },
    ]
    if (projectsAuthorized) {
      items.push({ id: 'n-projects', label: t('nav.work.projects'), Icon: WorkLineIcon, kind: 'navigate', to: '/work/projects' })
    }
    // OD-V4-1 (owner-ratified 2026-07-27): Objectives are visible to everyone — this NAVIGATE
    // command carries no capability gate, mirroring the destinations.tsx rail and the router
    // (mos.objectives SELECT RLS has no role check). Write stays gated inside the page.
    items.push({ id: 'n-objectives', label: t('nav.work.objectives'), Icon: ObjectiveIcon, kind: 'navigate', to: '/work/objectives' })
    items.push(
      { id: 'n-money', label: t('dest.money'), Icon: MoneyIcon, kind: 'navigate', to: '/money', gated: true },
      { id: 'n-inbox', label: t('dest.inbox'), Icon: InboxIcon, kind: 'navigate', to: '/inbox' },
      { id: 'n-cafe', label: t('dest.cafe'), Icon: CafeIcon, kind: 'navigate', to: '/cafe' },
    )
    return items
  }, [t, projectsAuthorized])

  const visibleNavigate = useMemo(
    () => navigateItems.filter((i) => !i.gated || moneyAuthorized),
    [navigateItems, moneyAuthorized],
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
      ])
        .then(([tasks, signals, followUps]) => {
          if (!cancelled) setRecords({ status: 'ready', rows: [...tasks, ...signals, ...followUps] })
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
        out.push({ key: 'actions', label: t('commandMenu.group.actions'), items: actionItems })
        return out
      }
      const recent = readRecentTasks().map<CommandItem>((r) => ({
        id: `recent-${r.id}`, label: r.title, Icon: TasksIcon, kind: 'record',
        to: `/work/tasks/${r.id}`, record: { id: r.id, title: r.title },
      }))
      if (recent.length) out.push({ key: 'recent', label: t('commandMenu.group.recent'), items: recent })
      out.push({ key: 'actions', label: t('commandMenu.group.actions'), items: actionItems })
      out.push({ key: 'navigate', label: t('commandMenu.group.navigate'), items: visibleNavigate })
      return out
    }
    const actions = actionItems.filter((i) => matches(i.label, trimmed))
    const recordRows = records.status === 'ready' ? records.rows : []
    const recordItems = recordRows.map<CommandItem>((r) => {
      const cfg = RECORD_KIND_CONFIG[r.kind]
      return {
        // Namespace the id by kind — a Task and a Signal can share a uuid across tables.
        id: `record-${r.kind}-${r.id}`,
        label: r.title,
        Icon: cfg.Icon,
        kind: 'record',
        to: cfg.to(r.id),
        // Rows carry their kind (OD-REDESIGN-91 #4/B2): a muted kind label rides the row.
        meta: t(cfg.kindLabelKey),
        // Only Tasks feed the task-scoped Recent ring buffer; Signals/Follow-ups don't pollute it.
        record: r.kind === 'task' ? { id: r.id, title: r.title } : undefined,
      }
    })
    if (records.status === 'ready' && recordItems.length) {
      out.push({ key: 'records', label: t('commandMenu.group.records'), items: recordItems })
    }
    const nav = visibleNavigate.filter((i) => matches(i.label, trimmed))
    if (nav.length) out.push({ key: 'navigate', label: t('commandMenu.group.navigate'), items: nav })
    if (actions.length) out.push({ key: 'actions', label: t('commandMenu.group.actions'), items: actions })
    return out
  }, [isSearching, trimmed, records, actionItems, visibleNavigate, t, mode])

  // The ship gate (#444), applied at the ONE seam every palette row passes through, rather than
  // as a `gated` flag per entry. The palette is a navigation surface like the rail, and OD-WAY-51
  // holds here too: it must never offer a door the router has closed. Applied to the assembled
  // groups so it covers Navigate rows, record hits (an AR Follow-up hit points into /money) and
  // anything a later entry adds — a new row cannot forget to ask. A group emptied by the gate is
  // dropped whole, so no heading survives with nothing under it.
  const visibleGroups = useMemo(
    () =>
      groups
        .map((g) => ({ ...g, items: g.items.filter((i) => i.to == null || !isShipGated(i.to)) }))
        .filter((g) => g.items.length > 0),
    [groups],
  )

  const flatItems = useMemo(() => visibleGroups.flatMap((g) => g.items), [visibleGroups])
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
            {flatItems.length > 0 ? visibleGroups.map((group) => (
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
                        className={`cm-item${item.kind === 'action' ? ' action' : ''}${isActive ? ' active' : ''}`}
                        onClick={() => activate(item)}
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
