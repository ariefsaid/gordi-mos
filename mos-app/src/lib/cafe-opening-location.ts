// The Café Opening location remembered for one signed-in person in this browser session.
// Opening is branch-wide, so this context is separate from the production stream (branch +
// activity). The person may deliberately switch locations for multi-branch coverage, but a
// remembered choice must never be read by a different identity in the same tab/session.

const STORAGE_KEY = 'mos.cafe.opening.location'

const rememberedByPerson = new Map<string, string | null | undefined>()

function storageKey(personId: string): string {
  return `${STORAGE_KEY}.${personId}`
}

function readStored(personId: string): string | null {
  try {
    return window.sessionStorage.getItem(storageKey(personId))
  } catch {
    return null
  }
}

/** The remembered canonical Opening Team for this person, or null when none is valid yet. */
export function rememberedCafeOpeningTeamId(personId: string): string | null {
  if (!personId) return null
  if (!rememberedByPerson.has(personId)) rememberedByPerson.set(personId, readStored(personId))
  return rememberedByPerson.get(personId) ?? null
}

/** Keep a deliberate location choice in this person's session only. */
export function rememberCafeOpeningTeam(personId: string, teamId: string | null): void {
  if (!personId) return
  rememberedByPerson.set(personId, teamId)
  try {
    if (teamId) window.sessionStorage.setItem(storageKey(personId), teamId)
    else window.sessionStorage.removeItem(storageKey(personId))
  } catch {
    // Private mode / disabled storage: the in-memory value still serves this page session.
  }
}
