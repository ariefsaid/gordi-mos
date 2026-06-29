# Design-plan — Admin user management (in-app provisioning)

> Scope: the **UI design-plan** for the admin-only people/logins/roles screen specified in
> `docs/specs/admin-user-mgmt.spec.md`. This document is the design authority the
> `ui-implementer` + `design-reviewer` work against. Every visual decision below names a
> **`DESIGN.md` token** (never a raw hex/px), and reuses an **existing component primitive**
> wherever one exists. No Phase-0 mockup exists for this admin surface (it post-dates the
> first-slice picks), so this plan anchors directly to the adopted system + the established
> Tasks/Kitchen list-and-form precedents it must visually match.
>
> **Authority:** `DESIGN.md` (identity), spec ACs (AC-001..AC-070), `CLAUDE.md` density posture
> ("usability and speed beat density"; audience = high-school-graduate workforce admin → clarity
> first; the LIST stays efficient for ~15 people). ADR-0011 D5 / ADR-0010 D6 / ADR-0016 frame the
> enforcement; the UI **surfaces** disabled/blocked controls, it never **is** the security boundary.

---

## 0. Identity-preservation check (no new tokens proposed)

I evaluated every element below against the adopted palette/primitives. **No new token is needed.**
The four login statuses, the role chips, and all dialogs map cleanly onto existing tokens/primitives:

| Need | Existing token / primitive — REUSED |
|---|---|
| 4 login-status badges | `Pill` primitive tones: `neutral` / `success` / `warning` / `destructive` (see §4.2) |
| Access-role chips (`admin·ops_lead·finance·member`) | `Tag` primitive (categorical, dotless) — neutral palette colors (see §4.5) |
| Archived marker | the existing `.archived-tag` treatment (mobile-grouped-cards precedent) + `muted-foreground` |
| Create form fields | `TextInput` (label+box, error→`--field-error-border`/`--field-error-text`), `Checkbox`, `Toggle` |
| Temp-password reveal | composed from `card` + `mono` type + `Button` + `Pill tone="warning"` (see §4.4) |
| Confirm dialogs | the `ConfirmArchive` overlay pattern (`.confirm-overlay`/`.confirm-box`) + `Button` variants |
| Empty / loading / error | `EmptyState` / `SkeletonRows` / `ErrorState` from `state-kit.tsx` |
| Buttons | `Button` (`primary·outline·ghost·destructive`); disabled = the §5-Buttons proposed disabled style (already in use across app) |

This is **reference/gap-analysis only — no re-skin, no new aesthetic.** If the implementer hits a
genuine gap, STOP and report for owner sign-off (per the de-reference firewall + DESIGN.md amendment process).

One **documentation-only** confirmation requested from the owner (not a new token): the §5-Inputs/§5-Buttons
**disabled** styling is still marked "gap — proposed, not yet ratified" in `DESIGN.md`. The app already
applies `opacity: 0.5; cursor: not-allowed` (e.g. the Settings stub, the disabled `seg`). This screen
**leans heavily on disabled controls** (self-assign block, last-admin block, no-login actions). Recommend
the owner ratifies the existing disabled treatment as-shipped so it stops reading as a gap — **no value
changes**, just promoting the de-facto convention to ratified. Flagged as an open question (§8), not blocking.

---

## 1. Surface, route & navigation

- **Route:** `/admin/people` (under a new `Admin` rail group). Renders one `PageFrame variant="data"`
  full-bleed (this is a working list, not a digest — MOS density mode §"List/detail surfaces" keeps the
  PMO data-dense posture here; the home surface-wash gradient is NOT used).
- **Page head** (`page-head` / `PageHead`): Page Title **"People"** (`page-title` token — Plus Jakarta
  Sans 600/24). Sub-caption in `body`/`muted-foreground`: "Manage who can sign in and what they can do."
  Trailing primary action **"+ Add person"** (`Button variant="primary"`, the one `primary` blue on the
  screen — The One Blue Rule).
- **Nav entry (FR-001, route-guard layer):** a new `Admin` group in the rail (`rail-nav.tsx`), rendered
  **only** when `auth.viewer.accessRoles` includes `admin` — mirroring the existing
  `hasElevatedKitchenAccess` gate. Item label **"People"**, 28px nav-item, `rounded-sm`, active =
  `bg-accent`/`text-foreground`/`text-primary` icon (the records-workspace selection idiom already in
  `rail-nav.tsx`). For a non-admin the group + item are **absent from the DOM** (not hidden via CSS) —
  AC-070.
- **Route guard (AC-070):** the route element redirects a non-admin session away (to `/`). The hidden
  nav entry is **not** the boundary — RLS/RPC authz is (FR-002, NFR-001); the UI guard is convenience +
  defense-in-depth. No admin data is fetched before the guard resolves.

---

## 2. Layout

### 2.1 Desktop (≥768px) — the people list

A single full-bleed **card** holding a dense **DataTable**, matching the Tasks/Kitchen signature:

- **Card:** `card` token (white, `rounded-lg` 12px, 1px `border`, `shadows.rest` resting lift). Internal
  table seams squared at the card top (`var(--radius) var(--radius) 0 0`) per §5 Cards.
- **Toolbar** (seamed to table top, flat — no resting shadow, utility surface): a `search-mini` field
  (filter by name/email, `input` border, `muted-foreground` icon) on the left; a small `seg` segmented
  filter on the right — **All · Active logins · No login · Disabled · Archived** (the `seg` idiom:
  `secondary` track, "on" = white pill + `shadows.pressed` lift). Trailing **"+ Add person"** repeats
  here for reach (same `primary` button; one logical action, so still within the One-Blue budget).
- **Table** (`table-header-cell` 38px / `table-body-cell` 54px tokens — standard 54px rows, NOT the
  50px DB-view density; this admin list is ~15 rows, clarity over density per `CLAUDE.md`):

  | Column | Content | Tokens / primitive |
  |---|---|---|
  | **Person** | Avatar (navy→primary gradient, `Avatar size="sm"`) + full name (`body` 600) + email below (`mono` 13/`muted-foreground` for the `@ops.gordi.local` synthetic; `body`/`muted-foreground` for real emails) | `Avatar`, `body`, `mono`, `muted-foreground` |
  | **Login** | one **LoginStatusPill** (`Pill`, 4 states — §4.2) | `Pill` tones (§4.2) |
  | **Access roles** | row of **RoleChip** `Tag`s; `member` shown plainly; the derived **`manager`** chip rendered **read-only/quiet** (`Tag color="slate"`, no remove affordance) so the admin can SEE it but the model's "never assigned" rule is visible | `Tag` (§4.5) |
  | **Status** | `Archived` marker (`muted-foreground` + struck/quiet name) only when archived; otherwise empty | `.archived-tag`, `muted-foreground` |
  | **(row actions)** | a `⋯` row-menu button, hidden until row hover (the Tasks `row-menu` precedent), opening the per-person action popover (§4.6) | `IconButton` ghost, popover overlay token |

  - Row hover → `accent/60%`; numeric/center columns follow the table rules. The **whole row is NOT a
    link** (unlike Tasks) — there is no person-detail page in this slice; actions live in the `⋯` menu +
    an inline expandable role editor (§4.5). Keeps the model simple for the audience.
  - Right-aligning: none of these columns are numeric, so all left-align; the `⋯` column right-aligns.

### 2.2 Mobile (<768px) — stacked cards (kitchen/Tasks reflow precedent)

Per the **DataTable reflow rule (OD-W4-4)**: the table **single-renders** — at `md` (768px) the `<table>`;
below `md` a stacked **person card** list. Exactly one branch in the DOM (`useIsDesktop()` synchronous read),
**no `aria-hidden`** on either branch. Card anatomy mirrors `mobile-grouped-cards.tsx`:

- **Person card** (`article`, `card` token, 12px radius, `shadows.rest`, `.touch-target` ≥44px on
  affordances): head row = Avatar + name (`body` 600) + the LoginStatusPill; then a `<dl>` label:value grid
  (visible `<dt>` labels, not sr-only — the Tasks card precedent): **Email**, **Access roles** (RoleChips),
  **Status** (Active / Archived). A full-width **"Manage"** `Button variant="outline"` (≥44px) opens the
  per-person action sheet (the same actions as the desktop `⋯` menu, laid out as a stacked list).
- The `seg` filter collapses to a full-width select-style control above the list; **"+ Add person"** is a
  full-width `primary` button pinned under the page head.

---

## 3. Component inventory (build list)

All names are conceptual; the implementer composes from existing primitives.

1. **`AdminPeoplePage`** — route element + admin route-guard + data fetch + the All/Active/No-login/Disabled/Archived filter state.
2. **`PeopleTable`** (desktop) / **`PeopleCardList`** (mobile) — the single-render reflow pair.
3. **`PersonRow`** / **`PersonCard`** — one person; composes Avatar + LoginStatusPill + RoleChips + actions.
4. **`LoginStatusPill`** — wraps `Pill`; maps `none|active|disabled` (+ archived overlay) to tones (§4.2).
5. **`RoleChips`** + **`RoleEditor`** — display chips (Tag) + the grant/revoke control (§4.5).
6. **`AddPersonDialog`** — the create form (§4.3), modal.
7. **`TempPasswordReveal`** — the show-once panel (§4.4) — the trickiest moment; gets its own section.
8. **`PersonActionMenu`** — the `⋯` popover (desktop) / action sheet (mobile): Reset password · Disable/Enable login · Edit roles · Archive/Restore (§4.6).
9. **`ConfirmDialog`** — generalize the existing `ConfirmArchive` pattern for the reset/disable/archive confirms (§4.7).

Reused as-is: `Button`, `Pill`, `Tag`, `TextInput`, `Checkbox`, `Toggle`, `Avatar`, `EmptyState`,
`ErrorState`, `SkeletonRows`, `IconButton`, `PageFrame`, `PageHead`.

---

## 4. Components — anatomy, tokens & ALL states

### 4.1 People list (table / card)

- **Loading:** `SkeletonRows` (state-kit) inside the card body — 6 shimmer rows shaped to the row layout
  (`aria-hidden`; the table header still renders). The page head + toolbar render immediately.
- **Empty (AC-060 — org has only the admin):** `EmptyState` inside the card — title **"Just you so far"**,
  copy **"Add your first teammate to give them access."**, action = the **"+ Add person"** `primary`
  button. (The admin themself is excluded from "empty" by being the only row — show the EmptyState only
  when the *non-self* count is zero; the admin's own row may still render above it, or we suppress it —
  implementer decision, but the EmptyState copy must read for "you're alone here".)
- **Error:** `ErrorState` (role=alert) inside the card with a **Retry** `outline` button (NFR: a failed
  admin fetch must not leak — generic "Couldn't load people. Try again.").
- **Filter → no matches:** a lighter inline `EmptyState` ("No people match this filter") with a "Clear
  filter" `ghost` button — distinct copy from the org-empty state so the admin isn't confused.

### 4.2 LoginStatusPill — the four login states (FR-010/011, AC-060)

Each state renders a **`Pill` with a leading dot AND a text label** (never dot-only / color-only — the
Tinted-Status Rule + WCAG 1.4.1). Maps to existing `Pill` tones (no new token):

| Login state | `Pill` tone | Label | Rationale |
|---|---|---|---|
| **No login** (`user_id` null) | `neutral` (`secondary` bg + `muted-foreground` text) | "No login" | quiet — a directory entry, not yet provisioned |
| **Active** | `success` (`success/14%` + `--status-won-text` + `success` dot) | "Active" | can authenticate — positive state |
| **Disabled** | `warning` (`warning/18%` + `warning-foreground` + `warning` dot) | "Disabled" | reversible caution, **not** destructive/red (mirrors the late-filing amber convention — disabling is reversible, not an error) |
| **Archived person** | `neutral` pill + the separate `.archived-tag` marker | "Archived" | archived is a *person* state, orthogonal to login; shown as the quiet `.archived-tag` so it doesn't fight the login pill |

Disabled chose **warning/amber not destructive/red** deliberately: per DESIGN.md, destructive-red is for
errors / irreversible / "lost"; a disabled login is reversible (FR-040) — amber = caution, consistent
with the late-TimingChip and Ops "needs attention" amber-not-red convention.

### 4.3 AddPersonDialog — create person (+ optional login) (FR-020/021/022/023, AC-011)

Modal over the `.confirm-overlay` scrim, body in a `card` (12px radius, `overlay` shadow — it genuinely
floats). Heading **"Add person"** (`heading` token). Fields, top to bottom:

1. **Full name** — `TextInput`, required. Inline-validate-on-blur; invalid → `--field-error-border` +
   `--field-error-text` helper ("Enter a name").
2. **Email** — `TextInput type="email"`, disabled + greyed when "No email" is checked.
3. **No email** — `Checkbox` ("This person has no email"). When checked: show a `muted-foreground` helper
   "We'll create a sign-in name like `budi.santoso@ops.gordi.local`" with the **live-derived** synthetic
   address in `mono` (FR-021 — deterministic from name; AC-011 asserts the `@ops.gordi.local` shape).
4. **Access roles** — a small group of `Checkbox`es for `member · ops_lead`. **`admin` and `finance` are
   rendered DISABLED** with a `muted-foreground` helper "You can't grant admin or finance to yourself
   here" — FR-023/NFR-004; `manager` is **not offered at all** (derived). (Self-assign block only applies
   to creating *oneself*, but at create time the new person is never the actor, so admin/finance MAY be
   offered for a *new* person — re-check against the guard: the spec's self-assign block is actor==target;
   for a brand-new person actor≠target, so admin/finance CAN be granted. **Implementer: gate the disabled
   state on actor==target only.** Default-safe: if uncertain, leave admin/finance disabled in create and
   grant via RoleEditor post-create, where the guard is unambiguous. Flagged §8.)
5. **Create a login now** — `Toggle` (`role="switch"`). Off by default (a person can exist without a
   login — OD-P1-2). When on, a helper notes "A temporary password will be shown once after you create."

**Footer:** **Cancel** (`ghost`) + **Create person** (`primary`). On submit:
- **Submitting:** primary button → disabled + label "Creating…" (the kitchen "Working…" precedent); fields disabled.
- **Validation error:** field-level (see above); a form-level `ErrorState` (role=alert) appears above the footer for RPC failures ("Couldn't create this person. Try again.").
- **Success, no login:** dialog closes, row appears in the list, a `success` toast ("Budi Santoso added").
- **Success, login created (FR-022):** dialog content **swaps to the `TempPasswordReveal`** (§4.4) — the dialog does NOT auto-close; the admin must explicitly dismiss after copying.

### 4.4 TempPasswordReveal — the show-once-password moment (FR-022/030, AC-011, NFR-003)

This is the highest-stakes UX moment: the password is shown **exactly once**, is **never persisted** (not
in component state after dismiss, not logged, not stored — AC-011 + NFR-003), and the admin must
understand it won't return. Design for a high-school-graduate admin: unmissable, single clear action.

**Anatomy** (inside the dialog `card`, replacing the form / replacing nothing in the reset flow):

- **Heading** (`heading`): "Login created for Budi Santoso" (or "Password reset for …").
- **A prominent warning banner** — `Pill tone="warning"` is too small; use a `warning/18%` fill block
  (the Ops "needs attention" treatment: `warning/18%` bg + `warning-foreground` text + a `warning` left
  marker, the one owner-approved side-rule exception) with text: **"Copy this now — you won't be able to
  see it again."** This is the single most important sentence; it gets the strongest non-red emphasis.
- **The credential block** — a `secondary`-fill panel (`rounded-md`), showing:
  - **Sign-in name / email** (`mono` 13, selectable) with its own small copy button.
  - **Temporary password** (`mono` 13, larger, letter-spaced for legibility, selectable) with a primary
    **Copy password** button (`Button variant="primary"` + a 15px copy icon — the one blue action here).
- **Copy feedback:** on click, the button label flips to "Copied ✓" for ~2s (and an `aria-live="polite"`
  region announces "Password copied to clipboard" — screen-reader parity, see §6). Clipboard copy uses the
  async Clipboard API; on failure the password stays selectable for manual copy + a `muted` hint.
- **Dismiss** — **Done** (`Button variant="primary"` if not copied is fine; or `outline` to nudge copy
  first). On Done: the dialog closes AND the password string is **dropped from component state** (set to
  null) — AC-011's "not persisted after dismiss". No "show again" affordance exists by design.

**States:**
- **Just revealed (default):** password visible, Copy button armed.
- **Copied:** button = "Copied ✓", live region announced; password stays visible until Done (admin may
  recopy).
- **Clipboard blocked/insecure context:** Copy button disabled with a `muted` hint "Select and copy
  manually"; the password text has `user-select: text`.
- **After Done:** unmountable — the value is gone; if the admin reopens the person there is NO way back to
  it (reset issues a *new* one). This irreversibility is stated in the banner up front.

**Accessibility of the reveal (critical):** focus moves to the dialog on open; the warning banner is the
first thing announced (`role="alertdialog"` + `aria-describedby` → the warning text). The password is in
an element with an accessible label "Temporary password"; the copy result is announced via a polite live
region (NOT by moving focus). `Esc` and the scrim are **disabled** for this reveal step (so the admin can't
dismiss-by-accident before copying) — only the explicit **Done** closes it. This is the one dialog where
backdrop-dismiss is intentionally removed; called out for the design-reviewer.

### 4.5 RoleChips + RoleEditor — grant/revoke access roles (FR-050, AC-050)

- **Display (RoleChips):** each granted access role as a `Tag` (categorical, dotless). Color choices stay
  in the neutral/structural family (NOT the `primary` action blue, which must stay scarce):
  - `admin` → `Tag color="slate"` (structural weight, quiet)
  - `finance` → `Tag color="slate"`
  - `ops_lead` → `Tag color="sky"` (categorical, non-action)
  - `member` → `Tag color="gray"`
  - `manager` (derived) → `Tag color="gray"` rendered **read-only** with a small "auto" hint — visible but
    never editable (FR-050 "never offerable").
  - These map to the kit's `--ds-tag-background/text-{color}` tokens; all are non-interactive categorical
    hues, preserving the One-Blue Rule.
- **RoleEditor (grant/revoke):** opened from the `⋯` menu → "Edit roles" → an inline popover (desktop) /
  sheet (mobile) with a `Checkbox` per assignable role (`member · ops_lead`, and `admin · finance` per the
  actor≠target gate, §4.3 note). Checking grants, unchecking revokes (revoke = soft `revoked_at` — the UI
  just toggles; no "delete" verb). `manager` is absent from the list.
- **States:**
  - **Self + admin/finance:** those two checkboxes **disabled** with helper "You can't change your own
    admin/finance role" (FR-023/AC-050 self-assign guard).
  - **Last active admin (FR-041/AC-040):** the `admin` checkbox for the last admin is **disabled** with
    helper "This is the only admin — assign another admin first." (Mirrors the disable-login block.)
  - **Saving:** checkbox disabled + a small inline spinner/"Saving…"; on success the chip updates and a
    `success` toast fires; on failure the checkbox reverts + an inline `ErrorState`.
  - **No roles:** show a `muted-foreground` em-dash "—" in the cell (a person can have zero access roles).

### 4.6 PersonActionMenu — the `⋯` row menu / mobile action sheet

A popover (`popover` token, 12px radius, `overlay` shadow, 32px menu items, `accent` hover, `menu-sep`
hairlines). Items, gated by the person's state:

| Action | Shown when | Disabled when | Variant |
|---|---|---|---|
| **Reset password** | has a login | — | default item |
| **Disable login** | login active | last active admin (FR-041) → disabled + reason | default |
| **Enable login** | login disabled | — | default |
| **Edit roles** | always | — | default |
| **Archive** | not archived | last active admin (no-lockout) → disabled + reason | `destructive`-colored item |
| **Restore** | archived | — | default |
| **Create login** | `user_id` null (no login) | — | default (routes into the §4.4 reveal) |

Disabled items use the ratified disabled treatment (`opacity: 0.5`, `aria-disabled="true"`, `not-allowed`)
with a `title`/tooltip giving the reason (the kitchen `approveDisabledReason` precedent).

### 4.7 ConfirmDialog (reset / disable / archive)

Generalize the existing `ConfirmArchive` (`.confirm-overlay` scrim + `.confirm-box` card,
`role="dialog" aria-modal="true"`, Cancel `outline` + action button). Per action:

- **Reset password:** confirm "Reset the password for Budi Santoso? Their current password will stop
  working." → action `Button variant="primary"` "Reset password". On confirm → §4.4 reveal (the new temp
  password). Cancel `outline`.
- **Disable login:** "Disable sign-in for Budi Santoso? They won't be able to log in until you enable it
  again." → `Button variant="destructive"`? **No** — disabling is reversible; use `primary` "Disable",
  reserving `destructive` for truly irreversible. (Consistent with the amber, not-red, status choice.)
- **Enable login:** low-stakes — may skip the confirm and just act + toast.
- **Archive:** the existing ConfirmArchive copy, adapted: "Archive Budi Santoso? They drop out of the
  directory and lose access, but nothing is deleted." → `Button variant="destructive"` "Archive" (archive
  is the closest to destructive here, and matches the existing task ConfirmArchive using destructive).
- **Restore:** low-stakes — act + toast, no confirm.

**Confirm-dialog states:** idle → submitting (action button "Working…" + disabled, Cancel disabled) →
success (close + toast) / error (inline `ErrorState`, role=alert, stays open to retry).

---

## 5. Responsive breakpoints

| Breakpoint | Behavior |
|---|---|
| **≥768px (`md`)** | DataTable renders (`<table>`); `⋯` row menu; dialogs centered modals (max-width ~480px). |
| **<768px** | PeopleCardList renders (single-render reflow, OD-W4-4); per-person "Manage" action sheet; dialogs become full-width bottom sheets / full-screen with the same content order; touch targets ≥44px (`.touch-target`). |
| **<920px** | Rail collapses to the hamburger drawer (existing shell behavior) — the `Admin > People` entry rides along in the mobile drawer when the viewer is admin. |

Two separate breakpoints (920 rail / 768 table reflow) — same as the rest of the app; do not introduce new ones.

---

## 6. Accessibility (WCAG-AA)

- **Contrast:** all text/background pairs use ratified AA-cleared tokens — `foreground`/`muted-foreground`
  on `card`/`background`; status pills use the **darkened text variants** (`--status-won-text`,
  `warning-foreground`, `--status-lost-text`) on their tints (never base hue as pill text). The `mono`
  password + email run `foreground` on `secondary` (AA-clear). Tag chip colors use the kit's paired
  `--ds-tag-text-{color}` (AA by construction). Re-verify the `warning/18%` "needs attention" banner text
  (`warning-foreground` deep-brown) — already AA-verified in the Ops Log usage.
- **Status not by color alone (1.4.1):** every LoginStatusPill carries a **text label** + dot;
  archived adds the `.archived-tag` word; disabled controls carry a `title`/helper reason, not just dimming.
- **Focus order & management:**
  - Page: DOM order (rail → page head → toolbar → table). Global `:focus-visible` ring (`2px ring`, 2px
    offset) on every focusable — inherited, no per-component override.
  - **Dialogs (AddPerson, Confirm, TempPasswordReveal):** on open, focus moves into the dialog (first field
    for AddPerson; the **Copy password** button for the reveal; the Cancel button for confirms — never an
    autofocused destructive action). Focus is **trapped** within the dialog; on close, focus returns to the
    triggering control (`+ Add person` button, or the `⋯` menu item). `Esc` closes — **except** the
    TempPasswordReveal step (intentionally no Esc / no backdrop-dismiss, §4.4) so the password isn't lost
    by accident.
  - DESIGN.md notes overlays were non-focus-trapping in the source mockup — this is the documented
    "build-time gap"; this plan **requires** real focus management + Esc here (per the a11y posture §"Keyboard").
- **Password-reveal announcement:** `role="alertdialog"` with `aria-describedby` → the "copy this now"
  warning, so AT announces the warning on open; the **copy result** is announced via an `aria-live="polite"`
  region ("Password copied to clipboard"), not by moving focus. The password field has an explicit
  accessible name ("Temporary password").
- **Labels:** every `TextInput` has a visible `<label>` (the primitive wires `htmlFor`); the "No email"
  checkbox and "Create a login now" toggle have visible labels; icon-only controls (`⋯`, copy buttons)
  carry `aria-label` ("More actions for Budi Santoso", "Copy password"). Toggle uses `role="switch"` +
  `aria-checked` (primitive default).
- **Keyboard paths:** table rows are reachable; the `⋯` button is a real `<button>` (Enter/Space opens the
  menu; Arrow keys move within it; Esc closes, focus returns). Checkboxes/toggles are keyboard-operable
  (primitive defaults). The whole create→reveal→copy→done flow is completable with keyboard only.
- **Live regions for async:** success toasts + the role-save "Saving…/Saved" use polite live regions;
  errors use `role="alert"` (ErrorState already does).

---

## 7. Token map — reused vs new

**Reused (everything):** `primary` (the one action blue — add-person, copy-password, confirm-primary,
focus `ring`), `card`/`background`/`secondary`/`muted`/`accent`, `foreground`/`muted-foreground`,
`success`+`--status-won-text`, `warning`+`warning-foreground` (the disabled-login + reveal-banner amber),
`destructive`+`destructive-foreground` (archive button only), `border`/`input`, `--field-error-border`/
`--field-error-text` (form validation), `shadows.rest` (cards), `overlay` shadow (dialogs/popover),
`rounded.sm`/`md`/`lg`/`full`, the full type scale (`page-title`/`heading`/`body`/`label`/`overline`/`mono`),
spacing scale, `Avatar` navy→primary gradient, the `--ds-tag-*` categorical palette (role chips),
`Pill` tones, the `.archived-tag` + Ops "needs attention" `warning/18%`+left-rule treatment, `tabular-nums`
(none strictly needed here — no money/metrics — but any counts use it).

**New tokens proposed:** **NONE.** This screen is fully expressible in the adopted system.

**Documentation-only ask (not a new token, §0):** ratify the existing `opacity:0.5; not-allowed` disabled
control treatment as the official §5-Buttons/§5-Inputs disabled style (it's already shipped app-wide and
this screen depends on it heavily). Owner sign-off → record in DESIGN.md; no value changes.

---

## 8. Open questions for the owner

1. **Disabled-style ratification** (§0/§7) — promote the de-facto `opacity:0.5; cursor:not-allowed;
   aria-disabled` to a ratified DESIGN.md disabled token (documentation only, no visual change)? Recommend yes.
2. **admin/finance at create time** (§4.3 note) — confirm the self-assign guard is actor==target only, so
   `admin`/`finance` MAY be granted to a *brand-new* person in the create dialog (vs. always deferring to
   RoleEditor post-create). Spec FR-023/NFR-004 phrasing is "to oneself"; need the owner/eng-planner to
   confirm the guard predicate before the create form enables those two checkboxes. **Default-safe pick:**
   leave admin/finance OFF in create, grant via RoleEditor where actor≠target is unambiguous.
3. **Disable-login color** (§4.2/§4.7) — confirm "Disabled" reads as **amber/warning** (reversible caution),
   not red — consistent with the system's reversible-vs-error convention. Recommend amber.
4. **Admin's own row** (§4.1) — does the admin see their own row in the People list (with their roles
   shown, self-edits guarded)? Recommend **yes** (transparency + lets them see they're the last admin), with
   the self-edit guards applied. Affects the AC-060 empty-state predicate ("only the admin" = non-self count 0).

---

## 9. Acceptance checklist (folds the taste/required-states + a11y bar)

- [ ] **All states present** for every component: loading (`SkeletonRows`), empty (org-only-admin AC-060),
      filter-no-match, error (`ErrorState` role=alert + Retry), the 4 login statuses (AC-060), disabled
      controls (self admin/finance, last-admin disable/revoke — FR-023/041), submitting, success/toast.
- [ ] **Show-once password** (AC-011): shown exactly once; copy-to-clipboard + announced; no re-reveal;
      value dropped from state on dismiss; no Esc/backdrop dismiss on the reveal step; not persisted/logged
      (NFR-003 — UI never writes it anywhere).
- [ ] **Route-guard** (AC-070): non-admin → no nav entry in DOM + route redirect; no admin fetch pre-guard.
- [ ] **Tokens-only:** no raw hex/px in the implementation; every visual value names a DESIGN.md token.
      No new token introduced (or owner-signed if one becomes truly necessary — STOP-and-ask).
- [ ] **Anti-slop (taste):** no generic gradients (the home surface-wash is NOT used here), no
      centered-everything (left-aligned at the 24px gutter, trailing whitespace right), realistic Gordi
      data in any mockup/story (e.g. "Budi Santoso", `budi.santoso@ops.gordi.local`), one `primary` action
      per surface (One-Blue Rule), status never color-only.
- [ ] **a11y:** AA contrast on every pair; focus trap + return + Esc on dialogs (reveal excepted by design);
      live-region announcements for copy + async; visible labels; full keyboard path create→reveal→copy→done.
- [ ] **Responsive:** 768px table↔card single-render reflow (no `aria-hidden` on branches); ≥44px touch
      targets on mobile; 920px rail collapse carries the Admin entry for admins.
- [ ] **Identity preserved:** matches the Tasks/Kitchen list-and-dialog look; reuses `Button`/`Pill`/`Tag`/
      `TextInput`/`Toggle`/`Checkbox`/`Avatar`/state-kit/ConfirmArchive primitives; no new aesthetic.
```
