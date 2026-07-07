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
