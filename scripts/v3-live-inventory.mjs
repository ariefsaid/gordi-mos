import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const DEFAULT_REPO_ROOT = resolve(SCRIPT_DIR, '..')
const ROUTER_PATH = 'mos-app/src/router.tsx'
const DESIGN_PATH = 'DESIGN.md'
const SPEC_PATH = 'docs/specs/v3-redesign.spec.md'
const APP_SOURCE_ROOTS = ['mos-app/src/pages', 'mos-app/src/components', 'mos-app/src/shell']
const INVENTORY_JSON_PATH = 'docs/reference/v3-live-inventory.json'
const INVENTORY_MARKDOWN_PATH = 'docs/reference/v3-live-inventory.md'
const CSS_LITERAL_KINDS = ['font-size', 'line-height', 'padding', 'margin', 'gap', 'width', 'height']

const CANONICAL_JOBS = [
  'search',
  'filter',
  'sort',
  'group',
  'saved views',
  'wide right panel',
  'full page',
  'phone full-screen',
]

const SOURCE_COMPONENTS = [
  {
    job: 'button',
    canonical: [{ file: 'mos-app/src/components/ui/button.tsx', symbol: 'Button' }],
    rawOrDuplicate: [
      { file: 'mos-app/src/components/ui/icon-button.tsx', symbol: 'IconButton' },
      { file: 'mos-app/src/components/ui/text-input.tsx', symbol: 'TextInput' },
    ],
    stateCoverage: ['default', 'disabled', 'loading/error consumer-owned'],
    tokenSources: ['mos-app/src/index.css', 'mos-app/src/components/ui/button.tsx'],
  },
  {
    job: 'select',
    canonical: [{ file: 'mos-app/src/components/ui/select.tsx', symbol: 'Select' }],
    rawOrDuplicate: [{ file: 'mos-app/src/components/ui/view-tabs.tsx', symbol: 'ViewTabs' }],
    stateCoverage: ['default', 'selected', 'disabled'],
    tokenSources: ['mos-app/src/index.css', 'mos-app/src/components/ui/select.tsx'],
  },
  {
    job: 'menu',
    canonical: [{ file: 'mos-app/src/components/command/command-menu.tsx', symbol: 'CommandMenu' }],
    rawOrDuplicate: [
      { file: 'mos-app/src/components/tasks/row-menu.tsx', symbol: 'RowMenu' },
      { file: 'mos-app/src/components/admin/user-table.tsx', symbol: 'PersonActionMenu' },
    ],
    stateCoverage: ['open', 'keyboard focus', 'close/Escape'],
    tokenSources: ['mos-app/src/components/command/command-menu.css', 'mos-app/src/components/tasks/TasksWorkspace.css'],
  },
  {
    job: 'dialog',
    canonical: [{ file: 'mos-app/src/components/ui/confirm-dialog.tsx', symbol: 'ConfirmDialog' }],
    rawOrDuplicate: [{ file: 'mos-app/src/components/admin/confirm-dialog.tsx', symbol: 'ConfirmDialog' }],
    stateCoverage: ['open', 'confirming', 'error', 'close/Escape'],
    tokenSources: ['mos-app/src/index.css', 'mos-app/src/components/ui/confirm-dialog.tsx'],
  },
  {
    job: 'drawer-or-panel',
    canonical: [{ file: 'mos-app/src/shell/record-panel-host.tsx', symbol: 'RecordPanelHost' }],
    rawOrDuplicate: [
      { file: 'mos-app/src/components/tasks/task-drawer.tsx', symbol: 'TaskDrawer' },
      { file: 'mos-app/src/components/assistant/AssistantPanel.tsx', symbol: 'AssistantPanel' },
      { file: 'mos-app/src/shell/mobile-drawer.tsx', symbol: 'MobileDrawer' },
    ],
    stateCoverage: ['open', 'focus entry/return', 'stack/back', 'phone full-screen'],
    tokenSources: ['mos-app/src/shell/record-panel-host.css', 'mos-app/src/styles/drawer.css'],
  },
  {
    job: 'table-or-list',
    canonical: [{ file: 'mos-app/src/components/dashboard/data-table.tsx', symbol: 'DataTable' }],
    rawOrDuplicate: [
      { file: 'mos-app/src/components/tasks/tasks-workspace.tsx', symbol: 'TasksWorkspace' },
      { file: 'mos-app/src/components/admin/user-table.tsx', symbol: 'UserTable' },
      { file: 'mos-app/src/components/inbox/InboxList.tsx', symbol: 'InboxList' },
      { file: 'mos-app/src/components/signals/signal-feed.tsx', symbol: 'SignalFeed' },
    ],
    stateCoverage: ['default', 'loading', 'empty', 'error', 'filtered-empty'],
    tokenSources: ['mos-app/src/components/dashboard/data-table.css', 'mos-app/src/components/tasks/TasksWorkspace.css'],
  },
  {
    job: 'page-head',
    canonical: [{ file: 'mos-app/src/shell/page-head.tsx', symbol: 'PageHead' }],
    rawOrDuplicate: [{ file: 'mos-app/src/components/tasks/task-drawer-header.tsx', symbol: 'TaskDrawerHeader' }],
    stateCoverage: ['title', 'context', 'actions', 'responsive collapse'],
    tokenSources: ['mos-app/src/shell/page-head.tsx', 'mos-app/src/index.css'],
  },
  {
    job: 'page-frame',
    canonical: [{ file: 'mos-app/src/shell/page-frame.tsx', symbol: 'PageFrame' }],
    rawOrDuplicate: [
      { file: 'mos-app/src/components/tasks/tasks-workspace.tsx', symbol: 'TasksWorkspace' },
      { file: 'mos-app/src/components/dashboard/global-toolbar.tsx', symbol: 'GlobalToolbar' },
    ],
    stateCoverage: ['prose', 'full-width', 'surface wash'],
    tokenSources: ['mos-app/src/shell/page-frame.tsx', 'mos-app/src/index.css'],
  },
  {
    job: 'record-renderer',
    canonical: [
      { file: 'mos-app/src/components/tasks/task-surface.tsx', symbol: 'TaskSurface' },
      { file: 'mos-app/src/components/signals/signal-record-host.tsx', symbol: 'SignalRecordHost' },
    ],
    rawOrDuplicate: [
      { file: 'mos-app/src/components/tasks/record-details-panel.tsx', symbol: 'RecordDetailsPanel' },
      { file: 'mos-app/src/components/tasks/record-feed.tsx', symbol: 'RecordFeed' },
    ],
    stateCoverage: ['read', 'edit', 'saving', 'saved', 'error', 'read-only'],
    tokenSources: ['mos-app/src/components/tasks/task-surface.tsx', 'mos-app/src/components/signals/signal-record-host.tsx'],
  },
  {
    job: 'state-kit',
    canonical: [
      { file: 'mos-app/src/components/ui/state-kit.tsx', symbol: 'EmptyState' },
      { file: 'mos-app/src/components/ui/state-kit.tsx', symbol: 'ErrorState' },
      { file: 'mos-app/src/components/ui/state-kit.tsx', symbol: 'SkeletonRows' },
      { file: 'mos-app/src/components/ui/state-kit.tsx', symbol: 'LoadingShell' },
    ],
    rawOrDuplicate: [{ file: 'mos-app/src/components/ErrorFallback.tsx', symbol: 'ErrorFallback' }],
    stateCoverage: ['empty', 'error/retry', 'loading', 'permission/read-only consumers'],
    tokenSources: ['mos-app/src/components/ui/state-kit.tsx', 'mos-app/src/index.css'],
  },
  {
    job: 'collection-view',
    canonical: [{ file: 'mos-app/src/components/tasks/tasks-workspace.tsx', symbol: 'TasksWorkspace' }],
    rawOrDuplicate: [
      { file: 'mos-app/src/components/dashboard/data-table.tsx', symbol: 'DataTable' },
      { file: 'mos-app/src/components/signals/signal-feed.tsx', symbol: 'SignalFeed' },
      { file: 'mos-app/src/components/inbox/InboxList.tsx', symbol: 'InboxList' },
      { file: 'mos-app/src/components/admin/user-table.tsx', symbol: 'UserTable' },
    ],
    stateCoverage: ['search', 'filter', 'sort', 'group', 'saved view', 'selection'],
    tokenSources: ['mos-app/src/components/tasks/tasks-workspace.tsx', 'mos-app/src/components/tasks/TasksWorkspace.css'],
  },
  {
    job: 'navigation',
    canonical: [{ file: 'mos-app/src/shell/rail-nav.tsx', symbol: 'RailNav' }],
    rawOrDuplicate: [
      { file: 'mos-app/src/shell/bottom-tab-bar.tsx', symbol: 'BottomTabBar' },
      { file: 'mos-app/src/shell/mobile-drawer.tsx', symbol: 'MobileDrawer' },
      { file: 'mos-app/src/shell/top-bar.tsx', symbol: 'TopBar' },
    ],
    stateCoverage: ['active', 'aria-current', 'mobile disclosure', 'role-aware destinations'],
    tokenSources: ['mos-app/src/shell/rail-nav.tsx', 'mos-app/src/shell/destinations.tsx', 'mos-app/src/index.css'],
  },
  {
    job: 'typography-and-spacing',
    canonical: [
      { file: 'mos-app/src/index.css', symbol: '--ds-' },
      { file: 'DESIGN.md', symbol: 'E7' },
    ],
    rawOrDuplicate: [
      { file: 'mos-app/src/components/ui/CardHead.css', symbol: 'font-size' },
      { file: 'mos-app/src/components/ui/Tag.css', symbol: 'padding' },
    ],
    stateCoverage: ['semantic role tokens', 'local literal debt'],
    tokenSources: ['mos-app/src/index.css', 'mos-app/src/styles/tokens', 'DESIGN.md'],
  },
]

const page = (path, routerLiteral, component, file, symbol, pageFamily, options = {}) => ({
  path,
  routerLiteral,
  kind: 'page',
  status: 'canonical',
  auth: 'protected',
  component,
  file,
  symbol,
  pageFamily,
  notes: [],
  ...options,
})

const redirect = (path, routerLiteral, component = 'Navigate', options = {}) => ({
  path,
  routerLiteral,
  kind: 'redirect',
  status: 'redirect',
  auth: 'protected',
  component,
  file: ROUTER_PATH,
  symbol: component,
  pageFamily: 'not-applicable',
  notes: [],
  ...options,
})

const ROUTE_SPECS = [
  page('/dev/ui', '/dev/ui', 'UiGallery', 'mos-app/src/pages/ui-gallery.tsx', 'UiGallery', 'not-applicable', {
    kind: 'dev-only', status: 'conditional', auth: 'dev', notes: ['DEV-only bare route; no AppShell.'],
  }),
  page('/login', '/login', 'LoginPage', 'mos-app/src/pages/login-page.tsx', 'LoginPage', 'not-applicable', { auth: 'public' }),
  page('/recovery', '/recovery', 'RecoveryPage', 'mos-app/src/pages/recovery-page.tsx', 'RecoveryPage', 'not-applicable', { auth: 'public' }),
  page('/', '<index>', 'HomePage | StackedUnionHome', 'mos-app/src/pages/home-page.tsx', 'HomePage', 'workspace', {
    notes: ['Runtime flag SHOW_HOME_STACKED can select StackedUnionHome.'],
  }),
  page('/__home-stacked', '__home-stacked', 'StackedUnionHome', 'mos-app/src/pages/stacked-union-home.tsx', 'StackedUnionHome', 'workspace', {
    kind: 'dev-only', status: 'conditional', auth: 'dev', notes: ['DEV-only alternate home route.'],
  }),
  redirect('/work', 'work', 'Navigate', { notes: ['Canonical work entry redirects to /work/tasks.'] }),
  page('/work/tasks', 'work/tasks', 'TasksLayout', 'mos-app/src/pages/tasks-layout.tsx', 'TasksLayout', 'workspace', {
    notes: ['Collection host with nested TaskDrawer outlet.'],
  }),
  page('/work/tasks/new', 'new', 'TaskDrawer', 'mos-app/src/components/tasks/task-drawer.tsx', 'TaskDrawer', 'focused-record', {
    notes: ['Create mode hosted under the TasksLayout collection.'],
  }),
  page('/work/tasks/:taskId', ':taskId', 'TaskDrawer', 'mos-app/src/components/tasks/task-drawer.tsx', 'TaskDrawer', 'focused-record', {
    notes: ['View mode hosted under the TasksLayout collection.'],
  }),
  page('/work/signals', 'work/signals', 'SignalsArchivePage', 'mos-app/src/pages/signals-archive-page.tsx', 'SignalsArchivePage', 'workspace', {
    notes: ['Signal collection supports ?record drawer state in current host.'],
  }),
  page('/work/signals/:signalId', 'work/signals/:signalId', 'SignalRecordPage', 'mos-app/src/pages/signals-archive-page.tsx', 'SignalRecordPage', 'focused-record'),
  redirect('/work/projects-processes', 'work/projects-processes', 'SearchRedirect', { notes: ['Legacy workline path redirects to /work/projects.'] }),
  page('/work/projects', 'work/projects', 'ProjectsProcessesPage', 'mos-app/src/pages/projects-processes-page.tsx', 'ProjectsProcessesPage', 'management', {
    auth: 'capability-gated', notes: ['RequireCapability workline.manage.'],
  }),
  page('/work/objectives', 'work/objectives', 'ObjectivesPage', 'mos-app/src/pages/objectives-page.tsx', 'ObjectivesPage', 'management', {
    auth: 'capability-gated', notes: ['RequireCapability objective.manage.'],
  }),
  redirect('/work/cascade', 'work/cascade', 'Navigate', { notes: ['Legacy cascade entry redirects to /work/tasks.'] }),
  redirect('/work/follow-ups', 'work/follow-ups', 'Navigate', { notes: ['Preserves query and redirects to /work/tasks?view=followups.'] }),
  page('/work/follow-ups/:id', 'work/follow-ups/:id', 'FollowUpsPage', 'mos-app/src/pages/follow-ups-page.tsx', 'FollowUpsPage', 'focused-record', {
    status: 'conditional', notes: ['SHOW_FOLLOWUPS controls page versus redirect to /.'],
  }),
  page('/events', 'events', 'EventsPage', 'mos-app/src/pages/events-page.tsx', 'EventsPage', 'workspace'),
  page('/money', 'money', 'DashboardPage', 'mos-app/src/pages/dashboard-page.tsx', 'DashboardPage', 'workspace', {
    auth: 'role-gated', notes: ['RequireAccessRole finance/admin.'],
  }),
  page('/money/detail', 'money/detail', 'DashboardPage', 'mos-app/src/pages/dashboard-page.tsx', 'DashboardPage', 'workspace', {
    auth: 'role-gated', notes: ['DashboardPage defaultTab=detail; RequireAccessRole finance/admin.'],
  }),
  page('/money/budget', 'money/budget', 'BudgetPage', 'mos-app/src/pages/budget-page.tsx', 'BudgetPage', 'workspace', {
    auth: 'role-gated', status: 'conditional', notes: ['SHOW_PLAN_BUDGET flag plus finance/admin role gate.'],
  }),
  page('/money/pricing', 'money/pricing', 'PricingPage', 'mos-app/src/pages/pricing-page.tsx', 'PricingPage', 'workspace', {
    auth: 'role-gated', status: 'conditional', notes: ['SHOW_PLAN_BUDGET flag plus finance/admin role gate.'],
  }),
  page('/money/follow-ups', 'money/follow-ups', 'FollowUpsPage', 'mos-app/src/pages/follow-ups-page.tsx', 'FollowUpsPage', 'focused-record', {
    auth: 'role-gated', status: 'conditional', notes: ['SHOW_FOLLOWUPS flag plus finance/admin role gate.'],
  }),
  page('/inbox', 'inbox', 'InboxPage', 'mos-app/src/pages/inbox-page.tsx', 'InboxPage', 'workspace', {
    notes: ['Current Inbox All/Unread/Handled behavior is retained as lost-good evidence.'],
  }),
  page('/cafe', 'cafe', 'CafeOpeningPage', 'mos-app/src/pages/cafe-opening-page.tsx', 'CafeOpeningPage', 'workspace'),
  page('/cafe/log', 'cafe/log', 'KitchenLogPage', 'mos-app/src/pages/kitchen-log-page.tsx', 'KitchenLogPage', 'workspace'),
  page('/cafe/plan', 'cafe/plan', 'KitchenPlanPage', 'mos-app/src/pages/kitchen-plan-page.tsx', 'KitchenPlanPage', 'workspace'),
  page('/cafe/stock', 'cafe/stock', 'KitchenStockPage', 'mos-app/src/pages/kitchen-stock-page.tsx', 'KitchenStockPage', 'workspace'),
  page('/cafe/review', 'cafe/review', 'KitchenReviewPage', 'mos-app/src/pages/kitchen-review-page.tsx', 'KitchenReviewPage', 'workspace', {
    auth: 'role-gated', status: 'conditional', notes: ['RequireAccessRole ops_lead/admin.'],
  }),
  page('/cafe/pushes', 'cafe/pushes', 'KitchenPushesPage', 'mos-app/src/pages/kitchen-pushes-page.tsx', 'KitchenPushesPage', 'workspace', {
    auth: 'role-gated', status: 'conditional', notes: ['RequireAccessRole ops_lead/admin.'],
  }),
  page('/ecommerce', 'ecommerce', 'SliceStubPage', 'mos-app/src/pages/slice-stub-page.tsx', 'SliceStubPage', 'workspace', {
    notes: ['Stub destination; jobKey job.ecommerce.'],
  }),
  page('/roastery', 'roastery', 'SliceStubPage', 'mos-app/src/pages/slice-stub-page.tsx', 'SliceStubPage', 'workspace', {
    notes: ['Stub destination; jobKey job.roastery.'],
  }),
  page('/profile', 'profile', 'ProfilePage', 'mos-app/src/pages/profile-page.tsx', 'ProfilePage', 'management', {
    notes: ['Language selection lives here.'],
  }),
  redirect('/admin', 'admin', 'Navigate', { notes: ['Admin entry redirects to /admin/people.'] }),
  page('/admin/people', 'admin/people', 'AdminUsersPage', 'mos-app/src/pages/admin-users-page.tsx', 'AdminUsersPage', 'management', {
    auth: 'role-gated', notes: ['AdminRoute.'],
  }),
  page('/dev/views', 'dev/views', 'DevViewsPage', 'mos-app/src/pages/dev-views-page.tsx', 'DevViewsPage', 'not-applicable', {
    kind: 'dev-only', status: 'conditional', auth: 'dev', notes: ['DEV + SHOW_USER_VIEWS; AppShell route.'],
  }),
  page('/dev/views/:viewId', 'dev/views/:viewId', 'DevViewsPage', 'mos-app/src/pages/dev-views-page.tsx', 'DevViewsPage', 'not-applicable', {
    kind: 'dev-only', status: 'conditional', auth: 'dev', notes: ['DEV + SHOW_USER_VIEWS; AppShell route.'],
  }),
  redirect('/tasks', 'tasks', 'SearchRedirect', { notes: ['Legacy alias to /work/tasks.'] }),
  redirect('/tasks/new', 'tasks/new', 'SearchRedirect', { notes: ['Legacy alias to /work/tasks/new.'] }),
  redirect('/tasks/:taskId', 'tasks/:taskId', 'TasksIdRedirect', { component: 'TasksIdRedirect', symbol: 'TasksIdRedirect', notes: ['Legacy alias preserves taskId and query.'] }),
  redirect('/updates', 'updates', 'Navigate', { notes: ['Legacy alias to /work/signals.'] }),
  redirect('/ops', 'ops', 'Navigate', { notes: ['Legacy alias to /.'] }),
  redirect('/ops/new', 'ops/new', 'Navigate', { notes: ['Legacy alias to /.'] }),
  redirect('/ops/:id/edit', 'ops/:id/edit', 'Navigate', { notes: ['Legacy alias to /.'] }),
  redirect('/kitchen', 'kitchen', 'Navigate', { notes: ['Legacy alias to /cafe.'] }),
  redirect('/kitchen/log', 'kitchen/log', 'SearchRedirect', { notes: ['Legacy alias to /cafe/log.'] }),
  redirect('/kitchen/plan', 'kitchen/plan', 'SearchRedirect', { notes: ['Legacy alias to /cafe/plan.'] }),
  redirect('/kitchen/stock', 'kitchen/stock', 'SearchRedirect', { notes: ['Legacy alias to /cafe/stock.'] }),
  redirect('/kitchen/review', 'kitchen/review', 'SearchRedirect', { notes: ['Legacy alias to /cafe/review.'] }),
  redirect('/kitchen/pushes', 'kitchen/pushes', 'SearchRedirect', { notes: ['Legacy alias to /cafe/pushes.'] }),
  redirect('/objectives', 'objectives', 'SearchRedirect', { notes: ['Legacy alias to /work/objectives.'] }),
  redirect('/projects-processes', 'projects-processes', 'SearchRedirect', { notes: ['Legacy alias to /work/projects.'] }),
  redirect('/dashboard', 'dashboard', 'SearchRedirect', { notes: ['Legacy alias to /money.'] }),
  redirect('/dashboard/detail', 'dashboard/detail', 'SearchRedirect', { notes: ['Legacy alias to /money/detail.'] }),
  redirect('/sales', 'sales', 'SearchRedirect', { notes: ['Legacy alias to /money.'] }),
  redirect('/plan/budget', 'plan/budget', 'SearchRedirect', { notes: ['Legacy alias to /money/budget.'] }),
  redirect('/plan/pricing', 'plan/pricing', 'SearchRedirect', { notes: ['Legacy alias to /money/pricing.'] }),
  page('*', '*', 'NotFoundPage', 'mos-app/src/pages/not-found-page.tsx', 'NotFoundPage', 'not-applicable', {
    notes: ['Catch-all route; not a page-family surface.'],
  }),
]

function toPosix(value) {
  return value.split(sep).join('/')
}

function repoPath(repoRoot, relativePath) {
  return resolve(repoRoot, relativePath)
}

function relativePath(repoRoot, absolutePath) {
  return toPosix(relative(repoRoot, absolutePath))
}

function readText(repoRoot, relativePath) {
  return readFileSync(repoPath(repoRoot, relativePath), 'utf8')
}

function fileExists(repoRoot, relativePath) {
  return existsSync(repoPath(repoRoot, relativePath))
}

function walkFiles(root) {
  if (!existsSync(root)) return []
  const entries = readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
  const files = []
  for (const entry of entries) {
    const absolutePath = join(root, entry.name)
    if (entry.isDirectory()) files.push(...walkFiles(absolutePath))
    else if (entry.isFile()) files.push(absolutePath)
  }
  return files
}

function cssFiles(repoRoot) {
  return APP_SOURCE_ROOTS.flatMap((root) => walkFiles(repoPath(repoRoot, root)))
    .filter((file) => extname(file) === '.css')
    .sort((a, b) => a.localeCompare(b))
}

function countCssLiterals(cssText) {
  return Object.fromEntries(CSS_LITERAL_KINDS.map((kind) => [kind, (cssText.match(new RegExp(`\\b${kind}\\s*:`, 'g')) ?? []).length]))
}

function collectCssFamilies(repoRoot) {
  return cssFiles(repoRoot).map((absolutePath) => {
    const path = relativePath(repoRoot, absolutePath)
    const cssText = readFileSync(absolutePath, 'utf8')
    const literalKinds = countCssLiterals(cssText)
    const breakpoints = [...cssText.matchAll(/@media[^\n{]*/g)].map((match) => match[0].trim()).sort()
    return {
      path,
      family: path.replace(/^mos-app\/src\//, '').replace(/\.css$/, ''),
      scope: path.split('/')[2] ?? 'src',
      literalKinds,
      breakpoints,
    }
  })
}

function collectLiteralExamples(repoRoot, cssFamilyRows) {
  const countsByKind = Object.fromEntries(CSS_LITERAL_KINDS.map((kind) => [kind, 0]))
  const examples = Object.fromEntries(CSS_LITERAL_KINDS.map((kind) => [kind, []]))
  for (const family of cssFamilyRows) {
    for (const kind of CSS_LITERAL_KINDS) {
      countsByKind[kind] += family.literalKinds[kind]
      if (examples[kind].length < 8 && family.literalKinds[kind] > 0) examples[kind].push(family.path)
    }
  }
  return {
    filesScanned: cssFamilyRows.map((family) => family.path),
    countsByKind,
    examples,
    source: 'CSS property literals are evidence of current style-family debt; shared token sources remain mos-app/src/index.css and DESIGN.md.',
  }
}

function resolveCssImport(repoRoot, sourceFile, importPath) {
  let absolutePath
  if (importPath.startsWith('@/')) absolutePath = resolve(repoPath(repoRoot, 'mos-app/src'), importPath.slice(2))
  else if (importPath.startsWith('.')) absolutePath = resolve(dirname(repoPath(repoRoot, sourceFile)), importPath)
  else return null
  return existsSync(absolutePath) ? relativePath(repoRoot, absolutePath) : null
}

function localCssImports(repoRoot, sourceFile, sourceText) {
  const imports = [...sourceText.matchAll(/['"]([^'"]+\.css)['"]/g)].map((match) => match[1])
  return [...new Set(imports.map((importPath) => resolveCssImport(repoRoot, sourceFile, importPath)).filter(Boolean))].sort()
}

function hasWord(sourceText, word) {
  return new RegExp(`\\b${word.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`).test(sourceText)
}

function sourceSymbols(sourceText, names) {
  return names.filter((name) => hasWord(sourceText, name))
}

function scanSourceEvidence(repoRoot, sourceFile, routeSpec) {
  const sourceText = readText(repoRoot, sourceFile)
  const localCssFiles = localCssImports(repoRoot, sourceFile, sourceText)
  const cssText = localCssFiles.map((file) => readText(repoRoot, file)).join('\n')
  const literalKinds = countCssLiterals(cssText)
  const hasPageFrame = hasWord(sourceText, 'PageFrame') && /<PageFrame\b/.test(sourceText)
  const hasPageHead = hasWord(sourceText, 'PageHead') && /<PageHead\b/.test(sourceText)
  const states = ['default']
  if (sourceSymbols(sourceText, ['LoadingShell', 'SkeletonRows', 'isLoading', 'loading']).length) states.push('loading')
  if (sourceSymbols(sourceText, ['EmptyState', 'isEmpty', 'filteredEmpty']).length) states.push('empty')
  if (sourceSymbols(sourceText, ['ErrorState', 'ErrorFallback', 'error', 'onRetry']).length) states.push('error/retry')
  if (sourceSymbols(sourceText, ['readOnly', 'canEdit', 'disabled']).length) states.push('permission/read-only')
  if (sourceSymbols(sourceText, ['saving', 'isSaving', 'Saved', 'saved']).length) states.push('saving/saved')
  if (sourceSymbols(sourceText, ['validation', 'invalid', 'fieldError']).length) states.push('validation')

  const presentations = []
  const presentationPatterns = [
    ['DataTable', 'Table'],
    ['TasksWorkspace', 'Table + triage queue'],
    ['SignalFeed', 'Feed'],
    ['InboxList', 'Feed/list'],
    ['UserTable', 'Management table/list'],
    ['Calendar', 'Calendar'],
    ['Board', 'Board'],
    ['RecordFeed', 'Record activity feed'],
  ]
  for (const [needle, label] of presentationPatterns) if (hasWord(sourceText, needle)) presentations.push(label)
  if (!presentations.length && routeSpec.pageFamily === 'workspace') presentations.push('page-local / not observed')
  const ownsViewState = /search|filter|sort|group|savedView|saved view|query|record=|selectedId/i.test(sourceText)
  const overlays = []
  if (hasWord(sourceText, 'CommandMenu') || /command|search/i.test(sourceText)) overlays.push('centered search/command candidate')
  if (hasWord(sourceText, 'RecordPanelHost') || hasWord(sourceText, 'TaskDrawer')) overlays.push('record drawer/panel')
  if (hasWord(sourceText, 'ConfirmDialog') || /<.*Dialog\b/.test(sourceText)) overlays.push('centered confirmation/dialog')
  if (/Menu|Popover|Dropdown|Picker/.test(sourceText)) overlays.push('anchored menu/picker candidate')
  if (hasWord(sourceText, 'AssistantPanel')) overlays.push('Deputy panel')
  if (!overlays.length) overlays.push('none observed')

  let recordDefault = 'not observed'
  if (routeSpec.pageFamily === 'focused-record') recordDefault = 'full canonical record page or hosted drawer'
  else if (hasWord(sourceText, 'RecordPanelHost') || hasWord(sourceText, 'TaskDrawer')) recordDefault = 'current split/right panel host'
  const recordOpen = {
    default: recordDefault,
    direct: routeSpec.pageFamily === 'focused-record' ? 'full canonical page' : 'full canonical page when URL is explicit',
    phone: 'full-screen record mode',
  }

  return {
    frame: hasPageFrame ? 'shared-page-frame' : 'bespoke-or-missing',
    head: hasPageHead ? 'shared-page-head' : 'bespoke-or-missing',
    typographySpacing: {
      source: localCssFiles.length ? 'route-local CSS plus shared mos-app/src/index.css' : 'shared mos-app/src/index.css and DESIGN.md',
      localCssFiles,
      literalKinds,
    },
    collection: {
      grammar: ownsViewState ? 'route-local collection/view state is present' : 'page-local or not observed',
      presentations: [...new Set(presentations)].sort(),
      ownsViewState,
    },
    recordOpen,
    overlays: [...new Set(overlays)].sort(),
    states: [...new Set(states)].sort(),
    cssFamilies: ['mos-app/src/index.css', ...localCssFiles].sort(),
    sourceEvidence: {
      pageFrameUse: hasPageFrame,
      pageHeadUse: hasPageHead,
      symbols: sourceSymbols(sourceText, ['EmptyState', 'ErrorState', 'SkeletonRows', 'LoadingShell', 'DataTable', 'TasksWorkspace', 'RecordPanelHost', 'TaskDrawer', 'CommandMenu', 'ConfirmDialog', 'useIsDesktop', 'useIsNarrow', 'useIsPhone']).sort(),
    },
  }
}

function collectRoutes(repoRoot) {
  const routerText = readText(repoRoot, ROUTER_PATH)
  return ROUTE_SPECS.map((spec) => {
    const isAppPage = spec.kind === 'page' || spec.kind === 'dev-only'
    const evidence = isAppPage ? scanSourceEvidence(repoRoot, spec.file, spec) : {
      frame: 'not-applicable',
      head: 'not-applicable',
      typographySpacing: { source: 'router redirect declaration', localCssFiles: [], literalKinds: Object.fromEntries(CSS_LITERAL_KINDS.map((kind) => [kind, 0])) },
      collection: { grammar: 'not-applicable', presentations: [], ownsViewState: false },
      recordOpen: { default: 'not-applicable', direct: 'not-applicable', phone: 'not-applicable' },
      overlays: [],
      states: [],
      cssFamilies: [],
      sourceEvidence: { pageFrameUse: false, pageHeadUse: false, symbols: [] },
    }
    return {
      path: spec.path,
      kind: spec.kind,
      status: spec.status,
      auth: spec.auth,
      component: spec.component,
      file: spec.file,
      symbol: spec.symbol,
      pageFamily: spec.pageFamily,
      frame: evidence.frame,
      head: evidence.head,
      typographySpacing: evidence.typographySpacing,
      collection: evidence.collection,
      recordOpen: evidence.recordOpen,
      overlays: evidence.overlays,
      states: evidence.states,
      cssFamilies: evidence.cssFamilies,
      notes: [...spec.notes].sort(),
      sourceLiteral: spec.routerLiteral,
      sourceEvidence: evidence.sourceEvidence,
    }
  }).sort((a, b) => a.path.localeCompare(b.path))
}

function cloneComponents() {
  return SOURCE_COMPONENTS.map((row) => ({
    job: row.job,
    canonical: row.canonical.map(({ file, symbol }) => ({ file, symbol })).sort((a, b) => `${a.file}:${a.symbol}`.localeCompare(`${b.file}:${b.symbol}`)),
    rawOrDuplicate: row.rawOrDuplicate.map(({ file, symbol }) => ({ file, symbol })).sort((a, b) => `${a.file}:${a.symbol}`.localeCompare(`${b.file}:${b.symbol}`)),
    stateCoverage: [...row.stateCoverage].sort(),
    tokenSources: [...row.tokenSources].sort(),
  })).sort((a, b) => a.job.localeCompare(b.job))
}

function uniqueSorted(values) {
  return [...new Set(values)].sort()
}

function normalizeIssueName(value) {
  return value.replaceAll('`', '').replace(/:\s+replace\s*$/, '').replace(/\.$/, '').replace(/\s+/g, ' ').trim()
}

export function extractDeliveryDecomposition(specText) {
  const section = specText.match(/^## 12\. Delivery decomposition\s*\n([\s\S]*?)(?=^## 13\.)/m)?.[1]
  if (!section) throw new Error('Master V3 spec is missing section 12 delivery decomposition')

  const issues = []
  for (const line of section.split(/\r?\n/)) {
    const issue = line.match(/^(\d+)\.\s+(.+)$/)
    if (issue) {
      issues.push({ issue: Number(issue[1]), name: normalizeIssueName(issue[2]) })
    }
  }
  return issues
}

export function buildInventory(repoRoot = DEFAULT_REPO_ROOT) {
  const root = resolve(repoRoot)
  const cssFamilyRows = collectCssFamilies(root)
  const routes = collectRoutes(root)
  const sharedComponents = cloneComponents()
  const deliverySequence = extractDeliveryDecomposition(readText(root, SPEC_PATH))
  return {
    schemaVersion: 1,
    sourceCommit: null,
    sources: {
      router: ROUTER_PATH,
      design: DESIGN_PATH,
      spec: SPEC_PATH,
      appRoot: 'mos-app/src',
    },
    deliverySequence,
    routes,
    sharedComponents,
    cssFamilies: cssFamilyRows,
    canonicalJobs: [...CANONICAL_JOBS],
    literals: collectLiteralExamples(root, cssFamilyRows),
    summary: {
      routeCount: routes.length,
      pageRouteCount: routes.filter((route) => route.kind === 'page').length,
      redirectCount: routes.filter((route) => route.kind === 'redirect').length,
      devRouteCount: routes.filter((route) => route.kind === 'dev-only').length,
      cssFileCount: cssFamilyRows.length,
      componentCount: sharedComponents.length,
      duplicateJobCount: sharedComponents.filter((row) => row.rawOrDuplicate.length > 0).length,
    },
    currentDebt: [
      'The live source tree still contains route-local shells, multiple collection presentations, and CSS literal families; this manifest records them as Issue 1 evidence rather than marking them migrated.',
      'Current record panel CSS is an existing implementation detail; Issues 3–8 own the application migration of page families, the shared host, RecordViewer, RecordCollection, Inbox/Deputy, and Café while Issue 9 owns rendered representative acceptance.',
      'Separate typed database models remain required for Task, Standard/SOP, Signal, Process, Project, Money, and People.',
    ],
    deferredToIssues: deliverySequence.slice(1).map(({ issue, name }) => ({ issue, name })),
  }
}

export function collectRouteDeclarations(routerText) {
  return {
    pathLiterals: [...routerText.matchAll(/\bpath:\s*['"]([^'"]+)['"]/g)].map((match) => match[1]),
    hasIndexRoute: routerText.includes('index: true'),
  }
}

function collectRouteLiterals(routerText) {
  return collectRouteDeclarations(routerText).pathLiterals
}

function symbolPresent(repoRoot, reference) {
  if (!fileExists(repoRoot, reference.file)) return false
  const source = readText(repoRoot, reference.file)
  if (reference.symbol.startsWith('--')) return source.includes(reference.symbol)
  if (reference.symbol === 'font-size' || reference.symbol === 'padding') return source.includes(`${reference.symbol}:`)
  return source.includes(reference.symbol)
}

export function validateInventory(inventory, repoRoot = DEFAULT_REPO_ROOT) {
  const root = resolve(repoRoot)
  const errors = []
  for (const source of Object.values(inventory.sources)) {
    if (source !== 'mos-app/src' && !fileExists(root, source)) errors.push(`missing source: ${source}`)
  }
  if (!Array.isArray(inventory.routes) || inventory.routes.length === 0) errors.push('route inventory is empty')
  const routePaths = inventory.routes.map((route) => route.path)
  for (const duplicate of routePaths.filter((path, index) => routePaths.indexOf(path) !== index)) errors.push(`duplicate route path: ${duplicate}`)
  const routerText = fileExists(root, ROUTER_PATH) ? readText(root, ROUTER_PATH) : ''
  const expectedLiterals = ROUTE_SPECS.map((spec) => spec.routerLiteral).filter((literal) => literal !== '<index>')
  const actualLiterals = uniqueSorted(collectRouteLiterals(routerText))
  const expectedLiteralSet = new Set(expectedLiterals)
  for (const literal of actualLiterals) if (!expectedLiteralSet.has(literal)) errors.push(`unclassified router path literal: ${literal}`)
  for (const literal of uniqueSorted(expectedLiterals)) if (!actualLiterals.includes(literal)) errors.push(`missing router path literal: ${literal}`)
  if (!routerText.includes('index: true')) errors.push('missing index route declaration')

  const expectedByPath = new Map(ROUTE_SPECS.map((spec) => [spec.path, spec]))
  for (const route of inventory.routes) {
    const expected = expectedByPath.get(route.path)
    if (!expected) errors.push(`route has no classification: ${route.path}`)
    if (!route.pageFamily) errors.push(`route has no page family: ${route.path}`)
    if (route.kind !== 'redirect' && !fileExists(root, route.file)) errors.push(`route source file missing: ${route.path} -> ${route.file}`)
    if (route.kind === 'redirect' && route.file !== ROUTER_PATH) errors.push(`redirect source must be router.tsx: ${route.path}`)
    const expectedLiteral = expected?.routerLiteral
    if (expectedLiteral === '<index>') {
      if (!routerText.includes('index: true')) errors.push(`index route source missing: ${route.path}`)
    } else if (expectedLiteral && !routerText.includes(`path: '${expectedLiteral}'`)) {
      errors.push(`route source literal missing: ${route.path} -> ${expectedLiteral}`)
    }
  }

  for (const row of inventory.sharedComponents) {
    if (!row.canonical.length) errors.push(`canonical component job has no canonical source: ${row.job}`)
    for (const reference of [...row.canonical, ...row.rawOrDuplicate]) {
      if (!fileExists(root, reference.file)) errors.push(`component source missing: ${row.job} -> ${reference.file}`)
      else if (!symbolPresent(root, reference)) errors.push(`component symbol missing: ${row.job} -> ${reference.file} :: ${reference.symbol}`)
    }
    for (const tokenSource of row.tokenSources) if (!fileExists(root, tokenSource)) errors.push(`component token source missing: ${row.job} -> ${tokenSource}`)
  }
  for (const family of inventory.cssFamilies) if (!fileExists(root, family.path)) errors.push(`CSS family source missing: ${family.path}`)
  const scannedCss = new Set(inventory.literals.filesScanned)
  for (const family of inventory.cssFamilies) if (!scannedCss.has(family.path)) errors.push(`CSS family omitted from literal scan: ${family.path}`)
  let expectedDeliverySequence = []
  if (fileExists(root, SPEC_PATH)) {
    try {
      expectedDeliverySequence = extractDeliveryDecomposition(readText(root, SPEC_PATH))
    } catch (error) {
      errors.push(error.message)
    }
  } else {
    errors.push(`missing source: ${SPEC_PATH}`)
  }
  if (JSON.stringify(inventory.deliverySequence) !== JSON.stringify(expectedDeliverySequence)) errors.push('delivery sequence does not match master V3 spec section 12')
  const deferredIssues = Array.isArray(inventory.deferredToIssues) ? inventory.deferredToIssues : []
  const expectedDeferredIssues = expectedDeliverySequence.slice(1)
  if (JSON.stringify(deferredIssues) !== JSON.stringify(expectedDeferredIssues)) errors.push('deferred issue ownership does not match master V3 spec section 12')
  return uniqueSorted(errors)
}

function markdownCell(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ')
}

function renderList(values) {
  return values.length ? values.join(', ') : '—'
}

export function renderInventoryMarkdown(inventory) {
  const lines = [
    '# V3 live route, component, and style inventory',
    '',
    'This deterministic artifact is source evidence for Issue 1. It is not a rendered application acceptance report and does not mark the current mixed implementation as migrated.',
    '',
    '## Summary',
    '',
    '| Metric | Count |',
    '| --- | ---: |',
    `| Live route declarations classified | ${inventory.summary.routeCount} |`,
    `| Page routes | ${inventory.summary.pageRouteCount} |`,
    `| Redirect routes | ${inventory.summary.redirectCount} |`,
    `| DEV-only routes | ${inventory.summary.devRouteCount} |`,
    `| CSS files/families scanned | ${inventory.summary.cssFileCount} |`,
    `| Shared interaction jobs | ${inventory.summary.componentCount} |`,
    `| Jobs with raw/duplicate consumers | ${inventory.summary.duplicateJobCount} |`,
    '',
    'Canonical collection and opening jobs: **search**, **filter**, **sort**, **group**, **saved views**, **wide right panel**, **full page**, and **phone full-screen**.',
    '',
    '## Route inventory',
    '',
  ]
  for (const route of inventory.routes) {
    lines.push(`### \`${route.path}\``)
    lines.push(`- Kind/status/auth: ${route.kind} / ${route.status} / ${route.auth}`)
    lines.push(`- Component/source: ${route.component} — \`${route.file}\` :: \`${route.symbol}\`; router literal \`${route.sourceLiteral}\``)
    lines.push(`- Page family/frame/head: ${route.pageFamily} / ${route.frame} / ${route.head}`)
    lines.push(`- Typography/spacing source: ${route.typographySpacing.source}; local CSS: ${renderList(route.typographySpacing.localCssFiles)}`)
    lines.push(`- Collection grammar: ${route.collection.grammar}; presentations: ${renderList(route.collection.presentations)}; owns view state: ${route.collection.ownsViewState ? 'yes' : 'no'}`)
    lines.push(`- Record opening: default ${route.recordOpen.default}; direct ${route.recordOpen.direct}; phone ${route.recordOpen.phone}`)
    lines.push(`- Overlays: ${renderList(route.overlays)}; states: ${renderList(route.states)}; CSS families: ${renderList(route.cssFamilies)}`)
    lines.push(`- Notes: ${renderList(route.notes)}`)
    lines.push('')
  }
  lines.push('## Shared component jobs and duplicate evidence', '', '| Job | Canonical sources | Raw/duplicate consumers | State coverage |', '| --- | --- | --- | --- |')
  for (const row of inventory.sharedComponents) {
    const canonical = row.canonical.map((reference) => `${reference.file} :: ${reference.symbol}`).join('<br>')
    const duplicates = row.rawOrDuplicate.map((reference) => `${reference.file} :: ${reference.symbol}`).join('<br>') || '—'
    lines.push(`| ${markdownCell(row.job)} | ${markdownCell(canonical)} | ${markdownCell(duplicates)} | ${markdownCell(renderList(row.stateCoverage))} |`)
  }
  lines.push('', '## CSS family and literal scan', '', '| CSS family | Scope | Literal counts | Breakpoints |', '| --- | --- | --- | --- |')
  for (const family of inventory.cssFamilies) {
    const counts = CSS_LITERAL_KINDS.map((kind) => `${kind}:${family.literalKinds[kind]}`).join(', ')
    lines.push(`| ${markdownCell(family.path)} | ${markdownCell(family.scope)} | ${markdownCell(counts)} | ${markdownCell(renderList(family.breakpoints))} |`)
  }
  lines.push('', '### Aggregate literal counts', '', '| Property | Count | Example files |', '| --- | ---: | --- |')
  for (const kind of CSS_LITERAL_KINDS) lines.push(`| ${kind} | ${inventory.literals.countsByKind[kind]} | ${markdownCell(renderList(inventory.literals.examples[kind]))} |`)
  lines.push('', '## Delivery sequence', '', 'This sequence is parsed from `docs/specs/v3-redesign.spec.md` section 12 so deferred ownership cannot collapse into Issue 2.', '', '| Issue | Name |', '| ---: | --- |')
  for (const { issue, name } of inventory.deliverySequence) lines.push(`| ${issue} | ${markdownCell(name)} |`)
  lines.push('', 'Issue 2 is Storybook component/state/responsive proof only. It cannot claim application migration or rendered representative acceptance; those responsibilities remain with the separately numbered issues below.', '')
  lines.push('## Current conformance debt', '')
  for (const item of inventory.currentDebt) lines.push(`- ${item}`)
  lines.push('', '## Deferred issue ownership', '')
  for (const { issue, name } of inventory.deferredToIssues) lines.push(`- Issue ${issue} — ${name}`)
  lines.push('', '## Sources', '', `- Router: \`${inventory.sources.router}\``, `- Binding design contract: \`${inventory.sources.design}\``, `- Master V3 delivery sequence: \`${inventory.sources.spec}\` §12`, `- App source root: \`${inventory.sources.appRoot}\``, '')
  return `${lines.join('\n').replace(/\n+$/, '')}\n`
}

function stableJson(inventory) {
  return `${JSON.stringify(inventory, null, 2)}\n`
}

function printErrors(errors) {
  if (!errors.length) return
  process.stderr.write(`V3 inventory validation failed:\n${errors.map((error) => `- ${error}`).join('\n')}\n`)
}

export function main(argv = process.argv.slice(2), repoRoot = DEFAULT_REPO_ROOT) {
  const mode = argv[0]
  if (!['--write', '--check'].includes(mode)) {
    process.stderr.write('Usage: node scripts/v3-live-inventory.mjs --write|--check\n')
    return 2
  }
  const inventory = buildInventory(repoRoot)
  const errors = validateInventory(inventory, repoRoot)
  if (errors.length) {
    printErrors(errors)
    return 1
  }
  const expectedJson = stableJson(inventory)
  const expectedMarkdown = renderInventoryMarkdown(inventory)
  const jsonPath = repoPath(repoRoot, INVENTORY_JSON_PATH)
  const markdownPath = repoPath(repoRoot, INVENTORY_MARKDOWN_PATH)
  if (mode === '--write') {
    writeFileSync(jsonPath, expectedJson)
    writeFileSync(markdownPath, expectedMarkdown)
    process.stdout.write(`Wrote ${INVENTORY_JSON_PATH}\nWrote ${INVENTORY_MARKDOWN_PATH}\n`)
    return 0
  }
  const stale = []
  if (!existsSync(jsonPath) || readFileSync(jsonPath, 'utf8') !== expectedJson) stale.push(INVENTORY_JSON_PATH)
  if (!existsSync(markdownPath) || readFileSync(markdownPath, 'utf8') !== expectedMarkdown) stale.push(INVENTORY_MARKDOWN_PATH)
  if (stale.length) {
    process.stderr.write(`Stale or missing inventory artifact(s): ${stale.join(', ')}. Run --write.\n`)
    return 1
  }
  process.stdout.write(`Inventory current: ${inventory.summary.routeCount} routes, ${inventory.summary.componentCount} shared jobs, ${inventory.summary.cssFileCount} CSS families.\n`)
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = main()
}
