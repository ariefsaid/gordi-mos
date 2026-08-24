/**
 * MobileGroupedCards — unit tests (Fix 2, PR-3 review fix-up).
 * Verifies the extracted mobile group-header+card list component shares the same
 * semantics as desktop GroupHeaderRow: caret/aria-expanded, label/count,
 * overdue-gating, and the "+ Create task" wiring.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MobileGroupedCards } from './mobile-grouped-cards'
import type { MobileGroupedCardsProps } from './mobile-grouped-cards'
import type { TaskListRow } from '@/lib/db/tasks.types'
import { isShipGated } from '@/lib/ship-gate'

function makeTask(overrides: Partial<TaskListRow> = {}): TaskListRow {
  return {
    id: 'task-1', org_id: 'org', title: 'Test task',
    business_unit_id: 'bu-1', status: 'Open',
    responsible_person_id: 'person-1', accountable_person_id: 'person-1',
    consulted_person_ids: [], informed_person_ids: [],
    description: null, due_date: null, objective_id: null, work_line_id: null,
    last_activity_at: '2026-06-01T10:00:00Z',
    archived_at: null, created_by: 'person-1',
    created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-01T00:00:00Z',
    ...overrides,
  }
}

const BASE_PROPS: MobileGroupedCardsProps = {
  recordSearch: '',
  groups: [
    {
      key: 'Open',
      label: 'Open',
      rows: [makeTask({ id: 't1', title: 'Task A' })],
      overdue: 0,
      prefillParam: '',
    },
    {
      key: 'Blocked',
      label: 'Blocked',
      rows: [makeTask({ id: 't2', title: 'Task B', status: 'Blocked', due_date: '2020-01-01' })],
      overdue: 1,
      prefillParam: '',
    },
  ],
  now: new Date('2026-06-16'),
  buMap: new Map([['bu-1', 'Kitchen']]),
  personMap: new Map([['person-1', 'Arief Said']]),
  isCollapsed: () => false,
  toggleCollapsed: () => {},
  openAddTask: () => {},
  setOverdueOnly: () => {},
  workLineMap: new Map<string, string>(),
  objectiveMap: new Map<string, string>(),
}

function renderCards(props: Partial<MobileGroupedCardsProps> = {}) {
  return render(
    <MemoryRouter>
      <MobileGroupedCards {...BASE_PROPS} {...props} />
    </MemoryRouter>,
  )
}

describe('MobileGroupedCards', () => {
  it('renders a group header for each group with label and count', () => {
    renderCards()
    // Labels appear in .mgc-label spans
    const labels = Array.from(document.querySelectorAll('.mgc-label')).map(el => el.textContent)
    expect(labels).toContain('Open')
    expect(labels).toContain('Blocked')
    // Count for Open group (1 task)
    const openHead = document.querySelector('.mgc-group-head')!
    expect(openHead.textContent).toContain('1')
  })

  it('renders Objective hint above the Project/Process group title at phone width', () => {
    renderCards({ groups: [{
      key: 'objective:project', label: 'Launch', rows: [makeTask({ title: 'Ship task' })], overdue: 0, prefillParam: '',
      objectiveHint: { id: 'objective-1', name: 'Grow revenue' }, workLineType: 'project',
    }] })
    // The hint's job is to say WHICH Objective this group of work belongs to, so the name is
    // asserted unconditionally. Whether it is also a drill depends on the ship gate (#444): with
    // Objectives outside the MVP payload the name stays and the link goes, because a phone tap
    // that lands on a redirect back to Home is a dead end dressed as a control.
    expect(screen.getByText('Grow revenue')).toBeInTheDocument()
    if (isShipGated('/work/objectives')) {
      expect(screen.queryByRole('link', { name: 'Grow revenue' })).toBeNull()
    } else {
      expect(screen.getByRole('link', { name: 'Grow revenue' })).toHaveAttribute('href', '/work/objectives?q=Grow%20revenue')
    }
    expect(screen.getByText('Launch')).toBeInTheDocument()
    expect(screen.getByText('Ship task')).toBeInTheDocument()
  })

  it('renders task cards for non-collapsed groups', () => {
    renderCards()
    expect(screen.getByText('Task A')).toBeInTheDocument()
    expect(screen.getByText('Task B')).toBeInTheDocument()
  })

  it('hides task cards when the group is collapsed', () => {
    renderCards({ isCollapsed: (key) => key === 'Open' })
    expect(screen.queryByText('Task A')).toBeNull()
    expect(screen.getByText('Task B')).toBeInTheDocument()
  })

  it('caret carries aria-expanded=true when not collapsed', () => {
    renderCards({ isCollapsed: () => false })
    const carets = screen.getAllByRole('button', { name: /expand|collapse/i })
    carets.forEach(btn => expect(btn).toHaveAttribute('aria-expanded', 'true'))
  })

  it('caret carries aria-expanded=false when collapsed', () => {
    renderCards({ isCollapsed: () => true })
    const carets = screen.getAllByRole('button', { name: /expand|collapse/i })
    carets.forEach(btn => expect(btn).toHaveAttribute('aria-expanded', 'false'))
  })

  it('caret click fires toggleCollapsed with the group key', () => {
    const toggleCollapsed = vi.fn()
    renderCards({ toggleCollapsed })
    const firstCaret = screen.getAllByRole('button', { name: /expand|collapse/i })[0]
    fireEvent.click(firstCaret)
    expect(toggleCollapsed).toHaveBeenCalledWith('Open')
  })

  it('overdue subtotal button is shown only when group has overdue tasks', () => {
    renderCards()
    // Blocked group has 1 overdue; Open has 0
    expect(screen.getByRole('button', { name: /filter to 1 overdue/i })).toBeInTheDocument()
    // Only one overdue subtotal button (Open group has none)
    const overdueBtns = screen.getAllByRole('button', { name: /filter to.*overdue/i })
    expect(overdueBtns).toHaveLength(1)
  })

  it('overdue subtotal click fires setOverdueOnly', () => {
    const setOverdueOnly = vi.fn()
    renderCards({ setOverdueOnly })
    fireEvent.click(screen.getByRole('button', { name: /filter to 1 overdue/i }))
    expect(setOverdueOnly).toHaveBeenCalledWith(true)
  })

  it('+ Create task button fires openAddTask with the group prefillParam', () => {
    const openAddTask = vi.fn()
    const groups = [
      { key: 'p1', label: 'Arief Said', rows: [], overdue: 0, prefillParam: 'r=person-1' },
    ]
    renderCards({ groups, openAddTask })
    const addBtn = screen.getByRole('button', { name: /create task in arief said/i })
    fireEvent.click(addBtn)
    expect(openAddTask).toHaveBeenCalledWith('r=person-1')
  })

  // DO-18(c) (census-sweep R2 tasks FINDING4) named the card's recency meta "Updated", never the
  // ambiguous "Activity Nd" — but the v4 distill pass (TaskCard comment, .claude/skills/impeccable
  // distill.md "remove redundancy") went further and dropped the recency line from the card body
  // entirely: PIC + Supervisor + Due are the decision-relevant fields for weekly triage; the last-
  // activity timestamp is one tap away on the record, not restated on every card. Neither the old
  // ambiguous label nor the disambiguated one should appear — the field itself is gone.
  it("DO-18(c) superseded by the distill pass: no recency meta on the card at all (neither \"Activity\" nor \"Updated\")", () => {
    renderCards()
    expect(screen.queryByText('Activity')).toBeNull()
    expect(screen.queryByText('Updated')).toBeNull()
  })

  it('role="list" on the container and role="listitem" on each card wrapper (a11y)', () => {
    renderCards()
    expect(document.querySelector('[role="list"]')).toBeTruthy()
    expect(document.querySelectorAll('[role="listitem"]').length).toBeGreaterThanOrEqual(1)
  })

  it('renders a data-testid="task-card" for each task row', () => {
    renderCards()
    const cards = document.querySelectorAll('[data-testid="task-card"]')
    expect(cards.length).toBe(2)
    expect(cards[0]).toHaveClass('collection-grammar-card')
    expect(cards[0].querySelector('.collection-grammar-title')).toHaveTextContent('Task A')
    expect(cards[0].querySelector('.collection-grammar-card-details')).toBeInTheDocument()
  })

  // Design fix wave item 3 (Rule 9 — occurrence group parity, phone width). Desktop's
  // GroupHeaderRow renders the process_run_rollup summary + a capability-gated "N to assign"
  // affordance for occurrence groups; the phone card list previously fell back to the plain
  // count/overdue grammar with no rollup and no way to resolve a pending step — this closes
  // that gap using the SAME handler contract (onAssignPending(runId)) the desktop path gets.
  describe('occurrence group parity (item 3)', () => {
    const OCC_GROUP = {
      key: 'run-1',
      label: 'Café Opening · 17 Jul 2026',
      rows: [makeTask({ id: 'gen-1', title: 'Open the café' })],
      overdue: 0,
      prefillParam: '',
      occurrenceRollup: { total: 2, done: 1, overdue: 0, pendingUnresolved: 1 },
    }

    // Design fix wave item 6 (MINOR — "1 to assign" stutter): no onAssignPending handler here
    // (the viewer cannot act) — neutral "N unassigned" wording, never actionable-sounding text
    // with nothing to click (mirrors GroupHeaderRow).
    it('renders the roll-up summary (not the plain count) for an occurrence group, "N unassigned" with no assign handler', () => {
      renderCards({ groups: [OCC_GROUP] })
      expect(screen.getByText('1/2 done · 0 overdue · 1 unassigned')).toBeInTheDocument()
    })

    it('renders the "N to assign" affordance when pendingUnresolved > 0 and a handler is given, firing it with the run id', () => {
      const onAssignPending = vi.fn()
      renderCards({ groups: [OCC_GROUP], onAssignPending })
      const assignBtn = screen.getByRole('button', { name: '1 to assign' })
      fireEvent.click(assignBtn)
      expect(onAssignPending).toHaveBeenCalledWith('run-1')
    })

    it('item 6: drops the pending clause from the summary when the "N to assign" button ALSO renders (no stutter)', () => {
      renderCards({ groups: [OCC_GROUP], onAssignPending: vi.fn() })
      expect(screen.getByText('1/2 done · 0 overdue')).toBeInTheDocument()
      expect(screen.queryByText('1 to assign', { selector: '.mgc-count' })).not.toBeInTheDocument()
    })

    it('never renders the assign affordance when no handler is given (viewer cannot resolve)', () => {
      renderCards({ groups: [OCC_GROUP] })
      expect(screen.queryByRole('button', { name: /to assign/i })).not.toBeInTheDocument()
    })

    it('never renders the assign affordance when pendingUnresolved is 0, even with a handler', () => {
      const zeroGroup = { ...OCC_GROUP, occurrenceRollup: { ...OCC_GROUP.occurrenceRollup, pendingUnresolved: 0 } }
      renderCards({ groups: [zeroGroup], onAssignPending: vi.fn() })
      expect(screen.queryByRole('button', { name: /to assign/i })).not.toBeInTheDocument()
    })

    it('a non-occurrence group is unaffected (plain count grammar, no assign affordance)', () => {
      renderCards({ onAssignPending: vi.fn() }) // BASE_PROPS groups carry no occurrenceRollup
      expect(screen.queryByRole('button', { name: /to assign/i })).not.toBeInTheDocument()
    })

    // Design fix wave item 4 (OD-65 mockup regression) — the generated-ownership "via <role>" line
    // on the phone card, same data source (provenanceByTaskDefId) as the desktop TaskRow.
    it('renders "via <role name>" on the card when the task carries a resolvable generated_from_task_def_id', () => {
      const group = {
        ...OCC_GROUP,
        rows: [makeTask({ id: 'gen-1', title: 'Open the café', generated_from_task_def_id: 'def-1' })],
      }
      renderCards({
        groups: [group],
        provenanceByTaskDefId: new Map([['def-1', 'Cafe Ops Lead']]),
      })
      expect(screen.getByText('via Cafe Ops Lead')).toBeInTheDocument()
    })

    it('renders no provenance line when the task\'s def has no resolvable role name', () => {
      const group = {
        ...OCC_GROUP,
        rows: [makeTask({ id: 'gen-1', title: 'Open the café', generated_from_task_def_id: 'def-2' })],
      }
      renderCards({ groups: [group], provenanceByTaskDefId: new Map() })
      expect(screen.queryByText(/^via /)).not.toBeInTheDocument()
    })
  })

  it('task-card open link preserves ?view=overdue', () => {
    renderCards({
      recordSearch: '?view=overdue',
      groups: [{
        key: '__flat__',
        label: 'Tasks',
        rows: [makeTask({ id: 'task-9', title: 'Overdue card task' })],
        overdue: 0,
        prefillParam: '',
      }],
    })
    const cardLink = screen.getByRole('link', { name: /overdue card task/i })
    expect(cardLink.getAttribute('href')).toBe('/work/tasks/task-9?view=overdue')
  })
})
