// TeamPicker — "Teams" in the Manage <name> dialog. Owner, 2026-08-26; #808 refit.
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
//
// #808: eager-commit rows print `Saved` on success and `Failed · Retry` on rejection beside
// themselves — the record grammar, per DESIGN.md § Management dialogs (A-5).

import { useCallback, useEffect, useRef, useState } from 'react'
import { useT } from '@/i18n/use-t'
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
  /** Section heading — supplied by RoleEditor so both locales route through the catalog. */
  heading?: string
}

/** "Gordi HQ · Kitchen" for a stream team; nothing for an ordinary org team. */
function streamLabel(team: TeamOption): string | undefined {
  if (!isStreamTeam(team)) return undefined
  const activity = team.activity!
  return `${team.branch_name} · ${activity.charAt(0).toUpperCase()}${activity.slice(1)}`
}

type RowState = { kind: 'idle' } | { kind: 'saved' } | { kind: 'failed'; retry: () => Promise<void> }

export function TeamPicker({ person, teams, onDone, onShowToast, heading }: TeamPickerProps) {
  const t = useT()
  const [busyRowId, setBusyRowId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({})
  const savedTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    const timers = savedTimersRef.current
    return () => {
      for (const t of Object.values(timers)) clearTimeout(t)
    }
  }, [])

  const memberOf = new Map(person.teams.map((t) => [t.team_id, t]))
  const hasPrimary = person.teams.some((t) => t.is_primary)

  const flashSaved = useCallback((rowId: string) => {
    setRowStates((prev) => ({ ...prev, [rowId]: { kind: 'saved' } }))
    const existing = savedTimersRef.current[rowId]
    if (existing) clearTimeout(existing)
    savedTimersRef.current[rowId] = setTimeout(() => {
      setRowStates((prev) => {
        if (prev[rowId]?.kind !== 'saved') return prev
        const next = { ...prev }
        delete next[rowId]
        return next
      })
    }, 1800)
  }, [])

  const run = useCallback(
    async (rowId: string, work: () => Promise<void>, fallback: string) => {
      setBusyRowId(rowId)
      setError('')
      // Clear any lingering row state before we try again.
      setRowStates((prev) => {
        if (!prev[rowId]) return prev
        const next = { ...prev }
        delete next[rowId]
        return next
      })
      try {
        await work()
        onDone()
        flashSaved(rowId)
      } catch (err) {
        setError(err instanceof Error ? err.message : fallback)
        // Reload on failure too. setPrimaryTeam clears the OLD primary before setting the new one,
        // so a throw leaves the person with no home team — and without this the stale row keeps
        // its "Home" pill and the no-home-team warning never appears.
        onDone()
        setRowStates((prev) => ({
          ...prev,
          [rowId]: {
            kind: 'failed',
            retry: () => run(rowId, work, fallback),
          },
        }))
      } finally {
        setBusyRowId(null)
      }
    },
    [onDone, flashSaved],
  )

  function handleToggle(team: TeamOption) {
    const rowId = `join:${team.id}`
    const membership = memberOf.get(team.id)
    if (membership) {
      return run(rowId, async () => {
        await endTeamMembership(person.id, team.id)
        onShowToast?.(`${person.full_name} removed from ${team.name}.`)
      }, 'Team change failed. Try again.')
    }
    return run(rowId, async () => {
      // The first team someone joins becomes their home team. Otherwise a person could sit on
      // teams with no primary at all, which resolves their capture stream to none (AC-001) — a
      // silent downstream effect of an action that looks like it only added a membership.
      await addTeamMembership(person.id, team.id, !hasPrimary)
      onShowToast?.(
        hasPrimary
          ? `${person.full_name} added to ${team.name}.`
          : `${person.full_name} added to ${team.name}, now their home team.`,
      )
    }, 'Team change failed. Try again.')
  }

  function handleMakeHome(team: TeamOption) {
    const rowId = `home:${team.id}`
    return run(rowId, async () => {
      await setPrimaryTeam(person.id, team.id)
      onShowToast?.(`${team.name} is now ${person.full_name}'s home team.`)
    }, 'Home team change failed. Try again.')
  }

  return (
    <div className="team-picker">
      {heading && (
        <h3 className="mb-1 text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
          {heading}
        </h3>
      )}
      {/* Names BOTH consequences. The second is the one an admin cannot guess from the words
          "home team": ops.is_stream_reviewer resolves review authority from the live primary
          membership, so a supervisor's home team decides whose production they approve. */}
      <p className="mb-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>
        The home team sets this person&rsquo;s default capture stream — and for a supervisor, which
        stream&rsquo;s logs they approve.
      </p>
      {/* Ending someone's HOME team leaves them on teams with no home team. Silent is the one
          option that is not available. */}
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

      <fieldset disabled={busyRowId !== null}>
        <legend className="sr-only">Teams for {person.full_name}</legend>

        {teams.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            No teams defined yet
          </p>
        ) : (
          <div className="overflow-hidden rounded-md" style={{ border: '1px solid var(--input)' }}>
            {teams.map((team, i) => {
              const membership = memberOf.get(team.id)
              const joinRowId = `join:${team.id}`
              const homeRowId = `home:${team.id}`
              const joinState = rowStates[joinRowId]
              const homeState = rowStates[homeRowId]
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
                      disabled={busyRowId !== null}
                      onToggle={() => handleToggle(team)}
                    />
                  </span>
                  {/* Inline Saved / Failed · Retry beside the JOIN row (DESIGN.md § Management dialogs A-5). */}
                  <SaveMarker
                    state={joinState}
                    ariaLive="polite"
                    savedLabel={t('admin.manage.rowSaved')}
                    failedLabel={t('admin.manage.rowFailed')}
                  />
                  {/* Outside the <label>, never inside it: a button nested in a label is both a
                      nesting violation and a second click target for the checkbox. */}
                  {membership?.is_primary === true && (
                    <Pill tone="primary" dot={false} className="flex-none">Home</Pill>
                  )}
                  {membership !== undefined && !membership.is_primary && (
                    <>
                      <button
                        type="button"
                        disabled={busyRowId !== null}
                        className="tap-target-phone flex-none rounded-sm px-2 text-xs text-primary font-medium hover:underline focus-visible:underline disabled:opacity-50"
                        onClick={() => handleMakeHome(team)}
                      >
                        Make home
                      </button>
                      <SaveMarker
                        state={homeState}
                        ariaLive="polite"
                        savedLabel={t('admin.manage.rowSaved')}
                        failedLabel={t('admin.manage.rowFailed')}
                      />
                    </>
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

interface SaveMarkerProps {
  state: RowState | undefined
  ariaLive: 'polite'
  savedLabel: string
  failedLabel: string
}

function SaveMarker({ state, savedLabel, failedLabel, ariaLive }: SaveMarkerProps) {
  if (!state) return null
  if (state.kind === 'saved') {
    return (
      <span
        role="status"
        aria-live={ariaLive}
        className="flex-none text-xs font-medium"
        style={{ color: 'var(--success)' }}
      >
        ✓ {savedLabel}
      </span>
    )
  }
  if (state.kind === 'failed') {
    return (
      <button
        type="button"
        onClick={() => {
          void state.retry()
        }}
        className="flex-none rounded-sm px-2 text-xs font-medium hover:underline focus-visible:underline"
        style={{ color: 'var(--destructive)' }}
      >
        {failedLabel}
      </button>
    )
  }
  return null
}
