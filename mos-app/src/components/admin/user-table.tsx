// UserTable — the people list (desktop table + mobile cards, single-render reflow).
// Design-plan §2, §4.1, §4.2, §4.5, §4.6. AC-060.
// LoginStatusPill maps login status to Pill tones.
// Responsive: <table> at ≥768px (md), stacked cards below (useIsDesktop).
// Empty predicate: non-self count = 0.
// PersonAction union (item 12): compile-time safety — bad strings fail at type-check.
// Last-admin guard (item 3, FR-041): disable/archive disabled for sole active admin.
// ⋯ menu keyboard (item 8): Esc-to-close, outside-click-close, arrow-key navigation.
// Mobile action sheet (item 1): Manage button opens same actions as desktop ⋯ menu.
// PeopleToolbar (§2.1): search-mini + segmented status filter. Filter is client-side.
// No-match empty state (§4.1): distinct from org-empty "Just you so far".

import { useState, useRef, useEffect, useLayoutEffect, useCallback, useId, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { shouldFlipUp } from './menu-position'
import { useMenuPopover } from '@/lib/use-menu-popover'
import { Pill } from '@/components/ui/pill'
import type { PillTone } from '@/components/ui/pill'
import { Tag } from '@/components/ui/tag'
import type { TagColor } from '@/components/ui/tag'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/state-kit'
import { ViewTabs } from '@/components/ui/view-tabs'
import { usePeopleListPresentsCards } from './use-people-list-presents-cards'
import { roleLabel } from '@/lib/db/admin-users.types'
import type { AdminPersonRow, LoginStatus } from '@/lib/db/admin-users.types'
import './people-toolbar.css'

// ── PersonAction union type (item 12) ────────────────────────────────────────
// Compile-time contract: bad action strings fail type-check (caught the 'manage' bug).
export type PersonAction =
  | 'manage-roles'
  | 'reset-password'
  | 'create-login'
  | 'disable-login'
  | 'enable-login'
  | 'archive'
  | 'restore'

// ── LoginStatusPill ───────────────────────────────────────────────────────────

const LOGIN_TONE: Record<LoginStatus, PillTone> = {
  none: 'neutral',
  active: 'success',
  disabled: 'warning',
}

const LOGIN_LABEL: Record<LoginStatus, string> = {
  none: 'No login',
  active: 'Active',
  disabled: 'Disabled',
}

function LoginStatusPill({ status }: { status: LoginStatus }) {
  return (
    <Pill tone={LOGIN_TONE[status]}>
      {LOGIN_LABEL[status]}
    </Pill>
  )
}

// ── RoleChips ─────────────────────────────────────────────────────────────────

// Access-role tags are neutral: DESIGN.md documents a per-role color scheme only for
// Objective/Project/Process RACI governance chips (§Governance role chips) — NOT for admin
// access roles — and The One Blue Rule reserves saturated blue for the primary action alone.
// So ops_lead reads neutral like every other role (was 'sky', an undocumented lone blue that
// sat next to the primary '+ Add person' button). V3 sweep F3.
const ROLE_COLOR: Record<string, TagColor> = {
  admin: 'slate',
  finance: 'slate',
  ops_lead: 'slate',
  member: 'gray',
  manager: 'gray',
}

function RoleChips({ roles }: { roles: string[] }) {
  if (roles.length === 0) {
    return (
      <span style={{ color: 'var(--muted-foreground)' }} aria-label="No roles">
        —
      </span>
    )
  }
  return (
    <span className="flex flex-wrap gap-1">
      {roles.map((role) => (
        <Tag key={role} color={ROLE_COLOR[role] ?? 'gray'}>
          {roleLabel(role)}
        </Tag>
      ))}
    </span>
  )
}

// ── Last-admin detection helper ───────────────────────────────────────────────
// A person is the "last active admin" when they are the only person in the list
// who has an 'admin' role, an active login, and is not archived.
function isLastActiveAdmin(person: AdminPersonRow, people: AdminPersonRow[]): boolean {
  const activeAdminCount = people.filter(
    (p) => p.access_roles.includes('admin') && p.login === 'active' && !p.archived_at,
  ).length
  const personIsActiveAdmin =
    person.access_roles.includes('admin') && person.login === 'active' && !person.archived_at
  return personIsActiveAdmin && activeAdminCount === 1
}

// ── PersonActionMenu — shared between desktop ⋯ and mobile action sheet ──────
// Renders a role="menu" list of per-person actions, gated by person state.
// The dismissal + keyboard contract (focus-enter, Arrow/Home/End, Esc, outside-click)
// is owned by the shared useMenuPopover hook on the HOST (desktop portal / mobile sheet),
// per interaction-contract.md I3 — this component is pure presentation of the items.

interface PersonActionMenuProps {
  person: AdminPersonRow
  people: AdminPersonRow[]
  onAction: (action: PersonAction, person: AdminPersonRow) => void
  onClose: () => void
  /** Unique ID for aria-labelledby connection */
  labelledById?: string
}

function PersonActionMenu({
  person,
  people,
  onAction,
  onClose,
  labelledById,
}: PersonActionMenuProps) {
  const lastAdmin = isLastActiveAdmin(person, people)

  function dispatch(action: PersonAction) {
    onClose()
    onAction(action, person)
  }

  return (
    <div
      role="menu"
      aria-labelledby={labelledById}
      className="rounded-lg py-1"
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-overlay)',
      }}
    >
      <button
        role="menuitem"
        type="button"
        tabIndex={0}
        className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none"
        onClick={() => dispatch('manage-roles')}
      >
        Manage roles
      </button>

      <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

      {person.login !== 'none' && (
        <button
          role="menuitem"
          type="button"
          tabIndex={0}
          className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none"
          onClick={() => dispatch('reset-password')}
        >
          Reset password
        </button>
      )}

      {person.login === 'active' && (
        <button
          role="menuitem"
          type="button"
          tabIndex={0}
          aria-disabled={lastAdmin ? 'true' : undefined}
          title={lastAdmin ? "Can't remove the last admin" : undefined}
          className={[
            'w-full px-3 py-1.5 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none',
            lastAdmin ? 'opacity-50 cursor-not-allowed' : '',
          ].filter(Boolean).join(' ')}
          onClick={() => !lastAdmin && dispatch('disable-login')}
        >
          Disable login
        </button>
      )}

      {person.login === 'disabled' && (
        <button
          role="menuitem"
          type="button"
          tabIndex={0}
          className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none"
          onClick={() => dispatch('enable-login')}
        >
          Enable login
        </button>
      )}

      {person.login === 'none' && (
        <button
          role="menuitem"
          type="button"
          tabIndex={0}
          className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none"
          onClick={() => dispatch('create-login')}
        >
          Create login
        </button>
      )}

      <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

      {person.archived_at ? (
        <button
          role="menuitem"
          type="button"
          tabIndex={0}
          className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none"
          onClick={() => dispatch('restore')}
        >
          Restore
        </button>
      ) : (
        <button
          role="menuitem"
          type="button"
          tabIndex={0}
          aria-disabled={lastAdmin ? 'true' : undefined}
          title={lastAdmin ? "Can't remove the last admin" : undefined}
          className={[
            'w-full px-3 py-1.5 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none',
            lastAdmin ? 'opacity-50 cursor-not-allowed' : '',
          ].filter(Boolean).join(' ')}
          style={{ color: lastAdmin ? undefined : 'var(--destructive)' }}
          onClick={() => !lastAdmin && dispatch('archive')}
        >
          Archive
        </button>
      )}
    </div>
  )
}

// ── Desktop PersonActions — ⋯ popover button (item 8) ───────────────────────

interface PersonActionsProps {
  person: AdminPersonRow
  people: AdminPersonRow[]
  onAction: (action: PersonAction, person: AdminPersonRow) => void
}

// PortalMenuPosition: computed when the menu opens, drives the fixed wrapper style.
interface MenuPosition {
  top?: number
  bottom?: number
  right: number
}

const MENU_MIN_WIDTH = 160
const MENU_SIDE_MARGIN = 8

const ESTIMATED_MENU_HEIGHT = 200

function PersonActions({ person, people, onAction }: PersonActionsProps) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<MenuPosition | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuContainerRef = useRef<HTMLDivElement>(null)
  const btnId = useId()
  const close = useCallback(() => setOpen(false), [])

  // Compute fixed position from trigger's bounding rect. Menu height is estimated;
  // an estimate of ~200px is safe — flip recalculates on open, and scroll/resize
  // closes the menu so drift is never visible.
  const computePosition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    // Right-align to the trigger's right edge; clamp so it doesn't overflow left.
    const right = vw - rect.right
    const clampedRight = Math.max(MENU_SIDE_MARGIN, Math.min(right, vw - MENU_MIN_WIDTH - MENU_SIDE_MARGIN))
    if (shouldFlipUp(rect, ESTIMATED_MENU_HEIGHT, vh)) {
      setPosition({ bottom: vh - rect.top, right: clampedRight })
    } else {
      setPosition({ top: rect.bottom, right: clampedRight })
    }
  }, [])

  // Measure synchronously when the menu opens so the portal mounts positioned (and so
  // the container ref is available for useMenuPopover's focus-enter on the same commit).
  useLayoutEffect(() => {
    if (open) computePosition()
    else setPosition(null)
  }, [open, computePosition])

  // I3: the shared menu/popover contract — focus-enter, Arrow/Home/End, Esc, outside-click.
  useMenuPopover(open, close, menuContainerRef, triggerRef)

  // Position-only concern (not part of I3): dismiss on scroll/resize to avoid drift.
  useEffect(() => {
    if (!open) return
    const onScrollOrResize = () => setOpen(false)
    window.addEventListener('scroll', onScrollOrResize, { capture: true })
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, { capture: true })
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [open])

  // Return focus to the trigger when the menu closes (Esc / outside-click / select).
  // Guarded by `wasOpenRef` so this never fires on a component's FIRST mount (e.g. a
  // row entering the filtered set for the first time, `open` starts false too) — that
  // stole focus away from whatever the user was actually interacting with (I7 defect,
  // caught by the People status-filter roving-tabindex/Arrow/Home/End journey).
  const wasOpenRef = useRef(false)
  useEffect(() => {
    if (open) {
      wasOpenRef.current = true
      return
    }
    if (wasOpenRef.current) triggerRef.current?.focus()
  }, [open])

  return (
    <div>
      <button
        ref={triggerRef}
        id={btnId}
        type="button"
        aria-label={`More actions for ${person.full_name}`}
        aria-haspopup="true"
        aria-expanded={open}
        // DO-22(a) (census admin-people P2-A): persistent low-emphasis rest state — the old
        // `opacity-0` hover-reveal made the row's ONLY action door invisible at rest and
        // unreachable without hover.
        className="rounded-sm p-1 opacity-60 group-hover/row:opacity-100 focus:opacity-100 hover:opacity-100"
        style={{ color: 'var(--muted-foreground)' }}
        onClick={() => setOpen((v) => !v)}
      >
        ⋯
      </button>
      {open && createPortal(
        <div
          ref={menuContainerRef}
          style={{
            position: 'fixed',
            zIndex: 'var(--z-popover)',
            minWidth: MENU_MIN_WIDTH,
            top: position?.top,
            bottom: position?.bottom,
            right: position?.right,
            // Hidden for the single synchronous frame before useLayoutEffect measures.
            visibility: position ? 'visible' : 'hidden',
          }}
        >
          <PersonActionMenu
            person={person}
            people={people}
            onAction={onAction}
            onClose={close}
            labelledById={btnId}
          />
        </div>,
        document.body,
      )}
    </div>
  )
}

// ── Mobile MobileManageSheet — full action sheet triggered by "Manage" (item 1) ──

interface MobileManageSheetProps {
  person: AdminPersonRow
  people: AdminPersonRow[]
  onAction: (action: PersonAction, person: AdminPersonRow) => void
}

function MobileManageSheet({ person, people, onAction }: MobileManageSheetProps) {
  const [open, setOpen] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const close = useCallback(() => setOpen(false), [])

  // I3: the same shared menu/popover contract as the desktop ⋯ (focus-enter, Arrow/
  // Home/End, Esc, outside-click) — the sheet IS the menu container here.
  useMenuPopover(open, close, sheetRef, triggerRef)

  // Return focus to the trigger on close. Guarded by `wasOpenRef` so this never fires
  // on first mount (same I7 defect class as the desktop ⋯ menu above).
  const wasOpenRef = useRef(false)
  useEffect(() => {
    if (open) {
      wasOpenRef.current = true
      return
    }
    if (wasOpenRef.current) triggerRef.current?.focus()
  }, [open])

  return (
    <>
      {/* Native button for ref forwarding (Button primitive doesn't expose ref) */}
      <button
        ref={triggerRef}
        type="button"
        className="btn btn-outline w-full"
        style={{ minHeight: 44 }}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Manage ${person.full_name}`}
      >
        Manage
      </button>
      {open && (
        <div ref={sheetRef} className="mt-1">
          <PersonActionMenu
            person={person}
            people={people}
            onAction={onAction}
            onClose={() => setOpen(false)}
          />
        </div>
      )}
    </>
  )
}

// ── DesktopTable ──────────────────────────────────────────────────────────────

function DesktopTable({
  people,
  onAction,
}: {
  people: AdminPersonRow[]
  onAction: (action: PersonAction, person: AdminPersonRow) => void
}) {
  return (
    <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--border)', height: 38 }}>
          <th
            scope="col"
            className="text-left px-4 text-xs font-semibold uppercase"
            style={{ color: 'var(--muted-foreground)', letterSpacing: '0.06em', width: '50%' }}
          >
            Person
          </th>
          <th
            scope="col"
            className="text-left px-4 text-xs font-semibold uppercase"
            style={{ color: 'var(--muted-foreground)', letterSpacing: '0.06em', width: '15%' }}
          >
            Login
          </th>
          {/* DO-22(c) (census admin-people P3-C): rebalance — the 45% roles column held 1–2
              small chips (sparse mid-row void) while Person carried the dense content. */}
          <th
            scope="col"
            className="text-left px-4 text-xs font-semibold uppercase"
            style={{ color: 'var(--muted-foreground)', letterSpacing: '0.06em', width: '35%' }}
          >
            Access roles
          </th>
          {/* No dedicated Status column: archived rows are signalled inline on the name
              (line-through + 0.6 opacity), so a permanent 10%-width header that was blank
              for every non-archived row — the default 'All' view shows only non-archived —
              earned no screen real estate. (V3 sweep F1, fossil-delete.) */}
          <th scope="col" className="w-10" />
        </tr>
      </thead>
      <tbody>
        {people.map((person) => (
          <tr
            key={person.id}
            className="group/row hover:bg-accent/60"
            style={{ height: 54, borderBottom: '1px solid var(--border)' }}
          >
            <td className="px-4">
              <div className="flex items-center gap-2">
                <Avatar placeholder={person.full_name} size="sm" />
                <div>
                  <div
                    className="font-medium text-sm"
                    style={{
                      color: 'var(--foreground)',
                      textDecoration: person.archived_at ? 'line-through' : undefined,
                      opacity: person.archived_at ? 0.6 : undefined,
                    }}
                  >
                    {person.full_name}
                  </div>
                  {person.email && (
                    <div
                      className="text-xs"
                      style={{
                        color: 'var(--muted-foreground)',
                        fontFamily: person.email.includes('@ops.gordi.local')
                          ? 'var(--font-mono)'
                          : undefined,
                      }}
                    >
                      {person.email}
                    </div>
                  )}
                </div>
              </div>
            </td>
            <td className="px-4">
              <LoginStatusPill status={person.login} />
            </td>
            <td className="px-4">
              <RoleChips roles={person.access_roles} />
            </td>
            <td className="px-2 text-right">
              <PersonActions person={person} people={people} onAction={onAction} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── MobileCardList ────────────────────────────────────────────────────────────

function MobileCardList({
  people,
  onAction,
}: {
  people: AdminPersonRow[]
  onAction: (action: PersonAction, person: AdminPersonRow) => void
}) {
  return (
    <div className="flex flex-col gap-3 p-3">
      {people.map((person) => (
        <article
          key={person.id}
          className="rounded-lg p-3"
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-rest)',
          }}
        >
          {/* Head row */}
          <div className="flex items-center gap-2 mb-2">
            <Avatar placeholder={person.full_name} size="sm" />
            <div
              className="font-medium text-sm flex-1"
              style={{
                color: 'var(--foreground)',
                textDecoration: person.archived_at ? 'line-through' : undefined,
              }}
            >
              {person.full_name}
            </div>
            <LoginStatusPill status={person.login} />
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm mb-3">
            {person.email && (
              <>
                <dt className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>
                  Email
                </dt>
                <dd
                  className="text-xs"
                  style={{
                    color: 'var(--foreground)',
                    fontFamily: person.email.includes('@ops.gordi.local')
                      ? 'var(--font-mono)'
                      : undefined,
                  }}
                >
                  {person.email}
                </dd>
              </>
            )}
            <dt className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>
              Roles
            </dt>
            <dd>
              <RoleChips roles={person.access_roles} />
            </dd>
            {person.archived_at && (
              <>
                <dt className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>
                  Status
                </dt>
                <dd className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                  Archived
                </dd>
              </>
            )}
          </dl>

          {/* Manage button opens an action sheet — the SAME actions as the ⋯ menu (item 1) */}
          <MobileManageSheet person={person} people={people} onAction={onAction} />
        </article>
      ))}
    </div>
  )
}

// ── Segment filter types ──────────────────────────────────────────────────────

type StatusSegment = 'all' | 'active' | 'none' | 'disabled' | 'archived'

const SEGMENT_OPTIONS: { value: StatusSegment; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'none', label: 'No login' },
  { value: 'disabled', label: 'Disabled' },
  { value: 'archived', label: 'Archived' },
]

// ── Filter logic ──────────────────────────────────────────────────────────────
// Design-plan §2.1:
//   All = every non-archived person; Archived = archived_at != null;
//   Active/No login/Disabled are non-archived subsets by login status.

function applySegment(people: AdminPersonRow[], segment: StatusSegment): AdminPersonRow[] {
  if (segment === 'archived') return people.filter((p) => p.archived_at != null)
  const nonArchived = people.filter((p) => p.archived_at == null)
  if (segment === 'all') return nonArchived
  return nonArchived.filter((p) => p.login === segment)
}

function applySearch(people: AdminPersonRow[], query: string): AdminPersonRow[] {
  const q = query.trim().toLowerCase()
  if (!q) return people
  return people.filter(
    (p) =>
      p.full_name.toLowerCase().includes(q) ||
      (p.email ?? '').toLowerCase().includes(q),
  )
}

// ── PeopleToolbar ─────────────────────────────────────────────────────────────
// Design-plan §2.1: search-mini on the left, segmented status filter on the right.
// Seamed to the table top (flat toolbar — no resting shadow, utility surface).

interface PeopleToolbarProps {
  segment: StatusSegment
  onSegmentChange: (s: StatusSegment) => void
  searchQuery: string
  onSearchChange: (q: string) => void
}

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 15 15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <circle cx="6.5" cy="6.5" r="4.5" />
      <path d="M10.5 10.5L13.5 13.5" strokeLinecap="round" />
    </svg>
  )
}

function PeopleToolbar({ segment, onSegmentChange, searchQuery, onSearchChange }: PeopleToolbarProps) {
  const searchId = useId()

  return (
    <div className="people-toolbar">
      {/* Search-mini: filter by name or email */}
      <label className="people-search-mini" htmlFor={searchId}>
        <SearchIcon />
        <input
          id={searchId}
          type="search"
          role="searchbox"
          aria-label="Search people by name or email"
          placeholder="Search people…"
          className="people-search-input"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </label>

      <div className="people-tb-spacer" />

      {/* Segmented status filter — the shared ViewTabs primitive (interaction-contract
          I7): roving tabindex + Arrow/Home/End across the segments, same grammar as
          every other tab strip in the app (Rule 11 — never a bespoke tablist). The
          `.people-status-tabs` reset mirrors the collection-toolbar's own `.view-tabs`
          reset (static/no border/transparent) since this strip sits inline in a
          compact toolbar row, not as the full-bleed sticky page strip. */}
      <div className="people-status-tabs">
        <ViewTabs
          ariaLabel="Status filter"
          tabs={SEGMENT_OPTIONS.map((opt) => ({ id: opt.value, label: opt.label }))}
          active={segment}
          onChange={(id) => onSegmentChange(id as StatusSegment)}
        />
      </div>
    </div>
  )
}

// ── UserTable (exported) ──────────────────────────────────────────────────────

export interface UserTableProps {
  people: AdminPersonRow[]
  viewerPersonId: string
  onAction: (action: PersonAction, person: AdminPersonRow) => void
  onAddPerson: () => void
}

export function UserTable({ people, viewerPersonId, onAction, onAddPerson }: UserTableProps) {
  const presentsCards = usePeopleListPresentsCards()

  // Filter state owned here (client-side, no refetch)
  const [segment, setSegment] = useState<StatusSegment>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Filtered people (memoised)
  const filteredPeople = useMemo(() => {
    const bySegment = applySegment(people, segment)
    return applySearch(bySegment, searchQuery)
  }, [people, segment, searchQuery])

  // Clear all filters
  function clearFilters() {
    setSegment('all')
    setSearchQuery('')
  }

  // Empty state: non-self count = 0 (org has only the admin — AC-060)
  const nonSelfCount = people.filter((p) => p.id !== viewerPersonId).length
  const isOrgEmpty = nonSelfCount === 0

  // No-match: filters active but yield zero rows (distinct from org-empty)
  const isFiltered = segment !== 'all' || searchQuery.trim() !== ''
  const isNoMatch = !isOrgEmpty && isFiltered && filteredPeople.length === 0

  return (
    <>
      {/* Toolbar always renders (seamed to table top, flat utility surface) */}
      <PeopleToolbar
        segment={segment}
        onSegmentChange={setSegment}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {isOrgEmpty ? (
        /* Org has only the admin — "Just you so far" */
        <div className="py-16 px-4">
          <EmptyState
            title="Just you so far"
            copy="Add your first teammate to give them access."
          >
            <Button variant="primary" onClick={onAddPerson}>
              + Add person
            </Button>
          </EmptyState>
        </div>
      ) : isNoMatch ? (
        /* Filter applied but no rows match */
        <div className="py-12 px-4">
          <EmptyState
            title="No people match this filter"
            copy="Try a different search term or status filter."
          >
            <Button variant="ghost" onClick={clearFilters}>
              Clear filter
            </Button>
          </EmptyState>
        </div>
      ) : presentsCards ? (
        <MobileCardList people={filteredPeople} onAction={onAction} />
      ) : (
        <DesktopTable people={filteredPeople} onAction={onAction} />
      )}
    </>
  )
}
