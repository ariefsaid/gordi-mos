import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { ThemeProvider } from '@/theme/theme-provider'
import { DESTINATIONS, MODULES } from './destinations'
import { CAFE_SECTIONS } from './sections'

/**
 * THE COMPACT RAIL DRAWS NO GLYPH TWICE (issue 457, part 1).
 *
 * In the 920–1099.98px icon-only regime — and under the user's own collapse toggle at any width —
 * the label is `.sr-only` and the icon is the ONLY rendered rung carrier (DD-WAY-33 / #439). Two
 * rail entries drawing the same mark therefore leave a sighted viewer choosing between identical
 * rows by hover tooltip. Café shipped five children all drawing `CafeIcon`, which is the defect
 * this file closes.
 *
 * **Whole rail, not one group.** The first attempt at 457 guarded `a[href^="/cafe"]` and asserted
 * uniqueness only WITHIN Café; it stayed green while Café's new marks duplicated Work · Tasks and
 * Work · Signals in the same column. Scope here is every link the rail renders, in every zone.
 *
 * **Ship-gated entries included, deliberately.** The same attempt gave Stock the Ecommerce
 * module's bag and Plan the `/work/events` calendar. Both read as unique only because
 * `SHIP_GATED_PATHS` hides their twins TODAY — the duplicate returns on switch day, when nobody is
 * looking at icons. So the gate is mocked OFF here and the assertion covers the rail as it will
 * render once the gate opens. `assertsTheGateIsActuallyOff` below pins that, because a guard whose
 * mock silently stopped working would degrade back into exactly the attempt that was reverted.
 *
 * The comparison is the glyph's rendered SHAPE (the `<svg>`'s inner markup), not the component
 * identity — so a NEW component pasted from an existing one's paths fails too.
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

/**
 * The viewer who sees the most: every access role the app knows, so no entry is absent from the
 * sweep merely because this persona was never offered it. A duplicate that only two roles can see
 * at once is still a duplicate.
 */
const OMNISCIENT_ROLES = ['admin', 'finance', 'manager', 'supervisor', 'ops_lead', 'member']

function setOmniscientViewer() {
  mockUseAuth.mockReturnValue({
    status: 'authenticated',
    viewer: {
      person: {
        id: 'p1', org_id: 'o1', user_id: 'u1', full_name: 'Director Viewer',
        email: 'd@example.test', archived_at: null, must_change_password: false,
        created_at: '', updated_at: '',
      },
      roles: [{ id: 'r1', org_id: 'o1', business_unit_id: 'bu1', name: 'Café Roastery Ecommerce Lead', reports_to_role_id: null, created_at: '', updated_at: '' }],
      isManager: true,
      accessRoles: OMNISCIENT_ROLES,
    },
    signOut: vi.fn(),
  })
}

async function renderCompactRail() {
  render(
    <ThemeProvider>
      <I18nProvider>
        <MemoryRouter initialEntries={['/cafe/log']}>
          <RailNav compact />
        </MemoryRouter>
      </I18nProvider>
    </ThemeProvider>,
  )
  // The rail's Inbox badge fires a mocked async read on mount; flush it so its resolve does not
  // land outside act() and print a warning over an otherwise clean run.
  await act(async () => {})
  return screen.getByRole('navigation', { name: 'Primary' })
}

/** The rendered mark of one rail link: its `<svg>`'s inner markup, whitespace-normalised. */
function glyphOf(link: HTMLElement): string {
  const svg = link.querySelector('svg')
  expect(svg, `rail link ${link.getAttribute('href')} renders no glyph at all`).not.toBeNull()
  return svg!.innerHTML.replace(/\s+/g, ' ').trim()
}

/** Every link the compact rail renders, paired with the mark it draws. */
async function railGlyphs(): Promise<{ href: string; label: string; glyph: string }[]> {
  const nav = await renderCompactRail()
  return within(nav)
    .getAllByRole('link')
    .map((link) => ({
      href: link.getAttribute('href') ?? '',
      // compact items carry the label in `data-label` (the CSS tooltip) or `.sr-only` text.
      label: link.getAttribute('data-label') ?? link.textContent ?? '',
      glyph: glyphOf(link as HTMLElement),
    }))
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  setOmniscientViewer()
})

describe('compact rail glyphs (issue 457 part 1)', () => {
  // Vacuity guards. Every negative below is only worth what these are worth: if the rail rendered
  // three links, or the ship-gate mock stopped applying, "no duplicates" would pass over a rail
  // nobody is actually looking at.
  it('renders the whole rail — every zone, and the gate really is off', async () => {
    const links = await railGlyphs()
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
    const links = await railGlyphs()
    const byGlyph = new Map<string, string[]>()
    for (const l of links) byGlyph.set(l.glyph, [...(byGlyph.get(l.glyph) ?? []), l.href])
    const collisions = [...byGlyph.values()].filter((hrefs) => hrefs.length > 1)
    expect(collisions, 'rail entries sharing one glyph in the icon-only regime').toEqual([])
  })

  it("each Café child's mark is its own, and none of them is the module's cup", async () => {
    const links = await railGlyphs()
    const cup = links.find((l) => l.href === '/cafe')?.glyph
    expect(cup, 'the Café module link is missing').toBeTruthy()
    const children = links.filter((l) => l.href.startsWith('/cafe/'))
    expect(children.map((c) => c.href).sort()).toEqual(
      ['/cafe/log', '/cafe/plan', '/cafe/pushes', '/cafe/review', '/cafe/stock'],
    )
    for (const child of children) {
      expect(child.glyph, `${child.href} still draws the Café cup`).not.toBe(cup)
    }
  })
})
