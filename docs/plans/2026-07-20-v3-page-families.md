# V3 Issue 3 — Page-family primitives and migration guards

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans in an isolated, visible Codex task. Execute this plan inline, one task at a time. Do not use subagents or superpowers:subagent-driven-development.

**Date:** 2026-07-20
**Status:** Ready after the Issue 2 dependency gate
**Goal:** Define the three V3 page families at the shell boundary, enforce route classification, and migrate only three production representatives with deterministic evidence.

This planning task writes no app/source/package/Supabase files, generated inventory, state ledger, branch, remote, database, or deployment.

## Authority, dependency, and boundary

Read during implementation in this order: CLAUDE.md; AGENTS.md; docs/agent-context.md; docs/specs/v3-redesign.spec.md §§2, 6.2, 8–12; DESIGN.md V3 page-family sections; docs/experience-contract.md; docs/interaction-contract.md; docs/jtbd.md; docs/decisions.md OD-REDESIGN-72 through OD-REDESIGN-79; docs/reference/v3-live-inventory.md; docs/reviews/v3-redesign.md; and the current source map below.

The current worktree has no checked-out docs/plans/2026-07-20-v3-storybook-matrix.md and no completed Issue 2 checkpoint. Historical commit 4ffc9f5 contains the refined Issue 2 plan, but is not completion evidence. Before the first code change, prove that the completed implementation and owner checkpoint are present after rebasing this plan:

~~~bash
git status --short
rg --files docs/plans | sort | rg -i 'storybook|issue.?2|v3'
git log --all --format='%H %s' -- docs/plans/2026-07-20-v3-storybook-matrix.md docs/reviews/v3-redesign.md
test -f docs/plans/2026-07-20-v3-storybook-matrix.md
test -f mos-app/.storybook/main.ts
test -f mos-app/.storybook/preview.tsx
test -f scripts/v3-storybook-matrix.mjs
rg -n 'Issue 2|storybook|PageFrame|PageHead|state-kit' docs/reviews/v3-redesign.md docs/agent-context.md
git diff --name-only -- mos-app/package.json mos-app/package-lock.json
~~~

If the completion evidence is absent, stop with no commit. If present, read the completed Issue 2 plan/checkpoint, record its actual PageFrame/PageHead/state-kit public props, classes, test IDs, viewports, and commands, then run from mos-app:

~~~bash
npm run storybook -- --ci
npm test -- --run src/shell/page-frame.test.tsx src/shell/page-head.test.tsx
npm run typecheck
npm run lint -- --max-warnings=0
~~~

Do not invent a Storybook path or compatibility shim. A package-file diff or public-contract mismatch blocks Issue 3 until this plan is revalidated.

Issue 3 must not add a fourth family, rename a domain model, add --e7-* application tokens, introduce a second frame/head implementation, create standalone mockups, change redirect behavior, migrate every route, touch mos-app/package.json or mos-app/package-lock.json, or absorb Issues 4–12.

| Later issue | Explicitly out of scope |
| --- | --- |
| 4 | record-panel-host.tsx, record-panel-host.css, overlay geometry, focus stack, Escape, browser Back |
| 5 | RecordViewer, fields, Task adapter, universal record interface; only the small Task heading-level seam is allowed |
| 6 | RecordCollection, Signals adapter, collection-engine rewrite |
| 7–8 | Inbox/Deputy and Café migration |
| 9 | Owner-rendered/driven acceptance; Issue 3 supplies prerequisite browser evidence |
| 10 | JSONB, schema, RLS, Supabase, data-model work |
| 11–12 | Remaining route migration and end-of-migration closure |

## Production contract

### Exactly three typed families

Create mos-app/src/shell/page-families.ts as metadata only. It accepts no records, queries, adapters, or universal field schema.

~~~ts
export const PAGE_FAMILIES = ['workspace', 'focused-record', 'management'] as const
export type PageFamily = (typeof PAGE_FAMILIES)[number]

export const PAGE_FAMILY_STATES = [
  'default', 'loading', 'empty', 'filtered-empty', 'error',
  'permission', 'read-only', 'saving', 'saved', 'validation',
  'archived', 'retracted',
] as const
export type PageFamilyState = (typeof PAGE_FAMILY_STATES)[number]

export type PageHeadVariant = 'prose' | 'content'
export interface PageFamilyContract {
  family: PageFamily
  headVariant: PageHeadVariant
  mobilePriority: 'work-before-config' | 'record-first'
}
export const PAGE_FAMILY_CONTRACTS: Record<PageFamily, PageFamilyContract> = {
  workspace: { family: 'workspace', headVariant: 'content', mobilePriority: 'work-before-config' },
  'focused-record': { family: 'focused-record', headVariant: 'prose', mobilePriority: 'record-first' },
  management: { family: 'management', headVariant: 'content', mobilePriority: 'work-before-config' },
}
~~~

Workspace, Focused record, and Management are internal typed family names and DOM marker values only. Never render them as visible chrome, badges, breadcrumbs, labels, or headings. Representative pages must continue to show Tasks, People, or the resolved record title plus the user’s job sentence. State is shell metadata only; domain bodies retain typed state and use EmptyState, ErrorState, SkeletonRows, and LoadingShell from mos-app/src/components/ui/state-kit.tsx.

| Family | Real composition | Typed model and preserved job |
| --- | --- | --- |
| Workspace | /work/tasks → mos-app/src/components/tasks/tasks-workspace.tsx → TasksWorkspace | TaskListRow keeps Team/BU, PIC, Supervisor, status, due date, filters, grouping, saved views, selection, and split outlet. |
| Focused record | direct /work/tasks/:taskId → mos-app/src/pages/tasks-layout.tsx → TaskSurface | TaskListRow/TaskDetail keeps PIC/Supervisor, checklist, activity, permission, archive, and Task-specific editing. |
| Management | /admin/people → mos-app/src/pages/admin-users-page.tsx → AdminUsersPage | AdminPersonRow keeps login, role, archive, permission, confirmation, and password flows. |

SignalRow, SignalRecordHost, and all other domain models remain distinct and deferred to their owning issues. There is no universal record renderer.

### One PageFrame and one PageHead

Create mos-app/src/shell/page-family-frame.tsx. It is a thin composition helper, not a second frame: every instance renders exactly one existing PageFrame, one existing PageHead, and typed children.

~~~tsx
export interface PageFamilyFrameProps {
  family: PageFamily
  title: string
  jobSentence: string
  count?: number | null
  meta?: ReactNode
  action?: ReactNode
  state?: PageFamilyState
  surfaceWash?: boolean
  children: ReactNode
}

export function PageFamilyFrame(props: PageFamilyFrameProps) {
  const contract = PAGE_FAMILY_CONTRACTS[props.family]
  return (
    <PageFrame family={props.family} state={props.state ?? 'default'} variant="data" surfaceWash={props.surfaceWash}>
      <PageHead
        family={props.family}
        variant={contract.headVariant}
        title={props.title}
        jobSentence={props.jobSentence}
        count={props.count}
        meta={props.meta}
        action={props.action}
      />
      {props.children}
    </PageFrame>
  )
}
~~~

Extend the current props without breaking legacy routes:

~~~ts
export interface PageFrameProps {
  children: ReactNode
  variant?: 'data' | 'prose'
  surfaceWash?: boolean
  family?: PageFamily
  state?: PageFamilyState
}

export interface PageHeadProps {
  title: string
  subtitle?: string
  jobSentence?: string
  meta?: ReactNode
  maxWidth?: number
  variant?: 'prose' | 'content'
  count?: number | null
  action?: ReactNode
  family?: PageFamily
}
~~~

PageFrame adds data-page-family, data-page-state, aria-busy for loading/saving, page-frame--v3, and a page-frame__content wrapper only when family is present. PageHead renders jobSentence once in the existing grammar and keeps exactly one h1. Add no icon slot, second heading, route-local heading, or record data.

Create mos-app/src/shell/page-families.css and import it in page-frame.tsx:

~~~css
.page-frame--v3 {
  padding: 24px 32px 48px;
}
.page-frame--v3 .page-frame__content {
  width: 100%;
  max-width: 1180px;
  margin: 0;
}
@media (min-width: 768px) and (max-width: 1279px) {
  .page-frame--v3 { padding: 20px 24px 40px; }
}
@media (max-width: 767px) {
  .page-frame--v3 {
    padding: 16px 16px calc(16px + var(--bottom-tab-bar-h, 60px));
  }
  .page-frame--v3 .page-frame__content { min-width: 0; }
}
~~~

E7 proof is binding: 1280px uses the 1180px content measure, 232px rail, 56px header, 32px controls, 52px rows, Plus Jakarta Sans headings, DM Sans body/UI, and 4/8/12/16/20/24/32/48 spacing; 1024px contracts gutters and wraps reachable actions without page overflow; 390px keeps work before configuration, required targets at least 44×44px, and no horizontal page overflow. Cards/overlays remain 12px and controls remain 8px under existing owners. Use existing --ds-*, --brand-*, and --status-* tokens; never create --e7-* application variables.

State mapping is explicit: Workspace maps loading/error/empty/filtered-empty from its existing Task state; Management maps loading/error/empty from its existing People state; Focused record exposes loading on unresolved title while TaskSurface retains its own loading/not-found/error body. Default/error/loading/empty tests must assert user-visible state-kit output, not only data attributes. Permission/read-only, saving/saved/validation, archived, and retracted remain available in the state union and typed domain consumers.

### Route classification enforcement

Create mos-app/src/shell/route-classification.ts:

~~~ts
export type InfrastructureReason =
  | 'auth' | 'layout' | 'capability' | 'public' | 'dev-only' | 'not-found'

export type V3RouteHandle =
  | { kind: 'page'; family: PageFamily }
  | { kind: 'redirect'; target: string }
  | { kind: 'infrastructure'; reason: InfrastructureReason }

export interface ClassifiedV3Route {
  path: string
  handle: V3RouteHandle
}

export function v3Page(family: PageFamily): V3RouteHandle
export function v3Redirect(target: string): V3RouteHandle
export function v3Infrastructure(reason: InfrastructureReason): V3RouteHandle
export function collectV3Routes(routes: readonly RouteObject[], parentPath?: string): ClassifiedV3Route[]
export function assertV3RouteConfig(routes: readonly RouteObject[]): void
~~~

collectV3Routes recursively resolves index, relative, absolute, and pathless entries. assertV3RouteConfig rejects absent handles, unknown kinds/families, extra handle fields, invalid redirect targets, and infrastructure entries without one of the six reasons. It inspects every route object, not just leaves.

Add only handle metadata to mos-app/src/router.tsx; preserve all paths, elements, feature flags, loaders, guards, and redirect targets:

| Family | Route declarations |
| --- | --- |
| Workspace | /, /work/tasks, /work/signals, /events, /money, /money/detail, /money/budget, /money/pricing, /inbox, /cafe, /cafe/log, /cafe/plan, /cafe/stock, /cafe/review, /cafe/pushes, /ecommerce, /roastery |
| Focused record | /work/tasks/new, /work/tasks/:taskId, /work/signals/:signalId, /work/follow-ups/:id, /money/follow-ups |
| Management | /work/projects, /work/objectives, /profile, /admin/people |

Mark /login and /recovery public; /dev/ui, /dev/views, /dev/views/:viewId, and __home-stacked DEV-only; RedirectIfAuthed and ProtectedRoute auth; AppShell layout; RequireCapability, RequireAccessRole, and AdminRoute capability; and * not-found. Mark current redirects with metadata targets: /work → /work/tasks; /work/cascade → /work/tasks; /work/follow-ups → /work/tasks?view=followups; /admin → /admin/people; /tasks → /work/tasks; /tasks/new → /work/tasks/new; /tasks/:taskId → /work/tasks/:taskId; /updates → /work/signals; /ops, /ops/new, /ops/:id/edit → /; /kitchen → /cafe; /kitchen/log, /kitchen/plan, /kitchen/stock, /kitchen/review, /kitchen/pushes → their /cafe equivalents; /objectives → /work/objectives; /projects-processes → /work/projects; /dashboard, /sales → /money; /dashboard/detail → /money/detail; /plan/budget → /money/budget; /plan/pricing → /money/pricing.

### Deterministic migration guard

Create mos-app/src/shell/page-family-migration.ts. The representative plus deferred union must equal the product page paths returned by collectV3Routes(routeConfig); infrastructure is excluded.

~~~ts
export interface PageFamilyMigrationEntry {
  path: string
  family: PageFamily
  sourceFile: string
  symbol: string
}
export const ISSUE_3_REPRESENTATIVE_ROUTES: readonly PageFamilyMigrationEntry[] = [
  { path: '/work/tasks', family: 'workspace', sourceFile: 'mos-app/src/components/tasks/tasks-workspace.tsx', symbol: 'TasksWorkspace' },
  { path: '/work/tasks/:taskId', family: 'focused-record', sourceFile: 'mos-app/src/pages/tasks-layout.tsx', symbol: 'TaskRecordPage' },
  { path: '/admin/people', family: 'management', sourceFile: 'mos-app/src/pages/admin-users-page.tsx', symbol: 'AdminUsersPage' },
]
export const ISSUE_3_DEFERRED_PAGE_ROUTES = [
  '/', '/cafe', '/cafe/log', '/cafe/plan', '/cafe/pushes', '/cafe/review', '/cafe/stock',
  '/ecommerce', '/events', '/inbox', '/money', '/money/budget', '/money/detail',
  '/money/follow-ups', '/money/pricing', '/profile', '/roastery', '/work/follow-ups/:id',
  '/work/objectives', '/work/projects', '/work/signals', '/work/signals/:signalId',
  '/work/tasks/new',
] as const
~~~

Create mos-app/src/shell/page-family-migration.test.ts. It must fail for an unclassified route, duplicate manifest path, missing union member, or family outside the three values. It reads exactly the three representative source files, requires PageFamilyFrame, and rejects raw <PageFrame> and <PageHead> in those consumers. A narrow source scan covers only page-families.ts, page-family-frame.tsx, page-frame.tsx, page-head.tsx, and page-families.css, rejecting --e7-*, RecordViewer, and RecordCollection.

Keep the existing deterministic Issue 1 inventory. Update scripts/v3-live-inventory.mjs and scripts/v3-live-inventory.test.mjs only so scanSourceEvidence recognizes PageFamilyFrame as shared frame/head evidence; regenerate docs/reference/v3-live-inventory.json and docs/reference/v3-live-inventory.md. Do not create a second inventory or state ledger.

## AC/NFR ownership

| Requirement | Issue 3 proof | Non-claim |
| --- | --- | --- |
| FR-V3-001 | Runtime route-classification test checks every route handle and exactly three page families. | Deferred route bodies remain unmigrated. |
| FR-V3-002 and FR-V3-015 | Shared frame/head tests, E7 CSS/source guard, and computed geometry checks. | Domain controls keep their owners. |
| FR-V3-005 | Direct Task URL uses existing TaskSurface; PageFamilyFrame owns shell h1 and body uses h2. | No RecordViewer or panel-host redesign. |
| FR-V3-006 and FR-V3-014 | 390px proof checks no overflow, target size, and existing work-before-options order. | Overlay phone behavior is Issue 4. |
| NFR-V3-001 | RTL and Playwright proof for landmark, heading, names, states, focus, and keyboard tab. Existing e2e/shell-aria-current.spec.ts remains navigation proof. | No second navigation implementation. |
| NFR-V3-003 | npm run test:coverage plus changed-file inspection; changed lines ≥80%. | No coverage inflation. |
| NFR-V3-004 | npm run typecheck and npm run lint -- --max-warnings=0. | Zero errors/warnings required. |
| NFR-V3-005 and NFR-V3-006 | e2e/v3-page-families.spec.ts at 1280×900, 1024×900, 390×844. | Issue 9 owns final owner acceptance. |
| NFR-V3-007 and AC-V3-014 precondition | Manifest equality, source boundary guard, and inventory check. | Issue 12 owns closure. |
| AC-V3-001 | Representative computed-style evidence recorded for Issue 9. | No owner sign-off claim. |

## TDD execution sequence

Run app commands from mos-app/ and repository scripts from the repository root. Every task is a 2–5 minute red-green checkpoint. Observe the intended failure before its green step. Commit each coherent green checkpoint with the required trailer: Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>.

### Task 0 — dependency gate, 4 minutes, read-only

Read the completed Issue 2 plan/checkpoint and current page-frame.tsx, page-head.tsx, page-frame.test.tsx, page-head.test.tsx, router.tsx, router.test.tsx, tasks-layout.tsx, tasks-workspace.tsx, signals-archive-page.tsx, admin-users-page.tsx, and state-kit.tsx. Run the dependency commands above. Confirm there is no package-file diff. If completion evidence is absent, stop with no commit.

### Task 1 — RED: family primitive contract, 4 minutes

Create mos-app/src/shell/page-family-frame.test.tsx first. Assert the three family values, one main, one level-one heading, data-page-family="workspace", data-page-state="default", visible job sentence, and saving aria-busy without a universal body. Also assert that exact visible text Workspace, Focused record, and Management is absent; the passed title and job sentence are the only visible page-head identity.

~~~bash
npm test -- --run src/shell/page-family-frame.test.tsx
~~~

It must fail because the new contract/helper does not exist.

### Task 2 — GREEN: primitives, E7 frame, and legacy locks, 5 minutes

Create page-families.ts, page-family-frame.tsx, and page-families.css. Modify page-frame.tsx and page-head.tsx with the interfaces above. Add legacy-preservation assertions to page-frame.test.tsx and one-job-sentence/one-h1 assertions to page-head.test.tsx.

~~~bash
npm test -- --run src/shell/page-family-frame.test.tsx src/shell/page-frame.test.tsx src/shell/page-head.test.tsx
npm run typecheck
~~~

Commit: docs-independent implementation commit message feat: add V3 page family frame primitives, with the required trailer.

### Task 3 — RED: route classifier, 4 minutes

Create mos-app/src/shell/route-classification.test.ts. Assert a missing handle and unknown family throw, and the real routeConfig exposes all three page families.

~~~bash
npm test -- --run src/shell/route-classification.test.ts
~~~

The fixture must fail before the classifier exists; do not skip the real-config test.

### Task 4 — GREEN: route handles, 5 minutes

Create route-classification.ts and add only handle metadata to router.tsx using the route table. Preserve routeConfig export and all current elements and redirect behavior.

~~~bash
npm test -- --run src/shell/route-classification.test.ts src/router.test.tsx src/consistency.regression.test.tsx
npm run typecheck
~~~

Commit: feat: enforce V3 route family classification, with the required trailer.

### Task 5 — RED: migration and boundary guard, 4 minutes

Create page-family-migration.test.ts. Compare actual page handles with representative paths concatenated with deferred paths; assert uniqueness, exact equality, representative PageFamilyFrame use, no raw frame/head consumers, and the narrow no-token/no-viewer scan.

~~~bash
npm test -- --run src/shell/page-family-migration.test.ts
~~~

It must fail because the manifest and representative migrations do not exist.

### Task 6 — GREEN: manifest and deterministic inventory evidence, 5 minutes

Create page-family-migration.ts with the exact values above. Update the existing inventory scanner/test only for PageFamilyFrame evidence and regenerate its existing JSON/Markdown artifacts.

~~~bash
npm test -- --run src/shell/route-classification.test.ts src/shell/page-family-migration.test.ts
node --test scripts/v3-live-inventory.test.mjs
node scripts/v3-live-inventory.mjs --write
node scripts/v3-live-inventory.mjs --check
~~~

Commit: test: add resumable V3 page migration guard, with the required trailer.

### Task 7 — RED: Workspace representative, 4 minutes

Extend mos-app/src/components/tasks/tasks-workspace.test.tsx and mos-app/src/pages/tasks-layout.test.tsx with real TaskListRow fixtures. Assert one Tasks main/h1, workspace marker, the Tasks job sentence, Tasks region, and preserved row/filter/saved-view/ViewOptionsDisclosure behavior. Assert no visible generic Workspace label.

~~~bash
npm test -- --run src/components/tasks/tasks-workspace.test.tsx src/pages/tasks-layout.test.tsx
~~~

The family marker must fail before migration.

### Task 8 — GREEN: Workspace migration, 5 minutes

Remove only the outer PageFrame wrappers from tasks-layout.tsx. Replace the PageHead in tasks-workspace.tsx with PageFamilyFrame around the unchanged toolbar, TasksTableBody, rows, mobile disclosure, saved view, due runs, and drawerSlot. Map loading/error/empty/filtered-empty to PageFamilyState. Keep TaskListRow fields, split behavior, TaskDrawer, and panel CSS unchanged. Replace only the obsolete AC-121 uncapped-frame assertion.

~~~bash
npm test -- --run src/components/tasks/tasks-workspace.test.tsx src/pages/tasks-layout.test.tsx src/pages/tasks-page.test.tsx
npm run typecheck
~~~

Commit: feat: put Tasks on the V3 Workspace frame, with the required trailer.

### Task 9 — RED: Focused record representative, 4 minutes

Add a direct-page test to tasks-layout.test.tsx using renderAtState('/work/tasks/task-1', { taskSurface: 'page' }), makeTask, and getTask. Assert focused-record marker, one h1 named Open me, one h2 named Open me, the focused-record job sentence, typed Kitchen context, and no table shell. Assert no visible generic Focused record label.

~~~bash
npm test -- --run src/pages/tasks-layout.test.tsx -t "Focused record family"
~~~

It must fail on the missing marker. Do not assert a RACI label or add a generic record prop.

### Task 10 — GREEN: direct Task shell without a viewer, 5 minutes

Keep TaskRecordPage inside PageFamilyFrame with title={title ?? 'Task'}, jobSentence="Review and update this task.", and unresolved state loading. Keep TaskSurface as the typed body and leave the panel branch unchanged.

Add identityHeadingLevel?: 1 | 2 to TaskSurfaceProps in mos-app/src/components/tasks/task-surface.tsx and RecordDetailsPanelProps in mos-app/src/components/tasks/record-details-panel.tsx. Pass it only to the non-compact full-page RecordDetailsPanel call and render the identity as h2 when the PageFamilyFrame owns the h1; default remains h1 and compact drawer remains identity-suppressed. Add the heading outcome to task-surface.test.tsx, record-details-panel.test.tsx, or task-record-redesign.test.tsx. Do not modify record-panel-host.tsx, its CSS, or TaskDrawer.

~~~bash
npm test -- --run src/pages/tasks-layout.test.tsx src/components/tasks/task-surface.test.tsx src/components/tasks/record-details-panel.test.tsx src/components/tasks/task-record-redesign.test.tsx
npm run typecheck
~~~

Commit: feat: put direct Task pages on the V3 Focused record frame, with the required trailer.

### Task 11 — RED: Management representative, 4 minutes

Extend mos-app/src/pages/admin-users-page.test.tsx with existing People fixtures. Assert one People main/h1, management marker, the People job sentence, loaded person, and preserved loading/error/empty/permission/archive/password flows. Assert no visible generic Management label.

~~~bash
npm test -- --run src/pages/admin-users-page.test.tsx -t "Management frame"
~~~

The marker must fail before migration.

### Task 12 — GREEN: Management migration, 4 minutes

Replace only the PageFrame plus PageHead pair in admin-users-page.tsx with PageFamilyFrame. Map loading/error/empty/default to PageFamilyState. Keep AdminPersonRow, Supabase calls, access checks, ErrorState, LoadingShell, empty handling, dialogs, and feedback unchanged.

~~~bash
npm test -- --run src/pages/admin-users-page.test.tsx src/pages/admin-users-page-rework.test.tsx
npm run typecheck
~~~

Commit: feat: put People on the V3 Management frame, with the required trailer.

### Task 13 — RED: responsive, keyboard, and accessibility proof, 5 minutes

Create mos-app/e2e/v3-page-families.spec.ts using mos-app/e2e/fixtures/tasks.ts, mos-app/e2e/fixtures/users.ts, and mos-app/e2e/helpers/login.ts. Use VIEWER for Tasks and ADMIN for People. Cover 1280×900, 1024×900, and 390×844; direct-open the URL built from 'work/tasks/' plus TASKS.VIEWER_ACCOUNTABLE.id for Focused record. Assert one family marker, one main, one h1, no document.documentElement horizontal overflow, content width at most 1180px at 1280, work before mobile options at 390, and no visible family control below 44×44px at 390.

~~~bash
npx playwright test e2e/v3-page-families.spec.ts --project=chromium
~~~

It must fail until the rendered proof is complete. Use only the local ephemeral stack.

### Task 14 — GREEN: rendered E7 and focus proof, 5 minutes

Correct only the shared family CSS/head seam and representative composition. Add Tab followed by :focus-visible proof, aria-busy/state proof where exposed, and the 1280 content-width assertion. At 1024 assert reachable actions and decision columns are not page-clipped; at 390 assert content-before-options, target size, and no page overflow. Keep aria-current coverage in e2e/shell-aria-current.spec.ts.

~~~bash
npx playwright test e2e/v3-page-families.spec.ts e2e/shell-aria-current.spec.ts --project=chromium
~~~

Commit: test: verify V3 page family responsive geometry, with the required trailer.

### Task 15 — full issue gate, 5 minutes

From mos-app/:

~~~bash
npm test -- --run
npm run test:coverage
npm run typecheck
npm run lint -- --max-warnings=0
npm run build
npx playwright test e2e/v3-page-families.spec.ts e2e/tasks-split-view.spec.ts e2e/tasks-canonical-page.spec.ts e2e/shell-phone-nav.spec.ts --project=chromium
~~~

From the repository root:

~~~bash
node --test scripts/v3-live-inventory.test.mjs
node scripts/v3-live-inventory.mjs --check
git diff --check
~~~

Inspect coverage output for every changed shell, route-guard, inventory-script, and representative TS/TSX file; changed lines must be at least 80% covered by outcome tests. Do not weaken assertions. Run bash scripts/pre-merge-check.sh only after the review ledger is updated and the work is on its named implementation branch.

### Task 16 — resumability checkpoint, 5 minutes, docs only

After implementation and gates, update only docs/agent-context.md, docs/backlog.md, and docs/reviews/v3-redesign.md. Use the exact labels Verified, Not done, and Next action. Verified must name route classification, one PageFamilyFrame composition for the three representatives, E7 1280×900/1024×900/390×844 proof, explicit migration union, and green inventory guard. Not done must name deferred routes, Issues 4–12, final owner gate, and owner approval. Next action must be: Issue 4 — implement the shared overlay/panel/navigation host and revalidate the Issue 3 family markers against it.

~~~bash
git diff --name-only -- docs/agent-context.md docs/backlog.md docs/reviews/v3-redesign.md
git diff --check -- docs/agent-context.md docs/backlog.md docs/reviews/v3-redesign.md
~~~

Commit: docs: record V3 Issue 3 checkpoint, with the required trailer. Pause for owner approval before any push, merge, or deploy.

## Plan validation and handoff

Run from the repository root before committing this plan:

~~~bash
test -f docs/plans/2026-07-20-v3-page-families.md
for path in CLAUDE.md AGENTS.md docs/agent-context.md docs/specs/v3-redesign.spec.md DESIGN.md docs/reference/v3-live-inventory.md docs/reference/v3-live-inventory.json docs/reviews/v3-redesign.md mos-app/src/shell/page-frame.tsx mos-app/src/shell/page-head.tsx mos-app/src/shell/page-frame.test.tsx mos-app/src/shell/page-head.test.tsx mos-app/src/router.tsx mos-app/src/router.test.tsx mos-app/src/components/tasks/tasks-workspace.tsx mos-app/src/pages/tasks-layout.tsx mos-app/src/pages/signals-archive-page.tsx mos-app/src/pages/admin-users-page.tsx scripts/v3-live-inventory.mjs scripts/v3-live-inventory.test.mjs; do test -e "$path" || { echo "missing existing path: $path"; exit 1; }; done
git diff --check -- docs/plans/2026-07-20-v3-page-families.md
rg -n 'superpowers:executing-plans|isolated, visible Codex task|Do not use subagents|Workspace|Focused record|Management|PageFrame|PageHead|1280|1024|390|EmptyState|ErrorState|LoadingShell|SkeletonRows|AC-V3|NFR-V3|Issue 4|Issue 12|Co-Authored-By' docs/plans/2026-07-20-v3-page-families.md
bad_marker="NEEDS"
bad_marker="${bad_marker}_REVIEW"
if rg -n "$bad_marker" docs/plans/2026-07-20-v3-page-families.md; then exit 1; fi
if rg -n '\.{3}' docs/plans/2026-07-20-v3-page-families.md; then exit 1; fi
git status --short
~~~

Only docs/plans/2026-07-20-v3-page-families.md may be staged for this planning task. Commit exactly:

~~~bash
git add docs/plans/2026-07-20-v3-page-families.md
git commit -m "docs: plan V3 Issue 3 page families" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
~~~
