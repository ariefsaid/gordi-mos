import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TaskTabStrip } from './task-tab-strip'

describe('TaskTabStrip', () => {
  it('renders a tablist of 3 tabs with counts and the active selection', () => {
    render(
      <TaskTabStrip active="details" checklistCount={[1, 4]} activityCount={3} onSelect={() => {}} />,
    )
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(3)
    expect(screen.getByRole('tab', { name: /details/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /checklist/i })).toHaveTextContent('1/4')
    expect(screen.getByRole('tab', { name: /activity/i })).toHaveTextContent('3')
  })

  it('does not render a checklist count when total is 0', () => {
    render(
      <TaskTabStrip active="details" checklistCount={[0, 0]} activityCount={0} onSelect={() => {}} />,
    )
    expect(screen.getByRole('tab', { name: /checklist/i })).not.toHaveTextContent('0/0')
  })

  it('calls onSelect with the clicked tab key', () => {
    const onSelect = vi.fn()
    render(
      <TaskTabStrip active="details" checklistCount={[1, 4]} activityCount={3} onSelect={onSelect} />,
    )
    fireEvent.click(screen.getByRole('tab', { name: /checklist/i }))
    expect(onSelect).toHaveBeenCalledWith('checklist')
  })

  it('ArrowRight from the active tab moves selection to the next tab (roving)', () => {
    const onSelect = vi.fn()
    render(
      <TaskTabStrip active="details" checklistCount={[1, 4]} activityCount={3} onSelect={onSelect} />,
    )
    const details = screen.getByRole('tab', { name: /details/i })
    fireEvent.keyDown(details, { key: 'ArrowRight' })
    expect(onSelect).toHaveBeenCalledWith('checklist')
  })

  it('ArrowLeft wraps from the first tab to the last', () => {
    const onSelect = vi.fn()
    render(
      <TaskTabStrip active="details" checklistCount={[1, 4]} activityCount={3} onSelect={onSelect} />,
    )
    const details = screen.getByRole('tab', { name: /details/i })
    fireEvent.keyDown(details, { key: 'ArrowLeft' })
    expect(onSelect).toHaveBeenCalledWith('activity')
  })

  it('the active tab is the only one with tabindex 0 (roving)', () => {
    render(
      <TaskTabStrip active="checklist" checklistCount={[1, 4]} activityCount={3} onSelect={() => {}} />,
    )
    expect(screen.getByRole('tab', { name: /checklist/i })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('tab', { name: /details/i })).toHaveAttribute('tabindex', '-1')
  })
})
