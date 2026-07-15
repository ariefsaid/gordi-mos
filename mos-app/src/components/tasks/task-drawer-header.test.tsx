import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TaskDrawerHeader } from './task-drawer-header'
import type { TaskListRow } from '@/lib/db/tasks.types'
import type { PersonOption } from '@/lib/db/directory'
import { I18nProvider } from '@/i18n/I18nProvider'

function makeTask(overrides: Partial<TaskListRow> = {}): TaskListRow {
  return {
    id: 'task-1', org_id: 'org', title: 'Replace chiller compressor',
    business_unit_id: 'bu-1', status: 'Blocked',
    responsible_person_id: 'p-r', accountable_person_id: 'p-a',
    consulted_person_ids: [], informed_person_ids: [],
    description: null, due_date: '2026-06-11',
    objective_id: null, work_line_id: null,
    last_activity_at: '2026-06-15T08:00:00Z',
    archived_at: null, created_by: 'p-r',
    created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-01T00:00:00Z',
    ...overrides,
  }
}

const people: PersonOption[] = [
  { id: 'p-r', full_name: 'Krishna Kitchen' },
  { id: 'p-a', full_name: 'Dewi Director' },
]

function renderHeader(props: Partial<Parameters<typeof TaskDrawerHeader>[0]> = {}) {
  return render(
    <TaskDrawerHeader
      task={makeTask()}
      buName="Cafe Ops"
      people={people}
      editable
      expanded={false}
      now={new Date('2026-06-15T08:30:00Z')}
      onStatusChange={vi.fn()}
      onMarkComplete={vi.fn()}
      onOpenPage={vi.fn()}
      onExpandToggle={vi.fn()}
      onClose={vi.fn()}
      onArchive={vi.fn()}
      archiveable
      {...props}
    />,
  )
}

describe('TaskDrawerHeader', () => {
  it('renders the pinned title, Team/PIC/Supervisor summary, and status actions', () => {
    renderHeader()
    expect(screen.getByText('Replace chiller compressor')).toBeInTheDocument()
    expect(screen.getAllByText(/Cafe Ops/).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /change status/i })).toBeInTheDocument()
    expect(screen.getByText('Krishna Kitchen')).toBeInTheDocument()
    expect(screen.getByText('Dewi Director')).toBeInTheDocument()
    expect(screen.getByText('Team')).toBeInTheDocument()
    expect(screen.getByText('PIC')).toBeInTheDocument()
    expect(screen.getByText('Supervisor')).toBeInTheDocument()
    expect(screen.queryByText(/RACI|Responsible|Accountable/)).toBeNull()
  })

  it('renders the expand + close controls with accessible labels', () => {
    renderHeader()
    expect(screen.getByRole('button', { name: /expand to full width/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument()
  })

  it('expand button reflects aria-pressed for the current expanded state', () => {
    const { rerender } = renderHeader({ expanded: false })
    expect(screen.getByRole('button', { name: /expand to full width/i })).toHaveAttribute('aria-pressed', 'false')
    rerender(
      <TaskDrawerHeader
        task={makeTask()} buName="Cafe Ops" people={people} editable expanded
        now={new Date('2026-06-15T08:30:00Z')}
        onStatusChange={vi.fn()} onExpandToggle={vi.fn()} onClose={vi.fn()} onArchive={vi.fn()} archiveable
      />,
    )
    expect(screen.getByRole('button', { name: /collapse to split/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows a static StatusPill (no trigger) for a non-editor', () => {
    renderHeader({ editable: false })
    expect(screen.queryByRole('button', { name: /change status/i })).toBeNull()
    expect(screen.getByText('Blocked')).toBeInTheDocument()
  })

  it('shows the Archive button only in expanded mode and only when archiveable', () => {
    // collapsed: archive lives in the foot, not the header
    const { rerender } = renderHeader({ expanded: false })
    expect(screen.queryByRole('button', { name: /archive task/i })).toBeNull()
    // expanded + archiveable: archive shows in the header action row
    rerender(
      <TaskDrawerHeader
        task={makeTask()} buName="Cafe Ops" people={people} editable expanded
        now={new Date('2026-06-15T08:30:00Z')}
        onStatusChange={vi.fn()} onExpandToggle={vi.fn()} onClose={vi.fn()} onArchive={vi.fn()} archiveable
      />,
    )
    expect(screen.getByRole('button', { name: /archive task/i })).toBeInTheDocument()
  })

  it('renders the completion and ownership grammar in Indonesian', () => {
    localStorage.setItem('mos.locale', 'id')
    render(
      <I18nProvider>
        <TaskDrawerHeader
          task={makeTask()}
          buName="Operasi Kafe"
          people={people}
          editable
          archiveable={false}
          expanded={false}
          now={new Date('2026-07-15T08:30:00Z')}
          onStatusChange={vi.fn()}
          onMarkComplete={vi.fn()}
          onOpenPage={vi.fn()}
          onExpandToggle={vi.fn()}
          onClose={vi.fn()}
          onArchive={vi.fn()}
        />
      </I18nProvider>,
    )
    expect(screen.getByRole('button', { name: 'Tandai selesai' })).toBeInTheDocument()
    expect(screen.getAllByText('Tim').length).toBeGreaterThan(0)
    expect(screen.getByText('Buka halaman penuh')).toBeInTheDocument()
    localStorage.removeItem('mos.locale')
  })
})
