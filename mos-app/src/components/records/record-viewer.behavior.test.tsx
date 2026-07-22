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

// Force the ≥1100px SPLIT regime so RecordPanelHost attaches its native Escape listener to
// the panel <aside> — the exact path the live host uses at desktop and the regime where the
// native-listener race lived (the host's bubble listener on the panel fires BEFORE React's
// synthetic delegate reaches the field). A host-mounted proof here exercises the real
// listener ordering a synthetic React wrapper cannot reproduce.
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
  onClose?: (via: 'explicit-close' | 'escape') => void
  onDirtyChange?: (dirty: boolean) => void
  onCommitField?: (key: string, value: RecordValue) => Promise<void>
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
        />
      </RecordPanelHost>
    </I18nProvider>,
  )
  return { onClose, onDirtyChange, onCommitField }
}

describe('RecordViewer interaction boundary', () => {
  // FieldEscapeContract — the owning proof that field-Escape isolation holds through the
  // LIVE RecordPanelHost native listener (OD-REDESIGN-83.1 / NFR-V3-001). The host attaches
  // its Escape listener via native addEventListener on the panel, which fires in the bubble
  // phase before React's synthetic delegate; a synthetic React wrapper (the old shape of this
  // test) cannot reproduce that ordering. Mounting inside the host exercises the real path:
  // the FIRST Escape on a focused dirty field cancels only that draft and is shielded from
  // the host's close listener; a SECOND Escape on the now-clean field reaches the host close
  // path. (The dirty-record × leave-guard half of this contract is owned end-to-end by
  // AC-V3-008c in tasks-workspace.test.tsx, which wires the real tenant guard.)
  it('FieldEscapeContract: through the live host, the first Escape on a focused dirty field cancels only the draft (host does not close); a second Escape on the now-clean field reaches the host close path', () => {
    const onClose = vi.fn()
    const onDirtyChange = vi.fn()
    renderInHost({ onClose, onDirtyChange })

    const input = screen.getByLabelText(/Title/) as HTMLInputElement
    input.focus()
    fireEvent.change(input, { target: { value: 'Restock oat milk cartons' } })
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)

    // FIRST Escape — focused + dirty: the field's native CAPTURE listener cancels only the
    // draft and stopImmediatePropagation shields the host's native panel listener, so the
    // host's close path is NOT invoked (the field draft is cancelled first, in isolation,
    // through the real listener ordering).
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input.value).toBe('Restock oat milk')
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
    expect(onClose).not.toHaveBeenCalled()

    // SECOND Escape — field now clean: the capture listener yields, the Escape propagates
    // to the host's native panel listener → onClose('escape') (the panel-close intent).
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenLastCalledWith('escape')
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
