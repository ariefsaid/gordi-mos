import type { PageFamily } from './page-families'

export interface PageFamilyMigrationEntry {
  path: string
  family: PageFamily
  /** The page component file that must render the `PageFamilyFrame` for this entry to be true. */
  sourceFile: string
  symbol: string
}

/**
 * The routes whose page renders on a `PageFamilyFrame`, and whose region-3 page head therefore
 * OWNS the job sentence. `ContextRow` reads this list to stay silent on those routes, so the
 * sentence is shown exactly once across regions 2 and 3 (see context-row.tsx).
 *
 * **It is empty here, and that is a fact about this branch rather than an omission.** The list is
 * a claim about which page components render the frame. `PageFamilyFrame` itself lands with this
 * PR (the app-shell chrome port); no page uses it yet, because the pages port one ticket at a
 * time. v4's copy of this file names ~25 routes — carrying that list across would assert that
 * Home, Tasks, Money and the Café surfaces already emit a region-3 job sentence when on this
 * branch none of them do. ContextRow would suppress its own sentence on nearly every route with
 * nothing filling the gap, and the shell would lose its context signal for the length of the port.
 *
 * **The cutover is per surface**, the same shape the route table uses: the PR that moves a page
 * onto `PageFamilyFrame` adds that page's entry here, in that same PR. `sourceFile`/`symbol` name
 * the component that has to render the frame, so an entry stays checkable against what it names.
 *
 * v4 also carries an `assertPageFamilyMigration` guard that reconciles this registry against the
 * classified product routes. Route classification is a separate ticket, so the guard travels with
 * it rather than sitting here with nothing to check.
 */
export const PAGE_FAMILY_FRAME_ROUTES: readonly PageFamilyMigrationEntry[] = []
