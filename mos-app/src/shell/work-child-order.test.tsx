/**
 * One nav order, both surfaces (#446).
 *
 * The desktop rail listed Work's children Tasks · Projects & Processes · Objectives · Signals,
 * the phone drawer listed them Signals · Tasks · Projects & Processes · Objectives — same five
 * items, same IA, two orders, because the rail re-sorted `children` through a table of its own
 * while the drawer rendered them as declared. A nav list is worth most when muscle memory carries
 * it, and muscle memory does not survive changing device.
 *
 * This file is the guard that the two can never disagree again. It renders BOTH surfaces for the
 * same viewer and compares the hrefs they emit, in document order, against the single declared
 * source — so a re-sort reintroduced on either side goes red here rather than in someone's hands.
 *
 * Issue 479 adds the THIRD surface. The ⌘K palette was left holding its own re-typed sequence
 * (Work, Signals, Projects & Processes, Objectives) — and the reason it drifted unseen is exactly
 * that this guard rendered the rail and the drawer only. A guard that covers two of three surfaces
 * licenses the third to drift. All three render here now, from the one declared array.
 *
 * #544 extends the pin: each surface is compared against the RULED sequence as literals
 * (Signals · Tasks · Projects & Processes · Objectives · Events — OD-REDESIGN-57(ii), oracle
 * P-13), not merely against the declaration. Comparing surfaces to the declaration alone is the
 * looseness that let the wrong order survive: every surface agreed, with the array, on the wrong
 * sequence.
 *
 * The #748 shell judgment retargets the palette's half of this file: the ⌘K palette RESTS on
 * destination roots and lists Work children only in the typed view (they match by name). The
 * guard keeps its teeth by reading the palette in the state where children render — a query that
 * keeps the Work parent row — and pinning that view to the RULED order, filtered by the same
 * substring rule the palette applies. The rail and drawer pins are unchanged.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { ThemeProvider } from '@/theme/theme-provider'
import { DESTINATIONS } from './destinations'
import { visibleSections } from './sections'
import { can } from '@/lib/capabilities'
import { isShipGated } from '@/lib/ship-gate'
import { RailNav } from './rail-nav'
import { MobileDrawer } from './mobile-drawer'

// The palette's debounced record search is irrelevant to nav order and would reach for a real
// Supabase client at import time; stub the four readers it fans out to.
vi.mock('@/lib/db/tasks', () => ({ searchTasksByTitle: vi.fn().mockResolvedValue([]) }))
vi.mock('@/lib/db/signals', () => ({ searchSignalsByBody: vi.fn().mockResolvedValue([]) }))
vi.mock('@/lib/db/follow-ups', () => ({ searchFollowUpsByCounterparty: vi.fn().mockResolvedValue([]) }))
vi.mock('@/lib/db/directory', () => ({ searchPeopleByName: vi.fn().mockResolvedValue([]) }))
vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'
import { CommandMenu } from '@/components/command/command-menu'
const mockUseAuth = vi.mocked(useAuth)

// Every role a viewer can hold, not just admin: an order divergence conditioned on
// `accessRoles.includes('admin')` shipped green through this whole file.
const ROLES = ['admin', 'ops_lead', 'member', 'finance', 'manager', 'supervisor'] as const

// The Work family, its gates and its labels, written out HERE — in the OWNER-RULED order
// (OD-REDESIGN-57(ii), oracle row P-13): Signals first, then Tasks, Projects & Processes,
// Objectives; Events stays last. Every expectation below is built from these literals, so a
// registry entry that is deleted, reordered, or relabelled has nothing to hide behind: Events is
// ship-gated (#348 rides milestone 4). #544: an expectation derived from the declaration itself
// agrees with whatever order the declaration takes — that looseness is what let the pre-#544
// order survive #476's unification.
const FAMILY = ['/work/signals', '/work/tasks', '/work/projects', '/work/objectives']
const CAPABILITY: Record<string, string | undefined> = { '/work/projects': 'workline.manage' }
// Add a row here when you add a Work child or lift a ship gate — a missing entry renders as
// `=undefined` in the red, which reads as a label bug rather than a missing literal.
const LABEL: Record<string, string> = {
  '/work/tasks': 'Tasks',
  '/work/projects': 'Projects & Processes',
  '/work/objectives': 'Objectives',
  '/work/signals': 'Signals',
}

let CURRENT_ROLES: string[] = ['admin']
function setAuth() {
  mockUseAuth.mockReturnValue({
    status: 'authenticated',
    viewer: {
      person: {
        id: 'p1', org_id: 'o1', user_id: 'u1', full_name: 'Cahya Cafe',
        email: 'c@example.test', archived_at: null, must_change_password: false,
        created_at: '', updated_at: '',
      },
      roles: [{ id: 'r0', org_id: 'o1', business_unit_id: 'bu', name: 'Managing Director', reports_to_role_id: null, created_at: '', updated_at: '' }],
      isManager: false,
      accessRoles: CURRENT_ROLES,
      affiliated: [], hasEmail: true,
    },
    signOut: vi.fn(),
  })
}

function shell(ui: React.ReactNode) {
  return render(
    <ThemeProvider>
      <I18nProvider>
        <MemoryRouter initialEntries={['/work/tasks']}>{ui}</MemoryRouter>
      </I18nProvider>
    </ThemeProvider>,
  )
}

/**
 * Every Work CHILD link a surface emits, in document order.
 *
 * Selected by the ladder's child-rung marker (`rail-item--child`, DD-WAY-33) rather than by href
 * alone: both surfaces give the Work PARENT row `/work/tasks` as its primaryPath, so an href-only
 * scan reads that parent as a sixth child and the two lists stop being comparable. The rung class
 * is what actually says "this row is a child", and both surfaces already set it from the same
 * stylesheet.
 */
function workChildHrefs(root: HTMLElement): string[] {
  return Array.from(
    root.querySelectorAll<HTMLAnchorElement>('a.rail-item--child[href^="/work/"]'),
  ).map((a) => `${a.getAttribute('href') ?? ''}=${(a.textContent ?? '').trim()}`)
}

/**
 * Every Work CHILD row the ⌘K palette emits, in document order.
 *
 * The palette renders `role="option"` divs, not anchors, so there is no href to read; each row
 * carries its target as `data-to` and its rung as `data-child` — the palette's counterpart of the
 * `rail-item--child` class, and needed for the same reason: the Work PARENT row targets
 * `/work/tasks` too, so a target-only scan would read it as a fifth child and the three lists
 * would stop being comparable.
 */
/**
 * Route-equivalent form of a nav target. react-router matches on pathname and is case-insensitive
 * by default, so `/Work/Signals?x=1`, `/work/signals/` and `/work/signals` are one destination —
 * but a CSS `[data-to^="/work/"]` selector is byte-exact and case-sensitive, so re-typed rows in
 * any of those spellings were invisible to every assertion here.
 */
const routeKey = (t: string) => t.replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase()

/** Every /work anchor a rail/drawer surface emits, in document order, parent included. */
function workAnchors(root: HTMLElement): { to: string; child: boolean }[] {
  return Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href]'))
    .filter((a) => routeKey(a.getAttribute('href') ?? '').startsWith('/work'))
    .map((a) => ({
      to: routeKey(a.getAttribute('href') ?? ''),
      child: a.classList.contains('rail-item--child'),
    }))
}

/**
 * The Work PARENT target a rail/drawer surface emits: a /work/ anchor that is NOT a child rung.
 *
 * The cross-surface checks below compare child rows only, so a surface that re-typed its PARENT
 * target stayed invisible: with the registry re-pointed and the rail holding a literal, the
 * palette and the rail sent "Work" to different places and every assertion here passed.
 */
function workParentHref(root: HTMLElement): string {
  const a = Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href^="/work"]')).find(
    (el) => !el.classList.contains('rail-item--child'),
  )
  return a?.getAttribute('href') ?? ''
}

function paletteWorkChildTargets(root: HTMLElement): string[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>('[data-child="true"][data-to^="/work/"]'),
  ).map((el) => `${el.getAttribute('data-to') ?? ''}=${(el.textContent ?? '').trim()}`)
}

function palette() {
  return shell(<CommandMenu open onClose={vi.fn()} onShareSignal={vi.fn()} />)
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  setAuth()
})

describe.each(ROLES)('Work children: one declared order, every surface — viewer %s', (role) => {
  beforeEach(() => { CURRENT_ROLES = [role]; setAuth() })
  // The ONE source: the `children` array in destinations.tsx, filtered by the same gate both
  // surfaces apply. Read here rather than re-typed, so the expectation cannot drift from the
  // registry — only from a surface that stopped honouring it, which is the defect being guarded.
  const declaredOrder = visibleSections(
    DESTINATIONS.find((d) => d.id === 'work')!.children ?? [],
    [role],
  ).map((c) => c.path)

  it('the registry declares the whole family, gate or no gate', () => {
    // `expected` below filters FAMILY by the ship gate, so /work/events sits on NEITHER side of it:
    // moving it to first position, or deleting it outright, left 36/36 green. PRODUCT.md and the
    // registry both claim five children in one order, so the pre-gate array is what owns that claim.
    const declared = (DESTINATIONS.find((d) => d.id === 'work')!.children ?? []).map((c) => c.path)
    expect(declared).toEqual(FAMILY)
  })

  it('the gate-filtered declaration is the owner-ruled sequence (OD-REDESIGN-57(ii))', () => {
    // Built from literals HERE plus the two gate primitives — never from `declaredOrder` or the
    // registry. An expectation read from the thing under test cannot notice the thing going
    // missing: filtering the family list by `declaredOrder.includes(p)` passed a DELETED
    // destination, and pinning three paths by hand still passed a deleted /work/projects.
    const expected = FAMILY.filter(
      (p) => !isShipGated(p) && (!CAPABILITY[p] || can([role], CAPABILITY[p])),
    )
    expect(declaredOrder).toEqual(expected)
    expect(declaredOrder.length).toBeGreaterThan(0)
  })

  // target=label, built from the FAMILY LITERALS plus the two gate primitives — never from
  // `declaredOrder` or the registry. An expectation read from the thing under test cannot notice
  // the thing being re-sorted: agreement with the declaration alone is what let the pre-#544
  // order survive (#544). Each surface below is pinned to the RULED sequence, not to each other.
  const expectedPairs = () =>
    FAMILY.filter((p) => !isShipGated(p) && (!CAPABILITY[p] || can([role], CAPABILITY[p]))).map(
      (p) => `${p}=${LABEL[p]}`,
    )

  // The palette's typed-view filter is a plain substring match on the label; the expected order
  // below filters the RULED pairs by the same rule, so the pin stays literal (never derived from
  // the thing under test) while tracking which children a query legitimately keeps.
  const typedPairs = (q: string) =>
    expectedPairs().filter((pair) => pair.slice(pair.indexOf('=') + 1).toLowerCase().includes(q))
  const paletteChildrenInView = async (q: string) => {
    const view = palette()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: q } })
    // The Work PARENT row must survive the query, or the children wear no rung and the scan
    // below reads an empty list (issue 479's orphaned-rung defect, from the other side).
    expect(await screen.findByRole('option', { name: /^Work$/i })).toBeTruthy()
    return view
  }

  it('the desktop rail renders Work children in the owner-ruled order (OD-REDESIGN-57(ii))', () => {
    shell(<RailNav />)
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(workChildHrefs(nav)).toEqual(expectedPairs())
  })

  it('the phone drawer renders Work children in the owner-ruled order (OD-REDESIGN-57(ii))', () => {
    shell(<MobileDrawer open onClose={vi.fn()} />)
    const nav = screen.getByRole('navigation', { name: 'More destinations' })
    expect(workChildHrefs(nav)).toEqual(expectedPairs())
  })

  it("the ⌘K palette's typed view renders the surviving Work children in the owner-ruled order (OD-REDESIGN-57(ii); issue 479, retargeted by #748)", async () => {
    // "o" keeps Projects & Processes and Objectives (and the Work parent); Signals and Tasks
    // legitimately drop out. ORDER among the survivors is the contract.
    const view = await paletteChildrenInView('o')
    expect(paletteWorkChildTargets(view.container)).toEqual(typedPairs('o'))
  })

  it('at rest the palette lists destination ROOTS only — the Work parent and no children (#748)', () => {
    const v = palette()
    const rows = Array.from(
      v.container.querySelectorAll<HTMLElement>('[data-to^="/work/"]:not(.action)'),
    ).map((el) => `${el.getAttribute('data-to') ?? ''}=${(el.textContent ?? '').trim()}`)
    const parentPath = DESTINATIONS.find((d) => d.id === 'work')!.primaryPath ?? '/work/tasks'
    expect(rows).toEqual([`${parentPath}=Work`])
  })

  it('no Work target is rendered twice, except the parent sharing its primaryPath', async () => {
    // The membership check above excludes `.action` rows, which it must — /work/tasks/new is a
    // legitimate action. That exclusion let a SECOND re-typed Work sequence back into the Actions
    // group under distinct labels, 90/90 green: the drift #479 closed, one group over.
    // Read in the TYPED view: at rest #748 leaves a single Work row, which would pass anything.
    // The parent row legitimately repeats its own primaryPath (it targets where Work goes, which
    // is also a child's path), so that one repeat is allowed and every other is not.
    const v = await paletteChildrenInView('o')
    // Every row with a target, keyed by ROUTE not by string. A CSS `[data-to^="/work/"]` prefix is
    // byte-exact and case-sensitive, so `/Work/Signals`, `/work/signals?` and `/work/signals/` —
    // all one destination to react-router — were invisible here and re-typed sequences in any of
    // those spellings passed green.
    const targets = Array.from(v.container.querySelectorAll<HTMLElement>('[data-to]:not(.action)'))
      .map((el) => routeKey(el.getAttribute('data-to') ?? ''))
      .filter((t) => t.startsWith('/work'))
    const parent = routeKey(DESTINATIONS.find((d) => d.id === 'work')!.primaryPath ?? '/work/tasks')
    // indexOf returns -1 when the parent target is not under /work/ — and splice(-1, 1) deletes
    // the LAST element, silently dropping a real row from the uniqueness check. With the registry
    // re-pointed off /work/ AND a genuine duplicate present, this passed 6/6 green.
    const withoutParentRow = [...targets]
    const at = withoutParentRow.indexOf(parent)
    if (at >= 0) withoutParentRow.splice(at, 1)
    expect(withoutParentRow).toEqual([...new Set(withoutParentRow)])
  })

  it('all three surfaces send the Work PARENT to the same place', () => {
    const rail = shell(<RailNav />)
    const railNav = rail.container.querySelector('nav')!
    const railParent = workParentHref(railNav)
    const railAnchors = workAnchors(railNav)
    rail.unmount()
    const drawer = shell(<MobileDrawer open onClose={vi.fn()} />)
    const drawerNav = drawer.container.querySelector<HTMLElement>('nav[aria-label="More destinations"]')!
    const drawerParent = workParentHref(drawerNav)
    const drawerAnchors = workAnchors(drawerNav)
    drawer.unmount()
    const view = palette()
    const palParent = (view.container.querySelector('[data-to^="/work/"]:not(.action)') as HTMLElement | null)
      ?.getAttribute('data-to') ?? ''

    expect(railParent).not.toBe('')
    expect(drawerParent).toBe(railParent)
    expect(palParent).toBe(railParent)

    // POSITION, not just value. workParentHref FILTERS for the first non-child anchor, so it is
    // position-blind: moving the drawer's Work row below its children left every assertion green
    // while the drawer listed Work last and the rail listed it first — the cross-device divergence
    // this file exists to prevent. The parent must be the FIRST /work anchor on each surface.
    for (const [surface, anchors] of [['rail', railAnchors], ['drawer', drawerAnchors]] as const) {
      expect(anchors.length, `${surface} rendered no /work anchors`).toBeGreaterThan(1)
      expect(anchors[0].child, `${surface} renders a child before the Work parent`).toBe(false)
    }
  })

  it('rail, drawer and palette agree — the same items in the same sequence', async () => {
    const rail = shell(<RailNav />)
    const railOrder = workChildHrefs(rail.container.querySelector('nav')!)
    rail.unmount()
    const drawer = shell(<MobileDrawer open onClose={vi.fn()} />)
    const drawerOrder = workChildHrefs(
      drawer.container.querySelector('nav[aria-label="More destinations"]')!,
    )
    drawer.unmount()
    // #748: the palette lists children only in the typed view, so its half of the agreement is
    // read there and compared against the RULED order filtered to what the query keeps — the
    // rail/drawer keep their full-sequence pairwise check between themselves.
    const view = await paletteChildrenInView('o')
    const paletteOrder = paletteWorkChildTargets(view.container)

    // Compared pairwise rather than all-to-declared, so this stays a genuine cross-surface
    // agreement check: it goes red when any ONE surface re-sorts, including a case where two
    // surfaces drifted together.
    expect(drawerOrder).toEqual(railOrder)
    expect(paletteOrder).toEqual(typedPairs('o'))
    // Pairs are `target=label`, not bare targets: with targets alone, relabelling one surface's
    // /work/tasks row “Signals” left every order test green.
    // …and none of the three is passing on an empty list.
    expect(railOrder.length).toBeGreaterThan(1)
    expect(paletteOrder.length).toBeGreaterThan(0)
  })
})
