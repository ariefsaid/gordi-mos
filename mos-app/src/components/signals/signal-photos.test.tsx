import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('@/lib/db/signal-photos', () => ({ listSignalPhotos: vi.fn() }))
import { listSignalPhotos } from '@/lib/db/signal-photos'
import { SignalPhotoStrip, SignalRecordPhotos } from './signal-photos'

const PHOTOS = [
  { signalId: 'sig-1', path: 'o/sig-1/a.jpg', url: 'https://signed/a' },
  { signalId: 'sig-1', path: 'o/sig-1/b.jpg', url: 'https://signed/b' },
]

describe('Signal photos', () => {
  it('the record loads its photos and each opens full size in a new tab', async () => {
    vi.mocked(listSignalPhotos).mockResolvedValue(PHOTOS)
    render(<I18nProvider><SignalRecordPhotos signalId="sig-1" /></I18nProvider>)

    const first = await screen.findByRole('link', { name: /photo 1 of 2/i })
    expect(first).toHaveAttribute('href', 'https://signed/a')
    expect(first).toHaveAttribute('target', '_blank')
    expect(listSignalPhotos).toHaveBeenCalledWith(['sig-1'])
  })

  it('a feed row shows plain images — the row itself is the one press target', () => {
    render(<I18nProvider><SignalPhotoStrip photos={PHOTOS} /></I18nProvider>)
    expect(screen.getAllByRole('img')).toHaveLength(2)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('renders nothing for a Signal without photos, or when the read fails', async () => {
    vi.mocked(listSignalPhotos).mockRejectedValue(new Error('offline'))
    const { container } = render(<I18nProvider><SignalRecordPhotos signalId="sig-1" /></I18nProvider>)
    await Promise.resolve()
    expect(container).toBeEmptyDOMElement()
  })
})
