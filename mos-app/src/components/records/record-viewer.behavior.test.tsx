import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { I18nProvider } from '@/i18n/I18nProvider'
import { RecordPanelHost } from '@/shell/record-panel-host'
import { RecordViewer } from './record-viewer'
import type { OverlayLeaveGuard } from '@/shell/overlay-navigation'
import type { RecordViewerAdapter, RecordValue } from './record-viewer.types'

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

// Force the ≥1100px SPLIT regime used by the live desktop host. Mounting the real host here
// proves its shared Escape layer defers to the field's native capture listener before closing.
function forceSplitWidth() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query.includes('1100'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

function renderInHost(opts: {
  onClose?: (via?: 'explicit-close' | 'escape') => void
  onDirtyChange?: (dirty: boolean) => void
  onCommitField?: (key: string, value: RecordValue) => Promise<void>
  onOpenPage?: () => void
} = {}) {
  forceSplitWidth()
  const onClose = opts.onClose ?? vi.fn()
  const onDirtyChange = opts.onDirtyChange ?? vi.fn()
  const onCommitField = opts.onCommitField ?? vi.fn(async () => {})
  render(
    <I18nProvider>
      <RecordPanelHost label="Task" focusKey="task-1" onClose={onClose}>
        <RecordViewer
          adapter={taskAdapter()}
          mode="panel"
          onDirtyChange={onDirtyChange}
          onCommitField={onCommitField}
          onOpenPage={opts.onOpenPage}
        />
      </RecordPanelHost>
    </I18nProvider>,
  )
  return { onClose, onDirtyChange, onCommitField }
}

describe('RecordViewer interaction boundary', () => {
  it('OverflowEscapeContract: Escape dismisses More actions before the record host', () => {
    const onClose = vi.fn()
    renderInHost({ onClose, onOpenPage: vi.fn() })

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    const menu = screen.getByRole('menu', { name: 'More actions' })
    expect(menu).toBeInTheDocument()

    fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Open full page' }), { key: 'Escape' })

    expect(screen.queryByRole('menu', { name: 'More actions' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More actions' })).toHaveFocus()
    expect(onClose).not.toHaveBeenCalled()
  })

  // FieldEscapeContract — the owning proof that field-Escape isolation holds through the live
  // RecordPanelHost layer (OD-REDESIGN-83.1 / NFR-V3-001). The FIRST Escape on a focused dirty
  // field cancels only that draft; a SECOND Escape on the now-clean field reaches the host
  // close path. (The dirty-record × leave-guard half is owned by AC-V3-008c in tasks-workspace.)
  it('FieldEscapeContract: through the live host, the first Escape on a focused dirty field cancels only the draft (host does not close); a second Escape on the now-clean field reaches the host close path', () => {
    const onClose = vi.fn()
    const onDirtyChange = vi.fn()
    renderInHost({ onClose, onDirtyChange })

    // Value-first: activate the field to swap in the edit control.
    fireEvent.click(screen.getByRole('button', { name: 'Edit Title' }))
    const input = screen.getByLabelText(/Title/) as HTMLInputElement
    input.focus()
    fireEvent.change(input, { target: { value: 'Restock oat milk cartons' } })
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)

    // FIRST Escape — focused editing field: the layer manager defers and the field's native
    // CAPTURE listener cancels the draft and stops propagation, so the host does not close.
    fireEvent.keyDown(input, { key: 'Escape' })
    // Back in value mode: the edit control (label exactly "Title") is gone and the discarded
    // draft is not shown. (The value activation button's accessible name is "Edit Title".)
    expect(screen.queryByLabelText('Title')).toBeNull()
    expect(screen.getByRole('button', { name: 'Edit Title' })).toBeInTheDocument()
    expect(screen.queryByText('Restock oat milk cartons')).toBeNull()
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
    expect(onClose).not.toHaveBeenCalled()

    // SECOND Escape — field back in value mode (no field listener): the Escape propagates from
    // the value activation control to the host's native panel listener → onClose('escape').
    fireEvent.keyDown(screen.getByRole('button', { name: 'Edit Title' }), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenLastCalledWith('escape')
  })

  it('DirtyBoundaryContract: a dirty field reports dirty so the tenant attaches the guard, and a committed save clears it', async () => {
    const guard = vi.fn<OverlayLeaveGuard>(async () => ({ decision: 'allow' }))
    const onCommitField = vi.fn(async () => {})
    const { onDirtyChange } = renderViewer(guard, vi.fn(), onCommitField)

    fireEvent.click(screen.getByRole('button', { name: 'Edit Title' }))
    const input = screen.getByLabelText(/Title/) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Restock oat milk cartons' } })
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCommitField).toHaveBeenCalledWith('title', 'Restock oat milk cartons')

    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false))
    expect(guard).not.toHaveBeenCalled()
  })
})
