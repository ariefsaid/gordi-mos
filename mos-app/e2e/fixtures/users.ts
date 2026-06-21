// E2E test user fixtures.
//
// PMO-aligned model (2026-06-21): e2e logs in AS the seeded *.dev personas — the SAME users the
// owner's one-click dev login uses — instead of separate `e2e.*` users linked to the shared person
// rows. global-setup.ts only ENSURES these exist + are linked (idempotent, never deletes), so running
// the suite can no longer orphan the dev personas / break dev login. See global-setup.ts header.
//
// Person IDs / names mirror supabase/seed.sql.

export const VIEWER = {
  email: 'cahya.dev@example.test',
  password: 'Passw0rd!dev',
  personId: '40000000-0000-0000-0000-000000000001', // Cahya Cafe (dual-hat: Cafe Ops + Sales leads)
}

// MANAGER: Dewi Director holds the Managing Director role (30000000-…-0000).
// Cahya (VIEWER) holds Cafe Ops Lead + Sales Lead, both reporting to the MD role
// → Dewi is isManager=true via deriveIsManager / shared.is_manager_of.
export const MANAGER = {
  email: 'dewi.dev@example.test',
  password: 'Passw0rd!dev',
  personId: '40000000-0000-0000-0000-000000000000', // Dewi Director (MD role holder)
}

// ORPHAN: dedicated e2e-only auth user with NO people link (user_id stays NULL → orphan screen).
// Touches no dev person row.
export const ORPHAN = {
  email: 'e2e.orphan@example.test',
  password: 'e2e-password-123',
  // no people link
}

// RECOVERY_VIEWER: dedicated e2e-only user + dedicated e2e person row. The AC-005 journey ROTATES
// this password, so it must NOT be a dev persona — otherwise the rotation would break that persona's
// dev login until the next run. Its person row is e2e-namespaced (4e00…) so it never collides with
// the dev canon.
export const RECOVERY_VIEWER = {
  email: 'e2e.recovery@example.test',
  password: 'e2e-password-123',
  personId: '4e000000-0000-0000-0000-000000000004', // dedicated e2e person (isolated from dev Sari)
  displayName: 'Recovery Tester',
}
