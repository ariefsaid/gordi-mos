/**
 * Tells a failed READ apart from a broken RENDER.
 *
 * A read that failed because the network did is an error state the page owns — `ErrorState` with
 * Retry, inside the page frame, rail and header intact (DESIGN.md § Components → State conformance
 * matrix, "Offline is an error, not a crash"). The full-screen crash fallback is reserved for
 * exceptions thrown while rendering, which Retry cannot fix.
 *
 * `fetch` reports a transport failure as a `TypeError`, and every engine words it differently
 * ("Failed to fetch", "NetworkError when attempting to fetch resource.", "Load failed",
 * "Network request failed"). supabase-js and the browser both surface that same TypeError, so the
 * message set below — not an instanceof of some client's error class — is what identifies it.
 */
const NETWORK_MESSAGE =
  /failed to fetch|networkerror|network request failed|network error|load failed|fetch failed|err_internet_disconnected|the internet connection appears to be offline/i

export function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) return NETWORK_MESSAGE.test(error.message)
  // A thrown non-Error carrying a message (supabase wraps some transport failures in a plain
  // object with `message`), so the shape is read rather than the constructor.
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const { message } = error as { message: unknown }
    return typeof message === 'string' && NETWORK_MESSAGE.test(message)
  }
  return false
}
