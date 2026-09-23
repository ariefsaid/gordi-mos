/** Refuse visually plausible auth/error redirects as evidence for another manifest route. */
export function assertAuditRoute(actualUrl: string, expectedPathname: string): void {
  const observed = new URL(actualUrl).pathname.replace(/\/$/, '') || '/'
  const expected = expectedPathname.replace(/\/$/, '') || '/'
  if (observed !== expected) {
    throw new Error(`audit route mismatch: expected ${expected}; observed ${observed}`)
  }
}
