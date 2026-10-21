import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@/i18n/I18nProvider'
import { listAvailableCafeStreamItems, setCafeStreamItem } from '@/lib/db/cafe-stream-items'
import { CafeStreamItemsActions } from './cafe-stream-items-actions'

vi.mock('@/lib/db/cafe-stream-items', () => ({ listAvailableCafeStreamItems: vi.fn(), setCafeStreamItem: vi.fn() }))
const stream = { branch: { id: 'branch', name: 'Branch', code: 'branch' }, activity: 'kitchen' as const }
const onChanged = vi.fn().mockResolvedValue(undefined)
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listAvailableCafeStreamItems).mockResolvedValue([{ id: 'hidden', name: 'Soup', hidden: true }])
  vi.mocked(setCafeStreamItem).mockResolvedValue()
})
function setup(locale: 'en' | 'id' = 'en', disabled = false) {
  return render(<I18nProvider initialLocale={locale}><CafeStreamItemsActions stream={stream} selectedItem={{ id: 'item', name: 'Rice' }} disabled={disabled} onChanged={onChanged} /></I18nProvider>)
}

it.each([
  ['en', 'Hide from this stream', 'Hide item', 'Your saved settings are kept. The item stays hidden after refresh until you add it back.'],
  ['id', 'Sembunyikan dari alur ini', 'Sembunyikan item', 'Pengaturan tersimpan tetap disimpan. Item tetap tersembunyi setelah penyegaran sampai Anda menambahkannya kembali.'],
] as const)('confirms reversible hide in %s without deleting settings', async (locale, action, confirm, body) => {
  const user = userEvent.setup()
  setup(locale)
  await user.click(screen.getByRole('button', { name: action }))
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByText(body)).toBeInTheDocument()
  expect(setCafeStreamItem).not.toHaveBeenCalled()
  await user.click(within(dialog).getByRole('button', { name: confirm }))
  await waitFor(() => expect(onChanged).toHaveBeenCalledOnce())
  expect(setCafeStreamItem).toHaveBeenCalledWith(stream, 'item', true)
})

it.each([['en', 'Add item', 'Choose item', 'Restore: Soup'], ['id', 'Tambah item', 'Pilih item', 'Tampilkan kembali: Soup']] as const)('restores hidden catalog item by keyboard in %s', async (locale, add, choose, option) => {
  const user = userEvent.setup()
  setup(locale)
  screen.getByRole('button', { name: add }).focus()
  await user.keyboard('{Enter}')
  const dialog = await screen.findByRole('dialog')
  const picker = await within(dialog).findByRole('combobox', { name: choose })
  picker.focus()
  await user.keyboard('{Enter}')
  expect(await screen.findByRole('option', { name: option })).toBeInTheDocument()
  await user.keyboard('{Enter}')
  within(dialog).getByRole('button', { name: add }).focus()
  await user.keyboard('{Enter}')
  await waitFor(() => expect(setCafeStreamItem).toHaveBeenCalledWith(stream, 'hidden', false))
  expect(onChanged).toHaveBeenCalledOnce()
})

it('blocks stream membership changes while settings are dirty or saving', () => {
  setup('en', true)
  expect(screen.getByRole('button', { name: 'Add item' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Hide from this stream' })).toBeDisabled()
})

it('recovers from catalog and write failures without announcing success', async () => {
  const user = userEvent.setup()
  vi.mocked(listAvailableCafeStreamItems).mockRejectedValueOnce(new Error('offline'))
  setup()
  await user.click(screen.getByRole('button', { name: 'Add item' }))
  await user.click(await screen.findByRole('button', { name: 'Try again' }))
  await user.click(await screen.findByRole('combobox', { name: 'Choose item' }))
  await user.click(await screen.findByRole('option', { name: 'Restore: Soup' }))
  vi.mocked(setCafeStreamItem).mockRejectedValueOnce(new Error('offline'))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add item' }))
  expect(await screen.findByRole('alert')).toBeInTheDocument()
  expect(onChanged).not.toHaveBeenCalled()
})

it('keeps the add dialog locked during submission and does not double-write', async () => {
  const user = userEvent.setup()
  let finish!: () => void
  vi.mocked(setCafeStreamItem).mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
  vi.mocked(listAvailableCafeStreamItems).mockResolvedValue([{ id: 'new', name: 'Lentils', hidden: false }])
  setup()
  await user.click(screen.getByRole('button', { name: 'Add item' }))
  await user.click(await screen.findByRole('combobox', { name: 'Choose item' }))
  await user.click(await screen.findByRole('option', { name: 'Lentils' }))
  await user.dblClick(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add item' }))
  await user.keyboard('{Escape}')
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' })).toBeDisabled()
  expect(setCafeStreamItem).toHaveBeenCalledExactlyOnceWith(stream, 'new', false)
  finish()
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})

it('can cancel hiding or retry a failed hide without discarding settings', async () => {
  const user = userEvent.setup()
  setup()
  await user.click(screen.getByRole('button', { name: 'Hide from this stream' }))
  await user.keyboard('{Escape}')
  expect(setCafeStreamItem).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Hide from this stream' }))
  vi.mocked(setCafeStreamItem).mockRejectedValueOnce(new Error('offline'))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Hide item' }))
  expect(await screen.findByRole('alert')).toBeInTheDocument()
  expect(onChanged).not.toHaveBeenCalled()
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Hide item' }))
  await waitFor(() => expect(onChanged).toHaveBeenCalledOnce())
})

it('shows an honest empty catalog and Escape returns focus without writing', async () => {
  const user = userEvent.setup()
  vi.mocked(listAvailableCafeStreamItems).mockResolvedValue([])
  setup()
  const button = screen.getByRole('button', { name: 'Add item' })
  await user.click(button)
  expect(await screen.findByText('No more catalog items for this activity.')).toBeInTheDocument()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(button).toHaveFocus()
  expect(setCafeStreamItem).not.toHaveBeenCalled()
})
