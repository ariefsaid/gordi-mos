// Demo-login data, shared by DemoLogin.tsx + LoginPage.tsx.
// Kept in its own (non-component) module so react-refresh stays happy and the
// values are importable by tests. See DemoLogin.tsx for the prod-safety gate.

// Shared password for every dev persona. MUST stay in sync with the password in
// supabase/seed.dev-auth.sql (a mismatch fails loudly on first demo click).
export const DEMO_PASSWORD = 'Passw0rd!dev'

// The Gordi dev personas. Emails MUST match supabase/seed.sql (and the
// `%.dev@example.test` filter in supabase/seed.dev-auth.sql). Fictional only.
export const DEMO_PERSONAS: ReadonlyArray<{ label: string; email: string }> = [
  { label: 'Director', email: 'dewi.dev@example.test' },
  { label: 'Cafe Ops', email: 'cahya.dev@example.test' },
  { label: 'Kitchen', email: 'krishna.dev@example.test' },
  { label: 'Barista', email: 'bulan.dev@example.test' },
  { label: 'Kitchen staff', email: 'kartika.dev@example.test' },
  { label: 'Supervisor', email: 'sinta.dev@example.test' },
  { label: 'Roastery', email: 'rama.dev@example.test' },
  { label: 'Sales', email: 'sari.dev@example.test' },
  { label: 'Finance', email: 'fitri.dev@example.test' },
]

// The staging importer rewrites each seeded address to <local>@sample.gordi.test and assigns
// these accounts to the separate Gordi Sample organisation; never use live staff addresses.
export const SAMPLE_ORG_ID = '5a000000-0000-0000-0000-000000000001'
export const SAMPLE_PERSONAS: ReadonlyArray<{ label: string; email: string }> = DEMO_PERSONAS.map(
  ({ label, email }) => ({ label, email: email.replace(/\.dev@example\.test$/, '@sample.gordi.test') }),
)

export function demoLoginMode(
  env: { DEV?: boolean; PROD?: boolean; VITE_SAMPLE_ONE_CLICK_LOGIN?: string; VITE_SAMPLE_LOGIN_PASSWORD?: string },
  hostname: string,
): { kind: 'dev' | 'sample'; password: string; personas: ReadonlyArray<{ label: string; email: string }> } | null {
  if (env.DEV) return { kind: 'dev', password: DEMO_PASSWORD, personas: DEMO_PERSONAS }
  if (
    env.PROD && hostname === 'gordi-mos.pages.dev' &&
    env.VITE_SAMPLE_ONE_CLICK_LOGIN === 'true' &&
    (env.VITE_SAMPLE_LOGIN_PASSWORD?.length ?? 0) >= 12
  ) {
    return { kind: 'sample', password: env.VITE_SAMPLE_LOGIN_PASSWORD!, personas: SAMPLE_PERSONAS }
  }
  return null
}

// Decode-only: Supabase has already authenticated the session. A missing or different claim
// cannot turn a staging sample-button click into a real-org session.
export function isSampleSession(accessToken: string | undefined): boolean {
  try {
    const payload = accessToken?.split('.')[1]
    if (!payload) return false
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { org_id?: unknown }
    return claims.org_id === SAMPLE_ORG_ID
  } catch {
    return false
  }
}
