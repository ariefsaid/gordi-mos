# Design-plan — Auth screens (P1-3): login + orphan-blocked

- **Status:** draft for owner sign-off
- **Spec:** `docs/specs/auth.spec.md` (FR-001..017, NFR-002, AC-001..012)
- **Identity authority:** `DESIGN.md` (adopted from PMO — never re-skinned). **MOS density mode** §
  governs *home* surfaces; auth is a focused single-task surface, so it follows the base
  shadcn-style card/field/button vocabulary, calmed per the density-mode *spirit* (generous air,
  one dominant action).
- **Front-door anchor:** `docs/design-mockups/proposal-IA-8-balanced-myweek.html`. There is **no
  Phase-0 mockup for auth** — this is designed on paper now, to the adopted system, so the login
  reads as the same product the user lands in (same brand block, same `primary`, same `border`/
  `card` flat construction, same Inter/`tnum` voice, same focus ring).
- **Scope (task-scoped):** production-ready; 2 screens (LoginPage + OrphanBlockedPage) plus the
  recovery set-new-password view as a LoginPage mode; shipped-quality components; desktop-first,
  mobile-usable (OD-P0-3).

All visual values below are named as `DESIGN.md` tokens. **No raw hex / px in the build** — a
literal value in a diff is a defect (per `.claude/agents/ui-implementer.md`).

---

## 0. The two-primaries resolution (BINDING decision)

OD-P1-8 puts **password sign-in** and **magic-link request** on one screen. Two submit actions both
want to be "the button." The IxD invariants in `.claude/agents/ui-implementer.md`
("co-locate co-equal primaries", "convention placement", "no information overload") and DESIGN.md's
**One Blue Rule** ("if two things are blue and only one is the main action, one is wrong") force a
single primary.

**Decision: password sign-in is the ONE primary; magic-link is a clearly secondary path.**

Rationale:
1. **Provisioning model (OD-P1-9).** Every account is admin-invited and has a password set. Password
   sign-in is the everyday, fastest path (no inbox round-trip). Magic-link is the *convenience /
   fallback* path (forgot password, or on a phone where typing a password is annoying — OD-P0-3).
   The primary should be the path most people take most days.
2. **Convention placement.** 30 years of software put email + password + a solid "Sign in" button as
   the default login. Inverting that (magic-link primary) would be innovating on a standard
   affordance — an IxD anti-pattern the reviewer's lens (b) bounces.
3. **One Blue Rule.** Exactly one filled `primary` button on the screen ("Sign in"). Magic-link is
   rendered as a **`button-ghost`/link-in-context** affordance ("Email me a sign-in link instead"),
   styled `primary` *text* (a link, not a filled button) — visually subordinate, still obviously
   actionable.

**Co-location, not state-split.** Both affordances are present **from first paint in one card** — we
do NOT split them across a method-picker step or a view change (the PMO Save↔Submit split anti-
pattern). The user sees email + password + "Sign in" + the magic-link link together. Requesting a
magic link does not navigate away; it swaps the card body in place to the neutral confirmation
(no route change, no dead end).

**Password-reset** ("Forgot password?") is a third, even quieter `primary`-text link beside the
password field. It and magic-link both resolve to the *same* neutral "check your email" confirmation
(FR-005, no enumeration).

---

## 1. Shared layout — the auth shell

A single centered card on the app `background`, used by all three views (login, magic-link/reset
confirmation, orphan-blocked, recovery set-new-password).

```
                         background  (hsl 0 0% 100%) — full viewport, vertically+horizontally centered
   ┌───────────────────────────────────────────────┐
   │   [G]  Gordi MOS                                │  brand block (mirrors IA-8 rail brand)
   │        MANAGEMENT OS                            │
   │                                                 │
   │   ┌─────────────── card ────────────────────┐  │
   │   │  Sign in                                  │  │  card-title (heading)
   │   │  Use your Gordi MOS account.              │  │  muted-foreground sub
   │   │                                           │  │
   │   │  Email                                    │  │  label
   │   │  [ you@gordi.id                        ]  │  │  input
   │   │  Password              Forgot password?   │  │  label + primary-text link
   │   │  [ ••••••••••                          ]  │  │  input
   │   │                                           │  │
   │   │  [        Sign in        ]                │  │  button-primary (THE one primary)
   │   │                                           │  │
   │   │  ──────────── or ────────────             │  │  hairline border divider + muted "or"
   │   │  Email me a sign-in link instead          │  │  primary-text link (secondary path)
   │   └───────────────────────────────────────────┘  │
   │                                                 │
   │   Trouble signing in? Contact Arief.            │  muted-foreground foot line
   └───────────────────────────────────────────────┘
```

### Tokens — shell + card

| Piece | Token(s) |
|---|---|
| Viewport background | `colors.background` |
| Centering | flex column, centered; card max-width ~`360px` content column (see Responsive). Vertical centering uses `min-height: 100dvh`. |
| Brand logo square | 28px square, `colors.primary` bg, `colors.primary-foreground` glyph "G", `rounded.sm` — identical to IA-8 `.brand .logo` |
| Brand name "Gordi MOS" | `typography.heading` weight on a 14px name (matches rail brand: 14px/700, ls -0.01em) |
| Brand subtitle "Management OS" | `typography.overline` (11px/600, ls 0.06em, UPPERCASE), `colors.muted-foreground` — OD-P0-4 subtitle, EN chrome OD-P0-2 |
| Card | `components.card`: `colors.card` bg, 1px `colors.border`, `rounded.md`, padding `spacing.6` (24px — slightly more generous than the 16px list-card default, per density-mode air on a focused surface). **Flat-By-Default: border only, no rest shadow.** |
| Card title "Sign in" | `typography.heading` (20px/700) or `subheading` (18px/600) — use `subheading` to match the calmer card-title voice in IA-8 |
| Card subtitle | `typography.body` (14px), `colors.muted-foreground` |
| Foot "Contact Arief" line | `typography.body` 13px, `colors.muted-foreground` |

**Why a card here (cards are usually lazy):** a single focused auth task on an otherwise empty
viewport is the one place a card is the correct affordance — it bounds the one thing the user must
do. No nested cards. The "or" divider is a single 1px `colors.border` hairline with a centered
`muted-foreground` "or" label (Single-Border Rule — same border value as everything else).

---

## 2. Component breakdown

| Component | Responsibility | Notes |
|---|---|---|
| `AuthShell` | Centered viewport + brand block + foot line; wraps any auth card | Reused by Login, Confirmation, OrphanBlocked, Recovery |
| `LoginPage` | Owns the form + mode state machine (see §3); renders one of: `credentials` / `magic-confirm` / `recovery` body | Single screen per OD-P1-8 |
| `EmailField` / `PasswordField` | Labeled text inputs with error association | `aria-describedby` wired to error/help node |
| `PrimaryButton` ("Sign in") | The one filled `primary` action; owns its own loading state | `button-primary` |
| `MagicLinkLink` ("Email me a sign-in link instead") | Secondary path; triggers OTP request; owns its own loading state | `primary`-text link, NOT a filled button |
| `ResetLink` ("Forgot password?") | Inline by the Password label; triggers recovery email | `primary`-text link |
| `FormError` | One inline error region per form (quiet credential error / rate-limit / network) | `role="alert"`, `colors.destructive` text |
| `ConfirmationPanel` | Neutral "check your email" body (shared by magic-link + reset) | swaps card body in place — no route change |
| `OrphanBlockedPage` | Fail-closed screen: message + sign-out + contact line | only action = sign-out (FR-016) |
| `RecoveryForm` | Set-new-password view (from recovery link) | new-password + confirm fields |

---

## 3. States (every state enumerated)

### LoginPage — `credentials` mode

| State | What renders | Tokens / behavior |
|---|---|---|
| **Idle** | Email + Password fields, "Sign in" filled primary, "Forgot password?" link, "or" divider, "Email me a sign-in link instead" link, foot contact line | base shell tokens above |
| **Field validation (client)** | Empty/invalid email on submit → inline field error under the field | error text `colors.destructive`, `typography.label`; field border → `colors.destructive` (proposed field-error styling, DESIGN.md §Inputs "Error gap"); associated via `aria-describedby` |
| **Loading — password sign-in** | "Sign in" button disabled + spinner + label "Signing in…"; email/password + both links disabled | button keeps `button-primary` bg; `opacity` per the proposed disabled token (`0.5`, `cursor: not-allowed`) on the *other* controls; the active button shows an inline 14px spinner in `primary-foreground`. Only the submitting control shows the spinner (FR-007). |
| **Loading — magic-link** | The "Email me a sign-in link" link shows inline spinner + "Sending…"; "Sign in" + fields disabled | spinner in `colors.primary`; same disable-others rule |
| **Quiet auth failure** (FR-006 / AC-005) | One `FormError` above the button: **"Invalid email or password."** — byte-identical for wrong-password and unknown-email | `FormError` `role="alert"`, text `colors.destructive`, `typography.body` 13px, on a `destructive`/8% tint pill row (Tinted-Status Rule — never a solid fill behind body text). Focus moves to the error region on settle. |
| **Rate limit (429)** | `FormError`: "Too many attempts — try again in a minute." | same `FormError` treatment |
| **Network/server failure** | `FormError`: "Couldn't reach the server — try again." | same; the "Sign in" button re-enables so retry is one click |
| **Expired/used link notice** | On landing back at `/mos/login` from a dead magic/recovery link: a top-of-card notice "That link has expired — request a new one." | `colors.warning`/18% tint + `colors.warning-foreground` text (the amber status-pill pattern), dismissible, above the title |

### LoginPage — `magic-confirm` mode (FR-003) and reset confirmation (FR-005)

Triggered by the magic-link link OR "Forgot password?". **Same neutral panel for both**, identical
whether or not the account exists (AC-006, no enumeration).

| State | What renders |
|---|---|
| **Sent** | Card body swaps in place to `ConfirmationPanel`: a `success`/14% tinted check dot + **"Check your email for a sign-in link."** (magic) / **"Check your email to reset your password."** (reset), the email address echoed back, and a quiet "Back to sign in" `primary`-text link | 
| Tokens | check icon tile `colors.success`/14% + `--status-won-text`; body `typography.body`; "Back to sign in" `primary`-text link. **No route change** — the brand block + card frame stay; only the card body changes (no dead end, clear next step). |

### LoginPage — `recovery` mode (FR-005, set-new-password)

Reached by opening the recovery link (separate route, same `AuthShell`).

| State | What renders | Tokens |
|---|---|---|
| Idle | "Set a new password" title, New password + Confirm password fields, "Save password" filled primary | `button-primary`, same field tokens |
| Mismatch | Inline field error "Passwords don't match." on the Confirm field | `colors.destructive`, `aria-describedby` |
| Loading | "Save password" disabled + spinner + "Saving…" | per FR-007 |
| Success | On save → app home (FR-005). No standalone success screen needed (landing home *is* the confirmation). | — |
| Invalid/expired recovery link | Falls through to the login expired-link notice (above) | `warning` notice |

### Session-resolution loading (FR-013 / AC-009) — pre-auth, no protected flash

While the session is resolving on load, render a **neutral loading state**, never protected content
or a flash of the login form.

| State | What renders | Tokens |
|---|---|---|
| Resolving | `AuthShell` brand block + a single centered, calm spinner or a card-shaped skeleton (no copy that implies signed-in or signed-out) | spinner in `colors.muted-foreground`; if skeleton, `colors.secondary` blocks. Product-register rule: skeleton over mid-content spinner where a card shape is known. |

### OrphanBlockedPage (FR-016 / AC-003)

Authenticated but no linked `shared.people` row. Fail-closed: the **only** action is sign-out.

| Piece | Renders | Tokens |
|---|---|---|
| Frame | `AuthShell` (same brand block — they did authenticate, so the product frame is honest) | shell tokens |
| Status icon | A calm `warning`/18% tinted info dot/tile (not `destructive` — this is "not set up yet," not an error the user caused) | `colors.warning`/18% + `colors.warning-foreground` |
| Title | "Your account isn't set up yet" | `subheading` |
| Body | "We couldn't find your Gordi MOS profile. Contact Arief to get set up." (EN chrome, OD-P0-2; maps the spec's "contact Arief" message) | `typography.body`, `colors.muted-foreground` |
| Action | **Sign out** button — the only control | This is the *primary and only* action here, so it is a filled `button-primary`. (One Blue Rule still holds: one button on the screen.) |
| No writes | UI performs no directory writes (OD-P1-10) — design note for the implementer; nothing renders that implies retry/create | — |

### Placeholder home (FR-017) — out of design scope detail, noted for completeness

Post-auth v1 home is the viewer's full name + a sign-out control inside the adopted shell frame
(`AuthShell` not used — this is the real app). Real shell is P1-4; this plan does not style it
beyond: name in `typography.heading`, sign-out as a `button-outline`.

---

## 4. Responsive (OD-P0-3: desktop-first, mobile-usable)

Auth is structurally simple, so this is a fluid-width single column, not a breakpoint reflow.

| Breakpoint | Behavior |
|---|---|
| **Desktop (≥768px)** | Card content column fixed ~`360px`, centered both axes on `background`. Brand block above the card, left-aligned to the card's left edge (mirrors the rail brand alignment). Generous vertical air. |
| **Phone (~390px / <768px)** | Card grows to `100%` width minus `spacing.4` (16px) gutters each side; stays centered vertically (or top-aligned with `spacing.6` top padding if the keyboard would otherwise push it). Fields, "Sign in" button, and links all span full width. **Touch targets ≥44px**: inputs are 32px tall by token but get a `.touch-target` ≥44px hit area on the links and the magic-link/reset affordances (DESIGN.md DataTable-reflow §`.touch-target` convention). |
| Both | No horizontal scroll; copy never overflows (longest label "Email me a sign-in link instead" wraps gracefully). |

Inputs stay the 32px token height (DESIGN.md "controls 32px" rule) — we do **not** invent a larger
auth-only field height; the ≥44px touch requirement is met via padded hit areas on the tappable
links and by the full-width buttons, not by breaking the control-height token.

---

## 5. WCAG-AA accessibility (NFR-002 / AC-011)

| Requirement | Implementation |
|---|---|
| **Labels** | Every input has a visible `<label>` programmatically associated (`htmlFor`/`id`). No placeholder-as-label. Placeholder (`you@gordi.id`) is supplementary only, `colors.muted-foreground` (clears AA per DESIGN.md a11y note: muted-foreground darkened to 40% L). |
| **Error association** | Field errors linked via `aria-describedby` to the field; the field gets `aria-invalid="true"`. Form-level `FormError` is `role="alert"` (announced) and focus moves to it on auth failure. (AC-011 asserts exactly this.) |
| **Quiet-error parity** | The credential error string is identical for both causes (FR-006) — no `aria-live` difference, no field-specific blame that could leak which field was wrong. |
| **Focus order** | DOM order = visual order: Email → Password → Forgot-password link → Sign in → magic-link link. Logical, no tabindex hacks. |
| **Focus ring** | Global `*:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 2px }` (`colors.ring` = primary) on every field, button, and link — single source of truth, inherited (DESIGN.md focus rule). |
| **Button states** | Disabled controls get `disabled` attribute + the proposed disabled token (`opacity: 0.5; cursor: not-allowed`); the loading button keeps an accessible name ("Signing in…") and `aria-busy="true"`; the spinner is `aria-hidden` (the text label carries the meaning). |
| **Contrast** | All text/token pairs are AA-cleared per DESIGN.md: `foreground` on `card` (~AAA), `muted-foreground` (40% L) on `card`/white (AA), `primary-foreground` on `primary` button, `destructive` error text on white/`destructive`-tint (AA), `warning-foreground` on `warning`/18% tint (the deep-brown AA pair). Status conveyed by **icon + text**, never color alone (the confirmation check has the word "Check your email"; the orphan tile has the title text). |
| **Keyboard paths** | Enter submits the password form (default primary). The magic-link and reset links are real `<button>`s (not `<a>` to nowhere) so Space/Enter activate them. Orphan screen: sign-out is the single focusable action and receives focus on mount. |
| **No protected flash** | Resolving state (§3) is a neutral, role-neutral loading region — screen readers don't hear protected content during resolution (FR-013). |
| **Reduced motion** | Spinners respect `prefers-reduced-motion` (swap the rotating spinner for a static "…" / `aria-busy` only). The card-body swap (credentials→confirmation) is an instant content change with a ≤200ms crossfade that collapses to instant under reduced-motion. |

---

## 6. Tokens used (consolidated)

- **Colors:** `background`, `foreground`, `card`, `card-foreground`, `primary`, `primary-foreground`,
  `secondary` (skeleton blocks, divider context), `muted`, `muted-foreground` (sub-copy, placeholders,
  foot line, neutral spinner), `border`/`input` (card outline, field strokes, "or" hairline),
  `ring` (focus), `destructive` (credential/validation errors), `warning` + `warning-foreground`
  (expired-link notice, orphan tile), `success` + `--status-won-text` (`142 64% 30%`) (confirmation
  check).
- **Typography:** `page-title`?(no — auth uses) `heading`/`subheading` (card title, orphan title),
  `body` (copy, errors), `label` (field labels, small error text), `overline` (brand subtitle "MANAGEMENT OS").
  No `mono` (no IDs on auth). No `tnum` needed (no metrics on auth).
- **Rounded:** `sm` (brand logo square), `md` (card, inputs, buttons), `full` (status dot in
  confirmation/orphan tiles, spinner).
- **Spacing:** `1`–`6` scale (field gaps `spacing.3`/`4`, card padding `spacing.6`, gutter `spacing.4`).
- **Components:** `card`, `input`, `button-primary` (+ brand button shadow at rest), `button-ghost`
  (link affordances inherit ghost/link styling), `badge-status` pattern (tinted notice rows).
- **Rules honored:** One Blue Rule (exactly one filled primary per screen; magic-link/reset are
  `primary`-*text* links, well under 10% blue); Flat-By-Default (card is border-only, no rest shadow);
  Single-Border Rule (the "or" divider reuses `border`); Tinted-Status Rule (errors/notices are
  tint + darkened text, never solid fills behind body text — except the one allowed `destructive`
  case, which here is text not a fill).

---

## 7. Proposed token additions (FLAGGED for owner sign-off)

These are **not new brand colors** — they reuse existing palette hues. They formalize two gaps
DESIGN.md already flags as "Open Questions / gap" in its Inputs and Buttons sections:

| Proposed token / state | Value (reuses existing) | Why MOS needs it | Gap origin |
|---|---|---|---|
| **Field error state** | border `colors.destructive`; helper text `colors.destructive` | Login has real field-level validation (empty/invalid email, password mismatch) — DESIGN.md §Inputs says "no error-state field styling in source. Proposed: error border = destructive, helper text = destructive." | DESIGN.md already proposes this; auth is the first consumer. **Confirm.** |
| **Disabled control state** | `opacity: 0.5; cursor: not-allowed; pointer-events: none` (for buttons) / `secondary` bg + `muted-foreground` text (for fields) | Loading states (FR-007) disable non-submitting controls | DESIGN.md §Buttons + §Inputs both flag disabled as a gap with this exact proposal. **Confirm.** |

If the owner confirms, these are recorded back into `DESIGN.md` (promoting the two "proposed/gap"
notes to ratified component states). **No other new tokens.** No new hue, font, radius, or border
color is introduced.

---

## 8. Anti-slop / IxD self-check

- No gratuitous gradients (the only sanctioned gradient in the system is the avatar — not used on
  auth). No glassmorphism, no oversized hero type, no shadow-heavy floating card (the card is
  border-only per Flat-By-Default).
- Left-anchored, conventional login: email-over-password-over-button, the placement 30 years of
  software trained. No reinvented affordance.
- Realistic Gordi data in any mockup/build (`you@gordi.id`, "Contact Arief") — never lorem.
- **Co-located primaries from first paint** (password + magic-link in one card); **no needless state
  transition** (magic-link request swaps body in place, no navigation); **post-action feedback + next
  step** (confirmation panel says what happened and offers "Back to sign in"); **no dead ends** (every
  terminal state has an exit — orphan has sign-out, confirmation has back, errors re-enable retry).
- **Mental-model match:** "Sign in", "Email me a sign-in link instead", "Forgot password?", "Contact
  Arief" — plain operator language (OD-P0-2 EN chrome), not implementation vocabulary (no "OTP",
  "magic token", "session").

---

## 9. Open questions for the owner

1. **Proposed token additions (§7).** Confirm promoting DESIGN.md's two flagged gaps (field-error
   state + disabled state) to ratified component states. These are the *only* additions and they
   reuse existing hues — but they touch `DESIGN.md`, so they need sign-off.
2. **Primary-action resolution (§0).** Confirm **password = primary, magic-link = secondary link**.
   The spec (OD-P1-8 "both methods") doesn't rank them; this plan ranks password first on the
   provisioning-model + convention argument. If the owner expects magic-link-first (e.g. if most
   ops users will be phone-only and rarely set a password), the hierarchy flips — flag now, before build.
3. **Magic-link vs reset wording.** Both resolve to the same neutral confirmation; copy differs only
   in "sign-in link" vs "reset your password." Confirm that's acceptable (it does not enumerate —
   the *which-action* is chosen by the user, not revealed by the system).
4. **Expired-link notice placement.** Plan puts it as a dismissible top-of-card `warning` notice on
   return to `/mos/login`. Confirm vs a full-screen interstitial (plan recommends the inline notice —
   lower friction, keeps the retry one click away).
```
