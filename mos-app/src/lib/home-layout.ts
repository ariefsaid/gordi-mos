// home-layout.ts — per-user Home arrangement.
//
// v1 store = localStorage: a preference with no cross-device claim attached to it, so a server
// column buys nothing yet. Guarded against private-mode and quota throws — every path resolves to
// a valid layout, so a storage failure can never stop Home from rendering.
//
// Ported with the Personal Profile surface (#199): the Profile page is where the choice is MADE.
// The Home page is where it is READ, and that half lands with the Home port — this module is the
// seam both sides meet at, which is why it lives in `lib/` rather than under either page.

export type HomeLayout = 'focused' | 'overview' | 'list'

export const HOME_LAYOUTS: readonly HomeLayout[] = ['focused', 'overview', 'list']

const DEFAULT: HomeLayout = 'focused'
const key = (personId: string) => `gordi.home.layout.${personId}`

function isHomeLayout(v: unknown): v is HomeLayout {
  return typeof v === 'string' && (HOME_LAYOUTS as readonly string[]).includes(v)
}

/** Resolve the stored layout for a person, or the default when nothing is stored/valid. */
export function resolveHomeLayout(personId: string): HomeLayout {
  try {
    const v = window.localStorage.getItem(key(personId))
    return isHomeLayout(v) ? v : DEFAULT
  } catch {
    return DEFAULT
  }
}

/** Persist the layout for a person. Silently no-ops on quota/private-mode throws. */
export function setHomeLayout(personId: string, layout: HomeLayout): void {
  try {
    window.localStorage.setItem(key(personId), layout)
  } catch {
    /* ignore quota / private-mode */
  }
}
