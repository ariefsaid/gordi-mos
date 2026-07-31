# THE 5 THINGS THAT MAKE THIS FEEL OFF (that the owner can't name)

1. **The app keeps changing its grammar.** The typography/tokens are mostly shared, but the actual page archetypes are not: table workspace, accordion tree, essay form, CRUD list, kitchen console, and blank placeholder all behave like different products.
2. **The navigation reflects implementation structure more than operator thinking.** The rail exposes modules and sub-pages as peers, so the app feels like a sitemap of internals, not one operating surface.
3. **Home makes the wrong promise.** It presents itself like a cockpit, then immediately behaves like a task page with two dead KPI tiles taped on top.
4. **The detail views prioritize administration over action.** When you open a task, the UI turns into a record editor before it tells you the one thing you need to decide.
5. **Sparse states are not designed, just emptied.** Several routes collapse into large white vacuums, which reads as unfinished and quietly erodes trust.

---

## Ranked findings

### 1) `/tasks` · `/work/cascade` · `/updates` · `/kitchen/*` · `/work/objectives` · `/work/projects-processes`
- **The seam/tell:** Compare `tasks.png` vs `cascade.png` vs `updates.png` vs `kitchen-log.png` vs `work-objectives.png`. After the page title, each route switches to a different layout religion: bounded table workspace, naked accordion tree, giant writing card, kitchen KPI console, or plain CRUD list.
- **Why it undermines the feel:** This is the core “several apps stitched together” signal. The eye does not feel one governing layout grammar, only shared tokens on top of different templates.
- **Fix direction:** Define 3 durable page archetypes and force every route into one of them:
  1. **Workspace**: title + summary signal + tool rail + dense data body.
  2. **Write/review**: title + tight context strip + bounded form/review stack.
  3. **Catalog/manage**: title + small inline create bar + dense list.
  Then retrofit Home, Tasks, Cascade, Kitchen, Objectives/Projects to those archetypes so spacing, toolbars, and body structure repeat with intent.
- **Lens:** coherence

### 2) `nav[aria-label="Primary"]` across all routes
- **The seam/tell:** The rail mixes destinations and implementation details at the same visual rank: `Home`, `Tasks`, `Cascade`, `Weekly Updates`, `Objectives`, `Projects & Processes`, `Daily Log`, then a separate `Kitchen` cluster with `Log / Plan / Stock / Review / Pushes`, then `Sales`, `Inbox`, `People`.
- **Why it undermines the feel:** The app teaches the database, not the work model. “Plan” means a destination in one place and a kitchen sub-view in another. “Review”, “Stock”, and “Pushes” are exposed as nouns without enough context. Crossing into Kitchen feels like leaving the MOS and entering an embedded subsystem.
- **Fix direction:** Keep the rail at destination level only: **Home / Work / Operate / Plan / Inbox / Admin**. Put Kitchen’s `Log / Plan / Stock / Review / Pushes` in a local module nav inside Operate. Treat `Objectives` and `Projects & Processes` as manage modes inside Cascade, not peer destinations.
- **Lens:** mental model

### 3) `/`
- **The seam/tell:** `home.png` and `home-mobile.png`: the top KPI row shows two dashes and two basic counts, but the real visual weight is the large “My tasks” table/card directly underneath.
- **Why it undermines the feel:** Home says “cockpit” but behaves like “Tasks lite”. The KPI chrome is prominent enough to imply oversight, but too empty/lightweight to earn it. So the page feels neither calm nor decisive, just undecided.
- **Fix direction:** Choose one truth. Either:
  - make Home a real cockpit with drillable money/ops/update signals and demote tasks to one secondary module, or
  - admit this is “My Week” and remove the faux-dashboard strip entirely.
  Right now it is both, which is why it feels off.
- **Lens:** hierarchy

### 4) `/tasks/:id` and `/tasks/new`
- **The seam/tell:** `task-detail.png` and `tasks-new.png`: the right drawer turns into a long form stack of fields, while the left list loses density/context once the drawer opens. The task’s primary state is a small control inside a larger admin panel.
- **Why it undermines the feel:** Opening a task should sharpen the decision. Instead it flips the user from “operate work” to “maintain record”. The hierarchy says taxonomy and ownership editing are as important as what is blocked, due, or next.
- **Fix direction:** Rebuild the drawer header around the decision surface: **status, due, owner, blocker/next step** first. Push less-frequently changed fields like objective/project and archival actions into a secondary section. Keep the list context stable so opening a task feels like zooming in, not switching modes.
- **Lens:** hierarchy

### 5) `/ops` · `/kitchen/review` · `/kitchen/pushes` · `/sales` · `/inbox` · mobile `/ops`
- **The seam/tell:** `ops.png`, `kitchen-review.png`, `kitchen-pushes.png`, `sales.png`, `inbox.png`, plus `ops-mobile.png`. These pages become mostly empty white canvases with a heading and one sentence; on mobile Daily Log even duplicates the primary CTA.
- **Why it undermines the feel:** Quiet is not the same as absent. These states expose raw scaffolding, so the product feels not “calm and data-first” but “not fully composed yet”. The duplicate CTA on mobile makes that worse by revealing layout solving instead of product confidence.
- **Fix direction:** Design zero-data states as first-class versions of each workspace: preserve the page rhythm, keep the tool rail meaningful, give one clear next action, and bound the content so the screen still feels intentional. Remove duplicated actions unless one is clearly contextual and one is global.
- **Lens:** craft/trust

---

## Secondary tells worth noting

- `/updates` feels bureaucratic because the write card is huge before the user has anything to say. The page asks for acreage instead of rhythm.
- `/work/cascade` feels like an internal tree viewer dropped into the app. It is semantically useful, but visually under-resolved compared with Tasks.
- `/work/objectives` and `/work/projects-processes` read like back-office admin screens, not part of the same operating surface as Tasks.
- `/kitchen/log` is actually one of the more coherent operator screens, which makes its difference from the rest of the product more obvious.
- Mobile shell is cleaner than desktop in some places, but it also exposes a second navigation model, top utility cluster plus bottom tabs, without fully simplifying page content.

---

## If I had to explain the “off” in one sentence per key screen

- **Home:** It promises oversight, then collapses into a task list with ornamental KPIs.
- **Tasks:** This is the most product-like screen, which makes the rest of the app feel even less unified.
- **Task detail:** It treats a task like a record to administer, not a piece of work to move.
- **Cascade:** It feels like an internal structure browser, not a first-class workspace.
- **Weekly Updates:** It turns a lightweight weekly rhythm into a large, slightly ceremonial form.
- **Daily Log:** When empty, it feels vacant rather than quietly ready.
- **Add log entry:** This is clean, but it belongs to a different form grammar than task creation.
- **Kitchen Log:** It feels like a separate subsystem with its own rules and density.
- **Kitchen Plan/Stock/Review/Pushes:** These look like module internals surfaced directly, not curated operator destinations.
- **Objectives / Projects & Processes:** They read as admin CRUD, not MOS.
- **Sales / Inbox:** Their empty states feel unbuilt, not intentionally minimal.
- **People:** It is solid, but it belongs to the admin/catalog family, which the rest of the app has not clearly defined.
