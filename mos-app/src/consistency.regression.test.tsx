// Regression invariants for the whole-app consistency pass (PR-1).
// Each describe carries an AC-style id (RI-*) so `grep -r RI-XXX` finds the proof.
// Layering: source-scan for source-level conventions (RI-VIS-1/VIS-2/IXD-1 — mirrors the
// TaskSurface.css.test.ts fs-read pattern), rendered for the route-head contract (RI-IA-1).
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { AuthContext } from './auth/context'
import type { AuthState } from './auth/context'

// ── DB mocks (all pending/empty → pages still mount their <PageHead> synchronously) ──
vi.mock('./lib/db/tasks', () => ({
  listTasks: vi.fn(() => new Promise(() => {})),
  getTaskTitlesByIds: vi.fn(() => Promise.resolve([])),
}))
vi.mock('./lib/db/ops-log', () => ({
  listLogEntries: vi.fn(() => new Promise(() => {})),
  archiveLogEntry: vi.fn(),
  unarchiveLogEntry: vi.fn(),
  addLogEntry: vi.fn(),
  editLogEntry: vi.fn(),
  getTodayOpsSummary: vi.fn(() => new Promise(() => {})),
}))
vi.mock('./lib/db/directory', () => ({
  getBusinessUnits: vi.fn(() => new Promise(() => {})),
  getPeople: vi.fn(() => new Promise(() => {})),
}))
vi.mock('./lib/db/weekly-updates', () => ({
  getMyUpdate: vi.fn(() => new Promise(() => {})),
  upsertDraft: vi.fn(),
  submit: vi.fn(),
  reopen: vi.fn(),
  addLine: vi.fn(),
  updateLine: vi.fn(),
  removeLine: vi.fn(),
  listTeamUpdates: vi.fn(() => Promise.resolve([])),
}))
vi.mock('./lib/db/team', () => ({ getTeamForManager: vi.fn(() => Promise.resolve([])) }))

import { MyWeek } from './pages/my-week'
import { UpdatesPage } from './pages/updates-page'
import { OpsPage } from './pages/ops-page'
import { TasksLayout } from './pages/tasks-layout'
import { PageFrame } from './shell/page-frame'

const authedState: AuthState = {
  status: 'authenticated',
  viewer: {
    person: {
      id: 'p1', org_id: 'org', user_id: 'u1', full_name: 'Test User',
      email: null, archived_at: null,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    },
    roles: [],
    isManager: false,
    accessRoles: [],
  },
  signOut: async () => {},
}

function withAuth(node: React.ReactNode) {
  return render(<AuthContext.Provider value={authedState}>{node}</AuthContext.Provider>)
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

  it('WeeklyUpdateReviewPane.css avatar gradient (.wup-review-avatar) uses navy→primary, never violet', () => {
    const css = readSrc('components/weekly/WeeklyUpdateReviewPane.css')
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
  it('OpsAddForm inline .tc-field-error / .tc-submit-error text color is --status-lost-text', () => {
    const src = readSrc('pages/ops-add-form.tsx')
    for (const sel of ['.tc-field-error', '.tc-submit-error']) {
      const body = ruleBody(src, sel)
      // ADR-0009: tokens are now resolved color(display-p3 …) consumed as var(--token); hsl() wrapper retired.
      expect(body).toMatch(/color:\s*var\(--status-lost-text\)/)
      expect(body).not.toMatch(/color:\s*var\(--destructive\)\s*;/)
    }
  })

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

  it('/ (MyWeek) renders the shared PageHead and no bespoke page-title element', () => {
    const { container } = withAuth(<MemoryRouter><MyWeek /></MemoryRouter>)
    expect(container.querySelector('[data-testid="page-head"]')).toBeTruthy()
    expect(container.querySelector('[class*="page-title"]')).toBeNull()
  })

  it('/updates (UpdatesPage) renders the shared PageHead and no bespoke page-title element', () => {
    const { container } = withAuth(<MemoryRouter><UpdatesPage /></MemoryRouter>)
    expect(container.querySelector('[data-testid="page-head"]')).toBeTruthy()
    expect(container.querySelector('[class*="page-title"]')).toBeNull()
  })

  it('/ops (OpsPage) renders the shared PageHead and no bespoke page-title element', () => {
    const { container } = withAuth(<MemoryRouter><OpsPage /></MemoryRouter>)
    expect(container.querySelector('[data-testid="page-head"]')).toBeTruthy()
    expect(container.querySelector('[class*="page-title"]')).toBeNull()
  })

  it('/tasks (TasksLayout → TasksWorkspace) renders the shared PageHead and no bespoke page-title element', () => {
    const { container } = withAuth(
      <MemoryRouter initialEntries={['/tasks']}><TasksLayout /></MemoryRouter>,
    )
    expect(container.querySelector('[data-testid="page-head"]')).toBeTruthy()
    expect(container.querySelector('[class*="page-title"]')).toBeNull()
  })
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
// raw pill shell outside the shared <Pill> (VIS-4, PR-2). The My Week strips +
// the Ops source badge re-skin onto <Pill>; the weekly <StatePill> does too.
// ════════════════════════════════════════════════════════════════════════════
describe('RI-VIS-4: no bespoke pillStyle / wup-state-* raw pill outside <Pill>', () => {
  it('MyWeek.tsx no longer hand-rolls a pillStyle object (the strips use <Pill>)', () => {
    const src = readSrc('pages/my-week.tsx')
    expect(src).not.toMatch(/\bpillStyle\b/)
    expect(src).toMatch(/from '@\/components\/ui\/pill'/)
  })

  it('no non-test source renders a wup-state-* or ops-source-badge className (raw pill shells)', () => {
    const offenders: string[] = []
    for (const f of listNonTestSource(SRC)) {
      if (!f.endsWith('.tsx')) continue
      const body = readFileSync(f, 'utf8')
      if (/className=["'`{][^"'`}]*\b(?:wup-state-|ops-source-badge)\b/.test(body)) offenders.push(f)
    }
    // ops-source-badge survives only as a data-testid (on the Pill wrapper), never a className
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
// RI-IA-2: ONE breadcrumb — no in-page .tc-breadcrumb (the shell <Breadcrumb> in
// shell/Header.tsx is the single wayfinding home and extends to the leaf; one ›
// separator throughout). IA-2, PR-2.
// ════════════════════════════════════════════════════════════════════════════
describe('RI-IA-2: no in-page .tc-breadcrumb (one shell breadcrumb, › separator)', () => {
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

  it('the shell <Breadcrumb> renders the › separator (single breadcrumb system)', () => {
    expect(readSrc('shell/breadcrumb.tsx')).toMatch(/›/)
  })
})
