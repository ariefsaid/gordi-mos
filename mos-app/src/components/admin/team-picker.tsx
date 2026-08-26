// TeamPicker — "Teams" section mounted inside RoleEditor's dialog, below Position.
//
// Owner, 2026-08-26: Admin Settings should manage "adding people to the different teams /
// activity", not just adding people. Before this, shared.team_memberships was SELECT-only and the
// only way to put someone on a team was to edit seed SQL.
//
// Two things a reader needs to know about this section that the Position section above does not
// carry:
//
//  1. Membership is an AUTHORIZATION INPUT, not a label. mos.can_read_signal's R1 arm and the team
//     post/start gates resolve rights by asking whether a membership row exists. Checking a box
//     here can widen what someone can READ. The database holds the line (admin-only INSERT/UPDATE,
//     20260826000001); this component is simply the screen in front of it.
//  2. A Team that carries (branch, activity) IS a production stream (OD-WAY-49), and the person's
//     live PRIMARY team resolves their default capture stream (AC-001). "Home team" is therefore a
//     real control with a downstream effect, not decoration — which is why it is a visible radio
//     rather than an implicit consequence of check order.
//
// Removal is a soft end (endTeamMembership sets effective_to), because there is no DELETE grant and
// membership history is worth keeping.

import { useState } from 'react'
import { addTeamMembership, endTeamMembership, setPrimaryTeam } from '@/lib/db/admin-users'
import { isStreamTeam, type AdminPersonRow, type TeamOption } from '@/lib/db/admin-users.types'
import { CheckboxRow, PickerError } from './checkbox-row'

export interface TeamPickerProps {
  person: AdminPersonRow
  /** Every live team, from listTeams(). */
  teams: TeamOption[]
  /** Called after a successful write so the page can reload the list. */
  onDone: () => void
  /** Called with a success message after a write succeeds. */
  onShowToast?: (message: string) => void
}

/** "Gordi HQ · Kitchen" for a stream team; nothing for an ordinary org team. */
function streamLabel(team: TeamOption): string | undefined {
  if (!isStreamTeam(team)) return undefined
  const activity = team.activity!
  return `${team.branch_name} · ${activity.charAt(0).toUpperCase()}${activity.slice(1)}`
}

export function TeamPicker({ person, teams, onDone, onShowToast }: TeamPickerProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const memberOf = new Map(person.teams.map((t) => [t.team_id, t]))
  const hasPrimary = person.teams.some((t) => t.is_primary)

  async function run(work: () => Promise<void>, fallback: string) {
    setBusy(true)
    setError('')
    try {
      await work()
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback)
    } finally {
      setBusy(false)
    }
  }

  function handleToggle(team: TeamOption) {
    const membership = memberOf.get(team.id)
    if (membership) {
      return run(async () => {
        await endTeamMembership(person.id, team.id)
        onShowToast?.(`${person.full_name} removed from ${team.name}.`)
      }, 'Team change failed. Try again.')
    }
    // The first team someone joins becomes their home team. Otherwise a person could sit on teams
    // with no primary at all, which resolves their capture stream to none (AC-001) — a silent
    // downstream effect of an action that looks like it only added a membership.
    return run(async () => {
      await addTeamMembership(person.id, team.id, !hasPrimary)
      onShowToast?.(
        hasPrimary
          ? `${person.full_name} added to ${team.name}.`
          : `${person.full_name} added to ${team.name}, now their home team.`,
      )
    }, 'Team change failed. Try again.')
  }

  function handleMakeHome(team: TeamOption) {
    return run(async () => {
      await setPrimaryTeam(person.id, team.id)
      onShowToast?.(`${team.name} is now ${person.full_name}'s home team.`)
    }, 'Home team change failed. Try again.')
  }

  return (
    <div className="px-6 py-5" style={{ borderTop: '1px solid var(--border)' }}>
      <h3 className="mb-1 text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
        Teams
      </h3>
      <p className="mb-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>
        The home team sets this person&rsquo;s default capture stream.
      </p>
      {/* Ending someone's HOME team leaves them on teams with no home team, which resolves their
          capture stream to none (AC-001) — a downstream effect of an action that looks like it only
          removed one membership. Rather than guess a replacement (any auto-promotion is a policy
          nobody asked for) or block the removal, say so where it happened and leave it one click
          from fixed. Silent is the one option that is not available. */}
      {person.teams.length > 0 && !hasPrimary && (
        <p
          role="status"
          className="mb-2 rounded-md px-3 py-2 text-xs"
          style={{
            background: 'color-mix(in srgb, var(--destructive) 8%, var(--card))',
            color: 'var(--destructive)',
            border: '1px solid color-mix(in srgb, var(--destructive) 25%, transparent)',
          }}
        >
          No home team — {person.full_name} has no default capture stream. Pick one with
          &ldquo;Make home&rdquo;.
        </p>
      )}

      <fieldset disabled={busy}>
        <legend className="sr-only">Teams for {person.full_name}</legend>

        {teams.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            No teams defined yet
          </p>
        ) : (
          <div className="overflow-hidden rounded-md" style={{ border: '1px solid var(--input)' }}>
            {teams.map((team, i) => {
              const membership = memberOf.get(team.id)
              return (
                <div
                  key={team.id}
                  className="flex items-center gap-2 pr-3"
                  style={i > 0 ? { borderTop: '1px solid var(--input)' } : undefined}
                >
                  <span className="min-w-0 flex-1">
                    <CheckboxRow
                      label={team.name}
                      description={streamLabel(team)}
                      checked={membership !== undefined}
                      disabled={busy}
                      onToggle={() => handleToggle(team)}
                    />
                  </span>
                  {/* Outside the <label>, never inside it: a button nested in a label is both a
                      nesting violation and a second click target for the checkbox. */}
                  {membership?.is_primary === true && (
                    <span
                      className="flex-none rounded-sm px-2 py-0.5 text-xs font-medium"
                      style={{
                        background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
                        color: 'var(--primary)',
                      }}
                    >
                      Home
                    </span>
                  )}
                  {membership !== undefined && !membership.is_primary && (
                    <button
                      type="button"
                      disabled={busy}
                      className="tap-target-phone flex-none rounded-sm px-2 text-xs underline disabled:opacity-50"
                      style={{ color: 'var(--muted-foreground)' }}
                      onClick={() => handleMakeHome(team)}
                    >
                      Make home
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </fieldset>

      <PickerError message={error} />
    </div>
  )
}
