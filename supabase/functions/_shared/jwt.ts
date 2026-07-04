/**
 * decodeJwtClaims — decode the org_id/person_id/access_roles claims from a Supabase access
 * JWT's payload segment (D1: the JWT claim IS the authority — no `profiles` lookup).
 *
 * Extracted from compose-view/index.ts's original inline helper (T10) so agent-chat/index.ts
 * (T18) reuses the SAME decode logic rather than duplicating it. Pure (no Deno globals) —
 * importable in both Deno and Node/Vitest (D7); `atob` is a standard global in both runtimes.
 *
 * Decode-only — never verifies the signature (verification is index.ts's separate
 * `verifierClient.auth.getUser(jwt)` call, service_role, D3). This function trusts that the
 * caller already validated the token; it exists purely to read the org_id/person_id/
 * access_roles claims the SPA's shared.custom_access_token_hook minted into it, mirroring
 * `mos-app/src/lib/db/viewer.ts`'s `decodeAccessRolesClaim`.
 */
export function decodeJwtClaims(
  jwt: string,
): { org_id?: string; person_id?: string; access_roles?: string[] } {
  try {
    const payload = jwt.split('.')[1]
    if (!payload) return {}
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as {
      org_id?: unknown
      person_id?: unknown
      access_roles?: unknown
    }
    return {
      org_id: typeof json.org_id === 'string' ? json.org_id : undefined,
      person_id: typeof json.person_id === 'string' ? json.person_id : undefined,
      access_roles: Array.isArray(json.access_roles) ? (json.access_roles as string[]) : undefined,
    }
  } catch {
    return {}
  }
}
