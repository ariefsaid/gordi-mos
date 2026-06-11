// E2E test user fixtures. Seeded against the local Supabase stack by global-setup.ts.
// person IDs match supabase/seed.sql (Cahya Cafe is dual-hat, linked to 40000000-...-0001).

export const VIEWER = {
  email: 'e2e.viewer@example.test',
  password: 'e2e-password-123',
  personId: '40000000-0000-0000-0000-000000000001', // Cahya Cafe (dual-hat seed)
}

// Used for future manager-surface e2e (P1-4 team module)
export const MANAGER_TARGET_PERSON = '40000000-0000-0000-0000-000000000004' // Sari Sales (under Cahya's Sales Lead)

export const ORPHAN = {
  email: 'e2e.orphan@example.test',
  password: 'e2e-password-123',
  // no people link — user_id stays NULL → no person_id claim → orphan screen
}

// Dedicated fixture for the password-recovery e2e journey (AC-005).
// Uses a separate person row (Sari Sales) so that password rotation in the test does NOT
// affect VIEWER's password, keeping auth-password-login and auth-signout-back stable.
export const RECOVERY_VIEWER = {
  email: 'e2e.recovery@example.test',
  password: 'e2e-password-123',
  personId: '40000000-0000-0000-0000-000000000004', // Sari Sales (available seed person)
}
