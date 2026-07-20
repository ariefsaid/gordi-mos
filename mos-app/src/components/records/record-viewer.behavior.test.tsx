import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { I18nProvider } from '@/i18n/I18nProvider'
import { RecordViewer } from './record-viewer'
import type { OverlayLeaveGuard } from '@/shell/overlay-navigation'
import type { RecordViewerAdapter } from './record-viewer.types'

// Real Task-shaped adapter fixture with one editable text field.
function taskAdapter(): RecordViewerAdapter {
  return {
    kind: 'task',
    id: 'task-1',
    title: 'Restock oat milk',
    typeLabel: 'Task',
    metadata: [
      {
        id: 'details',
        label: 'Details',
        fields: [
          { key: 'title', label: 'Title', control: 'text', value: 'Restock oat milk', displayValue: 'Restock oat milk', editable: true, required: true },
        ],
      },
    ],
    relations: [],
    contentSlots: [],
    activity: [],
    actions: [],
    permission: { readOnly: false, allowedActionIds: [] },
    state: 'ready',
  }
}

function renderViewer(guard: OverlayLeaveGuard, onDirtyChange = vi.fn(), onCommitField = vi.fn(async () => {})) {
  const wrapper = ({ children }: { children: ReactNode }) => <I18nProvider>{children}</I18nProvider>
  // Simulate the tenant: it only wires the async leave-guard while a draft is dirty.
  // A field-local Escape must resolve WITHOUT ever consulting that guard.
  render(
    <div
      data-testid="tenant"
      onKeyDown={(e) => {
        if (e.key === 'Escape') void guard({ kind: 'close', via: 'escape', from: { key: 'task-1', owner: 'tasks' } })
      }}
    >
      <RecordViewer adapter={taskAdapter()} mode="panel" onDirtyChange={onDirtyChange} onCommitField={onCommitField} />
    </div>,
    { wrapper },
  )
  return { onDirtyChange, onCommitField }
}

describe('RecordViewer interaction boundary (host-independent)', () => {
  it('FieldEscapeContract: RecordField Escape cancels only the field draft and does not invoke the leave guard', () => {
    const guard = vi.fn<OverlayLeaveGuard>(async () => ({ decision: 'allow' }))
    const { onDirtyChange } = renderViewer(guard)

    const input = screen.getByLabelText(/Title/) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Restock oat milk cartons' } })
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)

    fireEvent.keyDown(input, { key: 'Escape' })

    // The field restored its saved value, reported clean, and the Escape did NOT bubble
    // to the tenant's leave-guard listener (NFR-V3-001: the field cancels first).
    expect(input.value).toBe('Restock oat milk')
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
    expect(guard).not.toHaveBeenCalled()
  })

  it('DirtyBoundaryContract: a dirty field reports dirty so the tenant attaches the guard, and a committed save clears it', async () => {
    const guard = vi.fn<OverlayLeaveGuard>(async () => ({ decision: 'allow' }))
    const onCommitField = vi.fn(async () => {})
    const { onDirtyChange } = renderViewer(guard, vi.fn(), onCommitField)

    const input = screen.getByLabelText(/Title/) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Restock oat milk cartons' } })
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCommitField).toHaveBeenCalledWith('title', 'Restock oat milk cartons')

    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false))
    expect(guard).not.toHaveBeenCalled()
  })
})
