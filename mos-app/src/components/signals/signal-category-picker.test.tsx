import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@/i18n/I18nProvider'
import { SignalCategoryPicker } from './signal-category-picker'

function renderPicker(props: Partial<React.ComponentProps<typeof SignalCategoryPicker>> = {}) {
  return render(
    <I18nProvider>
      <SignalCategoryPicker category={null} {...props} />
    </I18nProvider>,
  )
}

describe('SignalCategoryPicker', () => {
  it('renders "Add category" for an uncategorised Signal and opens the 8-family listbox', async () => {
    renderPicker()
    await userEvent.click(screen.getByRole('button', { name: /add category/i }))

    const listbox = screen.getByRole('listbox', { name: /categor/i })
    const options = within(listbox).getAllByRole('option')
    expect(options).toHaveLength(8)
    expect(within(listbox).getByRole('option', { name: 'Supply/vendor' })).toBeInTheDocument()
    expect(within(listbox).getByRole('option', { name: 'Other' })).toBeInTheDocument()
  })

  it('calls onCategorize with the chosen family and closes the listbox', async () => {
    const onCategorize = vi.fn()
    renderPicker({ onCategorize })
    await userEvent.click(screen.getByRole('button', { name: /add category/i }))
    await userEvent.click(screen.getByRole('option', { name: 'Quality' }))

    expect(onCategorize).toHaveBeenCalledWith('Quality')
    expect(screen.queryByRole('listbox', { name: /categor/i })).not.toBeInTheDocument()
  })

  it('renders the category pill (no "Add category") once a category is set', () => {
    renderPicker({ category: 'Equipment/facility' })
    expect(screen.getByText('Equipment/facility')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add category/i })).not.toBeInTheDocument()
  })
})
