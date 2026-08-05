import { NavLink } from 'react-router-dom'
import { DESTINATIONS, UTILITY, isLive, modulesByBU, type Destination } from './destinations'
import { visibleSections, type Section } from './sections'
import type { MessageKey } from '@/i18n/messages'
import type { RailCounts } from '@/lib/db/rail-counts'
import { UserChip } from './user-chip'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { useUnreadCount } from '@/hooks/useUnreadCount'
import './rail-nav.css'

// E7 Work sub-section grammar (e7-views.js `workNavModel`) ported to our ratified IA: OD-REDESIGN-1
// fixes WHICH Work children exist (do not add/remove); E7 fixes the sub-section overlines + order
// that group them. Each of our 4 children maps to the E7 family that owns it, and the families
// render in E7's top-down order — Execution → Work systems → Direction → Cadence. (E7's Execution
// also holds Process Runs, Work systems also holds Processes + Standards, Cadence also holds
// Follow-ups; those entries are not in our IA, so each of our families carries only the child we
// have.) Per-item counts (E7's `.e7-count` badges) are wired for TWO items only — Tasks (open
// count) and Signals (needs-attention count) — from ONE cheap shell-level aggregate (rail.tsx →
// useRailCounts, a single mount-time fetch, no polling). Every other child omits its badge: they
// have no already-loaded source, and the owner-artifact note forbids a query per item.
const WORK_SUBSECTIONS: { labelKey: MessageKey; paths: readonly string[] }[] = [
  { labelKey: 'rail.work.execution', paths: ['/work/tasks'] },
  { labelKey: 'rail.work.workSystems', paths: ['/work/projects'] },
  { labelKey: 'rail.work.direction', paths: ['/work/objectives'] },
  { labelKey: 'rail.work.cadence', paths: ['/work/signals'] },
]

// The ONE render seam for the rail count badges: which path shows which count (undefined → no badge).
function badgeCountFor(path: string, counts?: RailCounts | null): number | undefined {
  if (!counts) return undefined
  if (path === '/work/tasks') return counts.openTasks
  if (path === '/work/signals') return counts.attentionSignals
  return undefined
}

// DO-18(d) (census-sweep R2 tasks FINDING5, a11y half): the badge's accessible NAME — a naked
// aria-hidden number told screen-reader users nothing. The label states what the count counts
// (what the code fetches: open Tasks / needs-attention Signals); the rail-vs-page count
// reconciliation stays FLAG-2 (owner ruling pending).
function badgeLabelKeyFor(path: string): MessageKey | undefined {
  if (path === '/work/tasks') return 'rail.badge.openTasks'
  if (path === '/work/signals') return 'rail.badge.attentionSignals'
  return undefined
}

type RailNavProps = {
  onNavigate?: () => void
  /** Rail badge counts (open Tasks · needs-attention Signals). Undefined/null → no badges. */
  counts?: RailCounts | null
  /** OD-REDESIGN-84.2 (P1-1): the 920–1099.98px icon-only regime. Default false (full-width rail). */
  compact?: boolean
}

// Rail item chrome. Active state ports e7's selected treatment (DESIGN-FIDELITY-1, 2026-07-18):
// e7 selected = blue wash + blue text + weight 600, ~36px tall, 10px inline padding. The old
// `bg-accent` resolved to --surface-secondary — the SAME warm-grey as the rail panel bg, so the
// selection was invisible (zero contrast). Now a blue tint (--ds-color-blue3) on the panel + The
// One Blue text. itemBase owns the active color so inner label spans don't re-set text-foreground.
// SYS-4 (backfill census, MEDIUM): the active text is the theme-aware --text-on-accent-tint, NOT
// Tailwind text-primary. text-primary is the theme-invariant mid-blue (--ds-color-blue); on the
// dark blue3 pill it dropped to 2.9:1. The token is mid-blue in light (identical render) and a
// light-blue in dark (7.7:1). Applied to the <a> and the active icon span; the trailing count
// badge keeps its own explicit text-muted-foreground.
// `compact` = the OD-REDESIGN-84.2 (P1-1) icon-only regime: center the icon, drop the
// item's horizontal padding (the label collapses to zero visual width), and tag a
// `rail-tooltip-target` class so the CSS-only hover/focus-visible tooltip (rail-nav.css)
// can surface the label back via `data-label` — no extra DOM node.
// FINDING 3 (v4 shell a11y audit, 2026-07-27): the rail is desktop chrome sized to the
// DESIGN.md-ratified 36px nav-item ("Navigation — Rail: Nav item: 36px tall") for a fine
// pointer (mouse) — that spec stays authoritative here, unchanged. `rail-item` is a stable
// hook for a `(pointer: coarse)` override in rail-nav.css that raises touch laptops/tablets
// to the >=44px target floor without touching the documented mouse-regime height.
const itemBase = (isActive: boolean, compact = false) =>
  [
    'rail-item',
    'relative flex items-center gap-[10px] h-9 rounded-sm no-underline text-sm',
    compact ? 'justify-center px-0 rail-tooltip-target' : 'px-2.5',
    isActive
      ? 'bg-[color:var(--ds-color-blue3)] font-semibold text-[color:var(--text-on-accent-tint)]'
      : 'font-normal text-muted-foreground hover:bg-accent/60',
  ].join(' ')

// A destination rail item: NavLink to its primaryPath, labelled by the destination
// labelKey (e.g. "Admin Settings", "Money"), default aria-current="page" (Rule 5).
// H1 fix (design audit, 2026-07-27): `badge`/`badgeLabelKey` are optional — wired ONLY for Inbox
// (unread count) below — and follow the EXACT WorkChild pattern (DO-18(d)): the accessible NAME
// is built on the link itself by joining the already-localized label + badge sentence, so AT
// never concatenates the two with no separator (the "Tugas12" run-together defect this guards).
function DestLink({ d, onNavigate, compact = false, badge, badgeLabelKey, parentOfChildren = false }: { d: Destination; onNavigate?: () => void; compact?: boolean; badge?: number; badgeLabelKey?: MessageKey; parentOfChildren?: boolean }) {
  const t = useT()
  const to = d.primaryPath ?? d.links[0].path
  const label = t(d.labelKey)
  const badgeLabel = badge !== undefined && badge > 0 && badgeLabelKey ? t(badgeLabelKey, { count: badge }) : undefined
  const accessibleName = badgeLabel ? `${label}, ${badgeLabel}` : undefined
  return (
    <NavLink
      to={to}
      end={to === '/'}
      onClick={onNavigate}
      aria-label={accessibleName}
      // Rule 5: exactly one aria-current="page" in the rail. A parent that renders its own
      // children is a LOCATION, never the page — the active child carries "page". Work sets this
      // explicitly in its own branch; a module with children needs the same, or at /cafe/log both
      // the Café parent (prefix match) and the Log child would claim "page".
      aria-current={parentOfChildren ? 'location' : undefined}
      data-label={compact ? label : undefined}
      className={({ isActive }) => itemBase(isActive, compact)}
    >
      {({ isActive }) => (
        <>
          <span className={isActive ? 'text-[color:var(--text-on-accent-tint)]' : 'text-muted-foreground'}>
            <d.Icon />
          </span>
          <span className={compact ? 'sr-only' : undefined}>{label}</span>
          <RailCountBadge count={badge} label={badgeLabel} compact={compact} />
        </>
      )}
    </NavLink>
  )
}

// Rail group label (F2 fix, DESIGN.md Navigation/Rail: "Grouped items under Overline group
// labels"; DESIGN.md Overline spec: DM Sans 600 11px, ls 0.06em, UPPERCASE, muted-foreground).
// aria-hidden — the label is a visual section divider, not itself a nav landmark; each group's
// items remain directly reachable in document order (no extra tab stop, matches AppearanceControl's
// group-label precedent in the identity menu).
function RailGroupLabel({ children, className }: { children: string; className?: string }) {
  return (
    <div
      className={['px-2.5 text-muted-foreground select-none uppercase', className].filter(Boolean).join(' ')}
      style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', paddingBottom: 4, paddingTop: 2 }}
      aria-hidden="true"
    >
      {children}
    </div>
  )
}

// Work sub-section overline (E7 `.e7-sub-label`) — quieter + smaller than the top-level rail
// overline (10px vs 11px, lighter), so the sub-grouping reads as a level below Destinations.
// aria-hidden for the same reason as RailGroupLabel: a visual divider, not a nav landmark; the
// child links stay directly reachable in document order (no extra tab stop). Rendered ONLY when
// its family groups ≥2 items (item 2 — impeccable ban-eyebrow-on-every-section); a lone-child
// family shows the child with no eyebrow. Dormant under today's single-item IA, live once a
// second sibling ships into any family.
function WorkSubLabel({ children }: { children: string }) {
  return (
    <div
      className="px-2.5 text-muted-foreground/80 select-none uppercase"
      style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', paddingTop: 6, paddingBottom: 2 }}
      aria-hidden="true"
    >
      {children}
    </div>
  )
}

// A quiet E7 count badge (`.e7-nav-item .e7-count`): margin-left auto, pill, muted neutral fill,
// tabular digits. Rendered ONLY for a positive count (zero/undefined → nothing, E7 quiet rule).
// `compact` (P1-1): no room beside a hidden label, so the badge pins to the icon's corner instead
// (rail-count-badge--compact, rail-nav.css) — still quiet, still omitted at zero/undefined.
// DO-18(d): with a `label` the badge is EXPOSED to AT under that name (aria-label replaces the
// naked digit in the accname); without one it stays a hidden redundant glance cue.
// Exported (H1/H8 fix, design audit 2026-07-27) so bottom-tab-bar.tsx can put the SAME quiet
// count-badge on the phone Inbox tab instead of inventing a second badge component/visual.
export function RailCountBadge({ count, label, compact = false }: { count?: number; label?: string; compact?: boolean }) {
  if (count === undefined || count <= 0) return null
  return (
    <span
      className={
        compact
          ? 'rail-count-badge--compact inline-flex items-center justify-center rounded-full font-semibold text-muted-foreground bg-[color:var(--secondary)] tabular-nums'
          : 'ml-auto inline-flex items-center h-[18px] px-[7px] rounded-full text-[11px] font-semibold text-muted-foreground bg-[color:var(--secondary)] tabular-nums'
      }
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
    >
      {count}
    </span>
  )
}

// A Work child (always expanded). Default aria-current="page" when active.
function WorkChild({ section, onNavigate, badge, badgeLabelKey, compact = false }: { section: Section; onNavigate?: () => void; badge?: number; badgeLabelKey?: MessageKey; compact?: boolean }) {
  const t = useT()
  const label = section.labelKey ? t(section.labelKey) : section.label
  const badgeLabel = badge !== undefined && badge > 0 && badgeLabelKey ? t(badgeLabelKey, { count: badge }) : undefined
  // FINDING 2 (v4 shell a11y audit, 2026-07-27): the visible label span and the badge's own
  // aria-label span are adjacent DOM nodes with no whitespace between them, so AT concatenates
  // them with no separator — measured live as "Tugas12" / "Sinyal2". An explicit aria-label on
  // the LINK is the accessible name once present (subtree text alternatives are then ignored),
  // built by joining the SAME already-localized label + rail.badge.* sentence already computed
  // above — no new i18n keys, just a natural-reading combination of existing strings.
  const accessibleName = badgeLabel ? `${label}, ${badgeLabel}` : undefined
  return (
    <NavLink
      to={section.path}
      onClick={onNavigate}
      aria-label={accessibleName}
      data-label={compact ? label : undefined}
      className={({ isActive }) => itemBase(isActive, compact)}
    >
      {() => (
        /* B2 (owner sketch, ratified 2026-07-18): at full width, Work children are PLAIN
           indented labels — the sketch showed no icons; the icons were a builder default
           parked in a scorecard footnote (parity-sweep axis-2 finding B2). That ratified
           full-width treatment is UNCHANGED here. The compact icon rail (P1-1) is a
           different regime with no room for a label at all — RATIFY-BEFORE-MERGE: it reuses
           the SAME `section.Icon` already carried for the bottom-nav/⌘K (Rule 11), so a
           Work child is reachable/identifiable in the 72px rail instead of an icon-less
           blank row. The full-width rail never renders this icon — only the compact regime
           does. The optional count badge (Tasks · Signals) sits at the trailing edge
           (ml-auto) at full width, or pinned to the icon's corner when compact. */
        <>
          {compact && (
            <span className="text-muted-foreground">
              <section.Icon />
            </span>
          )}
          <span className={compact ? 'sr-only' : undefined}>{label}</span>
          <RailCountBadge count={badge} label={badgeLabel} compact={compact} />
        </>
      )}
    </NavLink>
  )
}

export function RailNav({ onNavigate, counts, compact = false }: RailNavProps) {
  const auth = useAuth()
  const t = useT()
  // H1 fix (design audit, 2026-07-27): Inbox's unread badge — the SAME cheap, dedicated,
  // unread-only read the header bell already uses (useUnreadCount → countUnread, backed by the
  // owner-unread index), not a per-render full-list count. Fetched once per shell mount like the
  // rest of the rail's counts; no polling.
  const { unreadCount } = useUnreadCount()

  const accessRoles: string[] = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  const viewer = auth.status === 'authenticated' ? auth.viewer : null
  const liveDestinations = DESTINATIONS.filter((d) => isLive(d, accessRoles))
  // Both Utility entries render as ordinary rail links now: Admin Settings (gated) and Personal
  // Profile (security audit fix — the footer below is the identity/sign-out chip, not a /profile
  // link, so /profile needs its own reachable rail entry to stay navigable, Rule 11).
  const liveUtility = UTILITY.filter((u) => isLive(u, accessRoles))
  // F2 fix (grouped IA spine, OD-REDESIGN-1 + DESIGN.md Navigation/Rail — "Grouped items under
  // Overline group labels"): the rail shows YOUR work, grouped by BU (Retail Ops / B2B Ops),
  // only for viewers whose job role belongs to that BU. Org-wide roles get no module group at
  // all. Supersedes OD-REDESIGN-68's flat/no-overline rendering, which CLAUDE.md's
  // owner-artifact-deviations note records as an undetected deviation from the owner's actual
  // artifact (OD-68, 2026-07-18) — DESIGN.md's rail spec and OD-REDESIGN-1's own text both call
  // for grouped overlines, so the flat rendering was never a ratified end-state.
  const myModuleGroups = viewer
    ? modulesByBU(accessRoles)
    : []

  return (
    <>
      <nav aria-label="Primary" className="flex flex-1 flex-col px-2 pt-3">
        {!compact && <RailGroupLabel>{t('rail.destinations')}</RailGroupLabel>}
        <div className="flex flex-col gap-[2px] rail-item-list">
          {liveDestinations.map((d) => {
            if (d.id === 'work') {
              // Work parent: aria-current="location" when any /work/* route is active
              // (Rule 5 — parent never carries "page"; the active child does). `to="/work"`
              // matches every /work/* descendant so the parent is "active" across all children.
              const children = visibleSections(d.children ?? [], accessRoles)
              const workLabel = t(d.labelKey)
              return (
                <div key={d.id}>
                  <NavLink
                    to="/work"
                    aria-current="location"
                    onClick={onNavigate}
                    data-label={compact ? workLabel : undefined}
                    className={({ isActive }) => itemBase(isActive, compact)}
                  >
                    {({ isActive }) => (
                      <>
                        <span className={isActive ? 'text-[color:var(--text-on-accent-tint)]' : 'text-muted-foreground'}>
                          <d.Icon />
                        </span>
                        <span className={compact ? 'sr-only' : undefined}>{workLabel}</span>
                      </>
                    )}
                  </NavLink>
                  {/* Always-expanded children, grouped by the E7 Work sub-section families
                      (workNavModel grammar): Execution · Work systems · Direction · Cadence, in E7's
                      top-down order. A family's overline is DECORATIVE unless it actually groups
                      more than one item — item 2 (impeccable ban-eyebrow-on-every-section): a
                      sub-section overline renders ONLY when its family holds ≥2 visible items. With
                      today's IA each family carries exactly one child (the sibling entries — Process
                      Runs, Processes/Standards, Follow-ups — aren't in our IA yet), so NO eyebrows
                      render: the children read as one clean indented list. The grammar auto-returns
                      the moment a family gains a second item. Order is preserved either way, and each
                      child stays one reachable link (the overline, when shown, is an aria-hidden
                      divider). A capability-gated child (Projects & Processes, Objectives) that
                      filters out empties its family, which then renders nothing. */}
                  <div className={compact ? 'flex flex-col gap-[2px] rail-item-list' : 'flex flex-col gap-[2px] rail-item-list pl-3'}>
                    {WORK_SUBSECTIONS.map((sub) => {
                      const items = children.filter((c) => sub.paths.includes(c.path))
                      if (items.length === 0) return null
                      // Compact icon rail (P1-1): group overlines hide unconditionally — there is
                      // no room for a sub-section eyebrow once the item itself is icon-only.
                      const showOverline = !compact && items.length >= 2
                      return (
                        <div key={sub.labelKey} className="flex flex-col gap-[2px] rail-item-list">
                          {showOverline && <WorkSubLabel>{t(sub.labelKey)}</WorkSubLabel>}
                          {items.map((c) => (
                            <WorkChild key={c.path} section={c} onNavigate={onNavigate} badge={badgeCountFor(c.path, counts)} badgeLabelKey={badgeLabelKeyFor(c.path)} compact={compact} />
                          ))}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            }
            // H1 fix (design audit, 2026-07-27): Inbox is the only Destination-zone item that
            // carries a count badge — reuses the same DestLink badge slot Work children already
            // have, just scoped to this one id.
            return d.id === 'inbox' ? (
              <DestLink key={d.id} d={d} onNavigate={onNavigate} compact={compact} badge={unreadCount} badgeLabelKey="rail.badge.unreadInbox" />
            ) : (
              <DestLink key={d.id} d={d} onNavigate={onNavigate} compact={compact} />
            )
          })}
        </div>

        {/* Your-work modules (F2 fix), grouped by BU overline (OD-REDESIGN-1: "Modules grouped
            by Business Unit") — only the modules whose BU matches the viewer's job role. Empty
            for org-wide roles (no group renders at all). Compact (P1-1): group overlines hide. */}
        {myModuleGroups.map((g) => (
          <div key={g.bu} className="mt-3">
            {!compact && <RailGroupLabel>{t(g.bu)}</RailGroupLabel>}
            <div className="flex flex-col gap-[2px] rail-item-list">
              {g.items.map((m) => {
                // A module with children renders them the same way Work does — an always-expanded
                // indented list — minus Work's E7 sub-section overlines, which are Work's own
                // grammar. Café is the module that has them; the rest fall through to a single
                // link exactly as before. Without this the module's `children` are dead data and
                // its screens have no nav entry at all.
                const kids = visibleSections(m.children ?? [], accessRoles)
                return (
                  <div key={m.id}>
                    <DestLink d={m} onNavigate={onNavigate} compact={compact} parentOfChildren={kids.length > 0} />
                    {kids.length > 0 && (
                      <div className={compact ? 'flex flex-col gap-[2px] rail-item-list' : 'flex flex-col gap-[2px] rail-item-list pl-3'}>
                        {kids.map((c) => (
                          <WorkChild key={c.path} section={c} onNavigate={onNavigate} compact={compact} />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {/* Utility — Admin Settings (gated) and Personal Profile. The footer below is the
            identity/sign-out chip, not a nav link, so /profile needs its own entry here. mt-3
            matches the group rhythm above (Destinations / BU module overlines). */}
        {liveUtility.map((u, i) => (
          <div key={u.id} className={`rail-item-list-item ${i === 0 ? 'mt-3' : 'mt-1'}`}>
            <DestLink d={u} onNavigate={onNavigate} compact={compact} />
          </div>
        ))}
      </nav>

      {/* Identity + sign-out footer row (security audit HIGH-1, 2026-07-17). The redesign had
          reduced this row to a bare NavLink showing only "{site} {role}" with no way to sign out —
          on shared café/kitchen terminals a stale session became invisible AND unterminable. Reuses
          the existing UserChip (Rule 11 — no new component): the 'rail' variant shows the viewer's
          full NAME + role and opens a menu with Sign out (handleSignOut is unchanged). /profile
          itself moved to a normal Utility rail link above (see liveUtility). Compact (P1-1): the
          chip collapses to the avatar only (UserChip's existing `compact` prop, previously only
          wired for the <920px header variant). */}
      {viewer && (
        <div className="px-2 pb-1">
          <UserChip variant="rail" compact={compact} />
        </div>
      )}
    </>
  )
}

export type { Destination }
