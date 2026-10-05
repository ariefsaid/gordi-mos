import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { KitchenWastePhoto } from '@/lib/db/kitchen-waste-photos'
import { WastePhotoCapture } from './waste-photo-capture'

const NativeURL = globalThis.URL
const onUpload = vi.fn<(logId: string, file: File) => Promise<KitchenWastePhoto | void>>()
const onPhotoUploaded = vi.fn<(photo: KitchenWastePhoto) => void>()
const onCanSubmitChange = vi.fn<(ready: boolean) => void>()
const onPhotoWindowExpired = vi.fn<() => void>()

function renderCapture(initialPhotos: readonly KitchenWastePhoto[] = []) {
  return render(
    <I18nProvider>
      <WastePhotoCapture
        wasteLogId="waste-1"
        initialPhotos={initialPhotos}
        onUpload={onUpload}
        onPhotoUploaded={onPhotoUploaded}
        onCanSubmitChange={onCanSubmitChange}
        onPhotoWindowExpired={onPhotoWindowExpired}
      />
    </I18nProvider>,
  )
}

function photo(name = 'waste.jpg', type = 'image/jpeg') {
  return new File(['image-bytes'], name, { type })
}

beforeEach(() => {
  vi.clearAllMocks()
  onUpload.mockResolvedValue()
  class TestURL extends NativeURL {
    static createObjectURL = vi.fn(() => 'blob:waste-preview')
    static revokeObjectURL = vi.fn()
  }
  vi.stubGlobal('URL', TestURL)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('WastePhotoCapture', () => {
  it('offers camera/file input, previews selected evidence, and lets the operator remove it before upload', () => {
    renderCapture()

    const input = screen.getByLabelText(/take or choose photos/i) as HTMLInputElement
    expect(input).toHaveAttribute('type', 'file')
    expect(input).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp')
    expect(input).toHaveAttribute('capture', 'environment')
    expect(input).toHaveAttribute('multiple')

    fireEvent.change(input, { target: { files: [photo()] } })
    expect(screen.getByRole('img', { name: /photo 1 preview/i })).toHaveAttribute('src', 'blob:waste-preview')
    expect(screen.getByRole('button', { name: /remove photo 1/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /upload photos/i })).toBeInTheDocument()
    expect(onCanSubmitChange).toHaveBeenLastCalledWith(false)

    fireEvent.click(screen.getByRole('button', { name: /remove photo 1/i }))
    expect(screen.queryByRole('img', { name: /photo 1 preview/i })).not.toBeInTheDocument()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:waste-preview')
  })

  it('shows an indeterminate upload state and unlocks submission only after one upload succeeds', async () => {
    let finishUpload!: () => void
    onUpload.mockImplementation(() => new Promise<void>((resolve) => { finishUpload = resolve }))
    renderCapture()
    fireEvent.change(screen.getByLabelText(/take or choose photos/i), { target: { files: [photo()] } })
    fireEvent.click(screen.getByRole('button', { name: /upload photos/i }))

    expect(screen.getByRole('progressbar', { name: /uploading photo 1/i })).toBeInTheDocument()
    expect(onUpload).toHaveBeenCalledWith('waste-1', expect.any(File))
    expect(onCanSubmitChange).toHaveBeenLastCalledWith(false)

    finishUpload()
    await waitFor(() => expect(onCanSubmitChange).toHaveBeenLastCalledWith(true))
    expect(screen.getByText(/1 photo uploaded/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /remove photo 1/i })).not.toBeInTheDocument()
  })

  it('reports stored evidence to its owner so a remounted responsive surface keeps the photo and submit gate', async () => {
    const uploaded: KitchenWastePhoto = {
      logId: 'waste-1', path: 'org/waste-1/photo.jpg', url: 'https://storage.test/photo.jpg', name: 'waste.jpg',
    }
    onUpload.mockResolvedValue(uploaded)
    const first = renderCapture()
    fireEvent.change(screen.getByLabelText(/take or choose photos/i), { target: { files: [photo()] } })
    fireEvent.click(screen.getByRole('button', { name: /upload photos/i }))
    await waitFor(() => expect(onPhotoUploaded).toHaveBeenCalledWith(uploaded))
    first.unmount()

    renderCapture([uploaded])
    expect(screen.getByRole('img', { name: /photo 1 preview/i })).toHaveAttribute('src', uploaded.url)
    await waitFor(() => expect(onCanSubmitChange).toHaveBeenLastCalledWith(true))
    expect(screen.getByText(/1 photo uploaded/i)).toBeInTheDocument()
  })

  it('keeps a failed file retryable and allows removing it before a successful upload', async () => {
    onUpload.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce()
    renderCapture()
    fireEvent.change(screen.getByLabelText(/take or choose photos/i), { target: { files: [photo()] } })
    fireEvent.click(screen.getByRole('button', { name: /upload photos/i }))

    expect(await screen.findByText(/upload failed/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry photo 1/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /retry photo 1/i }))
    await waitFor(() => expect(onCanSubmitChange).toHaveBeenLastCalledWith(true))
    expect(onUpload).toHaveBeenCalledTimes(2)
  })

  it('does not offer retry after the database-enforced 15-minute upload window expires', async () => {
    onUpload.mockRejectedValueOnce(new Error('WASTE_PHOTO_WINDOW_EXPIRED'))
    renderCapture()
    fireEvent.change(screen.getByLabelText(/take or choose photos/i), { target: { files: [photo()] } })
    fireEvent.click(screen.getByRole('button', { name: /upload photos/i }))

    expect(await screen.findAllByText(/15-minute photo window has ended/i)).toHaveLength(2)
    expect(onPhotoWindowExpired).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: /retry photo 1/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /remove photo 1/i })).toBeInTheDocument()
  })

  it('marks an oversized compressed image as removable instead of retryable', async () => {
    onUpload.mockRejectedValueOnce(new Error('WASTE_PHOTO_TOO_LARGE'))
    renderCapture()
    fireEvent.change(screen.getByLabelText(/take or choose photos/i), { target: { files: [photo()] } })
    fireEvent.click(screen.getByRole('button', { name: /upload photos/i }))

    expect(await screen.findAllByText(/5 mb maximum/i)).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /retry photo 1/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /remove photo 1/i })).toBeInTheDocument()
  })

  it('rejects unsupported images and caps the collection at four photos', () => {
    renderCapture()
    const input = screen.getByLabelText(/take or choose photos/i)
    fireEvent.change(input, { target: { files: [photo('notes.pdf', 'application/pdf')] } })
    expect(screen.getByRole('alert')).toHaveTextContent(/jpeg, png, or webp/i)

    fireEvent.change(input, { target: { files: [
      photo('1.jpg'), photo('2.jpg'), photo('3.jpg'), photo('4.jpg'), photo('5.jpg'),
    ] } })
    expect(screen.getAllByRole('img', { name: /preview/i })).toHaveLength(4)
    expect(screen.getByRole('alert')).toHaveTextContent(/up to 4 photos/i)
  })
})
