// UserTable — the people list (desktop table + card list, single-render reflow).
// Design-plan §2, §4.1, §4.2, §4.5, §4.6. AC-060.
// LoginStatusPill maps login status to Pill tones.
// Presentation: <table> for hover-capable desktop, stacked cards otherwise
//   (usePeopleListPresentsCards — below 768px OR any coarse pointer, DO-22(a)/(b)).
// Empty predicate: non-self count = 0.
// PersonAction union (item 12): compile-time safety — bad strings fail at type-check.
// Last-admin guard (item 3, FR-041): disable/archive disabled for sole active admin.
// ⋯ menu keyboard: the shared useMenuPopover contract (I3) — focus-enter, Arrow/Home/End,
//   Escape-layer dismissal, Tab exit, outside-click, and focus return. The menu itself is pure presentation.
// Mobile action sheet: one 44px ⋯ per card opens the same actions as the desktop ⋯ menu, under a
//   header carrying the person's email (the card itself no longer spends a line on it).
// PeopleToolbar (§2.1): search-mini + ViewTabs status filter, both URL-synced (I7 / D-E1).
// No-match empty state (§4.1): distinct from org-empty "Just you so far".
// Access + Position columns (ADR-0050, AC-126): "Access" = access roles (RoleChips), "Position" =
//   Jabatan (PositionText, plain words) — neither ever labeled "Role".
// A row (or card) opens the person: click anywhere on it, or Enter on the name. The ⋯ menu's
//   "Manage person" opens the same panel; the menu's own clicks never reach the row.

import { CheckIcon } from '@/shell/icons'
import { useState, useRef, useEffect, useLayoutEffect, useCallback, useId, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { shouldFlipUp } from './menu-position'
import { useMenuPopover } from '@/lib/use-menu-popover'
import { clampPopoverGeometry } from '@/components/ui/clamp-popover-offset'
import { usePopoverReflow } from '@/components/ui/use-popover-reflow'
import { useSearchParamState, useSearchParamReset } from '@/lib/use-search-param-state'
import { Pill } from '@/components/ui/pill'
import { StatusBadge } from '@/components/ui/status-badge'
import { SearchField } from '@/components/ui/search-field'
import { FilterChip } from '@/components/ui/filter-chip'
import { Select } from '@/components/ui/select'
import { Tag } from '@/components/ui/tag'
import type { TagColor } from '@/components/ui/tag'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { EmptyState, LoadingShell } from '@/components/ui/state-kit'
import { usePeopleListPresentsCards } from './use-people-list-presents-cards'
import { localizedRoleMeta } from '@/lib/db/admin-users.types'
import { SEGMENT_OPTIONS, SORT_OPTIONS, filterPeople, isLastActiveAdmin, sortPeople, toDir, toSegment, toSort, type PeopleSort, type StatusSegment } from './people-filter'
import { SortButton, type SortDir } from './sort-button'
import type { AdminPersonRow, LoginStatus, TeamOption } from '@/lib/db/admin-users.types'
import { useT } from '@/i18n/use-t'
import { useIsOffline } from '@/shell/use-is-offline'
import './people-toolbar.css'

// ── PersonAction union type (item 12) ────────────────────────────────────────
// Compile-time contract: bad action strings fail type-check (caught the 'manage' bug).
export type PersonAction =
  | 'manage-person'
  | 'reset-password'
  | 'create-login'
  | 'disable-login'
  | 'enable-login'
  | 'archive'
  | 'restore'

// Synthetic sign-in names (people without an email) read as data, in the mono face.
const isSyntheticEmail = (email: string) => email.includes('@ops.gordi.local')
const emailClass = (email: string) => `people-email${isSyntheticEmail(email) ? ' people-email--mono' : ''}`

// ── LoginStatusPill ───────────────────────────────────────────────────────────

function LoginStatusPill({ status }: { status: LoginStatus }) {
  const t = useT()
  // The shared status map: Active green, Disabled neutral. "No login" is not a status, so it stays a plain neutral word.
  if (status === 'none') return <Pill tone="neutral" dot={false}>{t('admin.people.login.none')}</Pill>
  return <StatusBadge status={status === 'active' ? 'active' : 'disabled'} />
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
  supervisor: 'gray',
}

function RoleChips({ roles }: { roles: string[] }) {
  const t = useT()
  if (roles.length === 0) {
    return (
      <span className="people-none" aria-label={t('admin.people.roles.none')}>
        —
      </span>
    )
  }
  return (
    <span className="people-roles">
      {roles.map((role) => (
        <Tag key={role} color={ROLE_COLOR[role] ?? 'gray'}>
          {localizedRoleMeta(role, t).label}
        </Tag>
      ))}
    </span>
  )
}

// ── PositionText — shared.roles (Position) names as plain text ──
// Position names are org-authored free text, so they are NOT catalog strings — only the empty-state
// label is localized. A Position is not a status and carries no permission, so it is words, never a pill.

function PositionText({ jabatan }: { jabatan: { role_id: string; role_name: string }[] }) {
  const t = useT()
  if (jabatan.length === 0) {
    return (
      <span className="people-none" aria-label={t('admin.people.position.none')}>
        —
      </span>
    )
  }
  return <span className="people-position">{jabatan.map((j) => j.role_name).join(', ')}</span>
}

// ── Primary Team name ─────────────────────────────────────────────────────────
// A membership carries only `team_id`, so the name comes from the TeamOption list the page
// already fetches. The PRIMARY membership is the one that resolves the person's capture stream,
// so it is the one the roster shows.

function primaryTeamName(person: AdminPersonRow, teams: TeamOption[]): string | null {
  const primary = person.teams.find((m) => m.is_primary)
  if (!primary) return null
  return teams.find((t) => t.id === primary.team_id)?.name ?? null
}

// ── PersonActionMenu — shared between desktop ⋯ and mobile action sheet ──────
// Renders a role="menu" list of per-person actions, gated by person state.
// The dismissal + keyboard contract (focus-enter, Arrow/Home/End, layered Escape, Tab exit,
// outside-click) is owned by the shared useMenuPopover hook on the HOST (desktop portal / mobile sheet),
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
  const t = useT()
  // Network-only actions are unavailable offline; the reason sits at the foot of the menu (ST2).
  const offline = useIsOffline()
  const lastAdmin = isLastActiveAdmin(person, people)

  function dispatch(action: PersonAction) {
    onClose()
    onAction(action, person)
  }

  return (
    <div
      role="menu"
      aria-labelledby={labelledById}
      className="person-menu"
    >
      <button
        role="menuitem"
        type="button"
        tabIndex={0}
        className="person-menu-item"
        onClick={() => dispatch('manage-person')}
      >
        {t('admin.people.action.manageAccess')}
      </button>

      <div className="person-menu-rule" role="separator" />

      {person.login !== 'none' && (
        <button
          role="menuitem"
          type="button"
          tabIndex={0}
          className="person-menu-item"
          disabled={offline}
          onClick={() => dispatch('reset-password')}
        >
          {t('admin.people.action.resetPassword')}
        </button>
      )}

      {person.login === 'active' && (
        <button
          role="menuitem"
          type="button"
          tabIndex={0}
          aria-disabled={lastAdmin ? 'true' : undefined}
          title={lastAdmin ? t('admin.people.lastAdmin') : undefined}
          className={lastAdmin ? 'person-menu-item person-menu-item--blocked' : 'person-menu-item'}
          disabled={offline}
          onClick={() => !lastAdmin && dispatch('disable-login')}
        >
          {t('admin.people.action.disableLogin')}
        </button>
      )}

      {person.login === 'disabled' && (
        <button
          role="menuitem"
          type="button"
          tabIndex={0}
          className="person-menu-item"
          disabled={offline}
          onClick={() => dispatch('enable-login')}
        >
          {t('admin.people.action.enableLogin')}
        </button>
      )}

      {person.login === 'none' && (
        <button
          role="menuitem"
          type="button"
          tabIndex={0}
          className="person-menu-item"
          disabled={offline}
          onClick={() => dispatch('create-login')}
        >
          {t('admin.people.action.createLogin')}
        </button>
      )}

      <div className="person-menu-rule" role="separator" />

      {person.archived_at ? (
        <button
          role="menuitem"
          type="button"
          tabIndex={0}
          className="person-menu-item"
          disabled={offline}
          onClick={() => dispatch('restore')}
        >
          {t('admin.people.action.restore')}
        </button>
      ) : (
        <button
          role="menuitem"
          type="button"
          tabIndex={0}
          aria-disabled={lastAdmin ? 'true' : undefined}
          title={lastAdmin ? t('admin.people.lastAdmin') : undefined}
          className={lastAdmin ? 'person-menu-item person-menu-item--blocked' : 'person-menu-item person-menu-item--danger'}
          disabled={offline}
          onClick={() => !lastAdmin && dispatch('archive')}
        >
          {t('admin.people.action.archive')}
        </button>
      )}

      {/* AC6: a disabled action says why beside itself, not in a tooltip. */}
      {lastAdmin && <p className="person-menu-note" role="note">{t('admin.people.lastAdmin')}</p>}
      {offline && <p className="person-menu-note" role="note">{t('common.offline.reconnect')}</p>}
    </div>
  )
}

// ── PersonActions — the ⋯ popover button, in a table row and on a card ──────
// One door, one portal, one menu: the card's ⋯ is this same component at the coarse-pointer
// touch size, so the two presentations can never drift apart.

interface PersonActionsProps {
  person: AdminPersonRow
  people: AdminPersonRow[]
  onAction: (action: PersonAction, person: AdminPersonRow) => void
  /** `card` = the 44px touch door + an email-bearing sheet header; `row` = the dense table door. */
  presentation?: 'row' | 'card'
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

function PersonActions({ person, people, onAction, presentation = 'row' }: PersonActionsProps) {
  const t = useT()
  const isCard = presentation === 'card'
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
    // Right-align to the trigger's right edge; clamp so it doesn't overflow left. Reframed as a
    // left-edge clamp (#621, shared with help-tip/the category picker): the menu's unclamped left
    // edge, if flush-right with the trigger at the estimated width, is `rect.right - MENU_MIN_WIDTH`;
    // clamping that and converting back to a right-offset is algebraically identical to clamping
    // `right` directly ONLY for a viewport >= MENU_MIN_WIDTH + 2 * MENU_SIDE_MARGIN (176px) —
    // below that, clampPopoverGeometry's own width-clamp kicks in and MENU_MIN_WIDTH is no longer
    // the real popover width, which this call site ignores (the returned `maxWidth` is discarded).
    const { left } = clampPopoverGeometry({
      anchorLeft: rect.right - MENU_MIN_WIDTH,
      popoverWidth: MENU_MIN_WIDTH,
      viewportWidth: vw,
      margin: MENU_SIDE_MARGIN,
    })
    const clampedRight = vw - left - MENU_MIN_WIDTH
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

  // Position-only concern (not part of I3): dismiss on scroll/resize to avoid drift (#621: shares
  // the scroll/resize listener plumbing with help-tip's reposition-on-reflow, but this site's
  // reflow is "close" rather than "reposition" — there is no live repositioning to fall back to).
  usePopoverReflow(open, close)

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

  // The menu is portaled, but React still bubbles its events through this wrapper — stop them
  // here so choosing an action (or opening the menu) never also opens the row.
  return (
    <div onClick={(event) => event.stopPropagation()}>
      <button
        ref={triggerRef}
        id={btnId}
        type="button"
        aria-label={t('admin.people.moreActionsFor', { name: person.full_name })}
        aria-haspopup="true"
        aria-expanded={open}
        // DO-22(a) (census admin-people P2-A): persistent low-emphasis rest state — the old
        // `opacity-0` hover-reveal made the row's ONLY action door invisible at rest and
        // unreachable without hover.
        className="people-actions-trigger"
        onClick={() => setOpen((v) => !v)}
      >
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 18 18" fill="currentColor">
          <circle cx="4" cy="9" r="1.4" /><circle cx="9" cy="9" r="1.4" /><circle cx="14" cy="9" r="1.4" />
        </svg>
      </button>
      {open && createPortal(
        <div
          ref={menuContainerRef}
          className="person-menu-host"
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
          {/* Card sheets name who they act on — the card itself spends no line on the email. */}
          {isCard && (
            <div
              data-testid="person-sheet-header"
              className="person-sheet-header"
            >
              <div className="person-sheet-header__name">{person.full_name}</div>
              {person.email && <div className={`person-sheet-header__email${isSyntheticEmail(person.email) ? ' people-email--mono' : ''}`}>{person.email}</div>}
            </div>
          )}
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

// ── DesktopTable ──────────────────────────────────────────────────────────────

// GAP-7: the inline "Saved" confirmation shown at a person's row after an in-place edit
// (enable/disable login) — the record-grammar success channel, not a floating toast. It uses
// the shared record "Saved" label + success token, and is a polite live region for SR users.
function InlineSaved() {
  const t = useT()
  return (
    <span
      role="status"
      aria-live="polite"
      className="people-row-saved"
    >
      <CheckIcon /> {t('record.field.saved')}
    </span>
  )
}

// Column widths. Person carries the dense two-line content and is never narrower than the columns
// beside it (the guard pins Person ≥ Access).
const COL_WIDTH = { person: '27%', team: '19%', login: '12%', access: '19%', position: '23%' } as const

/** A column header that sorts: the current column carries its direction, the others offer ascending. */
function SortHeader({ column, sort, dir, onSort, className, style, children }: {
  column: PeopleSort; sort: PeopleSort; dir: SortDir; onSort: (column: PeopleSort) => void
  className: string; style: React.CSSProperties; children: React.ReactNode
}) {
  const active = sort === column
  return (
    <th scope="col" className={className} style={style} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      <SortButton dir={active ? dir : null} onClick={() => onSort(column)}>{children}</SortButton>
    </th>
  )
}

/** The person's name as the row's keyboard door: Enter or Space on it opens the person. */
function PersonName({ person, onOpen, email }: { person: AdminPersonRow; onOpen: () => void; email?: string | null }) {
  return (
    <button
      type="button"
      className={person.archived_at ? 'people-row-open people-row-open--archived' : 'people-row-open'}
      onClick={(event) => {
        event.stopPropagation()
        onOpen()
      }}
    >
      <span className="people-row-open__name">{person.full_name}</span>
      {email && <span className={`people-card__email${isSyntheticEmail(email) ? ' people-email--mono' : ''}`}>{email}</span>}
    </button>
  )
}

function DesktopTable({
  people,
  teams,
  onAction,
  justSavedId,
  sort,
  dir,
  onSort,
}: {
  people: AdminPersonRow[]
  teams: TeamOption[]
  onAction: (action: PersonAction, person: AdminPersonRow) => void
  justSavedId: string | null
  sort: PeopleSort
  dir: SortDir
  onSort: (column: PeopleSort) => void
}) {
  const t = useT()
  const headClass = 'people-head'
  const width = COL_WIDTH
  return (
    <table className="people-table">
      <thead>
        <tr>
          <SortHeader column="name" sort={sort} dir={dir} onSort={onSort} className={headClass} style={{ width: width.person }}>
            {t('admin.people.col.person')}
          </SortHeader>
          <SortHeader column="login" sort={sort} dir={dir} onSort={onSort} className={headClass} style={{ width: width.login }}>
            {t('admin.people.col.login')}
          </SortHeader>
          <SortHeader column="team" sort={sort} dir={dir} onSort={onSort} className={headClass} style={{ width: width.team }}>
            {t('admin.people.col.team')}
          </SortHeader>
          <th scope="col" className={headClass} style={{ width: width.access }}>
            {t('admin.people.col.access')}
          </th>
          <th scope="col" className={headClass} style={{ width: width.position }}>
            {t('admin.people.col.position')}
          </th>
          {/* No dedicated Status column: archived rows are signalled inline on the name
              (line-through + 0.6 opacity). */}
          <th scope="col" className="people-actions-col"><span className="sr-only">{t('admin.people.col.actions')}</span></th>
        </tr>
      </thead>
      <tbody>
        {people.map((person) => {
          const open = () => onAction('manage-person', person)
          return (
            <tr
              key={person.id}
              className="people-row"
              onClick={open}
            >
              <td>
                <div className="people-identity">
                  <Avatar placeholder={person.full_name} size="md" />
                  <div className="people-identity__text">
                    <PersonName person={person} onOpen={open} />
                    {person.email && <div className={emailClass(person.email)}>{person.email}</div>}
                  </div>
                </div>
              </td>
              <td>
                <div className="people-login">
                  <LoginStatusPill status={person.login} />
                  {justSavedId === person.id && <InlineSaved />}
                </div>
              </td>
              <td className="people-team">
                {primaryTeamName(person, teams) ?? (
                  <span className="people-none" aria-label={t('admin.people.team.none')}>
                    —
                  </span>
                )}
              </td>
              <td>
                <RoleChips roles={person.access_roles} />
              </td>
              <td>
                <PositionText jabatan={person.jabatan} />
              </td>
              <td className="people-actions-cell">
                <PersonActions person={person} people={people} onAction={onAction} />
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ── MobileCardList ────────────────────────────────────────────────────────────

function MobileCardList({
  people,
  teams,
  onAction,
  justSavedId,
}: {
  people: AdminPersonRow[]
  teams: TeamOption[]
  onAction: (action: PersonAction, person: AdminPersonRow) => void
  justSavedId: string | null
}) {
  const t = useT()
  return (
    <div className="people-card-list">
      {people.map((person) => {
        const open = () => onAction('manage-person', person)
        return (
          <article key={person.id} className="people-card" onClick={open}>
            <div className="people-card__identity">
              <Avatar placeholder={person.full_name} size="md" />
              <div className="people-identity__text">
                <PersonName person={person} onOpen={open} email={person.email} />
              </div>
              <PersonActions person={person} people={people} onAction={onAction} presentation="card" />
            </div>
            <div className="people-card__facts">
              <p className="people-card__context" aria-label={`${t('admin.people.col.team')}: ${primaryTeamName(person, teams) ?? '—'}; ${t('admin.people.col.position')}: ${person.jabatan.map((j) => j.role_name).join(', ') || '—'}`}>
                {primaryTeamName(person, teams) ?? '—'} <span aria-hidden="true">·</span> {person.jabatan.map((j) => j.role_name).join(', ') || '—'}
              </p>
              <p className="people-card__access-line" aria-label={`${t('admin.people.col.login')}: ${t(person.login === 'none' ? 'admin.people.login.none' : person.login === 'active' ? 'admin.people.login.active' : 'admin.people.login.disabled')}; ${t('admin.people.col.access')}: ${person.access_roles.map((role) => localizedRoleMeta(role, t).label).join(', ') || t('admin.people.roles.none')}`}>
                <LoginStatusPill status={person.login} /> <span aria-hidden="true">·</span> <RoleChips roles={person.access_roles} />
                {justSavedId === person.id && <InlineSaved />}
              </p>
            </div>
          </article>
        )
      })}
    </div>
  )
}

// ── PeopleToolbar ─────────────────────────────────────────────────────────────
// Design-plan §2.1: search-mini on the left, segmented status filter on the right.
// Seamed to the table top (flat toolbar — no resting shadow, utility surface).

interface PeopleToolbarProps {
  /** Cards presentation: no container card around the list, so the toolbar sits on the page gutter. */
  flush: boolean
  segment: StatusSegment
  onSegmentChange: (s: StatusSegment) => void
  searchQuery: string
  onSearchChange: (q: string) => void
  /** Phone/coarse cards have no column headers, so sorting is offered here. */
  sort: PeopleSort
  dir: SortDir
  onSortChange: (sort: PeopleSort, dir: SortDir) => void
  showSort: boolean
  /** "30 people" / "3 of 30 people" — the result count, at the toolbar's right end. */
  countLabel: string
  onRemoveSegment: () => void
  onRemoveSearch: () => void
  onClearAll: () => void
}

function PeopleToolbar({
  flush, segment, onSegmentChange, searchQuery, onSearchChange, sort, dir, onSortChange, showSort,
  countLabel, onRemoveSegment, onRemoveSearch, onClearAll,
}: PeopleToolbarProps) {
  const t = useT()
  const query = searchQuery.trim()
  const segmentLabel = t(SEGMENT_OPTIONS.find((option) => option.value === segment)?.labelKey ?? 'admin.people.seg.all')

  return (
    <div className={flush ? 'people-toolbar-block people-toolbar-block--flush' : 'people-toolbar-block'}>
      <div className={flush ? 'people-toolbar people-toolbar--flush' : 'people-toolbar'}>
        <SearchField
          label={t('admin.people.search.label')}
          placeholder={t('admin.people.search.placeholder')}
          value={searchQuery}
          onChange={onSearchChange}
          autoComplete="off"
          spellCheck={false}
        />

        <Select className="people-status-filter" label={t('admin.people.statusFilter')} value={segment} onChange={(event) => onSegmentChange(event.target.value as StatusSegment)}>
          {SEGMENT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{t(option.labelKey)}</option>)}
        </Select>

        {showSort && (
          <Select className="people-status-filter" label={t('admin.people.sort.label')} value={`${sort}:${dir}`}
            onChange={(event) => { const [next, nextDir] = event.target.value.split(':'); onSortChange(toSort(next), toDir(nextDir)) }}>
            {SORT_OPTIONS.flatMap((option) => (['asc', 'desc'] as const).map((d) => (
              <option key={`${option.value}:${d}`} value={`${option.value}:${d}`}>{t(option.labelKey)} · {t(d === 'asc' ? 'admin.people.sort.asc' : 'admin.people.sort.desc')}</option>
            )))}
          </Select>
        )}

        <p className="people-count" data-testid="people-count-line" role="status">{countLabel}</p>
      </div>

      {(segment !== 'all' || query !== '') && (
        <ul className="people-chips" aria-label={t('admin.people.chips.label')}>
          {segment !== 'all' && <li><FilterChip label={`${t('admin.people.statusFilter')}: ${segmentLabel}`} onRemove={onRemoveSegment} /></li>}
          {query !== '' && <li><FilterChip label={`${t('admin.people.search.label')}: ${query}`} onRemove={onRemoveSearch} /></li>}
          {segment !== 'all' && query !== '' && (
            <li><button type="button" className="collection-toolbar__clear" onClick={onClearAll}>{t('admin.people.empty.noMatch.clear')}</button></li>
          )}
        </ul>
      )}
    </div>
  )
}

// ── UserTable (exported) ──────────────────────────────────────────────────────

export interface UserTableProps {
  people: AdminPersonRow[]
  viewerPersonId: string
  onAction: (action: PersonAction, person: AdminPersonRow) => void
  onAddPerson: () => void
  /** Resolves each person's primary Team to a name — a membership carries only its team id. */
  teams?: TeamOption[]
  /** The list is still in flight: the toolbar stays, the list area is skeleton. */
  loading?: boolean
  /** GAP-7: the person whose in-place edit just committed → shows an inline "Saved". */
  justSavedId?: string | null
}

export function UserTable({
  people,
  viewerPersonId,
  onAction,
  onAddPerson,
  teams = [],
  loading = false,
  justSavedId = null,
}: UserTableProps) {
  const presentsCards = usePeopleListPresentsCards()
  const t = useT()

  // Filter state is URL-synced (I7 / D-E1): status + search survive refresh and are shareable, so
  // "filter to Disabled + search andi, then share the link" reproduces the same view. Client-side
  // still — the query never refetches; the URL is the source of truth for the view.
  const [statusParam, setStatusParam] = useSearchParamState('status', 'all')
  const segment = toSegment(statusParam)
  const setSegment = (next: StatusSegment) => setStatusParam(next)
  const [searchQuery, setSearchQuery] = useSearchParamState('q', '')
  // One key holds column and direction ("login", "-login" for descending): two keys written in
  // one handler would clobber each other on the URL.
  const [sortParam, setSortParam] = useSearchParamState('sort', 'name')
  const sort = toSort(sortParam.replace(/^-/, ''))
  const dir = toDir(sortParam.startsWith('-') ? 'desc' : 'asc')
  const resetFilterParams = useSearchParamReset(['status', 'q'])

  const { rows: matched, filtered: isFiltered } = useMemo(
    () => filterPeople(people, statusParam, searchQuery),
    [people, statusParam, searchQuery],
  )
  const filteredPeople = useMemo(
    () => sortPeople(matched, sort, dir, (person) => primaryTeamName(person, teams)),
    [matched, sort, dir, teams],
  )
  function changeSort(next: PeopleSort, nextDir: SortDir) { setSortParam(`${nextDir === 'desc' ? '-' : ''}${next}`) }
  function sortBy(column: PeopleSort) { changeSort(column, column === sort && dir === 'asc' ? 'desc' : 'asc') }
  const countLabel = loading
    ? '—'
    : isFiltered
      ? t('admin.people.count.filtered', { shown: filteredPeople.length, count: people.length })
      : t(filteredPeople.length === 1 ? 'admin.people.count.one' : 'admin.people.count.other', { count: filteredPeople.length })

  // Clear all filters
  function clearFilters() {
    // One atomic replace — sequential setters clobber each other (see useSearchParamReset).
    resetFilterParams()
  }

  // Empty state: non-self count = 0 (org has only the admin — AC-060)
  const nonSelfCount = people.filter((p) => p.id !== viewerPersonId).length
  const isOrgEmpty = nonSelfCount === 0

  // No-match: filters active but yield zero rows (distinct from org-empty)
  const isNoMatch = !isOrgEmpty && isFiltered && filteredPeople.length === 0

  return (
    <>
      {/* Toolbar always renders (seamed to table top, flat utility surface) */}
      <PeopleToolbar
        flush
        segment={segment}
        onSegmentChange={setSegment}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        sort={sort}
        dir={dir}
        onSortChange={changeSort}
        showSort={presentsCards}
        countLabel={countLabel}
        onRemoveSegment={() => setSegment('all')}
        onRemoveSearch={() => setSearchQuery('')}
        onClearAll={clearFilters}
      />

      {loading ? (
        /* Only the LIST is unknown while people load — the head above and the toolbar just
           rendered are the controls the admin came for, and blanking them costs a reflow. */
        <LoadingShell count={6} />
      ) : isOrgEmpty ? (
        /* Org has only the admin — "Just you so far" */
        <div>
          <EmptyState
            variant="next-step"
            title={t('admin.people.empty.org.title')}
            copy={t('admin.people.empty.org.copy')}
          >
            <Button variant="outline" onClick={onAddPerson}>
              {t('admin.people.addPerson')}
            </Button>
          </EmptyState>
        </div>
      ) : isNoMatch ? (
        /* Filter applied but no rows match */
        <div>
          <EmptyState
            // A filter that matched nothing is not an earned all-clear, so never the ✓ glyph.
            variant="blank"
            title={t('admin.people.empty.noMatch.title')}
            copy={t('admin.people.empty.noMatch.copy')}
          >
            <Button variant="outline" onClick={clearFilters}>
              {t('admin.people.empty.noMatch.clear')}
            </Button>
          </EmptyState>
        </div>
      ) : presentsCards ? (
        <MobileCardList people={filteredPeople} teams={teams} onAction={onAction} justSavedId={justSavedId} />
      ) : (
        <DesktopTable people={filteredPeople} teams={teams} onAction={onAction} justSavedId={justSavedId} sort={sort} dir={dir} onSort={sortBy} />
      )}
    </>
  )
}
