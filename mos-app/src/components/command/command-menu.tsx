import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchTasksByTitle } from '@/lib/db/tasks'
import { useAuth } from '@/auth/use-auth'
import { can } from '@/lib/capabilities'
import {
  HomeIcon, WorkIcon, SignalsIcon, TasksIcon, WorkLineIcon, ObjectiveIcon,
  EventsIcon, MoneyIcon, InboxIcon, CafeIcon,
} from '@/shell/icons'
import { DeputyIcon } from '@/shell/top-bar'
import { useAgentRuntime } from '@/lib/agent/runtime/AgentRuntimeContext'
import { useT } from '@/i18n/use-t'
import { readRecentTasks, pushRecentTask } from './recent-tasks'
import './command-menu.css'

export type CommandMenuProps = {
  open: boolean
  onClose: () => void
  /** Opens the Signal composer (C1's useSignalComposer().open(), passed down by app-shell so the
   * palette stays a pure presentational consumer — AC-428/FR-417: never a route navigation). */
  onShareSignal: () => void
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

type RecordsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; rows: { id: string; title: string }[] }
  | { status: 'error' }

// Universal actions (stable order — Rule 7 forbids reordering them). verb+object.
// Ask Deputy opens the AssistantPanel; Share Signal calls onShareSignal (opens the shared Signal
// composer host, C1 — never a route navigation, AC-428/FR-417); Create Task navigates /work/tasks/new.
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'

function matches(label: string, q: string): boolean {
  return label.toLowerCase().includes(q.trim().toLowerCase())
}

// ⌘K command palette (ADR-0013 D4 / Redesign Step 2 §8). Centered modal (e7
// presentation); contents = universal actions + Navigate + Recent + async record
// search. a11y: role=dialog + aria-modal + focus trap + Esc (returns focus).
export function CommandMenu({ open, onClose, onShareSignal }: CommandMenuProps): React.JSX.Element | null {
  const navigate = useNavigate()
  const auth = useAuth()
  const t = useT()
  const { openPanel } = useAgentRuntime()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [records, setRecords] = useState<RecordsState>({ status: 'idle' })

  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const invokerRef = useRef<HTMLElement | null>(null)

  const accessRoles: string[] = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  const moneyAuthorized = accessRoles.includes('finance') || accessRoles.includes('admin')
  // Step 8 (catalog re-home, FR-802/803): the Work manage-mode screens are capability-gated
  // (90%-employee-first) and were only reachable from the desktop rail. Mirrors the existing
  // Signals entry below — a Work child reachable via ⌘K, not the phone More menu.
  const projectsAuthorized = can(accessRoles, 'workline.manage')
  const objectivesAuthorized = can(accessRoles, 'objective.manage')

  const trimmed = query.trim()
  const isSearching = trimmed.length > 0

  // Build the action/navigate registries (Memoized so `run` closures stay stable per render).
  const universalActions = useMemo<CommandItem[]>(
    () => [
      { id: 'a-deputy', label: t('commandMenu.action.askDeputy'), Icon: DeputyIcon, kind: 'action', run: () => openPanel() },
      { id: 'a-signal', label: t('commandMenu.action.shareSignal'), Icon: SignalsIcon, kind: 'action', run: onShareSignal },
      { id: 'a-task', label: t('commandMenu.action.createTask'), Icon: TasksIcon, kind: 'action', to: '/work/tasks/new' },
    ],
    [openPanel, onShareSignal, t],
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
    if (objectivesAuthorized) {
      items.push({ id: 'n-objectives', label: t('nav.work.objectives'), Icon: ObjectiveIcon, kind: 'navigate', to: '/work/objectives' })
    }
    items.push(
      { id: 'n-events', label: t('dest.events'), Icon: EventsIcon, kind: 'navigate', to: '/events' },
      { id: 'n-money', label: t('dest.money'), Icon: MoneyIcon, kind: 'navigate', to: '/money', gated: true },
      { id: 'n-inbox', label: t('dest.inbox'), Icon: InboxIcon, kind: 'navigate', to: '/inbox' },
      { id: 'n-cafe', label: t('dest.cafe'), Icon: CafeIcon, kind: 'navigate', to: '/cafe' },
    )
    return items
  }, [t, projectsAuthorized, objectivesAuthorized])

  const visibleNavigate = useMemo(
    () => navigateItems.filter((i) => !i.gated || moneyAuthorized),
    [navigateItems, moneyAuthorized],
  )

  // ── Debounced record search (~150ms) ─────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    if (!isSearching) { setRecords({ status: 'idle' }); return }
    setRecords({ status: 'loading' })
    let cancelled = false
    const t = setTimeout(() => {
      searchTasksByTitle(trimmed)
        .then((rows) => { if (!cancelled) setRecords({ status: 'ready', rows }) })
        .catch(() => { if (!cancelled) setRecords({ status: 'error' }) })
    }, 150)
    return () => { cancelled = true; clearTimeout(t) }
  }, [open, trimmed, isSearching])

  // ── Group model ──────────────────────────────────────────────────────────────
  const groups = useMemo<ItemGroup[]>(() => {
    const out: ItemGroup[] = []
    if (!isSearching) {
      const recent = readRecentTasks().map<CommandItem>((r) => ({
        id: `recent-${r.id}`, label: r.title, Icon: TasksIcon, kind: 'record',
        to: `/work/tasks/${r.id}`, record: { id: r.id, title: r.title },
      }))
      if (recent.length) out.push({ key: 'recent', label: t('commandMenu.group.recent'), items: recent })
      out.push({ key: 'actions', label: t('commandMenu.group.actions'), items: universalActions })
      out.push({ key: 'navigate', label: t('commandMenu.group.navigate'), items: visibleNavigate })
      return out
    }
    const actions = universalActions.filter((i) => matches(i.label, trimmed))
    const recordRows = records.status === 'ready' ? records.rows : []
    const recordItems = recordRows.map<CommandItem>((r) => ({
      id: `record-${r.id}`, label: r.title, Icon: TasksIcon, kind: 'record',
      to: `/work/tasks/${r.id}`, record: { id: r.id, title: r.title },
    }))
    if (records.status === 'ready' && recordItems.length) {
      out.push({ key: 'records', label: t('commandMenu.group.records'), items: recordItems })
    }
    const nav = visibleNavigate.filter((i) => matches(i.label, trimmed))
    if (nav.length) out.push({ key: 'navigate', label: t('commandMenu.group.navigate'), items: nav })
    if (actions.length) out.push({ key: 'actions', label: t('commandMenu.group.actions'), items: actions })
    return out
  }, [isSearching, trimmed, records, universalActions, visibleNavigate, t])

  const flatItems = useMemo(() => groups.flatMap((g) => g.items), [groups])

  useEffect(() => { setActive(0) }, [trimmed])
  useEffect(() => {
    if (active > flatItems.length - 1) setActive(flatItems.length ? flatItems.length - 1 : 0)
  }, [flatItems.length, active])

  // ── Focus on open + return focus on close ────────────────────────────────────
  useEffect(() => {
    if (!open) return
    invokerRef.current = (document.activeElement as HTMLElement) ?? null
    inputRef.current?.focus()
    return () => { invokerRef.current?.focus?.() }
  }, [open])

  // ── Focus trap ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    if (!panel) return
    function onTrap(e: KeyboardEvent) {
      if (e.key !== 'Tab') return
      const focusable = Array.from(panel!.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter((el) => el.offsetParent !== null || el === document.activeElement)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    panel.addEventListener('keydown', onTrap)
    return () => panel.removeEventListener('keydown', onTrap)
  }, [open])

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
      case 'ArrowDown': e.preventDefault(); setActive((i) => Math.min(i + 1, flatItems.length - 1)); break
      case 'ArrowUp': e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); break
      case 'Home': e.preventDefault(); setActive(0); break
      case 'End': e.preventDefault(); setActive(Math.max(flatItems.length - 1, 0)); break
      case 'Enter': e.preventDefault(); activate(flatItems[active]); break
      default: break
    }
  }

  const activeId = flatItems[active]?.id

  return (
    <div className="cm-root">
      <div className="cm-scrim" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        className="cm-panel"
        role="dialog"
        aria-modal="true"
        aria-label={t('commandMenu.title')}
      >
        <div className="cm-input">
          <span className="cm-input-icon" aria-hidden="true">⌕</span>
          <input
            ref={inputRef}
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
          <kbd className="cm-foot-key">esc</kbd>
        </div>

        <ul className="cm-body" id="cm-list" role="listbox" aria-label="Command results">
          {isSearching && records.status === 'error' && (
            <li className="cm-records-error">{t('commandMenu.error.searchRecords')}</li>
          )}
          {isSearching && records.status === 'loading' && (
            <li className="cm-item" data-testid="cm-records-skeleton" aria-hidden="true">
              <span className="cm-item-glyph" aria-hidden="true"><TasksIcon /></span>
              <span className="cm-skeleton" />
            </li>
          )}
          {isSearching && flatItems.length === 0 && records.status !== 'loading' && (
            <li className="cm-empty">{t('commandMenu.empty.noMatches', { query: trimmed })}</li>
          )}

          {groups.map((group) => (
            <li key={group.key}>
              <div className="cm-group text-muted-foreground" aria-hidden="true">{group.label}</div>
              <ul role="presentation" className="cm-group-list">
                {group.items.map((item) => {
                  const isActive = item.id === activeId
                  return (
                    <li
                      key={item.id}
                      id={item.id}
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
                    </li>
                  )
                })}
              </ul>
            </li>
          ))}
        </ul>

        <div className="cm-foot" aria-hidden="true">
          <span><span className="cm-foot-key">↑↓</span> {t('commandMenu.footer.navigate')}</span>
          <span><span className="cm-foot-key">↵</span> {t('commandMenu.footer.open')}</span>
          <span><span className="cm-foot-key">esc</span> {t('commandMenu.footer.close')}</span>
        </div>
      </div>
    </div>
  )
}
