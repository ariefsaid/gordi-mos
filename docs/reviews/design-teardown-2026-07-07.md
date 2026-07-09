# Design teardown — synthesis (2026-07-07)

Three independent RENDERED audits (every route, desktop + phone, vision models), each a different lens,
synthesized here. Source docs:
- [design-audit-2026-07-07.md](design-audit-2026-07-07.md) — concrete/visual (gpt-5.4): bleeds, scale, spacing, states.
- [audit-probe-operator.md](audit-probe-operator.md) — operator/JTBD/trust (gpt-5.4): dead-ends, provenance, missing job-steps, role reality.
- [audit-probe-craft.md](audit-probe-craft.md) — craft/coherence/mental-model (gpt-5.4): layout grammar, Home promise, detail-as-admin, empty states.

**Verdict:** the shell, palette restraint, and dense-data posture are genuinely working — this is close to a
credible operator tool. But it **fractures below the token layer**: the three lenses independently converged on
the same handful of *structural* problems the owner could feel but not name. These are the unknown-unknowns.

## The 5 root problems (deduped across all three lenses, ranked by impact)

1. **No page-archetype system → "several apps."** Tokens are shared, but page *grammars* are not: table
   workspace vs accordion tree vs essay form vs CRUD list vs kitchen console vs blank placeholder each behave
   like a different product. *(craft #1; concrete "title/header drift"; operator "objectives/projects read as
   back-office").* **This is the true root of the "several apps" feeling.**
2. **Home makes a promise it can't keep.** Cockpit chrome (revenue/margin KPIs) sitting on a task list, and the
   finance tiles show `—` with **no basis / as-of / source** and drill to an empty Sales page. "Neither calm nor
   decisive — undecided." *(craft #3 + operator #1/#11).*
3. **Sparse states are emptied, not designed.** `/inbox`, `/sales`, `/kitchen/review`, `/kitchen/pushes`,
   phone `/ops` collapse into white vacuums with a heading + one sentence → reads "unfinished," erodes trust.
   *(all three lenses).*
4. **Navigation teaches the database, not the work.** The rail mixes destinations and implementation nouns at
   one rank; "Plan" means two different things; crossing into Kitchen feels like leaving MOS. *(craft #2 +
   operator #3).*
5. **Trust gaps everywhere data is shown.** No provenance/as-of on finance + `/kitchen/stock` (all-zeros "reads
   as sync broken"); `/kitchen/plan` autosaves with **no saved/pending feedback**; role-blocked routes
   (`/plan/*`, `/work/follow-ups`, non-role `/sales`) **silently redirect to Home** with no "not live / no
   access" message → feels like broken navigation. *(operator #1/#2/#9/#10/#12).*

Plus two concrete P0 layout breakages (the visible tip): **Home "My tasks" DUE overruns into ACTIVITY**
(150.9px column, 172px text) and **`/tasks` desktop DUE column renders off-viewport** (x=1319→1469 @1440px).

## Fix plan — categorized by what it needs

### A. Fix now (bounded UI — this branch, no owner decision needed)
- **A1. The two P0 bleeds** — protect a DUE/age width budget on the Home mini-table + Tasks table (tokenize
  task-table column widths; both P0s are the same class).
- **A2. Finish the title-scale pass** — every route on the 24px page-title token (the `content-header` PageHead
  variant still renders 20px on `/tasks`,`/kitchen/*`,`/sales`,`/updates`,`/objectives`,`/projects`).
- **A3. ONE designed empty-state** — a shared zero-state (page rhythm preserved, one clear next action) rolled
  out to inbox/sales/kitchen-review/kitchen-pushes/ops; kill the `/ops` phone **duplicate CTA**.
- **A4. Explicit blocked/not-live states** — replace the silent redirects (`/plan/budget`, `/plan/pricing`,
  `/work/follow-ups`, non-role `/sales`) with a route-level "not live yet" / "your role uses X" panel.
- **A5. Saved/pending feedback** on `/kitchen/plan` (+ keep the Log action bar visibly sticky while editing).
- **A6. Provenance on data** — as-of / source / basis labels on the finance KPIs + `/kitchen/stock` (or an
  honest "awaiting snapshot" state instead of a bare `—`).
- **A7. Mobile `content-header` reflow** — stack icon/title/count then a full-width meta row (fixes the
  two-narrow-column knot on `/updates`,`/objectives`,`/projects`).

### B. Owner decisions (design-direction — need a call before building)
- **B1. Commit Home's identity:** real cockpit (drillable money/ops/update signals; tasks demoted) **or** rename
  to "My Week" and drop the faux-dashboard KPI strip. It cannot stay both.
- **B2. Adopt 3 page archetypes** and retrofit every route to one: **Workspace** (title + summary + tool rail +
  dense body) · **Write/Review** (title + context strip + bounded form) · **Catalog/Manage** (title + inline
  create bar + dense list). This is the real cure for "several apps."
- **B3. Restructure the rail** to destination-level only (Home/Work/Operate/Plan/Inbox/Admin); Kitchen's 5 become
  a **local module nav inside Operate**; Objectives/Projects become **manage-modes inside Cascade**. Resolve the
  "Plan" overload.
- **B4. Rebuild task detail around the decision** (status/due/owner/blocker/next first; taxonomy + archival
  secondary) so opening a task *sharpens* the decision instead of switching to record-admin mode.

### C. Product-scope (F / roadmap — not a UI fix)
- Finance surfaces actually live (budget, pricing, follow-ups); org reporting-line/manager model in admin;
  objectives/projects gain operating fields (owner/BU/lane/metric/horizon); `/ops` capture the **Activity**
  grain (not just BU) so the feed's read-grain matches capture.

## Recommendation
Do **A1–A7 now** (verified UI fixes, high felt-impact, no scope debate) on the current branch. Bring **B1–B4**
to you as explicit design decisions (they reshape IA + Home + detail — worth a short mockup round each). Fold
**C** into F / the roadmap. The single highest-leverage move once decided is **B2 (page archetypes)** — it
dissolves the root "several apps" feeling that A-level polish only masks.
