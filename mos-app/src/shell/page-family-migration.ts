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
]
