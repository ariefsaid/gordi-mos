import type React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { ThemeProvider } from '@/theme/theme-provider'
import { can } from '@/lib/capabilities'
import { ASSIGNABLE_ROLES } from '@/lib/db/admin-users.types'
import type { AccessRole } from '@/lib/database.types'
import { DESTINATIONS, MODULES, UTILITY, type Destination } from './destinations'
import { CAFE_SECTIONS, SECTIONS, ADMIN_SECTIONS, type Section } from './sections'
import { glyphShape } from './glyph-shape'

/**
 * NO NAV SURFACE DRAWS A GLYPH TWICE (issue 457, part 1).
 *
 * In the 920–1099.98px icon-only rail — and under the user's own collapse toggle at any width —
 * the label is `.sr-only` and the icon is the ONLY rendered rung carrier (DD-WAY-33 / #439). Two
 * entries drawing the same mark therefore leave a sighted viewer choosing between identical rows
 * by hover tooltip. Café shipped five children all drawing `CafeIcon`, which is the defect this
 * file closes.
 *
 * **Whole rail, not one group.** The first attempt at 457 guarded `a[href^="/cafe"]` and asserted
 * uniqueness only WITHIN Café; it stayed green while Café's new marks duplicated Work · Tasks and
 * Work · Signals in the same column. Scope here is every link the surface renders, in every zone.
 *
 * **Ship-gated entries included, deliberately.** The same attempt gave Stock the Ecommerce
 * module's bag and Plan the `/work/events` calendar. Both read as unique only because
 * `SHIP_GATED_PATHS` hides their twins TODAY — the duplicate returns on switch day, when nobody is
 * looking at icons. So the gate is mocked OFF here and the assertion covers the rail as it will
 * render once the gate opens. The first test below pins that the mock is really in effect, because
 * a guard whose mock silently stopped working would degrade back into exactly the attempt that was
 * reverted.
 *
 * **BOTH surfaces #457 names.** "Done means" requires the marks rendered and looked at at 1000px
 * AND 390px. The phone has no rail: below 920px the same five Café marks render in the More drawer
 * (`mobile-drawer.tsx` passes `Icon={c.Icon}` for module children), which for kitchen staff is the
 * only nav they ever see. Guarding the rail alone would have left the phone — the surface the
 * issue actually names — with no evidence at all.
 *
 * **The comparison is GEOMETRY, not markup.** It used to be `svg.innerHTML`, whitespace-normalised,
 * which certified spelling: two reviewers each shipped a pixel-identical copy of a mark already in
 * the rail — the Café cup wrapped in a harmless `<g>`, and the Events calendar re-expressed with
 * `<rect x="3.0" …>` and expanded path commands — and this file stayed green through both.
 * `glyphShape` (glyph-shape.ts) canonicalises what the `<svg>` DRAWS: every shape element wherever
 * it sits in the tree, primitives converted to path data, paths made absolute and shorthand-free,
 * coordinates quantised as fractions of the viewBox, subpaths sorted. Two marks that draw the same
 * picture now collide however they are spelled.
 */

vi.mock('@/lib/ship-gate', () => ({
  SHIP_GATED_PATHS: [] as readonly string[],
  isShipGated: () => false,
}))

vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'
const mockUseAuth = vi.mocked(useAuth)

vi.mock('@/lib/db/notifications', () => ({
  countUnread: vi.fn().mockResolvedValue(0),
  listNotifications: vi.fn().mockResolvedValue([]),
}))

import { RailNav } from './rail-nav'
import { MobileDrawer } from './mobile-drawer'

// ── the viewer who sees the most ────────────────────────────────────────────────────────────────

/**
 * DERIVED, not restated. This was a hand-typed literal of six role slugs, and a reviewer proved
 * the cost: a rail row gated behind a new `auditor` role fell silently outside the sweep and all
 * three tests stayed green while it drew the Café cup.
 *
 * Two sources, unioned, because neither alone is sufficient:
 *
 *  1. `ASSIGNABLE_ROLES` — the app's own runtime spelling of the access-role vocabulary, and the
 *     closest thing to a canonical export. The truly canonical statement is the DATABASE domain
 *     `shared.access_role` (…0824000004_shared_access_role_domain.sql, "the ONE statement of the
 *     set", #216); its client mirror is the `AccessRole` TYPE in `lib/database.types.ts`, which is
 *     compile-time only and cannot be iterated. RESIDUAL GAP, closed as far as types can close it:
 *     the exhaustiveness check below fails `npm run typecheck` if `AccessRole` grows a value that
 *     `ASSIGNABLE_ROLES` lacks, so the two cannot drift. What no test here can see is a role added
 *     to the DB domain and to neither of them — that gap belongs to the DB↔client mirror, not to
 *     this guard, and `shared_05_access_roles.sql` is where it is held.
 *
 *  2. Every role named in a nav declaration's `anyOf`, harvested from the registries themselves.
 *     This is what actually closes the reviewer's mutation: a row gated on a role outside the
 *     vocabulary is still swept, because the gate that hides it is the thing being read.
 */
type RolesMissingFromVocabulary = Exclude<AccessRole, (typeof ASSIGNABLE_ROLES)[number]>
// Fails typecheck (not this test) the moment `AccessRole` names a role `ASSIGNABLE_ROLES` omits.
const _vocabularyCoversEveryAccessRole: [RolesMissingFromVocabulary] extends [never] ? true : never = true
void _vocabularyCoversEveryAccessRole

/** Every destination the nav registries declare, across all three rail zones. */
const ALL_DESTINATIONS: Destination[] = [...DESTINATIONS, ...MODULES.flatMap((g) => g.items), ...UTILITY]
/** Every section any nav surface can render, including ones reached only as a destination's child. */
const ALL_SECTIONS: Section[] = [
  ...ALL_DESTINATIONS.flatMap((d) => [...d.links, ...(d.children ?? [])]),
  ...CAFE_SECTIONS,
  ...SECTIONS,
  ...ADMIN_SECTIONS,
]

/** Role slugs named by any access-role gate in the registries — whether or not they are vocabulary. */
const DECLARED_GATE_ROLES: string[] = [
  ...ALL_DESTINATIONS.flatMap((d) => d.anyOf ?? []),
  ...ALL_SECTIONS.flatMap((s) => s.anyOf ?? []),
]
/** Capability slugs named by any capability gate in the registries. */
const DECLARED_GATE_CAPABILITIES: string[] = ALL_SECTIONS.flatMap((s) => (s.capability ? [s.capability] : []))

const OMNISCIENT_ROLES: string[] = [...new Set([...ASSIGNABLE_ROLES, ...DECLARED_GATE_ROLES])]

function setOmniscientViewer() {
  mockUseAuth.mockReturnValue({
    status: 'authenticated',
    viewer: {
      person: {
        id: 'p1', org_id: 'o1', user_id: 'u1', full_name: 'Director Viewer',
        email: 'd@example.test', archived_at: null, must_change_password: false,
        created_at: '', updated_at: '',
      },
      // A job-role NAME that matches no module's `workMatch`. That regex no longer decides
      // VISIBILITY (OD-WAY-51), but it still decides which module the phone promotes to a bottom
      // tab — and the drawer omits the promoted module's own row, since the bottom bar already
      // owns it. A non-matching name promotes nothing, so the drawer renders its MAXIMAL set:
      // every module parent AND every child. Any promoted-module drawer is a subset of that, and a
      // subset of a duplicate-free set is duplicate-free.
      roles: [{ id: 'r1', org_id: 'o1', business_unit_id: 'bu1', name: 'Director Viewer', reports_to_role_id: null, created_at: '', updated_at: '' }],
      isManager: true,
      accessRoles: OMNISCIENT_ROLES,
    },
    signOut: vi.fn(),
  })
}

// ── rendering ───────────────────────────────────────────────────────────────────────────────────

function wrap(children: React.ReactNode) {
  return (
    <ThemeProvider>
      <I18nProvider>
        <MemoryRouter initialEntries={['/cafe/log']}>{children}</MemoryRouter>
      </I18nProvider>
    </ThemeProvider>
  )
}

interface RailLink {
  href: string
  label: string
  glyph: string
}

/** The rendered mark of one link: the canonical geometry of its `<svg>`. */
function glyphOf(link: HTMLElement): string {
  const svg = link.querySelector('svg')
  expect(svg, `link ${link.getAttribute('href')} renders no glyph at all`).not.toBeNull()
  return glyphShape(svg!)
}

function linksWithin(nav: HTMLElement): RailLink[] {
  return within(nav)
    .getAllByRole('link')
    .map((link) => ({
      href: link.getAttribute('href') ?? '',
      // compact items carry the label in `data-label` (the CSS tooltip) or `.sr-only` text.
      label: link.getAttribute('data-label') ?? link.textContent ?? '',
      glyph: glyphOf(link as HTMLElement),
    }))
}

/** Every link the 920–1099.98px icon-only rail renders, paired with the mark it draws. */
async function compactRailGlyphs(): Promise<RailLink[]> {
  render(wrap(<RailNav compact />))
  // The rail's Inbox badge fires a mocked async read on mount; flush it so its resolve does not
  // land outside act() and print a warning over an otherwise clean run.
  await act(async () => {})
  return linksWithin(screen.getByRole('navigation', { name: 'Primary' }))
}

/** Every link the ≤390px More drawer renders — the phone's only nav to a module's own screens. */
function phoneDrawerGlyphs(): RailLink[] {
  render(wrap(<MobileDrawer open onClose={vi.fn()} />))
  return linksWithin(screen.getByRole('navigation', { name: 'More destinations' }))
}

function duplicates(links: readonly RailLink[]): string[][] {
  const byGlyph = new Map<string, string[]>()
  for (const l of links) byGlyph.set(l.glyph, [...(byGlyph.get(l.glyph) ?? []), l.href])
  return [...byGlyph.values()].filter((hrefs) => hrefs.length > 1)
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  setOmniscientViewer()
})

// ── the sweep is real ───────────────────────────────────────────────────────────────────────────

describe('the omniscient viewer really is omniscient', () => {
  // Vacuity guards for the role derivation itself. Every negative below is only worth what these
  // are worth: a sweep that quietly stopped reading the gates would hide rows from itself, which
  // is the defect a reviewer proved against the hand-typed role list.
  it('holds every access role the vocabulary knows, and every role a nav gate names', () => {
    for (const role of ASSIGNABLE_ROLES) expect(OMNISCIENT_ROLES).toContain(role)
    // The harvest found the gates at all. If `anyOf` were renamed or the registries restructured,
    // this list would silently empty and the union would shrink back to the vocabulary alone.
    expect(DECLARED_GATE_ROLES.length, 'no access-role gate found in the nav registries').toBeGreaterThan(0)
    for (const role of DECLARED_GATE_ROLES) expect(OMNISCIENT_ROLES).toContain(role)
  })

  it('is granted every capability a nav gate names', () => {
    // Same class of hole on the other axis: a row behind a capability nobody holds drops out of
    // the sweep as silently as a row behind an unknown role.
    expect(DECLARED_GATE_CAPABILITIES.length, 'no capability gate found in the nav registries').toBeGreaterThan(0)
    for (const capability of DECLARED_GATE_CAPABILITIES) {
      expect(can(OMNISCIENT_ROLES, capability), `no role in the sweep grants "${capability}"`).toBe(true)
    }
  })
})

// ── the compact rail (1000px) ───────────────────────────────────────────────────────────────────

describe('compact rail glyphs (issue 457 part 1)', () => {
  it('renders the whole rail — every zone, and the gate really is off', async () => {
    const links = await compactRailGlyphs()
    const hrefs = links.map((l) => l.href)

    // Derived from the declarations, not a magic number. A hardcoded floor goes red when an
    // unrelated branch MOVES a row out of the rail — #480 moves Personal Profile into the identity
    // menu — which is neither a duplicate nor this guard's business. What this guard must refuse is
    // a rail that shrank to nothing, so it tracks the source of truth instead of a constant.
    const MIN_LINKS =
      DESTINATIONS.length +
      DESTINATIONS.reduce((n, d) => n + (d.children?.length ?? 0), 0) +
      MODULES.reduce((n, m) => n + m.items.length, 0) +
      CAFE_SECTIONS.length
    expect(links.length).toBeGreaterThanOrEqual(MIN_LINKS)

    // Every zone is represented, so "unique" is a claim about the whole column. Named routes are
    // limited to ones whose PRESENCE is the point; membership of the utility zone is in flux, so
    // it is asserted by zone rather than by naming a row that may legitimately move.
    expect(hrefs).toEqual(expect.arrayContaining(['/', '/work/tasks', '/inbox', '/cafe']))
    expect(hrefs.some((h) => h.startsWith('/admin'))).toBe(true)
    expect(hrefs).toEqual(expect.arrayContaining(['/cafe/log', '/cafe/plan', '/cafe/stock', '/cafe/review', '/cafe/pushes']))

    // THE GATE IS OFF. These four are in SHIP_GATED_PATHS today; each is the twin of a mark the
    // reverted attempt borrowed. If this assertion ever fails, the mock has stopped working and
    // the uniqueness claim below has quietly shrunk back to today's visible rail.
    expect(hrefs, 'ship-gate mock is not in effect').toEqual(
      expect.arrayContaining(['/work/events', '/money', '/ecommerce', '/roastery']),
    )

    // Compact regime, not the full-width rail: every link is icon-only.
    for (const l of links) expect(l.glyph, `${l.href} draws nothing`).not.toBe('')
  })

  it('no two rail entries draw the same mark', async () => {
    const collisions = duplicates(await compactRailGlyphs())
    expect(collisions, 'rail entries drawing the same picture in the icon-only regime').toEqual([])
  })

  it("each Café child's mark is its own, and none of them is the module's cup", async () => {
    const links = await compactRailGlyphs()
    const cup = links.find((l) => l.href === '/cafe')?.glyph
    expect(cup, 'the Café module link is missing').toBeTruthy()
    const children = links.filter((l) => l.href.startsWith('/cafe/'))
    expect(children.map((c) => c.href).sort()).toEqual(
      ['/cafe/log', '/cafe/plan', '/cafe/pushes', '/cafe/review', '/cafe/stock'],
    )
    for (const child of children) {
      expect(child.glyph, `${child.href} draws the Café cup`).not.toBe(cup)
    }
  })
})

// ── the phone More drawer (390px) ───────────────────────────────────────────────────────────────

describe('phone drawer glyphs (issue 457 "done means", 390px)', () => {
  it('renders the drawer whole — every zone, module parents included, gate off', () => {
    const links = phoneDrawerGlyphs()
    const hrefs = links.map((l) => l.href)

    // The drawer is icon+label on every row, so a duplicate here is less severe than in the
    // icon-only rail — but it is the SAME five marks, on the surface #457 names, and the only nav
    // a phone has to a module's own screens.
    expect(hrefs).toEqual(expect.arrayContaining(['/', '/work/tasks', '/inbox']))
    expect(hrefs.some((h) => h.startsWith('/admin'))).toBe(true)
    // The maximal drawer: no module is promoted for this viewer, so Café's own row renders here
    // alongside all five children. If a promoted module ever crept back into the fixture this
    // would go red rather than quietly shrinking the sweep.
    expect(hrefs).toEqual(
      expect.arrayContaining(['/cafe', '/cafe/log', '/cafe/plan', '/cafe/stock', '/cafe/review', '/cafe/pushes']),
    )
    // Same ship-gate vacuity check the rail carries: without it, "unique" would be a claim about
    // today's visible drawer rather than the one switch day produces.
    expect(hrefs, 'ship-gate mock is not in effect').toEqual(
      expect.arrayContaining(['/work/events', '/money', '/ecommerce', '/roastery']),
    )
    for (const l of links) expect(l.glyph, `${l.href} draws nothing`).not.toBe('')
  })

  it('no two drawer entries draw the same mark', () => {
    const collisions = duplicates(phoneDrawerGlyphs())
    expect(collisions, 'drawer entries drawing the same picture').toEqual([])
  })

  it("each Café child's mark is its own on the phone too", () => {
    const links = phoneDrawerGlyphs()
    const cup = links.find((l) => l.href === '/cafe')?.glyph
    expect(cup, 'the Café module row is missing from the drawer').toBeTruthy()
    const children = links.filter((l) => l.href.startsWith('/cafe/'))
    expect(children.map((c) => c.href).sort()).toEqual(
      ['/cafe/log', '/cafe/plan', '/cafe/pushes', '/cafe/review', '/cafe/stock'],
    )
    for (const child of children) {
      expect(child.glyph, `${child.href} draws the Café cup`).not.toBe(cup)
    }
  })
})
