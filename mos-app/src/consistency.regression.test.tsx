// Regression invariants for the whole-app consistency pass (PR-1).
// Each describe carries an AC-style id (RI-*) so `grep -r RI-XXX` finds the proof.
// Layering: source-scan for source-level conventions (RI-VIS-1/VIS-2/IXD-1 — mirrors the
// TaskSurface.css.test.ts fs-read pattern), rendered for the route-head contract (RI-IA-1).
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'
import * as ts from 'typescript'
import { AuthContext } from './auth/context'
import type { AuthState } from './auth/context'
import { I18nProvider } from './i18n/I18nProvider'
import { PAGE_FAMILY_CONTRACTS } from './shell/page-families'
import { PAGE_FAMILY_FRAME_ROUTES } from './shell/page-family-migration'

// ── DB mocks (all pending/empty → pages still mount their <PageHead> synchronously) ──
vi.mock('./lib/db/tasks', () => ({
  listTasks: vi.fn(() => new Promise(() => {})),
  hasOlderDoneTasks: vi.fn(() => new Promise(() => {})),
  listOlderDoneTasks: vi.fn(),
  getTaskTitlesByIds: vi.fn(() => Promise.resolve([])),
}))
vi.mock('./lib/db/directory', () => ({
  getBusinessUnits: vi.fn(() => new Promise(() => {})),
  getPeople: vi.fn(() => new Promise(() => {})),
  getMyTeamLeads: vi.fn(() => new Promise(() => {})),
  getPersonTeams: vi.fn(() => new Promise(() => {})),
  getDownlinePersonIds: vi.fn().mockResolvedValue([]),
}))
// Ported for #192 (Tasks): TasksWorkspace's cascade catalogs — mocked pending so the unit test
// never reaches the real supabase client (mirrors pages/tasks-layout.test.tsx).
vi.mock('./lib/db/objectives', () => ({ listObjectives: vi.fn(() => new Promise(() => {})) }))
vi.mock('./lib/db/work-lines', () => ({ listWorkLines: vi.fn(() => new Promise(() => {})) }))
vi.mock('./lib/comments/postComment', () => ({
  listComments: vi.fn(() => new Promise(() => {})),
  postComment: vi.fn(),
}))

import { TasksLayout } from './pages/tasks-layout'
import { PageFrame } from './shell/page-frame'
import { OverlayHostProvider } from './shell/overlay-host'

const authedState: AuthState = {
  status: 'authenticated',
  viewer: {
    person: {
      id: 'p1', org_id: 'org', user_id: 'u1', full_name: 'Test User',
      email: null, must_change_password: false, archived_at: null,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    },
    roles: [],
    isManager: false,
    accessRoles: [],
    affiliated: [],
  },
  signOut: async () => {},
}

function withAuth(node: React.ReactNode) {
  // I18nProvider keeps translated page subtrees from throwing outside a provider.
  return render(
    <I18nProvider>
      <AuthContext.Provider value={authedState}>{node}</AuthContext.Provider>
    </I18nProvider>,
  )
}

// ── helpers ───────────────────────────────────────────────────────────────────
const SRC = resolve(process.cwd(), 'src')

/** Read a source file under src/ as utf8. */
function readSrc(rel: string): string {
  return readFileSync(resolve(SRC, rel), 'utf8')
}

/** Recursively list non-test .tsx AND .css files under a directory. */
function listNonTestSource(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) listNonTestSource(full, acc)
    else if (
      (full.endsWith('.tsx') || full.endsWith('.css')) &&
      !full.endsWith('.test.tsx') && !full.endsWith('.test.css')
    ) acc.push(full)
  }
  return acc
}

/** Path relative to src/, using POSIX separators for stable snapshots. */
function srcRel(path: string): string {
  return path.slice(SRC.length + 1).replaceAll('\\', '/')
}

/** True if a retired bespoke head class is re-defined as a CSS rule or applied as a className. */
function retiredHeadClassUsed(body: string): boolean {
  // (a) re-defined as a CSS rule selector: `.tasks-page-title {` / `.ops-page-title {`
  if (/\.tasks-page-title\s*\{|\.ops-page-title\s*\{/.test(body)) return true
  // (b) applied via a className attribute
  if (/className\s*=\s*["'`{][^"'`}]*\b(?:tasks|ops)-page-title\b/.test(body)) return true
  return false
}

/** Extract the body `{ ... }` of the first rule for `selector` in a CSS-ish string. */
function ruleBody(css: string, selector: string): string {
  const idx = css.indexOf(selector)
  expect(idx, `expected to find ${selector}`).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', idx)
  const close = css.indexOf('}', open)
  return css.slice(open + 1, close)
}

/** All `linear-gradient(...)` substrings in a CSS-ish string. */
function gradientsIn(css: string): string[] {
  return [...css.matchAll(/linear-gradient\([^)]*\)/gi)].map(m => m[0])
}

// ══════════════════════════════════════════════════════════════════════════════
// RI-VIS-1: ONE avatar gradient — no avatar gradient contains violet (OD-P3-7).
// ══════════════════════════════════════════════════════════════════════════════
describe('RI-VIS-1: no avatar gradient contains the violet token', () => {
  it('TaskSurface.css avatar gradients (.person-av / .event-av) use navy→primary, never violet', () => {
    const css = readSrc('components/tasks/TaskSurface.css')
    const all = gradientsIn(css)
    expect(all.length).toBeGreaterThan(0)
    for (const g of all) {
      expect(g).not.toMatch(/262 83% 58%|var\(--violet\)/)
    }
  })

})

// ══════════════════════════════════════════════════════════════════════════════
// RI-VIS-2: error/helper TEXT uses --status-lost-text (AA), never base --destructive
// as the text color. (Field outline + required asterisk may stay --destructive.)
// ══════════════════════════════════════════════════════════════════════════════
describe('RI-VIS-2: error text classes use --status-lost-text, not base --destructive', () => {


  it('LoginPage error text (form alert + inline email error) uses --status-lost-text, not --destructive', () => {
    const src = readSrc('pages/login-page.tsx')
    // Error TEXT color is the AA token (used for both the form alert and the email error)
    expect(src).toMatch(/color:\s*'var\(--status-lost-text\)'/)
    // No error TEXT uses base --destructive (the emailInputBorder keeps --destructive — different key)
    expect(src).not.toMatch(/color:\s*'var\(--destructive\)'/)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// RI-IXD-1: ONE disclosure chevron — no ▸/▾/▴ affordance glyph anywhere in source.
// (If no source carries the glyph, no rendered toolbar/group header can either.)
// ══════════════════════════════════════════════════════════════════════════════
describe('RI-IXD-1: no ▸/▾/▴ affordance glyph in any non-test .tsx', () => {
  it('every non-test .tsx is free of the triangle affordance glyphs', () => {
    const offenders: string[] = []
    for (const f of listNonTestSource(SRC)) {
      if (!f.endsWith('.tsx')) continue
      const body = readFileSync(f, 'utf8')
      if (/[▸▾▴]/.test(body)) offenders.push(f)
    }
    expect(offenders).toEqual([])
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// RI-IA-1: ONE page header — every main route renders the shared <PageHead>
// (its data-testid is present) and no route mounts a bespoke *-page-title head.
// ══════════════════════════════════════════════════════════════════════════════
describe('RI-IA-1: every main route renders the shared PageHead (no bespoke *-page-title)', () => {
  it('the shared PageHead exposes the page-head testid', () => {
    expect(readSrc('shell/page-head.tsx')).toMatch(/data-testid="page-head"/)
  })

  it('the retired bespoke head classes (.tasks-page-title / .ops-page-title) are not re-defined or re-applied in src', () => {
    const offenders: string[] = []
    for (const f of listNonTestSource(SRC)) {
      const body = readFileSync(f, 'utf8')
      if (retiredHeadClassUsed(body)) offenders.push(f)
    }
    // .tc-page-title (create-form head) is deliberately deferred to PR-2 — not flagged here.
    expect(offenders).toEqual([])
  })

  it('/tasks (TasksLayout → TasksWorkspace) renders the shared PageHead and no bespoke page-title element', () => {
    // Ported for #192: lives at /work/tasks now (not the retired /tasks), and TasksWorkspace
    // requires OverlayHostProvider (Stage 2's shared record-panel host) — mirrors the render
    // harness pages/tasks-layout.test.tsx uses for the same component.
    const { container } = withAuth(
      <MemoryRouter initialEntries={['/work/tasks']}>
        <OverlayHostProvider>
          <Routes>
            <Route path="/work/tasks" element={<TasksLayout />} />
          </Routes>
        </OverlayHostProvider>
      </MemoryRouter>,
    )
    expect(container.querySelector('[data-testid="page-head"]')).toBeTruthy()
    expect(container.querySelector('[class*="page-title"]')).toBeNull()
  })
})

const sharedPageHeadRoutes = [
  ['/', 'pages/home-page.tsx', 'workspace'],
  ['/work/tasks', 'components/tasks/tasks-workspace.tsx', 'workspace'],
  ['/work/signals', 'pages/signals-archive-page.tsx', 'workspace'],
  ['/work/projects', 'pages/projects-processes-page.tsx', 'management'],
  ['/work/objectives', 'pages/objectives-page.tsx', 'management'],
  ['/inbox', 'pages/inbox-page.tsx', 'workspace'],
  ['/work/events', 'pages/events-workspace-page.tsx', 'workspace'],
  ['/money', 'pages/money-page.tsx', 'workspace'],
  ['/money/branch/:code', 'pages/money-branch-page.tsx', 'workspace'],
  ['/money/budget', 'pages/budget-page.tsx', 'workspace'],
  ['/money/pricing', 'pages/pricing-page.tsx', 'workspace'],
  ['/money/follow-ups', 'pages/follow-ups-page.tsx', 'workspace'],
  ['/admin/people', 'pages/admin-users-page.tsx', 'management'],
  ['/admin/teams', 'pages/admin-teams-page.tsx', 'management'],
  ['/admin/access', 'pages/admin-access-page.tsx', 'management'],
  ['/admin/agents', 'pages/admin-agent-connections-page.tsx', 'management'],
  ['/profile', 'pages/profile-page.tsx', 'management'],
  ['/profile/connected-agents', 'pages/profile-connected-agents-page.tsx', 'management'],
  ['/dev/views', 'pages/dev-views-page.tsx', 'management'],
] as const

function hasRouteOwnedH1(source: string): boolean {
  const file = ts.createSourceFile('route.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let found = false
  const visit = (node: ts.Node) => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))
      && ts.isIdentifier(node.tagName) && node.tagName.text === 'h1') found = true
    ts.forEachChild(node, visit)
  }
  visit(file)
  return found
}

describe('RI-IA-2: non-Café route entrypoints use the shared page-family heading', () => {
  for (const [route, file, family] of sharedPageHeadRoutes) {
    it(`${route} delegates its page identity to PageFamilyFrame`, () => {
      expect(
        PAGE_FAMILY_FRAME_ROUTES.some((entry) => entry.path === route && entry.family === family),
        `${route} is missing or has a different family in PAGE_FAMILY_FRAME_ROUTES`,
      ).toBe(true)
      const source = readSrc(file)
      const frames = [...source.matchAll(/<PageFamilyFrame\b[^>]*>/gs)].map(([tag]) => tag)
      expect(frames.some((tag) => tag.includes(`family="${family}"`)), file).toBe(true)
      expect(PAGE_FAMILY_CONTRACTS[family].headVariant).toBe('content')
      expect(hasRouteOwnedH1(source), `${file} declares a route-local page heading`).toBe(false)
    })
  }
})

describe('RI-SEC-1: page empty/error copy does not expose internal reporting table names', () => {
  const pageFiles = [
    'pages/budget-page.tsx',
    'pages/pricing-page.tsx',
    'pages/inbox-page.tsx',
  ]

  for (const file of pageFiles) {
    it(`${file} has no reporting.* table name in rendered page source`, () => {
      expect(readSrc(file)).not.toMatch(/reporting\.[a-z0-9_]+/i)
    })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// RI-LAYOUT-1: every page LEFT-aligns at the same gutter — PageFrame never centers
// content (no `margin: 0 auto`), so the content origin is identical across routes.
// ══════════════════════════════════════════════════════════════════════════════
describe('RI-LAYOUT-1: PageFrame left-aligns content (no centered prose)', () => {
  for (const variant of ['prose', 'data'] as const) {
    it(`${variant} variant does not center (inline margin is 0, not auto)`, () => {
      const { container } = render(
        <PageFrame variant={variant}><div>x</div></PageFrame>,
      )
      const inner = container.querySelector('main > div') as HTMLElement
      expect(inner).toBeTruthy()
      expect(inner.style.margin).toBe('0px') // left-aligned; a centered layout would be "0px auto"
    })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// RI-IXD-2: the sort affordance is inline-block. Tailwind preflight sets
// `svg { display:block }`; a block sort SVG ignores the cell's text-align and
// detaches from its column label (the bug this guards). Due/Activity stay LEFT.
// ══════════════════════════════════════════════════════════════════════════════
describe('RI-IXD-2: sort affordance inline-block + uniform left-aligned grid', () => {
  it('.sort-aff is display:inline-block so the arrow stays beside its label', () => {
    const body = ruleBody(readSrc('components/tasks/TasksWorkspace.css'), '.sort-aff')
    expect(body).toMatch(/display:\s*inline-block/)
  })
  it('Due/Activity headers are not right-aligned (no th-right — uniform left grid)', () => {
    expect(readSrc('components/tasks/tasks-workspace.tsx')).not.toMatch(/th-sortable th-right/)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// RI-LAYOUT-2: data workspace is FULL-BLEED (owner-directed) — no 1280 cap, so the
// table fills the gutter and aligns with the top-right account chip. A generous
// ultra-wide safety cap (1760) is allowed; the released 1280 cap is not.
// ══════════════════════════════════════════════════════════════════════════════
describe('RI-LAYOUT-2: Tasks workspace is full-bleed (no 1280 cap)', () => {
  it('TasksWorkspace.css .split is not capped at 1280px', () => {
    expect(readSrc('components/tasks/TasksWorkspace.css')).not.toMatch(/max-width:\s*1280px/)
  })
  it('the Tasks PageHead is not capped at 1280 (full-bleed header)', () => {
    expect(readSrc('components/tasks/tasks-workspace.tsx')).not.toMatch(/maxWidth=\{1280\}/)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// RI-VIS-4: ONE pill — no hand-rolled pillStyle / wup-state-* / ops-source-badge
// raw pill shell outside the shared <Pill> (VIS-4, PR-2).
// ════════════════════════════════════════════════════════════════════════════
describe('RI-VIS-4: no bespoke pillStyle / wup-state-* raw pill outside <Pill>', () => {

  it('no non-test source renders a wup-state-* or ops-source-badge className (raw pill shells)', () => {
    const offenders: string[] = []
    for (const f of listNonTestSource(SRC)) {
      if (!f.endsWith('.tsx')) continue
      const body = readFileSync(f, 'utf8')
      if (/className=["'`{][^"'`}]*\b(?:wup-state-|ops-source-badge)\b/.test(body)) offenders.push(f)
    }
    expect(offenders).toEqual([])
  })
})

// ════════════════════════════════════════════════════════════════════════════
// RI-IXD-4: ONE button hierarchy — no bespoke .tc-btn-* / .ops-*-btn(main-action)
// / .retry-btn / .btn-outline-link / .confirm-cancel / .btn-archive button classes
// (IXD-4, PR-2). All consolidated onto .btn .btn-{variant} (ui/Button.css).
// (.ops-edit-btn / .ops-archive-btn row controls + .btn-ghost / .btn-outline-sm
//  specialized variants stay — they are not the duplicated main-action hierarchy.)
// ════════════════════════════════════════════════════════════════════════════
describe('RI-IXD-4: no bespoke button classes duplicating the shared hierarchy', () => {
  const RETIRED_BTN = [
    'tc-btn-cancel', 'tc-btn-submit',
    'ops-add-btn', 'ops-retry-btn', 'ops-clear-btn', 'ops-submit-bar-btn',
    'retry-btn',
    'confirm-cancel', 'btn-outline-link', 'btn-archive',
  ]
  const classNameRe = new RegExp('className="[^"]*\\b(?:' + RETIRED_BTN.join('|') + ')\\b')
  const cssRuleRe = new RegExp('\\.(?:' + RETIRED_BTN.join('|') + ')\\s*\\{')

  it('no non-test source APPLIES a retired bespoke button class via className', () => {
    const offenders: string[] = []
    for (const f of listNonTestSource(SRC)) {
      if (classNameRe.test(readFileSync(f, 'utf8'))) offenders.push(f)
    }
    expect(offenders).toEqual([])
  })

  it('no non-test CSS RE-DEFINES a retired bespoke button class', () => {
    const offenders: string[] = []
    for (const f of listNonTestSource(SRC)) {
      if (cssRuleRe.test(readFileSync(f, 'utf8'))) offenders.push(f)
    }
    expect(offenders).toEqual([])
  })

  it('TasksWorkspace.css does not re-define the shared button/error kit classes', () => {
    const css = readSrc('components/tasks/TasksWorkspace.css')  // CSS file not renamed
    expect(css).not.toMatch(/\.retry-btn\s*\{/)
    // .btn-primary / .btn-outline are owned globally by ui/Button.css; the local
    // re-definitions were removed (usages now pair .btn .btn-{variant}).
    expect(css).not.toMatch(/\.btn-primary\s*\{/)
    expect(css).not.toMatch(/\.btn-outline\s*\{/)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// RI-IA-2: ONE breadcrumb — no in-page .tc-breadcrumb (the shell <Breadcrumb> is the single
// wayfinding home and extends to the leaf; one · separator throughout — the v4 redesign's Step 2
// §9 changed › to ·, and the invariant this case guards is ONE separator glyph app-wide, not
// which glyph it is).
// ════════════════════════════════════════════════════════════════════════════
describe('RI-IA-2: no in-page .tc-breadcrumb (one shell breadcrumb, · separator)', () => {
  it('no non-test source APPLIES a .tc-breadcrumb className', () => {
    const offenders: string[] = []
    for (const f of listNonTestSource(SRC)) {
      if (/className=["'`{][^"'`}]*\btc-breadcrumb\b/.test(readFileSync(f, 'utf8'))) offenders.push(f)
    }
    expect(offenders).toEqual([])
  })

  it('no non-test CSS DEFINES a .tc-breadcrumb rule', () => {
    const offenders: string[] = []
    for (const f of listNonTestSource(SRC)) {
      if (/\.tc-breadcrumb[a-z-]*\s*\{/.test(readFileSync(f, 'utf8'))) offenders.push(f)
    }
    expect(offenders).toEqual([])
  })

  it('the shell <Breadcrumb> renders the · separator (single breadcrumb system)', () => {
    expect(readSrc('shell/breadcrumb.tsx')).toMatch(/·/)
    expect(readSrc('shell/breadcrumb.tsx')).not.toMatch(/›/)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// RI-IXD-5: ONE Select shell — bounded-choice dropdowns use the shared
// <Select> primitive.
//
// Tightened by #192 (Tasks port): the two Tasks exceptions and record-details-panel.tsx (deleted
// by the port) all moved to the shared `useListboxPopover` / `<Select>` pattern on v4, so the
// invariant now holds with no Tasks carve-out. An allowlist entry pointing at a deleted file is
// silently vacuous either way (`allowedRawSelectFiles.has()` on a path `listNonTestSource` never
// yields), but leaving it would misdescribe the current exception set to the next reader.
// ════════════════════════════════════════════════════════════════════════════
describe('RI-IXD-5: no raw select outside documented Tasks exceptions', () => {
  const allowedRawSelectFiles = new Set([
    'components/ui/select.tsx',
  ])

  it('pages/components bounded-choice dropdowns import the shared Select primitive', () => {
    const roots = [resolve(SRC, 'pages'), resolve(SRC, 'components')]
    const offenders: string[] = []

    for (const root of roots) {
      for (const file of listNonTestSource(root)) {
        if (!file.endsWith('.tsx')) continue
        const rel = srcRel(file)
        if (allowedRawSelectFiles.has(rel)) continue
        if (/<select\b/.test(readFileSync(file, 'utf8'))) offenders.push(rel)
      }
    }

    expect(offenders).toEqual([])
  })
})

// ════════════════════════════════════════════════════════════════════════════
// RI-IXD-7: Orange is a brand sprinkle only. DESIGN.md permits brand-orange
// for tokens, the logo dot, and the active DB-view tab underline. It must not
// reappear as an action/link/status affordance.
// ════════════════════════════════════════════════════════════════════════════
describe('RI-IXD-7: no brand-orange outside the logo, active view-tab underline, and token definitions', () => {
  const allowedBrandOrangeFiles = new Set([
    'index.css',
    'shell/top-bar.tsx',
    'components/tasks/TasksWorkspace.css',
    'components/ui/view-tabs.css',
    'components/ui/view-tabs.tsx',
    'styles/tokens/theme-dark.css',
    'styles/tokens/theme-light.css',
  ])

  it('non-test source keeps brand-orange off interactive/status surfaces', () => {
    const offenders: string[] = []

    for (const file of listNonTestSource(SRC)) {
      const rel = srcRel(file)
      if (allowedBrandOrangeFiles.has(rel)) continue
      if (/\bbrand-orange\b|--brand-orange/.test(readFileSync(file, 'utf8'))) {
        offenders.push(rel)
      }
    }

    expect(offenders).toEqual([])
  })
})

// ════════════════════════════════════════════════════════════════════════════
// RI-IXD-8: Retrofit list/table targets stay on the shared table + state kit.
// These are the audit §F surfaces that were explicitly rebuilt away from
// private list grammar in feat/ui-coherence.
// ════════════════════════════════════════════════════════════════════════════
describe('RI-IXD-8: retrofit list/table targets import DataTable and state-kit', () => {
  const sharedTableTargets = [
    'pages/follow-ups-page.tsx',
    'pages/kitchen-stock-page.tsx',
    'pages/kitchen-pushes-page.tsx',
    'pages/kitchen-plan-page.tsx',
    'pages/kitchen-log-page.tsx',
    'pages/kitchen-review-page.tsx',
  ]

  for (const file of sharedTableTargets) {
    it(`${file} uses the shared DataTable and state-kit`, () => {
      const body = readSrc(file)
      expect(body).toMatch(/@\/components\/dashboard\/data-table/)
      expect(body).toMatch(/@\/components\/ui\/state-kit/)
    })
  }
})

// ════════════════════════════════════════════════════════════════════════════
// AC-064: DESIGN.md carries the Home Signal-tail amendment verbatim (#746).
// ════════════════════════════════════════════════════════════════════════════
describe('AC-064 — DESIGN.md carries the Home Signal-tail amendment verbatim', () => {
  // Doc-grep: the amendment is owner law (#746 made Home rows a read-only feed and recorded the
  // rule in DESIGN.md § Signal row (v4)). Grep the body sentence so a rewording — the thing the
  // verbatim rule exists to prevent — fails here, not silently.
  const DESIGN = readFileSync(resolve(process.cwd(), '../DESIGN.md'), 'utf8')

  it('the read-only-feed paragraph sits under § Signal row (v4) with the amendment text', () => {
    const section = DESIGN.slice(DESIGN.indexOf('### Signal row (v4)'))
    expect(section).toMatch(/Home rows carry \*\*no per-row actions and no visibility line\*\*; `Create task` and `Add category` live on the Signal record and the archive Feed\. The row's whole surface opens the record\./)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// AC-029: DESIGN.md carries the Offline amendment verbatim (#802).
// ════════════════════════════════════════════════════════════════════════════
describe('AC-029 — DESIGN.md carries the Offline amendment verbatim', () => {
  const DESIGN = readFileSync(resolve(process.cwd(), '../DESIGN.md'), 'utf8')

  it('the offline paragraph sits under § Component and state conformance matrix, after the table', () => {
    const section = DESIGN.slice(DESIGN.indexOf('### Component and state conformance matrix'))
    const amendment =
      "**Offline is an error, not a crash.** A failed fetch renders `ErrorState` with `Retry` inside the page frame; the rail and header stay. While the browser reports offline, the header shows one muted line `You're offline`. The crash boundary is reserved for exceptions in rendering."
    expect(section).toContain(amendment)
    // After the table, not inside it: the last table row ends before the paragraph starts.
    expect(section.indexOf('| Management |')).toBeLessThan(section.indexOf(amendment))
  })
})
