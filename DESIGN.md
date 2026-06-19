---
name: Gordi MOS
version: alpha
description: The owner-approved "Quiet Control Surface" — calm, dense, data-first. Adopted from PMO (2026-06-10, OD-DIR-8) as MOS's identity authority; diverges only via owner-approved additions. ADR-0009 (2026-06-19) re-expressed the palette to Display-P3 + adopted the mos-design-kit token system + light/dark theme. Runtime tokens live in mos-app/src/index.css as color(display-p3 …); the oklch values below are the linter-compatible documentation form (same colors, OKLab space — a wide-gamut format the @google/design.md linter parses).
colors:
  # --- Surfaces / action (oklch = linter-parseable wide-gamut form; runtime is color(display-p3 …)) ---
  primary: "oklch(0.546 0.2153 262.8719)"        # The One Blue — action/ring
  background: "oklch(1 0 89.8756)"                # pure white canvas (light theme)
  foreground: "oklch(0.1405 0.0044 285.8238)"     # near-black primary text
  card: "oklch(1 0 89.8756)"                      # elevated surface (== background in light)
  card-foreground: "oklch(0.1405 0.0044 285.8238)"
  popover: "oklch(1 0 89.8756)"
  popover-foreground: "oklch(0.1405 0.0044 285.8238)"
  primary-foreground: "oklch(0.9848 0 89.8756)"   # near-white on solid blue
  # --- Quiet UI ---
  secondary: "oklch(0.9676 0.0013 286.3752)"      # light cool grey — quiet fills
  secondary-foreground: "oklch(0.2103 0.0059 285.8835)"
  muted: "oklch(0.9676 0.0013 286.3752)"          # == secondary (shadcn convention)
  muted-foreground: "oklch(0.4987 0.0128 285.925)" # darkened ~40% L so muted text clears AA on secondary fills
  accent: "oklch(0.9676 0.0013 286.3752)"         # shadcn "accent" = quiet hover wash (NOT the blue)
  accent-foreground: "oklch(0.2103 0.0059 285.8835)"
  # --- Status / semantic ---
  destructive: "oklch(0.6368 0.2078 25.3259)"     # errors, destructive button, "lost"
  destructive-foreground: "oklch(0.9848 0 89.8756)"
  warning: "oklch(0.8334 0.1641 83.8666)"         # amber — aging/overdue caution
  warning-foreground: "oklch(0.4096 0.1037 46.3142)" # deep brown — AA on amber tints
  success: "oklch(0.7205 0.192 149.4926)"         # green — "won"/positive
  success-foreground: "oklch(0.9848 0 89.8756)"
  # --- Lines / fields / focus ---
  border: "oklch(0.9197 0.004 286.32)"            # Single-Border Rule: border == input
  input: "oklch(0.9197 0.004 286.32)"
  ring: "oklch(0.546 0.2153 262.8719)"            # focus ring == The One Blue
  # --- Categorical accent (non-interactive) ---
  violet: "oklch(0.5424 0.2454 293.016)"          # KPI/timeline only — never action
  # --- Gordi brand (OD-P3-7 — first owner-approved divergence) ---
  brand-navy: "oklch(0.3154 0.0639 260.7289)"     # structural weight; NOT an action color
  brand-navy-text: "oklch(0.3527 0.0672 260.7809)" # AA text/label on white (≥7:1)
  brand-orange: "oklch(0.619 0.1833 39.9351)"     # brand sprinkle ONLY; never status, never action
  # --- Status-pill AA-darkened text (DESIGN.md §5 / ADR-0008) ---
  status-open-text: "oklch(0.4301 0.1673 262.7596)"
  status-won-text: "oklch(0.5217 0.1296 150.642)"
  status-lost-text: "oklch(0.5314 0.1989 27.3946)"   # == field-error-text
  status-violet-text: "oklch(0.4312 0.1898 293.5085)"
typography:
  # OD-P3-9 (2026-06-18): font pairing swapped to Plus Jakarta Sans (display) +
  # DM Sans (body/UI/table). Inter RETIRED as primary family. Jakarta wants looser
  # tracking than Inter — title tracking relaxed from -0.02em/-0.01em toward
  # -0.01em/normal. Mono unchanged (SF Mono, IDs/codes only).
  page-title:
    fontFamily: "Plus Jakarta Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  heading:
    fontFamily: "Plus Jakarta Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "0px"
  subheading:
    fontFamily: "Plus Jakarta Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "DM Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "DM Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.3
  overline:
    fontFamily: "DM Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.06em"
  mono:
    fontFamily: "SF Mono, ui-monospace, JetBrains Mono, Menlo, monospace"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  # OD-P3-10 (2026-06-18): --radius bumped 8px→12px for CARDS/CONTAINERS/OVERLAYS.
  # Controls (buttons/inputs/badges/nav-items) stay tight at 8px (taste guard —
  # don't let 32px controls go bubbly). Scale below tracks calc(var(--radius) - N).
  xs: "4px"            # checkbox, tiny inner corners — calc(--radius - 8px)
  sm: "8px"            # CONTROL radius — buttons/inputs/nav-item — calc(--radius - 4px)
  md: "10px"           # mid nesting — calc(--radius - 2px)
  lg: "12px"           # CARD/CONTAINER/OVERLAY radius — var(--radius)
  full: "999px"
shadows:
  # OD-P3-11 (2026-06-18): Soft-Elevation — one subtle RESTING shadow on cards/KPI/kanban.
  # Desaturated near-black / faintly navy-tinted; No-Pure-Black-Shadow Rule preserved.
  # ADR-0009: values now use color-mix() so they carry both light + dark themes.
  rest:         "0 1px 2px color-mix(in srgb, var(--brand-navy) 5%, transparent), 0 1px 3px color-mix(in srgb, var(--brand-navy) 4%, transparent)"
  hover:        "0 2px 10px color-mix(in srgb, var(--ds-font-color-primary) 6%, transparent)"
  pressed:      "0 1px 2px color-mix(in srgb, var(--ds-font-color-primary) 12%, transparent)"
  brand-button: "0 1px 2px color-mix(in srgb, var(--accent) 25%, transparent)"
  kanban-hover: "0 4px 14px color-mix(in srgb, var(--ds-font-color-primary) 10%, transparent)"
  overlay:      "0 10px 30px color-mix(in srgb, var(--ds-font-color-primary) 16%, transparent), 0 2px 6px color-mix(in srgb, var(--ds-font-color-primary) 8%, transparent)"
gradients:
  # OD-P3-12 (2026-06-18): SUBTLE NAVY gradients only (NEVER purple). Two bounded uses.
  # The gradient is a SHEEN, not a new hue — The One Blue Rule preserved.
  primary-sheen: "linear-gradient(180deg, color-mix(in srgb, var(--accent) 100%, white 3%) 0%, var(--accent) 100%)"
  surface-wash:  "linear-gradient(180deg, color-mix(in srgb, var(--brand-navy) 3.5%, transparent) 0%, color-mix(in srgb, var(--brand-navy) 0%, transparent) 220px)"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  base: "16px"   # standard card padding
  lg: "20px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "32px"
  button-primary-hover:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "32px"
  button-outline-hover:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.foreground}"
  button-ghost:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "32px"
  button-ghost-hover:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.foreground}"
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.destructive-foreground}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "32px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.lg}"
    padding: "16px"
    # shadow semantics live in ## Elevation & Depth (shadow is not a valid component sub-token)
  input:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "32px"
  badge-status:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.full}"
    padding: "0 9px"
    height: "22px"
  table-header-cell:
    backgroundColor: "{colors.card}"
    textColor: "{colors.muted-foreground}"
    padding: "0 12px"
    height: "38px"
  table-body-cell:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    padding: "12px"
    height: "54px"
  nav-item:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "36px"
  nav-item-active:
    backgroundColor: "{colors.primary}"   # primary/10% tint at runtime
    textColor: "{colors.foreground}"       # full-color foreground (fixed: was blue-on-blue)
    rounded: "{rounded.sm}"
    height: "36px"
  kanban-card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "11px"
    # shadow semantics live in ## Elevation & Depth
---

# Design System: Gordi MOS

> **ADR-0009 (2026-06-19) — token-system adoption.** This file is the identity authority
> (OD-DIR-8). Runtime tokens live in `mos-app/src/index.css` as `color(display-p3 …)`
> values ported from the clean-room `mos-design-kit` (990 `--ds-*` tokens, light + dark).
> The `oklch()` values in the frontmatter above are the **linter-compatible documentation
> form** of the same colors — OKLab is a wide-gamut space the `@google/design.md` linter
> parses; `color(display-p3 …)` is not linter-parseable but is the runtime form. Both
> forms express identical colors. Gordi brand tokens (`brand-navy/orange`, OD-P3-7) are
> preserved as **additions** on top of the kit. The 10 named rules below are the
> load-bearing identity, preserved verbatim. See ADR-0009 for the architecture.

## Overview

**Creative North Star: "The Quiet Control Surface."**

This is the existing, owner-approved RIS Portal look — a shadcn/Radix-derived, near-monochrome control surface — adopted wholesale as the Gordi MOS's visual identity. It is **preserved, not reinvented.** The system was extracted verbatim from the RIS reference mockups (`sales-pipeline-reference.html`, `budget-reference.html`), both of which carry one identical token block ("Token System A", shadcn-vue HSL, light scheme). Every value below is reverse-engineered from those files; nothing here is a new brand, palette, or font.

The personality is **calm, dense, and data-first.** The surface is white-on-near-white: a single blue carries every interactive affordance against a field of warm-cool greys, so the eye goes straight to numbers, status, and the one action that matters. Density is deliberate — controls are compact (32px tall), but table rows breathe (54px) so financial figures are scannable. This is an operator's tool for a contract- and project-based business: the owner reviews budgets, procurement, and pipeline on desktop and phone, and the design optimizes for trust in the data over decoration. It explicitly rejects the "AI SaaS marketing" aesthetic: no neon, no glassmorphism panels, no oversized hero type, no shadow-heavy "floating card" soup, no purple gradients.

**Owner-ratified demo-aligned refresh (2026-06-18, OD-P3-9..12).** After comparing the app to a reference demo, the owner directed four bounded divergences that adjust the system's *texture* without changing its *identity*: a new font pairing (Plus Jakarta Sans + DM Sans, retiring Inter), a slightly larger card radius (12px), a single subtle *resting* shadow on cards (a measured relaxation of the old flat-by-default stance), and two restrained navy gradients. The One Blue Rule, the near-monochrome palette, the Single-Border Rule, density, the Tinted-Status pattern, and all RACI/progress/ops/MOS-density tokens are **unchanged** — these are the load-bearing identity, and the refresh leaves them intact.

**Key Characteristics:**
- One blue accent (`primary`, `hsl(221 83% 53%)`) does all the interactive work; everything else is neutral.
- Borders define structure; a single subtle resting shadow now co-signs elevation on cards (OD-P3-11). Heavier shadows remain a *response to state* (hover, focus, overlay), never decoration.
- 12px card/overlay radius (`--radius: 0.75rem`) is the spine; 32px controls stay tighter at 8px (`calc(var(--radius) - 4px)`) so they don't go bubbly.
- Plus Jakarta Sans for display/headings, DM Sans for body/UI/table; `tabular-nums` for all money and metrics; SF Mono for IDs/codes only.
- Status is communicated by a small colored dot + tinted pill, not by loud fills.

## Colors

A near-monochrome system built on shadcn-vue's HSL roles. The hue spine is a cool neutral (`240`); the only saturated color in normal use is the primary blue. Status colors (destructive/warning/success) appear only on data state, and a single categorical violet is reserved for KPI/avatar/timeline accents — never as an action color. The light scheme is the default on `:root`; **dark mode shipped in ADR-0009** (`mos-app/src/styles/tokens/theme-dark.css`, opt-in via the `.dark` scope).

### Primary
- **Action Blue** (`hsl(221.2 83.2% 53.3%)`): The one interactive color. Primary buttons, active nav item (at 10% tint + full-color text), selected rows (7% tint), focus ring, checkbox fill, links-in-context, the "current" step in steppers, sticky-tab indicators, and the toast accent stripe. Its foreground (`hsl(0 0% 98%)`, near-white) sits on solid blue. **Used sparingly** — see The One Blue Rule. *(OD-P3-12: the primary button may optionally carry a whisper-subtle navy-tinted vertical gradient — a sheen within this same blue, NOT a new hue; see §4 Gradients.)*

### Secondary (categorical accent — not an action color)
- **Categorical Violet** (`hsl(262 83% 58%)`): Reserved for non-interactive categorization only: a KPI icon tile (`violet` variant), and select timeline/legend dots. Never use it for buttons, links, or anything clickable. *(The user avatar gradient moved from blue→violet to **navy→blue** in OD-P3-7; violet is no longer an avatar token — it is KPI/timeline only.)*

### Tertiary (status semantics — data-driven only)
- **Destructive Red** (`hsl(0 84.2% 60.2%)`, fg `hsl(0 0% 98%)`): Errors, destructive buttons, "lost"/negative status, overdue/stale ages, negative deltas, notification dot. Tinted variants at ~10–12% for chips/icon tiles.
- **Warning Amber** (`hsl(43 96% 56%)`, fg `hsl(22 78% 26%)`): "Aging"/"overdue" warnings, mid-threshold bars, caution KPI tiles. Note the deep-brown foreground for AA text contrast on amber tints.
- **Success Green** (`hsl(142 71% 45%)`, fg `hsl(0 0% 98%)`): "Won"/positive status, completed steps, positive deltas, high-threshold bars, the "Live" pulse tag, success toasts.

### Neutral
- **Background** (`hsl(0 0% 100%)`, pure white): App background and header. Note the main scroll area uses `secondary` at 35% (`hsl(240 4.8% 95.9% / 0.35)`) to lift cards off the page.
- **Foreground** (`hsl(240 10% 3.9%)`, near-black): Primary text.
- **Card / Popover** (`hsl(0 0% 100%)`): Elevated surfaces (cards, table body, rail, popovers, toasts) — pure white against the tinted main area.
- **Secondary / Muted / Accent** (`hsl(240 4.8% 95.9%)`, light cool grey): These three share one value but differ in intent. `secondary` = quiet fills (segmented controls, count pills, progress tracks). `muted` pairs with `muted-foreground` (`hsl(240 3.8% 46.1%)`) for de-emphasized text (labels, captions, breadcrumb, sub-values). `accent` is the hover wash on interactive neutral surfaces (rail items, ghost buttons, row hover, control hover).
- **Border / Input** (`hsl(240 5.9% 90%)`): All hairline dividers, card outlines, and field strokes — one value. Table row dividers soften to 70% opacity.

### Gordi brand tokens (OD-P3-7)

The three Gordi brand tokens are the **first owner-approved divergence** from the adopted RIS near-monochrome palette (ratified 2026-06-16). They carry structural and brand identity weight; they do NOT add interactive affordance (The One Blue Rule is preserved).

| Token | Value | Role |
|---|---|---|
| `brand-navy` | `hsl(218 46% 22%)` | Structural weight — logo, active nav indicator, group-by chrome, drawer tab underline; the navy tint for gradients (OD-P3-12) |
| `brand-navy-text` | `hsl(218 42% 26%)` | AA text/label on white and on the navy/6 tint (≥7:1 on white) |
| `brand-orange` | `hsl(18 80% 48%)` | Brand sprinkle — logo dot, active view-tab underline. Never status, never action |

**Navy tint:** `brand-navy / 0.06` fill is generated via the v4 slash-alpha modifier (`bg-brand-navy/6`) — no separate token, mirroring how `primary/10` works.

**No `brand-orange` tint/text token** — orange is only ever used at full strength as a tiny marker (logo dot, active view-tab underline 2px); it never carries text or a fill behind text, so it needs no AA-darkened variant.

### Named Rules
**The One Blue Rule.** The primary blue is the only saturated interactive color and should touch ≤10% of any screen. If two things on a screen are blue and only one is the main action, one of them is wrong. Categorical violet and status colors are NOT substitutes for it. *(OD-P3-12 preserved: the optional primary-button gradient is a sheen WITHIN this blue — it adds no second action hue and introduces no purple.)*

**The Tinted-Status Rule.** Status is shown as a 6px colored dot plus a pill tinted at ~10–18% of the status hue with a darkened text variant — never a fully saturated solid fill behind body text. Solid status fills are reserved for the destructive *button* only. *Note: Task status chips use an 8px dot (bumped from 6px for WCAG 1.4.1 visibility) + always-present text label (never dot-only) so status stays perceivable when grouping ≠ Status — see §5 Badges.*

**The Single-Border Rule.** `border` and `input` are the same value on purpose. Never introduce a second border color to "separate" regions; use the `secondary`/`card` surface contrast or spacing instead.

**The Structural-Navy Rule (OD-P3-7).** `brand-navy` carries *structural* weight the lone action-blue must not: the logo square + dot, the active nav indicator (inset-shadow rail marker), the group-by control, the drawer's active-tab underline, the avatar gradient (`navy → primary`), and the navy tint behind the OD-P3-12 gradients. It is **never** an action color (no buttons, no links) and **never** a status. The One-Blue Rule is preserved — `primary` blue remains the *only* interactive/action color.

**The Orange-Sprinkle Rule (OD-P3-7).** `brand-orange` is a brand sprinkle used **sparingly** (≤2 marks per screen): the logo dot and the **active view-tab underline marker**. It is kept **OFF all status semantics** (it sits hue-wise between the red/amber status hues and would be misread as a warning) and **OFF all actions**. Never a status, never a link, never a button.

## Typography

**Display / Heading Font (OD-P3-9):** Plus Jakarta Sans (with `system-ui, -apple-system, "Segoe UI", sans-serif` fallback) — page titles, section/card headings, subheadings.
**Body / UI / Table Font (OD-P3-9):** DM Sans (same fallback stack) — body copy, controls, table cells, labels, overlines.
**Mono Font:** SF Mono (with `ui-monospace, "JetBrains Mono", Menlo, monospace`) — IDs, codes, and the `⌘K` glyph only. *(Unchanged.)*

**Character:** Two geometric-humanist sans share the work: Plus Jakarta Sans gives headings a touch more warmth and presence than Inter did, while DM Sans keeps body and table text quiet, legible, and tight at 14px. The voice stays neutral and engineered, never expressive. **Jakarta tracks looser than Inter** — so the title `letterSpacing` was relaxed from `-0.02em`/`-0.01em` to `-0.01em`/`normal` (over-tightening Jakarta makes counters collide). Base size is 14px with a 1.45 line-height; the app reads like a well-set spreadsheet, not a landing page. **`tabular-nums` (`font-variant-numeric: tabular-nums` + `font-feature-settings: "tnum"`) is mandatory on all money, percentages, counts, deltas, and metric values** so columns align and figures don't jitter on update — both Plus Jakarta Sans and DM Sans ship a `tnum` feature, but this MUST be verified on the live Tasks table (see The Tabular-Numbers Rule + the implementer tnum-verification step).

### Hierarchy
- **Page Title** (Plus Jakarta Sans, 600, 24px, lh 1.2, ls -0.01em): One per page, in `.page-head`. KPI values reuse ~23px/600 for the headline number. *(Weight dropped 700→600: the demo's Jakarta headings read at 600 with normal tracking; 700 + tight tracking looks heavy in this family.)*
- **Heading** (Plus Jakarta Sans, 600, 20px, lh 1.25, ls normal): Section/card titles, kanban column titles (~13.5px/600 in compact contexts).
- **Subheading** (Plus Jakarta Sans, 600, 18px, lh 1.3): Sub-section headers inside detail panels.
- **Body** (DM Sans, 400, 14px, lh 1.45): Default text. Controls and table cells run 13.5px; the base run is 14px.
- **Label** (DM Sans, 600, 12px, lh 1.3): Status pills, badge counts, dense metadata, button text at small sizes.
- **Overline** (DM Sans, 600, 11px, lh 1.3, ls 0.06em, UPPERCASE): Rail group labels and table column headers (`thead th` at 11.5px). The uppercase + tracked treatment is the system's section-divider voice.
- **Mono** (SF Mono, 500, 13px): Project codes / IDs (`.pc-id`), keyboard hints (`.kbd`, `⌘K`). Never for prose or numbers-in-tables (those use tabular DM Sans).

### Named Rules
**The Tabular-Numbers Rule.** Every figure that can change or be compared (currency, %, counts, deltas, ages) is `tabular-nums`. Non-negotiable in tables, KPIs, kanban totals, and funnel values. **Font-family contingency (OD-P3-9):** Plus Jakarta Sans and DM Sans both expose a `tnum` OpenType feature, but tabular-figure quality varies by build. The implementer MUST verify (see implementer note 7) that `font-feature-settings: "tnum"` actually column-aligns digits on the Tasks table in DM Sans. **If DM Sans `tnum` is weak or absent, fall back to `Inter, …` with `tnum` for numeric table cells / KPI values ONLY** (a scoped `.tnum`/`.num` utility), keeping Inter alive *solely* as the tabular-figure font in those cells — never as the proportional body/UI face. This is the only sanctioned residual use of Inter post-OD-P3-9, and only if the verification fails. **Verification result (2026-06-18): DM Sans `tnum` is a no-op in its `@fontsource` build — measured digit widths don't equalize (digit "1" stays ~0.9px narrower), so the Inter-tabular fallback IS ENGAGED.** The `.tabular` utility is scoped to `Inter Variable` (verified 0px digit spread); proportional body/UI text stays DM Sans. Inter is imported solely for this numeric scope.

**The Mono-For-Identifiers Rule.** SF Mono appears only on machine identifiers (deal/project codes) and keyboard chips. Money is DM-Sans-tabular (or the Inter-tabular fallback above), not mono.

## Elevation & Depth

This is a **borders-first system with a permitted soft resting lift** (amended 2026-06-18, OD-P3-11). Depth is conveyed primarily by 1px borders and surface-tone contrast (white `card` floating on the `secondary`/35% main area) — and now *also* by one subtle, low-opacity **resting shadow** on cards/KPI/kanban that gives the surface a gentle, elegant lift without floating. Heavier shadows remain small, low-opacity, and almost always a *response to state* — a card deepens to ~`0 2px 10px` on hover, a primary button carries a faint `0 1px 2px` brand-tinted shadow, segmented "on" states get a `0 1px 2px` lift to read as pressed. Only true overlays (popover menus, toasts, tooltips) carry a real drop shadow, because they genuinely float above the page. All shadow colors are a desaturated near-black, faintly navy-tinted (`hsl(222 18% 12% / low-alpha)` at rest; `hsl(240 6–10% ~8% / low-alpha)` for state/overlay), never pure black.

### Shadow Vocabulary
- **Resting lift** (`box-shadow: 0 1px 2px hsl(222 18% 12% / 0.05), 0 1px 3px hsl(222 18% 12% / 0.04)`) — **NEW (OD-P3-11)**: the gentle elegance shadow at rest on cards, KPI tiles, and kanban cards. Faintly navy-tinted, very low alpha; it co-signs the 1px border, never replaces it. This is the `shadows.rest` token.
- **State lift** (`box-shadow: 0 2px 10px hsl(240 6% 10% / 0.06)`): Card / KPI tile on hover — deepens from the resting lift.
- **Pressed/selected lift** (`box-shadow: 0 1px 2px hsl(240 6% 10% / 0.10–0.14)`): Active segment in a segmented control; the live-layout switcher's selected pane button.
- **Brand button shadow** (`box-shadow: 0 1px 2px hsl(var(--primary) / 0.25)`): Primary button at rest — a faint tinted seat.
- **Kanban card hover** (`box-shadow: 0 4px 14px hsl(240 6% 10% / 0.10)`): Slightly deeper than KPI hover; cards are draggable, so they lift more.
- **Overlay** (`box-shadow: 0 10px 30px hsl(240 10% 8% / 0.16), 0 2px 6px hsl(240 10% 8% / 0.08)`): Popover row-menu. Toasts/tooltips use a single `0 10px 30px … / 0.16` (tooltip darker, `0 8px 24px hsl(240 10% 4% / 0.4)` on its dark surface).

### Named Rules
**The Soft-Elevation Rule (OD-P3-11, 2026-06-18 — amends the former Flat-By-Default Rule).** Cards, KPI tiles, and kanban cards carry **exactly one** subtle resting shadow (the `shadows.rest` token) *in addition to* their 1px border — a gentle, elegant lift, never a float. The border remains a **co-equal** structure cue; the shadow does not replace it (a card still has both). All other surfaces (toolbars, table bodies, group headers, page chrome, strips) stay **flat at rest** — defined by border and tone only. Deeper shadow appears only as a response to state (hover, pressed, focus) or because the element genuinely floats (popover, toast, tooltip). **The ban on shadow-soup stands:** never stack multiple resting shadows, never raise the resting alpha above ~0.06 total, never give a flat utility surface (toolbar, plain row, strip) a resting shadow. "Subtle and elegant," not "floaty."

**The No-Pure-Black-Shadow Rule.** Shadow color is always desaturated near-black at low alpha — at rest a faint navy tint (`hsl(222 18% 12% / 0.04–0.05)`), for state/overlay `hsl(240 …% ~8–10% / 0.04–0.16)`. Never `rgba(0,0,0,…)` at high opacity — that reads as a 2014 app.

### Gradients (OD-P3-12)
The system was gradient-free at rest by default. The owner ratified **two bounded, navy-tinted gradients** — explicitly **NOT purple**, far lighter than the demo's lavender, and always within The One Blue Rule.

- **Primary-button sheen** (`gradients.primary-sheen`): An **optional** whisper-subtle vertical gradient on the primary fill — top ~3% lighter, bottom ~2% darker than the base `primary`. It is a sheen on the *same* blue, not a second hue. `primary-foreground` (near-white) clears AA (≥4.5:1) across the *entire* range.
- **Surface wash** (`gradients.surface-wash`): A very faint navy-tinted top-wash for **home / digest surfaces only** (My Week). It fades from `brand-navy` at 3.5% alpha to fully transparent within 220px.

**The Restrained-Gradient Rule (OD-P3-12).** Gradients are permitted in **exactly two places**: the optional primary-button sheen and the home/digest surface wash. Hard bounds: **(1)** never on status; **(2)** never introduces a new hue — only the `primary` blue (sheen) or `brand-navy` (wash) families, **never purple/indigo/violet**; **(3)** opacity ceiling — the surface wash tops out at **3.5% alpha** and fully fades to transparent; the button sheen stays within **±3% L** of base `primary`; **(4)** AA text contrast must hold across the **full** gradient range, verified at the worst-case stop. No glassmorphism, no neon, no multi-stop rainbows — these are *whispers* of depth.

## Shapes

Radii follow the `xs/sm/md/lg/full` scale (4/8/10/12/999px). **Controls stay tight at 8px** (`rounded.sm`) — buttons, inputs, nav-items, badges — so 32px controls don't go bubbly. **Cards / containers / overlays take the 12px card radius** (`rounded.lg`, OD-P3-10). Checkbox / tiny inner corners use 4px (`rounded.xs`). Pills / status badges use `full` (999px). Nested radii compose so inner corners sit inside outer ones.

## Components

All interactive controls are **32px tall** ("h-8") with **8px control radius** (`{rounded.sm}` = `calc(var(--radius) - 4px)`) unless noted; **cards/containers/overlays use the 12px card radius** (`{rounded.lg}` = `var(--radius)`). Data table rows are deliberately roomier at 54px. Nested radii use `calc(var(--radius) - 2px/4px)` so inner corners sit inside outer ones. *(OD-P3-10 taste guard: the radius bump to 12px applies to the big surfaces only — 32px controls stay tight at 8px so buttons/inputs/badges/nav-items don't go bubbly.)*

### Buttons
- **Shape:** 8px radius (`{rounded.sm}`, the control radius — unchanged in absolute px by OD-P3-10, now expressed as `calc(var(--radius) - 4px)`), 32px tall, `0 12px` padding, 7px gap to a 15px icon. Small variant (`btn-sm`): 28px tall, 13px text. Icon-only: 32px square.
- **Primary:** `primary` bg, `primary-foreground` text, faint brand shadow at rest. **Optionally** the `gradients.primary-sheen` navy-tinted sheen fill (OD-P3-12) — same blue, AA-safe across its range. Hover → `primary` at 90% (`hsl(var(--primary) / 0.9)`); the sheen, if used, flattens to the solid hover blue.
- **Outline:** `background` fill, `input` border, `foreground` text. Hover → `accent` wash.
- **Ghost:** transparent, `foreground` text. Hover → `accent` wash. Used for icon buttons in the header.
- **Destructive:** `destructive` bg, `destructive-foreground` text. Hover → 90%. The only solid status fill in the system; reserved for irreversible actions (Mark lost, Delete). No gradient (Restrained-Gradient Rule bans gradients on status).
- **Focus:** global `:focus-visible` ring — `outline: 2px solid {colors.ring}; outline-offset: 2px`.
- **Disabled (gap — not yet ratified):** not defined in source; proposed `opacity: 0.5; cursor: not-allowed; pointer-events: none`.

### Badges / Status Pills
- **Status pill:** 22px tall, full radius, 12px/600 label, with a leading 6px colored `dot`. Background = status hue at ~10–18%, text = a darkened variant of the hue for AA contrast (applied via the named CSS token — see below). Variants observed: `open` (blue), `won` (green), `lost` (red), `overdue` (amber). Default/neutral badge uses `secondary` bg + `muted-foreground` text. No gradient (status).
- **Count badge** (nav rail / kanban): `secondary` bg + `muted-foreground` text, full radius; active nav item flips to `primary/15%` bg + `primary` text. Kanban column count adds a 1px border on `background`.

#### Status-pill text tokens (Wave-6 H3 — named source of truth in `index.css` `:root`)
The darkened-AA text values for the four non-neutral pill variants are defined as named CSS custom properties. The `StatusPill` component applies them as `hsl(var(--token))` inline styles — the token IS the applied value.

| Token | HSL value | Pill variant | Contrast (on white) |
|---|---|---|---|
| `--status-open-text` | `221 75% 38%` | `open` (blue) | ≥4.5:1 AA |
| `--status-won-text` | `142 64% 30%` | `won` (green) | ≥4.5:1 AA |
| `--status-lost-text` | `0 72% 45%` | `lost` (red) | ≥4.5:1 AA |
| `--status-violet-text` | `262 60% 42%` | `violet` | 7.4:1 AA |

### Cards / Containers
- **Corner Style:** **12px radius** (`{rounded.lg}` = `var(--radius)`, OD-P3-10 — up from 8px). When a card sits directly above a toolbar+table assembly, top corners are rounded and the seam is squared (`var(--radius) var(--radius) 0 0`).
- **Background:** `card` (white) on the `secondary/35%` main area; the contrast is what makes it read as elevated.
- **Border:** always a 1px `border`. A co-equal depth cue alongside the resting shadow.
- **Shadow:** the subtle `shadows.rest` resting lift at rest (OD-P3-11); deepens to `state lift` on hover for interactive cards (KPI, kanban). *(This is the deliberate Soft-Elevation amendment — cards now carry both border AND a faint resting shadow.)*
- **Internal Padding:** 16px standard (`{spacing.4}`); compact cards (kanban) use ~11px.
- **The KPI Tile** (signature): white card, 12px radius, resting lift, 16px padding, with a top row of [30px tinted icon tile] + [label, `muted-foreground` 12.5px] + [help `?`], a 23px/600 tabular value, and a foot row with a tinted delta chip (`up` green / `down` red / `neutral` grey) plus a `muted` "vs." comparison. Negative values turn `destructive`.

### Inputs / Fields
- **Style:** `background` fill, 1px `input` border, **8px control radius** (`{rounded.sm}` = `calc(var(--radius) - 4px)`), 32px tall, `0 10px` padding. Placeholder = `muted-foreground`. The search-mini and the header `cmdk` are the canonical field shells; inner `<input>` is borderless/transparent and inherits the font (DM Sans). No resting shadow on inputs (Soft-Elevation Rule — flat utility surface).
- **Focus:** `:focus-visible` ring (`2px {colors.ring}`, 2px offset). The `cmdk` also shifts its border on hover (`muted-foreground/50%`).
- **Checkbox:** 16px, 1.5px `input` border, **4px radius** (`{rounded.xs}` = `calc(var(--radius) - 8px)`); checked → `primary` fill + `primary` border + white check. Exposed with `role="checkbox"` + `aria-checked` + `tabindex`.
- **Error (field validation — RATIFIED 2026-06-15, OD-P3-5):** the documented gap is now closed with two named tokens, both reusing existing palette values (no new hue):
  - `--field-error-border` = `destructive` — the field's 1px `input` border swaps to `destructive` while the field is invalid.
  - `--field-error-text` = `--status-lost-text` (`0 72% 45%`, the AA-darkened red) — for the helper/error line below the field. **Not** base `destructive`, which fails AA (~3.6:1) as small text on white; the darkened red clears AA (≥4.5:1), mirroring the Tinted-Status pattern (saturated hue for the marker/outline, darkened variant for the text).
  - Applied on inline-validate-on-blur in the create-task form (OD-P3-4). Base `destructive` stays the field *outline*; the error *text* is always `--status-lost-text`.
- **Disabled (gap — not yet ratified):** no disabled-field styling in source; proposed `secondary` bg + `muted-foreground` text + `not-allowed` cursor. Not yet ratified (no owner-driven disabled-field need yet); the error pair above is the only §5 Inputs item ratified so far.

### Data Table (signature)
- **Header cells:** sticky, `card` bg, 38px tall, Overline type (11.5px/600 uppercase, 0.03em, `muted-foreground`, DM Sans), bottom `border`. Sortable headers gain `foreground` on hover with a 12px sort glyph. Numeric columns right-align; selection/center columns center.
- **Body cells:** 54px tall ("roomy rows — breathe"), 12px padding, divider = `border/70%`. Row hover → `accent/60%`; selected → `primary/7%`; expanded → `accent/50%`. Row `⋯` menu button is hidden until row hover. No per-row resting shadow (the table is one card; the Soft-Elevation rest sits on the card, not each row).
- **Dense DB-view variant (OD-P3-6).** On the full-bleed Tasks DB-view, body rows run **50px** (not the standard 54px) — an intentional density increase for the scan-many-rows workspace job, paired with horizontal hairline dividers (`border/70%`) and **no vertical column rules** (vertical "stripes" hurt scan-readability — owner). 54px remains the default for all other DataTables. The 50px figure is the only deliberate divergence from the 54px row token and is documented here so it isn't "drift."
- **In-cell patterns:** project cell (28px colored icon + 2-line name/code, code in mono); money (`tabular`, sub-values `muted`); win-% bar (track `secondary`, fill `success`/`warning`/`destructive` by threshold); age chip (turns `warning-foreground`/`destructive` when aging/stale).
- **Footer:** totals row, `secondary/40%` bg, 1.5px top border, `tabular` values; count in `muted`.
- **Toolbar / Action bar:** `card` bg seamed to the table top (`… … 0 0`), 10–12px padding, holds `control` chips (32px, `input` border, `muted` icon, chevron), a `seg` segmented filter (`secondary` track, "on" = white pill + lift), a `search-mini`, and trailing icon controls. Selection mode swaps the default controls for a bulk-action cluster on a `primary/6%` wash with a count `pill`. Flat at rest (utility surface — no resting shadow).

### Kanban Card (signature)
- White `card`, **12px radius** (`{rounded.lg}`), ~11px padding, the `shadows.rest` resting lift (OD-P3-11 — the subtle elegance shadow; previously a faint `0 1px 2px`, now the named rest token). Hover → `0 4px 14px` lift + `muted-foreground/35%` border; active → `scale(.992)`; selected → `primary` border + `primary` ring + `primary/4%` fill; a drag grip fades in on hover. Holds a 26px colored icon, name (13px/600) + customer (`muted`), a 15px/600 tabular value, a win-% chip, and a foot row (border-top `border/70%`) with age + owner avatar + mini status pill. Columns sit in a horizontal-scroll grid of `minmax(290px, 1fr)` tracks on a `secondary/50%` column body with a sticky blurred header.

### Lifecycle / Stage Stepper (signature)
- A horizontal "journey" tracker: equal-flex steps each with a 6px rounded `jbar` (track = `secondary`), a label, and a date. `done` step → bar `success`, label `foreground`/600; `current` step → bar `primary`, label `foreground`/600. Used for budget version lifecycle and the deal stage journey in detail panels. The funnel/stage-summary band is the macro analog: 4 connected `card` segments with conversion-arrow chips between them; selected stage gets `primary/6%` + an inset `primary` bottom rule.

### Navigation
- **Rail (sidebar):** 224px (`--rail-w`), `card` bg, right `border`. Brand block (56px, matches header) with a 28px `primary` logo square. Grouped items under Overline group labels. **Nav item:** 36px tall, **8px control radius** (`{rounded.sm}` = `calc(var(--radius) - 4px)`; nav-items are controls, kept tight per OD-P3-10), 13.5px/500, 17px stroke-2 icon, optional trailing count badge. Hover → `accent`; active → `primary/10%` bg + `primary` text + 600 weight + `aria-current="page"`. Foot section (border-top) holds Settings.
- **Top bar (header):** 56px (`--header-h`), `background` bg, bottom `border`. Holds the mobile menu button, a breadcrumb (`muted` links → `foreground` on hover, `>` separators, bold `current`), a flexible spacer, the `cmdk` search button (`⌘K` chip), an icon button with a `destructive` notification dot, and a user chip (avatar gradient **navy→blue** (`brand-navy → primary`) + name/role, hidden on phone). *(OD-P3-7: gradient was blue→violet; violet moved to KPI/timeline only.)*
- **Mobile:** below 920px the rail collapses (`--rail-w: 0`) and a hamburger appears; `cmdk` shrinks to an icon; user name/role hide.
- **DataTable reflow (OD-W4-4):** the DataTable **single-renders** — at `md` (768 px) it renders the `<table>`; below `md` it renders a stacked card list instead. Exactly ONE branch is in the DOM at a time (chosen by `useIsDesktop()` reading `(min-width: 768px)` synchronously at first paint, so no flash of the wrong branch on mobile). These are two separate breakpoints — 920 px for the rail collapse, 768 px for the table→card reflow. Card anatomy: first column = title/activation button, remaining columns = `<dl>` label:value grid. The mobile cards take the 12px card radius + resting lift (OD-P3-10/11). Because only one branch renders, each cell appears once in the AT tree — **no `aria-hidden` on either branch** (the unrendered branch is simply absent). Touch targets on card affordances extend to ≥44 px via `.touch-target`.

### View-tab strip (OD-P3-6)
A horizontal tab strip above the toolbar selecting the workspace view (Table · Board · Calendar). 34px tall tabs, 13px/600, `0 12px` padding, 7px gap to a 15px icon. Inactive = `muted-foreground`; hover = `foreground`; **active = `brand-navy-text` + a 2px `brand-orange` bottom border** (the one orange sprinkle per screen). Disabled/"SOON" stubs = `hsl(240 4% 62%)` text + `not-allowed` cursor + a small `secondary`/`muted-foreground` "SOON" pill, `aria-disabled="true"`. `role="tablist"` / `role="tab"` / `aria-selected`; roving tabindex (only the active tab is `tabindex=0`). The strip is the "this is a database view, not a to-do list" signature. *Disabled stub AA note: ~3:1 contrast is acceptable for disabled controls (WCAG exempts them); state is communicated by the "SOON" pill + `aria-disabled`, not color alone.*

### Group header row (OD-P3-6)
Inside the grouped DataTable, each group is introduced by a full-width `<tr>` rendered as a clean **hairline-separated** row (38px): top + bottom 1px `border`, transparent bg — **no navy band, no left-edge swatch** (left stripes removed as distracting — owner). Contents: a caret (`▾`/`▸`, `muted-foreground`, `aria-expanded`), the group **label** (13px/700, `brand-navy-text`, the structural-navy use), a plain **count** (`muted-foreground`, `tabular-nums`), an **overdue subtotal** when >0 (`· N overdue`, `--status-lost-text`, click-to-filter button `aria-label="Filter to N overdue tasks"`), and a trailing **"+ Add task"** ghost affordance (`muted-foreground`, pre-fills the grouped dimension). The whole header toggles collapse on click/Enter/Space (`aria-expanded`). Groups are **always shown** (including empty ones) for layout stability. Flat at rest (utility row — no resting shadow).

### DB-view toolbar controls (OD-P3-6)
The Tasks toolbar uses **bordered** filter controls (the existing `control` chip: 32px, 1px `input` border, **8px control radius**, `muted-foreground` label + `foreground` value + chevron) — A's bordered chrome, not borderless text triggers. The **group-by control is the exception**: it is tinted to read as the active "database" control — `brand-navy/6` bg + 1px `brand-navy` border + `brand-navy-text` text + 600 weight (the structural-navy use). The Mine/RACI/All `seg` segmented control is unchanged (`secondary` track, white "on" pill + lift). **The segment is disabled when a Person filter is set** (Person overrides it): disabled `seg` = `opacity: 0.5`, `aria-disabled`, with the segment visually reading "Person: me."

### Tabs / Segmented Controls
- **Inline segmented (`seg`):** 32px track on `secondary`, buttons 28px, "on" = white `background` pill + `foreground` + 600 + `0 1px 2px` lift. `role="tablist"`/`role="tab"`/`aria-selected`. Used for stage filters.
- **Large segmented (layout switcher):** 40px sticky bar (`abc-seg`), 34px buttons with a letter chip; "on" → white pill + lift, letter chip flips to `primary`. Sticky with a `backdrop-filter` blur over the `secondary/35%` page.

### Overlays
- **Popover menu (`#rowmenu`):** `popover` bg, `border`, **12px radius** (`{rounded.lg}` — overlays take the card radius, OD-P3-10), overlay shadow, 5px padding; 32px menu items, `accent` hover, `danger` items in `destructive`, hairline `menu-sep`.
- **Toast:** `popover` bg, `border` + 3px left accent stripe (`primary`, or `success` for ok), overlay shadow, 12px radius, bottom-right, slide-in.
- **Tooltip (`#tip`):** dark surface (`hsl(240 10% 8%)`), near-white text, **8px radius** (control-scale; tooltips are small chips, not card-scale overlays), `0 8px 24px / 0.4` shadow, max 280px; bold title with optional dot, `tabular` key/value rows.

## Do's and Don'ts

### Do:
- **Do** drive every interactive affordance with the one `primary` blue, and keep it under ~10% of any screen (The One Blue Rule). The optional primary-button sheen is the *same* blue — not a second action color.
- **Do** define structure with the single 1px `border` (`hsl(240 5.9% 90%)`) and surface-tone contrast (white `card` on `secondary/35%` main); cards/KPI/kanban *also* carry the one subtle `shadows.rest` resting lift (Soft-Elevation Rule) — border and rest-shadow are co-equal, never shadow-alone.
- **Do** apply `tabular-nums` to every figure — currency, %, counts, deltas, ages — in tables, KPIs, kanban, and funnels; **verify `tnum` actually aligns columns in DM Sans** and fall back to Inter-tabular for numeric cells only if it doesn't (The Tabular-Numbers Rule).
- **Do** show status as a 6px dot + a tinted pill (status hue ~10–18% bg, darkened text), and reserve solid fills for the `destructive` button only.
- **Do** keep controls at 32px ("h-8") with the **8px control radius** (`calc(var(--radius) - 4px)`) and table body rows roomy at 54px; cards/containers/overlays take the **12px card radius** (`var(--radius)`).
- **Do** set headings in **Plus Jakarta Sans** (600) and body/UI/table text in **DM Sans**; use SF Mono only for machine IDs/codes and the `⌘K` chip.
- **Do** expose the global `:focus-visible` ring (`2px solid {colors.ring}`, 2px offset) on every focusable element, and keep `role`/`aria-selected`/`aria-checked`/`aria-current` on tabs, checkboxes, and nav.
- **Do** reserve categorical violet and the status hues for non-interactive meaning (KPI tiles, avatars, timeline dots, data state) — never as action colors.
- **Do** keep gradients to the two ratified navy-tinted whispers only (primary-button sheen, home/digest surface wash) and verify AA across their full range (The Restrained-Gradient Rule).

### Don't:
- **Don't** ship the "AI SaaS marketing" aesthetic: no neon accents, no glassmorphism panels, no oversized hero type, no shadow-heavy floating-card soup, and **no purple/lavender gradients** (the ratified gradients are navy-tinted whispers, never purple — OD-P3-12).
- **Don't** stack multiple resting shadows or raise the resting alpha above ~0.06, and **don't** give a flat utility surface (toolbar, plain row, strip, input) a resting shadow — only cards/KPI/kanban get the one subtle rest lift (The Soft-Elevation Rule). A static card without a border is still wrong; it must have a border *and* the subtle rest shadow.
- **Don't** use `rgba(0,0,0,…)` at high opacity for shadows; shadow color is desaturated near-black (faintly navy-tinted at rest) at low alpha only.
- **Don't** introduce a second action color, a new typeface beyond the ratified Plus Jakarta Sans / DM Sans / SF Mono trio, a new hue in a gradient, or a new border color. The palette is one blue + neutrals + status + the navy/orange brand marks; the border is one value. *(Inter survives ONLY as a scoped tabular-figure fallback for numeric cells if DM Sans `tnum` fails — never as a proportional face.)*
- **Don't** use mono or proportional figures for money in tables — money is DM-Sans-`tabular` (or the scoped Inter-tabular fallback), IDs are mono.
- **Don't** color body text with a fully saturated status hue, fill a status pill solid, or put a gradient on any status element.
- **Don't** make interactive controls taller/shorter than 32px or invent radii outside the 4/8/10/12/999 scale, and don't let 32px controls take the 12px card radius (the OD-P3-10 taste guard keeps them at 8px).

---

## How to use these tokens (implementers)

The source ships these as **shadcn-vue HSL custom properties on `:root`**, consumed via `hsl(var(--token))` and `hsl(var(--token) / <alpha>)`. Preserve that pipeline in the React/Tailwind app:

1. **Define `:root` HSL triplets** (the bare `H S% L%` form, no `hsl()` wrapper) for every color token above, plus **`--radius: 0.75rem`** (OD-P3-10 — bumped from `0.5rem`), `--rail-w: 224px`, `--header-h: 56px`. The frontmatter lists colors pre-wrapped in `hsl()` for Stitch's hex-ish validator; the canonical runtime form is the bare triplet so alpha (`/ 0.1`) works. Include the Gordi brand tokens:
   ```css
   --brand-navy:      218 46% 22%;
   --brand-navy-text: 218 42% 26%;
   --brand-orange:    18 80% 48%;
   ```
   Add the **resting-shadow** and **gradient** tokens (OD-P3-11/12) as ready-to-use CSS custom properties (these are composite values, not bare triplets):
   ```css
   --shadow-rest:    0 1px 2px hsl(222 18% 12% / 0.05), 0 1px 3px hsl(222 18% 12% / 0.04);
   --gradient-primary-sheen: linear-gradient(180deg, hsl(221.2 83.2% 56%) 0%, hsl(221.2 83.2% 51%) 100%);
   --gradient-surface-wash:  linear-gradient(180deg, hsl(218 46% 22% / 0.035) 0%, hsl(218 46% 22% / 0) 220px);
   ```
2. **Fonts (OD-P3-9 — load Plus Jakarta Sans + DM Sans; Inter retired).** Load both families from Google Fonts before first paint — prefer a `<link>` in `index.html` (avoids the CSS `@import` render-blocking penalty), or a CSS `@import` at the very top of `index.css` if a build-time inline is preferred:
   ```html
   <!-- index.html <head> — preferred -->
   <link rel="preconnect" href="https://fonts.googleapis.com">
   <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
   <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap" rel="stylesheet">
   ```
   ```css
   /* …or, if using @import, it MUST be the first statement in index.css */
   @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
   ```
   Then set the families as vars and bind them: display/headings → Plus Jakarta Sans, body/UI/table → DM Sans, mono → SF Mono (unchanged).
   ```css
   :root {
     --font-sans:    "DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif;          /* body / UI / table */
     --font-display: "Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", sans-serif; /* page-title / heading / subheading */
     --font-mono:    "SF Mono", ui-monospace, "JetBrains Mono", Menlo, monospace;
   }
   body { font-family: var(--font-sans); }
   .page-head h1, h1, h2, h3, .heading, .subheading { font-family: var(--font-display); }
   ```
   Remove every `Inter` reference from the app's font stack (the only sanctioned residual is the scoped numeric fallback in note 7, and only if tnum verification fails).
3. **Map Tailwind theme** to the vars. This app is **Tailwind v4**, so map them in a CSS `@theme inline` block where each `--color-*` value is a **resolvable** color — `@theme inline { --color-background: hsl(var(--background)); --color-primary: hsl(var(--primary)); --color-primary-foreground: hsl(var(--primary-foreground)); … }`. **Radius scale (OD-P3-10):**
   ```css
   @theme inline {
     --radius-lg: var(--radius);                 /* 12px — cards / containers / overlays */
     --radius-md: calc(var(--radius) - 2px);     /* 10px — mid nesting */
     --radius-sm: calc(var(--radius) - 4px);     /* 8px  — CONTROLS (buttons/inputs/nav-items/badges) */
     --radius-xs: calc(var(--radius) - 8px);     /* 4px  — checkbox / tiny inner corners */
   }
   ```
   Bind the new font + shadow + gradient tokens into the theme too:
   ```css
   @theme inline {
     --font-sans:    var(--font-sans);
     --font-display: var(--font-display);
     --font-mono:    var(--font-mono);
     --shadow-rest:  var(--shadow-rest);   /* utility: shadow-rest on cards/KPI/kanban */
   }
   ```
   **Do NOT append the v3 `/ <alpha-value>` placeholder** — v4 does not substitute it, so it emits invalid CSS the browser discards and every token utility silently renders nothing. The bare-triplet `:root` form (point 1) is what makes this work: v4 generates the `/<alpha>` modifier (`bg-primary/10`, `border-border/70`) automatically via `color-mix()` from the bare color. Add `warning`/`warning-foreground`, `success`/`success-foreground`, and the categorical `violet` — these are RIS additions beyond stock shadcn. Also add the brand tokens:
   ```css
   --color-brand-navy:      hsl(var(--brand-navy));
   --color-brand-navy-text: hsl(var(--brand-navy-text));
   --color-brand-orange:    hsl(var(--brand-orange));
   ```
4. **Alpha tints** (`primary/10%`, `success/12%`, `border/70%`, `brand-navy/6`, etc.) come straight from the slash-alpha syntax — keep them; they are load-bearing for the tinted-status and hover-wash patterns.
5. **Resting shadow (OD-P3-11).** Apply `box-shadow: var(--shadow-rest)` (or the `shadow-rest` utility) to the card, KPI-tile, kanban-card, and mobile-reflow-card classes **in addition to** their existing 1px border. Do NOT add it to toolbars, plain table rows, group-header rows, strips, or inputs (those stay flat). Hover still deepens to the existing `state lift` / `kanban-hover` shadow.
6. **Gradients (OD-P3-12).** Primary-button sheen: optionally set `background-image: var(--gradient-primary-sheen)` on `.btn-primary` (keep the solid `primary` `background-color` underneath as fallback + as the hover flatten target). Surface wash: apply `var(--gradient-surface-wash)` as a `background-image` on the **home/digest page container only** (My Week), e.g. on the `PageFrame variant="prose"` home surface — never on list/detail surfaces, never on cards, never on status elements.
7. **Numbers + tnum verification (OD-P3-9 — REQUIRED step).** Add a `tabular`/`tnum` utility (`font-variant-numeric: tabular-nums; font-feature-settings: "tnum"`) and apply it to every metric. **Then verify on the live Tasks table:** render a column of varying-width currency/percent/count values and confirm the digits column-align (no jitter) in **DM Sans**. If they do, done. **If DM Sans `tnum` is weak/absent,** scope a numeric fallback — `.tnum, .num, td.num { font-family: "Inter", var(--font-sans); font-variant-numeric: tabular-nums; font-feature-settings: "tnum"; }` — applying Inter-tabular to numeric table cells / KPI values ONLY (load Inter `wght@400;500;600` in that case). Proportional body/UI text stays DM Sans regardless. Record the outcome (DM Sans tnum OK, or Inter-fallback engaged) in the build PR.
8. **Focus:** keep the global `*:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 2px }` rather than per-component focus styles.
9. **Charts (recharts):** theme series/axes/grid from these tokens — axis/grid in `border`/`muted-foreground`, primary series in `primary`, status series in success/warning/destructive, categorical in violet. (No chart tokens existed in the mockups; derive from the palette, do not invent new chart colors.)

---

## Accessibility posture

- **Contrast:** `foreground` on `background`/`card` is ~AAA. `muted-foreground` (`46.1%` L) on white clears AA for body/secondary text. Status pills use **darkened text variants** (e.g. won text `hsl(142 64% 30%)`, lost `hsl(0 72% 45%)`, amber's deep-brown `warning-foreground`) specifically to clear AA on their light tinted backgrounds — preserve those darker text values; do not substitute the base status hue as pill text. **Gradient surfaces (OD-P3-12):** AA verified at the worst-case stop — primary-button `primary-foreground` over the darkest sheen stop (`51% L`), and `foreground`/`muted-foreground` over the top-most `3.5%`-navy band of the surface wash. Re-check if a gradient stop changes.
- **Focus:** single source of truth — global `:focus-visible` = `2px solid {colors.ring}` (the primary blue) at 2px offset. Every focusable element inherits it.
- **Semantics in source:** `aria-current="page"` on active nav, `role="tablist"/"tab"/"aria-selected"` on segmented filters and the layout switcher, `role="checkbox"/"aria-checked"/tabindex` on custom checkboxes, `aria-label` on icon-only buttons and section landmarks (`aria-label="Pipeline summary"`). Keep these; they are part of the system.
- **Keyboard:** tab order follows DOM (rail → header → main); custom checkboxes are `tabindex="0"`. Overlays (popover/toast/tooltip) are non-focus-trapping in the mockup — real implementations must add focus management and `Esc`-to-close (a build-time gap, not a token gap).

---

## MOS density mode (owner-ratified 2026-06-10 — OD-P0-7)

Gordi MOS **diverges from PMO's dense-console composition** on primary/home surfaces. This is a
composition rule only — every hue, type token, radius, and rule above is unchanged. Calibrated over
two Phase-0 redline rounds (IA-1..5 "too dense" → IA-6/7 "too sparse" → IA-8 adopted, OD-P0-6).
Reference rendering: `docs/design-mockups/proposal-IA-8-balanced-myweek.html`.

### Home / digest surfaces (My Week and any future at-a-glance view)
- **Single content column ~1080px** (1040–1120) with generous header air; no side asides, no second
  card column. *(OD-P3-12: this surface may carry the faint `gradient-surface-wash` navy top-wash.)*
- **One dominant module** per surface: a grouped table — 4 columns max, **44–48px rows**, 8–10 rows
  visible, group headers as muted overline text + count (never colored bars).
- **≤2 auxiliary strips** (56–64px, one CTA/link each) for secondary concerns; everything else is a
  link to its full surface, not a rendered module. **One ratified exception (OD-P0-8):** users with
  direct reports get a third, role-conditional compact team module (filed-status + overdue count per
  person) after the strips.
- **Progressive disclosure:** RACI renders as the R-person avatar + muted "+N" on rows; full
  R/A/C/I chips live on detail surfaces only. No mono IDs, no double badges, no nav badge-counts,
  no caption paragraphs on home.
- **Due dates:** colored only when overdue (destructive) or ≤3 days (warning text); otherwise muted.

### RACI role chips (added 2026-06-11, OD-P2 — reuse existing hues, no new brand)
RACI ownership renders as small role chips, all from the existing palette:
- `--raci-responsible` = `primary` (blue) — R, the doer; mirrors the list R-avatar tint.
- `--raci-accountable` = `violet` — A, the single owner (categorical use of violet, allowed).
- `--raci-consulted` / `--raci-informed` = `muted-foreground` on `secondary` — C and I, quiet.
Chip = ≤16px role glyph + person name on a tinted pill (10–12% bg + darkened text, the standard
tinted-status pattern). On list rows only the R person shows (avatar + "+N"); the full R/A/C/I set
appears on the task detail surface. The R chip's small categorical use of the brand blue is within
The One Blue Rule budget (it is never an action).

### Progress-marker pills (added 2026-06-12, OD-P2-10 — reuse existing hues, no new brand)
Weekly-update **update lines** carry a progress marker — distinct from a task's Status (self-reported
achievement cue, not the task's real state). Three values, all from the existing palette via the
Tinted-Status pattern (10–14% tint + darkened AA text + dot):
- **In progress** = `primary/12%` bg + `--status-open-text` + `primary` dot.
- **Blocked** = `destructive/12%` bg + `--status-lost-text` + `destructive` dot.
- **Done** = `success/14%` bg + `--status-won-text` + `success` dot.
Note the vocabulary/semantics differ from the task `StatusPill` (which maps Open→amber over 4 values);
keep them as separate components. **Late** (a weekly update filed after the Friday 17:00 WIB due) is
shown in **warning/amber** (caution — filing is allowed, OD-P2-14), never destructive/red.

### Ops Log tokens (added 2026-06-12, OD-P2-15..19 — reuse existing hues, no new brand)
The Ops Log feed (`/ops`) renders log entries with:
- **Source badge** (the business unit): calm, NOT a per-unit rainbow — only the two ops-writing units
  tint, everything else neutral. Kitchen and Bar = `primary/10%` + `--status-open-text`; Roastery =
  `violet/12%` + `--status-violet-text`; all other units = neutral `badge-status` (`secondary` +
  `muted-foreground`).
- **Type** (production/receiving/qc/follow_up/other): quiet **muted-foreground label text**, not a
  filled chip (per the signed mockup).
- **Needs attention**: row treatment = `warning/7%` fill + a 2px `warning` left rule; the My Week
  ops-strip amber = `warning/18%` + `warning-foreground` + `warning` dot (the same warning/amber family
  as the late TimingChip — late/attention is amber, never destructive/red). The 2px left rule is the
  one deliberate, owner-approved exception to the anti-slop side-stripe ban: it is state-bearing,
  minimal, and always paired with the fill tint + text, never color-alone (WCAG 1.4.1).

### List / detail surfaces (Tasks, Updates, Ops full pages)
PMO's data-dense DataTable posture stays: sortable columns, functional filters, loading/empty/error
states. Density mode governs *home*, not the working lists ("Executive vs Data-Dense split" —
at-a-glance up top, dense where the work happens).

### Field-error tokens (RATIFIED 2026-06-15, OD-P3-5 — reuse existing hues, no new brand)
Cross-reference to §5 Inputs. The create-task form's inline-validate-on-blur uses two named tokens,
both reusing existing palette values:
- `--field-error-border` = `destructive` — the invalid field's 1px outline.
- `--field-error-text` = `--status-lost-text` (`0 72% 45%`) — the helper/error text below the field
  (AA-darkened red; base `destructive` would fail AA as small text on white).
This closes the long-standing §5 Inputs error-field gap; it is composition/state only, no new hue.

---

## Owner-ratified demo-aligned refresh (2026-06-18, OD-P3-9..12)

Four bounded divergences directed by the owner after a reference-demo comparison. They adjust texture,
not identity; everything in "KEEP UNCHANGED" below is untouched.

| OD ID | Change | Token(s) touched |
|---|---|---|
| **OD-P3-9** | Font pairing swap — **Plus Jakarta Sans** (display/headings, 600) + **DM Sans** (body/UI/table). **Inter RETIRED** as the primary family (survives only as a scoped tabular-figure fallback if DM Sans `tnum` fails). Title tracking relaxed (`-0.02em`/`-0.01em` → `-0.01em`/`normal`) because Jakarta tracks looser. | all `typography.*.fontFamily`; page-title/heading `letterSpacing` + `fontWeight`; §3 prose + Named Rules; `--font-sans`/`--font-display`; implementer notes 2 & 7 |
| **OD-P3-10** | `--radius` **0.5rem → 0.75rem (12px)** for cards/containers/overlays. **Controls stay tight at 8px** (`calc(var(--radius) - 4px)`) — taste guard against bubbly 32px controls. `rounded` scale recomputed (xs 4 / sm 8 / md 10 / lg 12 / full 999). | `--radius`; `rounded.*`; `card`/`kanban-card`/`input`/button/nav radii in components frontmatter; §5 per-component radius notes; `@theme inline` radius scale (note 3) |
| **OD-P3-11** | **Soft-Elevation Rule** amends the former Flat-By-Default Rule: ONE subtle resting shadow now permitted on cards/KPI/kanban (co-equal with the border), shadow-soup still banned. New `shadows.rest` token (faintly navy-tinted near-black, ≤0.06 total alpha). | new `shadows.rest`; `card`/`kanban-card` `shadow`; §4 rule rewrite; §6 Don'ts; implementer note 5 |
| **OD-P3-12** | **Restrained-Gradient Rule**: two navy-tinted gradients only — an optional primary-button sheen (same blue) and a faint home/digest surface wash. NEVER purple, never on status, AA verified across range. | new `gradients.primary-sheen` + `gradients.surface-wash`; §4b new section; One-Blue / Structural-Navy rules; §6 Do/Don't; implementer note 6 |

**KEEP UNCHANGED (owner: "keep the rest").** The One Blue Rule (blue stays the only action color;
accent hue is NOT changing to the demo's indigo-violet), the near-monochrome palette, the
Single-Border Rule, density (16px card padding, 32px controls, roomy table rows), no-emoji /
SVG-icons, the Tinted-Status pattern, all RACI / progress-marker / Ops Log tokens, and MOS density
mode. The four OD-P3-9..12 changes touch those sections only where a font/radius/elevation/gradient
change mechanically requires it (e.g. card frontmatter radius, KPI value weight 700→600).

### Open risk (OD-P3-9 tnum contingency)
`tabular-nums` correctness in **DM Sans** is the one unverified assumption. Both new families ship a
`tnum` feature, but figure quality varies by font build; the Tasks table is where misalignment would
show. The contingency is documented (implementer note 7): if DM Sans `tnum` doesn't column-align, the
build scopes **Inter-tabular for numeric table cells / KPI values only**, keeping the rest of the
identity on DM Sans. The owner should be told which path the build took (recorded in the build PR).
