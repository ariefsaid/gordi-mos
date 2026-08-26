// TeamPicker — "Teams" in RoleEditor's dialog, below Position. Owner, 2026-08-26.
//
// Two things Position above does not carry:
//  1. Membership is an authorization input, not a label — checking a box here can widen what
//     someone READS. The database holds that line (admin-only, 20260826000001, which is where the
//     reasoning lives); this is the screen in front of it.
//  2. A Team carrying (branch, activity) IS a production stream, and the live PRIMARY membership
//     resolves the person's default capture stream (OD-WAY-49 / AC-001). "Home team" therefore has
//     a downstream effect, which is why it is a visible control and not check order.
//
// Removal is a soft end (no DELETE grant, and membership history is worth keeping).

import { useState } from 'react'
import { addTeamMembership, endTeamMembership, setPrimaryTeam } from '@/lib/db/admin-users'
import { isStreamTeam, type AdminPersonRow, type TeamOption } from '@/lib/db/admin-users.types'
import { Pill } from '@/components/ui/pill'
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
      {/* Names BOTH consequences. The second is the one an admin cannot guess from the words
          "home team": ops.is_stream_reviewer resolves review authority from the live primary
          membership, so a supervisor's home team decides whose production they approve. */}
      <p className="mb-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>
        The home team sets this person&rsquo;s default capture stream — and for a supervisor, which
        stream&rsquo;s logs they approve.
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
                  {/* The shared primitive, not a hand-rolled tint: Pill already owns this exact
                      background AND pairs it with the AA-darkened text token that raw
                      var(--primary) misses at 12px on a light wash. */}
                  {membership?.is_primary === true && (
                    <span className="flex-none">
                      <Pill tone="primary" dot={false}>Home</Pill>
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
