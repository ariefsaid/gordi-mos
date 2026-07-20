# Owner-directives composite-oracle index — the redesign's binding "what good looks like"

> **The oracle is NOT e7.** Owner correction, verbatim (2026-07-19): *"i dont want to look exactly
> like e7, thats what i keep saying. when e7 came out there are already a few features and looks that
> were missed along the way. that why i keep calling it like a moving quicksand."*
>
> So the target is the **COMPOSITE**, resolved in this precedence:
> 1. **owner-word** — the owner's verbatim directives (top of stack, always win);
> 2. **lost-good** — anything an *earlier* mockup generation got right that a *later* one (e7 itself
>    included) dropped, where no owner word or OD supersedes it;
> 3. **owning-default** — the generation that OWNS a surface per `SALVAGE-INVENTORY.md`, used **only**
>    where tiers 1–2 are silent.
>
> This file is the **standing oracle** for the redesign. It does not replace the law
> (`decisions.md` OD-REDESIGN-*, `experience-contract.md`, ADR-0025); it **indexes** where each
> binding directive lives, what surface it binds, which tier decides it, and its status at branch tip.
> Reviews check touched surfaces against it; a transplant/port uses the composite (not "match e7")
> checklist per surface.

**How this was built (imports, not re-derivation).** The lost-good / superseded / evolved-better
classifications are **imported** from the cross-version audits already on record — do not re-derive
them here:
- `docs/reviews/final-mockup-fidelity-audit-2026-07-18.md` (LG-1/2/3 + the superseded near-misses),
- `docs/reviews/final-intent-fidelity-audit-2026-07-18.md` (owner-verbatim-vs-built, the twists),
- `docs/reviews/parity-sweep-2026-07-18.md` (computed-style + words→code, B1/B2),
- `docs/reviews/design-authority-audit-2026-07-17.md` (owner prefs that never became law),
- `docs/design-mockups/redesign-mockups-2026-07/{SALVAGE-INVENTORY,CONVERGENCE-AUDIT}.md` (ownership +
  the 13-item a/b/c classification + the 11 explicit overrides),
- `docs/decisions.md` OD-REDESIGN-56..70 (the owner-quoted buildout-era directives),
- `docs/reviews/claude-redesign-buildout-completion-vdrd17.md` (the consolidated 19-item ratify list +
  fast-follows — the tracker names cited below).

**Status legend:** `SHIPPED <cite>` · `PARTIAL` (shipped incomplete) · `OPEN-TRACKED <tracker>` ·
`OPEN-UNTRACKED` (open, no tracker — fix-queue input) · `SUPERSEDED-by-OD` · `CONFLICT-needs-owner`
(gen-vs-gen, no owner word — rendered A/B later). Provenance line refs (`03:NNN`) are into
`docs/reference/provenance/{01,02,03}-*.md`; ledger cites into `docs/reviews/`.

---

## Index

### Tier 1 — owner-word (verbatim directives; always win)

| P-### | Verbatim / artifact (≤20w) | Source | Binds (surface / behavior) | Tier | Status @ tip |
|---|---|---|---|---|---|
| P-01 | "ease of use by high schooler, intuitive and follows UI/UX best practice and industry conventions" | 01:134 | whole-app usability bar; founding acceptance test | owner-word | **PARTIAL** — convention/best-practice audit run + fixes 2026-07-18 (parity-sweep §Convention); Rule-12 cold-start still **judgment-only, not measured** (vdrd17 boundary #2) |
| P-02 | "be as critical for all the design it currently has" → free redesign of IA/IxD/UI/UX | 01:331, 01:134 | existence of the redesign | owner-word | **SHIPPED** — redesign built (buildout steps 1–11, vdrd17 ledger) |
| P-03 | fork/quicksand: "when we did a new version… the other part that is already good… get changed" | 03:2675, 03:11 | process — cross-version fork-catching every design review | owner-word | **SHIPPED** — OD-REDESIGN-65 + this composite oracle |
| P-04 | "i dont want to look exactly like e7 … features and looks were missed along the way … moving quicksand" | (this run, 2026-07-19) | the oracle = composite, not e7-fidelity | owner-word | **SHIPPED** — this file |
| P-05 | Signal = FB-style post: "a text box, … pills (add location, add mention), @ fuzzy match with category" | 02:4343 | Signal composer (capture-minimal + pills + `@` type badges) | owner-word | **SHIPPED** — step-4 signal-composer.tsx, AC-420 (four fields @≤390px) |
| P-06 | "an icon to add image" on the composer (stated 3×; every other element of the sentence shipped) | 02:4343, 03:149 | Signal composer image/evidence attach | owner-word | **OPEN-TRACKED** — OD-69(i) accepted as its own slice (needs Supabase storage+bucket RLS); backlog |
| P-07 | "Process Run should almost never be an entry point; a barista sees 'Today's checklists'" | 03:96, 03:439 | occurrences surface as Tasks; "Process Run" never a UI noun | owner-word | **SHIPPED** — OD-58; AC-622/AC-714 assert the string never renders |
| P-08 | Task binds PIC to a **job function**, resolves to holder at spawn; turnover remaps holder, never the Process | 03:439 | generated-Task assignment indirection | owner-word | **SHIPPED** — OD-58; step-6 build (RATIFY-9 grain) |
| P-09 | F2 café demo: "'Start today's opening' → one Task with checks … provenance 'PIC: Ayu — via Barista on shift'" | 03:638 | café opening surface + provenance line | owner-word | **PARTIAL** — "via \<Role\>" shipped; **"on shift"** not rendered (roster not built — honest degrade, intent-audit B4 sub-note) |
| P-10 | attention is FYI / Needs attention / Urgent; the feed and Home order by it | 02 (grill L2081-2098) | Signal attention triage cue + feed weighting | owner-word | **PARTIAL** — column + display/weight shipped, but **no control to SET/raise** (composer hard-codes FYI) → OPEN-TRACKED ratify item 5 |
| P-11 | two fronts: "manager efficiency AND barista obviousness; neither is sacrificed" | 03:2736, 03:2654 | role-adaptive disclosure on every surface | owner-word | **SHIPPED** — OD-66 / OD-61; step-6 manager front re-scored 8.5/10 |
| P-12 | "might as well reiterate when building rather than reiterating twice" → mockup phase closed | 03:2654 | no more mockup rounds; iterate in mos-app | owner-word | **SHIPPED** — OD-56 / OD-65 |
| P-13 | frame sketch: breadcrumb + ⌘K header; Work▸4 collections; Events rail root; universal actions in ⌘K | OD-57 (03 sketch) | shell / rail / header anatomy | owner-word | **SHIPPED** — parity-verified (parity-sweep Axis-2, 13 shipped-as-said) |
| P-14 | "the rail shows YOUR work, not the org chart" — modules only for role-affiliated viewers | OD-68 (03 sketch omission) | rail + phone More scoping | owner-word | **PARTIAL** — desktop rail + More menu shipped (AC-011); **phone bottom-tab still hardcodes Café for everyone** → OPEN-UNTRACKED |
| P-15 | Work children are "plain indented labels" (sketch), not icons | 03:736 | rail Work-children treatment | owner-word | **SHIPPED** — OD-69(ii); icons reverted, parity-verified |
| P-16 | Task record = Team + PIC + Supervisor + Due + source; **RACI removed from Task surfaces** | OD-62 (03 Fork 3) | Task record renderer | owner-word | **SHIPPED** — parity Axis-2 (PIC/Supervisor no-RACI verified) |
| P-17 | in-list click = shared split drawer; direct URL/new-tab/refresh = full canonical page | OD-63 (03 Fork 4) | record surface (drawer + page mode) | owner-word | **PARTIAL** — drawer shipped; **page-mode branch unbuilt** → OPEN-TRACKED ratify item 6 (Signal full-page OD-63) |
| P-18 | Signal feed on Home below the non-removable attention brief; Work = Signals archive only; no Updates root | OD-59 | Home composition + Signal home | owner-word | **CONFLICT-needs-owner** — built as specified but **Q1 stays provisional**; final ratification reserved to post-step-11 (ratify item 1) |
| P-19 | "kitchen + Bar should be Cafe" | 03 (verbatim; convention audit) | café naming (nav + page titles + body) | owner-word | **SHIPPED** — step-7 rename; page-title drop fixed 2026-07-18 (parity-sweep §Convention) |
| P-20 | "Place the language settings in the personal profile as selection" | OD-70 | /profile page; rail LocaleToggle removed | owner-word | **SHIPPED** — OD-70; /profile real page, PageHead adopted (second-pass #7) |
| P-21 | Weekly Update / Daily Log retired — Signal supersedes; no review roster/filing in front of staff | OD-33/48/64 | Home; no retired-cadence surface | owner-word | **PARTIAL** — TeamModule roster leak FIXED (`beca0dc`); **ratify whether `SHOW_WEEKLY_UPDATES` flips false globally** → OPEN-TRACKED ratify item 18 |
| P-22 | Signal author/deputy can retract-and-repost for wrong provenance | OD-45 (step-4 ledger) | Signal record retract control | owner-word | **PARTIAL** — DB gate built (AC-412); **no UI control** → OPEN-TRACKED ratify item 16 |
| P-23 | from a Signal, "Create follow-up Task" pushes the **canonical Task composer** with context prefilled | OD-39/D25 | Signal→Task creation | owner-word | **PARTIAL** — ships a minimal title-only auto-R=A=viewer capture, not the canonical composer → OPEN-TRACKED ratify item 17 |

### Tier 2 — lost-good (earlier generation right, later dropped it; nothing supersedes)

| P-### | Artifact (≤20w) | Source | Binds | Tier | Status @ tip |
|---|---|---|---|---|---|
| P-24 | e7 Inbox had **All / Unread / Handled** triage-state filter tabs; the build lost them | final-mockup-audit LG-1 (:52) | Inbox page | lost-good (e7→build) | **OPEN-TRACKED** — fast-follow (a), vdrd17 ledger |
| P-25 | "empty data is shown as a **state, not a dash**" — Home money glance regressed to bare "—" tiles | final-mockup-audit LG-2 (:69); G0 option-a | Home money-glance KPI tiles | lost-good (e7f/G0→build) | **OPEN-TRACKED** — fast-follow (b): implement KPITile `empty` state |
| P-26 | every KPI card printed its **drill target** + multi-source freshness/basis provenance ("AP stale · as of 7 Jul") | final-mockup-audit LG-3 (:89); money.html/probes | money + attention KPI cards | lost-good (e7f→app; soft) | **OPEN-TRACKED** — fast-follow (c): re-verify once Money has snapshot data |

### Tier 2b — superseded near-misses (imported so they are NOT re-litigated as regressions)

| P-### | Artifact (≤20w) | Source | Binds | Tier | Status @ tip |
|---|---|---|---|---|---|
| P-27 | e7 café measured-checks + inline "Exception →" → plain checkboxes | final-mockup-audit near-miss #1 | café checklist | (was e7) | **SUPERSEDED-by-OD** — OD-58 (convergence flattened; exceptions → Signals + Correction Tasks) |
| P-28 | check-level **evidence / photo attach** in e7 kitchen (9 evidence / 4 photo hits) | kitchen.html (G1) | café/kitchen checklist evidence | e7-loss found | **SUPERSEDED-by-OD** — evidence now flows via Signal; photo via image-attach OD-69(i)/P-06 |
| P-29 | rich Home cockpit: compose-your-home, weekly filing, objectives cascade, global Capture FAB | final-mockup-audit near-miss #2 | Home | (was e7f/home.html) | **SUPERSEDED-by-OD** — D8 two-region Home; OD-33 (Weekly retired); OD-23 (customization) |
| P-30 | lane-color (Run / Optimize / Transform) categorical system | probe-signal.html / probe-warmer.html | color identity | (probe) | **SUPERSEDED-by-OD** — never ratified; One-Blue + Tinted-Status stands (DESIGN.md) |
| P-31 | e7 8-collection / 4-heading Work rail · "Process Run" noun · Money stub shown to gated users | SALVAGE overrides #3/#7/#8 | Work rail / café / Money | (was e7) | **SUPERSEDED-by-OD** — explicit override list; build correctly omits |
| P-32 | options a/b/c "Now · Operate · Plan" 5-flat-destination IA | full-redesign-2026-07 (G0) | IA / rail | (was G0) | **SUPERSEDED-by-OD** — ADR-0025 D1 (modules-in-rail, Home·Work·Events·Money·Inbox) |
| P-33 | convergence "My work · Team work · Library" Work children | SALVAGE override #11 | Work children | (was convergence) | **SUPERSEDED-by-OD** — OD-57 four collections; My/Team/Overdue → saved-view chips |
| P-34 | convergence bottom-sheet ⌘K placement | SALVAGE override #10 | ⌘K palette | (was convergence) | **SUPERSEDED-by-OD** — e7 centered modal ported (parity Axis-1 CLEAN) |

### Tier 3 — owning-default (SALVAGE ownership; used only where tiers 1–2 are silent)

| P-### | Artifact (≤20w) | Source | Binds | Tier | Status @ tip |
|---|---|---|---|---|---|
| P-35 | Task table / DB-view grammar (density, columns, grouping, inline) | SALVAGE — e7 OWNS | Tasks workspace | owning-default (e7) | **SHIPPED** — canonical `TasksWorkspace`; parity Axis-1 CLEAN |
| P-36 | ⌘K = centered modal presentation; contents = Ask Deputy · Share Signal · Create Task + Navigate | SALVAGE — e7 OWNS (#10) | ⌘K palette | owning-default (e7) | **SHIPPED** — parity Axis-1 (centering + SVG icons, 0 emoji after A1 fix) |
| P-37 | record renderers (Task/Signal/Process/Standard/Objective/Follow-up), relations, activity threads | SALVAGE — e7 OWNS | record pages | owning-default (e7) | **PARTIAL** — thin/panel-only in places (see P-17); management lists shipped |
| P-38 | FB-style composer + occurrence surfaces + the frame + URL grammar (canonical route/collection) | SALVAGE — convergence OWNS | composer / occurrences / shell / routing | owning-default (conv) | **SHIPPED** — steps 4/6, URL grammar per Rule 4 |
| P-39 | capture-first phone disclosure (bottom nav + FAB, ≥44px, one "View options") + 4-region anatomy | SALVAGE — convergence OWNS | phone layout | owning-default (conv) | **SHIPPED** — Rule 8/9 (step-5 phone re-review APPROVE) |

---

## OPEN-UNTRACKED — the fix queue (open, no existing tracker)

These have **no** ratify-item, backlog line, or fast-follow of their own. They are the additions this
oracle contributes to the fix queue.

1. **Phone bottom-tab bar hardcodes Café as a primary tab for every viewer** — OD-68 ("rail shows your
   work") was applied to the desktop rail + phone More menu, but **not** to the phone bottom tabs. A
   viewer with no Café affiliation still gets Café as a primary phone tab. Mentioned once in the vdrd17
   ledger as an "open follow-up" under ratify-14 but never given its own tracker. (P-14)
2. **Desktop decision-column no-clip invariant is not an enshrined scored rule.** "Decision-relevant
   columns never clip at ≥1280px (e7's calm fit is the bar)" recurred as a defect across review rounds
   and was ruled a **standing convention** (design-authority O3), with codification as an
   Experience-Contract clause only *proposed* at step 11. Rule 9 covers the *mobile* collapse, not the
   desktop no-clip bar — so any new dense surface (Signals archive, Money, catalog) can regress it with
   no scored rule to catch it.
3. **Café capture-link default-active tab render (low-confidence).** On one desktop capture the "Plan"
   café capture-link rendered as filled/active though the four Log/Plan/Stock/Review links are peers
   with no active route (final-mockup-audit TIF-3). Likely a transient `:focus-visible` artifact; not
   reproduced as a floor persona; confirm the four links are equal-weight at rest.

*(Process nit, non-surface: `design-reviewer.md:35`'s role-lens example still says "completing a Task
or **Process Run**" — stale vs OD-58's UI-forbidden noun; the rest of the agent file was correctly
migrated to the redesign stack. Cosmetic.)*

## CONFLICT-needs-owner — the owner's only A/B calls (gen-vs-gen, no owner word)

Kept short and real: only genuine generation-vs-generation disagreements no owner word decides. These
get rendered-A/B treatment.

1. **Action-verb family** — the ⌘K palette says **"Create Task"**; the surface primary buttons say
   **"+ New task" / "Add Objective / Add Project"**. e7 + convergence use "Create …"; G0 option-b used
   "New …"; two reviewers pulled opposite directions (Rule-7 bare-verb fix vs mockup verb fidelity). An
   owner taste call — pick one family, lock it as a convention. (vdrd17 ratify item 19)
2. *(status is canonical in the ledger's register — see `docs/reviews/claude-redesign-buildout-completion-vdrd17.md` § Ratify before merge)* **Q1 — Signal-on-Home placement** (P-18) is direction-approved but **final look reserved** by the
   owner to the post-step-11 review (OD-59 provisional). Not gen-vs-gen; listed here because it is an
   owner A/B still owed: (A) ratify as built — ambient feed below the non-removable brief, Work =
   Signals archive only, no Updates root; (B) change the region order / make Work-primary.

*(Prior owner A/B forks already SETTLED, so NOT listed: brand identity vs the 2018 Gordi guideline —
owner "leaving alone, log as one-liner" (design-authority O1 disposition); radius scale — OD-69(iii)
restored the e7-aligned 8/12; Work-children icons — OD-69(ii) reverted to plain labels.)*

---

## Row counts

**By tier:** owner-word 23 (P-01..P-23) · lost-good 3 (P-24..P-26) · superseded near-misses 8
(P-27..P-34) · owning-default 5 (P-35..P-39). **Total 39 rows.**

**By status:** SHIPPED 17 · PARTIAL 7 · OPEN-TRACKED 5 (P-06 backlog OD-69i; P-10 ratify-5; P-17
ratify-6; P-21 ratify-18; P-22 ratify-16; P-23 ratify-17; P-24/25/26 fast-follows a/b/c — 6 tracked
lines across those) · OPEN-UNTRACKED 3 (list above) · SUPERSEDED-by-OD 8 · CONFLICT-needs-owner 1
(+1 owner-provisional, P-18).

---

*Referenced from: `docs/reference/provenance/README.md` · `docs/redesign-decision-index.md`
§ Provenance · `docs/backlog.md`. Standing oracle — reviews score touched surfaces against the
composite (tier 1 → 2 → 3), never against "match e7."*
