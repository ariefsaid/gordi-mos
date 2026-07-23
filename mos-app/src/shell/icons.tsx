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
 * The ONE back-navigation glyph (P1-2, docs/reviews Luna finding — consolidated out of
 * record-panel-host.tsx's identical local definition, Rule 11). A left chevron — `M15 18l-6-6
 * 6-6`, stroke-2, round caps, aria-hidden, mirrors E7's `‹` panel-back affordance. The button
 * that hosts it MUST carry an accessible name (aria-label).
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

export function MyWeekIcon() {
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
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18" />
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

export function UpdatesIcon() {
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
      <path d="M4 4h16v16H4z" />
      <path d="M8 9h8M8 13h5" />
    </svg>
  )
}

export function OpsIcon() {
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
      <path d="M12 6v6l4 2" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  )
}

// KitchenIcon — chef's hat silhouette, stroke-based, 18px, currentColor.
// NFR-002: no icon library; same stroke-2/aria-hidden convention as the other nav icons.
export function KitchenIcon() {
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
      {/* Chef's hat: dome + brim bar */}
      <path d="M6 14V19H18V14" />
      <path d="M6 14C4 14 3 12.5 3 11C3 9 4.5 7.5 6.5 7.5C6.8 5.5 8.7 4 11 4C13 4 14.7 5 15.5 6.5C15.7 6.5 15.8 6.5 16 6.5C17.7 6.5 19 7.8 19 9.5C19 11 18 12.5 16 13.5" />
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

// SalesIcon — a rising trend line, the sales-reporting dashboard (Issue 1).
// NFR-002: no icon library; stroke-2, 18px, aria-hidden.
export function SalesIcon() {
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
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
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

// PlanIcon — a checklist/map, the Plan destination (not yet rolled in — ADR-0019 D2).
// NFR-002: no icon library; stroke-2, 18px, aria-hidden.
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
      <path d="M9 4h11v16H9z" />
      <path d="M4 4h2v2H4zM4 11h2v2H4zM4 18h2v2H4z" />
      <path d="M13 8h4M13 13h4" />
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

// EventsIcon — calendar, the Events destination root (OD-57).
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
