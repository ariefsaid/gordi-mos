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

// ── The active location's BRANCH, for surfaces that never see the Opening Team ───────────────
// The Café root resolves a location to an Opening Team and remembers its id. Plan and Stock are
// sibling routes that never go through that root, so the team id alone tells them nothing: what
// they need to bound their own stream choice is the branch behind it. The root knows both at the
// moment of the choice, so it records both rather than making every other surface re-resolve one
// from the other.

const BRANCH_KEY = 'mos.cafe.opening.branch'

export interface CafeActiveLocation {
  branchId: string
  branchName: string
}

const branchByPerson = new Map<string, CafeActiveLocation | null>()

function branchStorageKey(personId: string): string {
  return `${BRANCH_KEY}.${personId}`
}

function readStoredBranch(personId: string): CafeActiveLocation | null {
  try {
    const raw = window.sessionStorage.getItem(branchStorageKey(personId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CafeActiveLocation>
    return parsed.branchId ? { branchId: parsed.branchId, branchName: parsed.branchName ?? '' } : null
  } catch {
    return null
  }
}

/** The branch the viewer is currently working at, or null when no location has been chosen. */
export function activeCafeLocation(personId: string | null | undefined): CafeActiveLocation | null {
  if (!personId) return null
  if (!branchByPerson.has(personId)) branchByPerson.set(personId, readStoredBranch(personId))
  return branchByPerson.get(personId) ?? null
}

/** Record the branch behind a deliberate location choice, beside its Opening Team. */
export function rememberCafeLocation(personId: string, location: CafeActiveLocation | null): void {
  if (!personId) return
  branchByPerson.set(personId, location)
  try {
    if (location) window.sessionStorage.setItem(branchStorageKey(personId), JSON.stringify(location))
    else window.sessionStorage.removeItem(branchStorageKey(personId))
  } catch {
    // Private mode / disabled storage: the in-memory value still serves this page session.
  }
}
