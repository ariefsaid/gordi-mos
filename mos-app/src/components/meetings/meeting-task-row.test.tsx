// `/task`: typing the title and picking the PIC creates the real Task, and the row then holds only its id.
import { describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@/i18n/I18nProvider'
import { sanitizeBlockDocument } from '@/lib/db/block-document'
import { MeetingMinutesProvider, type MeetingMinutes } from './meeting-minutes-context'
import { meetingMinutesExtension } from './meeting-minutes-blocks'
import { DraftTaskRow } from './meeting-task-row'

const TASK = '11111111-1111-4111-8111-111111111111'

function minutes(createTask: MeetingMinutes['createTask']): MeetingMinutes {
  return {
    meetingId: 'm1', isPrivate: false, canAdd: true, tasks: [], frozen: false,
    people: [{ id: 'me', full_name: 'Dewi Director' }, { id: 'p2', full_name: 'Cahya Cafe' }],
    picChoices: [{ id: 'me', full_name: 'Dewi Director' }, { id: 'p2', full_name: 'Cahya Cafe' }],
    canEditTask: () => true, openTask: vi.fn(), createTask, setStatus: vi.fn(), setDue: vi.fn(), setPic: vi.fn(),
  }
}

function mount(createTask: MeetingMinutes['createTask'], onCreated = vi.fn()) {
  render(
    <I18nProvider>
      <MeetingMinutesProvider value={minutes(createTask)}>
        <DraftTaskRow onCreated={onCreated} onDiscard={vi.fn()} />
      </MeetingMinutesProvider>
    </I18nProvider>,
  )
  return onCreated
}

async function pick(name: string) {
  await userEvent.click(screen.getByRole('combobox', { name: /Choose PIC/ }))
  await userEvent.click(await screen.findByRole('option', { name }))
}

describe('/task draft row', () => {
  it('creates the real Task once the title is typed and the PIC picked, says so meanwhile, then hands back only its id', async () => {
    let finish: (id: string) => void = () => {}
    const createTask = vi.fn(() => new Promise<string>((resolve) => { finish = resolve }))
    const onCreated = mount(createTask)
    await userEvent.type(screen.getByRole('textbox', { name: 'Title of the new task' }), 'Fix the Cafe 2 ice machine drain')
    await pick('Cahya Cafe')
    expect(createTask).toHaveBeenCalledWith({ title: 'Fix the Cafe 2 ice machine drain', picId: 'p2', dueDate: null })
    expect(screen.getByText('Creating the Task…')).toBeInTheDocument()
    expect(onCreated).not.toHaveBeenCalled()
    await act(async () => { finish(TASK) })
    expect(onCreated).toHaveBeenCalledWith(TASK)
  })

  it('creates nothing while the title is empty', async () => {
    const createTask = vi.fn().mockResolvedValue(TASK)
    mount(createTask)
    await pick('Cahya Cafe')
    expect(createTask).not.toHaveBeenCalled()
  })

  it('says it failed and creates it again on Retry', async () => {
    const createTask = vi.fn().mockRejectedValueOnce(new Error('no')).mockResolvedValueOnce(TASK)
    const onCreated = mount(createTask)
    await userEvent.type(screen.getByRole('textbox', { name: 'Title of the new task' }), 'Order burrs{Enter}')
    expect(createTask).not.toHaveBeenCalled()
    await pick('Dewi Director')
    expect(await screen.findByRole('alert')).toHaveTextContent('The Task couldn’t be created.')
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(createTask).toHaveBeenCalledTimes(2)
    await vi.waitFor(() => expect(onCreated).toHaveBeenCalledWith(TASK))
  })
})

describe('task rows in the stored minutes', () => {
  const options = { blocks: Object.fromEntries(Object.entries(meetingMinutesExtension.blocks).map(([type, block]) => [type, block.sanitize])) }

  it('keeps a task row as its Task id only', () => {
    expect(sanitizeBlockDocument([{ type: 'taskRow', id: 'b1', props: { taskId: TASK.toUpperCase(), title: 'x' } }], options))
      .toEqual([{ type: 'taskRow', id: 'b1', props: { taskId: TASK } }])
  })

  it('drops a draft row and anything that is not a Task id, and keeps the table block bare', () => {
    expect(sanitizeBlockDocument([
      { type: 'taskRow', props: { taskId: '' } }, { type: 'taskRow', props: { taskId: 'not-a-uuid' } }, { type: 'tasksTable', props: { x: 1 } },
    ], options)).toEqual([{ type: 'tasksTable' }])
  })

  it('does not keep the task blocks in a document that did not ask for them', () => {
    expect(sanitizeBlockDocument([{ type: 'taskRow', props: { taskId: TASK } }])).toEqual([])
  })

  it('offers /task and /tasks in the slash menu', () => {
    const t = (key: string) => key
    const items = meetingMinutesExtension.slashItems({ editor: {} as never, t: t as never, group: 'Basic' })
    expect(items.map((item) => item.title)).toEqual(['meetings.slash.task', 'meetings.slash.tasks'])
  })
})
