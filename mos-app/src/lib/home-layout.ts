// Per-person Home arrangement (OD-V4-9). Storage is a small preference seam: replacing it with a
// Personal Profile column later should not change the Home data model or the three renderers.

export type HomeLayout = 'focused' | 'overview' | 'list'

export const HOME_LAYOUTS: readonly HomeLayout[] = ['focused', 'overview', 'list']

const DEFAULT: HomeLayout = 'focused'
const key = (personId: string) => `gordi.home.layout.${personId}`

function isHomeLayout(value: unknown): value is HomeLayout {
  return typeof value === 'string' && (HOME_LAYOUTS as readonly string[]).includes(value)
}

/** Resolve one person's saved arrangement, falling back safely for invalid or unavailable storage. */
export function resolveHomeLayout(personId: string): HomeLayout {
  try {
    const value = window.localStorage.getItem(key(personId))
    return isHomeLayout(value) ? value : DEFAULT
  } catch {
    return DEFAULT
  }
}

/** Persist one person's arrangement without making Home depend on storage availability. */
export function setHomeLayout(personId: string, layout: HomeLayout): void {
  try {
    window.localStorage.setItem(key(personId), layout)
  } catch {
    // Private browsing and quota failures must not block the in-memory interaction.
  }
}
