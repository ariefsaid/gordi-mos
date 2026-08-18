# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Phone-first responsive web app, installable (service worker + web manifest ship in
`mos-app/public/`). Deployed at `https://ops.gordi.id/mos`. Not a native app; a phone-first web
app does not make its design language native.

## Users

Gordi is a coffee company of ~30 people across six Business Units (Marketing · HR · Finance ·
Retail Ops · B2B Ops · B2B Sales), running four operating Activities (kitchen · bar · ecommerce
under Retail Ops; roasting under B2B Ops). MOS serves **all of them**, not a manager subset.

Four confirmed personas (owner-ratified 2026-07-06; the JTBD oracle, v0.3, in the local docs
repo):

- **Contributor / floor** — barista, kitchen hand, roastery operator, ecommerce packer. Access role
  `member`, rostered to one Activity. Situation: mid-shift, standing, on a phone, hands busy.
  Job: *record what I just did in one short pass, see my next step, get back to work in under a
  minute.* Rarely owns tasks; narrow write surface confined to their Activity.
- **Lead / manager** — Kitchen Lead, Bar Lead, Roastery Lead, Ecommerce Lead, Sales Lead. Derived
  from the role chain, never a flag. Situation: start of the work week. Job: *see what's drifting in
  my own R/A tasks, whether my reports filed and are hitting the floor plan, and who owns what.*
  Triages, reviews reports' updates (upward-only), approves their Activity's logs.
- **Function-owner / BU-head** — head of a BU; the A person on that BU's Objectives. Job: *see my
  function's revenue · margin · cost slice, ops KPIs for my Activities, and cascade progress against
  plan in one glance, so I can direct the right lead to the number that's off.* Usually the **same
  human** as a Lead — a distinct job, not a distinct login. Do not collapse the two.
- **Owner-director** — whole-company scope. Job: *see the company money position
  (revenue · margins · AR · AP · unbilled · unearned), per-Activity ops KPIs, and cascade progress +
  update-filing state in one cockpit, so I can direct attention across functions without chasing
  people one-by-one.* Oversight, not sign-off.

## Product Purpose

MOS is the **operating system for the whole company** — it replaces a dormant wiki-workspace
"Management OS" and, more importantly, the forked spreadsheets the company actually runs on today.
It carries task ownership + RACI, weekly and daily updates, per-Activity operations (plan / log /
stock / review), shared reference data, budgets and pricing, and money follow-ups (B2B AR + retail
pending bills).

Success is **sheet retirement**: a spreadsheet is retired when the MOS surface that replaced it is
used in its place, by the people who used the sheet, without a parallel copy.

The bar was reset by owner decision (2026-07-04, era E6): **viable, not minimum**. Earlier "minimum
viable slice" framings kept failing on *viable* — MOS must capture the existing operation, not a
reduced model of it. Anything written before E6 describes an older bar (the requirements-evolution
timeline in the local docs repo).

## Positioning

Three things a neighboring internal tool could not truthfully copy:

1. **MOS owns settlement grain.** Money records originate in the POS/ERP (ESB), but the
   chase-to-cash lifecycle — open → chased → promised → partial → settled — lives in MOS, with a
   running balance, a required cash-in date, and **settled requires evidence**. It replaces Finance's
   per-invoice reconciliation sheet rather than reporting on it.
2. **Operations and management are one surface.** The same app a kitchen hand uses to log production
   at 6am is the app the owner reads margin from at 6pm — one taxonomy (BU → Activity → revenue
   stream), one identity, one permission model. No BI layer bolted onto an ops tool.
3. **Consumers link, never copy.** Reference data (recipes, costs, prices) has one owner and every
   consumer links to it. Forked reference cost is treated as a correctness defect, not a
   convenience.

## Operating Context

- **Navigation is a two-zone rail** (ADR-0025 D1, which superseded the earlier five-destination IA):
  workspace roots **Home · Work · Signals · Money** *(role-gated)* **· Inbox**, then **Modules grouped
  by Business Unit** (Retail Ops → Café, Ecommerce; B2B Ops → Roastery), then utility (Admin,
  Profile). Work carries four flat children: Signals · Tasks · Projects & Processes · Objectives.
  There is no "Plan" and no "Operate" destination — Plan folded into Work, Operate into the module
  zone. Kitchen and Bar are one **Café** module because they are one operating workflow. Home is a
  role-aware cockpit. Modules are scoped to the viewer's own affiliation: *the rail shows your work,
  not the org chart.*
- **Where it is used:** phones on a café/kitchen/roastery floor (standing, one-handed, gloves or wet
  hands, poor light, intermittent connectivity) and desktops for leads/BU-heads/owner doing weekly
  and money work. Both are primary; neither is the fallback.
- **Rituals it must fit:** the shift (production plan in the morning, log through the day, review and
  push at close), the work week (Monday triage, weekly update filed upward), the month
  (budget/pricing, AR chase).
- **Systems it sits beside:** ESB (POS/ERP — source of sales, products, BOM; MOS pushes production
  and reads a curated financial read-model), self-hosted Supabase (Postgres + Auth + RLS) shared with
  future Gordi ops apps via schema seams, and the spreadsheets being retired.
- **Languages:** bilingual **English / Bahasa Indonesia** (`mos-app/src/i18n/`). Floor staff read
  Indonesian; management copy is mixed. Both are shipping requirements, not a later feature.

## Capabilities and Constraints

Confirmed and shipping (on `dev`):

- **Work** — one record workspace with collections and saved views: Signals, Tasks, Projects &
  Processes, Objectives. A Task carries **PIC + Supervisor** (not task-level RACI — RACI lives on
  Objective / Project / Process). Status: Open · In Progress · Blocked · Done; archive, never delete.
- **The cascade is relations, not a route.** Objectives are readable by everyone and writeable at
  lead level, and carry a history of their changes. An Objective shows the Projects and Processes
  under it; a Project/Process shows both its parent Objective and the Tasks under it. Strategy is
  navigated by walking records, never by visiting a separate cascade screen.
- **Signal** — an intentional post (text + location/mention pills, `@` fuzzy match, attention level
  FYI / Needs attention / Urgent). It **replaced** mandatory Weekly Updates and the auto-mirrored
  Daily Log. Nobody files a report; people post what happened.
- **Café module** — plan, log, stock, review, ESB pushes. Real migrated production data (48 WIP /
  521 logs / 524 plans) and real staff logins. Ecommerce and Roastery modules are the same shape.
- **Home** — role-aware cockpit: a non-removable attention brief plus an authorized personal canvas.
- **Money** *(finance/admin only)* — AR/AP follow-ups and settlement. **Inbox** — one canonical
  router collection. **Admin** — people and access-role management.

Constraints future work must preserve:

- **`can()` capability authorization** with admin-editable roles; **RLS on every business table**;
  `org_id` tenancy seam. Permission shapes the UI — surfaces compose differently per role, and a
  `member` must never be shown a finance row.
- **Composition differs by persona on the same route.** A design that only works for one role is not
  done.
- Reversible migrations; schema separation (`shared` / `mos` / `ops` / `integrations` / `reporting`)
  rather than separate projects.
- Tech: React 19 + Vite + TypeScript + react-router-dom 7.

Terminology is fixed and binding (`CONTEXT.md`): **Task · Checklist item · Business Unit (a team) ·
Activity (an operating workstream) · Revenue stream (a money lens) · Follow-up · Module**. Copy must
use these words. "Business unit" never means an operating area; "Activity" never means a code module.

Explicitly undecided: which Activities beyond kitchen get an Operate module next, and the retirement
order of the remaining sheets.

## Brand Commitments

- **Name:** Gordi MOS. Internal product for Gordi (a coffee company).
- **De-reference firewall (binding, owner-set):** no external brand, product, or AGPL-licensed
  reference may appear in any MOS design artifact. MOS's design system is MOS's own. Naming another
  product as the visual target is a violation, not a shortcut.
- **Voice:** plain, concrete, non-corporate; bilingual EN/ID. Never invent numbers, claims, or
  customers in UI copy — every figure on screen must trace to real data or be visibly absent.
- No logo/wordmark asset has been supplied to this record.

## Evidence on Hand

Real, on hand:

- The JTBD oracle (v0.3, local docs repo) — owner-ratified persona × destination job stories; the
  product-intent oracle.
- `CONTEXT.md` (this repo) — binding domain glossary.
- The requirements-evolution timeline (local docs repo) — the E1→E6 era record; earlier docs are
  history, stamped.
- Numbered owner decisions (`OD-*`) and architecture decision records (ADRs), both in the local
  docs repo.
- Real production data on staging (kitchen: 48 WIP / 521 logs / 524 plans) and real staff logins.
- `mos-app/` — ~25 routes shipping on `dev`.

Absences future work must not fabricate: no testimonials, no benchmarks, no external customers (MOS
is internal, single-tenant-in-practice), no pricing or licensing story, no logo asset.

## Product Principles

1. **Usability and speed beat model completeness.** A fast surface covering 80% of the operation
   beats a faithful model nobody opens mid-shift.
2. **Viable, not minimum.** Capture the operation as it actually runs; a reduced model is a
   regression, not a phase.
3. **The floor is the hard case.** If it doesn't work standing, one-handed, on a small phone, in bad
   light, it doesn't work.
4. **Numbers must be traceable or visibly absent.** Every figure carries its provenance (as-of, next
   sync, why-blank). A confident wrong number is the worst outcome MOS can produce.
5. **One system, one vocabulary.** Same taxonomy, same components, same interaction paradigm across
   all five destinations. Divergence between analogous surfaces is a defect.

## Accessibility & Inclusion

- **WCAG AA** is the stated standard.
- **≥44px tap targets** on phone (already retrofitted app-wide) — the floor scene, not a checkbox.
- **The body must never scroll horizontally.** Wide content scrolls inside its own container;
  overlays clamp to the viewport.
- Legibility under real conditions: outdoor/low light, glare, wet or gloved hands, one-handed reach.
- Bilingual EN/ID: layouts must survive Indonesian string expansion without truncation or reflow.

---

<!-- Interview basis: repository evidence (the JTBD oracle v0.3, CONTEXT.md, the
requirements-evolution timeline, the owner-decision record — the latter three's non-repo items in
the local docs repo — mos-app/ routes, CLAUDE.md) plus a live owner answer round on 2026-07-27
covering redesign scope and the incumbent-world decision. Visual world decisions are deliberately
absent from this file — they belong to new-work / DESIGN.md. -->
