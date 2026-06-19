// TaskRow — PR-2 AC-T03/T04/T05/T06. Extracted from TasksWorkspace.renderRow;
// adds the hover-revealed leading checkbox (RowCheckbox) + trailing ⋯ menu
// (RowMenu). The name cell is a real <a href="/tasks/:id"> Chip-link; status is
// a soft StatusPill that never wraps; body rows are 50px (OD-P3-6).
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { TaskRow } from './task-row'
import type { TaskRowProps } from './task-row'
import type { TaskListRow } from '@/lib/db/tasks.types'
import type { OwnerCellRaciMember } from './owner-cell'

const NOW = new Date('2026-06-19T00:00:00Z')

function makeTask(overrides: Partial<TaskListRow> = {}): TaskListRow {
  return {
    id: 'task-7', org_id: 'org', title: 'Finalise Q3 roastery output forecast',
    business_unit_id: 'bu-1', status: 'Blocked',
    responsible_person_id: 'p-1', accountable_person_id: 'p-1',
    consulted_person_ids: [], informed_person_ids: [],
    description: null, due_date: '2026-06-12', last_activity_at: '2026-06-14T10:00:00Z',
    archived_at: null, created_by: 'p-1',
    created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-14T00:00:00Z',
    ...overrides,
  }
}

const baseProps = (overrides: Partial<TaskRowProps> = {}): TaskRowProps => ({
  task: makeTask(),
  now: NOW,
  condensed: false,
  isSelected: false,
  isCursor: false,
  leafIndex: 0,
  buName: 'Roastery',
  ownerName: 'Rina Lestari',
  others: [] as OwnerCellRaciMember[],
  onOpen: () => {},
  checked: false,
  onCheck: () => {},
  ...overrides,
})

function renderRow(props: Partial<TaskRowProps> = {}) {
  return render(
    <MemoryRouter>
      <table><tbody><TaskRow {...baseProps(props)} /></tbody></table>
    </MemoryRouter>,
  )
}

describe('TaskRow — AC-T03 name cell is a Chip-link to /tasks/:id', () => {
  it('AC-T03: name is a real <a> whose href ends /tasks/:id and carries title', () => {
    renderRow()
    const link = screen.getByRole('link', { name: /Finalise Q3 roastery output forecast/i })
    expect(link.tagName).toBe('A')
    expect(link.getAttribute('href')).toBe('/tasks/task-7')
    // truncate + title (no-bleed: identity string ellipsizes + carries title)
    expect(link.getAttribute('title')).toBe('Finalise Q3 roastery output forecast')
  })

  it('AC-T03: the truncated name element carries the task-name class (ellipsis CSS hook)', () => {
    const { container } = renderRow()
    expect(container.querySelector('.task-name')).toBeTruthy()
  })

  it('AC-T03: name link is a real href anchor (middle-click / open-in-new-tab)', () => {
    const onOpen = vi.fn()
    renderRow({ onOpen })
    const link = screen.getByRole('link', { name: /Finalise Q3/i })
    expect(link.getAttribute('href')).toBe('/tasks/task-7')
    expect(document.querySelector('tr.task-row')).toBeTruthy()
  })

  it('AC-T03: an archived task shows the Archived tag + archived name styling', () => {
    renderRow({ task: makeTask({ archived_at: '2026-06-10T00:00:00Z' }) })
    expect(screen.getByText('Archived')).toBeInTheDocument()
    expect(document.querySelector('.task-name-archived')).toBeTruthy()
  })
})

describe('TaskRow — AC-T05 status is a soft pill (dot+text never color-alone) that never wraps', () => {
  it('AC-T05: status renders the StatusPill text (the non-color cue) inside a .mk-tag', () => {
    renderRow()
    const tag = document.querySelector('.mk-tag')!
    expect(tag).toBeTruthy()
    expect(tag.textContent).toContain('Blocked')
  })

  it('AC-T05: the status pill carries a leading dot (the redundant non-color marker)', () => {
    renderRow()
    const tag = document.querySelector('.mk-tag')!
    // The dot is aria-hidden (redundant cue only) and lives INSIDE the Tag,
    // before the label — never the sole signal (the status word is the name).
    const dot = tag.querySelector('.status-dot')
    expect(dot, 'expected a leading status dot inside the pill').toBeTruthy()
    expect(dot!.getAttribute('aria-hidden')).toBe('true')
  })

  it('AC-T05: the status cell + the Tag never wrap (td-nowrap cell + Tag.css nowrap)', () => {
    const { container } = renderRow()
    // The status <td> carries the no-wrap hook so the pill never breaks across lines.
    expect(container.querySelector('td.td-status.td-nowrap, td.td-nowrap.td-status')).toBeTruthy()
    const css = readFileSync(resolve(process.cwd(), 'src/components/ui/Tag.css'), 'utf8')
    expect(css).toMatch(/\.mk-tag\b[^}]*white-space:\s*nowrap/)
  })
})

describe('TaskRow — AC-T06 body row is 50px (OD-P3-6 dense DB-view)', () => {
  it('AC-T06: the row renders td-cell cells whose CSS rule sets height: 50px', () => {
    renderRow()
    expect(document.querySelector('tr.task-row td.td-cell, tr.task-row td.td-main')).toBeTruthy()
    const css = readFileSync(resolve(process.cwd(), 'src/components/tasks/TasksWorkspace.css'), 'utf8')
    expect(css).toMatch(/\.td-main,\s*\.td-cell\s*\{[^}]*height:\s*50px/)
  })
})

describe('TaskRow — AC-T02 row carries the reveal hooks for checkbox + menu', () => {
  it('AC-T02: renders a leading RowCheckbox + trailing RowMenu inside the row', () => {
    renderRow()
    const row = document.querySelector('tr.task-row')!
    expect(row.querySelector('button.row-checkbox')).toBeTruthy()
    expect(row.querySelector('button.row-menu')).toBeTruthy()
  })
})

describe('TaskRow — AC-T04 row hover/selected styling (CSS lock)', () => {
  it('AC-T04: hover uses the secondary-background token; selected uses a neutral (non-blue) fill', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/components/tasks/TasksWorkspace.css'), 'utf8')
    // hover fill references the secondary background token family
    expect(css).toMatch(/\.task-row:hover\s+td\s*\{[^}]*var\(--(?:surface-secondary|secondary)\)/)
    // selected fill exists + is the neutral secondary (NOT --accent=blue, per the
    // ratified de-bluing / One-Blue Rule; AC-T04 "(existing row-selected)").
    const selIdx = css.indexOf('.task-row.row-selected td')
    expect(selIdx).toBeGreaterThanOrEqual(0)
    const selBody = css.slice(css.indexOf('{', selIdx) + 1, css.indexOf('}', css.indexOf('{', selIdx)))
    expect(selBody).toMatch(/background:\s*var\(--secondary\)/)
    expect(selBody).not.toMatch(/var\(--accent\)/)
    expect(selBody).not.toMatch(/var\(--primary\)/)
  })
})
