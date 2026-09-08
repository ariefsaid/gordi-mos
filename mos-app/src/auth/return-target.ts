// Where sign-in sends a person back to.
//
// ProtectedRoute hands /login the route it turned away; the sanitiser below decides whether that
// route is somewhere we may return to. It is a whitelist by shape, not a blacklist: only a
// single-slash-rooted in-app path with no whitespace or control characters survives, so a `state`
// written by anything other than our own guard can never bounce the person off-app after a
// successful sign-in.
//
// The auth surfaces are entry doors, never destinations. Remembering /login or /recovery would
// land the person back on the form they just cleared, which reads as a failed sign-in.

export const HOME_TARGET = '/'

const AUTH_PATHS = ['/login', '/recovery']

// URL parsing strips tab, LF and CR before resolving, so a rooted path carrying one of them
// reaches an off-app origin while still reading as rooted. Whitespace and C0/DEL characters are
// rejected rather than stripped: the shapes we accept never contain one. Spelled by code point
// rather than a character class — a regex holding literal control characters is unreadable and
// the linter rightly refuses it.
function hasUnsafeCharacter(value: string): boolean {
  if (/\s/.test(value)) return true
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

// Rooted, one slash, no backslash first step (a backslash is normalised to a slash by several
// browsers, so `/\evil.test` is the protocol-relative trick spelled twice), no whitespace.
const IN_APP_PATH = /^\/(?![/\\])[^\s]*$/

export function safeReturnTarget(raw: unknown): string {
  if (typeof raw !== 'string') return HOME_TARGET
  if (hasUnsafeCharacter(raw)) return HOME_TARGET
  if (!IN_APP_PATH.test(raw)) return HOME_TARGET
  if (raw.includes('\\')) return HOME_TARGET

  const pathname = raw.split(/[?#]/, 1)[0]
  if (AUTH_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return HOME_TARGET
  }
  return raw
}
