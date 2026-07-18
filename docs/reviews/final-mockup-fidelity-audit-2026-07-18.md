# Final Cross-Version Mockup-Fidelity Audit — Gordi MOS redesign buildout

**Date:** 2026-07-18 · **Reviewer:** design-reviewer (Director-dispatched) · **Mode:** OD-REDESIGN-65
cross-version fork-catching across the FULL mockup lineage (not just e7/convergence).
**Owner's fear addressed:** "quicksand — between fixing one thing and the other, things got twisted
from prior revisions." **Method:** rendered every surface in the built app AND every generation's
treatment of that surface (oldest → newest), classified each earlier good answer the build lacks as
LOST-GOOD / SUPERSEDED / EVOLVED-BETTER, and flagged build-only inventions as TWIST-IN-FLIGHT.
**Read-only on source.** Screenshots: `scratchpad/fidelity-audit/` (see inventory).

**Precedence applied:** explicit owner/OD override (SALVAGE-INVENTORY list) → experience contract →
owning mockup → earlier versions as evidence.

---

## Generations consulted (nothing skipped)

| # | Generation | Server | Surfaces rendered & inspected |
|---|---|---|---|
| G0 | full-redesign-2026-07 (IA exploration, oldest) | :8767 | option-a-now, option-b-work, option-c-ops (all three, full page) |
| G1 | e7 per-surface historical files | :8766 | home.html, work.html, kitchen.html, money.html, roastery.html, prototype.html, a-orient, b-four, c-five, probe-signal, probe-warmer |
| G2 | **e7-prototype.html** (Phase-0 candidate) | :8766 | #/home, #/work/tasks, #/work/signals, #/cafe, #/money, #/inbox, #/events, #/work/library, #/work/objectives (impersonating Ayu, café operator) |
| G3 | **convergence-flows** (owner-frame predecessor, newest mockup) | :8134 | #/home, #/cafe, #/work/tasks (occurrence `occ_cafe_open_today` + overdue), #/work/signals |
| G4 | **Built app (AS-BUILT)** | :5173 | Home (attention/my-items, phone), Tasks (table + drawer + checklist tab, phone), Signals (archive + record + composer), Projects & Processes, Objectives, Events, Money, Inbox, Café (landing + started + Log/Plan/Stock), ⌘K palette, phone (home/tasks/cafe/signals). Users: dewi (MD), cahya (Café Ops Lead) — least-priv rail verified. |

Authority map cross-checked: SALVAGE-INVENTORY.md (ownership + the 11 explicit overrides),
CONVERGENCE-AUDIT.md (how versions superseded), experience-contract.md Rules 1–12.

---

## Per-surface verdict table (surface × generations × verdict)

| Surface | Owning mockup | Generations consulted | Verdict |
|---|---|---|---|
| **Home** | convergence (frame) + e7 (visual) | G0 optA/B, G1 home.html, G2 e7-home, G3 conv-home, G4 | **FAITHFUL** to convergence (attention brief + ambient Signal feed + composer + light money glance). G1's compose-your-home / weekly-filing / objectives-cascade = SUPERSEDED (D8 two-region, OD-33 retirement). One MINOR loss (money-glance dashes) + one soft loss (explicit drill labels). |
| **Signal composer** | convergence | G1 probe-signal, G2, G3 conv-home, G4 | **FAITHFUL** — capture-minimal 4 fields (content + owning Team + occurred-at + author), "Category is added after posting — never blocks capture", `@` = Person/Team/BU. No A1/A2 violation. |
| **Signal feed / record** | e7 (record) + convergence (feed) | G1, G2, G3, G4 | **FAITHFUL** — archive search + "Show retracted"; record has Acknowledge + "Create follow-up Task" + Link existing, NO workflow/status/resolve verb (A1 clean), Acknowledge ≠ ownership (A2 clean), mention pill + "Visible to … · notify N" (A3 clean). |
| **Tasks workspace + drawer** | e7 (grammar) + convergence (URL/saved-views) | G0 optB, G1 work.html, G2 e7-work, G3 conv-tasks, G4 | **FAITHFUL** — Table/Board/Calendar, My work/Team/Overdue/Follow-ups chips, Group/Unit/Status/Person filters, split drawer + "Open full page", RACI (PIC+Supervisor), inline occurrence source. E7's 8-collection rail = OVERRIDDEN (#3). MINOR: inline-edit hint line dropped; "Calendar" replaces e7 "Timeline". |
| **Task occurrence / checklist** | convergence (OD-58 one-Task-with-checks) | G2 e7-cafe, G3 conv-occ, G4 | **FAITHFUL (superseded chain verified)** — occurrence = generated Task, derived roll-up, "View tasks" into `?occurrence=`. E7's inline measured-check + "Exception →" = SUPERSEDED by convergence's plain-checkbox + Signal-as-exception model (verified in conv-occ 0/9 checkboxes). MINOR: built seed checklist (4 generic steps) thinner than convergence seed (9 spec-named steps). |
| **Café home** | convergence (occurrence-as-Task) | G0 optC, G1 kitchen.html, G2 e7-cafe, G3 conv-cafe, G4 | **FAITHFUL** — "Start today's opening" (verb+object, no "Run" noun), roll-up, Log/Plan/Stock/Review capture screens retained. E7's "Continue Run / Opening Run / No active Run" noun = OVERRIDDEN (#7). Fast-capture +/- stepper (G0 optC) survives in Café Log. |
| **Money** | e7 | G0 optA, G1 money.html, G2 e7-money(gated), G3 (n/a), G4 | **FAITHFUL (empty) / NOT FULLY EVALUABLE (populated)** — well-designed empty state ("No sales snapshot data yet"); gated users correctly denied. Populated fidelity to G1 e7f-money's multi-source provenance + per-card drill labels + revenue-by-stream **could not be confirmed** (no snapshot data in env). |
| **Inbox** | e7 (page + quick panel) | G0 (triage panels), G2 e7-inbox, G4 | **LOST-GOOD (minor)** — E7 Inbox had **All / Unread / Handled** triage-state filter tabs; the build lost them (mark-read-on-open only, no filter). Nothing on the override list supersedes it. |
| **Objectives / Projects & Processes** | e7 (record pages) | G0 optB, G1 home.html, G2, G4 | **FAITHFUL-THIN** — management list (Add/Rename/Archive) + light roll-up ("2 tasks · Daily IG Content (1)"). Richer objective→work downward-drill (G0 optB, G1) is simplified; likely slice scope. Soft observation, not a regression. |
| **Events** | (post-E7 owner addition) | G3 stub, G4 | **FAITHFUL** — well-designed stub ("Nothing scheduled yet"). Events is a 2026-07-14 owner addition (Rule 3 RATIFIED); absent from G0–G2 by design, not a loss. |
| **Roastery** | (deferred slice) | G1 roastery.html, G4 stub | **FAITHFUL (deferred)** — built as SliceStubPage by design; G1's rich roastery is deferred scope, not a regression. |
| **Shell / rail / ⌘K / phone** | convergence (frame) + e7 (⌘K) | G0–G3, G4 | **FAITHFUL** — rail = Home·Work(Signals·Tasks·Projects & Processes·Objectives)·Events·Money[gated]·Inbox + Retail Ops/B2B Ops modules + Admin/Profile. ⌘K = centered modal (e7, override #10 respected — not bottom sheet) with Ask Deputy·Share Signal·Create Task + Navigate. Phone: bottom nav (Home·Work·Café·Inbox·More) + FAB, single "View options" control, tables→record cards (Rule 8/9). Progressive disclosure verified (cahya rail hides Money/Admin/Objectives). |

---

## LOST-GOOD list (earlier answer better, nothing supersedes it)

### LG-1 — Inbox lost the All / Unread / Handled triage-state filter (MINOR)
- **Which version had it:** G2 e7-prototype `#/inbox` — header carried **All · Unread · Handled**
  segmented filter tabs over "triage then return to the source record". e7 is the **owning mockup**
  for Inbox (SALVAGE-INVENTORY: e7 OWNS "Inbox (page + quick panel)").
- **Build side:** `/inbox` renders a flat notification list with unread dots; opening a row marks it
  read and routes to source (`inbox-page.tsx` / `useNotifications` exposes only
  `{notifications, markRead, …}` — no filter state). No way to filter Unread or review Handled.
- **Evidence:** `fidelity-audit/e7-inbox.png` (filter tabs) vs `fidelity-audit/dewi-inbox-desktop.png`
  (no tabs).
- **Why nothing supersedes it:** not on the 11-item override list; convergence flows never
  re-litigated Inbox; no OD removes triage-state filtering. It is a manager-front (OD-REDESIGN-66)
  affordance — separating handled from unhandled is core to a triage inbox that accumulates.
- **Suggested disposition:** restore All/Unread/Handled (or at least Unread/Handled) on the Inbox
  page. Low effort; the notification model already carries a read flag. **Regression-invariant
  candidate:** assert the Inbox page renders a state filter and that "Handled"/"Unread" partition the
  list (unit/RTL layer).

### LG-2 — Home money-glance reintroduces bare "—" finance tiles (MINOR)
- **Which versions had it better:** G0 option-a ("Empty data is shown as a **state, not a dash**"),
  G1 e7f-home / e7f-money, G1 probe-signal — every money figure is either a real value with a drill
  target or a **designed state**, never a bare em-dash. G1 e7f-money even distinguishes source
  freshness ("Revenue live · 12 min ago · AP stale · as of 7 Jul").
- **Build side:** Home money glance renders three cards as **"Trailing 7-day revenue —" /
  "Gross margin (interim) —"** (bare em-dash values) with a single shared "No snapshot yet · next
  sync 03:30 WIB" line. This is precisely the disease the redesign set out to cure
  (README teardown #2/#4: "finance tiles show —", "real zeroes indistinguishable from broken
  pipelines").
- **Evidence:** `fidelity-audit/app-home-tall.png` vs `fidelity-audit/e7f-home.png` /
  `fidelity-audit/e7f-money.png`.
- **Why nothing supersedes it:** "empty = designed state, not a dash" is a durable
  cross-generational quality bar (appears G0→G1→README), never overridden. The build's Money **page**
  honors it (designed empty state); only the Home glance regresses to dashes.
- **Mitigation present:** the shared "No snapshot yet · next sync 03:30 WIB" line means the tiles are
  not *indistinguishable* from a broken pipeline — hence MINOR, not material.
- **Suggested disposition:** give each Home money tile a per-card quiet empty treatment ("No snapshot
  yet") instead of a bare "—", matching the Money page and the cross-generational answer.

### LG-3 (soft) — Money/attention cards no longer declare an explicit drill target; single-line provenance
- **Which versions had it:** G0 optA (per-row "Next action" buttons), G1 e7f-home / e7f-money /
  probe-signal — **every** KPI card printed its drill target ("drill → Money", "→ Work · Follow-ups")
  and rich multi-source provenance ("basis: interim", "AP stale · as of 7 Jul"). JTBD anchor A4 +
  README "Every cockpit number drills … each KPI declares its drill target."
- **Build side:** money/attention cards **do drill** (verified: revenue card → `/money`, attention
  items → task/signal records — A4 functionally intact) but do **not** show the explicit "→ Money"
  affordance, and provenance is a single shared "next sync" line rather than per-source freshness.
- **Why soft:** the drill works (A4 not broken); the loss is only the *visible declaration* + richer
  provenance. Populated Money page could not be evaluated (no snapshot), so multi-source provenance
  fidelity is **unconfirmed**, not confirmed-lost.
- **Suggested disposition:** re-check once Money has snapshot data; if the populated built Money omits
  per-card drill labels + basis/freshness chips, escalate to LOST-GOOD.

---

## TWIST-IN-FLIGHT list (build matches NO generation — invented mid-build)

### TIF-1 — Home money glance as three bare-dash cards (MINOR; = LG-2)
No generation rendered the Home money region as three bare "—" cards under one shared freshness line
(e7f-home used 4 drill-labeled KPI cards; convergence Home for a non-money persona had no money
region). The build's composition is its own. **Justified in intent** (D8: light money glance on Home,
detail in Money) but the **execution** (bare "—") drifts from the cross-generational "empty = designed
state" principle. See LG-2 for disposition.

### TIF-2 — "+ New task" / "Add Project / Process" / "Add Objective" primary-button wording (MINOR)
The Tasks / Projects / Objectives primary buttons say "New task" / "Add …". The ⌘K palette and every
recent generation (e7, convergence) consistently say **"Create Task"** (Rule 7's cited verb). "New"
has *lineage precedent* (G0 option-b used "New objective/New task"), so it is a reversion to older
wording rather than a pure invention — but it is inconsistent with the palette in the same build and
flirts with Rule 7's "no bare New" clause (mitigated: the object is named). **Disposition:** align to
"Create Task"/"Create Project"/"Create Objective" for verb consistency with the palette.

### TIF-3 — Café landing: capture-link row occasionally renders a tab as filled/active (LOW-CONFIDENCE)
On one desktop capture the "Plan" capture-link rendered with a solid blue fill (as if active) while
the four Log/Plan/Stock/Review links are peers with no active route. Likely a transient
`:focus-visible`/`:active` artifact from keyboard nav rather than a persistent bug (not reproduced as
cahya). **Disposition:** confirm the four café capture links are visually equal-weight at rest (no
default-selected tab). Evidence: `fidelity-audit/dewi-cafe-desktop.png` vs
`fidelity-audit/cahya-cafe-started.png`.

---

## What the cross-version sweep proved was SUPERSEDED (not quicksand) — the near-misses

These looked alarming against an *earlier* generation but the *intermediate* generation shows the
loss was a conscious owner/OD decision — exactly what OD-REDESIGN-65 fork-catching is meant to
separate from genuine regressions:

1. **Café measured-checks + inline "Exception →" (E7) → plain checkboxes (build).** E7 rendered the
   opening as measured checks with submitted values and inline exception escalation. **convergence
   (G3) already flattened this** to plain labelled checkboxes ("Chiller temp 2–4°C", 0/9 done) and
   moved exceptions to Signals + Correction Tasks (verified: conv-home Signal "Chiller read 8.2°C …
   Correction Task open"). Build matches convergence. **SUPERSEDED by OD-58 one-Task-with-checks.**
2. **Rich Home cockpit (e7f-home: compose-your-home, weekly filing, objectives cascade, Capture FAB).**
   SUPERSEDED — D8 two-region Home; OD-33 retired Weekly Update; OD-23 confines customization; the
   ambiguous global "Capture" was explicitly rejected for the Action Launcher.
3. **E7 8-collection / 4-heading Work rail; "Process Run" noun; Money stub for gated users.**
   All on the explicit override list (#3, #7, #8) — build correctly does NOT port them.
4. **Lane-color (Run/Optimize/Transform) categorical system (probe-signal).** A *probe*, never
   ratified into DESIGN.md; the One-Blue + Tinted-Status identity stands. Not adopting it is the
   default, not a loss.

---

## Overall verdict: **MINOR-LOSSES**

The as-built app is a faithful implementation of the **binding** newest generation (convergence
owner-frame + e7 visual/record system). The full-lineage sweep found **no material or structural
quicksand** — every high-stakes scare (café checks, home cockpit richness, Run-noun, work rail) was
verified as a *conscious supersession* by reading the intermediate generation, not a twist. The
genuine residue is small and cosmetic-to-minor:

- **LG-1** Inbox All/Unread/Handled filter (real loss vs the e7-owned Inbox; restore).
- **LG-2 / TIF-1** Home money-glance bare "—" tiles (re-opens the "finance tiles show —" disease in
  one spot; give each tile a designed empty state).
- **LG-3** explicit drill labels + multi-source provenance on money cards (soft; re-verify populated).
- **TIF-2** "New task" vs palette "Create Task" wording inconsistency.
- **TIF-3** café capture-link default-active render (low-confidence).

None blocks ship on fidelity grounds. Route LG-1, LG-2, TIF-2 to ui-implementer as a small polish
pass; re-verify LG-3 (Money populated) when snapshot data exists. **Regression-invariant candidates**
for the Director: LG-1 (Inbox state filter) and LG-2 (no bare-dash finance tile) are the two worth
encoding as tests at the unit/RTL layer.
