// Characterization of the Tasks table group/collapse behaviour (issue 999): written green against
// the hand-written flattener, kept green through the swap onto TanStack's expanded row model.
// The rendered DOM (header order, counts, overdue, leaf ids, aria-expanded, storage JSON,
// keyboard cursor, windowing) is the contract; the row-model implementation is not.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { ProcessRunRollup } from '@/lib/db/processes.types'
import type { TaskListRow } from '@/lib/db/tasks.types'
import type { CollectionData } from '@/lib/record-collection/types'
import {
  projectTaskCollection,
  toTaskCollectionRecord,
  type TaskCollectionContext,
} from './task-collection-adapter'
import { TASK_COLLECTION_NEUTRAL_QUERY, type TaskCollectionQuery } from './task-collection-query'
import {
  TaskCollectionRuntimeProvider,
  TaskTablePresentation,
  type TaskCollectionRuntime,
} from './task-collection-presentation'

vi.mock('@/lib/db/processes', () => ({ listPendingTasks: vi.fn().mockResolvedValue([]) }))

const NOW = new Date('2026-07-21T03:00:00Z')
const KEY = 'mos.tasks.collapsedGroups'
const RUN = 'run-cafe-opening'

function task(over: Partial<TaskListRow> & Pick<TaskListRow, 'id' | 'title'>): TaskListRow {
  return {
    org_id: 'org-1', business_unit_id: 'bu-cafe', status: 'Open',
    responsible_person_id: 'p-a', accountable_person_id: 'p-b',
    consulted_person_ids: [], informed_person_ids: [], due_date: null,
    objective_id: null, work_line_id: null, last_activity_at: '2026-07-20T00:00:00Z',
    archived_at: null, created_by: 'p-b', team_id: null, completed_at: null,
    process_run_id: null, generated_from_task_def_id: null, ...over,
  }
}

const ROWS: TaskListRow[] = [
  task({ id: 'a1', title: 'Alpha one', status: 'Open', due_date: '2026-07-10', responsible_person_id: 'p-a', business_unit_id: 'bu-cafe', work_line_id: 'wl-1', objective_id: 'o-1', process_run_id: RUN }),
  task({ id: 'a2', title: 'Alpha two', status: 'Open', due_date: '2026-07-11', responsible_person_id: 'p-a', business_unit_id: 'bu-cafe', work_line_id: 'wl-1', objective_id: 'o-1', process_run_id: RUN }),
  task({ id: 'b1', title: 'Bravo one', status: 'Blocked', due_date: '2026-08-30', responsible_person_id: 'p-b', business_unit_id: 'bu-b2b', work_line_id: 'wl-2', objective_id: null }),
  task({ id: 'c1', title: 'Charlie one', status: 'Done', due_date: '2026-07-01', responsible_person_id: 'p-b', business_unit_id: 'bu-b2b', work_line_id: null, objective_id: 'o-1' }),
]

const PEOPLE = [{ id: 'p-a', full_name: 'Person A' }, { id: 'p-b', full_name: 'Person B' }]
const BUS = [{ id: 'bu-cafe', name: 'Café Operations' }, { id: 'bu-b2b', name: 'B2B Sales' }]
const ROLLUP: ProcessRunRollup = {
  process_run_id: RUN, caption: 'Café Opening · 17 Jul 2026', scheduled_date: '2026-07-17',
  status: 'active' as ProcessRunRollup['status'], total: 2, open: 2, in_progress: 0, blocked: 0,
  done: 0, overdue: 2, pending_unresolved: 1, completion_pct: 0,
}

function context(rows: TaskListRow[], over: Partial<TaskCollectionContext> = {}): TaskCollectionContext {
  return {
    businessUnits: BUS as never, people: PEOPLE as never,
    businessUnitNamesById: new Map(BUS.map((b) => [b.id, b.name])),
    personNamesById: new Map(PEOPLE.map((p) => [p.id, p.full_name])),
    workLinesById: new Map([['wl-1', 'Roastery output'], ['wl-2', 'Weekly SOP']]),
    workLineTypeById: new Map([['wl-1', 'project'], ['wl-2', 'process']]),
    objectivesById: new Map([['o-1', 'Grow café revenue']]),
    runRollupsByRunId: new Map([[RUN, ROLLUP]]),
    provenanceByTaskDefId: new Map(),
    rowsById: new Map(rows.map((r) => [r.id, r])),
    viewerId: 'p-a', statusOverrides: new Map(), now: NOW, refresh: () => {}, ...over,
  }
}

function runtime(over: Partial<TaskCollectionRuntime> = {}): TaskCollectionRuntime {
  return {
    selectedId: null, drawerOpen: false, splitLayout: false, isDesktop: true, hasPagedOlderDone: false, recordSearch: '',
    statusOverrides: new Map(), onOpenTask: vi.fn(), onEditTitle: async () => {},
    onEditStatus: async () => {}, onEditDue: async () => {}, onEditPic: async () => {},
    onEditTeam: async () => {}, onEditSupervisor: async () => {}, teamOptions: [],
    draftTask: null, onDiscardNewTask: () => {}, draftLinkError: false, onRetryDraftLink: () => {},
    onCloseDrawer: () => {}, onNewTask: () => {}, onAddTask: () => {}, onRetry: () => {},
    onClearFilters: () => {}, onSortChange: () => {}, onOverdueFilter: () => {}, onClearOverdue: () => {},
    createHref: '/work/tasks/new', canResolvePending: false, ...over,
  }
}

const onToggleGroup = vi.fn()

function Table({ rows, query, rt }: { rows: TaskListRow[]; query: TaskCollectionQuery; rt: TaskCollectionRuntime }) {
  const ctx = context(rows, { statusOverrides: rt.statusOverrides })
  const data: CollectionData<ReturnType<typeof toTaskCollectionRecord>, TaskCollectionContext> = {
    records: rows.map(toTaskCollectionRecord), context: ctx,
  }
  const projection = projectTaskCollection(data, query)
  return (
    <TaskTablePresentation
      query={query} projection={projection} context={ctx}
      selectedIds={new Set()} onToggleSelected={() => {}} onOpenRecord={() => {}}
      onToggleGroup={onToggleGroup} isGroupCollapsed={() => false}
    />
  )
}

function mount(query: Partial<TaskCollectionQuery>, opts: { rows?: TaskListRow[]; rt?: Partial<TaskCollectionRuntime> } = {}) {
  const q: TaskCollectionQuery = { ...TASK_COLLECTION_NEUTRAL_QUERY, ...query }
  const rt = runtime(opts.rt)
  const tree = (
    <I18nProvider>
      <MemoryRouter>
        <TaskCollectionRuntimeProvider value={rt}>
          <Table rows={opts.rows ?? ROWS} query={q} rt={rt} />
        </TaskCollectionRuntimeProvider>
      </MemoryRouter>
    </I18nProvider>
  )
  return render(tree)
}

// One string per body row, in DOM order: `H|label|count|overdue|expanded` or `L|<title>`.
function shape(): string[] {
  return Array.from(document.querySelectorAll('tbody > tr'))
    .filter((tr) => !tr.hasAttribute('aria-hidden'))
    .map((tr) => {
      if (tr.classList.contains('grp')) {
        const label = tr.querySelector('.glabel')!.textContent
        const count = tr.querySelector('.gcount')!.textContent
        const overdue = tr.querySelector('.gsub:not(.gsub-pending):not(.gadd)')?.textContent?.trim() ?? ''
        const expanded = tr.querySelector('button[aria-expanded]')!.getAttribute('aria-expanded')
        return `H|${label}|${count}|${overdue}|${expanded}`
      }
      return `L|${tr.querySelector('a.task-row-link')?.getAttribute('title') ?? tr.className}`
    })
}

const caretOf = (label: string) => {
  const header = Array.from(document.querySelectorAll('tr.grp')).find((tr) => tr.querySelector('.glabel')!.textContent === label)!
  return header.querySelector('button[aria-expanded]') as HTMLButtonElement
}
const press = (key: string) => act(() => { fireEvent.keyDown(window, { key }) })
const cursorTitle = () => document.querySelector('tr.kfocus a.task-row-link')?.getAttribute('title') ?? null

beforeEach(() => { localStorage.clear(); onToggleGroup.mockClear() })
afterEach(() => { vi.restoreAllMocks() })

describe('group output per groupBy (AC-009/010/012/014)', () => {
  it('status: buckets in status order, counts and overdue subtotal, rows inside', () => {
    mount({ groupBy: 'status', view: 'all' })
    expect(shape()).toMatchInlineSnapshot(`
      [
        "H|Blocked|1||true",
        "L|Bravo one",
        "H|Open|2|· 2 overdue|true",
        "L|Alpha one",
        "L|Alpha two",
        "H|Done|1||true",
        "L|Charlie one",
      ]
    `)
  })
  it('pic: one group per person holding rows', () => {
    mount({ groupBy: 'pic', view: 'all' })
    expect(shape()).toMatchInlineSnapshot(`
      [
        "H|Person A|2|· 2 overdue|true",
        "L|Alpha one",
        "L|Alpha two",
        "H|Person B|2||true",
        "L|Bravo one",
        "L|Charlie one",
      ]
    `)
  })
  it('bu: one group per business unit', () => {
    mount({ groupBy: 'bu', view: 'all' })
    expect(shape()).toMatchInlineSnapshot(`
      [
        "H|Café Operations|2|· 2 overdue|true",
        "L|Alpha one",
        "L|Alpha two",
        "H|B2B Sales|2||true",
        "L|Bravo one",
        "L|Charlie one",
      ]
    `)
  })
  it('workline: work lines then the trailing no-work-line group', () => {
    mount({ groupBy: 'workline', view: 'all' })
    expect(shape()).toMatchInlineSnapshot(`
      [
        "H|Roastery output|2|· 2 overdue|true",
        "L|Alpha one",
        "L|Alpha two",
        "H|Weekly SOP|1||true",
        "L|Bravo one",
        "H|No work-line|1||true",
        "L|Charlie one",
      ]
    `)
  })
  it('objective: objective branches in projector order', () => {
    mount({ groupBy: 'objective', view: 'all' })
    expect(shape()).toMatchInlineSnapshot(`
      [
        "H|Roastery output|2|· 2 overdue|true",
        "L|Alpha one",
        "L|Alpha two",
        "H|No Project/Process|1||true",
        "L|Charlie one",
        "H|Weekly SOP|1||true",
        "L|Bravo one",
      ]
    `)
  })
  it('occurrence: roll-up caption header then the ad-hoc catch-all last', () => {
    mount({ groupBy: 'occurrence', view: 'all' })
    expect(shape()).toMatchInlineSnapshot(`
      [
        "H|Café Opening · 17 Jul 2026|0/2 done · 2 overdue · 1 unassigned||true",
        "L|Alpha one",
        "L|Alpha two",
        "H|One-off tasks|2||true",
        "L|Bravo one",
        "L|Charlie one",
      ]
    `)
  })
  it('none: flat leaves, no headers', () => {
    mount({ groupBy: 'none', view: 'all' })
    expect(shape()).toMatchInlineSnapshot(`
      [
        "L|Alpha one",
        "L|Alpha two",
        "L|Bravo one",
        "L|Charlie one",
      ]
    `)
  })
  it('a filter that empties a group drops its header (AC-012)', () => {
    mount({ groupBy: 'status', view: 'all', status: 'Blocked' as never })
    expect(shape().filter((line) => line.startsWith('H'))).toHaveLength(1)
  })
  it('optimistic status override moves the row to its new bucket and recounts (AC-013)', () => {
    mount({ groupBy: 'status', view: 'all' }, { rt: { statusOverrides: new Map([['a1', 'Done' as const]]) } })
    expect(shape()).toMatchInlineSnapshot(`
      [
        "H|Blocked|1||true",
        "L|Bravo one",
        "H|Open|1|· 1 overdue|true",
        "L|Alpha two",
        "H|Done|2||true",
        "L|Charlie one",
        "L|Alpha one",
      ]
    `)
  })
})

describe('caret collapse (AC-011)', () => {
  it('click flips aria-expanded, hides the rows, writes exact storage JSON and notifies the workspace', () => {
    mount({ groupBy: 'status', view: 'all' })
    fireEvent.click(caretOf('Open'))
    expect(caretOf('Open').getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Alpha one')).toBeNull()
    expect(screen.getByText('Bravo one')).toBeInTheDocument()
    expect(localStorage.getItem(KEY)).toBe(JSON.stringify({ status: ['Open'] }))
    expect(onToggleGroup).toHaveBeenCalledWith('Open')
    fireEvent.click(caretOf('Open'))
    expect(caretOf('Open').getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Alpha one')).toBeInTheDocument()
    expect(localStorage.getItem(KEY)).toBe(JSON.stringify({ status: [] }))
  })

  it('collapse is kept per dimension and survives a remount', () => {
    const first = mount({ groupBy: 'status', view: 'all' })
    fireEvent.click(caretOf('Open'))
    first.unmount()
    mount({ groupBy: 'status', view: 'all' })
    expect(caretOf('Open').getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Alpha one')).toBeNull()
    document.body.innerHTML = ''
    mount({ groupBy: 'pic', view: 'all' })
    expect(screen.getByText('Alpha one')).toBeInTheDocument()
  })

  it('keeps a stale id (no matching group) in storage when another group toggles', () => {
    localStorage.setItem(KEY, JSON.stringify({ status: ['Gone'], pic: ['x'] }))
    mount({ groupBy: 'status', view: 'all' })
    fireEvent.click(caretOf('Blocked'))
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ status: ['Gone', 'Blocked'], pic: ['x'] })
  })

  it('tolerates garbage storage', () => {
    localStorage.setItem(KEY, '{not json')
    mount({ groupBy: 'status', view: 'all' })
    expect(screen.getByText('Alpha one')).toBeInTheDocument()
    fireEvent.click(caretOf('Open'))
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ status: ['Open'] })
  })

  it('ignores non-string ids and non-object storage', () => {
    localStorage.setItem(KEY, JSON.stringify({ status: [1, 'Open', null] }))
    mount({ groupBy: 'status', view: 'all' })
    expect(caretOf('Open').getAttribute('aria-expanded')).toBe('false')
    document.body.innerHTML = ''
    localStorage.setItem(KEY, JSON.stringify(['Open']))
    mount({ groupBy: 'status', view: 'all' })
    expect(caretOf('Open').getAttribute('aria-expanded')).toBe('true')
  })

  it('renders and toggles when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    mount({ groupBy: 'status', view: 'all' })
    fireEvent.click(caretOf('Open'))
    expect(caretOf('Open').getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Alpha one')).toBeNull()
  })
})

describe('keyboard cursor (AC-015)', () => {
  it('j/k walk visible leaves only, skipping headers and collapsed groups', () => {
    mount({ groupBy: 'status', view: 'all' })
    press('j'); expect(cursorTitle()).toBe('Bravo one')
    press('j'); expect(cursorTitle()).toBe('Alpha one')
    press('j'); expect(cursorTitle()).toBe('Alpha two')
    press('k'); expect(cursorTitle()).toBe('Alpha one')
    fireEvent.click(caretOf('Open'))
    press('j'); press('j'); press('j')
    expect(cursorTitle()).toBe('Charlie one')
  })

  it('all groups collapsed: no leaves, no cursor, headers stay and can reopen', () => {
    mount({ groupBy: 'status', view: 'all' })
    for (const label of ['Open', 'Blocked', 'Done']) fireEvent.click(caretOf(label))
    press('j')
    expect(cursorTitle()).toBeNull()
    expect(shape().map((line) => line.split('|')[0])).toEqual(['H', 'H', 'H'])
    fireEvent.click(caretOf('Open'))
    expect(screen.getByText('Alpha one')).toBeTruthy()
  })

  it('all groups collapsed at load: headers render and a group reopens', () => {
    localStorage.setItem(KEY, JSON.stringify({ status: ['Open', 'Blocked', 'Done'] }))
    mount({ groupBy: 'status', view: 'all' })
    expect(shape().map((line) => line.split('|')[0])).toEqual(['H', 'H', 'H'])
    fireEvent.click(caretOf('Done'))
    expect(screen.getByText('Charlie one')).toBeTruthy()
  })
})

describe('windowing (AC-016)', () => {
  // jsdom reports offsetHeight 0; give the virtual scroll container the 600px viewport it measures.
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.className.includes('tasks-scroll-virtual') ? 600 : 0
    })
  })
  const many = (n: number) => Array.from({ length: n }, (_, i) =>
    task({ id: `m${i}`, title: `Many ${String(i).padStart(2, '0')}`, status: 'Open', due_date: '2026-09-01' }))

  it('60 visible leaves are windowed with pad rows spanning the visible columns', () => {
    mount({ groupBy: 'status', view: 'all' }, { rows: many(60) })
    const rendered = document.querySelectorAll('tr.task-row').length
    expect(rendered).toBeGreaterThan(0)
    expect(rendered).toBeLessThan(60)
    const cols = document.querySelectorAll('thead th').length
    const pad = document.querySelector('tbody tr[aria-hidden="true"] td') as HTMLTableCellElement | null
    expect(pad).not.toBeNull()
    expect(pad!.colSpan).toBe(cols)
    expect(document.querySelector('.tasks-scroll-virtual')).not.toBeNull()
  })

  it('49 visible leaves render plain', () => {
    mount({ groupBy: 'status', view: 'all' }, { rows: many(49) })
    expect(document.querySelectorAll('tr.task-row')).toHaveLength(49)
    expect(document.querySelector('.tasks-scroll-virtual')).toBeNull()
  })

  it('the threshold reads visible leaves: collapsing a 60-row group flips to plain', () => {
    const rows = [...many(60), task({ id: 'z', title: 'Zed', status: 'Blocked' })]
    mount({ groupBy: 'status', view: 'all' }, { rows })
    expect(document.querySelector('.tasks-scroll-virtual')).not.toBeNull()
    fireEvent.click(caretOf('Open'))
    expect(document.querySelector('.tasks-scroll-virtual')).toBeNull()
    expect(shape().filter((line) => line.startsWith('L'))).toEqual(['L|Zed'])
  })
})

describe('draft row', () => {
  const draft = task({ id: 'new-task-1', title: '' })

  it('sits at the top of the first group', () => {
    mount({ groupBy: 'status', view: 'all' }, { rt: { draftTask: draft } })
    const lines = shape()
    expect(lines[0]).toBe('H|Blocked|2||true')
    expect(lines[1]).toBe('L|task-row task-row--create')
    expect(lines[2]).toBe('L|Bravo one')
  })

  it('counts in the first group header (draft is a row of that group)', () => {
    mount({ groupBy: 'status', view: 'all' }, { rt: { draftTask: draft } })
    expect(shape()[0]).toBe('H|Blocked|2||true')
  })

  it('with no groups lands alone in the flat group (its header still renders when grouped)', () => {
    mount({ groupBy: 'status', view: 'all', q: 'nomatch-anywhere' }, { rt: { draftTask: draft } })
    expect(shape()).toEqual(['H||1||true', 'L|task-row task-row--create'])
  })
})
