import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChecklistCard } from './ChecklistCard'
import type { ChecklistItemRow } from '../../lib/db/tasks.types'

function items(labels: string[]): ChecklistItemRow[] {
  return labels.map((label, i) => ({
    id: `item-${i}`, org_id: 'org', task_id: 't', label, is_done: false, position: i,
    created_at: '2026-06-11T00:00:00Z', updated_at: '2026-06-11T00:00:00Z',
  }))
}

describe('ChecklistCard', () => {
  it('AC-074 (component): typing a label + Enter calls onAdd', () => {
    const onAdd = vi.fn()
    render(
      <ChecklistCard items={[]} canEdit taskId="t" viewerId="v"
        onAdd={onAdd} onToggle={() => {}} onReorder={() => {}} onDelete={() => {}} />,
    )
    const input = screen.getByLabelText(/add checklist item/i)
    fireEvent.change(input, { target: { value: 'Buy beans' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onAdd).toHaveBeenCalledWith('Buy beans')
  })

  // M7: the empty Checklist tab must show the "No steps yet." copy for EVERYONE
  // (plan §3.2 / design-plan §168) — previously it only rendered for non-editors,
  // so an editor with an empty checklist saw a bare add-field with no empty line.
  it('M7: shows "No steps yet." when empty, for an editor (with the add field too)', () => {
    render(
      <ChecklistCard items={[]} canEdit taskId="t" viewerId="v"
        onAdd={() => {}} onToggle={() => {}} onReorder={() => {}} onDelete={() => {}} />,
    )
    expect(screen.getByText(/no steps yet\./i)).toBeInTheDocument()
    expect(screen.getByLabelText(/add checklist item/i)).toBeInTheDocument()
  })

  it('M7: shows "No steps yet." when empty, for a non-editor', () => {
    render(
      <ChecklistCard items={[]} canEdit={false} taskId="t" viewerId="v"
        onAdd={() => {}} onToggle={() => {}} onReorder={() => {}} onDelete={() => {}} />,
    )
    expect(screen.getByText(/no steps yet\./i)).toBeInTheDocument()
  })

  it('disables the checkbox when canEdit=false', () => {
    render(
      <ChecklistCard items={items(['Step A'])} canEdit={false} taskId="t" viewerId="v"
        onAdd={() => {}} onToggle={() => {}} onReorder={() => {}} onDelete={() => {}} />,
    )
    expect(screen.getByRole('checkbox', { name: /step a/i })).toBeDisabled()
    expect(screen.queryByLabelText(/add checklist item/i)).toBeNull()
  })
})
