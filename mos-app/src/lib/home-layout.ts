// home-layout.ts — per-user Home arrangement (OD-V4-9).
// v1 store = localStorage, following the precedent set by the retired home-region-order module
// (RATIFY-1): one-line swap to a Personal-Profile column later. Guarded against private-mode and
// quota throws — always resolves to a valid layout so Home can never fail to render (NFR-922).

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
