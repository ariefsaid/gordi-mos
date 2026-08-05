// CutToggle tests — design-plan §2.5 (Branch ↔ Activity segmented control, general).
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CutToggle } from './cut-toggle'

const OPTIONS = ['Branch', 'Activity']

describe('CutToggle', () => {
  it('renders a tablist with a tab per option', () => {
    render(<CutToggle options={OPTIONS} value="Branch" onChange={vi.fn()} />)
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Branch' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Activity' })).toBeInTheDocument()
  })

  it('marks the current value aria-selected=true, others false', () => {
    render(<CutToggle options={OPTIONS} value="Activity" onChange={vi.fn()} />)
    expect(screen.getByRole('tab', { name: 'Activity' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Branch' })).toHaveAttribute('aria-selected', 'false')
  })

  it('calls onChange with the clicked option', () => {
    const onChange = vi.fn()
    render(<CutToggle options={OPTIONS} value="Branch" onChange={onChange} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Activity' }))
    expect(onChange).toHaveBeenCalledWith('Activity')
  })

  it('does not call onChange when the selected tab is clicked again', () => {
    const onChange = vi.fn()
    render(<CutToggle options={OPTIONS} value="Branch" onChange={onChange} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Branch' }))
    expect(onChange).not.toHaveBeenCalled()
  })

  describe('roving tabindex + keyboard path', () => {
    it('only the selected tab is tabindex=0; others are -1', () => {
      render(<CutToggle options={OPTIONS} value="Branch" onChange={vi.fn()} />)
      expect(screen.getByRole('tab', { name: 'Branch' })).toHaveAttribute('tabindex', '0')
      expect(screen.getByRole('tab', { name: 'Activity' })).toHaveAttribute('tabindex', '-1')
    })

    it('ArrowRight moves selection to the next option and focuses it', () => {
      const onChange = vi.fn()
      render(<CutToggle options={OPTIONS} value="Branch" onChange={onChange} />)
      const branchTab = screen.getByRole('tab', { name: 'Branch' })
      branchTab.focus()
      fireEvent.keyDown(branchTab, { key: 'ArrowRight' })
      expect(onChange).toHaveBeenCalledWith('Activity')
    })

    it('ArrowLeft wraps from the first option to the last', () => {
      const onChange = vi.fn()
      render(<CutToggle options={OPTIONS} value="Branch" onChange={onChange} />)
      const branchTab = screen.getByRole('tab', { name: 'Branch' })
      branchTab.focus()
      fireEvent.keyDown(branchTab, { key: 'ArrowLeft' })
      expect(onChange).toHaveBeenCalledWith('Activity')
    })

    it('ArrowRight wraps from the last option to the first', () => {
      const onChange = vi.fn()
      render(<CutToggle options={OPTIONS} value="Activity" onChange={onChange} />)
      const activityTab = screen.getByRole('tab', { name: 'Activity' })
      activityTab.focus()
      fireEvent.keyDown(activityTab, { key: 'ArrowRight' })
      expect(onChange).toHaveBeenCalledWith('Branch')
    })

    it('Home moves selection to the first option', () => {
      const onChange = vi.fn()
      render(<CutToggle options={OPTIONS} value="Activity" onChange={onChange} />)
      const activityTab = screen.getByRole('tab', { name: 'Activity' })
      activityTab.focus()
      fireEvent.keyDown(activityTab, { key: 'Home' })
      expect(onChange).toHaveBeenCalledWith('Branch')
    })

    it('End moves selection to the last option', () => {
      const onChange = vi.fn()
      render(<CutToggle options={OPTIONS} value="Branch" onChange={onChange} />)
      const branchTab = screen.getByRole('tab', { name: 'Branch' })
      branchTab.focus()
      fireEvent.keyDown(branchTab, { key: 'End' })
      expect(onChange).toHaveBeenCalledWith('Activity')
    })
  })

  it('r5 F-4: focus FOLLOWS selection — ArrowRight lands focus on the newly-current tab, not a stranded tabIndex=-1 node', () => {
    const onChange = vi.fn()
    render(<CutToggle options={OPTIONS} value="Branch" onChange={onChange} />)
    const branchTab = screen.getByRole('tab', { name: 'Branch' })
    branchTab.focus()
    fireEvent.keyDown(branchTab, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenCalledWith('Activity')
    expect(screen.getByRole('tab', { name: 'Activity' })).toHaveFocus()
  })

  it('I18N-1: renderLabel localizes the LABEL while onChange still emits the untranslated enum VALUE', () => {
    const onChange = vi.fn()
    render(
      <CutToggle
        options={OPTIONS}
        value="Branch"
        onChange={onChange}
        renderLabel={(o) => ({ Branch: 'Cabang', Activity: 'Aktivitas' })[o] ?? o}
      />,
    )
    expect(screen.getByRole('tab', { name: 'Cabang' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Branch' })).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'Aktivitas' }))
    expect(onChange).toHaveBeenCalledWith('Activity')
  })

  it('renders a 44px touch target marker on each tab (phone tap target)', () => {
    render(<CutToggle options={OPTIONS} value="Branch" onChange={vi.fn()} />)
    screen.getAllByRole('tab').forEach(tab => {
      expect(tab).toHaveAttribute('data-touch-target', 'true')
    })
  })
})
