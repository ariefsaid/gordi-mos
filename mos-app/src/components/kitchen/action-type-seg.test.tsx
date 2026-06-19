// ActionTypeSeg tests — AC-020 (action_type segmented control)
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ActionTypeSeg } from './action-type-seg'

describe('ActionTypeSeg — AC-020: action_type segmented control', () => {
  it('renders all three action types', () => {
    render(
      <ActionTypeSeg value="Production" onChange={vi.fn()} />,
    )
    expect(screen.getByRole('tab', { name: /production/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /radiant/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /bungur/i })).toBeInTheDocument()
  })

  it('marks the selected tab as aria-selected=true', () => {
    render(
      <ActionTypeSeg value="Transfer to Radiant" onChange={vi.fn()} />,
    )
    const radiantTab = screen.getByRole('tab', { name: /radiant/i })
    expect(radiantTab).toHaveAttribute('aria-selected', 'true')
    const prodTab = screen.getByRole('tab', { name: /production/i })
    expect(prodTab).toHaveAttribute('aria-selected', 'false')
  })

  it('calls onChange when a different tab is clicked', () => {
    const onChange = vi.fn()
    render(<ActionTypeSeg value="Production" onChange={onChange} />)
    fireEvent.click(screen.getByRole('tab', { name: /bungur/i }))
    expect(onChange).toHaveBeenCalledWith('Transfer to Bungur')
  })

  it('does not call onChange when the selected tab is clicked again', () => {
    const onChange = vi.fn()
    render(<ActionTypeSeg value="Production" onChange={onChange} />)
    fireEvent.click(screen.getByRole('tab', { name: /production/i }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('has role=tablist on container', () => {
    render(<ActionTypeSeg value="Production" onChange={vi.fn()} />)
    expect(screen.getByRole('tablist')).toBeInTheDocument()
  })

  it('is disabled when disabled prop is true', () => {
    render(<ActionTypeSeg value="Production" onChange={vi.fn()} disabled />)
    const tabs = screen.getAllByRole('tab')
    tabs.forEach(tab => expect(tab).toBeDisabled())
  })
})
