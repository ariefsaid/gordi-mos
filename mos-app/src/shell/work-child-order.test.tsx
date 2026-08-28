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
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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
// Supabase client at import time; stub the three readers it fans out to.
vi.mock('@/lib/db/tasks', () => ({ searchTasksByTitle: vi.fn().mockResolvedValue([]) }))
vi.mock('@/lib/db/signals', () => ({ searchSignalsByBody: vi.fn().mockResolvedValue([]) }))
vi.mock('@/lib/db/follow-ups', () => ({ searchFollowUpsByCounterparty: vi.fn().mockResolvedValue([]) }))
vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'
import { CommandMenu } from '@/components/command/command-menu'
const mockUseAuth = vi.mocked(useAuth)

// Every role a viewer can hold, not just admin: an order divergence conditioned on
// `accessRoles.includes('admin')` shipped green through this whole file.
const ROLES = ['admin', 'ops_lead', 'member', 'finance', 'manager', 'supervisor'] as const

// The Work family, its gates and its labels, written out HERE. Every expectation below is built
// from these, so a registry entry that is deleted, reordered, or relabelled has nothing to hide
// behind: Events is ship-gated (#348 rides milestone 4).
const FAMILY = ['/work/tasks', '/work/projects', '/work/objectives', '/work/signals', '/work/events']
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

  it('the declared order is the E7 family sequence, flattened', () => {
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

  // target=label, the labels from LABEL above: pairwise agreement alone only catches ONE surface
  // drifting. Relabelling the shared translation moved all three together and stayed green.
  const expectedPairs = () => declaredOrder.map((p) => `${p}=${LABEL[p]}`)

  it('the desktop rail renders Work children in the declared order', () => {
    shell(<RailNav />)
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(workChildHrefs(nav)).toEqual(expectedPairs())
  })

  it('the phone drawer renders Work children in the declared order', () => {
    shell(<MobileDrawer open onClose={vi.fn()} />)
    const nav = screen.getByRole('navigation', { name: 'More destinations' })
    expect(workChildHrefs(nav)).toEqual(expectedPairs())
  })

  it('the ⌘K palette renders Work children in the declared order (issue 479)', () => {
    const view = palette()
    expect(paletteWorkChildTargets(view.container)).toEqual(expectedPairs())
  })

  it('the palette emits no Work row beyond the parent and the declared children', () => {
    // Selected by TARGET, not by the palette's own `data-child` marker. The marker is opt-in: a
    // re-typed Work row that simply omits it is invisible to every other assertion here — which is
    // the exact defect #479 exists to kill, one level of indirection down. Action rows carry
    // `.action` and are excluded; the parent row targets /work/tasks and is expected first.
    const v = palette()
    const rows = Array.from(
      v.container.querySelectorAll<HTMLElement>('[data-to^="/work/"]:not(.action)'),
    ).map((el) => `${el.getAttribute('data-to') ?? ''}=${(el.textContent ?? '').trim()}`)
    // The parent pair is read from the registry, not written here, so a legitimate re-point does
    // not fail this. What THIS asserts is narrow: the palette's parent target equals the declared
    // one. Cross-surface agreement is a separate assertion below — reading the same field proves
    // each surface follows the registry, never that the three agree with each other, and a guard
    // covering two of three surfaces licenses the third to drift.
    const parentPath = DESTINATIONS.find((d) => d.id === 'work')!.primaryPath ?? '/work/tasks'
    expect(rows).toEqual([`${parentPath}=Work`, ...expectedPairs()])
  })

  it('no Work target is rendered twice, except the parent sharing its primaryPath', () => {
    // The membership check above excludes `.action` rows, which it must — /work/tasks/new is a
    // legitimate action. That exclusion let a SECOND re-typed Work sequence back into the Actions
    // group under distinct labels, 90/90 green: the drift #479 closed, one group over.
    // The parent row legitimately repeats its own primaryPath (it targets where Work goes, which
    // is also a child's path), so that one repeat is allowed and every other is not.
    const v = palette()
    // Every row with a target, keyed by ROUTE not by string. A CSS `[data-to^="/work/"]` prefix is
    // byte-exact and case-sensitive, so `/Work/Signals`, `/work/signals?` and `/work/signals/` —
    // all one destination to react-router — were invisible here and re-typed sequences in any of
    // those spellings passed green.
    const targets = Array.from(v.container.querySelectorAll<HTMLElement>('[data-to]'))
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

  it('rail, drawer and palette agree — the same items in the same sequence', () => {
    const rail = shell(<RailNav />)
    const railOrder = workChildHrefs(rail.container.querySelector('nav')!)
    rail.unmount()
    const drawer = shell(<MobileDrawer open onClose={vi.fn()} />)
    const drawerOrder = workChildHrefs(
      drawer.container.querySelector('nav[aria-label="More destinations"]')!,
    )
    drawer.unmount()
    const view = palette()
    const paletteOrder = paletteWorkChildTargets(view.container)

    // Compared pairwise rather than all-to-declared, so this stays a genuine cross-surface
    // agreement check: it goes red when any ONE surface re-sorts, including a case where two
    // surfaces drifted together.
    expect(drawerOrder).toEqual(railOrder)
    expect(paletteOrder).toEqual(railOrder)
    // Pairs are `target=label`, not bare targets: with targets alone, relabelling one surface's
    // /work/tasks row “Signals” left every order test green.
    // …and none of the three is passing on an empty list.
    expect(railOrder.length).toBeGreaterThan(1)
  })
})
