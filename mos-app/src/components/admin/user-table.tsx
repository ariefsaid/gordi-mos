// UserTable — the people list (desktop table + card list, single-render reflow).
// Design-plan §2, §4.1, §4.2, §4.5, §4.6. AC-060.
// LoginStatusPill maps login status to Pill tones.
// Presentation: <table> for hover-capable desktop, stacked cards otherwise
//   (usePeopleListPresentsCards — below 768px OR any coarse pointer, DO-22(a)/(b)).
// Empty predicate: non-self count = 0.
// PersonAction union (item 12): compile-time safety — bad strings fail at type-check.
// Last-admin guard (item 3, FR-041): disable/archive disabled for sole active admin.
// ⋯ menu keyboard: the shared useMenuPopover contract (I3) — focus-enter, Arrow/Home/End,
//   Esc, outside-click, focus return. The menu itself is pure presentation of the items.
// Mobile action sheet (item 1): Manage button opens same actions as desktop ⋯ menu.
// PeopleToolbar (§2.1): search-mini + ViewTabs status filter, both URL-synced (I7 / D-E1).
// No-match empty state (§4.1): distinct from org-empty "Just you so far".
// Access + Position columns (ADR-0050, AC-126): "Access" = access roles (RoleChips), "Position" =
//   Jabatan (JabatanChips) — neither ever labeled "Role". Menu item: "Manage access & position".

import { useState, useRef, useEffect, useLayoutEffect, useCallback, useId, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { shouldFlipUp } from './menu-position'
import { useMenuPopover } from '@/lib/use-menu-popover'
import { useSearchParamState, useSearchParamReset } from '@/lib/use-search-param-state'
import { Pill } from '@/components/ui/pill'
import type { PillTone } from '@/components/ui/pill'
import { Tag } from '@/components/ui/tag'
import type { TagColor } from '@/components/ui/tag'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/state-kit'
import { ViewTabs } from '@/components/ui/view-tabs'
import { usePeopleListPresentsCards } from './use-people-list-presents-cards'
import { localizedRoleMeta } from '@/lib/db/admin-users.types'
import type { AdminPersonRow, LoginStatus } from '@/lib/db/admin-users.types'
import { useT } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
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

const LOGIN_LABEL_KEY: Record<LoginStatus, MessageKey> = {
  none: 'admin.people.login.none',
  active: 'admin.people.login.active',
  disabled: 'admin.people.login.disabled',
}

function LoginStatusPill({ status }: { status: LoginStatus }) {
  const t = useT()
  return (
    <Pill tone={LOGIN_TONE[status]}>
      {t(LOGIN_LABEL_KEY[status])}
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
  supervisor: 'gray',
}

function RoleChips({ roles }: { roles: string[] }) {
  const t = useT()
  if (roles.length === 0) {
    return (
      <span style={{ color: 'var(--muted-foreground)' }} aria-label={t('admin.people.roles.none')}>
        —
      </span>
    )
  }
  return (
    <span className="flex flex-wrap gap-1">
      {roles.map((role) => (
        <Tag key={role} color={ROLE_COLOR[role] ?? 'gray'}>
          {localizedRoleMeta(role, t).label}
        </Tag>
      ))}
    </span>
  )
}

// ── JabatanChips — mirrors RoleChips, but for shared.roles (Position) names ──
// Jabatan names are org-authored free text, so they are NOT catalog strings — only the
// empty-state label is localized. Kept neutral-gray throughout: a Position carries no
// permission, so it must never read as louder than the access chips beside it.

function JabatanChips({ jabatan }: { jabatan: { role_id: string; role_name: string }[] }) {
  const t = useT()
  if (jabatan.length === 0) {
    return (
      <span style={{ color: 'var(--muted-foreground)' }} aria-label={t('admin.people.position.none')}>
        —
      </span>
    )
  }
  return (
    <span className="flex flex-wrap gap-1">
      {jabatan.map((j) => (
        <Tag key={j.role_id} color="gray">
          {j.role_name}
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
  const t = useT()
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
        {t('admin.people.action.manageAccess')}
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
          className={[
            'w-full px-3 py-1.5 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none',
            lastAdmin ? 'opacity-50 cursor-not-allowed' : '',
          ].filter(Boolean).join(' ')}
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
          className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none"
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
          className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none"
          onClick={() => dispatch('create-login')}
        >
          {t('admin.people.action.createLogin')}
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
          {t('admin.people.action.restore')}
        </button>
      ) : (
        <button
          role="menuitem"
          type="button"
          tabIndex={0}
          aria-disabled={lastAdmin ? 'true' : undefined}
          title={lastAdmin ? t('admin.people.lastAdmin') : undefined}
          className={[
            'w-full px-3 py-1.5 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none',
            lastAdmin ? 'opacity-50 cursor-not-allowed' : '',
          ].filter(Boolean).join(' ')}
          style={{ color: lastAdmin ? undefined : 'var(--destructive)' }}
          onClick={() => !lastAdmin && dispatch('archive')}
        >
          {t('admin.people.action.archive')}
        </button>
      )}
    </div>
  )
}

// ── Desktop PersonActions — ⋯ popover button ────────────────────────────────

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
  const t = useT()
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
        aria-label={t('admin.people.moreActionsFor', { name: person.full_name })}
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
  const t = useT()
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
        aria-label={t('admin.people.manageFor', { name: person.full_name })}
      >
        {t('admin.people.action.manage')}
      </button>
      {open && (
        <div ref={sheetRef} className="mt-1">
          <PersonActionMenu
            person={person}
            people={people}
            onAction={onAction}
            onClose={close}
          />
        </div>
      )}
    </>
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
      className="people-row-saved inline-flex items-center gap-1 text-xs font-medium"
      style={{ color: 'var(--success)' }}
    >
      <span aria-hidden="true">✓</span> {t('record.field.saved')}
    </span>
  )
}

// Column widths. DO-22(c) rebalance: Person carries the dense two-line content and must never
// be narrower than the chip columns beside it. This line carries a Position column v4 does not
// (ADR-0050), so v4's 50/15/35 split is redistributed rather than copied — the invariant the
// guard actually pins is Person ≥ Access, and 38 ≥ 25 holds.
const COL_WIDTH = { person: '38%', login: '13%', access: '25%', position: '24%' } as const

function DesktopTable({
  people,
  onAction,
  justSavedId,
}: {
  people: AdminPersonRow[]
  onAction: (action: PersonAction, person: AdminPersonRow) => void
  justSavedId: string | null
}) {
  const t = useT()
  const headClass = 'text-left px-4 text-xs font-semibold uppercase'
  const headStyle = { color: 'var(--muted-foreground)', letterSpacing: '0.06em' }
  return (
    <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--border)', height: 38 }}>
          <th scope="col" className={headClass} style={{ ...headStyle, width: COL_WIDTH.person }}>
            {t('admin.people.col.person')}
          </th>
          <th scope="col" className={headClass} style={{ ...headStyle, width: COL_WIDTH.login }}>
            {t('admin.people.col.login')}
          </th>
          <th scope="col" className={headClass} style={{ ...headStyle, width: COL_WIDTH.access }}>
            {t('admin.people.col.access')}
          </th>
          <th scope="col" className={headClass} style={{ ...headStyle, width: COL_WIDTH.position }}>
            {t('admin.people.col.position')}
          </th>
          {/* No dedicated Status column: archived rows are signalled inline on the name
              (line-through + 0.6 opacity), so a permanent header that was blank for every
              non-archived row — the default 'All' view shows only non-archived — earned no
              screen real estate. (V3 sweep F1, fossil-delete.) */}
          <th scope="col" className="w-10" />
        </tr>
      </thead>
      <tbody>
        {people.map((person) => (
          <tr
            key={person.id}
            className="group/row hover:bg-accent/60"
            // 52px is DESIGN.md's Data Table row spec ("E7 table rows are 52px" /
            // table-body-cell height:52) — was 54px, a 2px off-spec drift. The
            // name+email two-line stack still fits: flex items-center centers it
            // regardless, and craft-floor's own guidance is to tighten a multi-line
            // stack's line-height rather than inflate the row to fit it.
            style={{ height: 52, borderBottom: '1px solid var(--border)' }}
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
              <div className="flex items-center gap-2">
                <LoginStatusPill status={person.login} />
                {justSavedId === person.id && <InlineSaved />}
              </div>
            </td>
            <td className="px-4">
              <RoleChips roles={person.access_roles} />
            </td>
            <td className="px-4">
              <JabatanChips jabatan={person.jabatan} />
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
  justSavedId,
}: {
  people: AdminPersonRow[]
  onAction: (action: PersonAction, person: AdminPersonRow) => void
  justSavedId: string | null
}) {
  const t = useT()
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
            {justSavedId === person.id && <InlineSaved />}
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm mb-3">
            {person.email && (
              <>
                <dt className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>
                  {t('admin.people.card.email')}
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
              {t('admin.people.card.access')}
            </dt>
            <dd>
              <RoleChips roles={person.access_roles} />
            </dd>
            <dt className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>
              {t('admin.people.card.position')}
            </dt>
            <dd>
              <JabatanChips jabatan={person.jabatan} />
            </dd>
            {person.archived_at && (
              <>
                <dt className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>
                  {t('admin.people.card.status')}
                </dt>
                <dd className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                  {t('admin.people.card.archived')}
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

const SEGMENT_OPTIONS: { value: StatusSegment; labelKey: MessageKey }[] = [
  { value: 'all', labelKey: 'admin.people.seg.all' },
  { value: 'active', labelKey: 'admin.people.seg.active' },
  { value: 'none', labelKey: 'admin.people.seg.none' },
  { value: 'disabled', labelKey: 'admin.people.seg.disabled' },
  { value: 'archived', labelKey: 'admin.people.seg.archived' },
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
  const t = useT()

  return (
    <div className="people-toolbar">
      {/* Search-mini: filter by name or email */}
      <label className="people-search-mini" htmlFor={searchId}>
        <SearchIcon />
        <input
          id={searchId}
          type="search"
          role="searchbox"
          aria-label={t('admin.people.search.label')}
          placeholder={t('admin.people.search.placeholder')}
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
          ariaLabel={t('admin.people.statusFilter')}
          tabs={SEGMENT_OPTIONS.map((opt) => ({ id: opt.value, label: t(opt.labelKey) }))}
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
  /** GAP-7: the person whose in-place edit just committed → shows an inline "Saved". */
  justSavedId?: string | null
}

export function UserTable({ people, viewerPersonId, onAction, onAddPerson, justSavedId = null }: UserTableProps) {
  const presentsCards = usePeopleListPresentsCards()
  const t = useT()

  // Filter state is URL-synced (I7 / D-E1): status + search survive refresh and are shareable, so
  // "filter to Disabled + search andi, then share the link" reproduces the same view. Client-side
  // still — the query never refetches; the URL is the source of truth for the view.
  const [statusParam, setStatusParam] = useSearchParamState('status', 'all')
  const segment: StatusSegment = SEGMENT_OPTIONS.some((o) => o.value === statusParam)
    ? (statusParam as StatusSegment)
    : 'all'
  const setSegment = (next: StatusSegment) => setStatusParam(next)
  const [searchQuery, setSearchQuery] = useSearchParamState('q', '')
  const resetFilterParams = useSearchParamReset(['status', 'q'])

  // Filtered people (memoised)
  const filteredPeople = useMemo(() => {
    const bySegment = applySegment(people, segment)
    return applySearch(bySegment, searchQuery)
  }, [people, segment, searchQuery])

  // Clear all filters
  function clearFilters() {
    // One atomic replace — sequential setters clobber each other (see useSearchParamReset).
    resetFilterParams()
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
            title={t('admin.people.empty.org.title')}
            copy={t('admin.people.empty.org.copy')}
          >
            <Button variant="primary" onClick={onAddPerson}>
              {t('admin.people.addPerson')}
            </Button>
          </EmptyState>
        </div>
      ) : isNoMatch ? (
        /* Filter applied but no rows match */
        <div className="py-12 px-4">
          <EmptyState
            title={t('admin.people.empty.noMatch.title')}
            copy={t('admin.people.empty.noMatch.copy')}
          >
            <Button variant="ghost" onClick={clearFilters}>
              {t('admin.people.empty.noMatch.clear')}
            </Button>
          </EmptyState>
        </div>
      ) : presentsCards ? (
        <MobileCardList people={filteredPeople} onAction={onAction} justSavedId={justSavedId} />
      ) : (
        <DesktopTable people={filteredPeople} onAction={onAction} justSavedId={justSavedId} />
      )}
    </>
  )
}
