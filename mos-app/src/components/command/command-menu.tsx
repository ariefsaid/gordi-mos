import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchTasksByTitle } from '@/lib/db/tasks'
import { readRecentTasks, pushRecentTask } from './recent-tasks'
import './command-menu.css'

export type CommandMenuProps = {
  open: boolean
  onClose: () => void
}

// A flat, activatable item. Records carry the task ref so activation can record Recent.
type CommandItem = {
  id: string
  label: string
  glyph: string
  action: boolean
  to: string
  meta?: string
  record?: { id: string; title: string }
}

type ItemGroup = { key: string; label: string; items: CommandItem[] }

type RecordsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; rows: { id: string; title: string }[] }
  | { status: 'error' }

const QUICK_ACTIONS: CommandItem[] = [
  { id: 'qa-new-task', label: 'New task', glyph: '＋', action: true, to: '/tasks/new', meta: '⌘N' },
  { id: 'qa-weekly', label: 'Write weekly update', glyph: '✎', action: true, to: '/updates' },
  { id: 'qa-log', label: 'Add Daily Log entry', glyph: '▤', action: true, to: '/ops/new' },
]

const NAVIGATE: CommandItem[] = [
  { id: 'nav-my-week', label: 'My Week', glyph: '◫', action: false, to: '/' },
  { id: 'nav-tasks', label: 'Tasks', glyph: '☰', action: false, to: '/tasks' },
  { id: 'nav-updates', label: 'Weekly updates', glyph: '✎', action: false, to: '/updates' },
  { id: 'nav-log', label: 'Daily Log', glyph: '▤', action: false, to: '/ops' },
]

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'

function matches(label: string, q: string): boolean {
  return label.toLowerCase().includes(q.trim().toLowerCase())
}

/**
 * The ⌘K command palette (ADR-0013 D4). One overlay, every routine MOS job a keystroke
 * away: jump to a record, run a quick action, or navigate. Default = Recent + Quick
 * actions + Navigate; typing filters Navigate/Actions and async-loads matching Records.
 *
 * a11y: role=dialog + aria-modal + focus trap + Esc (returns focus to the trigger).
 * The input is a combobox; the body is a listbox; the active option is tracked via
 * aria-activedescendant while focus STAYS in the input (↑↓/Home/End move, ↵ activates).
 */
export function CommandMenu({ open, onClose }: CommandMenuProps): React.JSX.Element | null {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [records, setRecords] = useState<RecordsState>({ status: 'idle' })

  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const invokerRef = useRef<HTMLElement | null>(null)

  const trimmed = query.trim()
  const isSearching = trimmed.length > 0

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
        id: `recent-${r.id}`, label: r.title, glyph: '⊞', action: false,
        to: `/tasks/${r.id}`, record: { id: r.id, title: r.title },
      }))
      if (recent.length) out.push({ key: 'recent', label: 'Recent', items: recent })
      out.push({ key: 'actions', label: 'Quick actions', items: QUICK_ACTIONS })
      out.push({ key: 'navigate', label: 'Navigate', items: NAVIGATE })
      return out
    }
    const actions = QUICK_ACTIONS.filter((i) => matches(i.label, trimmed))
    const recordRows = records.status === 'ready' ? records.rows : []
    const recordItems = recordRows.map<CommandItem>((r) => ({
      id: `record-${r.id}`, label: r.title, glyph: '⊞', action: false,
      to: `/tasks/${r.id}`, record: { id: r.id, title: r.title },
    }))
    if (records.status === 'ready' && recordItems.length) {
      out.push({ key: 'records', label: 'Records', items: recordItems })
    }
    const nav = NAVIGATE.filter((i) => matches(i.label, trimmed))
    if (nav.length) out.push({ key: 'navigate', label: 'Navigate', items: nav })
    if (actions.length) out.push({ key: 'actions', label: 'Quick actions', items: actions })
    return out
  }, [isSearching, trimmed, records])

  const flatItems = useMemo(() => groups.flatMap((g) => g.items), [groups])

  // Keep the active index in range whenever the item set changes.
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

  // ── Focus trap (Tab cycles within the panel) ─────────────────────────────────
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
    navigate(item.to)
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
        aria-label="Command menu"
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
            aria-label="Search tasks or run a command"
            placeholder="Search tasks, or type a command…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
          />
          <kbd className="cm-foot-key">esc</kbd>
        </div>

        <ul className="cm-body" id="cm-list" role="listbox" aria-label="Command results">
          {isSearching && records.status === 'error' && (
            <li className="cm-records-error">Couldn&apos;t search records.</li>
          )}
          {isSearching && records.status === 'loading' && (
            <li className="cm-item" data-testid="cm-records-skeleton" aria-hidden="true">
              <span className="cm-item-glyph">⊞</span>
              <span className="cm-skeleton" />
            </li>
          )}
          {isSearching && flatItems.length === 0 && records.status !== 'loading' && (
            <li className="cm-empty">No matches for “{trimmed}”.</li>
          )}

          {groups.map((group) => (
            <li key={group.key}>
              <div className="cm-group text-muted-foreground" aria-hidden="true">{group.label}</div>
              <ul role="presentation" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {group.items.map((item) => {
                  const isActive = item.id === activeId
                  return (
                    <li
                      key={item.id}
                      id={item.id}
                      role="option"
                      aria-selected={isActive}
                      className={`cm-item${item.action ? ' action' : ''}${isActive ? ' active' : ''}`}
                      onClick={() => activate(item)}
                      onMouseMove={() => {
                        const idx = flatItems.findIndex((f) => f.id === item.id)
                        if (idx >= 0) setActive(idx)
                      }}
                    >
                      <span className="cm-item-glyph" aria-hidden="true">{item.glyph}</span>
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
          <span><span className="cm-foot-key">↑↓</span> navigate</span>
          <span><span className="cm-foot-key">↵</span> open</span>
          <span><span className="cm-foot-key">esc</span> close</span>
        </div>
      </div>
    </div>
  )
}
