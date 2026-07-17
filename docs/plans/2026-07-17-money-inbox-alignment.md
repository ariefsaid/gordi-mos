# Money + Inbox alignment — design + implementation plan (Redesign Step 9)

**Spec:** `docs/specs/money-inbox-alignment.spec.md` (FR-900..910, NFR-900..903, OBS-900, AC-900..909)
**Buildout step:** `docs/plans/2026-07-14-redesign-buildout.md` step 9 ("Money + Inbox alignment")
**Branch:** `feat/redesign-step9-money-inbox`, stacked on the tip of `feat/redesign-step8-*` once step 8
exists (per `docs/plans/AUTONOMOUS-RUN-STATE.md`'s branch convention); if step 8 has not yet cut a branch
when this step starts, stack on `origin/feat/redesign-buildout` and re-base once step 8 lands.
**Reviews required before merge:** code review (cross-family) **and** the 4-lens design review (Visual ·
IxD · IA · Product/Intent), both recorded in `docs/reviews/<branch>.md`, per the standing buildout gate
(`docs/plans/2026-07-14-redesign-buildout.md` "Standing acceptance" / `docs/plans/CLOUD-AGENT-HANDOFF.md`
§1). `security-auditor` is **not** required (no auth/RLS/schema path touched — NFR-901).

**Scope card (state in every review dispatch):**
- **IN SCOPE:** the Follow-up queue extraction (one hook + one table, §2 below), Door 1
  (`/work/tasks?view=followups` goes live behind `SHOW_FOLLOWUPS`), Door 2 (`/money/follow-ups` route +
  a discoverable link from Money), zero schema/RLS change, zero Inbox change.
- **DEFERRED (do not fail these here):** flipping `SHOW_FOLLOWUPS` to `true` in production (owner gate,
  §10 of the spec); Home's `data-money-ar-slot`; a live overdue-count badge on the Door 2 link; any
  visual/mockup-ratified treatment of a Money/Follow-ups screen (none exists yet).

## 0. Design recap (no new decisions — this section restates the spec's §5 for the builder)

One data/behavior hook (`useFollowUpQueue`) and one presentational renderer
(`FollowUpQueueTable`) are extracted from the existing `FollowUpsPage`. Three consumers compose them,
never re-implementing table columns, lifecycle-action handlers, or the detail aside:

1. `FollowUpsPage` (existing canonical page, rewired) — `/work/follow-ups`, `/work/follow-ups/:id`.
2. `FollowUpQueueEmbed` (new) — mounted inside `TasksWorkspace`'s reserved-`followups` branch — Door 1.
3. `FollowUpsPage` again, mounted at a second route `/money/follow-ups` — Door 2 (no new component; the
   canonical page is simply reachable from a second route, which is exactly "one record, many
   presentations" — Door 2 does not need its own page component).

Every row's source link resolves to `/work/follow-ups/:id` regardless of which door rendered it — there
is exactly one canonical record URL (FR-906).

## 1. Task list (TDD-first; each task 2–5 minutes; run from `mos-app/`)

Tasks are grouped into three independent tracks (see §3 parallelization map). Within a track, tasks run
in the given order; RED tasks must fail for the stated reason before the paired GREEN task is written.

### Track A — Door 2 (Money route + discoverable link) — independent of Tracks B/C

**T-A1 (RED). Add the router contract test for `/money/follow-ups`.**

File: `mos-app/src/router.test.tsx` — inside the existing `describe('AC-006: Money canonical routes +
redirects', ...)` block (after the `it('AC-006: /plan/budget + /plan/pricing redirect...')` case), add:

```tsx
  it('AC-900: /money/follow-ups sits under RequireAccessRole anyOf={finance,admin} and stays gated by SHOW_FOLLOWUPS', () => {
    const gate = shellChildren().find(
      (r) => Array.isArray(r.children) && r.children.some((c) => c.path === 'money/follow-ups'),
    )!
    expect(gate.element).toEqual(<RequireAccessRole anyOf={['finance', 'admin']} />)
    const route = gate.children!.find((r) => r.path === 'money/follow-ups')!
    // flag-off branch redirects to /; the route is present either way (mirrors the existing
    // /work/follow-ups/:id D-2 deep-link contract test above).
    expect([<FollowUpsPage />, <Navigate to="/" replace />]).toContainEqual(route.element)
  })
```

Verify (expect FAIL — no `money/follow-ups` route exists yet):
```bash
cd mos-app && npx vitest run src/router.test.tsx -t "AC-900"
```

**T-A2 (GREEN). Add the `/money/follow-ups` route.**

File: `mos-app/src/router.tsx` — inside the Money `RequireAccessRole` group (after the `money/pricing`
line, currently line 129), add:

```tsx
              { path: 'money/follow-ups', element: SHOW_FOLLOWUPS ? <FollowUpsPage /> : <Navigate to="/" replace /> },
```

`FollowUpsPage` and `SHOW_FOLLOWUPS` are already imported at the top of `router.tsx` — no import changes.

Verify:
```bash
cd mos-app && npx vitest run src/router.test.tsx -t "AC-900"
```

**T-A3 (RED). Add the Door-2 absent-by-default test (real flag).**

File: `mos-app/src/pages/dashboard-page.test.tsx` — add a new top-level `describe` (after the existing
`describe('DashboardPage — states', ...)` block):

```tsx
describe('DashboardPage — Follow-up queue door (Step 9, AC-903)', () => {
  it('AC-903: hides the Follow-up queue link while SHOW_FOLLOWUPS is dark-launched off', () => {
    mockRev.mockReturnValue(new Promise(() => {}))
    mockMarg.mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.queryByRole('link', { name: 'Follow-up queue' })).not.toBeInTheDocument()
  })
})
```

Verify (expect PASS trivially today — there is no link yet — this is a regression guard, not a
red/green pair; run it to confirm it compiles and is wired correctly):
```bash
cd mos-app && npx vitest run src/pages/dashboard-page.test.tsx -t "AC-903"
```

**T-A4 (RED). Add the Door-2 discoverability test (flag on, sibling file).**

New file: `mos-app/src/pages/dashboard-page.followups-door.test.tsx` (sibling flag-variant file, mirrors
the existing `my-week.hidden.test.tsx` pattern):

```tsx
// DashboardPage — the Money queue-entry door (Step 9, AC-902). Sibling flag-variant
// test file (mirrors my-week.hidden.test.tsx): dashboard-page.test.tsx keeps testing
// the real (flag-off) default; this file owns the flag-on path.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/config/features', async () => {
  const actual = await vi.importActual<typeof import('@/config/features')>('@/config/features')
  return { ...actual, SHOW_FOLLOWUPS: true }
})
vi.mock('@/lib/db/reporting', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/reporting')>('@/lib/db/reporting')
  return { ...actual, listSalesDailyRevenue: vi.fn(() => new Promise(() => {})) }
})
vi.mock('@/lib/db/reporting-margin', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/reporting-margin')>('@/lib/db/reporting-margin')
  return { ...actual, listSalesMarginDaily: vi.fn(() => new Promise(() => {})) }
})

import { DashboardPage } from './dashboard-page'

describe('DashboardPage — Follow-up queue door (Step 9, AC-902)', () => {
  it('AC-902: shows a real Link to /money/follow-ups when SHOW_FOLLOWUPS is on', () => {
    render(
      <MemoryRouter initialEntries={['/money']}>
        <DashboardPage />
      </MemoryRouter>,
    )
    const link = screen.getByRole('link', { name: 'Follow-up queue' })
    expect(link).toHaveAttribute('href', '/money/follow-ups')
  })
})
```

Verify (expect FAIL — no link rendered yet):
```bash
cd mos-app && npx vitest run src/pages/dashboard-page.followups-door.test.tsx
```

**T-A5 (GREEN). Add the Door-2 link to `DashboardChrome`.**

File: `mos-app/src/pages/dashboard-page.tsx`:

1. Change the react-router-dom import (currently `import { useSearchParams } from 'react-router-dom'`)
   to:
```tsx
import { Link, useSearchParams } from 'react-router-dom'
```

2. Add, immediately after that import:
```tsx
import { SHOW_FOLLOWUPS } from '@/config/features'
```

3. In the `DashboardChrome` function (near the bottom of the file), change:
```tsx
function DashboardChrome(props: DashboardChromeProps) {
  return (
    <>
      <GlobalToolbar
        cut={props.cut}
        onCutChange={props.onCut}
        window={props.windowSpec}
        onWindowChange={props.onWindow}
        bounds={props.bounds}
        snapshotAsOf={props.snapshotAsOf}
      />
      <ViewTabs
        ariaLabel="Dashboard view"
        tabs={[
          { id: 'summary', label: 'Summary' },
          { id: 'detail', label: 'Detail' },
        ]}
        active={props.tab}
        onChange={props.onTab}
        trailing={props.trailing}
      />
    </>
  )
}
```
to:
```tsx
function DashboardChrome(props: DashboardChromeProps) {
  return (
    <>
      <GlobalToolbar
        cut={props.cut}
        onCutChange={props.onCut}
        window={props.windowSpec}
        onWindowChange={props.onWindow}
        bounds={props.bounds}
        snapshotAsOf={props.snapshotAsOf}
      />
      <ViewTabs
        ariaLabel="Dashboard view"
        tabs={[
          { id: 'summary', label: 'Summary' },
          { id: 'detail', label: 'Detail' },
        ]}
        active={props.tab}
        onChange={props.onTab}
        trailing={props.trailing}
      />
      {SHOW_FOLLOWUPS && (
        <div className="dash-queue-entry">
          <Link to="/money/follow-ups" className="btn btn-outline">Follow-up queue</Link>
        </div>
      )}
    </>
  )
}
```

4. File: `mos-app/src/pages/dashboard-page.css` — add at the end:
```css
.dash-queue-entry {
  padding: 0 24px;
  margin-top: 4px;
}
@media (max-width: 767px) {
  .dash-queue-entry {
    padding: 0 14px;
  }
}
```

Verify:
```bash
cd mos-app && npx vitest run src/pages/dashboard-page.test.tsx src/pages/dashboard-page.followups-door.test.tsx
```
All of AC-902/AC-903 green; the rest of `dashboard-page.test.tsx` (AC-004/021/022/023/etc.) still green
(no unrelated regression).

### Track B — extract the one canonical Follow-up renderer (blocks Track C)

**T-B1 (refactor under the existing green safety net). Extract `useFollowUpQueue`.**

New file: `mos-app/src/components/follow-ups/use-follow-up-queue.ts`:

```ts
// useFollowUpQueue — the single data/behavior hook behind every Follow-up queue
// door (Money queue entry, Work Tasks saved-view, and the canonical
// /work/follow-ups record page). Money-inbox-alignment (Step 9, FR-905/AC-906/
// AC-907): extracted verbatim from FollowUpsPage so the record has ONE canonical
// behavior implementation reached from multiple destinations (ADR-0025 D9;
// experience-contract Rule 2 "Follow-up" row).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { getBusinessUnits } from '@/lib/db/directory'
import { canWorkAnyLane } from '@/lib/follow-up-lanes'
import {
  listFollowUps,
  transitionFollowUp,
  isOverdue,
  type FollowUpRow,
  type FollowUpTransition,
} from '@/lib/db/follow-ups'

export type FollowUpFetchState = 'loading' | 'ready' | 'error'

export interface FollowUpTransitionForm {
  amount: string
  cash_in_date: string
  evidence: string
  promise_date: string
  note: string
}

export interface UseFollowUpQueueOptions {
  /** the follow-up id whose detail aside should open (the canonical /work/follow-ups/:id route). */
  detailId?: string
}

export interface FollowUpQueueState {
  rows: FollowUpRow[]
  state: FollowUpFetchState
  error: string | null
  overdueCount: number
  canConfirm: boolean
  canChase: boolean
  active: { id: string; verb: FollowUpTransition } | null
  form: FollowUpTransitionForm
  detailRow: FollowUpRow | null
  setForm: (form: FollowUpTransitionForm) => void
  load: () => void
  run: (row: FollowUpRow, verb: FollowUpTransition) => Promise<void>
  submit: (row: FollowUpRow, verb: FollowUpTransition) => Promise<void>
}

const EMPTY_FORM: FollowUpTransitionForm = { amount: '', cash_in_date: '', evidence: '', promise_date: '', note: '' }

export function useFollowUpQueue({ detailId }: UseFollowUpQueueOptions = {}): FollowUpQueueState {
  const auth = useAuth()
  const [params] = useSearchParams()
  const viewer = auth.status === 'authenticated' ? auth.viewer : null
  const accessRoles = useMemo(() => viewer?.accessRoles ?? [], [viewer])
  const canConfirm = accessRoles.includes('finance') || accessRoles.includes('admin')
  const [canChase, setCanChase] = useState(accessRoles.includes('admin'))
  const [rows, setRows] = useState<FollowUpRow[]>([])
  const [state, setState] = useState<FollowUpFetchState>('loading')
  const [active, setActive] = useState<{ id: string; verb: FollowUpTransition } | null>(null)
  const [form, setForm] = useState<FollowUpTransitionForm>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    let cancelled = false
    setState('loading')
    setError(null)
    listFollowUps({ overdue: params.get('filter') === 'overdue' })
      .then((data) => { if (!cancelled) { setRows(data); setState('ready') } })
      .catch((err: unknown) => { if (!cancelled) { setError(err instanceof Error ? err.message : String(err)); setState('error') } })
    return () => { cancelled = true }
  }, [params])

  useEffect(() => load(), [load])

  useEffect(() => {
    if (!viewer) return
    let cancelled = false
    getBusinessUnits()
      .then((bus) => {
        if (!cancelled) setCanChase(canWorkAnyLane(viewer.roles, bus, accessRoles))
      })
      .catch(() => setCanChase(accessRoles.includes('admin')))
    return () => { cancelled = true }
  }, [accessRoles, viewer])

  const overdueCount = useMemo(() => rows.filter((row) => isOverdue(row)).length, [rows])

  const run = useCallback(async (row: FollowUpRow, verb: FollowUpTransition) => {
    if (verb === 'partial' || verb === 'settle' || verb === 'promise') {
      setActive({ id: row.id, verb })
      setForm({ ...EMPTY_FORM, amount: verb === 'settle' ? String(row.running_balance) : '' })
      return
    }
    await transitionFollowUp(row.id, verb, {})
    load()
  }, [load])

  const submit = useCallback(async (row: FollowUpRow, verb: FollowUpTransition) => {
    const payload = verb === 'promise'
      ? { promise_date: form.promise_date, note: form.note }
      : { amount: Number(form.amount || row.running_balance), cash_in_date: form.cash_in_date, evidence: form.evidence, note: form.note }
    await transitionFollowUp(row.id, verb, payload)
    setActive(null)
    load()
  }, [form, load])

  const detailRow = rows.find((row) => row.id === (active?.id ?? detailId)) ?? null

  return { rows, state, error, overdueCount, canConfirm, canChase, active, form, detailRow, setForm, load, run, submit }
}
```

No test file for this task alone — its correctness is proven by T-B3's verify step (the existing
`follow-ups-page.test.tsx` staying green, per NFR-902/AC-906). This is a same-behavior extraction under
an existing green safety net, not new behavior requiring its own new failing test (TDD's refactor step).

Verify (compiles only — the page does not use it yet):
```bash
cd mos-app && npx tsc -b --noEmit -p .
```

**T-B2 (refactor). Extract `FollowUpQueueTable`.**

New file: `mos-app/src/components/follow-ups/follow-up-queue-table.tsx`:

```tsx
// FollowUpQueueTable — the ONE canonical Follow-up record renderer (table +
// lifecycle actions + detail aside). Reused by every door: the canonical page
// (FollowUpsPage, at /work/follow-ups and /money/follow-ups) and the Work
// Tasks saved-view embed (FollowUpQueueEmbed). Money-inbox-alignment (Step 9,
// FR-905/AC-906/AC-907). Presentational only — all data/behavior lives in
// useFollowUpQueue.
import { Link } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/state-kit'
import { StatusPill, type TaskStatus } from '@/components/tasks/status-pill'
import { isOverdue, type FollowUpRow, type FollowUpState, type FollowUpTransition } from '@/lib/db/follow-ups'
import type { FollowUpQueueState } from './use-follow-up-queue'

const money = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })

function nextActions(row: FollowUpRow, canConfirm: boolean, canChase: boolean): FollowUpTransition[] {
  if (row.state === 'settled') return canConfirm ? ['confirm'] : []
  if (row.state === 'confirmed') return []
  if (!canChase) return []
  return ['chase', 'promise', 'partial', 'settle']
}

function followUpStatusTone(state: FollowUpState): TaskStatus {
  if (state === 'open') return 'Open'
  if (state === 'confirmed') return 'Done'
  return 'In Progress'
}

export function FollowUpQueueTable({ queue }: { queue: FollowUpQueueState }) {
  const t = useT()
  const isDesktop = useIsDesktop()
  const { rows, state, error, canConfirm, canChase, active, form, detailRow, setForm, load, run, submit } = queue

  function renderTransitionForm(row: FollowUpRow, verb: FollowUpTransition) {
    if (verb === 'chase' || verb === 'confirm') return null
    const formReady = verb === 'promise'
      ? !!form.promise_date
      : !!form.cash_in_date && !!form.evidence && !!form.amount

    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {verb === 'promise' ? (
          <input
            aria-label={t('followUps.promiseDate')}
            type="date"
            value={form.promise_date}
            onChange={(e) => setForm({ ...form, promise_date: e.target.value })}
          />
        ) : (
          <>
            <input
              aria-label={t('followUps.amountInput')}
              type="number"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
            <input
              aria-label={t('followUps.cashInDate')}
              type="date"
              value={form.cash_in_date}
              onChange={(e) => setForm({ ...form, cash_in_date: e.target.value })}
            />
            <input
              aria-label={t('followUps.evidence')}
              placeholder={t('followUps.evidence')}
              value={form.evidence}
              onChange={(e) => setForm({ ...form, evidence: e.target.value })}
            />
          </>
        )}
        <Button variant="primary" disabled={!formReady} onClick={() => void submit(row, verb)}>
          {t('followUps.submit')}
        </Button>
      </div>
    )
  }

  const columns: DataTableColumn<FollowUpRow>[] = [
    {
      key: 'counterparty',
      header: t('followUps.counterparty'),
      cardLabel: '',
      render: (row) => (
        <div>
          <strong>{row.counterparty}</strong>
          <br />
          <Link
            to={`/work/follow-ups/${row.id}`}
            aria-label={`Read-only source ${row.source_invoice_ref ?? row.id}`}
          >
            {row.source_invoice_ref ?? row.kind}
          </Link>
        </div>
      ),
    },
    {
      key: 'original_amount',
      header: t('followUps.amount'),
      numeric: true,
      render: (row) => money.format(row.original_amount),
    },
    {
      key: 'running_balance',
      header: t('followUps.balance'),
      numeric: true,
      render: (row) => money.format(row.running_balance),
    },
    {
      key: 'state',
      header: t('followUps.state'),
      render: (row) => <StatusPill status={followUpStatusTone(row.state)} label={row.state} />,
    },
    {
      key: 'due_date',
      header: t('followUps.due'),
      render: (row) => (
        <>
          {row.due_date ?? '—'}
          {isOverdue(row) ? ` · ${t('followUps.overdue')}` : ''}
        </>
      ),
    },
    {
      key: 'actions',
      header: t('followUps.actions'),
      render: (row) => {
        const actions = nextActions(row, canConfirm, canChase)
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {actions.length === 0 && <span style={{ color: 'var(--muted-foreground)' }}>—</span>}
              {actions.map((verb) => (
                <Button key={verb} variant="outline" onClick={() => void run(row, verb)}>
                  {t(`followUps.action.${verb}`)}
                </Button>
              ))}
            </div>
          </div>
        )
      },
    },
  ]

  return (
    <>
      {state === 'loading' && <SkeletonRows count={5} />}
      {state === 'error' && (
        <ErrorState message={error ?? t('followUps.error')} onRetry={() => { load() }} />
      )}
      {state === 'ready' && rows.length === 0 && <EmptyState title={t('followUps.empty')} />}
      {state === 'ready' && rows.length > 0 && (
        <DataTable columns={columns} rows={rows} isDesktop={isDesktop} caption={t('followUps.title')} />
      )}
      {state === 'ready' && detailRow && (
        <aside
          role="complementary"
          aria-label="Follow-up detail"
          style={{
            marginTop: 16,
            padding: 16,
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--card)',
            boxShadow: 'var(--shadow-rest)',
          }}
        >
          <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>{detailRow.counterparty}</h2>
          <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '6px 12px', margin: '0 0 12px' }}>
            <dt style={{ color: 'var(--muted-foreground)' }}>Source</dt>
            <dd style={{ margin: 0 }}>{detailRow.source_invoice_ref ?? detailRow.kind}</dd>
            <dt style={{ color: 'var(--muted-foreground)' }}>State</dt>
            <dd style={{ margin: 0 }}>
              <StatusPill status={followUpStatusTone(detailRow.state)} label={detailRow.state} />
            </dd>
            <dt style={{ color: 'var(--muted-foreground)' }}>Running balance</dt>
            <dd className="tabular" style={{ margin: 0 }}>{money.format(detailRow.running_balance)}</dd>
          </dl>
          {active?.id === detailRow.id && renderTransitionForm(detailRow, active.verb)}
        </aside>
      )}
    </>
  )
}
```

Verify (compiles only — the page does not use it yet):
```bash
cd mos-app && npx tsc -b --noEmit -p .
```

**T-B3 (GREEN — proves the extraction is behavior-preserving). Rewrite `FollowUpsPage`.**

File: `mos-app/src/pages/follow-ups-page.tsx` — replace the entire file with:

```tsx
// FollowUpsPage — the canonical Follow-up queue page (/work/follow-ups,
// /work/follow-ups/:id, and — after Step 9 — /money/follow-ups). Composes the
// shared useFollowUpQueue hook + FollowUpQueueTable renderer — the SAME
// components the Work Tasks saved-view embed uses (FR-905/AC-906/AC-907,
// ADR-0025 D9). Rendered behavior is unchanged from the pre-Step-9
// implementation; only the PageFrame/PageHead chrome stays owned here.
import { useParams } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { PageFrame } from '@/shell/page-frame'
import { PageHead } from '@/shell/page-head'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useFollowUpQueue } from '@/components/follow-ups/use-follow-up-queue'
import { FollowUpQueueTable } from '@/components/follow-ups/follow-up-queue-table'

export function FollowUpsPage() {
  useDocumentTitle('Follow-up queue — Gordi MOS')
  const t = useT()
  const route = useParams<{ id?: string }>()
  const queue = useFollowUpQueue({ detailId: route.id })

  return (
    <PageFrame variant="data">
      <PageHead
        variant="content"
        title={t('followUps.title')}
        count={queue.state === 'ready' ? queue.rows.length : null}
        meta={<span>{t('followUps.overdue')}: {queue.overdueCount}</span>}
      />
      <FollowUpQueueTable queue={queue} />
    </PageFrame>
  )
}
```

Verify (this is the load-bearing regression proof — NFR-902/AC-906 — run the file UNMODIFIED):
```bash
cd mos-app && npx vitest run src/pages/follow-ups-page.test.tsx
```
Every existing assertion (AC-520, AC-521, AC-513, loading/empty/error) must pass with zero edits to
`follow-ups-page.test.tsx`. If anything fails, the extraction changed behavior — fix the new files, never
the test.

### Track C — Door 1 (Work → Tasks embed) — depends on Track B (T-B1/T-B2)

**T-C1 (RED). Add `FollowUpQueueEmbed`'s own test.**

New file: `mos-app/src/components/follow-ups/follow-up-queue-embed.test.tsx`:

```tsx
// FollowUpQueueEmbed — Door 1's mount point (Step 9, AC-904/907/908). Proves it
// composes the SAME hook + table pair the canonical FollowUpsPage uses.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { AuthState } from '@/auth/context'
import { AuthContext } from '@/auth/context'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('@/lib/db/directory', () => ({ getBusinessUnits: vi.fn() }))
vi.mock('@/lib/db/follow-ups', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/follow-ups')>('@/lib/db/follow-ups')
  return { ...actual, listFollowUps: vi.fn(), transitionFollowUp: vi.fn() }
})

import { getBusinessUnits } from '@/lib/db/directory'
import { listFollowUps, type FollowUpRow } from '@/lib/db/follow-ups'
import { FollowUpQueueEmbed } from './follow-up-queue-embed'

const mockGetBusinessUnits = vi.mocked(getBusinessUnits)
const mockListFollowUps = vi.mocked(listFollowUps)

const row: FollowUpRow = {
  id: 'fu-1', org_id: 'org-1', counterparty: 'PT Big Buyer', kind: 'b2b_ar', lane: 'b2b_sales',
  source_invoice_ref: 'INV-1001', original_amount: 1000000, running_balance: 1000000, state: 'open',
  promise_date: null, issued_date: '2026-06-01', due_date: '2026-06-30', assigned_to: null, notes: null,
  created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
}

const viewer: AuthState = {
  status: 'authenticated',
  viewer: {
    person: { id: 'p1', org_id: 'org-1', user_id: 'u1', full_name: 'Sales', email: null, archived_at: null, created_at: '', updated_at: '' },
    roles: [{ id: 'r1', org_id: 'org-1', business_unit_id: 'bu-sales', name: 'Sales Lead', reports_to_role_id: null, created_at: '', updated_at: '' }],
    isManager: false,
    accessRoles: [],
  },
  signOut: vi.fn(),
}

function renderEmbed() {
  return render(
    <I18nProvider>
      <AuthContext.Provider value={viewer}>
        <MemoryRouter initialEntries={['/work/tasks?view=followups']}>
          <FollowUpQueueEmbed />
        </MemoryRouter>
      </AuthContext.Provider>
    </I18nProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetBusinessUnits.mockResolvedValue([{ id: 'bu-sales', name: 'B2B Sales', code: 'b2b_sales' }])
  mockListFollowUps.mockResolvedValue([row])
})

describe('FollowUpQueueEmbed', () => {
  it('AC-904: renders the live queue via the same table used by the canonical page', async () => {
    renderEmbed()
    expect(await screen.findByText('PT Big Buyer')).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Follow-up queue' })).toBeInTheDocument()
  })

  it('AC-907: exposes the same lifecycle-action buttons as the canonical page', async () => {
    renderEmbed()
    await screen.findByText('PT Big Buyer')
    expect(screen.getByRole('button', { name: 'Chase' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Settle' })).toBeInTheDocument()
  })

  it('AC-908: the row source link points at the canonical /work/follow-ups/:id route', async () => {
    renderEmbed()
    await screen.findByText('PT Big Buyer')
    expect(screen.getByRole('link', { name: /Read-only source INV-1001/ })).toHaveAttribute(
      'href', '/work/follow-ups/fu-1',
    )
  })
})
```

Verify (expect FAIL — `follow-up-queue-embed.tsx` does not exist yet):
```bash
cd mos-app && npx vitest run src/components/follow-ups/follow-up-queue-embed.test.tsx
```

**T-C2 (GREEN). Implement `FollowUpQueueEmbed`.**

New file: `mos-app/src/components/follow-ups/follow-up-queue-embed.tsx`:

```tsx
// FollowUpQueueEmbed — Door 1 (Work → Tasks saved-view `?view=followups`).
// Money-inbox-alignment (Step 9, FR-903/AC-904). Renders the SAME
// useFollowUpQueue + FollowUpQueueTable pair as the canonical FollowUpsPage —
// no second table/detail implementation (Rule 11, FR-905). No PageFrame/
// PageHead: this mounts inside TasksWorkspace's own content region (Rule 6),
// which owns the region landmark + aria-label around both the placeholder and
// live states.
import { useFollowUpQueue } from './use-follow-up-queue'
import { FollowUpQueueTable } from './follow-up-queue-table'

export function FollowUpQueueEmbed() {
  const queue = useFollowUpQueue()
  return <FollowUpQueueTable queue={queue} />
}
```

Verify:
```bash
cd mos-app && npx vitest run src/components/follow-ups/follow-up-queue-embed.test.tsx
```

**T-C3 (RED). Add the Tasks-workspace live-door test (sibling flag-variant file).**

New file: `mos-app/src/components/tasks/tasks-workspace-followups-door.test.tsx`:

```tsx
// Money-inbox-alignment (Step 9) — Door 1: the Tasks saved-view `?view=followups`
// chip renders the LIVE Follow-up queue once SHOW_FOLLOWUPS is on (AC-904),
// reusing the exact same useFollowUpQueue + FollowUpQueueTable pair as the
// canonical FollowUpsPage (AC-907/AC-908). Sibling flag-variant file (mirrors
// my-week.hidden.test.tsx) — tasks-workspace.test.tsx keeps proving the
// flag-off placeholder path (AC-311) unmocked/unchanged.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { AuthState } from '@/auth/context'
import { AuthContext } from '@/auth/context'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { PeopleRow, RolesRow } from '@/lib/database.types'
import type { FollowUpRow } from '@/lib/db/follow-ups'

vi.mock('@/config/features', async () => {
  const actual = await vi.importActual<typeof import('@/config/features')>('@/config/features')
  return { ...actual, SHOW_FOLLOWUPS: true }
})
vi.mock('../../lib/db/tasks', () => ({
  listTasks: vi.fn().mockResolvedValue([]),
}))
vi.mock('../../lib/db/directory', () => ({
  getBusinessUnits: vi.fn().mockResolvedValue([{ id: 'bu-sales', name: 'B2B Sales', code: 'b2b_sales' }]),
  getPeople: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/lib/db/follow-ups', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/follow-ups')>('@/lib/db/follow-ups')
  return { ...actual, listFollowUps: vi.fn(), transitionFollowUp: vi.fn() }
})

import { listFollowUps } from '@/lib/db/follow-ups'
import { TasksWorkspace } from './tasks-workspace'

const mockListFollowUps = vi.mocked(listFollowUps)

const VIEWER_PERSON: PeopleRow = {
  id: 'viewer-id', org_id: 'org', user_id: 'uid', full_name: 'Sales Lead',
  email: 'sales@gordi.id', archived_at: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}
const mockRole: RolesRow = {
  id: 'role-1', org_id: 'org', business_unit_id: 'bu-sales', name: 'Sales Lead',
  reports_to_role_id: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}
const authedState: AuthState = {
  status: 'authenticated',
  viewer: { person: VIEWER_PERSON, roles: [mockRole], isManager: false, accessRoles: [] },
  signOut: async () => {},
}

const FOLLOWUPS_SAVED_VIEW: React.ComponentProps<typeof TasksWorkspace>['savedView'] = {
  view: 'followups', activeChip: 'followups', segment: 'all', overdueOnly: false,
  reserved: 'followups', search: '?view=followups',
}

const row: FollowUpRow = {
  id: 'fu-1', org_id: 'org-1', counterparty: 'PT Big Buyer', kind: 'b2b_ar', lane: 'b2b_sales',
  source_invoice_ref: 'INV-1001', original_amount: 1000000, running_balance: 1000000, state: 'open',
  promise_date: null, issued_date: '2026-06-01', due_date: '2026-06-30', assigned_to: null, notes: null,
  created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
}

function renderFollowupsView() {
  return render(
    <I18nProvider>
      <AuthContext.Provider value={authedState}>
        <MemoryRouter initialEntries={['/work/tasks?view=followups']}>
          <TasksWorkspace savedView={FOLLOWUPS_SAVED_VIEW} onSavedViewChange={() => {}} />
        </MemoryRouter>
      </AuthContext.Provider>
    </I18nProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query.includes('768') || query.includes('1100'),
      media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
  })
  mockListFollowUps.mockResolvedValue([row])
})

describe('TasksWorkspace — Follow-ups saved view, live door (Step 9)', () => {
  it('AC-904: renders the real Follow-up queue instead of the reserved placeholder once SHOW_FOLLOWUPS is on', async () => {
    renderFollowupsView()
    expect(await screen.findByText('PT Big Buyer')).toBeInTheDocument()
    expect(screen.queryByText(/follow-ups are coming to this workspace/i)).not.toBeInTheDocument()
  })
})
```

Verify (expect FAIL — the reserved branch still shows the placeholder unconditionally):
```bash
cd mos-app && npx vitest run src/components/tasks/tasks-workspace-followups-door.test.tsx
```

**T-C4 (GREEN). Wire the `tasks-workspace.tsx` reserved-`followups` branch.**

File: `mos-app/src/components/tasks/tasks-workspace.tsx`:

1. Add two imports after the existing `import { useT } from '@/i18n/use-t'` line (currently line 38):
```tsx
import { SHOW_FOLLOWUPS } from '@/config/features'
import { FollowUpQueueEmbed } from '@/components/follow-ups/follow-up-queue-embed'
```

2. Replace the reserved-`followups` branch (currently):
```tsx
          {savedView?.reserved === 'followups' ? (
            <div className="empty-state empty-state--quiet" role="region" aria-label={t('tasks.saved.followups')}>
              <div className="empty-state-frame">
                <div className="empty-state-body">
                  <h3 className="empty-title">{t('tasks.followups.title')}</h3>
                  <p className="empty-copy">{t('tasks.followups.copy')}</p>
                </div>
              </div>
            </div>
          ) : (
```
with:
```tsx
          {savedView?.reserved === 'followups' ? (
            SHOW_FOLLOWUPS ? (
              <div className="follow-ups-embed" role="region" aria-label={t('tasks.saved.followups')}>
                <FollowUpQueueEmbed />
              </div>
            ) : (
              <div className="empty-state empty-state--quiet" role="region" aria-label={t('tasks.saved.followups')}>
                <div className="empty-state-frame">
                  <div className="empty-state-body">
                    <h3 className="empty-title">{t('tasks.followups.title')}</h3>
                    <p className="empty-copy">{t('tasks.followups.copy')}</p>
                  </div>
                </div>
              </div>
            )
          ) : (
```

(the `TasksTableBody` branch and its closing `)}` are unchanged — only the reserved-`followups` arm
gains the `SHOW_FOLLOWUPS` split.)

Verify:
```bash
cd mos-app && npx vitest run src/components/tasks/tasks-workspace-followups-door.test.tsx src/components/tasks/tasks-workspace.test.tsx
```
The new live-door test goes green; the existing `AC-311` placeholder test (in `tasks-workspace.test.tsx`,
run under the real `SHOW_FOLLOWUPS=false` default) stays green unmodified (AC-905 regression proof).

## 2. Full verification pass (run after all tasks above)

```bash
cd mos-app
npm run typecheck
npm run lint
npm test
npm run test:coverage
```

- `typecheck` / `lint`: zero errors (binding gate).
- `npm test`: full suite green, including every file touched/added above plus the untouched regression
  anchors (`follow-ups-page.test.tsx`, `tasks-workspace.test.tsx`'s `AC-311` case, `router.test.tsx`'s
  `AC-006: /inbox renders InboxPage (always live)` case).
- `test:coverage`: confirm ≥80% lines on the changed files
  (`use-follow-up-queue.ts`, `follow-up-queue-table.tsx`, `follow-up-queue-embed.tsx`,
  `follow-ups-page.tsx`, the `tasks-workspace.tsx` diff, the `router.tsx` diff, the `dashboard-page.tsx`
  diff) — the extraction is fully exercised by `follow-ups-page.test.tsx` +
  `follow-up-queue-embed.test.tsx` + `tasks-workspace-followups-door.test.tsx`, so this should already
  clear the bar without a dedicated coverage-padding task.

**No new e2e journey.** This step does not touch any of the three curated Playwright journeys (F1
post-a-Signal, F2 today's-opening, F3 find-overdue-work) and `SHOW_FOLLOWUPS` stays off, so there is no
end-to-end flow to exercise yet — the master-plan step-9 row itself marks "Drill needed? No." A curated
e2e journey for the Follow-up queue is appropriate only once `SHOW_FOLLOWUPS` actually goes live (a
future, separately-gated issue) and is dispatched via CI, never run locally against real data.

## 3. Parallelization map

```
Track A (Door 2: Money route + link)         Track B (extract the ONE renderer)
  T-A1 → T-A2 → T-A3 → T-A4 → T-A5              T-B1 → T-B2 → T-B3
        (fully independent of B/C)                        │
                                                            ▼
                                              Track C (Door 1: Work embed)
                                                T-C1 → T-C2 → T-C3 → T-C4
                                                (needs FollowUpQueueEmbed,
                                                 which needs T-B1/T-B2)

                        All tracks converge → §2 full verification pass
```

- **Track A** has zero dependency on Tracks B/C and can be built, reviewed, and merged as a standalone
  slice if desired (it only touches `router.tsx` and `dashboard-page.tsx`/`.css`).
- **Track B** must land before Track C (T-C2 imports `use-follow-up-queue` and `follow-up-queue-table`
  from Track B).
- Two builders can work Track A and Track B simultaneously; Track C starts once Track B's T-B2 lands.

## 4. AC → task map

| AC | Task(s) |
|---|---|
| AC-900 | T-A1, T-A2 |
| AC-901 | T-A2 (structural — proven by the same route-table assertion; `RequireAccessRole`'s own contract is unmodified) |
| AC-902 | T-A4, T-A5 |
| AC-903 | T-A3, T-A5 |
| AC-904 | T-C1, T-C2, T-C3, T-C4 |
| AC-905 | T-C4 (regression proof via the existing, unmodified `tasks-workspace.test.tsx` `AC-311` case) |
| AC-906 | T-B1, T-B2, T-B3 (regression proof via the existing, unmodified `follow-ups-page.test.tsx`) |
| AC-907 | T-C1, T-C2 |
| AC-908 | T-C1, T-C2 (embed side); existing `follow-ups-page.test.tsx` AC-520 (canonical-page side) |
| AC-909 | none new — regression proof via the existing, unmodified `router.test.tsx` `AC-006: /inbox` case |

## 5. Gates (binding, per CLAUDE.md / product-expectations.md)

- **Coverage** ≥80% lines on changed code (§2).
- **`npm run typecheck`** zero errors; **`npm run lint`** zero errors/warnings (§2).
- **RLS**: N/A — no schema/RLS/migration touched (NFR-901); no new business table.
- **Review battery (BLOCKING before merge-to-main offer):** code review (cross-family) **and** the
  4-lens design review, both recorded in `docs/reviews/<branch>.md`, verified by
  `bash scripts/pre-merge-check.sh` exiting 0. `security-auditor` not required (no auth/RLS/schema path).
- **e2e**: none added in this step; dispatched via CI only, never run locally against real data, per
  standing project convention — not applicable here since no new curated journey is introduced.
- **Owner gate**: per `docs/plans/CLOUD-AGENT-HANDOFF.md` (OD-REDESIGN-67), if this step runs inside the
  steps-4→11 autonomous window, the per-step owner walkthrough is suspended (collapses into the
  post-step-11 review) but both review batteries remain mandatory and every conservative default in §10
  of the spec must be recorded as `RATIFY-BEFORE-MERGE` in the ledger. If the owner is present
  (`docs/plans/AUTONOMOUS-RUN-STATE.md`'s "Mode" section), the normal per-step visual-diff sign-off
  applies instead.

## 6. RATIFY-BEFORE-MERGE (collected from the spec §10 — record these in the review ledger)

1. **`SHOW_FOLLOWUPS` stays `false`.** Confirm the backup/restore go-live gate (OD-IA-1) before ever
   flipping it. This plan wires both doors fully behind the flag but does not flip it.
2. **Door 2's link treatment is a minimal, unratified placement** (plain `.btn.btn-outline` Link in
   `DashboardChrome`, no live count). Acceptable pending the mandatory design review for this step; a
   live overdue-count badge is deferred, not rejected.
3. **Home's `data-money-ar-slot` is intentionally untouched.** Confirm it remains a separate,
   not-yet-scoped follow-up rather than an expected-but-missed part of this step.

## 7. Verification (of this plan)

- Every file path cited above was read from the live repo on 2026-07-17 (not inferred).
- Every new/modified code block is the literal content to write, not a description — no `TBD`, no
  "similar to Task N," no "add error handling" without the exact handling shown.
- Every task names its exact verify command and, where new, its exact AC(s).
- Confirmed zero new i18n keys, zero `destinations.tsx`/`job-sentences.ts`/`breadcrumb.tsx` edits, and
  zero Inbox edits are required — stated as explicit non-tasks so a future agent doesn't invent them.

PLAN-DONE
