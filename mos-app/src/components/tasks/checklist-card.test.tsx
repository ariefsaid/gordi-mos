import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { ChecklistCard } from './checklist-card'
import type { ChecklistItemRow } from '@/lib/db/tasks.types'

function items(labels: string[]): ChecklistItemRow[] {
  return labels.map((label, i) => ({
    id: `item-${i}`, org_id: 'org', task_id: 't', label, is_done: false, position: i,
    created_at: '2026-06-11T00:00:00Z', updated_at: '2026-06-11T00:00:00Z',
  }))
}

describe('ChecklistCard', () => {
  it('AC-074 (component): typing a label + Enter calls onAdd', async () => {
    const onAdd = vi.fn()
    render(
      <ChecklistCard items={[]} canEdit taskId="t" viewerId="v"
        onAdd={onAdd} onToggle={() => {}} onReorder={() => {}} onDelete={() => {}} />,
    )
    const input = screen.getByLabelText(/add checklist item/i)
    fireEvent.change(input, { target: { value: 'Buy beans' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('Buy beans'))
  })

  // OD-REDESIGN-22 (D-C1): a failed checklist write surfaces a VISIBLE error + Retry — not a
  // sr-only-only rollback. The retry button re-runs the failed operation.
  it('D-C1: renders a visible error + Retry when saveError is set, and Retry calls onRetry', () => {
    const onRetry = vi.fn()
    render(
      <ChecklistCard items={items(['Buy beans'])} canEdit taskId="t" viewerId="v"
        onAdd={() => {}} onToggle={() => {}} onReorder={() => {}} onDelete={() => {}}
        saveError={{ message: "Couldn't save — try again.", onRetry }} />,
    )
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(/couldn.t save/i)
    fireEvent.click(within(alert).getByRole('button', { name: /retry/i }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('D-C1: renders NO error banner when saveError is null', () => {
    render(
      <ChecklistCard items={items(['Buy beans'])} canEdit taskId="t" viewerId="v"
        onAdd={() => {}} onToggle={() => {}} onReorder={() => {}} onDelete={() => {}}
        saveError={null} />,
    )
    expect(screen.queryByRole('alert')).toBeNull()
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

  // #965: a rejected save must never wipe what the person typed — the field keeps the text and
  // focus so they can hit Retry rather than retype the whole step from memory.
  it('Ticket #965: a REJECTED add keeps the typed text and focus in the input (red-first)', async () => {
    const onAdd = vi.fn().mockRejectedValue(new Error('save failed'))
    render(
      <ChecklistCard items={[]} canEdit taskId="t" viewerId="v"
        onAdd={onAdd} onToggle={() => {}} onReorder={() => {}} onDelete={() => {}} />,
    )
    const input = screen.getByLabelText(/add checklist item/i)
    input.focus()
    fireEvent.change(input, { target: { value: 'Buy beans' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('Buy beans'))
    // The rejection resolves asynchronously; assert the input is NOT cleared once it settles.
    await waitFor(() => expect(input).toHaveValue('Buy beans'))
    expect(input).toHaveFocus()
  })

  it('Ticket #965: a SUCCESSFUL add clears the typed text', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined)
    render(
      <ChecklistCard items={[]} canEdit taskId="t" viewerId="v"
        onAdd={onAdd} onToggle={() => {}} onReorder={() => {}} onDelete={() => {}} />,
    )
    const input = screen.getByLabelText(/add checklist item/i)
    fireEvent.change(input, { target: { value: 'Buy beans' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(input).toHaveValue(''))
  })

  // gpt-6-luna review (85c78fa6): a successful Retry cleared the draft unconditionally, so text
  // typed WHILE the retry was in flight got wiped along with the stale text that was actually
  // resent. Only clear when the field still holds exactly what was resent.
  it('Ticket #965: text typed during a pending Retry survives the retry\'s success', async () => {
    const onRetry = vi.fn().mockResolvedValue(undefined)
    render(
      <ChecklistCard items={[]} canEdit taskId="t" viewerId="v"
        onAdd={() => {}} onToggle={() => {}} onReorder={() => {}} onDelete={() => {}}
        saveError={{ message: "Couldn't save — try again.", onRetry }} />,
    )
    const input = screen.getByLabelText(/add checklist item/i)
    fireEvent.change(input, { target: { value: 'Buy beans' } })
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    // onRetry() is already resolved, but its continuation hasn't run yet — this still executes
    // in the same tick, before that continuation gets a turn on the microtask queue.
    fireEvent.change(input, { target: { value: 'Milk' } })
    await waitFor(() => expect(onRetry).toHaveBeenCalledTimes(1))
    // Flush every pending microtask (a macrotask boundary always runs after them) before asserting.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(input).toHaveValue('Milk')
  })

  // #969: Retry re-sends the FAILED label; editing the field before clicking it must not lose the edit.
  async function failAdd(label: string) {
    const onAdd = vi.fn().mockRejectedValue(new Error('save failed'))
    const props = { items: [], canEdit: true, taskId: 't', viewerId: 'v', onAdd, onToggle: () => {}, onReorder: () => {}, onDelete: () => {} }
    const view = render(<ChecklistCard {...props} />)
    const input = screen.getByLabelText(/add checklist item/i)
    fireEvent.change(input, { target: { value: label } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1))
    await new Promise((resolve) => setTimeout(resolve, 0))
    return { view, props, input }
  }

  it('Ticket #969: an edit made after the failure survives a successful Retry (red-first)', async () => {
    const { view, props, input } = await failAdd('Buy beans')
    const onRetry = vi.fn().mockResolvedValue(undefined)
    view.rerender(<ChecklistCard {...props} saveError={{ message: 'Could not save', onRetry }} />)
    fireEvent.change(input, { target: { value: 'Milk' } })
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    await waitFor(() => expect(onRetry).toHaveBeenCalledTimes(1))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(input).toHaveValue('Milk')
  })

  it('Ticket #969: an edit made while a deferred Retry is unresolved survives its resolution (red-first)', async () => {
    const { view, props, input } = await failAdd('Buy beans')
    let resolve!: () => void
    const onRetry = vi.fn(() => new Promise<void>((r) => { resolve = r }))
    view.rerender(<ChecklistCard {...props} saveError={{ message: 'Could not save', onRetry }} />)
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    fireEvent.change(input, { target: { value: 'Milk' } })
    resolve()
    await new Promise((r) => setTimeout(r, 0))
    expect(input).toHaveValue('Milk')
  })

  it('Ticket #969: a successful Retry still clears the field when it holds the failed label', async () => {
    const { view, props, input } = await failAdd('Buy beans')
    const onRetry = vi.fn().mockResolvedValue(undefined)
    view.rerender(<ChecklistCard {...props} saveError={{ message: 'Could not save', onRetry }} />)
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    await waitFor(() => expect(input).toHaveValue(''))
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
