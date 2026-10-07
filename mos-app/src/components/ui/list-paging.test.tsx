import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { I18nProvider } from '@/i18n/I18nProvider'
import { ListPaging } from './list-paging'

describe('ListPaging', () => {
  it('keeps the load-more button focused and ignores repeat activation while loading', () => {
    const onLoadMore = vi.fn()
    function Harness() {
      const [loading, setLoading] = useState(false)
      return (
        <ListPaging
          count={50}
          hasMore
          loading={loading}
          onLoadMore={() => { onLoadMore(); setLoading(true) }}
        />
      )
    }

    render(<I18nProvider><Harness /></I18nProvider>)
    const button = screen.getByRole('button', { name: 'Load more' })
    button.focus()
    fireEvent.click(button)

    const loadingButton = screen.getByRole('button', { name: 'Loading…' })
    expect(loadingButton).toBe(button)
    expect(loadingButton).toHaveFocus()
    expect(loadingButton).toHaveAttribute('aria-disabled', 'true')
    expect(loadingButton).toHaveAttribute('aria-busy', 'true')
    expect(loadingButton).not.toBeDisabled()
    expect(button.closest('.list-paging')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText('50 items loaded')).toHaveAttribute('aria-live', 'polite')

    fireEvent.click(loadingButton)
    expect(onLoadMore).toHaveBeenCalledOnce()
    expect(loadingButton).toHaveFocus()
  })

  it('moves focus to the count line when the last page removes the button, and never steals focus on first render', () => {
    function Harness() {
      const [more, setMore] = useState(true)
      return <ListPaging count={more ? 50 : 60} hasMore={more} onLoadMore={() => setMore(false)} />
    }
    render(<I18nProvider><Harness /></I18nProvider>)
    const button = screen.getByRole('button', { name: 'Load more' })
    button.focus()
    fireEvent.click(button)
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
    expect(screen.getByText('60 items loaded · end of list')).toHaveFocus()
  })

  it('does not take focus when the list is complete on first render', () => {
    render(<I18nProvider><ListPaging count={12} hasMore={false} onLoadMore={() => {}} /></I18nProvider>)
    expect(document.body).toHaveFocus()
  })

  it('uses generic empty-page wording when the empty list is not filter-specific', () => {
    render(
      <I18nProvider>
        <ListPaging count={0} hasMore onLoadMore={vi.fn()} />
      </I18nProvider>,
    )

    expect(screen.getByText('No rows in the loaded page')).toHaveAttribute('aria-live', 'polite')
    expect(screen.queryByText(/No match in the loaded/)).toBeNull()
  })

  it('qualifies an empty filtered page and keeps the continuation action', () => {
    render(
      <I18nProvider>
        <ListPaging count={0} hasMore emptyItems="tasks" onLoadMore={vi.fn()} />
      </I18nProvider>,
    )

    expect(screen.getByText('No match in the loaded tasks')).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByText('Load more to continue through the list.')).toBeInTheDocument()
    expect(screen.queryByText('0 items loaded')).toBeNull()
    expect(screen.getByRole('button', { name: 'Load more' })).toBeInTheDocument()
  })

  it('keeps the error alert slot in place and uses it for retry feedback', () => {
    const { container, rerender } = render(
      <I18nProvider><ListPaging count={50} hasMore onLoadMore={vi.fn()} /></I18nProvider>,
    )
    const slot = container.querySelector('.list-paging__error')
    expect(slot).toBeInTheDocument()
    expect(slot).toHaveClass('list-paging__error--hidden')

    rerender(
      <I18nProvider><ListPaging count={50} hasMore error onLoadMore={vi.fn()} /></I18nProvider>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t load more')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(container.querySelector('.list-paging__error')).toBe(slot)
  })

  it.each([
    { locale: 'en' as const, one: '1 item loaded', many: '2 items loaded · end of list' },
    { locale: 'id' as const, one: '1 item dimuat', many: '2 item dimuat · akhir daftar' },
  ])('names loaded items and preserves the end-of-list message ($locale)', ({ locale, one, many }) => {
    const { rerender } = render(
      <I18nProvider initialLocale={locale}>
        <ListPaging count={1} hasMore onLoadMore={vi.fn()} />
      </I18nProvider>,
    )
    expect(screen.getByText(one)).toBeInTheDocument()

    rerender(
      <I18nProvider initialLocale={locale}>
        <ListPaging count={2} hasMore={false} onLoadMore={vi.fn()} />
      </I18nProvider>,
    )
    expect(screen.getByText(many)).toBeInTheDocument()
  })
})
