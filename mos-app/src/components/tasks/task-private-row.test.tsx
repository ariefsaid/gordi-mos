import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@/i18n/I18nProvider'
import { TaskPrivateRow, type TaskPrivateRowProps } from './task-private-row'

const PEOPLE = [
  { id: 'me', full_name: 'Cahya Cafe' },
  { id: 'dewi', full_name: 'Dewi Director' },
  { id: 'budi', full_name: 'Budi Barista' },
]

function setup(props: Partial<TaskPrivateRowProps> = {}, locale: 'en' | 'id' = 'en') {
  const handlers = {
    onSetPrivate: vi.fn().mockResolvedValue(undefined),
    onAddViewer: vi.fn().mockResolvedValue(undefined),
    onRemoveViewer: vi.fn().mockResolvedValue(undefined),
  }
  render(
    <I18nProvider initialLocale={locale}>
      <TaskPrivateRow isPrivate={false} viewers={[]} people={PEOPLE} alreadyIds={['me']} canChange {...handlers} {...props} />
    </I18nProvider>,
  )
  return handlers
}

describe('TaskPrivateRow', () => {
  it('reads Off and turns Private on with one click', async () => {
    const { onSetPrivate } = setup()
    expect(screen.getByRole('status')).toHaveTextContent('Off')
    await userEvent.click(screen.getByRole('switch', { name: 'Private' }))
    expect(onSetPrivate).toHaveBeenCalledWith(true)
  })

  it('turns Private off, and re-sends the same change on Retry after a failure', async () => {
    const { onSetPrivate } = setup({ isPrivate: true })
    onSetPrivate.mockRejectedValueOnce(new Error('nope'))
    await userEvent.click(screen.getByRole('switch', { name: 'Private' }))
    expect(onSetPrivate).toHaveBeenLastCalledWith(false)
    await userEvent.click(await screen.findByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(onSetPrivate).toHaveBeenCalledTimes(2))
    expect(onSetPrivate).toHaveBeenLastCalledWith(false)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('counts the extra people, lists them, and adds or removes one', async () => {
    const { onAddViewer, onRemoveViewer } = setup({ isPrivate: true, viewers: [PEOPLE[1]] })
    expect(screen.getByRole('status')).toHaveTextContent('On · 1 more person can see')
    await userEvent.click(screen.getByRole('button', { name: 'Remove Dewi Director' }))
    expect(onRemoveViewer).toHaveBeenCalledWith('dewi')
    await userEvent.click(screen.getByRole('button', { name: 'Add person' }))
    const picker = await screen.findByRole('listbox')
    // The creator and people already listed are not offered again.
    expect(within(picker).queryByText('Cahya Cafe')).toBeNull()
    expect(within(picker).queryByText('Dewi Director')).toBeNull()
    await userEvent.click(within(picker).getByText('Budi Barista'))
    expect(onAddViewer).toHaveBeenCalledWith('budi')
  })

  it('says "Nobody added." for an empty list', () => {
    setup({ isPrivate: true })
    expect(screen.getByText('Nobody added.')).toBeInTheDocument()
  })

  it('shows plain text, no switch and no list controls, to someone who cannot change privacy', () => {
    setup({ isPrivate: true, viewers: [PEOPLE[1]], canChange: false })
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add person' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('On · 1 more person can see')
  })

  it('freezes the controls offline', () => {
    setup({ isPrivate: true, frozen: true })
    expect(screen.getByRole('switch', { name: 'Private' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add person' })).toBeDisabled()
  })

  it('reads "everyone in the meeting" for a Task from a private Meeting and locks the switch for someone outside it', () => {
    setup({ isPrivate: true, meetingPrivate: true, viewerInMeeting: false })
    expect(screen.getByRole('status')).toHaveTextContent('On · everyone in the meeting')
    expect(screen.getByRole('switch', { name: 'Private' })).toBeDisabled()
  })

  it('offers no who-can-see list for a Task from a private Meeting, whoever the viewer is', () => {
    setup({ isPrivate: true, meetingPrivate: true, viewerInMeeting: true })
    expect(screen.queryByRole('button', { name: 'Add person' })).toBeNull()
    expect(screen.queryByText('Nobody added.')).toBeNull()
  })

  it('lets someone in the private Meeting turn Private off', async () => {
    const { onSetPrivate } = setup({ isPrivate: true, meetingPrivate: true, viewerInMeeting: true })
    expect(screen.getByRole('status')).toHaveTextContent('On · everyone in the meeting')
    await userEvent.click(screen.getByRole('switch', { name: 'Private' }))
    expect(onSetPrivate).toHaveBeenCalledWith(false)
  })

  it('speaks Indonesian', () => {
    setup({ isPrivate: true, viewers: [PEOPLE[1], PEOPLE[2]] }, 'id')
    expect(screen.getByRole('status')).toHaveTextContent('Aktif · 2 orang lain bisa melihat')
    expect(screen.getByRole('switch', { name: 'Privat' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tambah orang' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hapus Dewi Director' })).toBeInTheDocument()
  })
})
