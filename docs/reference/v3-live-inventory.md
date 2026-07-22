# V3 live route, component, and style inventory

This deterministic artifact is source evidence for Issue 1. It is not a rendered application acceptance report and does not mark the current mixed implementation as migrated.

## Summary

| Metric | Count |
| --- | ---: |
| Live route declarations classified | 58 |
| Page routes | 29 |
| Redirect routes | 25 |
| DEV-only routes | 4 |
| CSS files/families scanned | 73 |
| Shared interaction jobs | 13 |
| Jobs with raw/duplicate consumers | 13 |

Canonical collection and opening jobs: **search**, **filter**, **sort**, **group**, **saved views**, **wide right panel**, **full page**, and **phone full-screen**.

## Issue 2 Storybook matrix

The Storybook workbench is the in-code component/state/responsive proof for Issue 2. It does not claim application migration or Issue 9 representative rendered acceptance.

- Matrix JSON: [`docs/reference/v3-storybook-matrix.json`](v3-storybook-matrix.json)
- Matrix Markdown: [`docs/reference/v3-storybook-matrix.md`](v3-storybook-matrix.md)
- Stack: Storybook 10.5.2 / React-Vite 10.5.2 / addon-a11y 10.5.2 / external runner 0.24.4
- Totals: 35 stories, 36 state entries, 3 responsive entries, 23 canonical component jobs
- Ownership rows: 7; each required job/state/viewport/component is validated against its owning story file
- Task vocabulary guard: 0 violations; Task specimens use PIC + Supervisor and reject Owner/RACI vocabulary
- Viewports: desktop1280, intermediate, phone390; a11y test mode: error
- Scope claims: migration no; representative acceptance no; future Issue 4 host no
- Later-owner gaps: Button loading state is not exposed by the canonical primitive; owner: Issue 3., RecordPanelHost remains the current shell; desktop split Esc behavior is intentionally non-modal, and any I2 host unification is owned by Issue 4.

### Storybook ownership mapping

| Story file | Jobs | States | Responsive | Canonical imports |
| --- | --- | --- | --- | --- |
| mos-app/src/stories/v3/foundation.stories.tsx | foundation.typography-roles, foundation.spacing-rhythm, foundation.colors-borders-radii-elevation, foundation.icons, foundation.focus-visible, foundation.runtime-fonts-background, foundation.responsive-frames, accessibility.runtime-proof | button.focus-visible | desktop1280, intermediate, phone390 | Button, TextInput, TasksIcon, CloseIcon |
| mos-app/src/stories/v3/controls.stories.tsx | controls.button-state-matrix, controls.field-state-matrix, controls.selection-status, controls.keyboard-focus, accessibility.keyboard-focus | button.default, button.hover-documentation, button.focus-visible, button.active, button.disabled, button.loading-debt, text-input.default, text-input.focus-visible, text-input.disabled, text-input.error, select.default, select.focus-visible, select.disabled, select.error, checkbox.default, checkbox.checked, checkbox.indeterminate, checkbox.disabled, toggle.default, status.semantic-tones | desktop1280, intermediate, phone390 | Button, ErrorState, TextInput, Select, Checkbox, Toggle, Pill, StatusPill, ViewTabs |
| mos-app/src/stories/v3/feedback.stories.tsx | feedback.empty-variants, feedback.error-retry, feedback.loading-skeleton, feedback.saving-saved, feedback.validation-retry | empty.quiet, empty.next-step, empty.awaiting, empty.blank, error.retry, loading.skeleton-rows, loading.shell, feedback.saving, feedback.saved, feedback.validation-retry | desktop1280, intermediate, phone390 | EmptyState, ErrorState, SkeletonRows, LoadingShell, PlanQtyStepper, PlanQtyCell |
| mos-app/src/stories/v3/page-compositions.stories.tsx | page-composition.workspace, page-composition.focused-record, page-composition.management | — | desktop1280, intermediate, phone390 | Button, PageFrame, PageHead, DataTable |
| mos-app/src/stories/v3/dense-collections.stories.tsx | dense-collection.realistic-gordi-records, dense-collection.viewport-matrix, dense-collection.state-matrix | collection.ready, collection.loading, collection.empty, collection.filtered-empty, collection.error | desktop1280, intermediate, phone390 | DataTable, StatusPill |
| mos-app/src/stories/v3/overlays.stories.tsx | overlay.command-search, overlay.confirmation, overlay.anchored-menu, overlay.current-record-panel-shell | overlay.current-host-shell | desktop1280, intermediate, phone390 | CommandMenu, Button, ConfirmDialog, RowMenu, RecordPanelHost |
| mos-app/src/stories/v3/accessibility-responsive.stories.tsx | accessibility.runnable-a11y, accessibility.runtime-proof, accessibility.keyboard-focus | button.focus-visible | desktop1280, intermediate, phone390 | Button, ViewTabs, RecordPanelHost, DataTable |

## Route inventory

### `*`
- Kind/status/auth: page / canonical / protected
- Component/source: NotFoundPage — `mos-app/src/pages/not-found-page.tsx` :: `NotFoundPage`; router literal `*`
- Page family/frame/head: not-applicable / shared-page-frame / bespoke-or-missing
- Typography/spacing source: shared mos-app/src/index.css and DESIGN.md; local CSS: —
- Collection grammar: page-local or not observed; presentations: —; owns view state: no
- Record opening: default not observed; direct full canonical page when URL is explicit; phone full-screen record mode
- Overlays: none observed; states: default; CSS families: mos-app/src/index.css
- Notes: Catch-all route; not a page-family surface.

### `/`
- Kind/status/auth: page / canonical / protected
- Component/source: HomePage | StackedUnionHome — `mos-app/src/pages/home-page.tsx` :: `HomePage`; router literal `<index>`
- Page family/frame/head: workspace / shared-page-frame / shared-page-head
- Typography/spacing source: route-local CSS plus shared mos-app/src/index.css; local CSS: mos-app/src/pages/home-page.css
- Collection grammar: route-local collection/view state is present; presentations: page-local / not observed; owns view state: yes
- Record opening: default not observed; direct full canonical page when URL is explicit; phone full-screen record mode
- Overlays: none observed; states: default, error/retry, loading; CSS families: mos-app/src/index.css, mos-app/src/pages/home-page.css
- Notes: Runtime flag SHOW_HOME_STACKED can select StackedUnionHome.

### `/__home-stacked`
- Kind/status/auth: dev-only / conditional / dev
- Component/source: StackedUnionHome — `mos-app/src/pages/stacked-union-home.tsx` :: `StackedUnionHome`; router literal `__home-stacked`
- Page family/frame/head: workspace / shared-page-frame / shared-page-head
- Typography/spacing source: route-local CSS plus shared mos-app/src/index.css; local CSS: mos-app/src/pages/stacked-union-home.css
- Collection grammar: page-local or not observed; presentations: page-local / not observed; owns view state: no
- Record opening: default not observed; direct full canonical page when URL is explicit; phone full-screen record mode
- Overlays: none observed; states: default, error/retry, loading; CSS families: mos-app/src/index.css, mos-app/src/pages/stacked-union-home.css
- Notes: DEV-only alternate home route.

### `/admin`
- Kind/status/auth: redirect / redirect / protected
- Component/source: Navigate — `mos-app/src/router.tsx` :: `Navigate`; router literal `admin`
- Page family/frame/head: not-applicable / not-applicable / not-applicable
- Typography/spacing source: router redirect declaration; local CSS: —
- Collection grammar: not-applicable; presentations: —; owns view state: no
- Record opening: default not-applicable; direct not-applicable; phone not-applicable
- Overlays: —; states: —; CSS families: —
- Notes: Admin entry redirects to /admin/people.

### `/admin/people`
- Kind/status/auth: page / canonical / role-gated
- Component/source: AdminUsersPage — `mos-app/src/pages/admin-users-page.tsx` :: `AdminUsersPage`; router literal `admin/people`
- Page family/frame/head: management / shared-page-frame / shared-page-head
- Typography/spacing source: shared mos-app/src/index.css and DESIGN.md; local CSS: —
- Collection grammar: route-local collection/view state is present; presentations: Management table/list; owns view state: yes
- Record opening: default not observed; direct full canonical page when URL is explicit; phone full-screen record mode
- Overlays: centered confirmation/dialog; states: default, error/retry, loading, permission/read-only; CSS families: mos-app/src/index.css
- Notes: AdminRoute.

### `/cafe`
- Kind/status/auth: page / canonical / protected
- Component/source: CafeOpeningPage — `mos-app/src/pages/cafe-opening-page.tsx` :: `CafeOpeningPage`; router literal `cafe`
- Page family/frame/head: workspace / shared-page-frame / shared-page-head
- Typography/spacing source: route-local CSS plus shared mos-app/src/index.css; local CSS: mos-app/src/pages/cafe-opening-page.css
- Collection grammar: page-local or not observed; presentations: page-local / not observed; owns view state: no
- Record opening: default not observed; direct full canonical page when URL is explicit; phone full-screen record mode
- Overlays: none observed; states: default, empty, error/retry, loading, permission/read-only; CSS families: mos-app/src/index.css, mos-app/src/pages/cafe-opening-page.css
- Notes: —

### `/cafe/log`
- Kind/status/auth: page / canonical / protected
- Component/source: KitchenLogPage — `mos-app/src/pages/kitchen-log-page.tsx` :: `KitchenLogPage`; router literal `cafe/log`
- Page family/frame/head: workspace / shared-page-frame / shared-page-head
- Typography/spacing source: route-local CSS plus shared mos-app/src/index.css; local CSS: mos-app/src/pages/kitchen-log-page.css
- Collection grammar: route-local collection/view state is present; presentations: Table; owns view state: yes
- Record opening: default not observed; direct full canonical page when URL is explicit; phone full-screen record mode
- Overlays: centered search/command candidate; states: default, empty, error/retry, loading, permission/read-only, saving/saved, validation; CSS families: mos-app/src/index.css, mos-app/src/pages/kitchen-log-page.css
- Notes: —

### `/cafe/plan`
- Kind/status/auth: page / canonical / protected
- Component/source: KitchenPlanPage — `mos-app/src/pages/kitchen-plan-page.tsx` :: `KitchenPlanPage`; router literal `cafe/plan`
- Page family/frame/head: workspace / shared-page-frame / shared-page-head
- Typography/spacing source: route-local CSS plus shared mos-app/src/index.css; local CSS: mos-app/src/pages/kitchen-plan-page.css
- Collection grammar: route-local collection/view state is present; presentations: Table; owns view state: yes
- Record opening: default not observed; direct full canonical page when URL is explicit; phone full-screen record mode
- Overlays: centered search/command candidate; states: default, empty, error/retry, loading, permission/read-only, saving/saved, validation; CSS families: mos-app/src/index.css, mos-app/src/pages/kitchen-plan-page.css
- Notes: —

### `/cafe/pushes`
- Kind/status/auth: page / conditional / role-gated
- Component/source: KitchenPushesPage — `mos-app/src/pages/kitchen-pushes-page.tsx` :: `KitchenPushesPage`; router literal `cafe/pushes`
- Page family/frame/head: workspace / shared-page-frame / shared-page-head
- Typography/spacing source: route-local CSS plus shared mos-app/src/index.css; local CSS: mos-app/src/pages/kitchen-pushes-page.css
- Collection grammar: page-local or not observed; presentations: Table; owns view state: no
- Record opening: default not observed; direct full canonical page when URL is explicit; phone full-screen record mode
- Overlays: none observed; states: default, empty, error/retry, loading; CSS families: mos-app/src/index.css, mos-app/src/pages/kitchen-pushes-page.css
- Notes: RequireAccessRole ops_lead/admin.

### `/cafe/review`
- Kind/status/auth: page / conditional / role-gated
- Component/source: KitchenReviewPage — `mos-app/src/pages/kitchen-review-page.tsx` :: `KitchenReviewPage`; router literal `cafe/review`
- Page family/frame/head: workspace / shared-page-frame / shared-page-head
- Typography/spacing source: route-local CSS plus shared mos-app/src/index.css; local CSS: mos-app/src/pages/kitchen-review-page.css
- Collection grammar: route-local collection/view state is present; presentations: Table; owns view state: yes
- Record opening: default not observed; direct full canonical page when URL is explicit; phone full-screen record mode
- Overlays: none observed; states: default, empty, error/retry, loading, permission/read-only; CSS families: mos-app/src/index.css, mos-app/src/pages/kitchen-review-page.css
- Notes: RequireAccessRole ops_lead/admin.

### `/cafe/stock`
- Kind/status/auth: page / canonical / protected
- Component/source: KitchenStockPage — `mos-app/src/pages/kitchen-stock-page.tsx` :: `KitchenStockPage`; router literal `cafe/stock`
- Page family/frame/head: workspace / shared-page-frame / shared-page-head
- Typography/spacing source: route-local CSS plus shared mos-app/src/index.css; local CSS: mos-app/src/pages/kitchen-stock-page.css
- Collection grammar: route-local collection/view state is present; presentations: Table; owns view state: yes
- Record opening: default not observed; direct full canonical page when URL is explicit; phone full-screen record mode
- Overlays: centered search/command candidate; states: default, empty, error/retry, loading; CSS families: mos-app/src/index.css, mos-app/src/pages/kitchen-stock-page.css
- Notes: —

### `/dashboard`
- Kind/status/auth: redirect / redirect / protected
- Component/source: SearchRedirect — `mos-app/src/router.tsx` :: `SearchRedirect`; router literal `dashboard`
- Page family/frame/head: not-applicable / not-applicable / not-applicable
- Typography/spacing source: router redirect declaration; local CSS: —
- Collection grammar: not-applicable; presentations: —; owns view state: no
- Record opening: default not-applicable; direct not-applicable; phone not-applicable
- Overlays: —; states: —; CSS families: —
- Notes: Legacy alias to /money.

### `/dashboard/detail`
- Kind/status/auth: redirect / redirect / protected
- Component/source: SearchRedirect — `mos-app/src/router.tsx` :: `SearchRedirect`; router literal `dashboard/detail`
- Page family/frame/head: not-applicable / not-applicable / not-applicable
- Typography/spacing source: router redirect declaration; local CSS: —
- Collection grammar: not-applicable; presentations: —; owns view state: no
- Record opening: default not-applicable; direct not-applicable; phone not-applicable
- Overlays: —; states: —; CSS families: —
- Notes: Legacy alias to /money/detail.

### `/dev/ui`
- Kind/status/auth: dev-only / conditional / dev
- Component/source: UiGallery — `mos-app/src/pages/ui-gallery.tsx` :: `UiGallery`; router literal `/dev/ui`
- Page family/frame/head: not-applicable / bespoke-or-missing / bespoke-or-missing
- Typography/spacing source: shared mos-app/src/index.css and DESIGN.md; local CSS: —
- Collection grammar: page-local or not observed; presentations: —; owns view state: no
- Record opening: default not observed; direct full canonical page when URL is explicit; phone full-screen record mode
- Overlays: none observed; states: default, error/retry, permission/read-only; CSS families: mos-app/src/index.css
- Notes: DEV-only bare route; no AppShell.

### `/dev/views`
- Kind/status/auth: dev-only / conditional / dev
- Component/source: DevViewsPage — `mos-app/src/pages/dev-views-page.tsx` :: `DevViewsPage`; router literal `dev/views`
- Page family/frame/head: not-applicable / shared-page-frame / bespoke-or-missing
- Typography/spacing source: route-local CSS plus shared mos-app/src/index.css; local CSS: mos-app/src/pages/dev-views-page.css
- Collection grammar: route-local collection/view state is present; presentations: Table; owns view state: yes
- Record opening: default current split/right panel host; direct full canonical page when URL is explicit; phone full-screen record mode
- Overlays: record drawer/panel; states: default, saving/saved, validation; CSS families: mos-app/src/index.css, mos-app/src/pages/dev-views-page.css
- Notes: DEV + SHOW_USER_VIEWS; AppShell route.

### `/dev/views/:viewId`
- Kind/status/auth: dev-only / conditional / dev
- Component/source: DevViewsPage — `mos-app/src/pages/dev-views-page.tsx` :: `DevViewsPage`; router literal `dev/views/:viewId`
- Page family/frame/head: not-applicable / shared-page-frame / bespoke-or-missing
- Typography/spacing source: route-local CSS plus shared mos-app/src/index.css; local CSS: mos-app/src/pages/dev-views-page.css
- Collection grammar: route-local collection/view state is present; presentations: Table; owns view state: yes
- Record opening: default current split/right panel host; direct full canonical page when URL is explicit; phone full-screen record mode
- Overlays: record drawer/panel; states: default, saving/saved, validation; CSS families: mos-app/src/index.css, mos-app/src/pages/dev-views-page.css
- Notes: DEV + SHOW_USER_VIEWS; AppShell route.

### `/ecommerce`
- Kind/status/auth: page / canonical / protected
- Component/source: SliceStubPage — `mos-app/src/pages/slice-stub-page.tsx` :: `SliceStubPage`; router literal `ecommerce`
- Page family/frame/head: workspace / shared-page-frame / shared-page-head
- Typography/spacing source: shared mos-app/src/index.css and DESIGN.md; local CSS: —
- Collection grammar: page-local or not observed; presentations: page-local / not observed; owns view state: no
- Record opening: default not observed; direct full canonical page when URL is explicit; phone full-screen record mode
- Overlays: none observed; states: default; CSS families: mos-app/src/index.css
- Notes: Stub destination; jobKey job.ecommerce.

### `/events`
- Kind/status/auth: page / canonical / protected
- Component/source: EventsPage — `mos-app/src/pages/events-page.tsx` :: `EventsPage`; router literal `events`
- Page family/frame/head: workspace / shared-page-frame / shared-page-head
- Typography/spacing source: shared mos-app/src/index.css and DESIGN.md; local CSS: —
- Collection grammar: page-local or not observed; presentations: page-local / not observed; owns view state: no
- Record opening: default not observed; direct full canonical page when URL is explicit; phone full-screen record mode
- Overlays: none observed; states: default, empty; CSS families: mos-app/src/index.css
- Notes: —

### `/inbox`
- Kind/status/auth: page / canonical / protected
- Component/source: InboxPage — `mos-app/src/pages/inbox-page.tsx` :: `InboxPage`; router literal `inbox`
- Page family/frame/head: workspace / shared-page-frame / shared-page-head
- Typography/spacing source: shared mos-app/src/index.css and DESIGN.md; local CSS: —
- Collection grammar: page-local or not observed; presentations: page-local / not observed; owns view state: no
- Record opening: default not observed; direct full canonical page when URL is explicit; phone full-screen record mode
- Overlays: none observed; states: default, error/retry, loading; CSS families: mos-app/src/index.css
- Notes: Current Inbox All/Unread/Handled behavior is retained as lost-good evidence.

### `/kitchen`
- Kind/status/auth: redirect / redirect / protected
- Component/source: Navigate — `mos-app/src/router.tsx` :: `Navigate`; router literal `kitchen`
- Page family/frame/head: not-applicable / not-applicable / not-applicable
- Typography/spacing source: router redirect declaration; local CSS: —
- Collection grammar: not-applicable; presentations: —; owns view state: no
- Record opening: default not-applicable; direct not-applicable; phone not-applicable
- Overlays: —; states: —; CSS families: —
- Notes: Legacy alias to /cafe.

### `/kitchen/log`
- Kind/status/auth: redirect / redirect / protected
- Component/source: SearchRedirect — `mos-app/src/router.tsx` :: `SearchRedirect`; router literal `kitchen/log`
- Page family/frame/head: not-applicable / not-applicable / not-applicable
- Typography/spacing source: router redirect declaration; local CSS: —
- Collection grammar: not-applicable; presentations: —; owns view state: no
- Record opening: default not-applicable; direct not-applicable; phone not-applicable
- Overlays: —; states: —; CSS families: —
- Notes: Legacy alias to /cafe/log.

### `/kitchen/plan`
- Kind/status/auth: redirect / redirect / protected
- Component/source: SearchRedirect — `mos-app/src/router.tsx` :: `SearchRedirect`; router literal `kitchen/plan`
- Page family/frame/head: not-applicable / not-applicable / not-applicable
- Typography/spacing source: router redirect declaration; local CSS: —
- Collection grammar: not-applicable; presentations: —; owns view state: no
- Record opening: default not-applicable; direct not-applicable; phone not-applicable
- Overlays: —; states: —; CSS families: —
- Notes: Legacy alias to /cafe/plan.

### `/kitchen/pushes`
- Kind/status/auth: redirect / redirect / protected
- Component/source: SearchRedirect — `mos-app/src/router.tsx` :: `SearchRedirect`; router literal `kitchen/pushes`
- Page family/frame/head: not-applicable / not-applicable / not-applicable
- Typography/spacing source: router redirect declaration; local CSS: —
- Collection grammar: not-applicable; presentations: —; owns view state: no
- Record opening: default not-applicable; direct not-applicable; phone not-applicable
- Overlays: —; states: —; CSS families: —
- Notes: Legacy alias to /cafe/pushes.

### `/kitchen/review`
- Kind/status/auth: redirect / redirect / protected
- Component/source: SearchRedirect — `mos-app/src/router.tsx` :: `SearchRedirect`; router literal `kitchen/review`
- Page family/frame/head: not-applicable / not-applicable / not-applicable
- Typography/spacing source: router redirect declaration; local CSS: —
- Collection grammar: not-applicable; presentations: —; owns view state: no
- Record opening: default not-applicable; direct not-applicable; phone not-applicable
- Overlays: —; states: —; CSS families: —
- Notes: Legacy alias to /cafe/review.

### `/kitchen/stock`
- Kind/status/auth: redirect / redirect / protected
- Component/source: SearchRedirect — `mos-app/src/router.tsx` :: `SearchRedirect`; router literal `kitchen/stock`
- Page family/frame/head: not-applicable / not-applicable / not-applicable
- Typography/spacing source: router redirect declaration; local CSS: —
- Collection grammar: not-applicable; presentations: —; owns view state: no
- Record opening: default not-applicable; direct not-applicable; phone not-applicable
- Overlays: —; states: —; CSS families: —
- Notes: Legacy alias to /cafe/stock.

### `/login`
- Kind/status/auth: page / canonical / public
- Component/source: LoginPage — `mos-app/src/pages/login-page.tsx` :: `LoginPage`; router literal `/login`
- Page family/frame/head: not-applicable / bespoke-or-missing / bespoke-or-missing
- Typography/spacing source: shared mos-app/src/index.css and DESIGN.md; local CSS: —
- Collection grammar: route-local collection/view state is present; presentations: —; owns view state: yes
- Record opening: default not observed; direct full canonical page when URL is explicit; phone full-screen record mode
- Overlays: centered search/command candidate; states: default, error/retry, loading, permission/read-only, validation; CSS families: mos-app/src/index.css
- Notes: —

### `/money`
- Kind/status/auth: page / canonical / role-gated
- Component/source: DashboardPage — `mos-app/src/pages/dashboard-page.tsx` :: `DashboardPage`; router literal `money`
- Page family/frame/head: workspace / shared-page-frame / shared-page-head
- Typography/spacing source: route-local CSS plus shared mos-app/src/index.css; local CSS: mos-app/src/pages/dashboard-page.css
- Collection grammar: route-local collection/view state is present; presentations: Table; owns view state: yes
- Record opening: default not observed; direct full canonical page when URL is explicit; phone full-screen record mode
- Overlays: centered search/command candidate; states: default, empty, error/retry, loading; CSS families: mos-app/src/index.css, mos-app/src/pages/dashboard-page.css
- Notes: RequireAccessRole finance/admin.

### `/money/budget`
- Kind/status/auth: page / conditional / role-gated
- Component/source: BudgetPage — `mos-app/src/pages/budget-page.tsx` :: `BudgetPage`; router literal `money/budget`
- Page family/frame/head: workspace / shared-page-frame / shared-page-head
- Typography/spacing source: route-local CSS plus shared mos-app/src/index.css; local CSS: mos-app/src/pages/budget-page.css
- Collection grammar: route-local collection/view state is present; presentations: page-local / not observed; owns view state: yes
- Record opening: default not observed; direct full canonical page when URL is explicit; phone full-screen record mode
- Overlays: anchored menu/picker candidate; states: default, empty, error/retry, loading, permission/read-only, saving/saved, validation; CSS families: mos-app/src/index.css, mos-app/src/pages/budget-page.css
- Notes: SHOW_PLAN_BUDGET flag plus finance/admin role gate.

### `/money/detail`
- Kind/status/auth: page / canonical / role-gated
- Component/source: DashboardPage — `mos-app/src/pages/dashboard-page.tsx` :: `DashboardPage`; router literal `money/detail`
- Page family/frame/head: workspace / shared-page-frame / shared-page-head
- Typography/spacing source: route-local CSS plus shared mos-app/src/index.css; local CSS: mos-app/src/pages/dashboard-page.css
- Collection grammar: route-local collection/view state is present; presentations: Table; owns view state: yes
- Record opening: default not observed; direct full canonical page when URL is explicit; phone full-screen record mode
- Overlays: centered search/command candidate; states: default, empty, error/retry, loading; CSS families: mos-app/src/index.css, mos-app/src/pages/dashboard-page.css
- Notes: DashboardPage defaultTab=detail; RequireAccessRole finance/admin.

### `/money/follow-ups`
- Kind/status/auth: page / conditional / role-gated
- Component/source: FollowUpsPage — `mos-app/src/pages/follow-ups-page.tsx` :: `FollowUpsPage`; router literal `money/follow-ups`
- Page family/frame/head: focused-record / shared-page-frame / shared-page-head
- Typography/spacing source: shared mos-app/src/index.css and DESIGN.md; local CSS: —
- Collection grammar: route-local collection/view state is present; presentations: —; owns view state: yes
- Record opening: default full canonical record page or hosted drawer; direct full canonical page; phone full-screen record mode
- Overlays: none observed; states: default, saving/saved; CSS families: mos-app/src/index.css
- Notes: SHOW_FOLLOWUPS flag plus finance/admin role gate.

### `/money/pricing`
- Kind/status/auth: page / conditional / role-gated
- Component/source: PricingPage — `mos-app/src/pages/pricing-page.tsx` :: `PricingPage`; router literal `money/pricing`
- Page family/frame/head: workspace / shared-page-frame / shared-page-head
- Typography/spacing source: route-local CSS plus shared mos-app/src/index.css; local CSS: mos-app/src/pages/pricing-page.css
- Collection grammar: page-local or not observed; presentations: page-local / not observed; owns view state: no
- Record opening: default not observed; direct full canonical page when URL is explicit; phone full-screen record mode
- Overlays: none observed; states: default, empty, error/retry, loading; CSS families: mos-app/src/index.css, mos-app/src/pages/pricing-page.css
- Notes: SHOW_PLAN_BUDGET flag plus finance/admin role gate.

### `/objectives`
- Kind/status/auth: redirect / redirect / protected
- Component/source: SearchRedirect — `mos-app/src/router.tsx` :: `SearchRedirect`; router literal `objectives`
- Page family/frame/head: not-applicable / not-applicable / not-applicable
- Typography/spacing source: router redirect declaration; local CSS: —
- Collection grammar: not-applicable; presentations: —; owns view state: no
- Record opening: default not-applicable; direct not-applicable; phone not-applicable
- Overlays: —; states: —; CSS families: —
- Notes: Legacy alias to /work/objectives.

### `/ops`
- Kind/status/auth: redirect / redirect / protected
- Component/source: Navigate — `mos-app/src/router.tsx` :: `Navigate`; router literal `ops`
- Page family/frame/head: not-applicable / not-applicable / not-applicable
- Typography/spacing source: router redirect declaration; local CSS: —
- Collection grammar: not-applicable; presentations: —; owns view state: no
- Record opening: default not-applicable; direct not-applicable; phone not-applicable
- Overlays: —; states: —; CSS families: —
- Notes: Legacy alias to /.

### `/ops/:id/edit`
- Kind/status/auth: redirect / redirect / protected
- Component/source: Navigate — `mos-app/src/router.tsx` :: `Navigate`; router literal `ops/:id/edit`
- Page family/frame/head: not-applicable / not-applicable / not-applicable
- Typography/spacing source: router redirect declaration; local CSS: —
- Collection grammar: not-applicable; presentations: —; owns view state: no
- Record opening: default not-applicable; direct not-applicable; phone not-applicable
- Overlays: —; states: —; CSS families: —
- Notes: Legacy alias to /.

### `/ops/new`
- Kind/status/auth: redirect / redirect / protected
- Component/source: Navigate — `mos-app/src/router.tsx` :: `Navigate`; router literal `ops/new`
- Page family/frame/head: not-applicable / not-applicable / not-applicable
- Typography/spacing source: router redirect declaration; local CSS: —
- Collection grammar: not-applicable; presentations: —; owns view state: no
- Record opening: default not-applicable; direct not-applicable; phone not-applicable
- Overlays: —; states: —; CSS families: —
- Notes: Legacy alias to /.

### `/plan/budget`
- Kind/status/auth: redirect / redirect / protected
- Component/source: SearchRedirect — `mos-app/src/router.tsx` :: `SearchRedirect`; router literal `plan/budget`
- Page family/frame/head: not-applicable / not-applicable / not-applicable
- Typography/spacing source: router redirect declaration; local CSS: —
- Collection grammar: not-applicable; presentations: —; owns view state: no
- Record opening: default not-applicable; direct not-applicable; phone not-applicable
- Overlays: —; states: —; CSS families: —
- Notes: Legacy alias to /money/budget.

### `/plan/pricing`
- Kind/status/auth: redirect / redirect / protected
- Component/source: SearchRedirect — `mos-app/src/router.tsx` :: `SearchRedirect`; router literal `plan/pricing`
- Page family/frame/head: not-applicable / not-applicable / not-applicable
- Typography/spacing source: router redirect declaration; local CSS: —
- Collection grammar: not-applicable; presentations: —; owns view state: no
- Record opening: default not-applicable; direct not-applicable; phone not-applicable
- Overlays: —; states: —; CSS families: —
- Notes: Legacy alias to /money/pricing.

### `/profile`
- Kind/status/auth: page / canonical / protected
- Component/source: ProfilePage — `mos-app/src/pages/profile-page.tsx` :: `ProfilePage`; router literal `profile`
- Page family/frame/head: management / shared-page-frame / shared-page-head
- Typography/spacing source: shared mos-app/src/index.css and DESIGN.md; local CSS: —
- Collection grammar: page-local or not observed; presentations: —; owns view state: no
- Record opening: default not observed; direct full canonical page when URL is explicit; phone full-screen record mode
- Overlays: none observed; states: default; CSS families: mos-app/src/index.css
- Notes: Language selection lives here.

### `/projects-processes`
- Kind/status/auth: redirect / redirect / protected
- Component/source: SearchRedirect — `mos-app/src/router.tsx` :: `SearchRedirect`; router literal `projects-processes`
- Page family/frame/head: not-applicable / not-applicable / not-applicable
- Typography/spacing source: router redirect declaration; local CSS: —
- Collection grammar: not-applicable; presentations: —; owns view state: no
- Record opening: default not-applicable; direct not-applicable; phone not-applicable
- Overlays: —; states: —; CSS families: —
- Notes: Legacy alias to /work/projects.

### `/recovery`
- Kind/status/auth: page / canonical / public
- Component/source: RecoveryPage — `mos-app/src/pages/recovery-page.tsx` :: `RecoveryPage`; router literal `/recovery`
- Page family/frame/head: not-applicable / bespoke-or-missing / bespoke-or-missing
- Typography/spacing source: shared mos-app/src/index.css and DESIGN.md; local CSS: —
- Collection grammar: route-local collection/view state is present; presentations: —; owns view state: yes
- Record opening: default not observed; direct full canonical page when URL is explicit; phone full-screen record mode
- Overlays: centered search/command candidate; states: default, error/retry, loading, permission/read-only, validation; CSS families: mos-app/src/index.css
- Notes: —

### `/roastery`
- Kind/status/auth: page / canonical / protected
- Component/source: SliceStubPage — `mos-app/src/pages/slice-stub-page.tsx` :: `SliceStubPage`; router literal `roastery`
- Page family/frame/head: workspace / shared-page-frame / shared-page-head
- Typography/spacing source: shared mos-app/src/index.css and DESIGN.md; local CSS: —
- Collection grammar: page-local or not observed; presentations: page-local / not observed; owns view state: no
- Record opening: default not observed; direct full canonical page when URL is explicit; phone full-screen record mode
- Overlays: none observed; states: default; CSS families: mos-app/src/index.css
- Notes: Stub destination; jobKey job.roastery.

### `/sales`
- Kind/status/auth: redirect / redirect / protected
- Component/source: SearchRedirect — `mos-app/src/router.tsx` :: `SearchRedirect`; router literal `sales`
- Page family/frame/head: not-applicable / not-applicable / not-applicable
- Typography/spacing source: router redirect declaration; local CSS: —
- Collection grammar: not-applicable; presentations: —; owns view state: no
- Record opening: default not-applicable; direct not-applicable; phone not-applicable
- Overlays: —; states: —; CSS families: —
- Notes: Legacy alias to /money.

### `/tasks`
- Kind/status/auth: redirect / redirect / protected
- Component/source: SearchRedirect — `mos-app/src/router.tsx` :: `SearchRedirect`; router literal `tasks`
- Page family/frame/head: not-applicable / not-applicable / not-applicable
- Typography/spacing source: router redirect declaration; local CSS: —
- Collection grammar: not-applicable; presentations: —; owns view state: no
- Record opening: default not-applicable; direct not-applicable; phone not-applicable
- Overlays: —; states: —; CSS families: —
- Notes: Legacy alias to /work/tasks.

### `/tasks/:taskId`
- Kind/status/auth: redirect / redirect / protected
- Component/source: TasksIdRedirect — `mos-app/src/router.tsx` :: `TasksIdRedirect`; router literal `tasks/:taskId`
- Page family/frame/head: not-applicable / not-applicable / not-applicable
- Typography/spacing source: router redirect declaration; local CSS: —
- Collection grammar: not-applicable; presentations: —; owns view state: no
- Record opening: default not-applicable; direct not-applicable; phone not-applicable
- Overlays: —; states: —; CSS families: —
- Notes: Legacy alias preserves taskId and query.

### `/tasks/new`
- Kind/status/auth: redirect / redirect / protected
- Component/source: SearchRedirect — `mos-app/src/router.tsx` :: `SearchRedirect`; router literal `tasks/new`
- Page family/frame/head: not-applicable / not-applicable / not-applicable
- Typography/spacing source: router redirect declaration; local CSS: —
- Collection grammar: not-applicable; presentations: —; owns view state: no
- Record opening: default not-applicable; direct not-applicable; phone not-applicable
- Overlays: —; states: —; CSS families: —
- Notes: Legacy alias to /work/tasks/new.

### `/updates`
- Kind/status/auth: redirect / redirect / protected
- Component/source: Navigate — `mos-app/src/router.tsx` :: `Navigate`; router literal `updates`
- Page family/frame/head: not-applicable / not-applicable / not-applicable
- Typography/spacing source: router redirect declaration; local CSS: —
- Collection grammar: not-applicable; presentations: —; owns view state: no
- Record opening: default not-applicable; direct not-applicable; phone not-applicable
- Overlays: —; states: —; CSS families: —
- Notes: Legacy alias to /work/signals.

### `/work`
- Kind/status/auth: redirect / redirect / protected
- Component/source: Navigate — `mos-app/src/router.tsx` :: `Navigate`; router literal `work`
- Page family/frame/head: not-applicable / not-applicable / not-applicable
- Typography/spacing source: router redirect declaration; local CSS: —
- Collection grammar: not-applicable; presentations: —; owns view state: no
- Record opening: default not-applicable; direct not-applicable; phone not-applicable
- Overlays: —; states: —; CSS families: —
- Notes: Canonical work entry redirects to /work/tasks.

### `/work/cascade`
- Kind/status/auth: redirect / redirect / protected
- Component/source: Navigate — `mos-app/src/router.tsx` :: `Navigate`; router literal `work/cascade`
- Page family/frame/head: not-applicable / not-applicable / not-applicable
- Typography/spacing source: router redirect declaration; local CSS: —
- Collection grammar: not-applicable; presentations: —; owns view state: no
- Record opening: default not-applicable; direct not-applicable; phone not-applicable
- Overlays: —; states: —; CSS families: —
- Notes: Legacy cascade entry redirects to /work/tasks.

### `/work/follow-ups`
- Kind/status/auth: redirect / redirect / protected
- Component/source: Navigate — `mos-app/src/router.tsx` :: `Navigate`; router literal `work/follow-ups`
- Page family/frame/head: not-applicable / not-applicable / not-applicable
- Typography/spacing source: router redirect declaration; local CSS: —
- Collection grammar: not-applicable; presentations: —; owns view state: no
- Record opening: default not-applicable; direct not-applicable; phone not-applicable
- Overlays: —; states: —; CSS families: —
- Notes: Preserves query and redirects to /work/tasks?view=followups.

### `/work/follow-ups/:id`
- Kind/status/auth: page / conditional / protected
- Component/source: FollowUpsPage — `mos-app/src/pages/follow-ups-page.tsx` :: `FollowUpsPage`; router literal `work/follow-ups/:id`
- Page family/frame/head: focused-record / shared-page-frame / shared-page-head
- Typography/spacing source: shared mos-app/src/index.css and DESIGN.md; local CSS: —
- Collection grammar: route-local collection/view state is present; presentations: —; owns view state: yes
- Record opening: default full canonical record page or hosted drawer; direct full canonical page; phone full-screen record mode
- Overlays: none observed; states: default, saving/saved; CSS families: mos-app/src/index.css
- Notes: SHOW_FOLLOWUPS controls page versus redirect to /.

### `/work/objectives`
- Kind/status/auth: page / canonical / capability-gated
- Component/source: ObjectivesPage — `mos-app/src/pages/objectives-page.tsx` :: `ObjectivesPage`; router literal `work/objectives`
- Page family/frame/head: management / shared-page-frame / shared-page-head
- Typography/spacing source: shared mos-app/src/index.css and DESIGN.md; local CSS: —
- Collection grammar: route-local collection/view state is present; presentations: —; owns view state: yes
- Record opening: default not observed; direct full canonical page when URL is explicit; phone full-screen record mode
- Overlays: none observed; states: default, empty, error/retry, loading, permission/read-only, saving/saved, validation; CSS families: mos-app/src/index.css
- Notes: RequireCapability objective.manage.

### `/work/projects`
- Kind/status/auth: page / canonical / capability-gated
- Component/source: ProjectsProcessesPage — `mos-app/src/pages/projects-processes-page.tsx` :: `ProjectsProcessesPage`; router literal `work/projects`
- Page family/frame/head: management / shared-page-frame / shared-page-head
- Typography/spacing source: shared mos-app/src/index.css and DESIGN.md; local CSS: —
- Collection grammar: route-local collection/view state is present; presentations: —; owns view state: yes
- Record opening: default not observed; direct full canonical page when URL is explicit; phone full-screen record mode
- Overlays: none observed; states: default, empty, error/retry, loading, permission/read-only, saving/saved, validation; CSS families: mos-app/src/index.css
- Notes: RequireCapability workline.manage.

### `/work/projects-processes`
- Kind/status/auth: redirect / redirect / protected
- Component/source: SearchRedirect — `mos-app/src/router.tsx` :: `SearchRedirect`; router literal `work/projects-processes`
- Page family/frame/head: not-applicable / not-applicable / not-applicable
- Typography/spacing source: router redirect declaration; local CSS: —
- Collection grammar: not-applicable; presentations: —; owns view state: no
- Record opening: default not-applicable; direct not-applicable; phone not-applicable
- Overlays: —; states: —; CSS families: —
- Notes: Legacy workline path redirects to /work/projects.

### `/work/signals`
- Kind/status/auth: page / canonical / protected
- Component/source: SignalsArchivePage — `mos-app/src/pages/signals-archive-page.tsx` :: `SignalsArchivePage`; router literal `work/signals`
- Page family/frame/head: workspace / shared-page-frame / shared-page-head
- Typography/spacing source: route-local CSS plus shared mos-app/src/index.css; local CSS: mos-app/src/pages/signals-archive-page.css
- Collection grammar: route-local collection/view state is present; presentations: page-local / not observed; owns view state: yes
- Record opening: default not observed; direct full canonical page when URL is explicit; phone full-screen record mode
- Overlays: centered search/command candidate; states: default, empty, error/retry, loading, saving/saved; CSS families: mos-app/src/index.css, mos-app/src/pages/signals-archive-page.css
- Notes: Signal collection supports ?record drawer state in current host.

### `/work/signals/:signalId`
- Kind/status/auth: page / canonical / protected
- Component/source: SignalRecordPage — `mos-app/src/pages/signals-archive-page.tsx` :: `SignalRecordPage`; router literal `work/signals/:signalId`
- Page family/frame/head: focused-record / shared-page-frame / shared-page-head
- Typography/spacing source: route-local CSS plus shared mos-app/src/index.css; local CSS: mos-app/src/pages/signals-archive-page.css
- Collection grammar: route-local collection/view state is present; presentations: —; owns view state: yes
- Record opening: default full canonical record page or hosted drawer; direct full canonical page; phone full-screen record mode
- Overlays: centered search/command candidate; states: default, empty, error/retry, loading, saving/saved; CSS families: mos-app/src/index.css, mos-app/src/pages/signals-archive-page.css
- Notes: —

### `/work/tasks`
- Kind/status/auth: page / canonical / protected
- Component/source: TasksLayout — `mos-app/src/pages/tasks-layout.tsx` :: `TasksLayout`; router literal `work/tasks`
- Page family/frame/head: workspace / shared-page-frame / shared-page-head
- Typography/spacing source: shared mos-app/src/index.css and DESIGN.md; local CSS: —
- Collection grammar: route-local collection/view state is present; presentations: Table + triage queue; owns view state: yes
- Record opening: default current split/right panel host; direct full canonical page when URL is explicit; phone full-screen record mode
- Overlays: record drawer/panel; states: default, loading; CSS families: mos-app/src/index.css
- Notes: Collection host with nested TaskDrawer outlet.

### `/work/tasks/:taskId`
- Kind/status/auth: page / canonical / protected
- Component/source: TaskDrawer — `mos-app/src/components/tasks/task-drawer.tsx` :: `TaskDrawer`; router literal `:taskId`
- Page family/frame/head: focused-record / bespoke-or-missing / bespoke-or-missing
- Typography/spacing source: shared mos-app/src/index.css and DESIGN.md; local CSS: —
- Collection grammar: route-local collection/view state is present; presentations: —; owns view state: yes
- Record opening: default full canonical record page or hosted drawer; direct full canonical page; phone full-screen record mode
- Overlays: centered search/command candidate, record drawer/panel; states: default; CSS families: mos-app/src/index.css
- Notes: View mode hosted under the TasksLayout collection.

### `/work/tasks/new`
- Kind/status/auth: page / canonical / protected
- Component/source: TaskDrawer — `mos-app/src/components/tasks/task-drawer.tsx` :: `TaskDrawer`; router literal `new`
- Page family/frame/head: focused-record / bespoke-or-missing / bespoke-or-missing
- Typography/spacing source: shared mos-app/src/index.css and DESIGN.md; local CSS: —
- Collection grammar: route-local collection/view state is present; presentations: —; owns view state: yes
- Record opening: default full canonical record page or hosted drawer; direct full canonical page; phone full-screen record mode
- Overlays: centered search/command candidate, record drawer/panel; states: default; CSS families: mos-app/src/index.css
- Notes: Create mode hosted under the TasksLayout collection.

## Shared component jobs and duplicate evidence

| Job | Canonical sources | Raw/duplicate consumers | State coverage |
| --- | --- | --- | --- |
| button | mos-app/src/components/ui/button.tsx :: Button | mos-app/src/components/ui/icon-button.tsx :: IconButton<br>mos-app/src/components/ui/text-input.tsx :: TextInput | default, disabled, loading/error consumer-owned |
| collection-view | mos-app/src/components/tasks/tasks-workspace.tsx :: TasksWorkspace | mos-app/src/components/admin/user-table.tsx :: UserTable<br>mos-app/src/components/dashboard/data-table.tsx :: DataTable<br>mos-app/src/components/inbox/InboxList.tsx :: InboxList<br>mos-app/src/components/signals/signal-feed.tsx :: SignalFeed | filter, group, saved view, search, selection, sort |
| dialog | mos-app/src/components/ui/confirm-dialog.tsx :: ConfirmDialog | mos-app/src/components/admin/confirm-dialog.tsx :: ConfirmDialog | close/Escape, confirming, error, open |
| drawer-or-panel | mos-app/src/shell/record-panel-host.tsx :: RecordPanelHost | mos-app/src/components/assistant/AssistantPanel.tsx :: AssistantPanel<br>mos-app/src/components/tasks/task-drawer.tsx :: TaskDrawer<br>mos-app/src/shell/mobile-drawer.tsx :: MobileDrawer | focus entry/return, open, phone full-screen, stack/back |
| menu | mos-app/src/components/command/command-menu.tsx :: CommandMenu | mos-app/src/components/admin/user-table.tsx :: PersonActionMenu<br>mos-app/src/components/tasks/row-menu.tsx :: RowMenu | close/Escape, keyboard focus, open |
| navigation | mos-app/src/shell/rail-nav.tsx :: RailNav | mos-app/src/shell/bottom-tab-bar.tsx :: BottomTabBar<br>mos-app/src/shell/mobile-drawer.tsx :: MobileDrawer<br>mos-app/src/shell/top-bar.tsx :: TopBar | active, aria-current, mobile disclosure, role-aware destinations |
| page-frame | mos-app/src/shell/page-frame.tsx :: PageFrame | mos-app/src/components/dashboard/global-toolbar.tsx :: GlobalToolbar<br>mos-app/src/components/tasks/tasks-workspace.tsx :: TasksWorkspace | full-width, prose, surface wash |
| page-head | mos-app/src/shell/page-head.tsx :: PageHead | mos-app/src/components/tasks/task-drawer-header.tsx :: TaskDrawerHeader | actions, context, responsive collapse, title |
| record-renderer | mos-app/src/components/signals/signal-record-host.tsx :: SignalRecordHost<br>mos-app/src/components/tasks/task-surface.tsx :: TaskSurface | mos-app/src/components/tasks/record-details-panel.tsx :: RecordDetailsPanel<br>mos-app/src/components/tasks/record-feed.tsx :: RecordFeed | edit, error, read, read-only, saved, saving |
| select | mos-app/src/components/ui/select.tsx :: Select | mos-app/src/components/ui/view-tabs.tsx :: ViewTabs | default, disabled, selected |
| state-kit | mos-app/src/components/ui/state-kit.tsx :: EmptyState<br>mos-app/src/components/ui/state-kit.tsx :: ErrorState<br>mos-app/src/components/ui/state-kit.tsx :: LoadingShell<br>mos-app/src/components/ui/state-kit.tsx :: SkeletonRows | mos-app/src/components/ErrorFallback.tsx :: ErrorFallback | empty, error/retry, loading, permission/read-only consumers |
| table-or-list | mos-app/src/components/dashboard/data-table.tsx :: DataTable | mos-app/src/components/admin/user-table.tsx :: UserTable<br>mos-app/src/components/inbox/InboxList.tsx :: InboxList<br>mos-app/src/components/signals/signal-feed.tsx :: SignalFeed<br>mos-app/src/components/tasks/tasks-workspace.tsx :: TasksWorkspace | default, empty, error, filtered-empty, loading |
| typography-and-spacing | DESIGN.md :: E7<br>mos-app/src/index.css :: --ds- | mos-app/src/components/ui/CardHead.css :: font-size<br>mos-app/src/components/ui/Tag.css :: padding | local literal debt, semantic role tokens |

## CSS family and literal scan

| CSS family | Scope | Literal counts | Breakpoints |
| --- | --- | --- | --- |
| mos-app/src/components/admin/people-toolbar.css | components | font-size:3, line-height:0, padding:4, margin:0, gap:2, width:8, height:2 | @media (max-width: 767px) |
| mos-app/src/components/cafe/cafe-opening-panel.css | components | font-size:2, line-height:0, padding:0, margin:2, gap:2, width:0, height:0 | — |
| mos-app/src/components/command/command-menu.css | components | font-size:7, line-height:0, padding:8, margin:1, gap:3, width:6, height:4 | @media (max-width: 600px) |
| mos-app/src/components/dashboard/basis-chip.css | components | font-size:1, line-height:1, padding:1, margin:0, gap:1, width:1, height:2 | — |
| mos-app/src/components/dashboard/chart-frame.css | components | font-size:3, line-height:0, padding:4, margin:3, gap:4, width:3, height:5 | @media (max-width: 767px) |
| mos-app/src/components/dashboard/cut-toggle.css | components | font-size:1, line-height:0, padding:2, margin:0, gap:1, width:2, height:4 | @media (max-width: 767.98px), @media (prefers-reduced-motion: reduce) |
| mos-app/src/components/dashboard/data-table.css | components | font-size:14, line-height:0, padding:14, margin:5, gap:7, width:6, height:10 | @media (prefers-reduced-motion: reduce), @media (prefers-reduced-motion: reduce) |
| mos-app/src/components/dashboard/dq-badge.css | components | font-size:1, line-height:1, padding:1, margin:0, gap:1, width:2, height:3 | — |
| mos-app/src/components/dashboard/freshness-label.css | components | font-size:1, line-height:0, padding:0, margin:0, gap:0, width:0, height:0 | — |
| mos-app/src/components/dashboard/global-toolbar.css | components | font-size:1, line-height:0, padding:2, margin:0, gap:3, width:2, height:1 | @media (max-width: 767px) |
| mos-app/src/components/dashboard/kpi-tile.css | components | font-size:6, line-height:1, padding:1, margin:0, gap:3, width:4, height:2 | @media (min-width: 960px), @media (prefers-reduced-motion: reduce) |
| mos-app/src/components/dashboard/whats-coming-strip.css | components | font-size:5, line-height:0, padding:3, margin:0, gap:4, width:3, height:1 | @media (max-width: 1279px), @media (max-width: 767px) |
| mos-app/src/components/dashboard/window-selector.css | components | font-size:3, line-height:0, padding:4, margin:0, gap:3, width:2, height:5 | @media (max-width: 767.98px), @media (prefers-reduced-motion: reduce) |
| mos-app/src/components/home/attention-brief.css | components | font-size:7, line-height:1, padding:4, margin:3, gap:6, width:6, height:5 | — |
| mos-app/src/components/inbox/inbox.css | components | font-size:9, line-height:6, padding:7, margin:6, gap:9, width:4, height:10 | — |
| mos-app/src/components/kitchen/action-type-seg.css | components | font-size:1, line-height:0, padding:2, margin:0, gap:1, width:4, height:1 | @media (max-width: 400px), @media (prefers-reduced-motion: reduce) |
| mos-app/src/components/kitchen/kitchen-kpi-strip.css | components | font-size:4, line-height:1, padding:2, margin:0, gap:3, width:7, height:1 | @media (max-width: 959px) and (min-width: 768px) |
| mos-app/src/components/kitchen/kitchen-toolbar.css | components | font-size:2, line-height:0, padding:2, margin:0, gap:1, width:2, height:1 | — |
| mos-app/src/components/kitchen/plan-qty-cell.css | components | font-size:4, line-height:1, padding:2, margin:0, gap:3, width:2, height:3 | @media (prefers-reduced-motion: reduce) |
| mos-app/src/components/kitchen/plan-qty-stepper.css | components | font-size:4, line-height:1, padding:1, margin:0, gap:2, width:2, height:3 | — |
| mos-app/src/components/kitchen/qty-cell.css | components | font-size:3, line-height:1, padding:2, margin:0, gap:2, width:2, height:3 | @media (prefers-reduced-motion: reduce) |
| mos-app/src/components/kitchen/wip-item-stepper.css | components | font-size:7, line-height:0, padding:3, margin:0, gap:4, width:10, height:2 | — |
| mos-app/src/components/plan/fail-loud-badge.css | components | font-size:1, line-height:1, padding:1, margin:0, gap:1, width:1, height:2 | — |
| mos-app/src/components/processes/due-runs.css | components | font-size:3, line-height:0, padding:5, margin:1, gap:3, width:4, height:1 | @media (prefers-reduced-motion: reduce) |
| mos-app/src/components/processes/pending-resolution.css | components | font-size:1, line-height:0, padding:1, margin:1, gap:1, width:0, height:0 | — |
| mos-app/src/components/record-collection/collection-toolbar.css | components | font-size:6, line-height:0, padding:8, margin:0, gap:7, width:18, height:12 | @media (max-width: 767px), @media (prefers-reduced-motion: reduce) |
| mos-app/src/components/record-collection/record-collection.css | components | font-size:2, line-height:1, padding:4, margin:1, gap:2, width:3, height:4 | — |
| mos-app/src/components/records/record-viewer.css | components | font-size:7, line-height:0, padding:3, margin:5, gap:8, width:5, height:7 | @media (max-width: 767.98px) |
| mos-app/src/components/sales/daily-revenue-chart.css | components | font-size:1, line-height:0, padding:0, margin:0, gap:2, width:3, height:2 | — |
| mos-app/src/components/signals/signal-card.css | components | font-size:10, line-height:1, padding:8, margin:1, gap:4, width:7, height:7 | @media (max-width: 480px) |
| mos-app/src/components/signals/signal-composer.css | components | font-size:6, line-height:1, padding:4, margin:1, gap:5, width:5, height:4 | — |
| mos-app/src/components/signals/signal-feed.css | components | font-size:1, line-height:0, padding:1, margin:0, gap:1, width:1, height:0 | — |
| mos-app/src/components/signals/signal-mention-picker.css | components | font-size:4, line-height:0, padding:5, margin:0, gap:1, width:3, height:3 | — |
| mos-app/src/components/signals/signal-record-host.css | components | font-size:1, line-height:0, padding:2, margin:1, gap:1, width:1, height:2 | — |
| mos-app/src/components/signals/signal-record.css | components | font-size:10, line-height:1, padding:8, margin:7, gap:9, width:0, height:3 | — |
| mos-app/src/components/signals/signal-table-presentation.css | components | font-size:1, line-height:0, padding:2, margin:0, gap:0, width:1, height:2 | — |
| mos-app/src/components/tasks/occurrence-assign-dialog.css | components | font-size:1, line-height:0, padding:1, margin:1, gap:1, width:0, height:0 | — |
| mos-app/src/components/tasks/status-pill.css | components | font-size:0, line-height:0, padding:0, margin:0, gap:0, width:2, height:2 | — |
| mos-app/src/components/tasks/TaskSurface.css | components | font-size:52, line-height:6, padding:41, margin:12, gap:27, width:49, height:37 | @media (max-width: 1099px), @media (max-width: 1099px), @media (max-width: 767px), @media (max-width: 767px), @media (max-width: 767px), @media (prefers-reduced-motion: no-preference) |
| mos-app/src/components/tasks/TasksWorkspace.css | components | font-size:41, line-height:7, padding:37, margin:4, gap:21, width:53, height:40 | @media (max-width: 1099.98px), @media (max-width: 599.98px), @media (prefers-reduced-motion: reduce), @media (prefers-reduced-motion: reduce), @media (prefers-reduced-motion: reduce) |
| mos-app/src/components/ui/Avatar.css | components | font-size:0, line-height:1, padding:0, margin:0, gap:0, width:1, height:2 | — |
| mos-app/src/components/ui/Button.css | components | font-size:2, line-height:0, padding:1, margin:0, gap:1, width:3, height:4 | @media (max-width: 767.98px) |
| mos-app/src/components/ui/CardHead.css | components | font-size:8, line-height:2, padding:6, margin:5, gap:8, width:6, height:6 | @media (prefers-reduced-motion: reduce) |
| mos-app/src/components/ui/Checkbox.css | components | font-size:0, line-height:0, padding:0, margin:0, gap:0, width:3, height:3 | — |
| mos-app/src/components/ui/Chip.css | components | font-size:2, line-height:0, padding:1, margin:0, gap:1, width:3, height:2 | — |
| mos-app/src/components/ui/IconButton.css | components | font-size:0, line-height:0, padding:1, margin:0, gap:0, width:2, height:2 | — |
| mos-app/src/components/ui/modal-shell.css | components | font-size:0, line-height:0, padding:2, margin:0, gap:0, width:5, height:3 | @media (max-width: 640px), @media (prefers-reduced-motion: no-preference) |
| mos-app/src/components/ui/Pill.css | components | font-size:1, line-height:0, padding:1, margin:0, gap:1, width:1, height:2 | — |
| mos-app/src/components/ui/Select.css | components | font-size:2, line-height:0, padding:2, margin:0, gap:1, width:3, height:2 | — |
| mos-app/src/components/ui/Tag.css | components | font-size:1, line-height:1, padding:1, margin:0, gap:1, width:1, height:2 | — |
| mos-app/src/components/ui/TextInput.css | components | font-size:2, line-height:0, padding:2, margin:0, gap:2, width:3, height:2 | — |
| mos-app/src/components/ui/Toggle.css | components | font-size:0, line-height:0, padding:1, margin:0, gap:0, width:2, height:3 | — |
| mos-app/src/components/ui/view-tabs.css | components | font-size:4, line-height:0, padding:6, margin:0, gap:3, width:1, height:2 | @media (max-width: 767px), @media (prefers-reduced-motion: reduce) |
| mos-app/src/components/weekly/my-tasks-card.css | components | font-size:5, line-height:0, padding:6, margin:0, gap:5, width:2, height:3 | — |
| mos-app/src/components/weekly/TimingChip.css | components | font-size:1, line-height:0, padding:1, margin:0, gap:1, width:1, height:2 | — |
| mos-app/src/pages/budget-page.css | pages | font-size:11, line-height:0, padding:1, margin:3, gap:4, width:2, height:0 | — |
| mos-app/src/pages/cafe-opening-page.css | pages | font-size:0, line-height:0, padding:0, margin:0, gap:1, width:2, height:1 | @media (max-width: 390px) |
| mos-app/src/pages/dashboard-page.css | pages | font-size:2, line-height:0, padding:9, margin:1, gap:4, width:4, height:0 | @media (max-width: 767px), @media (max-width: 767px), @media (min-width: 768px) and (max-width: 1279px) |
| mos-app/src/pages/dev-views-page.css | pages | font-size:9, line-height:0, padding:7, margin:0, gap:4, width:6, height:3 | @media (min-width: 1120px), @media (min-width: 920px) |
| mos-app/src/pages/home-page.css | pages | font-size:1, line-height:0, padding:2, margin:0, gap:3, width:1, height:1 | @media (prefers-reduced-motion: reduce) |
| mos-app/src/pages/kitchen-log-page.css | pages | font-size:8, line-height:0, padding:6, margin:1, gap:4, width:14, height:3 | @media (max-width: 767px) |
| mos-app/src/pages/kitchen-plan-page.css | pages | font-size:5, line-height:0, padding:4, margin:3, gap:1, width:4, height:1 | — |
| mos-app/src/pages/kitchen-pushes-page.css | pages | font-size:6, line-height:0, padding:1, margin:0, gap:0, width:2, height:0 | — |
| mos-app/src/pages/kitchen-review-page.css | pages | font-size:9, line-height:0, padding:6, margin:2, gap:3, width:7, height:2 | — |
| mos-app/src/pages/kitchen-stock-page.css | pages | font-size:3, line-height:0, padding:2, margin:0, gap:1, width:2, height:0 | — |
| mos-app/src/pages/pricing-page.css | pages | font-size:6, line-height:0, padding:2, margin:3, gap:5, width:3, height:0 | — |
| mos-app/src/pages/signals-archive-page.css | pages | font-size:4, line-height:0, padding:2, margin:0, gap:2, width:5, height:3 | — |
| mos-app/src/pages/stacked-union-home.css | pages | font-size:9, line-height:1, padding:4, margin:6, gap:2, width:3, height:3 | @media (max-width: 380px) |
| mos-app/src/shell/bottom-tab-bar.css | shell | font-size:1, line-height:0, padding:0, margin:0, gap:1, width:4, height:4 | — |
| mos-app/src/shell/page-families.css | shell | font-size:0, line-height:0, padding:3, margin:1, gap:0, width:6, height:0 | @media (max-width: 767px), @media (min-width: 768px) and (max-width: 1279px) |
| mos-app/src/shell/page-head.css | shell | font-size:6, line-height:4, padding:1, margin:4, gap:3, width:2, height:5 | @media (max-width: 767.98px) |
| mos-app/src/shell/record-panel-host.css | shell | font-size:1, line-height:0, padding:1, margin:0, gap:1, width:3, height:2 | — |
| mos-app/src/shell/signal-composer-host.css | shell | font-size:2, line-height:1, padding:1, margin:1, gap:1, width:2, height:3 | — |

### Aggregate literal counts

| Property | Count | Example files |
| --- | ---: | --- |
| font-size | 348 | mos-app/src/components/admin/people-toolbar.css, mos-app/src/components/cafe/cafe-opening-panel.css, mos-app/src/components/command/command-menu.css, mos-app/src/components/dashboard/basis-chip.css, mos-app/src/components/dashboard/chart-frame.css, mos-app/src/components/dashboard/cut-toggle.css, mos-app/src/components/dashboard/data-table.css, mos-app/src/components/dashboard/dq-badge.css |
| line-height | 42 | mos-app/src/components/dashboard/basis-chip.css, mos-app/src/components/dashboard/dq-badge.css, mos-app/src/components/dashboard/kpi-tile.css, mos-app/src/components/home/attention-brief.css, mos-app/src/components/inbox/inbox.css, mos-app/src/components/kitchen/kitchen-kpi-strip.css, mos-app/src/components/kitchen/plan-qty-cell.css, mos-app/src/components/kitchen/plan-qty-stepper.css |
| padding | 283 | mos-app/src/components/admin/people-toolbar.css, mos-app/src/components/command/command-menu.css, mos-app/src/components/dashboard/basis-chip.css, mos-app/src/components/dashboard/chart-frame.css, mos-app/src/components/dashboard/cut-toggle.css, mos-app/src/components/dashboard/data-table.css, mos-app/src/components/dashboard/dq-badge.css, mos-app/src/components/dashboard/global-toolbar.css |
| margin | 85 | mos-app/src/components/cafe/cafe-opening-panel.css, mos-app/src/components/command/command-menu.css, mos-app/src/components/dashboard/chart-frame.css, mos-app/src/components/dashboard/data-table.css, mos-app/src/components/home/attention-brief.css, mos-app/src/components/inbox/inbox.css, mos-app/src/components/processes/due-runs.css, mos-app/src/components/processes/pending-resolution.css |
| gap | 223 | mos-app/src/components/admin/people-toolbar.css, mos-app/src/components/cafe/cafe-opening-panel.css, mos-app/src/components/command/command-menu.css, mos-app/src/components/dashboard/basis-chip.css, mos-app/src/components/dashboard/chart-frame.css, mos-app/src/components/dashboard/cut-toggle.css, mos-app/src/components/dashboard/data-table.css, mos-app/src/components/dashboard/dq-badge.css |
| width | 343 | mos-app/src/components/admin/people-toolbar.css, mos-app/src/components/command/command-menu.css, mos-app/src/components/dashboard/basis-chip.css, mos-app/src/components/dashboard/chart-frame.css, mos-app/src/components/dashboard/cut-toggle.css, mos-app/src/components/dashboard/data-table.css, mos-app/src/components/dashboard/dq-badge.css, mos-app/src/components/dashboard/global-toolbar.css |
| height | 267 | mos-app/src/components/admin/people-toolbar.css, mos-app/src/components/command/command-menu.css, mos-app/src/components/dashboard/basis-chip.css, mos-app/src/components/dashboard/chart-frame.css, mos-app/src/components/dashboard/cut-toggle.css, mos-app/src/components/dashboard/data-table.css, mos-app/src/components/dashboard/dq-badge.css, mos-app/src/components/dashboard/global-toolbar.css |

## Delivery sequence

This sequence is parsed from `docs/specs/v3-redesign.spec.md` section 12 so deferred ownership cannot collapse into Issue 2.

| Issue | Name |
| ---: | --- |
| 1 | Documentation truth reset, live route/component inventory, and DESIGN.md reconciliation |
| 2 | Storybook component/state/responsive matrix proving the reconciled DESIGN.md contract |
| 3 | Page-family primitives and migration guards |
| 4 | Shared overlay/panel/navigation host |
| 5 | RecordViewer contract, field primitives, and Task adapter |
| 6 | RecordCollection/view engine and Tasks/Signals adapters |
| 7 | Inbox triage plus Deputy host integration |
| 8 | Café canonical-record integration and Team-context correction |
| 9 | Representative-slice rendered/driven owner gate; provisional IA ratification |
| 10 | Structured-content schema ADR, storage/RLS, editor, and typed embeds |
| 11 | Remaining route migration by page/component family |
| 12 | Full cross-surface acceptance, stale-style removal, documentation closure, and owner walkthrough |

Issue 2 is Storybook component/state/responsive proof only. It cannot claim application migration or rendered representative acceptance; those responsibilities remain with the separately numbered issues below.

## Current conformance debt

- The live source tree still contains route-local shells, multiple collection presentations, and CSS literal families; this manifest records them as Issue 1 evidence rather than marking them migrated.
- Current record panel CSS is an existing implementation detail; Issues 3–8 own the application migration of page families, the shared host, RecordViewer, RecordCollection, Inbox/Deputy, and Café while Issue 9 owns rendered representative acceptance.
- Separate typed database models remain required for Task, Standard/SOP, Signal, Process, Project, Money, and People.

## Deferred issue ownership

- Issue 2 — Storybook component/state/responsive matrix proving the reconciled DESIGN.md contract
- Issue 3 — Page-family primitives and migration guards
- Issue 4 — Shared overlay/panel/navigation host
- Issue 5 — RecordViewer contract, field primitives, and Task adapter
- Issue 6 — RecordCollection/view engine and Tasks/Signals adapters
- Issue 7 — Inbox triage plus Deputy host integration
- Issue 8 — Café canonical-record integration and Team-context correction
- Issue 9 — Representative-slice rendered/driven owner gate; provisional IA ratification
- Issue 10 — Structured-content schema ADR, storage/RLS, editor, and typed embeds
- Issue 11 — Remaining route migration by page/component family
- Issue 12 — Full cross-surface acceptance, stale-style removal, documentation closure, and owner walkthrough

## Sources

- Router: `mos-app/src/router.tsx`
- Binding design contract: `DESIGN.md`
- Master V3 delivery sequence: `docs/specs/v3-redesign.spec.md` §12
- App source root: `mos-app/src`
