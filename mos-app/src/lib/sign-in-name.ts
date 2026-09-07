// A person without an email signs in with a sign-in name: a synthetic address on this domain is
// what the login stores, so "has a real email" is derivable from the address alone (#798).
export const SYNTHETIC_EMAIL_DOMAIN = 'ops.gordi.local'

export function hasRealEmail(email: string | null | undefined): boolean {
  return !!email && !email.toLowerCase().endsWith(`@${SYNTHETIC_EMAIL_DOMAIN}`)
}
