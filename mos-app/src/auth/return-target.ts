// Where sign-in sends a person back to.
//
// ProtectedRoute hands /login the route it turned away; the sanitiser below decides whether that
// route is somewhere we may return to. It is a whitelist by shape, not a blacklist: only a
// single-slash-rooted in-app path survives, so a `state` written by anything other than our own
// guard can never bounce the person off-app after a successful sign-in.
//
// The auth surfaces are entry doors, never destinations. Remembering /login or /recovery would
// land the person back on the form they just cleared, which reads as a failed sign-in.

export const HOME_TARGET = '/'

const AUTH_PATHS = ['/login', '/recovery']

export function safeReturnTarget(raw: unknown): string {
  if (typeof raw !== 'string') return HOME_TARGET
  const value = raw.trim()
  if (!value.startsWith('/')) return HOME_TARGET
  // `//host/path` is protocol-relative — a browser reads it as another origin. A backslash is
  // normalised to a slash by several browsers, so `/\evil.test` is the same trick spelled twice.
  if (value.startsWith('//') || value.includes('\\')) return HOME_TARGET

  const pathname = value.split(/[?#]/, 1)[0]
  if (AUTH_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return HOME_TARGET
  }
  return value
}
