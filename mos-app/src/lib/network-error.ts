/**
 * Recognizes transport failures surfaced by browser imports and API reads.
 *
 * Browser engines phrase fetch errors differently ("Failed to fetch", "NetworkError when
 * attempting to fetch resource.", "Load failed", "Network request failed"), so matching messages
 * avoids relying on client-specific error classes.
 */
const NETWORK_MESSAGE =
  /failed to fetch|networkerror|network request failed|network error|load failed|fetch failed|err_internet_disconnected|the internet connection appears to be offline/i
const MODULE_LOAD_MESSAGE =
  /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i

function getErrorMessage(error: unknown): string | undefined {
  if (error instanceof Error) return error.message
  // A thrown non-Error carrying a message (supabase wraps some transport failures in a plain
  // object with `message`), so the shape is read rather than the constructor.
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const { message } = error as { message: unknown }
    if (typeof message === 'string') return message
  }
  return undefined
}

export function isModuleLoadError(error: unknown): boolean {
  return MODULE_LOAD_MESSAGE.test(getErrorMessage(error) ?? '')
}

export function isNetworkError(error: unknown): boolean {
  return NETWORK_MESSAGE.test(getErrorMessage(error) ?? '')
}
