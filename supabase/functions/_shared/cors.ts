/**
 * CORS for the app-facing edge functions: the response names the request's Origin only when it is
 * in the allowlist, so no other page reads the answer. `APP_ALLOWED_ORIGINS` (comma-separated)
 * sets the list; unset, empty or wildcard-only falls back to the production app origin and the
 * local dev server (config.toml site_url). A wildcard entry is never honoured.
 */
const DEFAULT_APP_ORIGINS = ['https://ops.gordi.id', 'http://localhost:5173', 'http://127.0.0.1:5173']

export function appOrigins(raw: string | undefined): string[] {
  const listed = (raw ?? '').split(',').map((s) => s.trim()).filter((s) => s && s !== '*')
  return listed.length > 0 ? listed : DEFAULT_APP_ORIGINS
}

export function corsHeaders(req: Request, origins: string[]): Record<string, string> {
  const origin = req.headers.get('Origin')
  return {
    ...(origin && origins.includes(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    Vary: 'Origin',
  }
}
