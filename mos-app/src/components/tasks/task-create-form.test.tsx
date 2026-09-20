// TaskCreateForm — the ONE task-creation form: Title (full width, visible
// label) → Team/PIC/Supervisor (each with a visible label; Team + Supervisor required) →
// derived Business unit → footer (Create task / Cancel). Field-level validation only —
// TaskRow (desktop, colSpan row) and MobileGroupedCards' TaskCard (phone, single column) both
// render this SAME component; see task-row.test.tsx / mobile-grouped-cards.test.tsx for their
// side of the delegation.
import type { ComponentProps } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TaskCreateForm } from './task-create-form'
import type { TaskListRow } from '@/lib/db/tasks.types'

function makeDraft(overrides: Partial<TaskListRow> = {}): TaskListRow {
  return {
    id: 'new-task-1', org_id: '', title: '',
    business_unit_id: 'bu-1', status: 'Open',
    responsible_person_id: 'viewer-1', accountable_person_id: 'person-2',
    consulted_person_ids: [], informed_person_ids: [],
    description: null, due_date: null, objective_id: null, work_line_id: null,
    last_activity_at: '2026-06-01T00:00:00Z', archived_at: null, created_by: 'viewer-1',
    created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-01T00:00:00Z',
    process_run_id: null, generated_from_task_def_id: null,
    team_id: 'team-1',
    ...overrides,
  }
}

function renderForm(overrides: Partial<ComponentProps<typeof TaskCreateForm>> = {}) {
  const onCreate = vi.fn().mockResolvedValue(undefined)
  const onCancel = vi.fn()
  const props: ComponentProps<typeof TaskCreateForm> = {
    task: makeDraft(),
    businessUnitName: 'Retail Ops',
    teamOptions: [{ id: 'team-1', name: 'HQ Operations', businessUnitId: 'bu-1' }],
    personOptions: [{ id: 'viewer-1', full_name: 'Dewi Director' }],
    supervisorOptions: [{ id: 'person-2', full_name: 'Budi Setiawan' }],
    ownerName: 'Dewi Director',
    supervisorName: 'Budi Setiawan',
    onEditTeam: vi.fn().mockResolvedValue(undefined),
    onEditPic: vi.fn().mockResolvedValue(undefined),
    onEditSupervisor: vi.fn().mockResolvedValue(undefined),
    onCreate,
    onCancel,
    ...overrides,
  }
  const utils = render(<TaskCreateForm {...props} />)
  return { ...utils, onCreate, onCancel }
}

describe('TaskCreateForm — labels and required markers', () => {
  it('gives every field a visible label, and marks Team + Supervisor required (PIC is not)', () => {
    renderForm()
    expect(screen.getByText('Title')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Title' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Team' })).toHaveAttribute('aria-required', 'true')
    expect(screen.getByRole('combobox', { name: 'Supervisor' })).toHaveAttribute('aria-required', 'true')
    expect(screen.getByRole('combobox', { name: 'PIC' })).not.toHaveAttribute('aria-required')
    // A visible asterisk beside each required label — never programmatic-only.
    const teamLabel = screen.getByText('Team').closest('label')
    const supervisorLabel = screen.getByText('Supervisor').closest('label')
    expect(teamLabel?.textContent).toContain('*')
    expect(supervisorLabel?.textContent).toContain('*')
    expect(screen.getByText('PIC').closest('label')?.textContent).not.toContain('*')
  })

  it('shows the derived Business unit once, as quiet read-only text tied to Team', () => {
    renderForm()
    const hint = screen.getByTestId('task-create-derived-bu')
    expect(hint).toHaveTextContent('Business unit: Retail Ops')
    // Exactly one occurrence — no duplicate BU line anywhere else in the form.
    expect(screen.getAllByText(/Business unit: Retail Ops/)).toHaveLength(1)
  })
})

describe('TaskCreateForm — validation', () => {
  it('empty title on Save shows the title-required error under the Title field and keeps the draft', () => {
    const { onCreate, onCancel } = renderForm({ task: makeDraft({ title: '' }) })
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }))
    const titleInput = screen.getByRole('textbox', { name: 'Title' })
    expect(screen.getByRole('alert')).toHaveTextContent('Title is required')
    expect(titleInput).toHaveAttribute('aria-invalid', 'true')
    expect(titleInput).toHaveFocus()
    // Never a silent discard.
    expect(onCreate).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('empty title on Enter also shows the error and never discards', () => {
    const { onCreate, onCancel } = renderForm({ task: makeDraft({ title: '' }) })
    const titleInput = screen.getByRole('textbox', { name: 'Title' })
    fireEvent.keyDown(titleInput, { key: 'Enter' })
    expect(screen.getByRole('alert')).toHaveTextContent('Title is required')
    expect(onCreate).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('a missing Supervisor shows its error directly under the Supervisor control, marks it invalid, and moves focus there', () => {
    renderForm({ task: makeDraft({ title: 'Ship the launch', accountable_person_id: '' }) })
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }))
    const supervisor = screen.getByRole('combobox', { name: 'Supervisor' })
    const error = screen.getByRole('alert')
    expect(error).toHaveTextContent('Supervisor is required')
    expect(supervisor).toHaveAttribute('aria-invalid', 'true')
    expect(supervisor).toHaveAttribute('aria-describedby', error.id)
    expect(supervisor).toHaveFocus()
  })

  it('a missing Team is checked (and focused) before Supervisor, title first of all', () => {
    renderForm({ task: makeDraft({ title: '', team_id: null, business_unit_id: '', accountable_person_id: '' }) })
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }))
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveFocus()
  })

  it('Enter submits once every field is valid', async () => {
    const { onCreate } = renderForm({ task: makeDraft({ title: 'Ship the launch' }) })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Title' }), { key: 'Enter' })
    expect(onCreate).toHaveBeenCalledWith('Ship the launch')
  })
})

describe('TaskCreateForm — discard, busy and retry', () => {
  it('Escape on the title discards the whole draft', () => {
    const { onCancel } = renderForm()
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Title' }), { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('while saving, the primary shows a busy label and every control is disabled', async () => {
    let resolveCreate!: () => void
    const onCreate = vi.fn(() => new Promise<void>((resolve) => { resolveCreate = resolve }))
    renderForm({ task: makeDraft({ title: 'Ship the launch' }), onCreate })
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }))
    const primary = await screen.findByRole('button', { name: 'Creating…' })
    expect(primary).toHaveAttribute('aria-busy', 'true')
    expect(primary).toBeDisabled()
    expect(screen.getByRole('textbox', { name: 'Title' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Team' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    resolveCreate()
  })

  it('a failed save keeps every entered value and offers Retry', async () => {
    const onCreate = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined)
    renderForm({ task: makeDraft({ title: 'Ship the launch' }), onCreate })
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }))
    const retry = await screen.findByRole('button', { name: /retry/i })
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Ship the launch')
    fireEvent.click(retry)
    await screen.findByRole('button', { name: 'Create task' })
    expect(onCreate).toHaveBeenCalledTimes(2)
  })
})
