import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { can } from '@/lib/capabilities'
import { useT } from '@/i18n/use-t'
import type { BranchOption } from '@/lib/db/kitchen-logs.types'
import {
  getTodayOpeningForBranch,
  startTodayOpening,
  type CafeOpeningForBranch,
} from '@/lib/db/cafe-opening'
import './cafe-opening-door-row.css'

// CafeOpeningDoorRow — #789 (ruling OD-WAY-95 (4), absorbs #740). The Café Opening is one door
// row on the Café root: `☕ Opening · <Branch> · x/y done →` when today's run exists (activating
// opens the run's Task record in the record grammar — drawer ≥1370, page below, full-screen on
// phone), or a `.btn-outline`-weight `Start today's opening` when it does not.
//
// The branch is the branch of the stream in view (parent passes it), so head and door never
// disagree — an ops lead switching streams sees the door follow. One opening covers the branch's
// kitchen and bar together (the canonical Team is resolved server-side by
// `shared.cafe_opening_team` in the spawn RPC, so a second start returns the existing run and the
// row reads as started for the next person). No Team select exists anywhere on the route; the
// pending-PIC chips stay on the Task record, not on /cafe. Finance and other unaffiliated viewers
// see no door and no start control — the parent gates the mount on `canCapture`, and this
// component additionally reads null from the resolver (the RPC's `cafe_opening_can_start` filter
// is the authorization mirror) so a raw mount would still render nothing.
//
// The resolver is `getTodayOpeningForBranch` (lib/db/cafe-opening.ts): the ONE seam this row and
// the Home Café door read (AC-033 pins them by module identity), so both surfaces always agree.

export interface CafeOpeningDoorRowProps {
  /** The branch of the stream in view — parent-provided so the door follows a stream switch. */
  branch: BranchOption
}

type Fetch =
  | { kind: 'loading' }
  | { kind: 'absent' }               // no opening authorised for the caller / branch
  | { kind: 'ready'; opening: CafeOpeningForBranch }
  | { kind: 'error' }

export function CafeOpeningDoorRow({ branch }: CafeOpeningDoorRowProps) {
  const t = useT()
  const auth = useAuth()
  const accessRoles = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  const canStart = can(accessRoles, 'process.start')
  const navigate = useNavigate()

  const [state, setState] = useState<Fetch>({ kind: 'loading' })
  const [starting, setStarting] = useState(false)

  const load = useCallback(() => {
    setState({ kind: 'loading' })
    getTodayOpeningForBranch(branch.id)
      .then((opening) => {
        if (!opening) { setState({ kind: 'absent' }); return }
        setState({ kind: 'ready', opening })
      })
      .catch(() => setState({ kind: 'error' }))
  }, [branch.id])

  useEffect(() => { load() }, [load])

  // A slow bootstrap or an error path renders nothing rather than a placeholder banner: the row
  // is a secondary door on a capture list, and a skeleton in this slot would compete with the
  // list's own loading state. An `absent` result — the RPC that filters branches by
  // `cafe_opening_can_start` returned no row for this branch — is the authorization mirror and
  // must be silent for the same reason finance sees no door.
  if (state.kind !== 'ready') return null
  const { opening } = state

  // Started — one row reads `☕ Opening · <Branch> · x/y done →` and activates into the run's
  // Task record. The record grammar (drawer ≥1370, page below, full-screen on phone) is the
  // destination's own — the row deliberately owns no drawer of its own. The verb glyph is
  // aria-hidden; the anchor's accessible name is the same visible line so a screen reader
  // hears exactly what the row shows.
  if (opening.runId && opening.rollup) {
    const line = t('cafe.opening.doorRow.started', {
      branch: branch.name,
      done: opening.rollup.done,
      total: opening.rollup.total,
    })
    return (
      <Link
        to={`/work/tasks?occurrence=${opening.runId}`}
        className="btn btn-outline cafe-opening-door-row"
      >
        <span className="cafe-opening-door-row-state">{line}</span>
        <span className="cafe-opening-door-row-verb" aria-hidden="true">→</span>
      </Link>
    )
  }

  // Not started — a capable viewer sees the `Start today's opening` row; a member without
  // process.start sees no start affordance and no door. The row itself is the click surface —
  // its accessible name is the full verb+object phrase (`Start today's opening`), never a bare
  // `Start` (Rule 7).
  if (!canStart) return null

  async function handleStart() {
    if (!opening) return
    setStarting(true)
    try {
      const spawn = await startTodayOpening(opening.processId, opening.teamId)
      // The row's job is to open the record grammar; a fresh spawn skips the intermediate
      // re-fetch and navigates straight into the run's Task record, so the next person on
      // the same branch (kitchen or bar) will find the row already reading as started.
      navigate(`/work/tasks?occurrence=${spawn.run_id}`)
    } catch {
      // A spawn refusal (RLS, missing config) surfaces by re-reading the row's own state,
      // which resolves to `absent` under the same policy and hides the door.
      load()
    } finally {
      setStarting(false)
    }
  }

  return (
    <button
      type="button"
      className="btn btn-outline cafe-opening-door-row"
      onClick={() => { void handleStart() }}
      disabled={starting}
      aria-busy={starting}
    >
      <span className="cafe-opening-door-row-state">{t('cafe.opening.start')}</span>
    </button>
  )
}
