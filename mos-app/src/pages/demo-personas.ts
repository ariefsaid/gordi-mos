// DEV-ONLY demo-login data, shared by DemoLogin.tsx + LoginPage.tsx.
// Kept in its own (non-component) module so react-refresh stays happy and the
// values are importable by tests. See DemoLogin.tsx for the prod-safety gate.

// Shared password for every dev persona. MUST stay in sync with the password in
// supabase/seed.dev-auth.sql (a mismatch fails loudly on first demo click).
export const DEMO_PASSWORD = 'Passw0rd!dev'

// The six Gordi dev personas. Emails MUST match supabase/seed.sql (and the
// `%.dev@example.test` filter in supabase/seed.dev-auth.sql). Fictional only.
export const DEMO_PERSONAS: ReadonlyArray<{ label: string; email: string }> = [
  { label: 'Director', email: 'dewi.dev@example.test' },
  { label: 'Cafe Ops', email: 'cahya.dev@example.test' },
  { label: 'Kitchen', email: 'krishna.dev@example.test' },
  { label: 'Roastery', email: 'rama.dev@example.test' },
  { label: 'Sales', email: 'sari.dev@example.test' },
  { label: 'Finance', email: 'fitri.dev@example.test' },
]
