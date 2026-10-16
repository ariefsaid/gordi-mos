// Pages per area for shots.mjs and check.mjs. Ship-gated routes (Events, Budget, Pricing, Follow-ups) redirect, so they are absent.
export const PAGES = {
  // `shapes`: extra light desktop viewports (w, h) the owner's real windows have (MacBook 1728x1117 and 1496x1112), run beside 1920/1440/390 -- the capture-page
  // bottom bar / page-scroll checks in check.mjs need a window that is not 1440x900. `choose`: the stream button to press when a viewer has no default stream.
  cafe: { shapes: [[1728, 1117], [1496, 1112]], user: 'cahya@sample.gordi.test', pages: {
    today: '/cafe', records: '/cafe/records', plan: '/cafe/plan', production: '/cafe/production', transfer: '/cafe/transfer', waste: '/cafe/waste',
    count: '/cafe/count', receive: '/cafe/receive', 'receive-issues': '/cafe/receive/issues', 'receive-review': '/cafe/receive/review',
    request: '/cafe/request', 'request-review': '/cafe/request/review', stock: '/cafe/stock', review: '/cafe/review',
    'review-counts': '/cafe/review?queue=counts', 'review-receipts': '/cafe/review?queue=receipts', 'review-requests': '/cafe/review?queue=requests', 'review-failed': '/cafe/review?queue=failed-sends',
    pushes: '/cafe/pushes', items: '/cafe/items', recipes: '/cafe/recipes', 'recipes-all': '/cafe/recipes?status=All',
    // ESB status and Type filters: preparations only; recipes removed from the menu. (The local database holds no recipes: STRESS supplies them.)
    'recipes-wip': '/cafe/recipes?type=wip', 'recipes-removed': '/cafe/recipes?status=Removed' } },
  // The Kitchen stream (Gordi HQ · Kitchen) has the long names and units the Bar stream lacks; same pages, krishna.
  'cafe-kitchen': { shapes: [[1728, 1117], [1496, 1112]], user: 'krishna@sample.gordi.test', pages: {
    records: '/cafe/records', plan: '/cafe/plan', production: '/cafe/production', transfer: '/cafe/transfer', waste: '/cafe/waste', count: '/cafe/count',
    receive: '/cafe/receive', request: '/cafe/request', stock: '/cafe/stock', items: '/cafe/items', recipes: '/cafe/recipes' } },
  // The same capture pages for a MULTI-module viewer (dewi: Money + Café + Admin): the two-layer module rail + pages panel instead of the single sidebar.
  // dewi has no default stream, so the Gordi HQ Kitchen is chosen first (`choose`); the detector is skipped here (cafe-kitchen covers the same pages and its own session already has a stream).
  'cafe-rail': { shapes: [[1728, 1117], [1496, 1112]], choose: 'Gordi HQ · Kitchen', detect: false, user: 'dewi@sample.gordi.test', pages: {
    production: '/cafe/production', transfer: '/cafe/transfer', waste: '/cafe/waste', count: '/cafe/count', receive: '/cafe/receive', request: '/cafe/request' } },
  // dewi belongs to several streams and has no default one: every Café page that can show "Choose a kitchen or bar" shows it here.
  'cafe-choose': { user: 'dewi@sample.gordi.test', pages: {
    today: '/cafe', plan: '/cafe/plan', production: '/cafe/production', transfer: '/cafe/transfer', waste: '/cafe/waste', count: '/cafe/count',
    receive: '/cafe/receive', request: '/cafe/request', stock: '/cafe/stock', items: '/cafe/items',
    review: '/cafe/review', 'review-counts': '/cafe/review?queue=counts', 'review-receipts': '/cafe/review?queue=receipts', 'review-requests': '/cafe/review?queue=requests', 'review-failed': '/cafe/review?queue=failed-sends' } },
  // sinta is a stream supervisor: Review has no Failed ESB sends tab for her (4 tabs).
  'cafe-supervisor': { user: 'sinta@sample.gordi.test', pages: {
    review: '/cafe/review', 'review-counts': '/cafe/review?queue=counts', 'review-receipts': '/cafe/review?queue=receipts', 'review-requests': '/cafe/review?queue=requests' } },
  money: { user: 'dewi@sample.gordi.test', pages: {
    money: '/money', branch: 'BRANCH', 'pending-bills': '/money/pending-bills'
  } },
  work: { user: 'dewi@sample.gordi.test', pages: {
    tasks: '/work/tasks', 'task-new': '/work/tasks/new', signals: '/work/signals', objectives: '/work/objectives',
    projects: '/work/projects' } },  // events is ship-gated (redirects to Home)
  home: { user: 'dewi@sample.gordi.test', pages: { home: '/', inbox: '/inbox', 'not-found': '/no-such-page' } },
  admin: { user: 'dewi@sample.gordi.test', pages: {
    people: '/admin/people', person: '/admin/people/cbad6f1a-cd87-5565-acd7-c52fa722e764', // Bayu Barista
    teams: '/admin/teams', access: '/admin/access', agents: '/admin/agents',
    profile: '/profile', 'connected-agents': '/profile/connected-agents' } },
  // The shell has its own owner: menus, panels and pop-ups only reachable by clicking. `act` runs after load.
  // Two shells by admitted module count: ONE module (cahya, Café only) gets the single sidebar; TWO OR MORE (dewi: Money
  // + Café + Admin) get the module rail with the pages panel. 768-1279 and the folded nav are the 64px rail with flyouts.
  shell: { user: 'cahya@sample.gordi.test', pages: {
    'rail-cafe': '/cafe/receive',
    'sidebar-work': '/work/tasks',
    'sidebar-review': '/cafe/review',
    palette: { path: '/', act: [{ key: 'Meta+k' }] },
    bell: { path: '/', act: [{ role: 'button', name: /^inbox/i }], wide: true },
    'share-signal': { path: '/', act: [{ role: 'button', name: /^share (a )?signal$/i }] },
    'more-drawer': { path: '/', act: [{ role: 'button', name: /^more$/i }], phone: true },
    'more-drawer-cafe': { path: '/cafe/receive', act: [{ role: 'button', name: /^more$/i }], phone: true },
    // last: collapsing the rail is remembered for the rest of the run
    'task-open': { path: '/work/tasks?record=c274b92f-5edf-5820-af61-1ba51b7956a8'},
    'rail-collapsed': { path: '/cafe/receive', act: [{ role: 'button', name: /collapse navigation/i }], wide: true },
    'flyout-cafe': { path: '/cafe/receive', act: [{ role: 'button', name: /^café$/i }], wide: true },
  } },
  'shell-multi': { user: 'dewi@sample.gordi.test', pages: {
    'panel-home': '/',
    'panel-work': '/work/tasks',
    'panel-money': '/money',
    'panel-cafe': '/cafe/receive',
    // dewi has several streams and no default: these show the "Choose a kitchen or bar" chooser (do not point them elsewhere)
    'panel-items': '/cafe/items',
    'panel-production': '/cafe/production',
    'panel-review': '/cafe/review',
    'panel-admin': '/admin/people',
    palette: { path: '/', act: [{ key: 'Meta+k' }] },
    'more-drawer': { path: '/', act: [{ role: 'button', name: /^more$/i }], phone: true },
    'more-drawer-cafe': { path: '/cafe/receive', act: [{ role: 'button', name: /^more$/i }], phone: true },
    // last: collapsing the nav is remembered for the rest of the run
    'rail-collapsed': { path: '/cafe/receive', act: [{ role: 'button', name: /collapse navigation/i }], wide: true },
    'flyout-work': { path: '/work/tasks', act: [{ role: 'button', name: /^work$/i }], wide: true },
    'flyout-cafe': { path: '/cafe/receive', act: [{ role: 'button', name: /^café$/i }], wide: true },
  } },
  // Indonesian: the same single sidebar and drawer with the longer labels.
  'shell-id': { user: 'bulan@sample.gordi.test', pages: {
    'sidebar-cafe': '/cafe/receive',
    'sidebar-work': '/work/tasks',
    'more-drawer': { path: '/cafe/receive', act: [{ role: 'button', name: /^lainnya$/i }], phone: true },
  } },
  // PREVIEW screens (ship state `preview`, mos-app/src/lib/ship-gate.ts): reachable only on a dev server launched with
  // VITE_FUTURE_PREVIEW=1 (mos-app/scripts/ui-check/serve.sh does that). mos-app/scripts/ui-check/preview-off.mjs proves they are NOT reachable without it.
  // HQ kitchen -> Cikal is a real stored route; Bayu Barista is a real person.
  preview: { user: 'dewi@sample.gordi.test', pages: {
    'transfer-routes': '/cafe/transfer-routes',
    'transfer-route': '/cafe/transfer-routes?route=2d63ab19-142c-5ecb-9f88-6b512eebe581:kitchen:dd4def60-f9e2-5145-bec6-0722032d07d3',
    'transfer-route-preview': '/cafe/transfer-routes?route=new',
    // Modules is its own Admin page (Org only); a person's Modules section sits on the person page; People has the overrides notice.
    'modules-org': '/admin/modules',
    'modules-org-preview': { path: '/admin/modules', act: [{ role: 'button', name: /^preview settings$/i }] },
    'person-modules': '/admin/people/cbad6f1a-cd87-5565-acd7-c52fa722e764',
    'person-modules-preview': { path: '/admin/people/cbad6f1a-cd87-5565-acd7-c52fa722e764', act: [{ role: 'button', name: /^preview settings$/i }] },
    'people-overrides': '/admin/people?overrides=cafe',
    // Locations: the honest default, the labelled isolated sample layout, a sample record (in-memory form), the blank form, Change location.
    locations: '/cafe/locations',
    'locations-preview': '/cafe/locations?layout=preview',
    'location-edit': '/cafe/locations?layout=preview&location=sample-chiller',
    'location-new': '/cafe/locations?layout=preview&location=new',
    'move-stock': '/cafe/locations/change-location',
    // Stock comparison (Gordi HQ · Kitchen): the honest disconnected default (real Counts, ESB cells blank), the labelled in-memory sample, a sample item panel, the sample sorted by quantity gap with Only differences on.
    'stock-comparison': '/cafe/stock-comparison?stream=2d63ab19-142c-5ecb-9f88-6b512eebe581:kitchen',
    'stock-comparison-sample': '/cafe/stock-comparison?stream=2d63ab19-142c-5ecb-9f88-6b512eebe581:kitchen&layout=preview',
    'stock-comparison-item': '/cafe/stock-comparison?stream=2d63ab19-142c-5ecb-9f88-6b512eebe581:kitchen&layout=preview&item=sample-item-01&unit=sample-unit-porsi',
    'stock-comparison-differences': '/cafe/stock-comparison?stream=2d63ab19-142c-5ecb-9f88-6b512eebe581:kitchen&layout=preview&sort=quantity&differences=1',
    // Hide in MOS on Recipes: a recipe open with the switch on Hidden; then back to the list with Show hidden ticked (the choice lives in the page's memory, so each is one in-page walk).
    // dewi can manage Café item settings; the STRESS recipe STRESS-0028:9040 is Menu + Active. The local database holds no recipes, so plain runs show the empty state: these two mean something under STRESS.
    'recipe-hidden': { path: '/cafe/recipes?recipe=STRESS-0028:9040', act: [{ role: 'switch', name: /shown in mos/i }] },
    'recipes-show-hidden': { path: '/cafe/recipes?recipe=STRESS-0028:9040', act: [{ role: 'switch', name: /shown in mos/i }, { role: 'link', name: /back to recipes/i }, { text: /^filters/i }, { role: 'checkbox', name: /show hidden/i }] },
  } },
  // Location fields on the released capture / Records / Available to transfer pages (only present with the preview opt-in; preview-off.mjs proves they vanish
  // without it). A Kitchen stream lead, so the capture pages show their lists instead of the stream chooser.
  'preview-capture': { user: 'krishna@sample.gordi.test', pages: {
    'location-production': '/cafe/production', 'location-transfer': '/cafe/transfer', 'location-waste': '/cafe/waste',
    'location-count': '/cafe/count', 'location-receive': '/cafe/receive', 'location-records': '/cafe/records', 'location-wip-balance': '/cafe/stock',
  } },
  // A non-admin, Indonesian viewer: Transfer routes is read-only, with no edit teaser.
  'preview-member': { user: 'bulan@sample.gordi.test', pages: {
    'transfer-routes': '/cafe/transfer-routes',
    'transfer-route': '/cafe/transfer-routes?route=2d63ab19-142c-5ecb-9f88-6b512eebe581:kitchen:dd4def60-f9e2-5145-bec6-0722032d07d3',
    locations: '/cafe/locations',
    'locations-preview': '/cafe/locations?layout=preview',
    'location-sample': '/cafe/locations?layout=preview&location=sample-chiller',
    // Not a Count reviewer: no menu entry, and the address shows the no-access state.
    'stock-comparison': '/cafe/stock-comparison?stream=2d63ab19-142c-5ecb-9f88-6b512eebe581:kitchen',
  } },
  signin: { user: null, pages: { login: '/login', recovery: '/recovery' } },
}
