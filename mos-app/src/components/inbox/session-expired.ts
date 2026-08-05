/**
 * isSessionExpiredMessage — detects an auth/session-expiry failure from the notifications data
 * layer's thrown Error message (lib/db/notifications.ts wraps the underlying PostgREST/Supabase
 * error text verbatim, e.g. "listNotifications failed: JWT expired"). Matches the vocabulary
 * Supabase/PostgREST actually use for a dead or invalid access token (JWT expired — PGRST301;
 * invalid/malformed JWT; "not authenticated"; a raw 401) so Inbox can tell "your session is gone"
 * apart from an ordinary transient fetch failure.
 *
 * H9 fix (design audit, 2026-07-27): Inbox used to render the SAME generic error for this case,
 * with a "Try again" button that re-fires the identical call — which can never succeed once the
 * token itself is dead, so the retry is a dead loop. Detecting the case here lets the connected
 * surface try one silent session refresh, then fall back to an honest "sign in again" — never the
 * infinite identical retry.
 */
export function isSessionExpiredMessage(message: string | null): boolean {
  if (!message) return false
  return /jwt|not authenticated|invalid.{0,2}token|unauthorized|\b401\b/i.test(message)
}
