# Audit probe — first-time operator pass

## Top 5 things the owner probably hasn't noticed
1. **Home promises a money cockpit it cannot defend.** Director/Finance land on revenue and margin cards that show `—`, with no basis, no as-of, no source, and no money-position strip (AR/AP/unbilled/unearned) at all.
2. **The highest-leverage finance jobs are missing, not merely empty.** `/plan/budget`, `/plan/pricing`, and `/work/follow-ups` silently redirect to Home; Sales drills from Home into an empty page.
3. **The nav uses “Plan” for two different jobs.** “Plan” under Kitchen means kitchen production planning; the actual company Plan destination is effectively just Sales. This will misroute people constantly.
4. **Admin can create logins but not the org model the product depends on.** People admin has access roles only; no role/reporting-line/manager structure, which undermines weekly-update visibility and Home composition.
5. **The cascade backbone is mostly decorative right now.** Objectives and Projects & Processes are name lists, not manageable operating records with owners, BU, lane, metric, or time horizon.

## Findings (ranked by job damage)

### 1) `/` (Director, Finance) · land on the company/function cockpit and decide where to direct attention
- **What went wrong / what’s missing:** Home has revenue and gross-margin tiles that show `—`; there is no AR/AP/unbilled/unearned strip; no freshness, basis, or source labels; clicking revenue just drills to an empty Sales page.
- **Why it matters to the job:** This is the core owner/finance JTBD. A blank number with no provenance is worse than no number because it looks like a broken dashboard I’m supposed to trust.
- **Suggested direction:** Don’t show finance KPIs as normal cards until they can carry basis + as-of + drill target. Build the money-position strip and AR/follow-up drill first, or replace with explicit “not live yet / awaiting snapshot” states.

### 2) `/plan/budget`, `/plan/pricing`, `/work/follow-ups` · do pricing/budgeting/collections work
- **What went wrong / what’s missing:** These routes **silently redirect to `/`**. There is no Budget, Pricing, or Follow-up surface to do the job, and no explanation that access is missing or the feature is not live.
- **Why it matters to the job:** These are not edge jobs; they are the finance/planning seams that decide whether operators trust the app for real work.
- **Suggested direction:** Ship explicit stubs with route-level messaging (“not live yet”, “requires data feed”, “not in your role”), or hide the route/drill entirely until the surface exists.

### 3) Navigation IA (`/`, left rail) · find the right “Plan” surface fast
- **What went wrong / what’s missing:** The rail says **Plan** inside Kitchen for production planning, while the company-level Plan destination effectively only exposes Sales. Budget/Pricing are absent. Finance also sees a large Kitchen subsection before the only finance page.
- **Why it matters to the job:** In a dense operator tool, overloaded nouns create constant hesitation and wrong clicks.
- **Suggested direction:** Rename the kitchen item more explicitly (`Kitchen Plan` is fine, but make the company destination visibly distinct: `Financial Plan`, `Planning`, or similar) and make role-priority ordering obvious.

### 4) `/admin/people` · set up who reports to whom and who can see/review what
- **What went wrong / what’s missing:** People admin only manages directory entry + login + access roles. There is **no org role / reports-to / manager-chain maintenance** anywhere in the flow.
- **Why it matters to the job:** Weekly-update visibility, manager review, and role-aware Home composition depend on the reporting chain. Right now I can onboard a login but not the actual operating structure.
- **Suggested direction:** Add org-role/reporting-line management or link this screen to the canonical org-structure surface. Access roles are not enough.

### 5) `/work/objectives` and `/work/projects-processes` · maintain the cascade spine
- **What went wrong / what’s missing:** Both screens are basically **name + add/rename/archive** lists. No A/R owner, BU, lane, measure, due horizon, or status.
- **Why it matters to the job:** The cascade cannot become a real operating system if its parent records are unowned labels.
- **Suggested direction:** Either label these as lightweight taxonomy seeds for now, or add minimal operating fields and drill-in detail pages before asking users to rely on the cascade.

### 6) `/work/cascade` · understand how drifting work ladders up and who owns fixing it
- **What went wrong / what’s missing:** The view shows grouped titles and status pills, but not the actual decision fields: owner, BU, aging, roll-up health, or a quick fix for `No Project/Process` tasks.
- **Why it matters to the job:** I still cannot answer “whose problem is this objective drift?” without opening multiple records.
- **Suggested direction:** Surface owner + BU + due/aging inline, and let me attach uncascaded tasks to a Project/Process from this view.

### 7) `/updates` · review my team’s weekly filing and chase missing people
- **What went wrong / what’s missing:** The review area shows counts (`0 filed / 0 draft / 4 not started`) but the roster rows are effectively dead; there’s no obvious drill to that person’s work, no reminder/nudge action, and no last-filed context. The write pane also leads with a disabled Submit until you infer the required steps.
- **Why it matters to the job:** A manager can see that people have not filed, but cannot close the loop from the screen.
- **Suggested direction:** Make missing-filer rows actionable (open their update/task list/reminder path), and make submit requirements explicit before the button looks broken.

### 8) `/ops` and `/ops/new` · record and read floor facts by the same grain
- **What went wrong / what’s missing:** The Daily Log feed talks about Kitchen/Roastery/floor activity, but the add form captures **Business unit**, not **Activity/source/location**. The grain of capture does not match the grain of reading.
- **Why it matters to the job:** Later I will not trust feed filters because the source dimension is being improvised in title/detail instead of captured cleanly.
- **Suggested direction:** Capture Activity/source explicitly (Kitchen, Bar, Roastery, etc.) and show it as the primary badge in the feed; BU can be secondary/derived.

### 9) `/kitchen/plan` and `/kitchen/log` · set a plan, log actuals, and know whether the app saved it
- **What went wrong / what’s missing:** Plan looks like silent autosave with no obvious saved/pending state. Log has a Submit action, but it sits at the bottom of a dense table and there is little “what changed / what’s pending” feedback until you reach the footer.
- **Why it matters to the job:** Floor users will hesitate, double-enter, or walk away unsure whether the plan/log stuck.
- **Suggested direction:** Put an explicit saved/pending indicator near the controls and keep the action bar visibly sticky while editing.

### 10) `/kitchen/stock` · trust stock enough to plan tomorrow
- **What went wrong / what’s missing:** The page shows all-zero stock, `Negative balances 0 clear`, and vague sublabels like `read-only` / `transfer-ready`, but no last recompute time, no source, and no explanation of what zero means.
- **Why it matters to the job:** Stock is planning-critical. A wall of zeroes with no provenance reads as “sync broken,” not “authoritative stock picture.”
- **Suggested direction:** Show last recompute/as-of/source prominently and explain zero/negative semantics in plain ops language.

### 11) `/` (Finance) · start my finance day from my own job, not from generic task chrome
- **What went wrong / what’s missing:** Finance lands on a generic task dashboard with two blank finance cards and a heavy Kitchen subsection in the nav. No collections/follow-up queue, no cost-certification cues, no finance-first default.
- **Why it matters to the job:** It teaches Finance that MOS is someone else’s tool with a finance sticker on top.
- **Suggested direction:** Finance Home should default to money-position + follow-up + freshness/certification state, and push kitchen ops lower or hide it unless intentionally needed.

### 12) Role-gated routes (`/sales`, `/admin/people`, `/work/objectives`) · understand whether I’m blocked or the app is broken
- **What went wrong / what’s missing:** For non-matching roles, some routes **redirect silently to Home** (`/sales`, `/admin/people`) or to another page (`/work/objectives` → `/work/cascade`). There is no “you don’t have access” or “this role uses X instead.”
- **Why it matters to the job:** Silent reroutes feel like broken navigation, especially in a multi-role internal tool.
- **Suggested direction:** Use explicit permission states or informative redirects that say what happened and where the role should go instead.
