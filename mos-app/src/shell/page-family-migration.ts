import type { PageFamily } from './page-families'

export interface PageFamilyMigrationEntry {
  path: string
  family: PageFamily
  /** The page component file that must render the `PageFamilyFrame` for this entry to be true. */
  sourceFile: string
  symbol: string
}

/**
 * Routes whose page components render `PageFamilyFrame`. `ContextRow` consults this registry so
 * the shared page head owns the route's job sentence; route paths, families and source symbols are
 * verified against the router and page files in `page-family-migration.test.ts`.
 *
 * Feature-gated routes stay registered when their page code renders the frame: gating changes
 * runtime availability, not the route/component contract.
 */
export const PAGE_FAMILY_FRAME_ROUTES: readonly PageFamilyMigrationEntry[] = [
  { path: '/', family: 'workspace', sourceFile: 'pages/home-page.tsx', symbol: 'HomePage' },

  // ── Work ──────────────────────────────────────────────────────────────────────────────────
  { path: '/work/objectives/:objectiveId', family: 'focused-record', sourceFile: 'pages/objective-record-page.tsx', symbol: 'ObjectiveRecordPage' },
  { path: '/work/projects/:workLineId', family: 'focused-record', sourceFile: 'pages/work-line-record-page.tsx', symbol: 'WorkLineRecordPage' },
  { path: '/work/tasks', family: 'workspace', sourceFile: 'pages/tasks-layout.tsx', symbol: 'TasksLayout' },
  // The drawer renders INSIDE the layout's frame, so the frame is present on the child path too.
  { path: '/work/tasks/:taskId', family: 'focused-record', sourceFile: 'pages/tasks-layout.tsx', symbol: 'TasksLayout' },
  {
    path: '/work/signals',
    family: 'workspace',
    sourceFile: 'pages/signals-archive-page.tsx',
    symbol: 'SignalsArchivePage',
  },
  {
    path: '/work/signals/:signalId',
    family: 'focused-record',
    sourceFile: 'pages/signals-archive-page.tsx',
    symbol: 'SignalRecordPage',
  },
  {
    path: '/work/objectives',
    family: 'management',
    sourceFile: 'pages/objectives-page.tsx',
    symbol: 'ObjectivesPage',
  },
  {
    path: '/work/projects',
    family: 'management',
    sourceFile: 'pages/projects-processes-page.tsx',
    symbol: 'ProjectsProcessesPage',
  },

  // ── Inbox · Work Events · Profile ─────────────────────────────────────────────────────────
  { path: '/inbox', family: 'workspace', sourceFile: 'pages/inbox-page.tsx', symbol: 'InboxPage' },
  { path: '/work/events', family: 'workspace', sourceFile: 'pages/events-workspace-page.tsx', symbol: 'EventsWorkspacePage' },
  { path: '/profile', family: 'management', sourceFile: 'pages/profile-page.tsx', symbol: 'ProfilePage' },
  { path: '/oauth/consent', family: 'management', sourceFile: 'pages/oauth-consent-page.tsx', symbol: 'OAuthConsentPage' },
  { path: '/profile/connected-agents', family: 'management', sourceFile: 'pages/profile-connected-agents-page.tsx', symbol: 'ProfileConnectedAgentsPage' },

  // ── Developer tooling ─────────────────────────────────────────────────────────────────────
  { path: '/dev/views', family: 'management', sourceFile: 'pages/dev-views-page.tsx', symbol: 'DevViewsPage' },
  { path: '/dev/views/:viewId', family: 'management', sourceFile: 'pages/dev-views-page.tsx', symbol: 'DevViewsPage' },

  // ── Money ─────────────────────────────────────────────────────────────────────────────────
  { path: '/money', family: 'workspace', sourceFile: 'pages/money-page.tsx', symbol: 'MoneyPage' },
  { path: '/money/branch/:code', family: 'workspace', sourceFile: 'pages/money-branch-page.tsx', symbol: 'MoneyBranchPage' },
  { path: '/money/pending-bills', family: 'workspace', sourceFile: 'pages/pending-bills-page.tsx', symbol: 'PendingBillsPage' },
  { path: '/money/budget', family: 'workspace', sourceFile: 'pages/budget-page.tsx', symbol: 'BudgetPage' },
  { path: '/money/pricing', family: 'workspace', sourceFile: 'pages/pricing-page.tsx', symbol: 'PricingPage' },
  { path: '/money/follow-ups', family: 'workspace', sourceFile: 'pages/follow-ups-page.tsx', symbol: 'FollowUpsPage' },

  // ── Café ──────────────────────────────────────────────────────────────────────────────────
  // /cafe remains the Today root. Dedicated capture routes render KitchenLogPage directly;
  // the retired /cafe/log path redirects to /cafe/production.
  { path: '/cafe', family: 'workspace', sourceFile: 'pages/cafe-opening-page.tsx', symbol: 'CafeRootPage' },
  { path: '/cafe/production', family: 'workspace', sourceFile: 'pages/kitchen-log-page.tsx', symbol: 'KitchenLogPage' },
  { path: '/cafe/transfer', family: 'workspace', sourceFile: 'pages/kitchen-log-page.tsx', symbol: 'KitchenLogPage' },
  { path: '/cafe/waste', family: 'workspace', sourceFile: 'pages/cafe-waste-page.tsx', symbol: 'CafeWastePage' },
  { path: '/cafe/count', family: 'workspace', sourceFile: 'pages/cafe-count-page.tsx', symbol: 'CafeCountPage' },
  { path: '/cafe/receive', family: 'workspace', sourceFile: 'pages/cafe-receive-page.tsx', symbol: 'CafeReceivePage' },
  { path: '/cafe/receive/review', family: 'workspace', sourceFile: 'pages/cafe-receipt-review-page.tsx', symbol: 'CafeReceiptReviewPage' },
  { path: '/cafe/receive/issues', family: 'workspace', sourceFile: 'pages/cafe-receipt-issues-page.tsx', symbol: 'CafeReceiptIssuesPage' },
  { path: '/cafe/request', family: 'workspace', sourceFile: 'pages/cafe-request-page.tsx', symbol: 'CafeRequestPage' },
  { path: '/cafe/request/review', family: 'workspace', sourceFile: 'components/kitchen/cafe-stream-review-frame.tsx', symbol: 'CafeStreamReviewFrame' },
  { path: '/cafe/plan', family: 'workspace', sourceFile: 'pages/kitchen-plan-page.tsx', symbol: 'KitchenPlanPage' },
  { path: '/cafe/stock', family: 'workspace', sourceFile: 'pages/kitchen-stock-page.tsx', symbol: 'KitchenStockPage' },
  { path: '/cafe/items', family: 'workspace', sourceFile: 'pages/cafe-item-settings-page.tsx', symbol: 'CafeItemSettingsPage' },
  {
    path: '/cafe/review',
    family: 'workspace',
    sourceFile: 'pages/kitchen-review-page.tsx',
    symbol: 'KitchenReviewPage',
  },
  {
    path: '/cafe/pushes',
    family: 'workspace',
    sourceFile: 'pages/kitchen-pushes-page.tsx',
    symbol: 'KitchenPushesPage',
  },

  // ── Stubs ─────────────────────────────────────────────────────────────────────────────────
  // No page of their own — their depth and order is an open ranking question, so they stay on
  // `SliceStubPage`. They still belong here: the stub renders a `PageFamilyFrame` too, and the
  // entry is a claim about the frame. Measured before these existed: two job-sentence matches on
  // `/ecommerce`.
  { path: '/ecommerce', family: 'workspace', sourceFile: 'pages/slice-stub-page.tsx', symbol: 'SliceStubPage' },
  { path: '/roastery', family: 'workspace', sourceFile: 'pages/slice-stub-page.tsx', symbol: 'SliceStubPage' },

  // ── Admin ─────────────────────────────────────────────────────────────────────────────────
  {
    path: '/admin/people',
    family: 'management',
    sourceFile: 'pages/admin-users-page.tsx',
    symbol: 'AdminUsersPage',
  },
  {
    path: '/admin/teams',
    family: 'management',
    sourceFile: 'pages/admin-teams-page.tsx',
    symbol: 'AdminTeamsPage',
  },
  {
    path: '/admin/access',
    family: 'management',
    sourceFile: 'pages/admin-access-page.tsx',
    symbol: 'AdminAccessPage',
  },
  {
    path: '/admin/agents',
    family: 'management',
    sourceFile: 'pages/admin-agent-connections-page.tsx',
    symbol: 'AdminAgentConnectionsPage',
  },
]
