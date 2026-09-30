// TaskCreateForm — the ONE task-creation form: Title (full width, visible
// label) → Team/PIC/Supervisor (each with a visible label; Team + Supervisor required) →
// Due date + Project/Process (both optional) → derived Business unit → footer (Create task / Cancel). Field-level validation only —
// TaskRow (desktop, colSpan row) and MobileGroupedCards' TaskCard (phone, single column) both
// render this SAME component; see task-row.test.tsx / mobile-grouped-cards.test.tsx for their
// side of the delegation.
import type { ComponentProps, ReactElement } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TASK_TITLE_MAX_LENGTH } from './task-formatters'
import { installDisabledBlur } from '@/test/browser-focus-fixup'
import { TaskCreateForm } from './task-create-form'
import { TaskCreateContext } from './task-create-context'
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

function renderForm(
  overrides: Partial<ComponentProps<typeof TaskCreateForm>> = {},
  wrap: (form: ReactElement) => ReactElement = (form) => form,
) {
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
  const utils = render(wrap(<TaskCreateForm {...props} />))
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

  it('issue 979: a failed save hands focus back to the title with its text, and one retry creates once', async () => {
    const restore = installDisabledBlur()
    try {
      const onCreate = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
      renderForm({ task: makeDraft({ title: 'Ship the launch' }), onCreate })
      const title = screen.getByRole('textbox', { name: 'Title' })
      title.focus()
      fireEvent.keyDown(title, { key: 'Enter' })
      await screen.findByRole('button', { name: /retry/i })
      expect(onCreate).toHaveBeenCalledTimes(1)
      await waitFor(() => expect(title).toHaveFocus())
      expect(title).toHaveValue('Ship the launch')
      fireEvent.click(screen.getByRole('button', { name: /retry/i }))
      await screen.findByRole('button', { name: 'Create task' })
      expect(onCreate).toHaveBeenCalledTimes(2)
    } finally { restore() }
  })
})

describe('TaskCreateForm — title length (#1034)', () => {
  it('stops the Title at the shared limit when a long text is pasted', async () => {
    const user = userEvent.setup()
    renderForm()
    const title = screen.getByRole('textbox', { name: 'Title' }) as HTMLTextAreaElement
    await user.click(title)
    await user.paste('x'.repeat(TASK_TITLE_MAX_LENGTH + 50))
    expect(title.value).toHaveLength(TASK_TITLE_MAX_LENGTH)
  })
})

describe('TaskCreateForm — Due date + Project/Process (#1029)', () => {
  const WORK_LINES = [
    { id: 'wl-1', name: 'Q4 Launch', type: 'project' as const },
    { id: 'wl-2', name: 'Daily Open', type: 'process' as const },
  ]
  function renderWithContext(overrides: Partial<ComponentProps<typeof TaskCreateForm>> = {}) {
    const onEditDue = vi.fn().mockResolvedValue(undefined)
    const onEditWorkLine = vi.fn().mockResolvedValue(undefined)
    const utils = renderForm({ task: makeDraft({ title: 'Ship the launch' }), ...overrides }, (form) => (
      <TaskCreateContext.Provider value={{ workLineOptions: WORK_LINES, onEditDue, onEditWorkLine }}>
        {form}
      </TaskCreateContext.Provider>
    ))
    return { ...utils, onEditDue, onEditWorkLine }
  }

  it('the picked Due date reaches the draft', () => {
    const { onEditDue } = renderWithContext()
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-11-05' } })
    expect(onEditDue).toHaveBeenCalledWith('new-task-1', '2026-11-05')
  })

  it('clearing the Due date sends null, not an empty string', () => {
    const { onEditDue } = renderWithContext({ task: makeDraft({ title: 'x', due_date: '2026-11-05' }) })
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '' } })
    expect(onEditDue).toHaveBeenCalledWith('new-task-1', null)
  })

  it('the Project/Process picker offers None plus the visible Projects and Processes, and reports the choice', async () => {
    const user = userEvent.setup()
    const { onEditWorkLine } = renderWithContext()
    await user.click(screen.getByRole('combobox', { name: 'Project/Process' }))
    expect(screen.getByRole('option', { name: /None/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Daily Open/ })).toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: /Q4 Launch/ }))
    expect(onEditWorkLine).toHaveBeenCalledWith('new-task-1', 'wl-1')
  })

  it('choosing None sends null', async () => {
    const user = userEvent.setup()
    const { onEditWorkLine } = renderWithContext({ task: makeDraft({ title: 'x', work_line_id: 'wl-1' }) })
    await user.click(screen.getByRole('combobox', { name: 'Project/Process' }))
    await user.click(screen.getByRole('option', { name: /None/ }))
    expect(onEditWorkLine).toHaveBeenCalledWith('new-task-1', null)
  })

  it('a failed Signal link locks every draft field so no edit is lost by the link-only retry (#1116)', () => {
    const { onEditDue, onEditWorkLine } = renderWithContext({ linkError: true, onRetryLink: vi.fn() })
    expect(screen.getByRole('alert')).toHaveTextContent('Retry')
    for (const name of ['Team', 'PIC', 'Supervisor', 'Project/Process']) {
      expect(screen.getByRole('combobox', { name })).toBeDisabled()
    }
    expect(screen.getByLabelText('Due date')).toBeDisabled()
    expect(onEditDue).not.toHaveBeenCalled()
    expect(onEditWorkLine).not.toHaveBeenCalled()
  })

  it('has no separate Objective field; the Objective comes from the Project/Process', () => {
    renderWithContext()
    expect(screen.queryByRole('combobox', { name: /objective/i })).not.toBeInTheDocument()
  })

  it('reads Title, Team, PIC, Supervisor, Due, Project/Process, then Create task', () => {
    renderWithContext()
    const order = [
      screen.getByRole('textbox', { name: 'Title' }),
      screen.getByRole('combobox', { name: 'Team' }),
      screen.getByRole('combobox', { name: 'PIC' }),
      screen.getByRole('combobox', { name: 'Supervisor' }),
      screen.getByLabelText('Due date'),
      screen.getByRole('combobox', { name: 'Project/Process' }),
      screen.getByRole('button', { name: 'Create task' }),
    ]
    order.slice(1).forEach((el, i) => {
      expect(order[i].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })
  })

  it('Enter in Title with a valid draft creates once and never jumps to another field', () => {
    const { onCreate } = renderWithContext()
    const title = screen.getByRole('textbox', { name: 'Title' })
    title.focus()
    fireEvent.keyDown(title, { key: 'Enter' })
    expect(onCreate).toHaveBeenCalledTimes(1)
    expect(onCreate).toHaveBeenCalledWith('Ship the launch')
    expect(title).toHaveFocus()
  })

  it('hides Project/Process when the viewer can see none', () => {
    renderForm()
    expect(screen.queryByRole('combobox', { name: 'Project/Process' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Due date')).toBeInTheDocument()
  })
})
