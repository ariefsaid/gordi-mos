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
 * It started empty on this branch (`PageFamilyFrame` itself landed with the app-shell chrome
 * port, before any page used it) and fills in per surface as each one ports onto the frame —
 * the same cutover shape the route table uses. `sourceFile`/`symbol` name the component that has
 * to render the frame, so an entry stays checkable against what it names.
 *
 * **An entry is a claim about the FRAME, not about how finished the surface is.** A route serving
 * `SliceStubPage` belongs here too, because that stub renders the frame as well — see the
 * Ecommerce/Roastery entries below. v4's copy of this file names ~25 routes, and carrying that
 * list across wholesale would assert a region-3 job sentence for Tasks, Money and the Café
 * surfaces that they do not emit yet; ContextRow would fall silent with nothing filling the gap.
 *
 * #191 adds Home (`/`): `HomePage` now renders `PageFamilyFrame` with a `statusRow` (the day-tally
 * header) and no `jobSentence`, so ContextRow must stay silent there or Home would show two
 * orientation signals at once (Experience-Contract Rule 1, amended 2026-07-30 — see
 * `shell/context-row.test.tsx`'s AC-013 case, which already assumed this entry existed).
 *
 * v4 also carries an `assertPageFamilyMigration` guard that reconciles this registry against the
 * classified product routes. Route classification is a separate ticket, so the guard travels with
 * it rather than sitting here with nothing to check.
 */
export const PAGE_FAMILY_FRAME_ROUTES: readonly PageFamilyMigrationEntry[] = [
  { path: '/', family: 'workspace', sourceFile: 'pages/home-page.tsx', symbol: 'HomePage' },
  // Events + Personal Profile (#199). Both render a `PageFamilyFrame` whose page head emits the
  // job sentence, so ContextRow must stay silent on these two routes or the sentence shows twice.
  // `events-page.test.tsx` proves the once-only outcome against this registry rather than a mock.
  { path: '/events', family: 'workspace', sourceFile: 'pages/events-page.tsx', symbol: 'EventsPage' },
  { path: '/profile', family: 'management', sourceFile: 'pages/profile-page.tsx', symbol: 'ProfilePage' },
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
  { path: '/ecommerce', family: 'workspace', sourceFile: 'pages/slice-stub-page.tsx', symbol: 'SliceStubPage' },
  { path: '/roastery', family: 'workspace', sourceFile: 'pages/slice-stub-page.tsx', symbol: 'SliceStubPage' },
]
