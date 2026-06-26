// UserTable — the people list (desktop table + mobile cards, single-render reflow).
// Design-plan §2, §4.1, §4.2, §4.5. AC-060.
// LoginStatusPill maps login status to Pill tones.
// Responsive: <table> at ≥768px (md), stacked cards below (useIsDesktop).
// Empty predicate: non-self count = 0.

import { useState } from 'react'
import { Pill } from '@/components/ui/pill'
import type { PillTone } from '@/components/ui/pill'
import { Tag } from '@/components/ui/tag'
import type { TagColor } from '@/components/ui/tag'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/state-kit'
import { useIsDesktop } from '@/shell/use-is-desktop'
import type { AdminPersonRow, LoginStatus } from '@/lib/db/admin-users.types'

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
          {role}
        </Tag>
      ))}
    </span>
  )
}

// ── PersonActionMenu placeholder (full menu is in the page) ──────────────────

interface PersonActionsProps {
  person: AdminPersonRow
  onAction: (action: string, person: AdminPersonRow) => void
}

function PersonActions({ person, onAction }: PersonActionsProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
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
          role="menu"
          className="absolute right-0 z-20 min-w-[160px] rounded-lg py-1 shadow-lg"
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-overlay)',
          }}
        >
          <button
            role="menuitem"
            type="button"
            className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent"
            onClick={() => { setOpen(false); onAction('manage-roles', person) }}
          >
            Manage roles
          </button>
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          {person.login !== 'none' && (
            <button
              role="menuitem"
              type="button"
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent"
              onClick={() => { setOpen(false); onAction('reset-password', person) }}
            >
              Reset password
            </button>
          )}
          {person.login === 'active' && (
            <button
              role="menuitem"
              type="button"
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent"
              onClick={() => { setOpen(false); onAction('disable-login', person) }}
            >
              Disable login
            </button>
          )}
          {person.login === 'disabled' && (
            <button
              role="menuitem"
              type="button"
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent"
              onClick={() => { setOpen(false); onAction('enable-login', person) }}
            >
              Enable login
            </button>
          )}
          {person.login === 'none' && (
            <button
              role="menuitem"
              type="button"
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent"
              onClick={() => { setOpen(false); onAction('create-login', person) }}
            >
              Create login
            </button>
          )}
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          {person.archived_at ? (
            <button
              role="menuitem"
              type="button"
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent"
              onClick={() => { setOpen(false); onAction('restore', person) }}
            >
              Restore
            </button>
          ) : (
            <button
              role="menuitem"
              type="button"
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent"
              style={{ color: 'var(--destructive)' }}
              onClick={() => { setOpen(false); onAction('archive', person) }}
            >
              Archive
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── DesktopTable ──────────────────────────────────────────────────────────────

function DesktopTable({ people, onAction }: { people: AdminPersonRow[]; onAction: PersonActionsProps['onAction'] }) {
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
              <PersonActions person={person} onAction={onAction} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── MobileCardList ────────────────────────────────────────────────────────────

function MobileCardList({ people, onAction }: { people: AdminPersonRow[]; onAction: PersonActionsProps['onAction'] }) {
  return (
    <div className="flex flex-col gap-3 p-3">
      {people.map((person) => (
        <article
          key={person.id}
          className="rounded-lg p-3"
          style={{ background: 'var(--card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-rest)' }}
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
                <dt className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>Email</dt>
                <dd
                  className="text-xs"
                  style={{
                    color: 'var(--foreground)',
                    fontFamily: person.email.includes('@ops.gordi.local') ? 'var(--font-mono)' : undefined,
                  }}
                >
                  {person.email}
                </dd>
              </>
            )}
            <dt className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>Roles</dt>
            <dd><RoleChips roles={person.access_roles} /></dd>
            {person.archived_at && (
              <>
                <dt className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>Status</dt>
                <dd className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Archived</dd>
              </>
            )}
          </dl>

          <Button
            variant="outline"
            className="w-full"
            style={{ minHeight: 44 }}
            onClick={() => onAction('manage', person)}
          >
            Manage
          </Button>
        </article>
      ))}
    </div>
  )
}

// ── UserTable (exported) ──────────────────────────────────────────────────────

export interface UserTableProps {
  people: AdminPersonRow[]
  viewerPersonId: string
  onAction: PersonActionsProps['onAction']
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
