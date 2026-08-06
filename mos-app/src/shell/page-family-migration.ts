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
 * It started empty on this branch (`PageFamilyFrame` landed with the app-shell chrome port,
 * before any page used it) and was meant to fill in per surface as each one ported onto the
 * frame — the same cutover shape the route table uses.
 *
 * **That cutover never happened.** Every surface ported onto the frame and none of them added its
 * row, so the list stood at five entries while nineteen routes rendered the frame. The visible
 * cost: on every unregistered route ContextRow kept printing the scope crumb and the job sentence
 * above a page head already carrying the sentence — the same words twice, and a 40px band that
 * left the content 40px shorter than v4 at every width. Measured at 1280: v4's `main` began at
 * y=56 on every route; this branch began at y=96 on all but Home, which was the one route that
 * had been registered (#270).
 *
 * **An entry is a claim about the FRAME, not about how finished the surface is.** A route serving
 * `SliceStubPage` belongs here too, because that stub renders the frame as well. A route whose
 * record page passes `hideHead` belongs here too: the frame still owns region 3, and the record's
 * own identity header is the heading — a shell crumb above it is the orphan the silence exists to
 * prevent.
 *
 * **The one exclusion is real, not an oversight.** v4's list carries `/money/follow-ups` and
 * `/work/follow-ups/:id`; `follow-ups-page.tsx` on this branch renders **no** `PageFamilyFrame`
 * at all, so registering those two would silence ContextRow with nothing filling the gap. They
 * join this list when that page moves onto the frame — not before. `assertRegistryMatchesFrames`
 * in `page-family-migration.test.ts` is what keeps that honest in both directions.
 */
export const PAGE_FAMILY_FRAME_ROUTES: readonly PageFamilyMigrationEntry[] = [
  { path: '/', family: 'workspace', sourceFile: 'pages/home-page.tsx', symbol: 'HomePage' },

  // ── Work ──────────────────────────────────────────────────────────────────────────────────
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

  // ── Inbox · Events · Profile ──────────────────────────────────────────────────────────────
  { path: '/inbox', family: 'workspace', sourceFile: 'pages/inbox-page.tsx', symbol: 'InboxPage' },
  { path: '/events', family: 'workspace', sourceFile: 'pages/events-page.tsx', symbol: 'EventsPage' },
  { path: '/profile', family: 'management', sourceFile: 'pages/profile-page.tsx', symbol: 'ProfilePage' },

  // ── Money ─────────────────────────────────────────────────────────────────────────────────
  { path: '/money', family: 'workspace', sourceFile: 'pages/dashboard-page.tsx', symbol: 'DashboardPage' },
  { path: '/money/detail', family: 'workspace', sourceFile: 'pages/dashboard-page.tsx', symbol: 'DashboardPage' },
  { path: '/money/budget', family: 'workspace', sourceFile: 'pages/budget-page.tsx', symbol: 'BudgetPage' },
  { path: '/money/pricing', family: 'workspace', sourceFile: 'pages/pricing-page.tsx', symbol: 'PricingPage' },

  // ── Café ──────────────────────────────────────────────────────────────────────────────────
  { path: '/cafe', family: 'workspace', sourceFile: 'pages/cafe-opening-page.tsx', symbol: 'CafeOpeningPage' },
  { path: '/cafe/log', family: 'workspace', sourceFile: 'pages/kitchen-log-page.tsx', symbol: 'KitchenLogPage' },
  { path: '/cafe/plan', family: 'workspace', sourceFile: 'pages/kitchen-plan-page.tsx', symbol: 'KitchenPlanPage' },
  { path: '/cafe/stock', family: 'workspace', sourceFile: 'pages/kitchen-stock-page.tsx', symbol: 'KitchenStockPage' },
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
]
