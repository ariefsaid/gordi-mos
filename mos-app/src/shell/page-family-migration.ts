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

export const ISSUE_3_DEFERRED_PAGE_ROUTES = [
  '/',
  '/cafe',
  '/cafe/log',
  '/cafe/plan',
  '/cafe/pushes',
  '/cafe/review',
  '/cafe/stock',
  '/ecommerce',
  '/events',
  '/inbox',
  '/money',
  '/money/budget',
  '/money/detail',
  '/money/follow-ups',
  '/money/pricing',
  '/profile',
  '/roastery',
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
