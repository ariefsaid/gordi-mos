// TeamPicker — the Teams section of the person panel.
//
// Two things Position does not carry:
//  1. Membership is an authorization input, not a label — checking a box here can widen what
//     someone READS. The database holds that line (admin-only writes); this is the screen in
//     front of it.
//  2. A Team carrying (branch, activity) IS a production stream, and the live PRIMARY membership
//     resolves the person's default capture stream. "Home" therefore has a downstream effect,
//     which is why it is a visible control and not check order.
//
// Removal is a soft end (no DELETE grant, and membership history is worth keeping).

import { useState } from 'react'
import { useT } from '@/i18n/use-t'
import { matchesTokens } from '@/lib/token-search'
import { addTeamMembership, endTeamMembership, setPrimaryTeam } from '@/lib/db/admin-users'
import { teamStreamLabel, type AdminPersonRow, type TeamOption } from '@/lib/db/admin-users.types'
import { Pill } from '@/components/ui/pill'
import { CheckboxRow } from './checkbox-row'
import { FilterEmpty, ListFilter, ShowAll } from './long-list'
import { FILTER_THRESHOLD, useLongList } from './use-long-list'
import { RowStatus } from './row-status'
import type { RowCommits } from './use-row-commits'

export interface TeamPickerProps {
  person: AdminPersonRow
  /** Every live team, from listTeams(). */
  teams: TeamOption[]
  /** The panel's shared row-commit state; keys here start with `team:` and `home:`. */
  commits: RowCommits<boolean>
  /** Reload the person after a write, success or failure. */
  refresh: () => Promise<void>
}

// One status per row: an in-flight write outranks a failure, which outranks an earlier Saved.
const STATUS_RANK = { none: 0, saved: 1, failed: 2, saving: 3 } as const

export function TeamPicker({ person, teams, commits, refresh }: TeamPickerProps) {
  const t = useT()
  const [filter, setFilter] = useState('')
  const busy = commits.busy('team:') || commits.busy('home:')

  const memberOf = new Map(person.teams.map((m) => [m.team_id, m]))
  const hasPrimary = person.teams.some((m) => m.is_primary)
  const list = useLongList(teams, (team) => team.id, (team) => memberOf.has(team.id))
  const collapsed = list.collapsed(filter)
  const visible = list.ordered.filter((team) => collapsed
    ? list.pinned(team) || commits.display(`team:${team.id}`, memberOf.has(team.id))
    : matchesTokens(filter, [team.name, teamStreamLabel(team)]))

  function toggle(team: TeamOption, checked: boolean) {
    const saved = memberOf.has(team.id)
    const wanted = !checked
    // The first team someone joins becomes their home team. Otherwise a person could sit on teams
    // with no primary at all, which resolves their capture stream to none — a silent downstream
    // effect of an action that looks like it only added a membership.
    const write = wanted
      ? () => addTeamMembership(person.id, team.id, !hasPrimary)
      : () => endTeamMembership(person.id, team.id)
    // Reload on failure too: setPrimaryTeam and the membership writes can leave the person without
    // a home team, and the screen must not keep asserting one the database no longer holds.
    void commits.commit(`team:${team.id}`, wanted, saved, write, refresh)
  }

  function makeHome(team: TeamOption) {
    void commits.commit(`home:${team.id}`, true, memberOf.get(team.id)?.is_primary === true, () => setPrimaryTeam(person.id, team.id), refresh)
  }

  return (
    <div className="admin-person-section__body">
      <p className="admin-person-section__helper">{t('admin.teams.helper')}</p>
      {/* Ending someone's HOME team leaves them on teams with no home team. Rather than guess a
          replacement or block the removal, say so where it happened and leave it one click from
          fixed. */}
      {person.teams.length > 0 && !hasPrimary && (
        <p role="status" className="admin-person-warning">
          {t('admin.teams.noHome', { name: person.full_name })}
        </p>
      )}

      {teams.length > FILTER_THRESHOLD && (
        <ListFilter section={t('admin.person.teams')} value={filter} onChange={setFilter} />
      )}

      <fieldset>
        <legend className="sr-only">{t('admin.teams.legend', { name: person.full_name })}</legend>

        {teams.length === 0 ? (
          <p className="admin-person-section__empty">{t('admin.teams.none')}</p>
        ) : visible.length === 0 ? (
          !collapsed && <FilterEmpty query={filter} />
        ) : (
          <div className="admin-choice-list">
            {visible.map((team, i) => {
              const membership = memberOf.get(team.id)
              const checked = commits.display(`team:${team.id}`, membership !== undefined)
              const homeStatus = commits.status(`home:${team.id}`)
              // A failed Make home keeps its button with Failed · Retry beside it; only an
              // in-flight one already reads as Home.
              const isHome = membership?.is_primary === true || homeStatus === 'saving'
              const statusKey = STATUS_RANK[homeStatus ?? 'none'] > STATUS_RANK[commits.status(`team:${team.id}`) ?? 'none']
                ? `home:${team.id}`
                : `team:${team.id}`
              const rowSaving = commits.status(statusKey) === 'saving'
              return (
                <CheckboxRow
                  key={team.id}
                  label={team.name}
                  description={teamStreamLabel(team)}
                  checked={checked}
                  disabled={busy}
                  divider={i > 0}
                  onToggle={() => toggle(team, checked)}
                  trailing={
                    <>
                      {checked && isHome && (
                        <Pill tone="primary" dot={false} className="flex-none">{t('admin.person.home')}</Pill>
                      )}
                      {checked && !isHome && membership !== undefined && (
                        <button
                          type="button"
                          disabled={busy || rowSaving}
                          aria-label={t('admin.teams.makeHomeAria', { team: team.name })}
                          className="tap-target-phone flex-none rounded-sm px-2 text-xs text-primary font-medium hover:underline focus-visible:underline disabled:opacity-50"
                          onClick={() => makeHome(team)}
                        >
                          {t('admin.teams.makeHome')}
                        </button>
                      )}
                      <RowStatus
                        status={commits.status(statusKey)}
                        error={commits.error(statusKey)}
                        item={team.name}
                        onRetry={() => void commits.retry(statusKey)}
                      />
                    </>
                  }
                />
              )
            })}
          </div>
        )}
        {collapsed && visible.length < teams.length && <ShowAll count={teams.length} onShow={list.showAll} />}
      </fieldset>
    </div>
  )
}
