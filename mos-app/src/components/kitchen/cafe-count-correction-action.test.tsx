import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import { startCafeCountCorrection } from '@/lib/db/cafe-count-corrections'
import { CafeCountCorrectionAction } from './cafe-count-correction-action'

vi.mock('@/lib/db/cafe-count-corrections', () => ({ startCafeCountCorrection: vi.fn() }))
beforeEach(() => vi.resetAllMocks())

it('a reviewer enters a new observation and submits a linked correction once, without changing the original', async () => {
  let resolve: (id: string) => void = () => undefined
  vi.mocked(startCafeCountCorrection).mockReturnValue(new Promise<string>(done => { resolve = done }))
  const saved = vi.fn()
  render(<I18nProvider><CafeCountCorrectionAction lineId="original" itemName="Flour" unitName="kg" disabled={false} onSaved={saved} /></I18nProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'Start correction' }))
  expect(screen.getByRole('button', { name: 'Submit correction' })).toBeDisabled()
  fireEvent.change(screen.getByRole('textbox', { name: 'New counted quantity' }), { target: { value: '3,25' } })
  fireEvent.click(screen.getByRole('button', { name: 'Submit correction' }))
  fireEvent.click(screen.getByRole('button', { name: 'Working…' }))
  expect(startCafeCountCorrection).toHaveBeenCalledTimes(1)
  expect(startCafeCountCorrection).toHaveBeenCalledWith('original', '3.25', expect.any(String))
  resolve('new-line')
  await waitFor(() => expect(saved).toHaveBeenCalledOnce())
  expect(screen.getByRole('button', { name: 'Start correction' })).toBeInTheDocument()
})

it('a failed submission retains the quantity and idempotency key for retry', async () => {
  vi.mocked(startCafeCountCorrection).mockRejectedValueOnce(new Error('offline')).mockResolvedValue('new-line')
  render(<I18nProvider><CafeCountCorrectionAction lineId="original" itemName="Flour" unitName="kg" disabled={false} onSaved={vi.fn()} /></I18nProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'Start correction' }))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '0' } })
  fireEvent.click(screen.getByRole('button', { name: 'Submit correction' }))
  expect(await screen.findByText('The correction could not be started. Refresh the count status and try again.')).toBeInTheDocument()
  expect(screen.getByRole('textbox')).toHaveValue('0')
  fireEvent.click(screen.getByRole('button', { name: 'Submit correction' }))
  await waitFor(() => expect(startCafeCountCorrection).toHaveBeenCalledTimes(2))
  expect(vi.mocked(startCafeCountCorrection).mock.calls[0]).toEqual(vi.mocked(startCafeCountCorrection).mock.calls[1])
})

it('Indonesian reviewers can cancel and offline disables starting a correction', () => {
  const view = render(<I18nProvider initialLocale="id"><CafeCountCorrectionAction lineId="original" itemName="Flour" unitName="kg" disabled={false} onSaved={vi.fn()} /></I18nProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'Mulai koreksi' }))
  expect(screen.getByRole('textbox', { name: 'Jumlah hitungan baru' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Batal' }))
  expect(startCafeCountCorrection).not.toHaveBeenCalled()
  view.rerender(<I18nProvider initialLocale="id"><CafeCountCorrectionAction lineId="original" itemName="Flour" unitName="kg" disabled onSaved={vi.fn()} /></I18nProvider>)
  expect(screen.getByRole('button', { name: 'Mulai koreksi' })).toBeDisabled()
})
