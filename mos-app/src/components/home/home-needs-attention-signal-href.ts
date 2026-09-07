// Where a Home Needs-you-now Signal row opens on click — the shared Signal record surface. Kept
// in its own file so the row component stays fast-refresh-safe (react-refresh only-export-
// components); the tests read it back to prove the row is a real link to the record.
const SIGNAL_ROUTE = '/work/signals'

export function homeAttentionSignalHref(signalId: string): string {
  return `${SIGNAL_ROUTE}?record=${encodeURIComponent(signalId)}`
}
