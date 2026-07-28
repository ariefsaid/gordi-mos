---
name: Gordi MOS
version: alpha
description: The owner-approved "Quiet Control Surface" — calm, dense, data-first. Adopted from PMO (2026-06-10, OD-DIR-8) as MOS's identity authority; diverges only via owner-approved additions. ADR-0009 (2026-06-19) re-expressed the palette to Display-P3 + adopted the mos-design-kit token system + light/dark theme. Runtime tokens live in mos-app/src/index.css as color(display-p3 …); the oklch values below are the linter-compatible documentation form (same colors, OKLab space — a wide-gamut format the @google/design.md linter parses).
colors:
  # --- Surfaces / action (oklch = linter-parseable wide-gamut form; runtime is color(display-p3 …)) ---
  primary: "oklch(0.546 0.2153 262.8719)"        # The One Blue — action/ring
  background: "oklch(0.994 0.002 85.0)"           # warm white canvas (light theme)
  foreground: "oklch(0.145 0.004 30.0)"           # warm near-black primary text
  card: "oklch(0.994 0.002 85.0)"                 # elevated surface (== background in light)
  card-foreground: "oklch(0.145 0.004 30.0)"
  popover: "oklch(0.994 0.002 85.0)"
  popover-foreground: "oklch(0.145 0.004 30.0)"
  primary-foreground: "oklch(0.9848 0 89.8756)"   # near-white on solid blue
  # --- Quiet UI ---
  secondary: "oklch(0.976 0.002 38.0)"            # warm subtle panels
  secondary-foreground: "oklch(0.210 0.006 30.0)"
  muted: "oklch(0.976 0.002 38.0)"                # == secondary (shadcn convention)
  muted-foreground: "oklch(0.388 0.012 30.0)"     # darkened ~40% L so muted text clears AA on secondary fills
  accent: "oklch(0.976 0.002 38.0)"               # shadcn "accent" = quiet hover wash (NOT the blue)
  accent-foreground: "oklch(0.210 0.006 30.0)"
  # --- Status / semantic ---
  destructive: "oklch(0.6368 0.2078 25.3259)"     # errors, destructive button, "lost"
  destructive-foreground: "oklch(0.9848 0 89.8756)"
  warning: "oklch(0.8334 0.1641 83.8666)"         # amber — aging/overdue caution
  warning-foreground: "oklch(0.28 0.10 28.0)"    # deep brown — AA on amber tints
  success: "oklch(0.7205 0.192 149.4926)"         # green — "won"/positive
  success-foreground: "oklch(0.9848 0 89.8756)"
  # --- Lines / fields / focus ---
  border: "oklch(0.922 0.004 38.0)"              # Single-Border Rule: border == input
  input: "oklch(0.922 0.004 38.0)"
  ring: "oklch(0.546 0.2153 262.8719)"           # focus ring == The One Blue
  # --- Categorical accent (non-interactive) ---
  violet: "oklch(0.5424 0.2454 293.016)"         # KPI/timeline only — never action
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
  body-lg:
    # OD-REDESIGN-91 #6/B4 (2026-07-24): minted — the shipped ~65-use 15px family is a
    # deliberate rung (emphasized body: record titles, primary row text, lead copy).
    fontFamily: "DM Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "15px"
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
  overlay:      "0 10px 30px color-mix(in srgb, var(--brand-navy) 16%, transparent), 0 2px 6px color-mix(in srgb, var(--brand-navy) 8%, transparent)"  # navy-tinted (Step-1 reskin) — matches runtime --shadow-overlay
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
    # OD-REDESIGN-91 #30/E1 (2026-07-24): rounded-rect ratified — was {rounded.full}.
    rounded: "{rounded.sm}"
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
    height: "52px"
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

> ## Authority — read before trusting any value in this file
>
> Three artifacts describe this design system. They are **not** peers, and confusing them is the
> single easiest way for an agent to do the wrong thing here.
>
> | Artifact | Is the truth about | Drifts? |
> |---|---|---|
> | `mos-app/src/index.css` | **Token values** — every colour, size, radius, shadow the app actually renders | No. It *is* the running code. |
> | **This file** | **Design rules** — what to do and what never to do, stated so an agent can follow it while writing CSS | Its *values* can drift; its *rules* are the authority. |
> | `docs/decisions.md` | **Decisions** — who decided a rule, when, why, and what was rejected (`OD-*`) | No. It is the decision record. |
> | `.impeccable/design.json` | Machine-readable mirror for tooling | Generated. Never hand-edit. |
>
> **This file states rules; it does not host decisions.** A rule lives here because an agent needs
> it in hand at the moment it writes a component — sending them to another file for every rule means
> they won't look, and the design hook cannot read prose anyway. The *reasoning* behind a rule, the
> alternatives weighed, and the ratification belong in `docs/decisions.md`. So a rule here carries a
> bare `(OD-###)` citation, not a retelling. **If you want to know *why*, follow the citation.**
>
> **When a token value here disagrees with `index.css`, the code wins** — the oklch values below are
> a documentation mirror (the runtime is `color(display-p3 …)`), kept for linter compatibility.
> **When a *rule* here disagrees with the code, this file wins** — code that violates a named rule
> is a defect, not a new convention.
>
> Do not regenerate this file wholesale. Its rules are owner-ratified; a spec-shaped rewrite would
> silently drop the ones the canonical eight sections have no slot for. Extend it instead.
>
> *Known debt: several older rules still embed their full rationale inline (the Tabular-Numbers
> verification narrative is the worst offender). That prose belongs in `docs/decisions.md` behind a
> citation. Not yet migrated — do not add more of it.*
>
> **The One-Global-Utility Rule (extract, 2026-07-28).** A utility class meant to be app-wide
> (`.sr-only` and its kin) is defined in exactly ONE place — `index.css` or, if it doesn't already
> exist there, the platform library (this app's Tailwind import already ships a correct `.sr-only`).
> A component or page stylesheet defining its OWN copy of a global-sounding class is not a harmless
> local convenience: unlayered CSS from different files competing for the same selector resolves by
> **import order**, not intent, so "whichever chunk happened to load last" silently decides the
> app's accessibility behaviour. Found live 2026-07-28: four files (`tasks/TaskSurface.css`,
> `tasks/TasksWorkspace.css`, `pages/kitchen-plan-page.css`, `pages/kitchen-review-page.css`) each
> shipped their own `.sr-only`, which is why a skip link had to route around the cascade in React
> state (`shell/app-shell.tsx`) instead of trusting the class — see DD-12, `docs/v4-inheritance.md`.
> All four were deleted; Tailwind's own utility is the one definition now. The same failure mode
> applies to any class name, not just utilities — see the Buttons section's `.btn-ghost` note below
> for a case where it silently changed a *shared component's* rendered style, not just an a11y helper.

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

The personality is **calm, dense, and data-first.** The surface is white-on-near-white: a single blue carries every interactive affordance against a field of warm-cool greys, so the eye goes straight to numbers, status, and the one action that matters. Density is deliberate — controls are compact (32px tall), but table rows breathe (52px) so financial figures are scannable. This is an operator's tool for a contract- and project-based business: the owner reviews budgets, procurement, and pipeline on desktop and phone, and the design optimizes for trust in the data over decoration. It explicitly rejects the "AI SaaS marketing" aesthetic: no neon, no glassmorphism panels, no oversized hero type, no shadow-heavy "floating card" soup, no purple gradients.

**Owner-ratified demo-aligned refresh (2026-06-18, OD-P3-9..12).** After comparing the app to a reference demo, the owner directed four bounded divergences that adjust the system's *texture* without changing its *identity*: a new font pairing (Plus Jakarta Sans + DM Sans, with Inter retained only for the verified numeric tabular scope), a slightly larger card radius (12px), a single subtle *resting* shadow on cards (a measured relaxation of the old flat-by-default stance), and two restrained navy gradients. The One Blue Rule, the near-monochrome palette, the Single-Border Rule, density, the Tinted-Status pattern, current status and Signal semantics, Task PIC/Supervisor grammar, governance role-chip semantics, and MOS density mode are **unchanged** — these are the load-bearing identity, and the refresh leaves them intact.

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
- **Background** (warm near-white canvas from the E7/runtime token foundation): App background and header. The main scroll area uses a quiet secondary wash to lift cards off the page without introducing a second visual identity.
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

**The Single-Border Rule.** `border` and `input` are the same value on purpose. Never introduce a second border color to "separate" regions; use the `secondary`/`card` surface contrast or spacing instead. *(Restored in Step-1 styling pass OD-P3-13 — previously split for control visibility.)*

**The Structural-Navy Rule (OD-P3-7).** `brand-navy` carries *structural* weight the lone action-blue must not: the logo square + dot, the active nav indicator (inset-shadow rail marker), the group-by control, the drawer's active-tab underline, the avatar gradient (`navy → primary`), and the navy tint behind the OD-P3-12 gradients. It is **never** an action color (no buttons, no links) and **never** a status. The One-Blue Rule is preserved — `primary` blue remains the *only* interactive/action color.

**The Orange-Sprinkle Rule (OD-P3-7).** `brand-orange` is a brand sprinkle used **sparingly** (≤2 marks per screen): the logo dot and the **active view-tab underline marker**. It is kept **OFF all status semantics** (it sits hue-wise between the red/amber status hues and would be misread as a warning) and **OFF all actions**. Never a status, never a link, never a button.

**Deputy launcher and phone Action Launcher (RATIFIED 2026-07-07, owner-agreed — UI-coherence audit D8/E10; supersedes ADR-0019 D11's orange Deputy FAB).** Deputy is never a FAB; it uses the shared top-bar/host door on every viewport: a neutral 32px deputy spark button in the header right-cluster beside search/bell, with `muted-foreground` → `foreground` on hover. The only sanctioned phone Action Launcher FAB is the universal capability-filtered `+ Action Launcher`; it may expose at most one high-frequency contextual module action permitted by current law, never orange decorative chrome, never Capture, and never a second launcher. ~~Desktop/tablet use the shared top-bar `+ Create` door.~~ **STALE — superseded by OD-REDESIGN-91 #16
(owner-initiated): "The top-bar Create button is REMOVED app-wide."** Decisions outrank this file, so
the code is correct and this clause was the defect. Desktop/tablet creation goes through the ⌘K
palette (OD-REDESIGN-57(i): universal actions live in ⌘K, not as header buttons). One launcher
location app-wide (one app, not "several apps").

## Typography

**Display / Heading Font (OD-P3-9):** Plus Jakarta Sans (with `system-ui, -apple-system, "Segoe UI", sans-serif` fallback) — page titles, section/card headings, subheadings.
**Body / UI / Table Font (OD-P3-9):** DM Sans (same fallback stack) — body copy, controls, table cells, labels, overlines.
**Mono Font:** SF Mono (with `ui-monospace, "JetBrains Mono", Menlo, monospace`) — IDs, codes, and the `⌘K` glyph only. *(Unchanged.)*

**Touch-input step (v4).** `--font-size-touch-input: 16px` is the one size above the control step,
and it exists for a mechanical reason rather than a typographic one: mobile Safari zooms the viewport
when a focused input renders below 16px. Apply it ONLY to text/number inputs tapped on a coarse
pointer (the Café Log quantity field is the reference case). Never for display, body, or label text —
it is not a new headline size, and using it as one is drift.

**Character:** Two geometric-humanist sans share the work: Plus Jakarta Sans gives headings a touch more warmth and presence than Inter did, while DM Sans keeps body and table text quiet, legible, and tight at 14px. The voice stays neutral and engineered, never expressive. **Jakarta tracks looser than Inter** — so the title `letterSpacing` was relaxed from `-0.02em`/`-0.01em` to `-0.01em`/`normal` (over-tightening Jakarta makes counters collide). Base size is 14px with a 1.45 line-height; the app reads like a well-set spreadsheet, not a landing page. **`tabular-nums` (`font-variant-numeric: tabular-nums` + `font-feature-settings: "tnum"`) is mandatory on all money, percentages, counts, deltas, and metric values** so columns align and figures don't jitter on update — both Plus Jakarta Sans and DM Sans ship a `tnum` feature, but this MUST be verified on the live Tasks table (see The Tabular-Numbers Rule + the implementer tnum-verification step).

### Hierarchy
- **Page Title** (Plus Jakarta Sans, 600, 24px, lh 1.2, ls -0.01em): One per page, in `.page-head`. KPI values reuse ~23px/600 for the headline number. *(Weight dropped 700→600: the demo's Jakarta headings read at 600 with normal tracking; 700 + tight tracking looks heavy in this family.)*
- **Heading** (Plus Jakarta Sans, 600, 20px, lh 1.25, ls normal): Section/card titles, kanban column titles (~13.5px/600 in compact contexts).
- **Subheading** (Plus Jakarta Sans, 600, 18px, lh 1.3): Sub-section headers inside detail panels.
- **Body** (DM Sans, 400, 14px, lh 1.45): Default text. Controls and table cells run 13.5px; the base run is 14px.
- **Body Large** (DM Sans, 400–600 by role, 15px, lh 1.45): Emphasized body — record titles in rows, primary row text, lead copy on auth/empty surfaces. *(Minted OD-REDESIGN-91 #6/B4, 2026-07-24: the shipped ~65-use 15px family became a deliberate rung — `--font-size-body-lg`.)*
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
- **Surface wash** (`gradients.surface-wash`): A very faint navy-tinted top-wash for **Home / digest surfaces only**. It fades from `brand-navy` at 3.5% alpha to fully transparent within 220px.

**The Restrained-Gradient Rule (OD-P3-12).** Gradients are permitted in **exactly two places**: the optional primary-button sheen and the home/digest surface wash. Hard bounds: **(1)** never on status; **(2)** never introduces a new hue — only the `primary` blue (sheen) or `brand-navy` (wash) families, **never purple/indigo/violet**; **(3)** opacity ceiling — the surface wash tops out at **3.5% alpha** and fully fades to transparent; the button sheen stays within **±3% L** of base `primary`; **(4)** AA text contrast must hold across the **full** gradient range, verified at the worst-case stop. No glassmorphism, no neon, no multi-stop rainbows — these are *whispers* of depth.

## Shapes

Radii follow the `xs/sm/md/lg/full` scale (4/8/10/12/999px). **Controls stay tight at 8px** (`rounded.sm`) — buttons, inputs, nav-items, badges — so 32px controls don't go bubbly. **Cards / containers / overlays take the 12px card radius** (`rounded.lg`, OD-P3-10). Checkbox / tiny inner corners use 4px (`rounded.xs`). **Status pills are rounded-rects at the 8px control radius** (`rounded.sm` — ratified OD-REDESIGN-91 #30/E1; the former 999px capsule spec is retired for the status-pill shell). `full` (999px) remains for genuinely circular/capsule marks: leading dots, count badges, the basis chip. Nested radii compose so inner corners sit inside outer ones.

## Components

All interactive controls are **32px tall** ("h-8") with **8px control radius** (`{rounded.sm}` = `calc(var(--radius) - 4px)`) unless noted; **cards/containers/overlays use the 12px card radius** (`{rounded.lg}` = `var(--radius)`). E7 table rows are 52px. Nested radii use `calc(var(--radius) - 2px/4px)` so inner corners sit inside outer ones. *(OD-P3-10 taste guard: the radius bump to 12px applies to the big surfaces only — 32px controls stay tight at 8px so buttons/inputs/badges/nav-items don't go bubbly.)*

### Buttons
- **Shape:** 8px radius (`{rounded.sm}`, the control radius — unchanged in absolute px by OD-P3-10, now expressed as `calc(var(--radius) - 4px)`), 32px tall, `0 12px` padding, 7px gap to a 15px icon. Small variant (`btn-sm`): 28px tall, 13px text. Icon-only: 32px square.
- **Primary:** `primary` bg, `primary-foreground` text, faint brand shadow at rest. **Optionally** the `gradients.primary-sheen` navy-tinted sheen fill (OD-P3-12) — same blue, AA-safe across its range. Hover → `primary` at 90% (`hsl(var(--primary) / 0.9)`); the sheen, if used, flattens to the solid hover blue.
- **Outline:** `background` fill, `input` border, `foreground` text. Hover → `accent` wash.
- **Ghost:** transparent, `foreground` text. Hover → `accent` wash. Used for icon buttons in the header.
- **Destructive:** `destructive` bg, `destructive-foreground` text. Hover → 90%. The only solid status fill in the system; reserved for irreversible actions (Mark lost, Delete). No gradient (Restrained-Gradient Rule bans gradients on status).
- **Focus:** global `:focus-visible` ring — `outline: 2px solid {colors.ring}; outline-offset: 2px`.
- **Disabled (gap — not yet ratified):** not defined in source; proposed `opacity: 0.5; cursor: not-allowed; pointer-events: none`.
- **One hierarchy, enforced.** `.btn .btn-{variant}` (`ui/Button.css`, applied via `<Button variant=…>`) is the ONE button implementation — never a per-surface class of the same name. A same-named standalone class elsewhere in the cascade is not a harmless synonym: extract (2026-07-28) found and removed a dead `.btn-ghost` in `tasks/TaskSurface.css` (a leftover from before Archive/Unarchive migrated to `<Button variant="ghost">`) that was live-shadowing the canonical variant app-wide — measured on Home: 15px/500 instead of the documented 13.5px/600, on a page that never renders a Task. Two identically-named classes always collide eventually; there is no such thing as a "locally scoped" global CSS class.

### Badges / Status Pills
- **Status pill:** 22px tall, **8px `rounded.sm` radius (rounded-rect — ratified OD-REDESIGN-91 #30/E1)**, 12px/600 label, with a leading 6px colored `dot` (the dot itself stays circular, `rounded.full`). Background = status hue at ~10–18%, text = a darkened variant of the hue for AA contrast (applied via the named CSS token — see below). Variants observed: `open` (blue), `won` (green), `lost` (red), `overdue` (amber). Default/neutral badge uses `secondary` bg + `muted-foreground` text. No gradient (status).
- **Count badge** (nav rail / kanban): `secondary` bg + `muted-foreground` text, full radius; active nav item flips to `primary/15%` bg + `primary` text. Kanban column count adds a 1px border on `background`.
- **Basis chip** (RATIFIED 2026-07-07, OD-DASH — the `/money` KPI "interim/basis" label): a neutral explanatory chip that names the data basis under a number (e.g. "interim-stock-movement"). 20px tall, `rounded.full`, **no dot** (it is metadata, not status), `secondary` bg + `muted-foreground` text, 11px/600 label. It reuses the default/neutral badge pair verbatim — `--basis-chip` is **not a new token**; it is the *role name* for "neutral badge used as a basis label" (the same `secondary`/`muted-foreground` values as the count badge). Distinct from a status pill on two counts: (1) no dot, (2) neutral-only — a basis is never good/bad, it is a provenance note.
- **Data-quality (DQ) badge** (RATIFIED 2026-07-07, OD-DASH — `/money` BOM-coverage signal "good/partial/unknown"): a status pill **reusing the existing Tinted-Status hues — no new token**. The DQ state maps onto the established status families via the dot+text convention:
  - `good` → `success` family (dot `success`, text `success-foreground` over a `success/14%` tint).
  - `partial` → `warning` family (dot `warning`, text `warning-foreground` over a `warning/18%` tint). "Partial" is a *caveat*, not an error — `warning` (amber), never `destructive` (red).
  - `unknown` → neutral (dot `muted-foreground/40%`, text `muted-foreground` over `secondary`). Reads as "no signal," not "bad."
  - The label is always the literal "BOM coverage: \<state\>" so the dot is never the sole carrier (WCAG 1.4.1). Same 22px / rounded-rect (`rounded.sm`) / 12px-600 shell as a status pill.

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
- **Select (RATIFIED 2026-07-07, `[NEW]` — closes the "11 raw `<select>`" divergence, UI-coherence audit D2/E3):** the one dropdown shell for a bounded choice. It **wraps a native `<select>`** — never a custom listbox — so keyboard, type-ahead, screen-reader semantics, and the phone-native picker come for free (ponytail: no JS menu to own). The native element is visually reset (`appearance: none`, no default arrow) and the shell supplies token chrome identical to a field: `background` fill, 1px `input` border, **8px control radius** (`{rounded.sm}`), **32px tall**, `0 28px 0 10px` padding (right room for the glyph), `foreground` value text, `:focus-visible` ring (`2px {colors.ring}`, 2px offset), flat at rest (utility surface — no shadow). A **14px chevron-down** glyph (`muted-foreground`, `aria-hidden`) sits absolutely at `right: 8px`, `pointer-events: none`. Placeholder/unset option = `muted-foreground`. Disabled = `secondary` bg + `muted-foreground` text + `not-allowed` cursor (this is also the ratification of the disabled-field styling proposed below, scoped to Select). Exposed via the native `<select>` — pass `aria-label` (or a visible `<label>`); no extra ARIA. Lives at `mos-app/src/components/ui/select.tsx`; **all bounded-choice dropdowns import it — no raw `<select>` in `src/pages` or `src/components`** (grep guard).
- **Error (field validation — RATIFIED 2026-06-15, OD-P3-5):** the documented gap is now closed with two named tokens, both reusing existing palette values (no new hue):
  - `--field-error-border` = `destructive` — the field's 1px `input` border swaps to `destructive` while the field is invalid.
  - `--field-error-text` = `--status-lost-text` (`0 72% 45%`, the AA-darkened red) — for the helper/error line below the field. **Not** base `destructive`, which fails AA (~3.6:1) as small text on white; the darkened red clears AA (≥4.5:1), mirroring the Tinted-Status pattern (saturated hue for the marker/outline, darkened variant for the text).
  - Applied on inline-validate-on-blur in the create-task form (OD-P3-4). Base `destructive` stays the field *outline*; the error *text* is always `--status-lost-text`.
- **Disabled (gap — not yet ratified):** no disabled-field styling in source; proposed `secondary` bg + `muted-foreground` text + `not-allowed` cursor. Not yet ratified (no owner-driven disabled-field need yet); the error pair above is the only §5 Inputs item ratified so far.

### Data Table (signature)
- **Header cells:** sticky, `card` bg, 38px tall, Overline type (11.5px/600 uppercase, 0.03em, `muted-foreground`, DM Sans), bottom `border`. Sortable headers gain `foreground` on hover with a 12px sort glyph. Numeric columns right-align; selection/center columns center.
- **Body cells:** 52px tall ("roomy rows — breathe"), 12px padding, divider = `border/70%`. Row hover → `accent/60%`; selected → `primary/7%`; expanded → `accent/50%`. Row `⋯` menu button is hidden until row hover. No per-row resting shadow (the table is one card; the Soft-Elevation rest sits on the card, not each row).
- **Dense DB-view variant (OD-P3-6).** The full-bleed Tasks DB-view keeps the E7 52px row grammar, paired with horizontal hairline dividers (`border/70%`) and **no vertical column rules** (vertical "stripes" hurt scan-readability — owner). Any current source that uses a 50px row is inventory evidence to migrate, not a second V3 row token.
- **In-cell patterns:** project cell (28px colored icon + 2-line name/code, code in mono); money (`tabular`, sub-values `muted`); win-% bar (track `secondary`, fill `success`/`warning`/`destructive` by threshold); age chip (turns `warning-foreground`/`destructive` when aging/stale).
- **Footer:** totals row, `secondary/40%` bg, 1.5px top border, `tabular` values; count in `muted`.
- **Toolbar / Action bar:** `card` bg seamed to the table top (`… … 0 0`), 10–12px padding, holds `control` chips (32px, `input` border, `muted` icon, chevron), a `seg` segmented filter (`secondary` track, "on" = white pill + lift), a `search-mini`, and trailing icon controls. Selection mode swaps the default controls for a bulk-action cluster on a `primary/6%` wash with a count `pill`. Flat at rest (utility surface — no resting shadow).

### Kanban Card (signature)
- White `card`, **12px radius** (`{rounded.lg}`), ~11px padding, the `shadows.rest` resting lift (OD-P3-11 — the subtle elegance shadow; previously a faint `0 1px 2px`, now the named rest token). Hover → `0 4px 14px` lift + `muted-foreground/35%` border; active → `scale(.992)`; selected → `primary` border + `primary` ring + `primary/4%` fill; a drag grip fades in on hover. Holds a 26px colored icon, name (13px/600) + customer (`muted`), a 15px/600 tabular value, a win-% chip, and a foot row (border-top `border/70%`) with age + owner avatar + mini status pill. Columns sit in a horizontal-scroll grid of `minmax(290px, 1fr)` tracks on a `secondary/50%` column body with a sticky blurred header.

### Lifecycle / Stage Stepper (signature)
- A horizontal "journey" tracker: equal-flex steps each with a 6px rounded `jbar` (track = `secondary`), a label, and a date. `done` step → bar `success`, label `foreground`/600; `current` step → bar `primary`, label `foreground`/600. Used for budget version lifecycle and the deal stage journey in detail panels. The funnel/stage-summary band is the macro analog: 4 connected `card` segments with conversion-arrow chips between them; selected stage gets `primary/6%` + an inset `primary` bottom rule.

### Navigation
- **Rail (sidebar):** 232px (`--rail-w`), `card` bg, right `border`. Brand block (56px, matches header) with a 28px `primary` logo square. Grouped items under Overline group labels. **Nav item:** 36px tall, **8px control radius** (`{rounded.sm}` = `calc(var(--radius) - 4px)`; nav-items are controls, kept tight per OD-P3-10), 13.5px/500, 17px stroke-2 icon, optional trailing count badge. Hover → `accent`; active → `primary/10%` bg + `primary` text + 600 weight + `aria-current="page"`. Foot section (border-top) holds Settings.
- **Top bar (header):** 56px (`--header-h`), `background` bg, bottom `border`. Holds the mobile menu button, a breadcrumb (`muted` links → `foreground` on hover, `>` separators, bold `current`), a flexible spacer, the `cmdk` search button (`⌘K` chip), an icon button with a `destructive` notification dot, and a user chip (avatar gradient **navy→blue** (`brand-navy → primary`) + name/role, hidden on phone). *(OD-P3-7: gradient was blue→violet; violet moved to KPI/timeline only.)*
- **Mobile:** below 920px the rail collapses (`--rail-w: 0`) and a hamburger appears; `cmdk` shrinks to an icon; user name/role hide.
- **DataTable reflow (OD-W4-4):** the DataTable **single-renders** — at `md` (768 px) it renders the `<table>`; below `md` it renders a stacked card list instead. Exactly ONE branch is in the DOM at a time (chosen by `useIsDesktop()` reading `(min-width: 768px)` synchronously at first paint, so no flash of the wrong branch on mobile). These are two separate breakpoints — 920 px for the rail collapse, 768 px for the table→card reflow. Card anatomy: first column = title/activation button, remaining columns = `<dl>` label:value grid. The mobile cards take the 12px card radius + resting lift (OD-P3-10/11). Because only one branch renders, each cell appears once in the AT tree — **no `aria-hidden` on either branch** (the unrendered branch is simply absent). Touch targets on card affordances extend to ≥44 px via `.touch-target`.

### View-tab strip (OD-P3-6)
A horizontal tab strip above the toolbar selects a **live presentation supported by the current domain**. A domain may expose Table, Board, Calendar, or another adapter only when that presentation is functional for the collection; unsupported future adapters are omitted, never rendered as dead tabs or decorative placeholders. Tabs remain 34px tall, 13px/600, `0 12px` padding, with a 7px gap to a 15px icon. Inactive = `muted-foreground`; hover = `foreground`; **active = `brand-navy-text` + a 2px `brand-orange` bottom border** (the one orange sprinkle per screen). `role="tablist"` / `role="tab"` / `aria-selected`; roving tabindex (only the active tab is `tabindex=0`). The strip is the "this is a database view, not a to-do list" signature; its visual grammar stays shared while its live tab set follows domain capability.

### Group header row (OD-P3-6)
Inside the grouped DataTable, each group is introduced by a full-width `<tr>` rendered as a clean **hairline-separated** row (38px): top + bottom 1px `border`, transparent bg — **no navy band, no left-edge swatch** (left stripes removed as distracting — owner). Contents: a caret (`▾`/`▸`, `muted-foreground`, `aria-expanded`), the group **label** (13px/700, `brand-navy-text`, the structural-navy use), a plain **count** (`muted-foreground`, `tabular-nums`), an **overdue subtotal** when >0 (`· N overdue`, `--status-lost-text`, click-to-filter button `aria-label="Filter to N overdue tasks"`), and a trailing **"+ Add task"** ghost affordance (`muted-foreground`, pre-fills the grouped dimension). The whole header toggles collapse on click/Enter/Space (`aria-expanded`). Groups are **always shown** (including empty ones) for layout stability. Flat at rest (utility row — no resting shadow).

### DB-view toolbar controls (OD-P3-6)
The Tasks toolbar uses **bordered** filter controls (the existing `control` chip: 32px, 1px `input` border, **8px control radius**, `muted-foreground` label + `foreground` value + chevron) — A's bordered chrome, not borderless text triggers. The **group-by control is the exception**: it is tinted to read as the active "database" control — `brand-navy/6` bg + 1px `brand-navy` border + `brand-navy-text` text + 600 weight (the structural-navy use). Saved views use **My work / Team work / Overdue**; explicit filters name **PIC / Supervisor / Team**. The saved-view segment stays available unless a more specific capability filter makes a view inapplicable, in which case the control explains that state rather than implying Task governance roles.

### Tabs / Segmented Controls
- **Inline segmented (`seg`):** 32px track on `secondary` (3px inset padding), options fill the track height (measures 26px, not the previously-stated 28px — corrected by live measurement, extract 2026-07-28), "on" = white `background` pill + `foreground` + 600 + `0 1px 2px` lift. Label size is the `mono` token's 13px *number* reused for sizing only — the face stays DM Sans (`font-family: inherit`), never the SF Mono typeface; this is an established v3 pattern (a token's numeric value borrowed for a non-typographic use), not a new exception.
  **Canonical implementation:** `src/styles/segmented-track.css`, shared via CSS `@import` by every consumer rather than re-authored per surface (extract, 2026-07-28 — found duplicated pixel-for-pixel in `dashboard/cut-toggle.css` and `home/home-order-toggle.css`). Two ARIA shapes render this ONE grammar: a `role="tablist"`/`"tab"`/`aria-selected` view-switcher (`CutToggle` — e.g. Money's Branch/Activity tabs, stage filters) with roving-tabindex arrow-key navigation, and a `role="radiogroup"`/`"radio"` persistent-setting form (`HomeOrderToggle` — the Home region-order preference, OD-REDESIGN-18, RI-1) using `.is-active` instead of `aria-selected` for its state class. The two ARIA contracts are genuinely different and stay two components; the visual grammar is one file. Lives in `src/styles/` rather than `src/components/ui/` because its inner-corner radius is the DESIGN.md-sanctioned `calc(var(--radius-sm) - 2px)` nested idiom (see §Shapes), and the `ui/` kit directory's own vocabulary guard (`kit-vocab.test.ts`) is stricter — exact whole radius tokens only, no `calc()` composition — a boundary this pattern would otherwise trip.
- **Large segmented (layout switcher):** 40px sticky bar (`abc-seg`), 34px buttons with a letter chip; "on" → white pill + lift, letter chip flips to `primary`. Sticky with a `backdrop-filter` blur over the `secondary/35%` page.

### Overlays
- **Temporary search/command:** centered, bounded by the viewport, with the `popover` surface, single border, 12px overlay radius, and overlay shadow. It closes with Escape and returns focus to its launcher.
- **Record panel:** the collection click target is a wide right-side panel on desktop (40–45% of the available content area), not a centered record popup. It retains the collection, uses the RecordViewer anatomy, and becomes full-screen on phone.
- **Menus, confirmations, and feedback:** menus/pickers stay anchored to their trigger; destructive confirmation is one centered blocking dialog; toasts are brief status feedback and never a second navigation surface. Every real overlay owns focus entry, Escape/close, and focus return.

### Metric summary rule (v4, 2026-07-27)
The band that states a surface's derived figures. **Not** a row of KPI tiles: one line, metrics
inline (`label` at label size in `muted-foreground`, value at body-lg/600 `tabular`), separated by
~22px, closed by a single 1px `border` hairline underneath. No card, no shadow, no radius, no width
branch — the same rule renders at every breakpoint. A delta renders **only** when it carries a state
worth acting on (`destructive` / `success`); neutral deltas and restating captions are omitted.

KPI **tiles** remain correct where the job is *reading* figures (dashboards, Money) and keep their
Soft-Elevation treatment there. Choose by the surface's job, not by habit.
*(Director decision, `docs/v4-inheritance.md` § v4 design rules — not yet owner-ratified.)*

### Compact capture row (v4, 2026-07-27)
The phone row for a long list the user must run down and act on each item (Café · Log). Identity
left (body-lg/600, wrapping), the control right where the thumb is, a unit label beside it, and a
muted meta line beneath that renders **only when it has something to say**. ~66px against the ~200px
of the generic record card. Supplied through `DataTable`'s `renderCard` seam so grouping, collapse,
empty and loading behaviour are inherited rather than reimplemented. Touch target ≥44px.
**Padding rhythm (`.dt-card--compact`, 10px 12px) lives in `dashboard/data-table.css`** beside the
`.dt-card` it modifies — `PhoneCard` (the same file's own component) is what applies the class
whenever a `renderCard` seam is supplied, and it now has four consumers (Café · Log/Plan/Pushes/
Review). It previously lived in `pages/kitchen-log-page.css`, a page-specific, route-code-split
stylesheet — live-measured on a fresh Café · Plan load with that chunk never fetched: 14px (the
un-compacted `.dt-card` fallback), not 10px 12px (extract, 2026-07-28). A class the shared primitive
applies belongs with that primitive, not with whichever page happened to author it first.

**The control is a typed field, not a stepper.** Amounts in this domain are 10–20+, so `−`/`+` meant
~20 taps per row. Use a right-aligned numeric input: `inputmode="decimal"`, `enterkeyhint="next"`,
**blank at rest with the expected value echoed as a greyed placeholder anchor**, and `font-size: 16px`
so mobile Safari does not zoom the viewport on focus. Reserve steppers for genuinely small counts
(0–5). *(Owner-corrected; the pattern is the one the live kitchen app already uses on this job.)*

**Validation that demands typing reveals on `blur`, never per keystroke.** A required note that
appears while the user is mid-number flags at the first digit and shoves a textarea into the row.
The *reading* of the divergence updates live — that is the feedback; the interruption waits.

**A status that is true of every row at rest is not feedback.** Render per-row state only once the
user has entered something to diverge from expectation.

*When to use it:* the surface's phone job is high-frequency capture across many rows. The default
`<dl>` card stays correct for **reading** a record, where labelled field/value pairs are the point.

### Row status as text (v4, 2026-07-27)
In a dense collection where a status applies to **every** row at rest, render it as toned text
(label size, 500) rather than a filled pill. Same tone semantics as the pill — the fill is what is
dropped. A column of filled pills on every row is colour that marks everything and therefore marks
nothing, and it out-shouts the actual controls. Pills remain correct where status is *exceptional*
or sparse.

## Do's and Don'ts

### Do:
- **Do** pick the metric treatment from the surface's job: the **summary rule** where the user came
  to *act*, KPI **tiles** where they came to *read*. (v4)
- **Do** drop a status pill's fill to toned text when the status is present on every row at rest,
  keeping the tone semantics unchanged. (v4)
- **Do** drive every interactive affordance with the one `primary` blue, and keep it under ~10% of any screen (The One Blue Rule). The optional primary-button sheen is the *same* blue — not a second action color.
- **Do** define structure with the single 1px `border` (`hsl(240 5.9% 90%)`) and surface-tone contrast (white `card` on `secondary/35%` main); cards/KPI/kanban *also* carry the one subtle `shadows.rest` resting lift (Soft-Elevation Rule) — border and rest-shadow are co-equal, never shadow-alone.
- **Do** apply `tabular-nums` to every figure — currency, %, counts, deltas, ages — in tables, KPIs, kanban, and funnels; **verify `tnum` actually aligns columns in DM Sans** and fall back to Inter-tabular for numeric cells only if it doesn't (The Tabular-Numbers Rule).
- **Do** show status as a 6px dot + a tinted pill (status hue ~10–18% bg, darkened text), and reserve solid fills for the `destructive` button only.
- **Do** keep controls at 32px ("h-8") with the **8px control radius** (`calc(var(--radius) - 4px)`) and table body rows roomy at 52px; cards/containers/overlays take the **12px card radius** (`var(--radius)`).
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
- **Don't** open a capture surface with a row of KPI tiles. Cards-as-page-structure and the
  big-number/small-label hero metric are the two most recognisable generic-dashboard tells, and on a
  phone they cost the entire first viewport. Use the summary rule. (v4)
- **Don't** repeat a value under a control that the row or card already renders as its own
  column/field. The `plan N` caption under each stepper duplicated the Plan column, cost ~40px per
  desktop row and ~180px per phone card, and pushed the list off the screen. (v4)
- **Don't** ship the generic `<dl>` record card on a surface whose phone job is running a long
  capture list — supply a compact row through `renderCard` instead. (v4)

---

## How to use these tokens (implementers)

The source ships these as **shadcn-vue HSL custom properties on `:root`**, consumed via `hsl(var(--token))` and `hsl(var(--token) / <alpha>)`. Preserve that pipeline in the React/Tailwind app:

1. **Define `:root` HSL triplets** (the bare `H S% L%` form, no `hsl()` wrapper) for every color token above, plus **`--radius: 0.75rem`** (OD-P3-10 — bumped from `0.5rem`), `--rail-w: 232px`, `--header-h: 56px`. The frontmatter lists colors pre-wrapped in `hsl()` for Stitch's hex-ish validator; the canonical runtime form is the bare triplet so alpha (`/ 0.1`) works. Include the Gordi brand tokens:
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
6. **Gradients (OD-P3-12).** Primary-button sheen: optionally set `background-image: var(--gradient-primary-sheen)` on `.btn-primary` (keep the solid `primary` `background-color` underneath as fallback + as the hover flatten target). Surface wash: apply `var(--gradient-surface-wash)` as a `background-image` on the **Home/digest page container only**, e.g. on the `PageFrame variant="prose"` Home surface — never on list/detail surfaces, never on cards, never on status elements.
7. **Numbers + tnum verification (OD-P3-9 — REQUIRED step).** Add a `tabular`/`tnum` utility (`font-variant-numeric: tabular-nums; font-feature-settings: "tnum"`) and apply it to every metric. **Then verify on the live Tasks table:** render a column of varying-width currency/percent/count values and confirm the digits column-align (no jitter) in **DM Sans**. If they do, done. **If DM Sans `tnum` is weak/absent,** scope a numeric fallback — `.tnum, .num, td.num { font-family: "Inter", var(--font-sans); font-variant-numeric: tabular-nums; font-feature-settings: "tnum"; }` — applying Inter-tabular to numeric table cells / KPI values ONLY (load Inter `wght@400;500;600` in that case). Proportional body/UI text stays DM Sans regardless. Record the outcome (DM Sans tnum OK, or Inter-fallback engaged) in the build PR.
8. **Focus:** keep the global `*:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 2px }` rather than per-component focus styles.
9. **Charts (recharts):** theme series/axes/grid from these tokens — axis/grid in `border`/`muted-foreground`, primary series in `primary`, status series in success/warning/destructive, categorical in violet. (No chart tokens existed in the mockups; derive from the palette, do not invent new chart colors.)

---

## Accessibility posture

- **Contrast:** `foreground` on `background`/`card` is ~AAA. `muted-foreground` (`46.1%` L) on white clears AA for body/secondary text. Status pills use **darkened text variants** (e.g. won text `hsl(142 64% 30%)`, lost `hsl(0 72% 45%)`, amber's deep-brown `warning-foreground`) specifically to clear AA on their light tinted backgrounds — preserve those darker text values; do not substitute the base status hue as pill text. **Gradient surfaces (OD-P3-12):** AA verified at the worst-case stop — primary-button `primary-foreground` over the darkest sheen stop (`51% L`), and `foreground`/`muted-foreground` over the top-most `3.5%`-navy band of the surface wash. Re-check if a gradient stop changes.
- **Focus:** single source of truth — global `:focus-visible` = `2px solid {colors.ring}` (the primary blue) at 2px offset. Every focusable element inherits it.
- **Semantics in source:** `aria-current="page"` on active nav, `role="tablist"/"tab"/"aria-selected"` on segmented filters and the layout switcher, `role="checkbox"/"aria-checked"/tabindex` on custom checkboxes, `aria-label` on icon-only buttons and section landmarks (`aria-label="Pipeline summary"`). Keep these; they are part of the system.
- **Keyboard and focus:** tab order follows the route's DOM order (rail → header → main); custom checkboxes are `tabindex="0"`. Real overlays move focus into their active surface, close the current layer on Escape, and return focus to the opener. Escape restores a saved inline field value rather than silently discarding the direct-edit contract. Browser Back closes the current panel/overlay before leaving the canonical route.

---

## MOS density mode (owner-ratified 2026-06-10 — OD-P0-7)

Gordi MOS **diverges from PMO's dense-console composition** on primary/home surfaces. This is a
composition rule only — every hue, type token, radius, and rule above is unchanged. Calibrated over
two Phase-0 redline rounds (IA-1..5 "too dense" → IA-6/7 "too sparse" → IA-8 adopted, OD-P0-6).
Reference rendering: `docs/design-mockups/proposal-IA-8-balanced-myweek.html`.

### Home / digest surfaces (current landing brief and any future at-a-glance view)
- **Single content column ~1080px** (1040–1120) with generous header air; no side asides, no second
  card column. *(OD-P3-12: this surface may carry the faint `gradient-surface-wash` navy top-wash.)*
- **One dominant module** per surface: a grouped table — 4 columns max, **44–48px rows**, 8–10 rows
  visible, group headers as muted overline text + count (never colored bars).
- **≤2 auxiliary strips** (56–64px, one CTA/link each) for secondary concerns; everything else is a
  link to its full surface, not a rendered module. **One ratified exception (OD-P0-8):** users with
  direct reports get a third, role-conditional compact team module (filed-status + overdue count per
  person) after the strips.
- **Progressive disclosure:** Task rows show the PIC and a compact Supervisor cue; full typed metadata
  lives on the focused record surface. No mono IDs, no double badges, no nav badge-counts, no caption
  paragraphs on Home.
- **Due dates:** colored only when overdue (destructive) or ≤3 days (warning text); otherwise muted.

### Governance role chips (Objective / Project / Process only — reuse existing hues, no new brand)
RACI ownership for Objective, Project, and Process governance renders as small role chips, all from the existing palette:
- `--raci-responsible` = `primary` (blue) — R, the doer; mirrors the list R-avatar tint.
- `--raci-accountable` = `violet` — A, the single owner (categorical use of violet, allowed).
- `--raci-consulted` / `--raci-informed` = `muted-foreground` on `secondary` — C and I, quiet.
Chip = ≤16px role glyph + person name on a tinted pill (10–12% bg + darkened text, the standard
tinted-status pattern). On governance list rows only the R person shows (avatar + "+N"); the full
role set appears on the corresponding governance detail surface. A Task never uses RACI role chips;
Task rows and details use PIC + Supervisor. The R chip's small categorical use of the brand blue is
within The One Blue Rule budget (it is never an action).

### Status and Signal semantics (current)
Task `StatusPill` represents the record's current state with the shared tinted-status rule. Signal
entries use source, type, and attention treatment from the same semantic palette; an attention or late
condition is warning/amber, never destructive/red. These are current data states, not a filing or
progress-marker component contract.

### Operations event tokens (added 2026-06-12, OD-P2-15..19 — reuse existing hues, no new brand)
The Signals archive (`/work/signals`) renders operational event entries with:
- **Source badge** (the business unit): calm, NOT a per-unit rainbow — only the two ops-writing units
  tint, everything else neutral. Café = `primary/10%` + `--status-open-text`; Roastery =
  `violet/12%` + `--status-violet-text`; all other units = neutral `badge-status` (`secondary` +
  `muted-foreground`).
- **Type** (production/receiving/qc/follow_up/other): quiet **muted-foreground label text**, not a
  filled chip (per the signed mockup).
- **Needs attention**: row treatment = `warning/7%` fill + a 2px `warning` left rule; the Home
  ops-strip amber = `warning/18%` + `warning-foreground` + `warning` dot (the same warning/amber family
  as the late TimingChip — late/attention is amber, never destructive/red). The 2px left rule is the
  one deliberate, owner-approved exception to the anti-slop side-stripe ban: it is state-bearing,
  minimal, and always paired with the fill tint + text, never color-alone (WCAG 1.4.1).

### List / detail surfaces (Tasks, Signals, and Café full pages)
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
| **OD-P3-13** | **Step-1 redesign styling pass**: warm neutrals, brighter action blue, navy-tinted shadows, AA status text — token values aligned to E7 reference. Restored Single-Border Rule (field border == divider). Fixed `--warning-foreground` bug (was red, now deep brown). | `--ds-background-*`, `--ds-font-color-*`, `--ds-border-color-*`, `--ds-color-blue*`, `--ds-color-green/red/amber/violet`, `--brand-navy`, `--brand-orange`, `--status-*-text`, `--warning-foreground`, `--shadow-overlay`, `--scrim`, `--shadow-popover`, `--shadow-drawer`, `--gradient-primary-sheen`, `--gradient-surface-wash`, `--radius-lg` |

**KEEP UNCHANGED (owner: "keep the rest").** The One Blue Rule (blue stays the only action color;
accent hue is NOT changing to the demo's indigo-violet), the near-monochrome palette, the
Single-Border Rule, density (16px card padding, 32px controls, roomy table rows), no-emoji /
SVG-icons, the Tinted-Status pattern, current StatusPill/Signal/Task/governance tokens, and MOS density
mode. Retired filing and legacy operations surfaces are not binding component guidance. The four OD-P3-9..12 changes touch those sections only where a font/radius/elevation/gradient
change mechanically requires it (e.g. card frontmatter radius, KPI value weight 700→600).

### Open risk (OD-P3-9 tnum contingency)
`tabular-nums` correctness in **DM Sans** is the one unverified assumption. Both new families ship a
`tnum` feature, but figure quality varies by font build; the Tasks table is where misalignment would
show. The contingency is documented (implementer note 7): if DM Sans `tnum` doesn't column-align, the
build scopes **Inter-tabular for numeric table cells / KPI values only**, keeping the rest of the
identity on DM Sans. The owner should be told which path the build took (recorded in the build PR).

---

## V3 design foundation (E7 visual foundation and V3 grammar)

This section is the binding V3 composition contract for the application. It resolves the old page-archetype language and records the owner-approved E7 visual foundation, shared record grammar, collection behavior, overlay behavior, focus behavior, navigation behavior, and responsive behavior.

**Authority boundary.** E7 owns composed visual styling. Owner decisions OD-REDESIGN-72 through OD-REDESIGN-79, the current domain vocabulary, the Experience Contract, and the Interaction Contract own IA and interaction behavior. The latest owner law wins over an older mockup or route name. The live route/component/style inventory is evidence of current debt, not permission to preserve a superseded surface.

### E7 visual foundation

The visual result is one calm MOS application, not a new visual identity per module:

| Role | Binding rule |
|---|---|
| Surface | Warm near-white canvas and card surfaces, warm near-black primary text, quiet warm-neutral secondary surfaces, and one single-border value. |
| Action | One Blue is the only saturated interactive color. Brand navy carries structural weight; brand orange is a restrained sprinkle of no more than two marks per screen and is never an action or status. |
| Status | Green, amber, red, and categorical violet are data semantics with tinted surfaces and AA-safe text; they are not alternate action colors. |
| Type | Plus Jakarta Sans is display/headings; DM Sans is body, UI, and proportional table text; Inter-tabular is permitted only for verified numeric alignment; SF Mono is for IDs, codes, and keyboard hints. |
| Geometry | Spacing uses 4/8/12/16/20/24/32/48px steps. Cards and overlays use 12px radius; controls use 8px radius; status pills are 8px rounded-rects (OD-REDESIGN-91 #30/E1); 999px is reserved for circular marks (dots, count badges, basis chip). |
| Density | Standard controls are 32px; phone targets are at least 44px; E7 table rows are 52px; the content measure is 1180px; the desktop rail is 232px and the header is 56px. |
| Depth | Borders and surface tone carry structure. One subtle navy-tinted resting shadow is allowed on cards/KPI/kanban only; overlays use the defined overlay shadow. No shadow soup. |
| Focus | Every focusable control exposes a visible `:focus-visible` ring using the One Blue ring token with a 2px offset. |
| Gradient | Only the ratified same-blue button sheen and faint navy home/digest wash are allowed. No purple, glass, neon, or decorative gradient family. |

Runtime implementation continues to use the existing `--ds-*`, `--brand-*`, and `--status-*` token seams in `mos-app/src/index.css`. `--e7-*` names belong to the static E7 reference files and are not application token names. Later migration work may replace a bad canonical primitive once, then migrate its consumers; it must not create a parallel visual family.

### V3 page families

V3 has exactly three page families: **Workspace**, **Focused record**, and **Management**.

- **Workspace** is the operator surface for scanning, querying, filtering, grouping, sorting, selecting, and acting on a collection or specialized module body. Current route examples include `/`, `/work/tasks`, `/work/signals`, `/events`, `/money`, `/inbox`, `/cafe`, `/ecommerce`, and `/roastery`.
- **Focused record** is one typed record presented in a panel or canonical page. Current route examples include `/work/tasks/new`, `/work/tasks/:taskId`, `/work/signals/:signalId`, and conditional `/work/follow-ups/:id`.
- **Management** is people, definitions, catalogs, profile, and administration. Current route examples include `/work/projects`, `/work/objectives`, `/admin/people`, and `/profile`.

Every application route targets one family. Public authentication, redirects, DEV harnesses, and the not-found route are routing infrastructure and are marked not-applicable in the inventory; they do not create a fourth page family.

**Shared frame target.** A page route uses one `PageFrame` owning one `<main>` landmark and one `PageHead` owning one `<h1>`. The head has one clear job sentence/context and one primary action where the task requires it. Specialized content may vary by domain, but shell geometry, type roles, spacing rhythm, and state treatment remain shared. Current source files that do not meet this target remain explicitly listed as conformance debt until Issue 3 migrates them after the Storybook proof in Issue 2.

### RecordViewer

RecordViewer is the shared presentation and editing contract over separate typed database models. It is a grammar, not a universal records table.

| RecordViewer region | Contract |
|---|---|
| Identity and type | Make the record name, type, status, and current context clear without exposing internal system nouns as the primary label. |
| Ordered metadata and relations | Render typed metadata and typed relation links in a stable order. Relation navigation stays in the same panel stack and exposes an internal Back control. |
| Content | Render authored sections/blocks through an allow-listed domain renderer. Structured authored content is the Issue 10 concern; do not invent a universal JSON renderer in Issue 1. |
| Activity/history | Show meaningful activity or history when the domain supports it, using the shared activity treatment rather than a page-local timeline identity. |
| Actions and permission | Show actions available to the current viewer. Unauthorized records are honestly read-only; do not show a disabled fake affordance as if editing were available. |
| Fields and feedback | Use the shared field display/edit treatment with direct-edit lifecycle feedback: Saving, Saved, validation, retry, and server error. |
| Modes and URL | The same anatomy works in panel mode and full-page mode. Direct URL, refresh, bookmark, explicit expand, and new-tab opening resolve to the canonical full-page mode. |
| Keyboard and Back | Focus enters the viewer, Escape closes the current overlay or restores a saved field, internal Back unwinds relation navigation, browser Back closes the panel before leaving the route, and focus returns to the opener. |

Task, Standard/SOP, Signal, Process, Project, Money, and People keep separate typed models and object-specific layouts. Shared UI is similar, not identical: the RecordViewer contract standardizes presentation jobs and behavior, not database shape or domain meaning.

### RecordCollection

RecordCollection owns collection state independently of the presentation adapter. It owns search, filter, sort, group, saved views, selection, pagination readiness, loading, error, empty, filtered-empty, URL/query state, and record opening. A page may present that state as a Feed, Table, Triage Queue, Board, Calendar, or Library, but the adapter does not own a second query grammar.

- **Feed** is a chronological or event-oriented adapter.
- **Table** is the dense scan/sort adapter.
- **Triage Queue** emphasizes urgency and next action.
- **Board** maps records to stages or lanes.
- **Calendar** maps records to time.
- **Library** maps records to browse/search.

Each adapter declares the capabilities it supports. Unsupported search/filter/sort/group/saved-view controls do not appear as decorative empty chrome. Collection clicks use the shared record-opening contract below.

### Navigation, canonical URLs, and overlay grammar

Navigation is organized by the operator's jobs, not by an org chart or implementation ownership. The primary rail presents the current destination groups (Home, Work, Events, Money, Inbox, Café, and role-appropriate management/configuration) with one active page destination. The mobile navigation preserves work before configuration and uses a coherent selector/disclosure for the rest. A route has one `aria-current="page"` destination; active styling, page title, and canonical URL must agree.

Canonical route state is part of the interaction grammar: collection query state belongs in the URL where it must survive refresh/share, a panel record is an in-context presentation of a canonical record destination, and a direct record URL always opens the full-page viewer. Legacy aliases redirect to current destinations and do not become new page families.

### Overlay, focus, and Back grammar

There is one overlay grammar by interaction job:

- **Search/command** is a centered temporary overlay, including the `⌘K` entry point. It is bounded by the viewport, keyboard reachable, dismissible with Escape, and returns focus to its launcher.
- **Record open from a collection** is a wide right panel on desktop, retaining the collection in view. It is a right-side panel sized to 40–45% of the available content area at desktop widths and is not a near-full centered record popup. The panel uses the same RecordViewer as the full page.
- **Panel navigation** uses one host and an internal stack. Relation clicks push a new record; internal Back pops the stack; Close exits the panel. Focus enters the new record and returns to the originating control when the panel closes.
- **Explicit full page** is always available from the viewer. A direct URL, refresh, bookmark, browser new tab, or explicit Open full page action is the canonical full-page destination, not an accidental re-opening of a panel.
- **Deputy** uses the same host and focus/close behavior as other non-blocking panels. Deputy is never a FAB; it uses the shared top-bar/host door. The sanctioned phone Action Launcher remains the one capability-filtered `+` FAB and is not a Deputy or Capture control.
- **Confirmation** is one centered blocking dialog for consequential actions. **Menus and pickers** are anchored to their trigger and remain keyboard navigable. **Toast/status feedback** reports completion or failure without becoming a second navigation surface.
- **Phone** turns the record panel into a full-screen record surface. Phone does not use a near-full centered record popup or a clipped desktop table.

The opening path is consistent across collections: click opens the panel; Open full page or a canonical record URL opens the page. Escape closes the current layer. Browser Back closes the current panel/overlay before leaving the canonical route. Focus entry and focus return are required behavior, not optional polish.

### Direct editing and feedback

Supported inline edits use the same direct-edit lifecycle:

- Click, Enter, or an equivalent control enters editing; Enter, Tab, or click-outside commits when the field contract supports it.
- **Escape restores the saved value** and exits editing. It does not submit a guessed value or leave a stale optimistic display behind.
- Saving, Saved, validation, retry, and server failure are visible near the edited field or record action. A failed save preserves the user's attempted value and offers a truthful retry path.
- Read-only permission is explicit in the record anatomy. Do not render edit affordances that cannot succeed, and do not use disabled controls to conceal why a viewer cannot edit.

### Responsive grammar

- **Desktop (≥1280px):** rail, header, page frame, collection, and 40–45% record panel fit without clipping. The content measure remains 1180px or less, and the panel preserves enough collection context to understand the opened record.
- **Intermediate (768–1279px):** the frame contracts, tool rails wrap or become a coherent selector stack, and the record panel remains usable without forcing horizontal page overflow.
- **Phone (390px and ≤767px):** work appears before configuration; selectors stack; collection rows/cards retain meaning; the record viewer is full-screen; bottom navigation remains task-oriented; every required tap target is at least 44×44px; no horizontal page overflow is allowed.
- **Very narrow devices:** at 390px and below, controls may wrap or stack but must not shrink below the tap-target contract. Avoid permanent horizontal scroll as a substitute for responsive layout.

Responsive behavior preserves meaning, not just pixels: a collection adapter may change from table to cards, but the record identity, status, actions, query state, and Back/Close path remain understandable and reachable.

### Component and state conformance matrix

| Page family | Default | Loading | Empty / filtered-empty | Error / retry | Permission / read-only | Saving / Saved / validation | Archived / retracted |
|---|---|---|---|---|---|---|---|
| Workspace | Shared PageFrame/PageHead plus the declared collection adapter | State-kit structure remains visible with SkeletonRows/LoadingShell | EmptyState explains the next action; filtered-empty names and clears the active query | ErrorState is an alert with Retry and preserves query state | Collection actions disclose the viewer's permission honestly | Inline edits expose lifecycle feedback without changing collection context | Retain the row/card truth and explain why it is no longer active |
| Focused record | RecordViewer identity, metadata, content, relations, activity, actions | Viewer anatomy remains visible while content loads | EmptyState is domain-specific and does not become a blank record shell | ErrorState explains failure and offers Retry | Read-only is a first-class viewer state | Saving/Saved/validation/retry appear beside the field/action | Archived/retracted status remains explicit with the canonical URL |
| Management | Shared frame/head around people, definitions, catalogs, profile, or admin list | Loading preserves frame and list structure | EmptyState has one truthful next action; filtered-empty preserves filters | ErrorState supports Retry without losing the management query | Unauthorized actions are omitted or explained as read-only | Direct-edit feedback is local and visible | Archive/retract is reversible where the domain permits it |

The state-kit components (`EmptyState`, `ErrorState`, `SkeletonRows`, and `LoadingShell`) are the default state primitives. A domain may add meaning, but it must preserve the shared geometry, type roles, focus behavior, and one clear next action.

### Anti-slop limits

Taste is an anti-slop checklist only. It yields to E7 identity, owner law, accessibility, and the existing React/CSS architecture. Do not introduce a new visual identity, generic font direction, Tailwind direction, or a new component family under the taste banner. Do not add oversized rounding, glass panels, neon, purple/lavender gradients, shadow soup, decorative metrics, emoji, fake records, perpetual animation, or decorative effects that compete with the operator's task. Do not turn the shared grammar into a universal database model, a card-soup dashboard, or a modal-first workflow.

### Issue 1 evidence boundary

The live inventory at `docs/reference/v3-live-inventory.md` records the current route/component/style seams, including existing bespoke heads/frames, route-local CSS, duplicate menus/dialogs/panels, and the current panel geometry. That evidence is intentionally not a claim that AC-V3-001 or final AC-V3-014 rendered acceptance has passed. Issue 1 changes documentation and source inspection only. Issue 2 is **Storybook component/state/responsive matrix proving the reconciled DESIGN.md contract** only; it cannot claim application migration or rendered representative acceptance. The approved sequence assigns Issue 3 to **Page-family primitives and migration guards**, Issue 4 to **Shared overlay/panel/navigation host**, Issue 5 to **RecordViewer contract, field primitives, and Task adapter**, Issue 6 to **RecordCollection/view engine and Tasks/Signals adapters**, Issue 7 to **Inbox triage plus Deputy host integration**, Issue 8 to **Café canonical-record integration and Team-context correction**, and Issue 9 to **Representative-slice rendered/driven owner gate; provisional IA ratification**. Issues 10–12 remain separately owned by the master spec.
