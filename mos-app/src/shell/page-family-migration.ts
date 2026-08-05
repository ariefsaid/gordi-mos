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
 * **It holds only the surfaces that have actually ported, and that is a fact about this branch
 * rather than an omission.** The list is a claim about which page components render the frame.
 * v4's copy of this file names ~25 routes — carrying that list across would assert that Home,
 * Tasks, Money and the Café surfaces already emit a region-3 job sentence when on this branch
 * none of them do. ContextRow would suppress its own sentence on nearly every route with nothing
 * filling the gap, and the shell would lose its context signal for the length of the port.
 *
 * **The cutover is per surface**, the same shape the route table uses: the PR that moves a page
 * onto `PageFamilyFrame` adds that page's entry here, in that same PR. `sourceFile`/`symbol` name
 * the component that has to render the frame, so an entry stays checkable against what it names.
 *
 * v4 also carries an `assertPageFamilyMigration` guard that reconciles this registry against the
 * classified product routes. Route classification is a separate ticket, so the guard travels with
 * it rather than sitting here with nothing to check.
 */
export const PAGE_FAMILY_FRAME_ROUTES: readonly PageFamilyMigrationEntry[] = [
  // Events + Personal Profile (#199). Both render a `PageFamilyFrame` whose page head emits the
  // job sentence, so ContextRow must stay silent on these two routes or the sentence shows twice.
  // `events-page.test.tsx` proves the once-only outcome against this registry rather than a mock.
  {
    path: '/events',
    family: 'workspace',
    sourceFile: 'src/pages/events-page.tsx',
    symbol: 'EventsPage',
  },
  {
    path: '/profile',
    family: 'management',
    sourceFile: 'src/pages/profile-page.tsx',
    symbol: 'ProfilePage',
  },
  // Ecommerce + Roastery (#199). These two have no page of their own and are not getting one here
  // — their depth and order is an open ranking question, so they stay on `SliceStubPage`. They
  // still belong in this registry, because `SliceStubPage` renders a `PageFamilyFrame` too, and
  // the entry is a claim about the FRAME rather than about how finished the surface is. Without
  // them ContextRow prints the job sentence a second time above a page that already carries it —
  // measured, not reasoned: two matches on `/ecommerce` before these entries existed.
  //
  // `/cafe` and `/work/signals/:signalId` are on the same stub and have the same duplicate today.
  // They are deliberately NOT registered here: those routes belong to the Café and Signals ports,
  // which replace the stub with a real page, and silently fixing them from this PR would hand
  // those tickets a registry entry naming a component they had not written yet.
  {
    path: '/ecommerce',
    family: 'workspace',
    sourceFile: 'src/pages/slice-stub-page.tsx',
    symbol: 'SliceStubPage',
  },
  {
    path: '/roastery',
    family: 'workspace',
    sourceFile: 'src/pages/slice-stub-page.tsx',
    symbol: 'SliceStubPage',
  },
]
