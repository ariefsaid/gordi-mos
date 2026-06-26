// UserTable — the people list (desktop table + mobile cards, single-render reflow).
// Design-plan §2, §4.1, §4.2, §4.5, §4.6. AC-060.
// LoginStatusPill maps login status to Pill tones.
// Responsive: <table> at ≥768px (md), stacked cards below (useIsDesktop).
// Empty predicate: non-self count = 0.
// PersonAction union (item 12): compile-time safety — bad strings fail at type-check.
// Last-admin guard (item 3, FR-041): disable/archive disabled for sole active admin.
// ⋯ menu keyboard (item 8): Esc-to-close, outside-click-close, arrow-key navigation.
// Mobile action sheet (item 1): Manage button opens same actions as desktop ⋯ menu.

import { useState, useRef, useEffect, useCallback, useId } from 'react'
import { Pill } from '@/components/ui/pill'
import type { PillTone } from '@/components/ui/pill'
import { Tag } from '@/components/ui/tag'
import type { TagColor } from '@/components/ui/tag'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/state-kit'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { roleLabel } from '@/lib/db/admin-users.types'
import type { AdminPersonRow, LoginStatus } from '@/lib/db/admin-users.types'

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

const ROLE_COLOR: Record<string, TagColor> = {
  admin: 'slate',
  finance: 'slate',
  ops_lead: 'sky',
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
// Keyboard: arrow keys move focus, Esc closes.

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
  const menuRef = useRef<HTMLDivElement>(null)
  const lastAdmin = isLastActiveAdmin(person, people)

  // Arrow-key navigation within the menu (item 8)
  const handleMenuKeyDown = useCallback((e: React.KeyboardEvent) => {
    const menu = menuRef.current
    if (!menu) return
    const items = Array.from(
      menu.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')
    )
    const idx = items.indexOf(document.activeElement as HTMLElement)

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      items[(idx + 1) % items.length]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      items[(idx - 1 + items.length) % items.length]?.focus()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }, [onClose])

  function dispatch(action: PersonAction) {
    onClose()
    onAction(action, person)
  }

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-labelledby={labelledById}
      className="rounded-lg py-1"
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-overlay)',
      }}
      onKeyDown={handleMenuKeyDown}
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

function PersonActions({ person, people, onAction }: PersonActionsProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuContainerRef = useRef<HTMLDivElement>(null)
  const btnId = useId()

  // Outside-click close + Esc close (item 8): document-level so Esc works
  // even when focus is on the trigger button (not inside the menu)
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (
        menuContainerRef.current &&
        !menuContainerRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Return focus to trigger on close
  useEffect(() => {
    if (!open) {
      triggerRef.current?.focus()
    }
  }, [open])

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        id={btnId}
        type="button"
        aria-label={`More actions for ${person.full_name}`}
        aria-haspopup="true"
        aria-expanded={open}
        className="rounded-sm p-1 opacity-0 group-hover/row:opacity-100 focus:opacity-100"
        style={{ color: 'var(--muted-foreground)' }}
        onClick={() => setOpen((v) => !v)}
      >
        ⋯
      </button>
      {open && (
        <div
          ref={menuContainerRef}
          className="absolute right-0 z-20 min-w-[160px]"
        >
          <PersonActionMenu
            person={person}
            people={people}
            onAction={onAction}
            onClose={() => setOpen(false)}
            labelledById={btnId}
          />
        </div>
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

  // Outside-click and Esc close
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (sheetRef.current && !sheetRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Return focus on close
  useEffect(() => {
    if (!open) triggerRef.current?.focus()
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
            style={{ color: 'var(--muted-foreground)', letterSpacing: '0.06em', width: '35%' }}
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
          <th
            scope="col"
            className="text-left px-4 text-xs font-semibold uppercase"
            style={{ color: 'var(--muted-foreground)', letterSpacing: '0.06em', width: '35%' }}
          >
            Access roles
          </th>
          <th
            scope="col"
            className="text-left px-4 text-xs font-semibold uppercase"
            style={{ color: 'var(--muted-foreground)', letterSpacing: '0.06em', width: '10%' }}
          >
            Status
          </th>
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
            <td className="px-4">
              {person.archived_at && (
                <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                  Archived
                </span>
              )}
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

// ── UserTable (exported) ──────────────────────────────────────────────────────

export interface UserTableProps {
  people: AdminPersonRow[]
  viewerPersonId: string
  onAction: (action: PersonAction, person: AdminPersonRow) => void
  onAddPerson: () => void
}

export function UserTable({ people, viewerPersonId, onAction, onAddPerson }: UserTableProps) {
  const isDesktop = useIsDesktop()

  // Empty state: non-self count = 0
  const nonSelfCount = people.filter((p) => p.id !== viewerPersonId).length
  const isEmpty = nonSelfCount === 0

  if (isEmpty) {
    return (
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
    )
  }

  return isDesktop ? (
    <DesktopTable people={people} onAction={onAction} />
  ) : (
    <MobileCardList people={people} onAction={onAction} />
  )
}
