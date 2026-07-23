# Skill-rule mechanization — closed detector inventory

**Date:** 2026-07-23 · **Branch:** v3-redesign · **Author:** Director (rule-extraction pass)

## Why this exists

Five audit rounds missed convention-level UI defects that the owner then caught by eye: naked
unlabeled numbers, two solid primary buttons on one surface, broken spacing rhythm, type-size soup,
misaligned split heights, a sidebar that scrolls with the page, starved/truncated identity columns.
**Every one violates a rule already encoded in the repo's vendored skills.** The audits failed not
because the rules were absent but because they used the skills as *loose scoring rubrics over sampled
screenshots* instead of running the skills' *actual per-element procedures*. A Nielsen number
(28/40, 34/40, 26/40 — the ledger shows all three claimed for the same tip) is a summary, not a
detector: it hides which element failed and lets an auditor sample the happy path.

This document turns the skills into a **closed, non-skippable detector inventory**. Every concrete
rule extracted from `impeccable`, `taste`, `ui-ux-pro-max`, `design-review`, and `design-system` is
listed once and classified:

- **MECHANIZED** — already guarded by an existing repo test (cited).
- **MECHANIZABLE** — can be a deterministic test today; a 1–3 line sketch is given (structural
  Vitest source-scan, or Playwright computed-geometry), plus which past owner-caught defect it would
  have caught. Many of these are *already implemented inside the `impeccable` detector*
  (`detect.mjs`) but the detector is not wired into a blocking gate — wiring it, or porting the check
  to a repo test, is the mechanization work.
- **CENSUS** — cannot be a pure static test; needs a rendered **per-element enumeration** step. The
  exact instruction an auditor must execute is written out. The defining property of a census rule:
  the auditor must visit *every* element of a class and state a fact about each, so that skipping one
  is visible.
- **JUDGMENT** — genuinely needs taste (Luna vision / 4-lens design review); the reason it resists
  mechanization is stated.

Column key for every table: **Rule · Source (skill file §) · Class · Enforcement** (test sketch, or
the exact census step, or the reason it is judgment-only).

### The owner-caught defect register (the oracle these rules must catch)

Referenced below as **D1–D9**. Grounded in `docs/reviews/v3-redesign.md` and the owner's verbatim
capture (ledger §"Owner feedback and acceptance target").

| ID | Defect | Ledger evidence |
|----|--------|-----------------|
| D1 | Naked unlabeled numbers ("naked count"; attention rows lack decision context) | §4-lens audit line 743 |
| D2 | Type-size soup ("multiple font sizes that feel untidy instead of deliberate") | `kit-vocab.test.ts` header; owner "styling feels unpolished" |
| D3 | Broken spacing rhythm ("some has too big of whitespace, some feels too tight") | Owner verbatim, ledger line 1204 |
| D4 | Two solid primary buttons / duplicate primary action doors on one surface | §4-lens line 747 "duplicate creation doors" → "one create door" |
| D5 | Misaligned split heights (panel/rail heights, uneven columns) | §4-lens "panel split"; rail containment |
| D6 | Sidebar/rail scrolls with the page | Owner verbatim "when scrolled down, the sidebar follows to get scrolled as well" |
| D7 | Starved / truncated identity column (`Repl…` `Sour…` `Dial…`; 0px Task column) | §Fresh mockup-regression P0; §Table convergence |
| D8 | Card soup / duplicate control axes (cluttered, "says confusing") | Owner verbatim; §Fresh mockup-regression P0s |
| D9 | Sub-44px touch targets on phone (Table/Card tabs ~36–38px) | §4-lens line 747; resolved 40→44 / 38→44 |

---

## A. Hierarchy & structure

| Rule | Source (skill §) | Class | Enforcement |
|------|------------------|-------|-------------|
| A1. Nested cards banned (card-in-card) | impeccable `registry/antipatterns.mjs` `nested-cards`; craft-floor "nested cards are always wrong"; taste Rule 4 | MECHANIZABLE | Vitest: parse each page/component TSX; flag any element with a card class whose subtree contains another card class. Detector `detect.mjs` already implements `nested-cards` for rendered DOM — wire it as a gate. Would have caught **D8**. |
| A2. Same-size icon+heading+text card grid as page structure | craft-floor "same-size cards … as the page structure"; taste §7 "NO 3-Column Card Layouts" | CENSUS | Enumerate every top-level section of the page. For each, state its container type (card / bare section / divider group). If ≥3 sibling sections are same-size cards, flag as card-soup and name them. Catches **D8**. |
| A3. One primary action per surface region | design-system component-specs Button (one `default`/primary variant; others secondary/ghost/outline); ui-ux-pro-max priority table | MECHANIZABLE | Playwright: within each `<main>` region and each toolbar/header, count elements resolving to the primary-button token (solid `--color-primary` bg). Assert ≤1. Static fallback: grep `.btn--primary`/`variant="default"` count per JSX return block. Would have caught **D4** (two solid create doors). |
| A4. Icon-tile stacked above heading (AI feature-card template) | impeccable `icon-tile-stack`; craft-floor "hero-metric template" | MECHANIZABLE | Detector `checkIconTile` already implements it (32–128px squarish tile with icon child directly above a heading). Wire `detect.mjs` as gate. |
| A5. Hero-metric template (big number / small label / accent) | craft-floor "the hero-metric template"; taste §3 dashboard hardening | CENSUS | For each KPI/stat tile, state: does the number carry a unit + a comparison/context, or is it a bare figure in a box? Overlaps D1. |
| A6. Duplicate control axes (two ways to do the same view/filter action) | ui-ux-pro-max UX "navigation overloaded"; owner "too cluttered" | CENSUS | Enumerate every control in the collection toolbar. For each, state the action it performs. Flag any two controls whose action is the same axis (e.g. preset chips AND a native saved-view select). Catches **D8**. |
| A7. ≤4 items per decision group; ≤5 top-level nav | impeccable critique §Cognitive Load (Miller/Cowan); ui-ux-pro-max nav ≤5 | CENSUS | At each decision point (toolbar, nav, action row), count simultaneously-visible distinct options. State the count. >4 (controls) / >5 (nav) = flag. |
| A8. Modal used where no interruption/protected focus is needed | craft-floor `skill-reflex-modal-by-reflex` | JUDGMENT | Whether a task "needs interruption" is intent-dependent; a reviewer must weigh the JTBD. Cannot be a static rule. |
| A9. Section numbers / eyebrow on every section (editorial scaffolding) | impeccable `numbered-section-labels`, `repeated-section-kickers`, `hero-eyebrow-chip`; craft-floor bans | MECHANIZABLE | Detector `checkRepeatedSectionKickers` + `checkHeroEyebrow` already implement. Wire as gate (product-register surfaces mostly exempt, so run advisory). |
| A10. Whole-product coherence ("reads as one tidy product, not several inherited apps") | design-review intent; ledger §Owner-eyes checkpoint item 6 | JUDGMENT | Explicitly owner judgment — "source guards cannot answer it" (ledger line 1067). Luna/4-lens only. |

---

## B. Spacing & rhythm

| Rule | Source (skill §) | Class | Enforcement |
|------|------------------|-------|-------------|
| B1. Monotonous spacing (one value everywhere, no rhythm) | impeccable `monotonous-spacing`; craft-floor "tight groups, generous separation"; taste Rule 6 | MECHANIZABLE | Vitest: collect all `gap`/`padding`/`margin` token usages in a surface's CSS; assert the surface uses ≥3 distinct space steps AND every value is a `--space-*` token (no raw px). Detector `checkPageLayout` covers rendered DOM. Catches **D3**. |
| B2. Space above a heading must exceed space below it | craft-floor `skill-layout-spacing-rhythm`; impeccable `heading-rhythm` | MECHANIZABLE | Playwright: for every heading, measure `marginTop`(effective gap above) vs gap to first following block; assert above > below. Detector `heading-rhythm` implements it. Catches **D3**. |
| B3. Cramped padding inside bordered/colored containers (<8px, ideally 12–16px) | impeccable `cramped-padding`; taste Rule 6 gap-2 | MECHANIZABLE | Detector `cramped-padding` (two shapes: own-text under-padding, and children flush to a visible boundary). Wire `detect.mjs`. Static fallback: flag padding <8px on any element with a border/bg token. Catches **D3**. |
| B4. Body text touching viewport edge (no container padding) | impeccable `body-text-viewport-edge` | MECHANIZABLE | Playwright computed-geometry: assert every text block's bounding box left/right is ≥16px from viewport edge. Detector implements. |
| B5. Cards flush against a scroller edge (asymmetric inset, clipped corners) | impeccable `edge-flush-cards` | MECHANIZABLE | Playwright: for cards inside `overflow-x:auto`, assert left inset == right inset at rest. Detector implements. |
| B6. Sibling split panels / columns must share equal height (aligned bottoms) | design-review "spacing issues, hierarchy"; ledger §4-lens "panel split measured" | MECHANIZABLE | **New Playwright test.** For a `display:grid`/`flex` row of sibling panels, assert `Math.abs(a.offsetHeight - b.offsetHeight) <= 1` (or that shorter panel's container stretches). Directly catches **D5**. No detector rule exists — build this. |
| B7. Sticky rail/sidebar must NOT scroll with page body | ui-ux-pro-max UX "Sticky Navigation … should not obscure/overlap"; owner verbatim D6 | MECHANIZABLE | **New Playwright test.** Set `main.scrollTop = 400`; assert `rail.getBoundingClientRect().top` unchanged AND `document.scrollingElement.scrollTop === 0`. The ledger already ran this manually (line 1291–1292) — encode it as a regression test. Catches **D6**. |
| B8. Line length 65–75ch (body measure) | impeccable `line-length`; craft-floor `skill-typo-floor`; ui-ux-pro-max typography | MECHANIZABLE | Detector `line-length`. Static: assert prose containers carry a `max-width` ≤ `75ch`/`--measure`. |
| B9. Overall density fit ("some too big whitespace, some too tight") as a *composed* judgment | owner verbatim D3; taste VISUAL_DENSITY dial | JUDGMENT | B1/B2/B3 catch the mechanical failures; whether the *overall* balance reads right across a whole surface is taste. Keep as 4-lens Visual lens. |

---

## C. Typography

| Rule | Source (skill §) | Class | Enforcement |
|------|------------------|-------|-------------|
| C1. Every `font-size` in `ui/*.css` is a `var(--font-size-*)` token on the declared ladder | `kit-vocab.test.ts` KIT-VOCAB-FONT; DESIGN.md §Typography | **MECHANIZED** | `mos-app/src/components/ui/kit-vocab.test.ts` → `KIT-VOCAB-FONT`. Directly kills **D2** *inside the kit*. |
| C2. Ladder tokens are actually defined (page-title 24 / heading 20 / subheading 18 / body 14 / control 13.5 / mono 13 / label 12 / overline 11 / micro 10) | `kit-vocab.test.ts` KIT-VOCAB-TOKENS; `index.css:179-187` | **MECHANIZED** | `kit-vocab.test.ts` → `KIT-VOCAB-TOKENS` (asserts each token + control 13.5 / body 14). |
| C3. Ladder discipline extends beyond `ui/*.css` to ALL component CSS (pages, features, dashboard) | DESIGN.md §Typography (whole app); owner D2 | MECHANIZABLE | **Extend the existing guard.** New Vitest: run the KIT-VOCAB-FONT scan over `src/components/**` and `src/pages/**` CSS, not just `ui/`. This is the single highest-value guard: **D2 (type-size soup) recurred outside the kit** where the current test does not look. |
| C4. Flat type hierarchy (sizes too close, <1.25 ratio between steps) | impeccable `flat-type-hierarchy`; craft-floor "obvious scale and weight steps" | MECHANIZABLE | Detector `flat-type-hierarchy`. Static: from the ladder, assert adjacent used steps differ by ≥1.2×, or hierarchy is carried by weight. |
| C5. No body text < 12px; functional/interactive text ≥ 11px (ramp membership is NOT an exemption) | impeccable `tiny-text`, `undersized-ui-text` | MECHANIZABLE | Detector `undersized-ui-text` — note its explicit rule: "being ON the DESIGN.md ramp does not exempt a value" (closes the token-laundering escape). Static: flag `--font-size-micro`(10px) on any interactive element. |
| C6. Line-height ≥1.3 (body 1.5–1.7); no crushed leading | impeccable `tight-leading`; ui-ux-pro-max typography | MECHANIZABLE | Detector `tight-leading`. Static: flag `line-height` < 1.3 on text elements. |
| C7. Tracking floor −0.04em; no crushed letter-spacing; no wide tracking on body >0.05em | impeccable `extreme-negative-tracking`, `wide-tracking`; craft-floor `-0.04em` | MECHANIZABLE | Detector implements both. Static: flag `letter-spacing` < −0.04em or > 0.05em on body. |
| C8. No all-caps body passages; no justified body text | impeccable `all-caps-body`, `justified-text` | MECHANIZABLE | Detector implements both. Static: flag `text-transform:uppercase` on multi-line body / `text-align:justify` without `hyphens`. |
| C9. Not-overused fonts; ≥2 families OR weight-carried hierarchy; no font outside DESIGN.md | impeccable `overused-font`, `single-font`, `design-system-font`; taste Rule 1 | MECHANIZABLE | Detector `overused-font`/`design-system-font`. Static: assert every `font-family` resolves to a DESIGN.md-declared family (De-reference firewall: MOS's own stack only). |
| C10. Oversized long hero H1 / italic serif display | impeccable `oversized-h1`, `italic-serif-display`; taste §7 | MECHANIZABLE | Detector `checkItalicSerif` + `oversized-h1`. Product-register app has few heroes; run advisory. |
| C11. Balanced headings, real copy at every breakpoint, fix overflow | craft-floor `skill-typo-floor` | CENSUS | At 1280/1024/390, enumerate every heading; state whether it wraps awkwardly or overflows. Overlaps text-overflow (E-adjacent). |

---

## D. Color & tokens

| Rule | Source (skill §) | Class | Enforcement |
|------|------------------|-------|-------------|
| D-1. No raw hex/rgb()/hsl() literal in `ui/*.css` (all color via token) | `kit-vocab.test.ts` KIT-VOCAB-COLOR | **MECHANIZED** | `kit-vocab.test.ts` → `KIT-VOCAB-COLOR`. |
| D-2. Every `border-radius` in `ui/*.css` is a `--radius-*` token (or 50%) | `kit-vocab.test.ts` KIT-VOCAB-RADIUS; `index.css:167-170` | **MECHANIZED** | `kit-vocab.test.ts` → `KIT-VOCAB-RADIUS`. |
| D-3. Token discipline (color + radius) across ALL component CSS, not just `ui/` | DESIGN.md; impeccable `design-system-color`/`design-system-radius` | MECHANIZABLE | **Extend the guard** (same move as C3): run KIT-VOCAB-COLOR/RADIUS scans over `components/**` + `pages/**`. |
| D-4. Body/placeholder text ≥4.5:1, large ≥3:1 (WCAG AA) | craft-floor `skill-color-verify-contrast`; impeccable `low-contrast`; audit §1; ui-ux-pro-max a11y | MECHANIZABLE | Detector `checkColors` (worst-case across gradient stops) + `screenshot-contrast` visual engine + `checkHoverContrast`. Wire `detect.mjs --json` + the visual engine as a gate. High value — contrast is the classic sampled-audit miss. |
| D-5. No gray text on colored background | impeccable `gray-on-color`; craft-floor "tint secondary text from the hue, never gray" | MECHANIZABLE | Detector `gray-on-color` (DOM + Tailwind-class paths). |
| D-6. Depth = offset + soft blur; no zero-offset colored halo / dark-mode glow / radial halo | craft-floor `skill-color-no-glow-halo`; impeccable `dark-glow`, `radial-halo`; taste §7 no neon | MECHANIZABLE | Detector `checkGlow` + `scanCssTextForRadialHalo`. Static: flag `box-shadow`/`text-shadow` with chromatic color at 0 0 offset. |
| D-7. No gradient text | impeccable `gradient-text`; craft-floor `skill-ban-gradient-text`; taste §7 | MECHANIZABLE | Detector `gradient-text` (`background-clip:text` + gradient; Tailwind `bg-clip-text`). |
| D-8. No AI palette (purple/violet on headings, cyan-on-dark), no cream default | impeccable `ai-color-palette`, `cream-palette`; taste Rule 2 "Lila ban" | MECHANIZABLE | Detector implements both. (Low risk here — MOS palette is fixed by DESIGN.md.) |
| D-9. No colored side-stripe border >1px on cards/list/alerts (the #1 AI tell) | impeccable `side-tab`, `border-accent-on-rounded` + pseudo/inset-shadow variants; craft-floor `skill-ban-side-stripe-borders` | MECHANIZABLE | Detector `checkBorders` + `scanCssTextForPseudoStripe` + `scanCssTextForInsetStripe` (status/toast exempt). Comprehensive already — wire it. |
| D-10. Declare elevation once: border OR shadow, not a hairline border under a wide soft shadow (ghost card) | craft-floor `skill-codex-elevation-radius`; impeccable `gpt-thin-border-wide-shadow` | MECHANIZABLE | Detector `gpt-thin-border-wide-shadow` (advisory). Static: flag an element carrying both a 1px border token and a wide `--shadow-lg`+. |
| D-11. Color never the sole carrier of meaning (status, error) | design-system states §Accessibility; ui-ux-pro-max a11y "Color Only"; audit §1 | CENSUS | Enumerate every status/severity indicator. For each, state whether an icon OR text label accompanies the color. Color-alone = flag. (The ledger's "red Urgent treatment semantically misleading" is this class.) |

---

## E. Interaction affordances

| Rule | Source (skill §) | Class | Enforcement |
|------|------------------|-------|-------------|
| E1. Touch targets ≥44×44px on phone; ≥8px between adjacent targets | ui-ux-pro-max UX Touch (High); audit §4; design-review | **MECHANIZED (partial)** | `mos-app/src/components/ui/tap-targets.css.test.ts` (B-i) asserts 44px floor on `.btn`, `.chip`, `[data-touch-target]`, icon utility, window-selector controls under `@media (max-width:767.98px)`. **Gap:** it enumerates a hard-coded list of selectors. Catches **D9** for those; extend to every interactive control class. |
| E2. Every NEW interactive control class hits the 44px phone floor (close the enumeration gap) | same as E1 | MECHANIZABLE | **Extend the guard.** Vitest: glob every `*.css` for a curated set of interactive selectors (`.btn`,`.chip`,`.tab`,`[role=tab]`,`.view-tabs *`,`.nav-item`,`select`,`input`), assert each raises to 44px in the phone media block. Prevents new sub-44 tabs like the 36–38px ones the owner caught (**D9**). |
| E3. Loading disables the control (no double-submit) | ui-ux-pro-max UX Interaction "Loading Buttons" (High); design-system Button loading state | MECHANIZABLE | Vitest/RTL: render control with `loading`, assert `disabled` + spinner. |
| E4. Destructive actions require confirmation | ui-ux-pro-max UX "Confirmation Dialogs" (High); critique heuristic 5 | CENSUS | Enumerate every destructive action (delete/archive/remove/discard). For each, state whether it is guarded by a confirm step. |
| E5. Visible focus ring on every focusable (2px/2px, 3:1) | design-system states §Focus; audit §1; critique persona Sam | MECHANIZABLE | Vitest source-scan: assert no `outline:none` without an accompanying `:focus-visible` box-shadow ring token. Playwright: tab through, assert each stop has a visible focus box. |
| E6. Hover feedback exists on clickable elements; interaction not hover-*only* | ui-ux-pro-max UX "Hover States"; taste Rule 5 `:active` tactile | CENSUS | Enumerate clickable elements; state whether each has a hover style AND a non-hover (focus/tap) affordance. |
| E7. No image scale/rotate on hover; image is not an action target | impeccable `image-hover-transform`; craft-floor gemini `no-image-hover` | MECHANIZABLE | Detector `image-hover-transform`. Static: flag `img:hover { transform: scale/rotate }`. |
| E8. Exactly one create/primary door per width (no duplicate creation doors) | ledger §4-lens D4; DESIGN.md one-launcher rule | MECHANIZABLE | Playwright: per width (1280/390), count visible create doors for a record type; assert ==1. Overlaps A3. Catches **D4**. |
| E9. Motion: one authored moment, exponential ease-out; no bounce/elastic; no layout-property animation; no marquee/decorative pulse | craft-floor `skill-motion-floor`; impeccable `bounce-easing`, `layout-transition`, `marquee`, `pulsing-dot`; taste §5/§7 | MECHANIZABLE | Detector `checkMotion` + `scanCssTextForMarquee` + pulse scan. Static: flag transitions on width/height/padding/margin, overshoot cubic-bezier, `animate-bounce`. |

---

## F. States & feedback

| Rule | Source (skill §) | Class | Enforcement |
|------|------------------|-------|-------------|
| F1. Loading uses the ONE shared grammar (role=status + aria-busy + skeleton, no literal "Loading…") | `state-kit.test.tsx`; craft-floor states; taste Rule 5 | **MECHANIZED** | `mos-app/src/components/ui/state-kit.test.tsx` (`LoadingShell` is a busy status region; never renders literal "Loading…"). |
| F2. Empty state is composed (message + action), not blank | ui-ux-pro-max UX "Empty States"; craft-floor states; taste Rule 5 | MECHANIZABLE | Vitest/RTL: render each collection/viewer with 0 items; assert an `EmptyState` with a heading + a CTA renders (not `null`, not bare "No results"). |
| F3. Every surface ships hover/disabled/loading/error/empty + real content + keyboard focus | craft-floor `skill-floor-shipping`; taste §10 preflight; audit | CENSUS | For each surface, enumerate the 5 states; render each; state present/absent. This is the "did you actually build all states" census — the most-skipped step. |
| F4. Error names the problem AND the recovery, near the field, non-blocking | craft-floor `skill-copy-design-material`; impeccable critique heuristic 9; ui-ux-pro-max Forms | CENSUS | Enumerate every error message. For each, state: does it name the specific problem and a recovery action, positioned at the source? |
| F5. Disabled: opacity 0.5 + `aria-disabled` + not-allowed; contrast still ≥3:1 | design-system states §Disabled | MECHANIZABLE | Vitest: assert disabled variant sets the shared `--opacity-disabled` token + `aria-disabled`. |
| F6. Confirmation of success (toast/message), not silent success | ui-ux-pro-max UX "Confirmation Messages"; critique heuristic 1 | CENSUS | Enumerate mutating actions; state whether each surfaces a success confirmation. |

---

## G. Accessibility (cross-cuts; the ones not already in D/E/F)

| Rule | Source (skill §) | Class | Enforcement |
|------|------------------|-------|-------------|
| G1. No skipped heading levels (h1→h3) | impeccable `skipped-heading`; audit §1 semantic HTML | MECHANIZABLE | Detector `skipped-heading`. Playwright: read heading outline, assert no level gap. |
| G2. Interactive elements have role/label/state; icon-only controls carry a text label | audit §1 ARIA; critique persona Jordan "icon-only nav"; ui-ux-pro-max a11y | CENSUS | Enumerate every icon-only control; state its accessible name (`aria-label`/sr-only). Unnamed = flag. |
| G3. Images have meaningful alt text; no broken/placeholder `src` | impeccable `broken-image`; audit §1; ui-ux-pro-max "Alt Text" | MECHANIZABLE | Detector `broken-image`. Vitest: flag `<img>` without `alt`. |
| G4. Errors announced (`role=alert`/`aria-live`) | ui-ux-pro-max a11y "Error Messages"; design-system states ARIA | MECHANIZABLE | Vitest/RTL: assert error nodes carry `role="alert"`. |
| G5. Full primary flow completable keyboard-only; no keyboard trap; logical tab order | audit §1; critique persona Sam | CENSUS | Walk the primary journey with keyboard only; state each step reached and focus visible. Cannot be fully static. |
| G6. `prefers-reduced-motion` has an intentional alternative (not a global 0.01ms kill) | audit §1 motion sensitivity | MECHANIZABLE | Source-scan: assert a `@media (prefers-reduced-motion)` block exists and doesn't blanket-null all animation. |

---

## H. Content & labeling

| Rule | Source (skill §) | Class | Enforcement |
|------|------------------|-------|-------------|
| H1. **No naked number**: every displayed figure carries a unit/label AND, where it's a metric, a comparison or decision context | craft-floor `skill-copy-design-material`; critique Cognitive Load; ledger D1 "naked count" | CENSUS | **The census step that would have caught D1.** Enumerate every numeric value rendered on the surface. For each, state in one line: *what it counts, its unit, and the decision it supports* — or flag it "naked". An audit that does not produce this per-number list is non-compliant. |
| H2. Identity column is never starved/truncated (no `Repl…`/`Sour…`; no 0px title column) | ledger D7; §Fresh mockup-regression P0; design-system Table cell alignment | MECHANIZABLE | Playwright at 1280/1024/390: for each collection row, assert the title cell's `scrollWidth <= clientWidth` (no ellipsis truncation of the primary identity) and title column width > 0. Directly catches **D7**. No detector rule — build it. |
| H3. Same text not repeated ≥3× inside one container | impeccable `repeated-container-text` | MECHANIZABLE | Detector `repeated-container-text`. (Ledger "duplicated job copy" is this class.) |
| H4. Controls name their action; labels are the product's own language, no jargon barrier | craft-floor copy; critique heuristic 2 + Jargon Barrier; ui-ux-pro-max | CENSUS | Enumerate every control label; state whether a first-timer (persona Jordan) would understand it without prior knowledge. |
| H5. No marketing buzzwords / AI filler / aphoristic cadence / "theater" framing | impeccable `marketing-buzzword`, `aphoristic-cadence`, `theater-slop-phrase`; taste §7 filler ban; De-reference firewall | MECHANIZABLE | Detector implements. Static: grep the buzzword/filler list over rendered copy. (Low risk in an internal ops app; keep advisory.) |
| H6. Labels above inputs; helper below; error below | taste Rule 6; design-system Input anatomy; ui-ux-pro-max Forms | MECHANIZABLE | Vitest/RTL: assert form field markup order label→input→helper/error. |
| H7. Emotional fit / tone / "does this feel authored for THIS product" | impeccable critique §Design Specificity Verdict | JUDGMENT | The specificity verdict is explicitly an unanchored design-director call; the skill runs it as a sub-agent that must judge *before* seeing detector output. Luna/4-lens only. |

---

## Class totals

| Class | Count |
|-------|------:|
| **MECHANIZED** (existing repo test) | **7** — C1, C2, D-1, D-2, E1, F1 (+ E1 counted once; partial-coverage guards flagged) |
| **MECHANIZABLE** (deterministic test buildable now) | **43** |
| **CENSUS** (rendered per-element enumeration step) | **18** |
| **JUDGMENT** (taste / 4-lens / Luna only) | **5** — A8, A10, B9, H7 (+ G5 is census-leaning judgment; counted in census) |

MECHANIZED, precisely: C1 (KIT-VOCAB-FONT), C2 (KIT-VOCAB-TOKENS), D-1 (KIT-VOCAB-COLOR),
D-2 (KIT-VOCAB-RADIUS), E1 (tap-targets.css.test, partial), F1 (state-kit LoadingShell). Six existing
guards, all narrow (scoped to `ui/*.css` or a hard-coded selector list). The dominant finding: the
repo has proven the *pattern* (source-scan CSS-lock) works and merely needs to be **widened past
`ui/`** and **wired to the impeccable detector**, which already implements ~35 of the MECHANIZABLE
rules but runs as an advisory skill tool, not a blocking gate.

---

## Top-10 MECHANIZABLE rules to build next

Ranked by how many past owner-caught defects (D1–D9) each would have caught, then by breadth/recurrence.

1. **C3 — Type-ladder source-lock across ALL component CSS** (not just `ui/`). Catches **D2** (type-size
   soup), the exact defect that recurred *outside* the kit where the current KIT-VOCAB-FONT test does
   not look. Highest value: proven pattern, one-file extension, kills a re-rotting defect class.
2. **H2 — Identity-column no-truncation Playwright test** at 1280/1024/390. Catches **D7** (`Repl…`,
   0px Task column). No detector rule exists; the ledger shows this regressed repeatedly.
3. **B7 — Rail/sidebar sticky-containment regression test.** Catches **D6** (owner's literal "the
   sidebar follows to get scrolled"). The ledger already ran the exact assertion by hand — just
   encode it.
4. **A3 / E8 — One-primary-action-per-region count.** Catches **D4** (two solid create doors /
   duplicate creation doors). Simple per-region count, static + Playwright.
5. **B6 — Equal-height sibling-panel geometry test.** Catches **D5** (misaligned split heights). New
   Playwright `offsetHeight` diff assertion.
6. **E2 — Widen the 44px tap-target guard from a hard-coded selector list to every interactive class.**
   Catches **D9** (36–38px tabs) and prevents the next new sub-44 control.
7. **D-4 — Wire the impeccable contrast engine (`checkColors` + `screenshot-contrast`) as a gate.**
   Catches the classic sampled-audit miss (low-contrast + gray-on-color); contrast is invisible to a
   glance and the #1 thing five rounds let through.
8. **A1 — Nested-cards / card-soup structural scan** (wire detector `nested-cards`). Catches **D8**
   (card soup, "says confusing").
9. **B1 / B2 / B3 — Spacing-rhythm bundle** (distinct-step count + heading-above>below + cramped-
   padding; wire detector `heading-rhythm`, `cramped-padding`). Catches **D3** (broken rhythm,
   "too big/too tight").
10. **D-9 — Wire the full side-stripe/pseudo-stripe/inset-stripe detector** as a gate. The single most
    recognizable AI tell; broad, deterministic, already fully implemented in `checks.mjs` — pure
    wiring cost, zero authoring.

Coverage check: this top-10 mechanically closes **D2, D3, D4, D5, D6, D7, D8, D9** — eight of the nine
owner-caught defect classes. **D1 (naked numbers)** is irreducibly **CENSUS** (H1) and is handled by
the audit protocol below, not by a static test.

---

## Audit protocol — the mandatory census steps

An audit is **non-compliant and must be rejected** if it skips any numbered step or reports a Nielsen
score without the per-element artifacts each step produces. Run in this order. Each step emits a named
artifact; the ledger entry for the audit MUST attach all seven.

**Step 0 — Gate first, eyes second.** Run the mechanized battery before any visual judgment:
`npx vitest run` (KIT-VOCAB + tap-targets + state-kit + the new guards) and
`node .claude/skills/impeccable/scripts/detect.mjs --json <targets>`. Record exit codes. A green gate
is the *floor*, never the verdict ("green gates ≠ reviewed"). Artifact: **gate-log**.

**Step 1 — Number census (catches D1).** Render each surface at 1280/1024/390. Enumerate *every*
numeric value on screen. For each, write one line: `<value> — counts <what>, unit <x>, supports
<which decision>` — or `NAKED`. Artifact: **number-census** (a table with one row per number). An
audit with no number-census is non-compliant.

**Step 2 — Control-axis census (catches D8/A6).** Enumerate every control in each toolbar/header/nav.
For each: the action it performs and its axis. Flag any two controls sharing an axis; flag any
decision point with >4 simultaneous controls (>5 for nav). Artifact: **control-census**.

**Step 3 — State census (catches F3).** For each surface, render all five states (default/hover-or-
focus/loading/error/empty) plus real seeded content. State present/absent per state. Artifact:
**state-matrix**.

**Step 4 — Identity & geometry census (catches D5/D7).** At all three widths, for each collection: the
title cell's `scrollWidth`/`clientWidth` (truncation), title-column width, sibling-panel heights, and
rail scrollTop under a driven `main.scrollTop=400`. Artifact: **geometry-log** (real
`getBoundingClientRect` numbers, not "looks fine").

**Step 5 — Affordance & a11y census.** Enumerate icon-only controls (accessible name), color-only
status indicators, destructive actions (confirm step), and walk the primary journey keyboard-only.
Artifact: **affordance-census**.

**Step 6 — Copy census.** Enumerate control labels and error messages; per H4/F4, state
comprehension + problem/recovery. Artifact: **copy-census**.

**Step 7 — Judgment pass (Luna / 4-lens), LAST and INDEPENDENT.** Only after Steps 0–6 produce their
artifacts does the taste layer run — the design-specificity verdict, whole-product coherence (A10),
density balance (B9), emotional fit (H7). Per the "never self-score design gates" rule, Luna scores
*fresh renders*; the Director does not self-score. The Nielsen/anti-slop number is attached to these
seven artifacts, never quoted alone.

**Compliance test for the audit itself:** the ledger entry must link gate-log, number-census,
control-census, state-matrix, geometry-log, affordance-census, and copy-census. Missing any one =
the audit did not run the skills' procedures and its score is void. This is exactly the failure mode
of the five prior rounds: they produced Step 7 (a number) without Steps 1–6 (the per-element
enumerations), so element-level defects the owner then caught were never in scope.
