import { Navigate, useLocation, useParams } from 'react-router-dom'

/**
 * The ONE redirect element in the route table (FR-015/FR-016).
 *
 * A retired path forwards to its canonical replacement, in one hop, with:
 *
 *  • **the history entry replaced**, so Back does not re-enter the retired path and bounce again;
 *  • **`?view=` / `?record=` and every other query parameter carried across**, so a shared deep
 *    link opens what the sender saw rather than the destination's default view;
 *  • **`:param` segments substituted** from the matched route, so `/tasks/:taskId` reaches
 *    `/work/tasks/<that id>` and not a literal `:taskId`.
 *
 * Why one component and not react-router's `<Navigate>` directly: `<Navigate>` drops the query
 * string, and three of the redirects in the map carry a record identifier in the path. v4-redesign
 * had three separate idioms for this (`<Navigate>`, `SearchRedirect`, `TasksIdRedirect`), which
 * meant every assertion about "the redirect map" had to know which of the three each entry used,
 * and only the entries someone remembered to wire to `SearchRedirect` preserved the query at all.
 * One component makes the whole map enumerable and gives every entry the same guarantees.
 *
 * A `to` that carries its own query string (`/work/tasks?view=followups`) keeps it and drops the
 * incoming one: that target names a specific view, so honouring the caller's `?view=` would defeat
 * the point of the redirect.
 */
export function RouteRedirect({ to }: { to: string }) {
  const params = useParams()
  const { search } = useLocation()

  const hash = to.indexOf('#')
  const withoutHash = hash === -1 ? to : to.slice(0, hash)
  const q = withoutHash.indexOf('?')
  const rawPath = q === -1 ? withoutHash : withoutHash.slice(0, q)
  const ownSearch = q === -1 ? '' : withoutHash.slice(q)

  const pathname = rawPath
    .split('/')
    .map((segment) => {
      if (!segment.startsWith(':')) return segment
      const value = params[segment.slice(1)]
      return value === undefined ? segment : encodeURIComponent(value)
    })
    .join('/')

  return <Navigate to={{ pathname, search: ownSearch || search }} replace />
}
