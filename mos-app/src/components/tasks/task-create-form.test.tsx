// TaskCreateForm — the ONE task-creation form: Title (full width, visible
// label) → Team/PIC/Supervisor (each with a visible label; Team + Supervisor required) →
// Due date + Project/Process (both optional) → derived Business unit → footer (Create task / Cancel). Field-level validation only —
// TaskRow (desktop, colSpan row) and MobileGroupedCards' TaskCard (phone, single column) both
// render this SAME component; see task-row.test.tsx / mobile-grouped-cards.test.tsx for their
// side of the delegation.
import type { ComponentProps, ReactElement } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TASK_TITLE_MAX_LENGTH } from './task-formatters'
import { installDisabledBlur } from '@/test/browser-focus-fixup'
import { I18nProvider } from '@/i18n/I18nProvider'
import { AuthContext } from '@/auth/context'
import { TaskCreateForm } from './task-create-form'
import { TaskCreateContext } from './task-create-context'
import type { TaskRow } from '@/lib/db/tasks.types'

function makeDraft(overrides: Partial<TaskRow> = {}): TaskRow {
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

function baseProps(overrides: Partial<ComponentProps<typeof TaskCreateForm>> = {}): ComponentProps<typeof TaskCreateForm> {
  const onCreate = vi.fn().mockResolvedValue(undefined)
  const onCancel = vi.fn()
  return {
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
}

function renderForm(
  overrides: Partial<ComponentProps<typeof TaskCreateForm>> = {},
  wrap: (form: ReactElement) => ReactElement = (form) => form,
) {
  const props = baseProps(overrides)
  const utils = render(wrap(<TaskCreateForm {...props} />))
  return { ...utils, onCreate: props.onCreate as ReturnType<typeof vi.fn>, onCancel: props.onCancel as ReturnType<typeof vi.fn> }
}

describe('TaskCreateForm — the blank Task page', () => {
  it('localizes the PIC/Supervisor hint in Indonesian', () => {
    renderForm({}, (form) => <I18nProvider initialLocale="id">{form}</I18nProvider>)
    expect(screen.getByText('PIC mengerjakan · Supervisor menindaklanjuti')).toBeInTheDocument()
  })

  it('names every property, shows Needed for a missing Team and Supervisor, and keeps the PIC hint', () => {
    renderForm({ task: makeDraft({ team_id: undefined, business_unit_id: '', accountable_person_id: '' }) })
    expect(screen.getByRole('textbox', { name: 'Title' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Team' })).toHaveAttribute('aria-required', 'true')
    expect(screen.getByRole('combobox', { name: 'Supervisor' })).toHaveAttribute('aria-required', 'true')
    expect(screen.getByRole('combobox', { name: 'PIC' })).not.toHaveAttribute('aria-required')
    expect(screen.getAllByText('Needed')).toHaveLength(2)
    expect(screen.getByText('PIC does the work · Supervisor follows up')).toBeInTheDocument()
  })

  it('shows no Needed once Team and Supervisor are set, and untitled placeholder invites a title', () => {
    renderForm()
    expect(screen.queryByText('Needed')).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveAttribute('placeholder', 'Untitled')
  })

  it('starts with the cursor in the title', () => {
    renderForm()
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveFocus()
  })

  it('Create task stays outlined until title, Team and Supervisor are set, then fills', () => {
    const states = [
      { overrides: { task: makeDraft({ title: '' }) }, cls: 'btn-outline' },
      { overrides: { task: makeDraft({ title: 'Ship it', accountable_person_id: '' }) }, cls: 'btn-outline' },
      { overrides: { task: makeDraft({ title: 'Ship it', team_id: undefined, business_unit_id: '' }) }, cls: 'btn-outline' },
      { overrides: { task: makeDraft({ title: 'Ship it' }) }, cls: 'btn-primary' },
    ]
    for (const { overrides, cls } of states) {
      const { unmount } = renderForm(overrides)
      expect(screen.getByRole('button', { name: 'Create task' })).toHaveClass(cls)
      unmount()
    }
  })

  it('Hide properties folds to a summary that shows missing values as Needed, and a Create attempt unfolds it', async () => {
    window.localStorage.clear()
    renderForm({ task: makeDraft({ title: 'Ship it', team_id: undefined, business_unit_id: '', accountable_person_id: '' }) })
    fireEvent.click(screen.getByRole('button', { name: 'Hide properties' }))
    expect(screen.queryByRole('combobox', { name: 'Team' })).toBeNull()
    const summary = screen.getByRole('region', { name: 'Properties' })
    expect(summary).toHaveTextContent('Dewi Director')
    expect(summary.querySelectorAll('.tcf-needed')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }))
    expect(await screen.findByRole('combobox', { name: 'Team' })).toBeInTheDocument()
    expect(screen.getByText('Team is required')).toBeInTheDocument()
    window.localStorage.clear()
  })

  it('marks the PIC as (you) when the viewer is the PIC', () => {
    const viewer = { person: { id: 'viewer-1', full_name: 'Dewi Director' }, roles: [], isManager: false, accessRoles: [], affiliated: [] }
    renderForm({}, (form) => (
      <AuthContext.Provider value={{ status: 'authenticated', viewer: viewer as never, signOut: async () => {} }}>{form}</AuthContext.Provider>
    ))
    expect(screen.getByRole('combobox', { name: 'PIC' })).toHaveTextContent('Dewi Director (you)')
  })

  it('shows the derived Business Unit once, as read-only text', () => {
    renderForm()
    expect(screen.getByTestId('task-create-derived-bu')).toHaveTextContent('Retail Ops')
    expect(screen.getAllByText('Retail Ops')).toHaveLength(1)
  })
})

describe('TaskCreateForm — validation', () => {
  it('marks an empty Title required on blur without surfacing unrelated required errors', () => {
    renderForm({ task: makeDraft({ title: '' }) })
    const title = screen.getByRole('textbox', { name: 'Title' })
    fireEvent.blur(title)

    expect(screen.getByRole('alert')).toHaveTextContent('Title is required')
    expect(title).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText('Team is required')).toBeNull()
    expect(screen.queryByText('Supervisor is required')).toBeNull()
  })

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

  it('a missing Supervisor shows its error directly under the Supervisor control, marks it invalid, and moves focus there', async () => {
    renderForm({ task: makeDraft({ title: 'Ship the launch', accountable_person_id: '' }) })
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }))
    const supervisor = screen.getByRole('combobox', { name: 'Supervisor' })
    const error = screen.getByRole('alert')
    expect(error).toHaveTextContent('Supervisor is required')
    expect(supervisor).toHaveAttribute('aria-invalid', 'true')
    expect(supervisor).toHaveAttribute('aria-describedby', error.id)
    await waitFor(() => expect(supervisor).toHaveFocus())
  })

  it('a missing Team is checked (and focused) before Supervisor, title first of all', () => {
    renderForm({ task: makeDraft({ title: '', team_id: null, business_unit_id: '', accountable_person_id: '' }) })
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }))
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveFocus()
  })

  it('Enter in Title moves to Team and never submits, even when every field is valid', () => {
    const { onCreate } = renderForm({ task: makeDraft({ title: 'Ship the launch' }) })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Title' }), { key: 'Enter' })
    expect(onCreate).not.toHaveBeenCalled()
    expect(screen.getByRole('combobox', { name: 'Team' })).toHaveFocus()
  })

  it('Create task submits the trimmed title once every field is valid', async () => {
    const { onCreate } = renderForm({ task: makeDraft({ title: '  Ship the launch ' }) })
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }))
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('Ship the launch', ''))
  })
})

describe('TaskCreateForm — discard, busy and retry', () => {
  it('Escape on the title discards the whole draft', () => {
    const { onCancel } = renderForm()
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Title' }), { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('Cancel discards the draft without creating', () => {
    const { onCancel, onCreate } = renderForm({ task: makeDraft({ title: 'Half typed' }) })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('offline: names the reason and blocks Create', () => {
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    try {
      const { onCreate } = renderForm({ task: makeDraft({ title: 'Ship it' }) })
      expect(screen.getByText('Reconnect to create this task.')).toBeInTheDocument()
      const create = screen.getByRole('button', { name: 'Create task' })
      expect(create).toBeDisabled()
      fireEvent.click(create)
      expect(onCreate).not.toHaveBeenCalled()
    } finally { spy.mockRestore() }
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
      fireEvent.click(screen.getByRole('button', { name: 'Create task' }))
      await screen.findByRole('button', { name: /retry/i })
      expect(onCreate).toHaveBeenCalledTimes(1)
      await waitFor(() => expect(title).toHaveFocus())
      expect(title).toHaveValue('Ship the launch')
      fireEvent.click(screen.getByRole('button', { name: /retry/i }))
      await screen.findByRole('button', { name: 'Create task' })
      expect(onCreate).toHaveBeenCalledTimes(2)
    } finally { restore() }
  })

  it('a rejected save after searching a Picker restores useful form focus and keyboard retry', async () => {
    const restore = installDisabledBlur()
    try {
      const user = userEvent.setup()
      let rejectCreate: (reason: Error) => void = () => {}
      const failedCreate = new Promise<void>((_resolve, reject) => { rejectCreate = reject })
      const onCreate = vi.fn()
        .mockReturnValueOnce(failedCreate)
        .mockResolvedValueOnce(undefined)
      const onEditTeam = vi.fn().mockResolvedValue(undefined)
      renderForm({
        task: makeDraft({ title: 'Ship the launch' }),
        teamOptions: [
          { id: 'team-1', name: 'HQ Operations', businessUnitId: 'bu-1' },
          { id: 'team-2', name: 'Field Operations', businessUnitId: 'bu-2' },
        ],
        onEditTeam,
        onCreate,
      })
      const team = screen.getByRole('combobox', { name: 'Team' })
      await user.click(team)
      const search = await screen.findByRole('combobox', { name: 'Filter Team' })
      expect(search).toHaveFocus()
      await user.type(search, 'Field')
      await user.click(await screen.findByRole('option', { name: 'Field Operations' }))
      await waitFor(() => expect(team).toHaveFocus())
      expect(onEditTeam).toHaveBeenCalledWith('new-task-1', 'team-2')

      await user.click(screen.getByRole('button', { name: 'Create task' }))
      expect(await screen.findByRole('button', { name: 'Creating…' })).toBeDisabled()

      await act(async () => {
        rejectCreate(new Error('offline'))
        await failedCreate.catch(() => undefined)
      })
      const retry = await screen.findByRole('button', { name: 'Retry' })
      const form = screen.getByRole('form')
      await waitFor(() => {
        const active = document.activeElement
        expect(active).toBeInstanceOf(HTMLElement)
        expect(form).toContainElement(active as HTMLElement)
        expect(active).not.toHaveAttribute('disabled')
      })
      expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Ship the launch')

      retry.focus()
      await user.keyboard('{Enter}')
      await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(2))
      expect(onCreate).toHaveBeenNthCalledWith(1, 'Ship the launch', '')
      expect(onCreate).toHaveBeenNthCalledWith(2, 'Ship the launch', '')
    } finally { restore() }
  })

  it('issue 1293: a second rejected save keeps focus on a usable form control after Retry is replaced', async () => {
    const restore = installDisabledBlur()
    try {
      const user = userEvent.setup()
      let rejectFirst!: (reason: Error) => void
      let rejectSecond!: (reason: Error) => void
      const firstWrite = new Promise<void>((_resolve, reject) => { rejectFirst = reject })
      const secondWrite = new Promise<void>((_resolve, reject) => { rejectSecond = reject })
      const onCreate = vi.fn().mockReturnValueOnce(firstWrite).mockReturnValueOnce(secondWrite)
      renderForm({ task: makeDraft({ title: 'Ship the launch' }), onCreate })

      const form = screen.getByRole('form')
      const title = screen.getByRole('textbox', { name: 'Title' })
      const create = screen.getByRole('button', { name: 'Create task' })
      await user.click(create)
      expect(await screen.findByRole('button', { name: 'Creating…' })).toBeDisabled()
      await act(async () => {
        rejectFirst(new Error('offline'))
        await firstWrite.catch(() => undefined)
      })
      const firstRetry = await screen.findByRole('button', { name: 'Retry' })
      await waitFor(() => {
        expect(form).toContainElement(document.activeElement as HTMLElement)
        expect(document.activeElement).not.toHaveAttribute('disabled')
      })
      expect(title).toHaveValue('Ship the launch')

      await user.click(firstRetry)
      expect(await screen.findByRole('button', { name: 'Creating…' })).toBeDisabled()
      await act(async () => {
        rejectSecond(new Error('offline again'))
        await secondWrite.catch(() => undefined)
      })

      const secondRetry = await screen.findByRole('button', { name: 'Retry' })
      expect(screen.getByRole('alert')).toHaveTextContent(/couldn't save/i)
      expect(title).toHaveValue('Ship the launch')
      expect(secondRetry).toBeEnabled()
      expect(create).toBeEnabled()
      expect(onCreate).toHaveBeenCalledTimes(2)
      expect(onCreate).toHaveBeenNthCalledWith(1, 'Ship the launch', '')
      expect(onCreate).toHaveBeenNthCalledWith(2, 'Ship the launch', '')
      // Create sits in the page header inside the form, so focus returns to that usable submit action.
      await waitFor(() => expect(create).toHaveFocus())
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
    expect(screen.getByRole('textbox', { name: 'Title' })).toBeDisabled()
    expect(screen.getByLabelText('Due date')).toBeDisabled()
    expect(onEditDue).not.toHaveBeenCalled()
    expect(onEditWorkLine).not.toHaveBeenCalled()
  })

  it('edit attempts during a link failure change nothing, and the Retry button links with the original values (#1116)', async () => {
    const user = userEvent.setup()
    const onRetryLink = vi.fn()
    const { onCreate } = renderWithContext({
      task: makeDraft({ title: 'Ship the launch', due_date: '2026-11-05' }),
      linkError: true,
      onRetryLink,
    })
    const title = screen.getByRole('textbox', { name: 'Title' })
    await user.type(title, ' edited')
    expect(title).toHaveValue('Ship the launch')
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetryLink).toHaveBeenCalledTimes(1)
    expect(title).toHaveValue('Ship the launch')
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('has no separate Objective field; the Objective comes from the Project/Process', () => {
    renderWithContext()
    expect(screen.queryByRole('combobox', { name: /objective/i })).not.toBeInTheDocument()
  })

  it('reads Title, Create task, PIC, Supervisor, Team, Due, then Project/Process', () => {
    renderWithContext()
    const order = [
      screen.getByRole('textbox', { name: 'Title' }),
      screen.getByRole('button', { name: 'Create task' }),
      screen.getByRole('combobox', { name: 'PIC' }),
      screen.getByRole('combobox', { name: 'Supervisor' }),
      screen.getByRole('combobox', { name: 'Team' }),
      screen.getByLabelText('Due date'),
      screen.getByRole('combobox', { name: 'Project/Process' }),
    ]
    order.slice(1).forEach((el, i) => {
      expect(order[i].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })
  })

  it('hides Project/Process when the viewer can see none', () => {
    renderForm()
    expect(screen.queryByRole('combobox', { name: 'Project/Process' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Due date')).toBeInTheDocument()
  })
})
