# Design-authority consistency audit — 2026-07-17

**Author:** fresh-eyes audit agent (read-only sweep, no code/law changed; this is the only file written).
**Why:** the owner suspects confusion between mockup versions and design-authority docs is misleading the
in-flight 4-lens design reviews (the step-4 Signal review BLOCKed correctly but cited *both* `--e7-*` and
`DESIGN.md` tokens as the fix target — a token-authority ambiguity).
**Sources swept:** the two mockup sets + their manifests (SALVAGE-INVENTORY, README×2, CONVERGENCE-AUDIT,
PHASE-A/PROTOTYPE briefs), the law (`experience-contract.md`, `jtbd.md`, `decisions.md`
OD-REDESIGN-1..67, ADR-0025 D1–D41, `redesign-decision-index.md`, `DESIGN.md`, `twenty-ixd-patterns.md`),
the provenance extracts (01/02/03), the step-4 + steps-1–3 review ledgers, `.claude/agents/design-reviewer.md`,
`design-workflow.md`, and the real token files (`mos-app/src/styles/tokens/*`, `e7-prototype.css`).

Severity key: **Misleads-reviews-NOW** (actively corrupting the step 4–11 reviews) · **Latent** (will bite a
later step) · **Cosmetic** (tidy-up).

---

## A. Token / visual authority conflicts — 3 findings

**A1 — SALVAGE-INVENTORY blesses `--e7-*` as "the visual system," but the app's binding token authority is
DESIGN.md's `--ds-*`/brand system. No doc reconciles the two. [Misleads-reviews-NOW]**
- Evidence: `SALVAGE-INVENTORY.md:30` — e7 OWNS "the **visual system**: `--e7-*` tokens, type scale, chrome,
  card/pill/table primitives." `SALVAGE-INVENTORY.md:22` even calls e7 "the visual bar for the redesign skin."
- Counter-authority: `CLAUDE.md` ("`DESIGN.md` … is the design-system source of truth"); `DESIGN.md:201-207`
  ("This file is the identity authority (OD-DIR-8). Runtime tokens live in `mos-app/src/index.css` … the
  clean-room `mos-design-kit` (990 `--ds-*` tokens)"). The real app tokens are `--ds-*` + `--brand-navy/orange`
  + `--status-*-text` (`mos-app/src/styles/tokens/theme-light.css:11+`, `theme-dark.css`, `aliases.css`).
- Proof the two namespaces are disjoint: `e7-prototype.css` defines `--e7-bg/-surface/-action/-brand/-done/…`
  (lines 9-52) and contains **zero** `--ds-*`/`--brand-navy`/`--primary` references. The app `src/` contains
  **zero** `--e7-*` (the one hit is `token-values.test.ts`, a guard). `feat-redesign-buildout.md:68` shows a
  reviewer already policing this: "I found **no `--e7-*` runtime token leak** in the reviewed app CSS files."
- So the true rule is: **app surfaces bind to `--ds-*`/DESIGN.md; `--e7-*` is a mockup-only namespace that must
  never appear in app CSS.** But that rule is written nowhere a builder/reviewer reads first — SALVAGE-INVENTORY
  (the binding read-first for UI steps) says the opposite-sounding thing. A builder told to "port e7's visual
  system" reaches for `--e7-*`; a reviewer told to "audit against DESIGN.md tokens *and* the Phase-0 mockup"
  (design-reviewer Lens a) is handed two vocabularies. That is exactly the step-4 double-citation.
- **Disposition:** add one line to SALVAGE-INVENTORY §"e7 … OWNS": *"e7's visual DECISIONS are authority;
  implement them with DESIGN.md `--ds-*`/brand tokens (whose values OD-P3-13 already aligned to e7). `--e7-*`
  names never ship."*

**A2 — The e7↔DESIGN.md value reconciliation exists only in the DESIGN.md changelog; the redesign law docs
don't point to it. [Latent → Misleads]**
- Evidence: `DESIGN.md:604` OD-P3-13 — "Step-1 redesign styling pass … **token values aligned to E7
  reference**" (retuned `--ds-background/-font-color/-color-blue/-status-*`, `--brand-navy/orange`, shadows,
  radius). This is the actual bridge: e7's *look* (warm neutrals, brighter action blue, navy shadows) was
  folded into the `--ds-*` **values** while keeping the `--ds-*` **names**. Step 1 of the buildout plan
  (`2026-07-14-redesign-buildout.md:45`) is precisely this pass ("e7 CSS as reference," CSS/DESIGN.md only).
- Problem: neither `experience-contract.md`, `SALVAGE-INVENTORY.md`, nor `redesign-decision-index.md` mentions
  OD-P3-13 or that the mapping is done. A reviewer comparing a built surface to `e7-prototype.html` sees `--e7-action`
  and, not knowing it == `--primary`, can misread a correct `--ds-*` implementation as "off-mockup."
- **Disposition:** cite OD-P3-13 as the e7→`--ds-*` value bridge in SALVAGE-INVENTORY and in every UI scope card.

**A3 — DESIGN.md carries no redesign/experience-contract banner; it predates E7 and reads as a standalone
authority. [Latent]**
- Evidence: `DESIGN.md` header/intro (lines 1-260) is entirely PMO-adoption framing (ADR-0009, OD-P3-*, RIS
  Portal); grep for `redesign|e7|experience-contract|salvage` in DESIGN.md returns only the OD-P3-13 changelog
  row. Nothing tells a reader "for redesign surfaces, DESIGN.md is the token authority and the experience
  contract + SALVAGE-INVENTORY are the structural/visual-decision authorities layered on top."
- **Disposition:** add a one-line pointer at DESIGN.md top: token authority here; structure/visual decisions in
  `experience-contract.md` + `SALVAGE-INVENTORY.md`.

---

## B. Mockup ownership ambiguities — 4 findings

**B1 — The Home attention brief (buildout Step 5) has NO explicit mockup owner in SALVAGE-INVENTORY.
[Misleads-reviews-NOW — step 5 is imminent, right after the in-flight step 4]**
- Evidence: SALVAGE-INVENTORY assigns e7 the "Money surfaces, Inbox … deputy presence" and record pages, and
  convergence the composer/occurrence/frame — but **the Home attention brief is assigned to neither.** e7 has a
  Home and `home.html` has a Home, but README.md:88 labels `home.html` "historical inputs … not current
  authority," and the brief "from real queries (overdue/due-today/failed-checks/mentions)" (plan line 49; D8;
  OD-REDESIGN-17/18/59) is a surface no mockup fully designs (convergence only builds the *feed* region below it).
- Consequence: step-5's design review has no owning mockup to score against — reviewers will improvise.
- **Disposition:** SALVAGE-INVENTORY must state the Home brief is spec'd from **law, not a mockup**
  (experience-contract Rule 1 Home job sentence + jtbd J01–J03 + ADR-0025 D8 + OD-59 layout), so the review
  anchors on those, not on a nonexistent/historical Home mockup.

**B2 — "Events" rail root (OD-REDESIGN-57, added after the mockups) is only a STUB in the mockups. [Latent]**
- Evidence: Events is a rail destination in the frame (`convergence-flows/flows.js:249,264`) but its screen is a
  placeholder — `flows.js:666-669` "Events destination … stub … *Not in this slice* … ships as a collection +
  view renderer (Rule 10)." Buildout Step 10 is itself "Events **stub**" (plan line 54). SALVAGE-INVENTORY names
  Events once (in the frame list) and designs no Events surface.
- Consequence: fine while Step 10 is a stub (review a stub against a stub); a real Events calendar later has **no
  mockup**. Flag so it isn't mistaken for a covered surface.
- **Disposition:** note in SALVAGE-INVENTORY that Events has only a rail slot + Rule-1 job sentence; any non-stub
  Events build needs a fresh design pass.

**B3 — Signal is split across two mockups; the Home feed region owner is unstated. [Latent — mostly handled]**
- Evidence: SALVAGE gives convergence the "FB-style Signal composer" + occurrence surfaces, and e7 the "Signal
  record" renderer — a deliberate split the file does document. But the **Home ambient feed** (built in step 4 as
  `SignalFeed`/`SignalFeedSection`, ledger vdrd17-step4 lines 18-22) is assigned to neither mockup explicitly.
- **Disposition:** one line in SALVAGE assigning the Home feed presentation to the convergence feed grammar (its
  natural home) closes it.

**B4 — Café/Kitchen naming skew between mockups and app until Step 7. [Latent — false-regression risk]**
- Evidence: e7 already uses "Café" (`e7-data.js:232` `proc_cafe_open` "Café Opening"; module manifests line 412);
  the app still ships "Kitchen" until the Step-7 rename (plan line 51; step-4 ledger defers "Café rename → Step 7"
  at vdrd17-step4:33). Steps 4–6 render "Kitchen" while the reference says "Café."
- Consequence: a cross-version design review (OD-65 fork-catching) could flag the app's "Kitchen" as a regression
  from e7's "Café," or vice-versa, before Step 7 legitimately does the rename.
- **Disposition:** scope-card note: Café rename is Step 7; do not score Kitchen↔Café naming before then.

---

## C. Contract / JTBD / mockup contradictions the precedence rule must arbitrate — 3 findings

Precedence is **explicit override → experience contract → owning mockup** (SALVAGE-INVENTORY:9-10). Good news:
e7 is largely self-consistent with the later law, so live collisions are few.

**C1 — e7 surfaces "Process Run" as a noun; OD-REDESIGN-58 says it "appears nowhere in the UI." [Cosmetic —
already on the override list, but reviewers must know]**
- Evidence: `e7-views.js`/`e7-records.js`/`e7-data.js` model Runs as titled records (`run_hq_open` "Café Opening
  · 10 Jul · HQ", `e7-data.js:259`). OD-REDESIGN-58 (`decisions.md:1646`) + D6 require occurrences to surface as
  **Tasks under a caption**, "Process Run" nowhere in UI. This IS caught: SALVAGE-INVENTORY override #7 forbids
  porting e7's Run noun / Runs-as-entry-point, and occurrence-as-tasks ownership is assigned to convergence flows.
- **Disposition:** none needed beyond ensuring the Step-6 reviewer reads override #7; the precedence rule resolves
  it cleanly.

**C2 — POSITIVE: e7 correctly keeps RACI OFF Task surfaces (no collision with OD-62/A4). [informational]**
- Evidence: `e7-records.js:56` "Task = Team + PIC + Supervisor + Status. **Never RACI**; RACI lives on
  Objectives, Projects, Processes"; RACI blocks appear only on Process/Objective/Project/Standard renderers
  (lines 173-312). This matches OD-REDESIGN-62 + jtbd anchor A4. Porting e7's Task record is safe here — worth
  recording so a reviewer doesn't invent a phantom collision.

**C3 — full-redesign options a/b/c encode the retired 5-flat-destination / "Now·Operate·Plan" IA. [Cosmetic —
labeled historical]**
- Evidence: `full-redesign-2026-07/option-a-now.html` etc. present "Now/Work/Ops/Money/Inbox" + "Operate/Plan,"
  all superseded by ADR-0025 D1. Both README banners (`full-redesign-2026-07/README.md:1-16` and the sibling set)
  correctly mark them HISTORICAL/superseded and SALVAGE-INVENTORY:49-52 says "consult only for visual ideas,
  never for structure." Contained; listed here only for completeness.

---

## D. Owner preferences voiced in provenance that never became law — 2 risks (+1 counter-example)

**D1 — Brand-identity mismatch: the app's identity vs Gordi's own 2018 brand guideline / client-document
house-style. Raised, leaned-on, never ratified. [Latent — OWNER-only]**
- Evidence: `03-frustration-and-buildout-2026-07-13_16.md:1286-1316` — the assistant compared the app to Gordi's
  client-facing "Harbour & Ember" doc house-style (built on Gordi's **2018 brand guideline**: real navy
  `#1B3A6B`, salmon-ember, Pine teal `#017F7C`, **Arkhip** display font) and found the app's identity
  (Plus Jakarta Sans + action-blue `#3e63dd`, "derived from a reference demo," OD-P3-9) reads as **"two different
  brands"** (line 1305). The assistant *leaned* toward "Selective alignment — adopt the doc system's real navy
  `#1B3A6B` and salmon-ember into the app" (line 1316) but flagged it as a lean, not a directive.
- Status: grep of `decisions.md`/`DESIGN.md` for `Harbour|Ember|salmon|Arkhip|1B3A6B|3e63dd` finds **no** OD or
  DESIGN.md note adopting or rejecting it. App `brand-navy` = `oklch(0.3154 … 260.7)` ≈ `hsl(218 46% 22%)`
  (`DESIGN.md:36,256`) — close to but not the guideline's `#1B3A6B`, and the guideline's ember/Pine/Arkhip have no
  app counterpart. So a genuine brand-coherence question the owner's own material raises sits unresolved — a
  silent-regression risk (the app could drift further from Gordi's real brand with nobody scoring it).
- **Disposition:** OWNER decision (Option A/B below). Do not let a design review silently assume either answer.

**D2 — "Calm fit / no clipping of decision columns at desktop" table-density preference — fixed once, never
enshrined as a scored rule. [Latent]**
- Evidence: `03-frustration…:2454` — the owner-facing block records the steps-1–3 BLOCK on "the **desktop Tasks
  table clips its decision columns at 1280px** (Due/Activity cut off) vs the e7 reference's **calm fit**," a
  density issue that "green tests would [not] have caught" and that recurred across review rounds. It was fixed
  for Tasks, but there is no experience-contract rule or DESIGN.md token asserting "decision columns never clip
  at ≥1280px" as a standing invariant — so it can regress on any new dense surface (Signals archive, Money,
  catalog) without a rule to catch it.
- **Disposition:** Director/owner — consider a scored density invariant (Option A/B below).

**D3 — COUNTER-EXAMPLE (not a risk): the "warmer, less clinical" preference DID become law.** The frustration/
grill "not repulsed, passable" + warmth thread was enshrined as OD-P3-13 (Step-1 styling: warm neutrals, brighter
blue, navy shadows) and Step 1 of the buildout. Recorded so it isn't re-litigated as if unaddressed.

---

## E. Stale / dangling pointers — 3 findings

**E1 — CONVERGENCE-AUDIT's top "Verification caveat" + Deviations #1 declare OD-REDESIGN-1..55 ABSENT from
`decisions.md`. That is now STALE and undermines authority #1 for every redesign doc. [Misleads-reviews-NOW]**
- Evidence: `CONVERGENCE-AUDIT.md:21-27` ("that section is **absent from the current `docs/decisions.md`** … the
  file ends at OD-DASH-6 and contains zero `REDESIGN` matches") and `:271-277` (Deviations #1, "Action for the
  Director"). But `decisions.md` NOW contains OD-REDESIGN-1..67 as full headed sections (`decisions.md:1030`
  OD-REDESIGN-1 … `:1753` OD-REDESIGN-67; 85 `OD-REDESIGN-` matches). The gap was filled after this audit
  (written 2026-07-13) was authored.
- Consequence: CONVERGENCE-AUDIT is cited as **authority #1** by `experience-contract.md:8`. A reviewer who reads
  its caveat concludes the redesign's authority #1 (the OD-REDESIGN-1..55 text) doesn't exist and must chase the
  index/ADR instead — false, and corrosive to trust in the law stack during live reviews.
- **Disposition:** strike/annotate the caveat and Deviations #1 as RESOLVED (OD-REDESIGN-1..67 are in
  `decisions.md`). (Owner/Director may edit the doc; this audit does not.)

**E2 — `design-reviewer.md` points to `docs/jtbd.md §5` for the calibration anchors, but the anchors moved to
§8 and their content changed. [Misleads-reviews-NOW — see also F4]**
- Evidence: `design-reviewer.md:25` "the three Gordi calibration anchors (`jtbd.md` §5)." Current `jtbd.md §5` =
  "Six integrated scenario threads" (line 114); the calibration anchors are now `jtbd.md §8` "E7 calibration
  anchors — defects Lens D must catch," **A1–A14** (lines 160-177) — a completely different, E7-native set.
- **Disposition:** covered by F4's agent fix.

**E3 — Live-server / working-copy pointers are inconsistent and point outside the repo. [Cosmetic]**
- Evidence: `SALVAGE-INVENTORY.md:12-14` says e7 serves on **:8766** in "the `gordi-mos-e7-prototype` working
  copy," while `README.md:23,63` says serve on **:8765** from the in-repo dir; convergence :8134 is consistent.
  The `gordi-mos-e7-prototype` external working copy is not this repo (though the e7 files also exist in-repo).
- **Disposition:** normalize the port + note the mockups are servable in-repo; low priority.

---

## F. Design-review calibration risks — 5 findings (the core of the owner's suspicion)

**The single biggest source of confusion: `.claude/agents/design-reviewer.md` — the agent that actually runs the
4-lens review — still describes the PRE-REDESIGN world. It never references the redesign law.**

**F1 — Lens (d)'s "three Gordi calibration anchors it MUST ALWAYS catch" are all RETIRED objects.
[Misleads-reviews-NOW]**
- Evidence: `design-reviewer.md:25` hardcodes **A1** "a Review/Approve verb on a **Daily Log** entry (OD-P2-15/16)",
  **A2** "a write affordance on the upward **weekly-update** review pane (OD-P2-12)", **A3** "a downward/lateral
  **weekly-update** view (OD-P1-3)." Daily Log and Weekly Update are **retired** — `redesign-decision-index.md:19-20`
  ("Weekly Updates … Daily Log … Replaced by … Signals"); OD-REDESIGN-33/D20; `jtbd.md:146` bans the vocabulary.
- Note: `design-workflow.md:86-88` was already patched with the E7 replacements (**A1′** status/resolve verb on a
  Signal; **A2′** Acknowledge-as-ownership / Signal-promoted-to-Task; **A3′** sibling-Team Signal read without
  layered reach) — but **the agent file was not.** The agent is what the Director spawns.
- **Disposition:** rewrite `design-reviewer.md` Lens (d) anchors to `jtbd.md §8` A1–A14 (or at minimum A1′/A2′/A3′
  from design-workflow) — a Director-owned agent edit.

**F2 — Lens (b) personas anchor on retired tasks. [Misleads-reviews-NOW]**
- Evidence: `design-reviewer.md:19` — "a **manager** triaging their week and **reviewing weekly updates**, an
  **ops user filing a daily update** in under a minute." Both jobs no longer exist; the redesign personas are the
  jtbd job lenses (`jtbd.md:30-37`: operator/supervisor/cross-Team manager/BU governor/finance/owner) and the
  two fronts (OD-66). A reviewer walking "file a daily update" has no such flow to walk.
- **Disposition:** replace with jtbd role lenses + a Signal-share / Task-triage journey.

**F3 — Lens (c) uses "a weekly update" as a canonical-entity IA anchor. [Misleads]**
- Evidence: `design-reviewer.md:22` — "a task, **a weekly update**, an ops event each resolve to exactly ONE
  detail surface." Weekly update is retired; the redesign canonical entities are Task / Signal / Objective /
  Project / Process / Standard / Follow-up (experience-contract Rule 2; jtbd §6 canonicality).
- **Disposition:** swap the example entities.

**F4 — Wrong oracle-section pointer (jtbd §5 → §8) compounds F1. [Misleads]** (see E2 for evidence).

**F5 — The agent's whole frame predates the buildout: it anchors on "the owner-picked Phase-0 mockup" (singular)
and never mentions the binding redesign stack. [Misleads-reviews-NOW — the umbrella issue]**
- Evidence: `design-reviewer.md:3,7,10,16` repeatedly say audit against "**the** owner-picked Phase-0 mockup" —
  but the mockup phase closed **without** a single owner pick; ownership is per-surface across multiple mockups
  (SALVAGE-INVENTORY) and reviews must catch **cross-version** regressions (OD-REDESIGN-65). The agent contains
  **no** reference to `experience-contract.md` Rules 1–12 (the blocking pass/fail law), `SALVAGE-INVENTORY.md`,
  OD-REDESIGN-65 (cross-version fork-catching), OD-REDESIGN-66 (two fronts: manager density AND barista
  obviousness), or `twenty-ixd-patterns.md`. The binding order of assessment (`decisions.md:1732` /
  experience-contract: Rules 1–12 → jtbd → twenty-ixd → mockups-per-SALVAGE) is absent from the reviewer.
- Consequence: a review run purely off this agent scores against DESIGN.md + a single "Phase-0 mockup" + jtbd's
  retired anchors — precisely the mixed, pre-redesign frame that produces citations like "fix to `--e7-*` or
  DESIGN.md tokens" instead of the correct "DESIGN.md `--ds-*`, e7 as visual reference only."
- **Disposition:** the Director must either (a) update `design-reviewer.md` to the redesign stack (recommended),
  or (b) inject the full order-of-assessment + anchor set into every step's review scope card until the agent is
  fixed. Until then, treat the agent's built-in anchors as **stale** and override them per review.

---

## Confusions the Director must feed into every step 4–11 review scope card

1. **Token authority (URGENT for the step-4 styling fix wave):** new/changed app surfaces bind to **DESIGN.md
   `--ds-*` + `--brand-*` + `--status-*` tokens** — whose *values* OD-P3-13 already aligned to e7. `--e7-*` is a
   **mockup-only namespace and must never appear in app CSS** (there is an active no-leak guard). "Port e7's
   visual system" = port its *decisions* via `--ds-*`, not its token *names*. The correct step-4 Signal-CSS fix
   target is **DESIGN.md `--ds-*`/brand tokens**, full stop.
2. **Review anchors:** score against `experience-contract.md` **Rules 1–12** → `jtbd.md` intent →
   `twenty-ixd-patterns.md` → then the **owning** mockup per SALVAGE-INVENTORY, with **cross-version**
   fork-catching (OD-65) and **both fronts** (OD-66). Use `jtbd.md §8` anchors **A1–A14**. **Ignore**
   `design-reviewer.md`'s built-in Daily-Log/Weekly-Update anchors (A1/A2/A3), its "reviewing weekly updates /
   filing a daily update" personas, and its "single owner-picked Phase-0 mockup" framing — all stale until the
   agent file is fixed.
3. **`CONVERGENCE-AUDIT.md`'s "OD-REDESIGN-1..55 is missing from decisions.md" caveat is STALE** — OD-REDESIGN-1..67
   are now full sections in `decisions.md`. Do not treat redesign authority #1 as absent.
4. **Home attention brief (Step 5) has no owning mockup** — review it against experience-contract Rule 1 (Home job
   sentence) + jtbd J01–J03 + ADR-0025 D8 + OD-59 layout, **not** against a Home mockup (`home.html` is historical).
5. **Café vs Kitchen** — the app says "Kitchen" until the Step-7 rename; do **not** flag the app's "Kitchen"
   against e7's "Café" as a regression before Step 7.
6. **"Process Run" as a UI noun in e7 is on the override list (SALVAGE override #7) — do not port it** for Step 6;
   occurrences surface as Tasks under a caption (OD-58), owned by the convergence mockup.

## Items only the OWNER can settle

- **O1 — App brand identity vs Gordi's own 2018 brand guideline (the "Harbour & Ember" client-doc house-style).**
  Raised in the frustration thread, never ratified.
  - **Option A:** keep the app's current identity (Plus Jakarta Sans + action-blue `#3e63dd`, derived from a
    reference demo), accepting it reads as a *different* brand from Gordi's client-facing documents.
  - **Option B:** selectively align — adopt the 2018 guideline's real navy `#1B3A6B` + salmon-ember (and consider
    Pine teal) into the app while keeping the screen action-blue and screen fonts the print medium doesn't need.
  *(Recommend the owner rule on this before more surfaces harden; it silently drifts otherwise.)*

- **O2 — Q1 Signal-on-Home placement** (feed below the non-removable attention brief) is still **provisional**
  (OD-REDESIGN-59; step-4 ledger "ratify at post-step-11 review").
  - **Option A:** ratify as built — ambient feed below the brief, Work = Signals archive/search only, no Updates
    destination.
  - **Option B:** change the placement (e.g. Work-primary, or a different Home region order).

- **O3 — Table/decision-column density invariant.** The "decision columns must not clip at desktop; e7's calm fit
  is the bar" preference recurred in reviews but is enshrined in no rule.
  - **Option A:** promote it to a scored experience-contract clause (e.g. "no horizontal clipping of
    decision-relevant columns at ≥1280px") so every dense surface is checked.
  - **Option B:** leave it to per-review taste (accept recurrence risk).
  *(A is a Director-draftable rule once the owner says it's a standing bar; listed here because only the owner can
  declare it load-bearing.)*

---

### Finding counts per group
A = 3 · B = 4 · C = 3 (incl. 1 positive/no-collision) · D = 2 risks (+1 counter-example) · E = 3 · F = 5.
Misleads-reviews-NOW: A1, A2, B1, E1, E2, F1, F2, F4, F5 (and the F-umbrella). The rest are Latent/Cosmetic.
