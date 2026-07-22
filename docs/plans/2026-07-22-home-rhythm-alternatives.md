# Home page rhythm — divergent alternatives (design brainstorm)

**Date:** 2026-07-22 · **Author:** design-architect · **Status:** DIVERGENT brainstorm for owner selection — not a plan, not a re-skin.
**Scope:** rhythm/structure of the Home route only. The Attention-brief *content contract* and the MyTasksCard *data contract* are FIXED (this is composition, not data redesign). No new component that Rule 11 forbids — every direction re-homes/re-styles existing surfaces (`AttentionBrief`, `MyTasksCard`/`MyWeekPanel`, `SignalFeedSection`, the `.section-title`/`CardHead` grammar). Palette/type vocabulary is DESIGN.md tokens only.
**Oracles:** `docs/jtbd.md` J01/J02 · `docs/experience-contract.md` Rules 6/8/9/11/12 · `docs/decisions.md` OD-REDESIGN-17/18/59 · owning mockup `docs/design-mockups/redesign-mockups-2026-07/e7-prototype.html` (`e7-views.js:renderHome`, `e7-prototype.css`) · `PRODUCT.md` (quiet control surface; anti-refs: card soup, dead-end KPI tiles).

---

## 1. Current anatomy (what Home renders today)

- `PageFamilyFrame` head (greeting + role subtitle, `surfaceWash`) → optional order-toggle → `.home-regions` (two regions in user-chosen DOM order).
- **Attention region** = `<AttentionBrief>` — its own bordered `.attention-brief` **card shell** wrapping the overdue/due-today/failed-checks/mentions lanes.
- **Personal-canvas region** = a second stack: a `KPITile` "My open tasks" **tile**, then `MyWeekPanel` → `MyTasksCard` (its own **card shell** + `CardHead`), then `SignalFeedSection` (a third **card shell**).
- Net: 3–4 concentric/stacked bordered box shells down one column → the "card-heavy" audit deduction.

## 2. E7's actual Home rhythm (the owning mockup — cite, don't impress)

- `renderHome` emits `head(...)` then **one `.stack` of chromeless `<section class="section">` blocks** — Needs attention → Your work today → (Deputy) → Money position → This week.
- A `.section` has **no border/shadow**; its only chrome is `.section-title` (`e7-prototype.css:337`: `--font-display`, weight 700, 15px, `--e7-brand`, icon + right-aligned `.actions` link). Groups are separated by **whitespace only**: `.section + .section { margin-top: --e7-s-xl }` (`:336`).
- Rows use `.stack` (`:324`, `gap: --e7-s-md`) of `.row-item` (`:325`) — **lightly** bordered pills (`1px --e7-border`, `--e7-radius-control`, `shadow-rest`). So E7 = *chromeless section headings + whitespace dividers + lightly-bordered rows*. The card SHELL wrapping a whole group only appears for Deputy widgets (`.card`) and the single Money `.kpi`. **The current build re-added shells E7 never had.**
- Token map to DESIGN.md: section heading = **Overline** ("the system's section-divider voice", line 291) or Subheading; group gap = `spacing.xl` (24px); row border/shadow = `--border` + `shadows.rest`; head wash = `gradients.surface-wash` (Home-only, already applied).

---

## 3. Five divergent directions (each differs STRUCTURALLY)

### D1 — Section-Rhythm Restoration (the faithful E7 port)
Keep the regions; delete the shells. Each region becomes a chromeless section: Overline/Subheading heading (icon + label + right-aligned "See all →") over the existing row grammar; groups separated by `spacing.xl` whitespace.

```
Good morning, Ayu · Barista · HQ Kitchen        [surface-wash]
──────────────────────────────────────────────
NEEDS ATTENTION · 4                       (overline)
  ▸ Restock oat milk        PIC Ayu · HQ · due today
  ▸ Failed check: grinder   HQ Bar · Blocked
        (spacing.xl gap — no box)
YOUR WORK TODAY                     See all in Work →
  ▸ Prep syrup station      Ad hoc · HQ Bar · Open
  ▸ Weekly stock count      Process · HQ · Open
        (spacing.xl gap)
SIGNALS                                    Share →
  ▸ Rina: delivery slipped to 3pm         2h ago
```
- **Keeps:** all three regions + order toggle (OD-18) + every data contract. **Kills:** the 3 card shells + the stranded KPI tile (folds the count into the "Your work today" heading meta). **Moves:** nothing.
- **J01/J02 <5s:** heading-scan → row-scan; attention is the first block, decision meta (PIC · Team · due) already on each row.
- **E7 fidelity:** highest — this *is* the owning mockup ported (Rule 11 presumption of correctness).
- **H8 / card-discipline:** large win — removes the biggest deduction directly.
- **Phone (390px):** sections stack naturally; headings are cheap; order-toggle stays behind the one disclosure (Rule 8).
- **Build:** S (mostly CSS: strip shells, wrap in section-heading grammar). **Risk:** least *divergent* — it's closer to "the correct answer" than a bold bet; low upside beyond closing the deduction.

### D2 — Single Prioritized Stream (attention-as-feed)
Dissolve the region boundaries into ONE priority-ordered column of rows. The "sections" survive only as **sticky Overline sub-dividers** inside a single scroll (OVERDUE → DUE TODAY → FAILED CHECKS → MENTIONS → YOUR WORK → SIGNALS). No region shells, no per-region headings-as-blocks — one continuous stream ranked by consequence.

```
Good morning, Ayu                          [surface-wash]
── OVERDUE ──────────────────────  (sticky overline)
  ▸ Restock oat milk        PIC Ayu · HQ · 2d late
── DUE TODAY ─────────────────────
  ▸ Weekly stock count      HQ · Open
── FAILED CHECKS ─────────────────
  ▸ Grinder calibration     HQ Bar · Blocked
── YOUR WORK ─────────────────────
  ▸ Prep syrup station      Ad hoc · Open
── SIGNALS ───────────────────────
  ▸ Rina: delivery slipped to 3pm      2h ago
```
- **Keeps:** all content + priority order (attention above ambient — OD-17/59). **Kills:** region boxes AND the two-region conceptual split. **Moves:** signals inline into one ranked stream; the order-toggle loses meaning (see risk).
- **J01 <5s:** single glance down a consequence-ranked list — the strongest "what matters, top to bottom" read of the five.
- **E7 fidelity:** medium-high — reuses `.stack` + `.row-item` + the Overline divider voice, but E7's *discrete sections* become one stream (a real structural divergence).
- **H8 / card-discipline:** strongest (one surface, zero shells).
- **Phone:** excellent — one column is the native mobile shape; sticky sub-dividers keep place.
- **Build:** M (merge three data sources into one ordered render list; sticky dividers). **Risk:** blurs the **attention-vs-ambient Signal boundary** (anchor A12 — signals could read as attention) and **breaks the OD-18 region-order toggle** (there are no longer two regions to reorder) → needs owner ratification of both.

### D3 — Two-Zone Split (Act-now / Keep-in-view)
A structural spatial split, not a stack: desktop = two columns divided by a single hairline rule (`--border`); phone = two stacks. **Left/top "Act now"** = attention rows only. **Right/bottom "Keep in view"** = your work + signals. No card shells; the divider does the separating.

```
ACT NOW              │  KEEP IN VIEW
▸ Restock oat milk   │  Your work today
  HQ · due today     │   ▸ Prep syrup station
▸ Grinder failed     │   ▸ Weekly stock count
  HQ Bar · Blocked   │  Signals
▸ @you: cover 3pm    │   ▸ Rina: delivery 3pm
```
- **Keeps:** all content. **Kills:** shells. **Moves:** tasks + signals into a secondary column/zone (a spatial demotion, not removal).
- **J01/J02 <5s:** the left zone alone answers "what needs me" — spatial priority is instant.
- **E7 fidelity:** medium — row grammar preserved, but E7 Home is single-column, so a 2-col desktop diverges from the mockup layout.
- **H8 / card-discipline:** good; two columns add a little scan complexity vs a single stream.
- **Phone:** collapses to Act-now-then-Review stacks — loses the side-by-side payoff, so the benefit is desktop-only.
- **Build:** M (responsive 2-col grid + reflow). **Risk:** fixed spatial zoning **conflicts with the OD-18 order toggle** (position is now spatial, not stacked); a thin work/signals day leaves a large empty right column (violates "no dead space" taste).

### D4 — Work-first Home (the table IS the page)
Invert the hierarchy for the manager front (Rule 12 two-fronts / Rule 8-desktop density): MyTasksCard's table becomes the page body; attention demotes to a compact **alert ribbon** pinned above it — a single inline row of jump-chips (`2 overdue · 1 due today · 1 failed check · 3 mentions`), each a filter/anchor; signals a slim collapsed strip.

```
Good morning, Ayu
[ ● 2 overdue · 1 due today · 1 failed · 3 @you ]   (ribbon → jumps)
┌ Title ──────── PIC ── Supervisor ── Status ── Due ┐
│ Restock oat milk  Ayu   Budi        Overdue   -2d │
│ Prep syrup station Ayu  Budi        Open      —   │
│ Weekly stock count Ayu  Budi        Open      Fri │  (bare table, one shell)
└───────────────────────────────────────────────────┘
Signals ▸ (3)  — collapsed strip
```
- **Keeps:** both data contracts. **Kills:** the attention *card* (→ ribbon) + the stranded KPI tile (the count is the table length). **Moves:** attention from a full region to a chip band; signals to a strip.
- **J02/managers <5s:** dense, scannable, act-in-place — best for the supervisor/manager front. **J01/operator:** weaker — attention compressed to chips may under-serve the least-technical persona (Rule 12).
- **E7 fidelity:** low — E7 keeps attention as a full section; shrinking it to a chip band is a real divergence.
- **H8 / card-discipline:** strong (one table shell). **Phone:** table → record list, ribbon on top (works).
- **Build:** M/L. **Risk:** **OD-18 says the attention brief is non-removable and only its position moves** — compressing it to a ribbon likely reads as a violation and needs explicit owner ratification. Also tension with Rule 12's operator front.

### D5 — Zero-chrome typographic rhythm (no boxes at all)
Out-quiet E7: remove *all* box chrome — card shells AND the row pills. Rows become bare text lines separated by `border/70%` hairline dividers (the table-body divider grammar, not pills). Pure Plus Jakarta headings + DM Sans rows + `spacing.xl` between groups. One calm typographic column.

```
Good morning, Ayu

Needs attention                              4
  Restock oat milk            PIC Ayu · HQ · due today
  ─────────────────────────────────────────  (hairline)
  Grinder calibration failed  HQ Bar · Blocked

Your work today
  Prep syrup station          Ad hoc · Open
  ─────────────────────────────────────────
  Weekly stock count          Process · Open
```
- **Keeps:** content + regions + toggle. **Kills:** ALL box chrome (shells + row borders/shadows). **Moves:** nothing.
- **J01 <5s:** quietest scan of the five — maximal calm/minimalism.
- **E7 fidelity:** low-medium — E7 rows *do* carry border + `shadow-rest`; full de-boxing diverges from E7's row grammar (it out-quiets the mockup).
- **H8 / card-discipline:** maximal. **Phone:** excellent; but tap affordance weakens.
- **Build:** S/M (CSS). **Risk:** may go **too quiet** — hairline-only rows lose the tap-target/scannability affordance the bordered rows give (esp. phone ≥44px is met by hit-area but not by visual cue); can read as unfinished/undifferentiated. Weakest against "confident control surface".

---

## 4. Convergent shortlist (2) + recommendation

**Shortlist: D1 (Section-Rhythm Restoration) and D2 (Single Prioritized Stream).**

**Recommendation — lead with D1, hold D2 as the ambitious phone-first alternative.** D1 is the lowest-risk, highest-fidelity move: it *is* the owning E7 mockup ported (Rule 11 presumption of correctness), it closes the card-discipline/H8 deduction directly, it preserves the OD-18 region-order toggle and the OD-17/59 attention-above-ambient contract untouched, and it is an S-sized CSS change. D2 is the more ambitious "Home as one prioritized stream" and is arguably the strongest pure J01 read and the best native phone shape — but it costs two ratifications (it blurs the attention/ambient Signal boundary → anchor A12, and it dissolves the two-region model the OD-18 toggle acts on). Recommend shipping D1 as the baseline and, if the owner wants more ambition, adopting **D2's single-stream only at ≤390px** (where one ranked column is unambiguously best) while desktop keeps D1's discrete sections — a role/viewport-adaptive blend consistent with Rule 9 (same meaning, different density).

**Evidence that would settle it:** a rendered A/B of D1 vs D2 at 1280px and 390px scored on the four-lens + Rule 6/8/9, plus a Rule-12 cold-start walkthrough measuring time-to-first-action for an *operator* (J01) and a *supervisor* (J02); and a check that D2 does not let a Signal read as an attention item (A12) or strand the OD-18 toggle. If D2 wins J01 time materially AND the owner ratifies the two boundary questions, promote it (or the viewport-adaptive blend); otherwise D1 ships.

## 5. What NOT to do (traps)

- **Don't re-skin a shell into another shell.** Swapping card borders for a slightly softer card is not divergence and doesn't clear the deduction — remove the *grouping shell*, keep only the light row border (D1) or drop even that (D5).
- **Don't re-add a dead-end KPI tile.** The stranded "My open tasks" count tile is the anti-reference (PRODUCT.md "dead-end KPI tiles"); fold the number into a heading/table length, keep it a drill-`<Link>`, never a solo metric card.
- **Don't compress or remove the attention brief without ratification.** OD-18 makes it non-removable and only its *position* moves — D4's ribbon and any "collapse attention" idea are owner-ratify-or-reject, not a silent build choice (blocking per the owner-artifact-deviation rule).
- **Don't let Signals read as attention.** In any single-stream (D2) the ambient Signal feed must stay visually/positionally subordinate to attention (A12 / OD-59), never interleaved as equal-priority action rows.
- **Don't invent a new section/heading component.** Reuse the existing `.section-title` / `CardHead` grammar and DESIGN.md's Overline/Subheading tokens (Rule 11) — no bespoke Home-only chrome.
- **Don't reorder via CSS.** The two-region order is DOM order only (Rule 9/AC-515); any zoning (D3) must not reintroduce `order:`/`column-reverse` reflow.
- **Don't out-quiet into ambiguity (D5 guard).** Removing every border can kill the tap/scan affordance; if D5 is explored, keep a hover/focus cue and the ≥44px hit area so rows still read as actionable.

---

### DESIGN.md tokens referenced (no raw hex/px)
Type: `--font-display` (Plus Jakarta Sans, headings), `--font-sans` (DM Sans), **Overline** + **Subheading** heading tokens, Page-Title. Color: `--foreground`, `--muted-foreground`, `--border` (+ `border/70%` hairline), `--card`, `--primary`, `--secondary`, `--accent`, `--ring`, `--brand-navy`/`--brand-navy-text`. Space: `spacing.xl` (group gap), `spacing.md`/`sm` (row gap/pad). Radius: `--radius-lg` (any surviving surface), `--radius-sm` (rows/controls). Elevation/gradient: `shadows.rest` (Soft-Elevation), `gradients.surface-wash` (Home-only head wash). Motion: `--dur-fast`/`--dur-med` (hover/focus).

**Open questions for the owner:** (1) D2/D4 need ratification of attention-brief compression + the attention/ambient boundary (OD-18, A12) — approve, reject, or restrict to phone? (2) Is the OD-18 region-order toggle still wanted if we adopt a single-stream or zoned layout that has no two regions to reorder? (3) Two-fronts (Rule 12): should Home diverge by persona (operator = D1/D2 calm list; manager = D4 dense table), or one rhythm for all?
