import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { KitchenWastePhoto } from '@/lib/db/kitchen-waste-photos'
import { loadOfflinePhotoDraft, saveOfflinePhotoDraft } from '@/lib/offline-photo-drafts'
import { WastePhotoCapture } from './waste-photo-capture'

const NativeURL = globalThis.URL
const photoWindow = vi.hoisted(() => ({ minutes: 15 }))
vi.mock('@/lib/offline-photo-drafts', () => ({
  loadOfflinePhotoDraft: vi.fn().mockResolvedValue([]),
  saveOfflinePhotoDraft: vi.fn().mockResolvedValue('saved'),
  clearOfflinePhotoDraft: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/db/kitchen-waste-photos', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/db/kitchen-waste-photos')>()
  return { ...actual, get WASTE_PHOTO_UPLOAD_WINDOW_MINUTES() { return photoWindow.minutes } }
})

const onUpload = vi.fn<(logId: string, file: File) => Promise<KitchenWastePhoto | void>>()
const onPhotoUploaded = vi.fn<(photo: KitchenWastePhoto) => void>()
const onCanSubmitChange = vi.fn<(ready: boolean) => void>()
const onPhotoWindowExpired = vi.fn<() => void>()

function renderCapture(initialPhotos: readonly KitchenWastePhoto[] = [], locale: 'en' | 'id' = 'en', draftKey?: string, uploadDisabled = false) {
  return render(
    <I18nProvider initialLocale={locale}>
      <WastePhotoCapture
        wasteLogId="waste-1"
        initialPhotos={initialPhotos}
        onUpload={onUpload}
        onPhotoUploaded={onPhotoUploaded}
        onCanSubmitChange={onCanSubmitChange}
        onPhotoWindowExpired={onPhotoWindowExpired}
        draftKey={draftKey}
        uploadDisabled={uploadDisabled}
      />
    </I18nProvider>,
  )
}

function photo(name = 'waste.jpg', type = 'image/jpeg') {
  return new File(['image-bytes'], name, { type })
}

beforeEach(() => {
  vi.clearAllMocks()
  photoWindow.minutes = 15
  vi.mocked(loadOfflinePhotoDraft).mockResolvedValue([])
  vi.mocked(saveOfflinePhotoDraft).mockResolvedValue('saved')
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

  it('AC-1006 saves selected images locally and restores them without uploading on remount', async () => {
    const selected = photo('delivery.jpg')
    const first = renderCapture([], 'en', 'person|stream|date|receipt|line')
    await waitFor(() => expect(loadOfflinePhotoDraft).toHaveBeenCalledWith('person|stream|date|receipt|line'))
    fireEvent.change(screen.getByLabelText(/take or choose photos/i), { target: { files: [selected] } })
    await waitFor(() => expect(saveOfflinePhotoDraft).toHaveBeenCalledWith(
      'person|stream|date|receipt|line', [expect.objectContaining({ name: 'delivery.jpg' })],
    ))
    first.unmount()

    vi.mocked(loadOfflinePhotoDraft).mockResolvedValue([selected])
    renderCapture([], 'en', 'person|stream|date|receipt|line')
    expect(await screen.findByText('delivery.jpg')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /photo 1 preview/i })).toHaveAttribute('src', 'blob:waste-preview')
    expect(await screen.findByText('Photo draft saved on this device.')).toBeInTheDocument()
    expect(onUpload).not.toHaveBeenCalled()
  })

  it('AC-1006 a photo saved on the device is still there after the capture unmounts and mounts again', async () => {
    const device = new Map<string, File[]>()
    // Like IndexedDB, the read lands after the database opens; a save in the meantime wins.
    vi.mocked(loadOfflinePhotoDraft).mockImplementation(async key => {
      await new Promise(resolve => setTimeout(resolve, 0))
      return device.get(key) ?? []
    })
    vi.mocked(saveOfflinePhotoDraft).mockImplementation(async (key, files) => {
      if (files.length === 0) device.delete(key)
      else device.set(key, [...files])
      return 'saved'
    })
    const first = renderCapture([], 'en', 'person|receipt|line')
    await waitFor(() => expect(loadOfflinePhotoDraft).toHaveBeenCalled())
    fireEvent.change(screen.getByLabelText(/take or choose photos/i), { target: { files: [photo('delivery.jpg')] } })
    await waitFor(() => expect(device.get('person|receipt|line')).toHaveLength(1))
    first.unmount()

    renderCapture([], 'en', 'person|receipt|line')

    expect(await screen.findByText('delivery.jpg')).toBeInTheDocument()
    expect(device.get('person|receipt|line')?.map(file => file.name)).toEqual(['delivery.jpg'])
  })

  it('NFR-1007 a photo too large to keep even after shrinking says so in size terms, not as a device failure', async () => {
    vi.mocked(saveOfflinePhotoDraft).mockResolvedValue('tooLarge')
    renderCapture([], 'en', 'person|receipt|line', true)
    fireEvent.change(screen.getByLabelText(/take or choose photos/i), { target: { files: [photo('camera-raw.jpg')] } })

    expect(await screen.findByText('This image is too large after compression (5 MB maximum).')).toBeInTheDocument()
    expect(screen.queryByText(/could not be saved/)).toBeNull()
  })

  it('AC-1006 allows offline photo selection and saves locally while Upload remains disabled', async () => {
    renderCapture([], 'en', 'offline-photo-scope', true)
    fireEvent.change(screen.getByLabelText(/take or choose photos/i), { target: { files: [photo('offline.jpg')] } })

    expect(await screen.findByText('offline.jpg')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /upload photos/i })).toBeDisabled()
    await waitFor(() => expect(saveOfflinePhotoDraft).toHaveBeenCalledWith(
      'offline-photo-scope', [expect.objectContaining({ name: 'offline.jpg' })],
    ))
    expect(onUpload).not.toHaveBeenCalled()
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

  it.each(['en', 'id'] as const)('uses the shared upload duration in %s expiry explanations', async locale => {
    photoWindow.minutes = 27
    onUpload.mockRejectedValue(new Error('WASTE_PHOTO_WINDOW_EXPIRED'))
    renderCapture([], locale)
    const input = document.querySelector('input[type="file"]')!
    fireEvent.change(input, { target: { files: [photo()] } })
    fireEvent.click(screen.getByRole('button', { name: /upload photos|unggah foto/i }))
    expect(await screen.findAllByText(locale === 'id' ? /27 menit.*berakhir/i : /27-minute photo window has ended/i)).toHaveLength(2)
    expect(onPhotoWindowExpired).toHaveBeenCalledOnce()
    expect(onCanSubmitChange).toHaveBeenLastCalledWith(false)
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
