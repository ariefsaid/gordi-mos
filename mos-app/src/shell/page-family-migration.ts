import { PAGE_FAMILIES, type PageFamily } from './page-families'

export interface PageFamilyMigrationEntry {
  path: string
  family: PageFamily
  sourceFile: string
  symbol: string
}

export const ISSUE_3_REPRESENTATIVE_ROUTES: readonly PageFamilyMigrationEntry[] = [
  {
    path: '/work/tasks',
    family: 'workspace',
    sourceFile: 'src/components/tasks/tasks-workspace.tsx',
    symbol: 'TasksWorkspace',
  },
  {
    path: '/work/tasks/:taskId',
    family: 'focused-record',
    sourceFile: 'src/pages/tasks-layout.tsx',
    symbol: 'TaskRecordPage',
  },
  {
    path: '/admin/people',
    family: 'management',
    sourceFile: 'src/pages/admin-users-page.tsx',
    symbol: 'AdminUsersPage',
  },
]

/**
 * Issue 11 — routes migrated onto a family frame after the three Issue 3 representatives.
 * Each entry both (a) participates in the migration union so the guard stays exact and
 * (b) tells ContextRow the page head already owns the job sentence (suppress the shell copy).
 * Adding a route here and removing it from ISSUE_3_DEFERRED_PAGE_ROUTES is the whole cutover.
 */
export const ISSUE_11_MIGRATED_ROUTES: readonly PageFamilyMigrationEntry[] = [
  {
    path: '/profile',
    family: 'management',
    sourceFile: 'src/pages/profile-page.tsx',
    symbol: 'ProfilePage',
  },
  {
    path: '/events',
    family: 'workspace',
    sourceFile: 'src/pages/events-page.tsx',
    symbol: 'EventsPage',
  },
  {
    path: '/inbox',
    family: 'workspace',
    sourceFile: 'src/pages/inbox-page.tsx',
    symbol: 'InboxPage',
  },
  {
    path: '/cafe',
    family: 'workspace',
    sourceFile: 'src/pages/cafe-opening-page.tsx',
    symbol: 'CafeOpeningPage',
  },
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

/** Every route whose page head owns the job sentence (representatives + Issue 11 migrations). */
export const PAGE_FAMILY_FRAME_ROUTES: readonly PageFamilyMigrationEntry[] = [
  ...ISSUE_3_REPRESENTATIVE_ROUTES,
  ...ISSUE_11_MIGRATED_ROUTES,
]

export const ISSUE_3_DEFERRED_PAGE_ROUTES = [
  '/',
  '/cafe/log',
  '/cafe/plan',
  '/cafe/pushes',
  '/cafe/review',
  '/cafe/stock',
  '/money',
  '/money/budget',
  '/money/detail',
  '/money/follow-ups',
  '/money/pricing',
  '/work/follow-ups/:id',
  '/work/objectives',
  '/work/projects',
  '/work/signals',
  '/work/signals/:signalId',
  '/work/tasks/new',
] as const

function duplicatePath(paths: readonly string[]): string | undefined {
  const seen = new Set<string>()
  return paths.find((path) => {
    if (seen.has(path)) return true
    seen.add(path)
    return false
  })
}

function sortedUnique(paths: readonly string[]): string[] {
  return [...new Set(paths)].sort()
}

export function assertPageFamilyMigration(
  representativeRoutes: readonly PageFamilyMigrationEntry[],
  deferredRoutes: readonly string[],
  actualProductRoutes: readonly string[],
): void {
  for (const entry of representativeRoutes) {
    if (!(PAGE_FAMILIES as readonly string[]).includes(entry.family)) {
      throw new Error(`Unsupported page family for ${entry.path}`)
    }
  }

  const declaredPaths = [
    ...representativeRoutes.map(({ path }) => path),
    ...deferredRoutes,
  ]
  const declaredDuplicate = duplicatePath(declaredPaths)
  if (declaredDuplicate) {
    throw new Error(`Duplicate page-family migration path: ${declaredDuplicate}`)
  }

  const actualDuplicate = duplicatePath(actualProductRoutes)
  if (actualDuplicate) {
    throw new Error(`Duplicate classified product route: ${actualDuplicate}`)
  }

  const declared = sortedUnique(declaredPaths)
  const actual = sortedUnique(actualProductRoutes)
  if (declared.length !== actual.length || declared.some((path, index) => path !== actual[index])) {
    const missing = actual.filter((path) => !declared.includes(path))
    const extra = declared.filter((path) => !actual.includes(path))
    throw new Error(
      `Page-family union does not match classified product routes; missing: ${missing.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'}`,
    )
  }
}
