import { Link } from 'react-router-dom'
import { isShipGated } from '@/lib/ship-gate'

/** The Objective a task group belongs to. `id: null` = named but not actually joined to one. */
export type ObjectiveHintValue = { id: string | null; name: string }

type ObjectiveHintProps = {
  hint: ObjectiveHintValue
  /** The owning surface's own class — desktop `gobjective …`, phone `mgc-objective-hint`. */
  className: string
}

/**
 * A task group's Objective hint: always the NAME, and a drill into that Objective only when there
 * is somewhere to go.
 *
 * The live rule: the drill renders when the hint is joined to a real Objective
 * (`hint.id != null`) AND the Objectives route is un-gated (`isShipGated('/work/objectives')`
 * is false); otherwise the name renders as plain text. A named-but-unjoined Objective has no
 * destination, and a gated one must not be linked to — but the name still tells a reader which
 * Objective a group of work belongs to, so it renders either way.
 *
 * **One component for both surfaces.** The desktop group header and the phone cards render this
 * hint (Rule 9 parity) and their answer has to be identical, so the rule lives here rather than
 * twice. Holding the path here also keeps `/work/objectives` from being spelled in app code that
 * may link there only conditionally — which the static sweep in
 * `guard-no-links-to-retired-paths.test.ts` cannot judge by reading text, and which is why this
 * file is the one exemption that sweep carries for Tasks.
 *
 * The drill is a search-param query rather than a record path because the Objectives catalog has
 * no per-record route: the hint carries a name, and the catalog's own search resolves it.
 */
export function ObjectiveHint({ hint, className }: ObjectiveHintProps) {
  const drillable = hint.id != null && !isShipGated('/work/objectives')
  return (
    <span className={className}>
      {drillable
        ? <Link to={`/work/objectives?q=${encodeURIComponent(hint.name)}`}>{hint.name}</Link>
        : hint.name}
    </span>
  )
}
