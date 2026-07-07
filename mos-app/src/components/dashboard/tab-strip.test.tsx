// TabStrip tests — the Summary/Detail view-tab strip (design-plan §2.7, FR-015/AC-015).
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TabStrip } from './tab-strip'

const TABS = [
  { id: 'summary', label: 'Summary' },
  { id: 'detail', label: 'Detail', count: 86 },
]

describe('TabStrip', () => {
  it('renders a tablist with a tab per entry', () => {
    render(<TabStrip tabs={TABS} active="summary" onChange={vi.fn()} />)
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /summary/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /detail/i })).toBeInTheDocument()
  })

  it('marks the active tab aria-selected=true, others false', () => {
    render(<TabStrip tabs={TABS} active="detail" onChange={vi.fn()} />)
    expect(screen.getByRole('tab', { name: /detail/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /summary/i })).toHaveAttribute('aria-selected', 'false')
  })

  it('click switches the active tab via onChange', () => {
    const onChange = vi.fn()
    render(<TabStrip tabs={TABS} active="summary" onChange={onChange} />)
    fireEvent.click(screen.getByRole('tab', { name: /detail/i }))
    expect(onChange).toHaveBeenCalledWith('detail')
  })

  it('renders the optional count on a tab', () => {
    render(<TabStrip tabs={TABS} active="summary" onChange={vi.fn()} />)
    expect(screen.getByText('86')).toBeInTheDocument()
  })

  it('does not call onChange when the active tab is clicked again', () => {
    const onChange = vi.fn()
    render(<TabStrip tabs={TABS} active="summary" onChange={onChange} />)
    fireEvent.click(screen.getByRole('tab', { name: /summary/i }))
    expect(onChange).not.toHaveBeenCalled()
  })

  describe('roving tabindex + arrow-key navigation', () => {
    it('only the active tab is tabindex=0; others are -1', () => {
      render(<TabStrip tabs={TABS} active="summary" onChange={vi.fn()} />)
      expect(screen.getByRole('tab', { name: /summary/i })).toHaveAttribute('tabindex', '0')
      expect(screen.getByRole('tab', { name: /detail/i })).toHaveAttribute('tabindex', '-1')
    })

    it('ArrowRight moves selection to the next tab', () => {
      const onChange = vi.fn()
      render(<TabStrip tabs={TABS} active="summary" onChange={onChange} />)
      const summaryTab = screen.getByRole('tab', { name: /summary/i })
      summaryTab.focus()
      fireEvent.keyDown(summaryTab, { key: 'ArrowRight' })
      expect(onChange).toHaveBeenCalledWith('detail')
    })

    it('ArrowLeft wraps from the first tab to the last', () => {
      const onChange = vi.fn()
      render(<TabStrip tabs={TABS} active="summary" onChange={onChange} />)
      const summaryTab = screen.getByRole('tab', { name: /summary/i })
      summaryTab.focus()
      fireEvent.keyDown(summaryTab, { key: 'ArrowLeft' })
      expect(onChange).toHaveBeenCalledWith('detail')
    })

    it('Home moves selection to the first tab', () => {
      const onChange = vi.fn()
      render(<TabStrip tabs={TABS} active="detail" onChange={onChange} />)
      const detailTab = screen.getByRole('tab', { name: /detail/i })
      detailTab.focus()
      fireEvent.keyDown(detailTab, { key: 'Home' })
      expect(onChange).toHaveBeenCalledWith('summary')
    })

    it('End moves selection to the last tab', () => {
      const onChange = vi.fn()
      render(<TabStrip tabs={TABS} active="summary" onChange={onChange} />)
      const summaryTab = screen.getByRole('tab', { name: /summary/i })
      summaryTab.focus()
      fireEvent.keyDown(summaryTab, { key: 'End' })
      expect(onChange).toHaveBeenCalledWith('detail')
    })
  })

  it('renders the trailing hint node when provided', () => {
    render(
      <TabStrip
        tabs={TABS}
        active="summary"
        onChange={vi.fn()}
        trailing={<span>Applies to both tabs</span>}
      />,
    )
    expect(screen.getByText('Applies to both tabs')).toBeInTheDocument()
  })
})
