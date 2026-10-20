import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/i18n/I18nProvider'
import { MemoryRouter } from 'react-router-dom'
import { CafeReceiptReviewPage } from './cafe-receipt-review-page'

const streamCatalog = vi.hoisted(() => ({
  options: [] as never[],
  resolve: vi.fn(),
  adopt: vi.fn(),
}))

vi.mock('@/auth/use-auth', () => ({
  useAuth: () => ({ status: 'authenticated', viewer: { person: { id: 'person-1' } } }),
}))
vi.mock('@/lib/use-cafe-stream', () => ({ useCafeStream: () => streamCatalog }))
vi.mock('@/components/kitchen/cafe-receipt-review-queue', () => ({
  CafeReceiptReviewQueue: () => <div>Receipt review queue</div>,
}))

const resolvedCatalog = {
  branches: [], options: [], destinations: [], locationOptions: [], stream: null,
  homeStream: null, myStreamKeys: new Set<string>(), branchId: null,
}

function renderPage(locale: 'en' | 'id') {
  return render(
    <I18nProvider initialLocale={locale}>
      <MemoryRouter>
        <CafeReceiptReviewPage />
      </MemoryRouter>
    </I18nProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  streamCatalog.options = []
})
afterEach(cleanup)

describe('CafeReceiptReviewPage stream catalog recovery', () => {
  it.each([
    { locale: 'en' as const, error: 'Could not load the production streams.', retry: 'Try again' },
    { locale: 'id' as const, error: 'Alur produksi tidak dapat dimuat.', retry: 'Coba lagi' },
  ])('shows a localized retryable error after the stream catalog fails in $locale', async ({ locale, error, retry }) => {
    streamCatalog.resolve.mockRejectedValueOnce(new Error('catalog unavailable'))
      .mockResolvedValueOnce(resolvedCatalog)

    renderPage(locale)

    expect(await screen.findByRole('alert')).toHaveTextContent(error)
    expect(screen.queryByText('Receipt review queue')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: retry }))

    await waitFor(() => {
      expect(streamCatalog.resolve).toHaveBeenCalledTimes(2)
      expect(streamCatalog.adopt).toHaveBeenCalledWith(resolvedCatalog)
      expect(screen.getByText('Receipt review queue')).toBeInTheDocument()
    })
  })
})
