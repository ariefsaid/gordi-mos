# Plan — consolidated app build (2026-07-09)

> **HISTORICAL / DO NOT EXECUTE.** This plan predates OD-REDESIGN-11..55 and therefore omits Signals,
> Process adoption, scoped Role actors, the final Action Launcher, Admin/access configuration, and the
> current navigation/panel contract. Its file split also treats stale exploratory pages as a finished
> prototype. Preserve it as evidence; replace it with a new design plan only after the E7 JTBD map and
> decision-complete prototype brief are reconciled.

> **Build spec for the consolidated redesign prototype.** Implements ADR-0025 (D1–D6) +
> OD-REDESIGN-1..10. Read this fully before touching any file. The foundation (base.css, app.js,
> editor.js, icons.js) is PROVEN and UNCHANGED — you write HTML that consumes it.
>
> **Binding decisions (do not re-litigate; cite if questioned):**
> - **ADR-0025** (`docs/adr/0025-ia-modules-in-rail-redesign-direction.md`) — the direction.
> - **CONTEXT.md** — the vocabulary (Standard, Shift, PIC/Supervisor Task ownership, higher-level RACI).
> - **`docs/decisions.md` OD-REDESIGN-1..10** — the decision trail.
> - **`docs/reference/twenty-ixd-patterns.md`** — the IxD target.
> - **`docs/reference/pmo-deputy-gaps.md`** — the floor to exceed.

## File split (5 files, one per agent — parallel, no collision)

Each file is a **full standalone app shell** (topbar + rail + main + mobile-tabbar + contextual action +
persona menu + deputy panel + ⌘K popup + slide-over inspector) with its own screens. Cross-destination
links are real `<a href="other.html">` (full reload — acceptable for a mockup). Within a destination,
screen-swapping stays instant via app.js.

| File | Destination/Module | Owns |
|---|---|---|
| `home.html` | Home | mandatory role-aware attention brief (4 personas via `data-role-switch`+`data-role-pane`), authorization-preserving personal/deputy structured canvas (`.widget-grid`+`.widget-add-bar`), shift-aware floor pane, greeting, impersonation, font-size |
| `work.html` | Work | One collection/saved-view workspace: Tasks, Process Runs, Projects, Processes, Standards, Objectives, Signals, Follow-ups; shared index/inline-edit/inspector grammar; structured-canvas detail pages; no widget composer |
| `roastery.html` | Roastery module (B2B Ops) | log/plan/stock/review, roastery shifts, roastery Standards, the **Standard detail page with the full check-loop** (spec steps → checks → pass/fail → exceptions → audit), capture-check modal |
| `kitchen.html` | Kitchen+Bar module (Retail Ops) | log/plan/stock/review, **retail-overall shifts** (kitchen+bar), kitchen/bar Standards |
| `money.html` | Money | revenue/margin/AR/AP cockpit, money position, follow-up queue summary |

All files live in `docs/design-mockups/redesign-mockups-2026-07/` (alongside α/β/γ history).

## Foundation files to read FIRST (required — do NOT modify these)
1. `docs/design-mockups/redesign-mockups-2026-07/base.css` — ALL styling. Sections: APP SHELL, PRIMITIVES, INTERACTIVE LAYER, BIGGER TYPE (.hifi), IMPERSONATION, RESPONSIVE, EDITABLE ITEMS, BOARD/DATABASE β, NESTED/PAGE γ, PIC/SUPERVISOR, WIDGET COMPOSER, BLOCK EDITOR γ, SOP/QUALITY LOOP, Projects grid, Mobile tree drawer. Use these classes; add a `<style>` block ONLY for file-local layout.
2. `docs/design-mockups/redesign-mockups-2026-07/app.js` — SPA routing. READ THE TOP COMMENT. Conventions: `data-screen`, `data-go`, `data-modal`+`data-modal-trigger`, `data-drawer`+`data-drawer-trigger`, `data-role-switch`+`data-role-pane`, `data-form`, `data-user-pick`+`data-user-pick-trigger`, `data-fontsize-pick`, `data-sees` (permission via `hidden`), `data-close`, `data-chip`, `data-toast`, `data-task`.
3. `docs/design-mockups/redesign-mockups-2026-07/editor.js` — block editor + SOP quality loop. Conventions: `.editor-blocks`/`.eb[data-type]`, `.prop-anchor[data-prop][data-value]`, `.editable-title[data-edit]`, `.check-row`/`.check-form-step` (data-min/data-max/data-target/data-unit), `.exception`, `.sop-step`.
4. `docs/design-mockups/redesign-mockups-2026-07/icons.js` — `<span data-i="name"></span>`.

## The warmer token block (paste VERBATIM in every file's first `<style>`)
```css
:root {
  --background:      hsl(40 30% 99%);
  --surface:         hsl(40 30% 99%);
  --surface-2:       hsl(38 22% 97%);
  --surface-3:       hsl(38 20% 95%);
  --surface-4:       hsl(38 18% 92%);
  --surface-sunken:  hsl(38 25% 96.5%);
  --text:            hsl(30 8% 12%);
  --text-2:          hsl(30 6% 35%);
  --text-3:          hsl(30 5% 50%);
  --text-light:      hsl(30 5% 64%);
  --border:          hsl(38 18% 90%);
  --border-strong:   hsl(38 18% 82%);
  --brand-navy:      hsl(210 40% 24%);
  --brand-navy-2:    hsl(210 36% 30%);
  --primary:         hsl(225 75% 55%);
  --primary-hover:   hsl(225 75% 50%);
  --primary-active:  hsl(225 75% 45%);
  --primary-subtle:  hsl(225 75% 55% / 0.10);
  --primary-tint:    hsl(225 75% 55% / 0.14);
  --shadow-rest:     0 1px 2px hsl(210 40% 24% / 0.05), 0 1px 3px hsl(210 40% 24% / 0.04);
  --shadow-lift:     0 2px 8px hsl(210 40% 24% / 0.07), 0 1px 2px hsl(210 40% 24% / 0.05);
  --shadow-pop:      0 4px 16px hsl(210 40% 24% / 0.10), 0 1px 3px hsl(210 40% 24% / 0.06);
  --shadow-drawer:   0 8px 32px hsl(210 40% 24% / 0.16), 0 2px 6px hsl(210 40% 24% / 0.08);
  --sheen-primary:   linear-gradient(180deg, hsl(225 75% 58%) 0%, hsl(225 75% 52%) 100%);
}
```

## The persistent shell (every file starts with this structure)
```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Gordi MOS — {destination}</title>
  <link rel="icon" href="data:,">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="base.css">
  <style> /* warmer :root block (above) + file-local layout */ </style>
</head>
<body class="hifi">
  <div class="demo-banner">…</div>
  <div class="app live">
    <header class="topbar">…</header>
    <aside class="rail">…</aside>
    <main class="main"> <!-- screens swap here --> </main>
    <nav class="mobile-tabbar">…</nav>
    <!-- optional contextual mobile action; only Modules/records with a high-frequency local job -->
    <button class="capture-fab" data-modal-trigger="contextual-capture">…specific verb…</button>
  </div>
  <!-- overlays: contextual operational form where applicable, command ⌘K modal, shared right panel, persona menu, toast -->
  <script src="icons.js"></script>
  <script src="app.js"></script>
  <script src="editor.js"></script>
</body>
</html>
```
Mirror the shell markup from `prototype.html` (read it for the exact topbar/rail/persona-menu/deputy-panel/⌘K structures). The rail reflects D1 (Destinations + BU-grouped Modules). Cross-destination links use `<a href="home.html">`, `<a href="work.html">`, etc.

## Vocabulary corrections (apply throughout — these are binding, from CONTEXT.md)
- **Home**, NOT "Orient" (first destination).
- Task ownership = canonical **PIC** + **Supervisor**. Dense surfaces use "PIC"; forms/details expand it
  to "Person in charge (PIC)". Always spell out "Supervisor"; never label the relationship "SPV".
- Objective/Project/Process = full **RACI** (R/A/C/I) with canonical labels. RACI is never shown on Task.
- **Standard** is the canonical term for the quality-loop object. **"SOP"** is a sanctioned synonym (use either; never call a *Process* an SOP).
- One task, one page, two views (Lens-C invariant).

## The 6 Twenty IxD rules (binding — D3a–f; kill the scatter)
- **D3a:** record click/relation pill → one stack-navigated right Record Panel (`.drawer.side-over`);
  relations inside it push into the same panel, never a nested drawer. Back/browser-Back pops; Close
  closes the whole stack; "Open" and a fourth level escalate to the canonical full page. Quick field
  edits happen inline in the list, not in a drawer.
- **D3b:** ⌘K stays a centered popup (`.modal[data-modal="command"]`) for nav/search/act. Inbox quick
  triage, deputy, and record inspection share one docked right-panel host and navigation stack; they do
  not open competing drawers. ⌘K routes into that panel.
- **D3c:** one inline-cell edit primitive (`.inline-cell` with display→edit); Enter/Tab/click-outside
  validates and saves, Escape restores the last saved value, invalid input stays open with an error.
  Reuse across table/board/panel/page. Add `.inline-cell` styles to base.css if missing (see Layer 0).
- **D3d:** multi-view = `.view-switch` (Table/Kanban/Timeline) over one record index. A View = saved {filters, sorts, layout, fields} (`.saved-view` chips).
- **D3e:** typed-object create = `+` → new record appears inline → title cell auto-focuses → type →
  Enter. Operational submissions use a context-named form/sheet only on their owning Module/record;
  there is no global Capture modal.
- **D3f:** authorization-preserving personal/deputy widget composer on Home only (`.widget-grid` +
  `.widget-add-bar`); Work customizes through saved views, not widgets. Core destinations/Modules are
  fixed; only personal saved-view pins beneath their owning location can be customized.

## The deputy (D4 — first-class surface, mocked)
Every file's topbar has a **sparkles icon** that opens the shared right-panel host with a **fixture grounded conversation** (not a placeholder): e.g. user "what's my AR overdue?" → deputy "Rp 142M across 5 invoices, oldest 38d (PT Sumber Makmur) — [drill to Follow-ups] [compose a widget]". Show the deputy composing a widget and the widget appearing in Home's personal canvas; Work receives saved-view proposals, not widgets. Include an **inline `@` reach**: in any editor/command-bar text surface, typing `@` could invoke the deputy (mock the affordance — a small `@ ask deputy` chip appears). This is the agent-native-from-the-front posture (D5a). Close the PMO gaps visibly: the deputy can navigate (D5b — a "take me there" link), composes into Home (D5c), proposes saved Work views/pins, and is a first-class ⌘K action (D5d — "Ask deputy" always-visible row, not zero-results fallback).

## Real data (reuse verbatim — the Gordi cast)
- **People:** Arief (owner, AS, brand-navy), Rina (Retail Ops head, RA, blue), Dimas (B2B Ops head, DS, violet), Sari (Ecommerce lead, SP, green), Budi (Café lead, BW, teal), Yusuf (roastery operator, YU, orange).
- **Objectives:** Open HQ retail 2nd loc (Transform, 42% behind), B2B margin to 38% (Optimize, 68%), Ecommerce ship <4h (Run, 91%).
- **Projects:** GKID lease & buildout (R:Rina/A:Arief/C:Budi/I:Dimas, 3 tasks, 55% at-risk), Menu & supplier readiness (R:Sari/A:Rina, 2 tasks, 70%). **Processes:** Roastery yield optimization (R:Yusuf/A:Dimas/C:Arief, 72%), Pick-pack SLA (R:Sari/A:Rina, 91%).
- **Tasks:** TASK-241 Sign GKID lease (PIC:Rina/Supervisor:Arief, Blocked, 2d overdue), Resolve ESB
  webhook (PIC:Dimas/Supervisor:Arief, Blocked), Finalize menu COGS (PIC:Rina/Supervisor:Arief), B2B SL
  authorize (PIC:Dimas/Supervisor:Arief), Ecommerce dashboard (PIC:Sari/Supervisor:Rina), Q3 marketing
  (PIC:Budi/Supervisor:Arief).
- **Standards:** Espresso preparation (Bar, owner Budi, 4 steps: Dose 18g±0.3/Yield 36g±1.5/Time 25-30s/Temp 92-94°C, 87% pass, 2 exceptions), Roast profile medium (Roastery, owner Yusuf, 98%), Kitchen daily-open (Kitchen, owner Budi, 100%), Pick-pack accuracy (Ecommerce, owner Sari, 99%).
- **Follow-ups:** PT Sumber Makmur (Rp 38M, overdue 38d, B2B AR), Tunas Abadi (Rp 24M, promised), PT Karya Nusantara (Rp 45M, partial, bal Rp 12M), CV Mitra Sejati (Rp 18M, chased, retail), Kopi Setia (Rp 17M, open, retail).
- **Money:** Revenue Rp 1.84B (+6.2%), Gross margin 61.4% (−2.1pp, interim), AR overdue Rp 142M (5 invoices), Net cash Rp 612M (AP Rp 298M, unbilled Rp 41M, unearned Rp 88M). Streams: Cafe Ops Rp 1.04B / Ecommerce Rp 512M / B2B Rp 288M.
- **Shifts:** Yusuf·Roastery·07:00–15:00; Budi·Espresso+Kitchen·06:00–14:00; Sari·Ecommerce pack·09:00–17:00; Dimas·Roastery lead·07:00–15:00.

## Layer 0 — one shared CSS addition (do FIRST, in base.css, before dispatching agents)
Add the `.inline-cell` primitive to base.css (D3c) — the one missing piece for the Twenty grammar:
```css
.inline-cell { display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px; border-radius: var(--radius-control); cursor: pointer; min-height: 24px; border: 1px solid transparent; }
.inline-cell:hover { background: var(--surface-2); border-color: var(--border); }
.inline-cell.editing { background: var(--primary-subtle); border-color: var(--primary); }
.inline-cell input, .inline-cell select { border: none; background: transparent; font: inherit; padding: 0; width: 100%; outline: none; }
.inline-cell .ic-val { font-weight: 600; font-size: 13px; }
```

## CRITICAL rules (every agent)
- **Edit ONLY your assigned file** (+ the shared base.css Layer-0 addition is done once by the Director before dispatch).
- **ZERO `href="#"`.** Use `data-go` (in-file), real `<a href="other.html">` (cross-file), `data-drawer-trigger`, `data-modal-trigger`, `data-task`.
- Every `data-screen` reachable. Tag balance (`<div>`/`</div>`, `<section>`/`</section>`).
- `<body class="hifi">` (bigger type). Warmer `:root` verbatim. Scripts: icons.js → app.js → editor.js before `</body>`.
- Impersonation (all 5 personas via persona menu), font-size picker (topbar + settings), ⌘K palette,
  shared right panel, record inspector, and the file's contextual operational form where applicable —
  all present and wired.
- Mobile: real responsive (mobile-tabbar, rail hidden, tables→cards, drawers→bottom sheets, deputy panel full-width).
- Vocabulary corrected throughout (Home, R/A, Standard).
- Demo banner: `<b>GORDI MOS · {destination}</b> · warmer · <i>interactive</i>` + cross-links to the other 4 files + back to `index.html`.

## Verify after writing — run and report
```
cd docs/design-mockups/redesign-mockups-2026-07
echo "screens: $(grep -c 'data-screen' {file})"
echo "contenteditable: $(grep -c 'contenteditable' {file})"
echo "prop-anchor: $(grep -c 'prop-anchor' {file})"
echo "inline-cell: $(grep -c 'inline-cell' {file})"
echo "deputy drawer: $(grep -c 'data-drawer=\"deputy\"' {file})"
echo "dead #: $(grep -c 'href=\"#\"' {file})"
echo "persona menu: $(grep -c 'data-user-pick' {file})"
dov=$(grep -o '<div' {file} | wc -l | tr -d ' '); dc=$(grep -o '</div>' {file} | wc -l | tr -d ' ')
echo "div: $dov/$dc"
```
