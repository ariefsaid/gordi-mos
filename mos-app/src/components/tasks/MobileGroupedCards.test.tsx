/**
 * MobileGroupedCards — unit tests (Fix 2, PR-3 review fix-up).
 * Verifies the extracted mobile group-header+card list component shares the same
 * semantics as desktop GroupHeaderRow: caret/aria-expanded, label/count,
 * overdue-gating, and the "+ Add task" wiring.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MobileGroupedCards } from './MobileGroupedCards'
import type { MobileGroupedCardsProps } from './MobileGroupedCards'
import type { TaskListRow } from '@/lib/db/tasks.types'

function makeTask(overrides: Partial<TaskListRow> = {}): TaskListRow {
  return {
    id: 'task-1', org_id: 'org', title: 'Test task',
    business_unit_id: 'bu-1', status: 'Open',
    responsible_person_id: 'person-1', accountable_person_id: 'person-1',
    consulted_person_ids: [], informed_person_ids: [],
    description: null, due_date: null, last_activity_at: '2026-06-01T10:00:00Z',
    archived_at: null, created_by: 'person-1',
    created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-01T00:00:00Z',
    ...overrides,
  }
}

const BASE_PROPS: MobileGroupedCardsProps = {
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
  buildOthers: () => [],
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

  it('+ Add task button fires openAddTask with the group prefillParam', () => {
    const openAddTask = vi.fn()
    const groups = [
      { key: 'p1', label: 'Arief Said', rows: [], overdue: 0, prefillParam: 'r=person-1' },
    ]
    renderCards({ groups, openAddTask })
    const addBtn = screen.getByRole('button', { name: /add task to arief said/i })
    fireEvent.click(addBtn)
    expect(openAddTask).toHaveBeenCalledWith('r=person-1')
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
  })
})
