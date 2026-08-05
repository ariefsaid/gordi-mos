// Pure, framework-free URL <-> typed-query helpers for the RecordCollection engine.
// No React, no Supabase. Domain schemas (Tasks, Signals) supply the typed parse/serialize.
import type {
  CollectionQueryIssue,
  CollectionQueryParse,
  CollectionQuerySchema,
  PresentationSwitchResult,
  QueryKey,
} from './types'

/** Parse the collection's owned URL keys into a typed query, or return typed issues. */
export function readCollectionQuery<TQuery extends object>(
  schema: CollectionQuerySchema<TQuery>,
  params: URLSearchParams,
  presentation: string,
): CollectionQueryParse<TQuery> {
  return schema.parse(params, presentation)
}

/**
 * Serialize the typed query into `source`, replacing ONLY the URL keys the schema owns and
 * preserving every unrelated route key already present in `source`.
 */
export function writeCollectionQuery<TQuery extends object>(
  schema: CollectionQuerySchema<TQuery>,
  query: TQuery,
  source: URLSearchParams,
): URLSearchParams {
  const next = new URLSearchParams(source)
  const owned = schema.serialize(query)
  const ownedKeys = new Set<string>()
  for (const key of owned.keys()) ownedKeys.add(key)
  // Also clear any owned keys that are absent from `owned` this time (they became neutral).
  const neutralOwned = schema.serialize(schema.neutral)
  for (const key of neutralOwned.keys()) ownedKeys.add(key)
  for (const key of ownedKeys) next.delete(key)
  for (const [key, value] of owned.entries()) next.append(key, value)
  return next
}

function isPopulated<TQuery extends object>(
  query: TQuery,
  neutral: TQuery,
  key: QueryKey<TQuery>,
): boolean {
  return query[key] !== neutral[key]
}

/**
 * Decide whether the current typed query survives a presentation switch. A populated query key
 * (value differs from the schema neutral) that the target presentation does not support is a typed
 * rejection; nothing is silently dropped or reset. On failure the ORIGINAL query and presentation
 * are returned unchanged.
 */
export function checkPresentationCompatibility<
  TQuery extends object,
  TPresentation extends string,
>(args: {
  query: TQuery
  schema: CollectionQuerySchema<TQuery>
  from: TPresentation
  to: TPresentation
  compatibleQueryKeys: Readonly<Record<TPresentation, readonly QueryKey<TQuery>[]>>
}): PresentationSwitchResult<TQuery, TPresentation> {
  const { query, schema, from, to, compatibleQueryKeys } = args
  const supported = new Set<QueryKey<TQuery>>(compatibleQueryKeys[to] ?? [])
  const issues: CollectionQueryIssue[] = []
  for (const key of schema.keys) {
    if (!isPopulated(query, schema.neutral, key)) continue
    if (supported.has(key)) continue
    issues.push({
      key,
      code: 'unsupported-by-presentation',
      value: stringifyValue(query[key]),
    })
  }
  if (issues.length > 0) {
    return { ok: false, query, presentation: from, issues }
  }
  return { ok: true, query, presentation: to }
}

function stringifyValue(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  return String(value)
}
