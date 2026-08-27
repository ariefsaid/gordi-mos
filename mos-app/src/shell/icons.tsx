// Inline SVG icons lifted verbatim from proposal-IA-8-balanced-myweek.html nav (lines 169–175).
// NFR-002: no icon library; stroke-2, 18px, aria-hidden.

/**
 * The ONE shared disclosure/dropdown chevron (IXD-1/2/3 consistency pass, PR-1).
 * Path `M6 9l6 6 6-6`, stroke-2, round caps, currentColor, aria-hidden. Used by every
 * dropdown/disclosure trigger so the affordance is identical everywhere. Group-collapse
 * carets render this same Chevron rotated −90° via CSS when collapsed (down = expanded).
 * (Never reuse this for sort-direction — that is a distinct shafted arrow, not a chevron.)
 */
export function Chevron({ className, size = 14 }: { className?: string; size?: number }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

/**
 * The ONE back-navigation glyph. A left chevron — `M15 18l-6-6 6-6`, stroke-2, round caps,
 * aria-hidden. The button that hosts it MUST carry an accessible name (aria-label).
 *
 * Its two callers are the record panel's internal Back and the record page's "Back to <collection>"
 * link (#190) — one glyph for one meaning, rather than each chrome defining its own.
 */
export function BackIcon({ className, size = 16 }: { className?: string; size?: number }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

/**
 * The ONE close/dismiss glyph (cohesion-debt 2026-07-19, item #2). Formerly a raw
 * `×`, a raw `✕`, a 16px SVG, and an 18px SVG — four ways to draw the same X.
 * Path `M18 6 6 18M6 6l12 12`, stroke-2, round caps, aria-hidden. The button that
 * hosts it MUST carry an accessible name (aria-label). Default 16px; the deputy
 * panel passes size={18}. Not for delete affordances — those keep their own glyph.
 */
export function CloseIcon({ className, size = 16 }: { className?: string; size?: number }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

export function TasksIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path d="M9 11l3 3 8-8" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  )
}

// PeopleIcon — two persons silhouette, admin nav.
// NFR-002: no icon library; stroke-2, 18px, aria-hidden.
export function PeopleIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

// ObjectiveIcon — concentric target, the yearly goal work rolls up to (cascade catalog).
// NFR-002: no icon library; stroke-2, 18px, aria-hidden.
export function ObjectiveIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </svg>
  )
}

// WorkLineIcon — branching flow, the Project/Process work-system (cascade catalog).
// NFR-002: no icon library; stroke-2, 18px, aria-hidden.
export function WorkLineIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="18" cy="12" r="2.5" />
      <path d="M8.5 6H13a2.5 2.5 0 0 1 2.5 2.5v1M8.5 18H13a2.5 2.5 0 0 0 2.5-2.5v-1" />
    </svg>
  )
}

// HomeIcon — house silhouette, the Home destination (ADR-0019 D2/D8).
// NFR-002: no icon library; stroke-2, 18px, aria-hidden.
export function HomeIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v10h14V10" />
      <path d="M9 20v-6h6v6" />
    </svg>
  )
}

// InboxIcon — a tray, the Inbox destination (not yet rolled in — ADR-0019 D2).
// NFR-002: no icon library; stroke-2, 18px, aria-hidden.
export function InboxIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  )
}

// BudgetIcon — a calculator/receipt, the Plan budget-capture surface (ADR-0022 D1).
// NFR-002: no icon library; stroke-2, 18px, aria-hidden.
export function BudgetIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 3h11l3 3v15H5z" />
      <path d="M8 8h7M8 12h7M8 16h4" />
    </svg>
  )
}

// PricingIcon — a percent tag, the Plan pricing pre-flight surface (ADR-0022 D5).
// NFR-002: no icon library; stroke-2, 18px, aria-hidden.
export function PricingIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <path d="M7 7h.01M8.5 8.5l7 7" />
    </svg>
  )
}

export function SettingsIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  )
}

// ── Redesign Step 2 (T3) — new rail/icon marks. Each is the Work *parent* or a
// destination/Module mark that had no counterpart today; all stroke-2, 18px,
// aria-hidden (NFR-002 convention). Reuse existing marks where a destination
// already had one (HomeIcon/TasksIcon/InboxIcon/ObjectiveIcon/WorkLineIcon).

// WorkIcon — briefcase, the Work *parent* (distinct from the Tasks child checkmark).
export function WorkIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

// EventsIcon — calendar. Icon for the Signals destination root (id 'events', legacy internal
// name — OD-57 original naming; label retired to "Signals" by OD-V4-2). Icon glyph unchanged;
// out of this fix's scope (not named in OD-V4-2, no icon change requested).
export function EventsIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v4M16 3v4" />
    </svg>
  )
}

// SignalsIcon — spark, the Work/Signals child (Rule 1 job).
export function SignalsIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" />
    </svg>
  )
}

// MoneyIcon — a banknote, the Money destination (finance/admin gated).
export function MoneyIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18M15 14h2" />
    </svg>
  )
}

// CafeIcon — a cup, the Café Module (Kitchen re-homed under Café, OD-15).
export function CafeIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17 8h1a4 4 0 0 1 0 8h-1" />
      <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z" />
      <path d="M6 1v3M10 1v3M14 1v3" />
    </svg>
  )
}

// EcommerceIcon — a shopping bag, the Ecommerce Module.
export function EcommerceIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <path d="M3 6h18M16 10a4 4 0 0 1-8 0" />
    </svg>
  )
}

// RoasteryIcon — a roast/bean flame, the Roastery Module.
export function RoasteryIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8.5 14.5A3.5 3.5 0 0 0 12 11a3.5 3.5 0 0 0 3.5 3.5 4.5 4.5 0 1 1-7 0z" />
      <path d="M12 2v3M5 5l2 2M19 5l-2 2M3 11h2M19 11h2" />
    </svg>
  )
}

// ProfileIcon — a person, the Personal Profile utility entry.
export function ProfileIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  )
}

// ShieldIcon — a shield, the Admin Settings utility entry (gated admin).
export function ShieldIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3l8 3v6c0 4.5-3 7.5-8 9-5-1.5-8-4.5-8-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  )
}

// MoreIcon — horizontal dots, the phone bottom-nav "More" affordance.
export function MoreIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </svg>
  )
}

// ── Café child marks (issue 457, part 1). Five screens that all drew `CafeIcon`, which made the
// icon-only compact rail (920–1099.98px) a column of identical cups told apart by tooltip alone.
//
// MINTED, not borrowed. The first attempt gave each child an existing mark and was reverted: two
// of those marks were unique only because their twins sit in `SHIP_GATED_PATHS` today (the
// duplicate returns on switch day), and two duplicated live rows outright. The unclaimed marks in
// this file — a percent tag, a gear, three dots — each buy uniqueness by saying something untrue
// about the screen. DESIGN.md's "no new icon is minted" is scoped to the rail collapse toggle
// (§Rail collapse, the Control row), not a global ban, and there is no iconography section
// forbidding new module marks.
//
// Same idiom as every glyph above: 24-unit viewBox, 18px attribute size (CSS resolves the rung's
// 17px/15px), stroke-2, round cap/join, no fill, aria-hidden.
//
// Uniqueness is held by `rail-glyph-uniqueness.test.tsx`, not by this comment: across the WHOLE
// compact rail AND the phone's More drawer, including entries the ship gate hides today, compared
// by the GEOMETRY each mark draws (`glyph-shape.ts`) rather than by its markup — a mark re-spelled
// into a `<g>`, a `<rect>` or a different path syntax collides with its twin all the same.

// LogIcon — tally marks, the Café Log capture screen: recording how much was actually made.
export function LogIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6.5 5v14M13 5v14" />
      <path d="M19.5 5v14" />
      <path d="M4 17 22 7" />
    </svg>
  )
}

// PlanIcon — a planted flag, the Café Plan screen: the quantities intended before the day starts.
export function PlanIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 21V4" />
      <path d="M6 5h12l-2.5 4L18 13H6z" />
    </svg>
  )
}

// StockIcon — a carton, the Café Stock screen: the goods actually on hand in the stream.
export function StockIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7z" />
      <path d="M3.5 7 12 11.5 20.5 7" />
      <path d="M12 11.5v10" />
    </svg>
  )
}

// ReviewIcon — a check beside a cross, the Café Review screen: the approve/reject decision a lead
// makes on a submitted log. Deliberately the PAIR — a lone check is the Tasks mark and would say
// "done" about a screen whose whole job is that the answer may be no.
export function ReviewIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.5 13 6 16.5 11 6.5" />
      <path d="M14.5 7 21.5 17M21.5 7 14.5 17" />
    </svg>
  )
}

// DispatchIcon — an arrow leaving an enclosure, the Café Pushes screen: production batches handed
// OUT of MOS to the ERP, and the outbox where a stuck one is found.
export function DispatchIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6" />
      <path d="M10 12h11" />
      <path d="m17.5 8.5 4 3.5-4 3.5" />
    </svg>
  )
}
