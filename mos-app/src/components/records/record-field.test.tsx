import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ReactNode } from 'react'
import { I18nProvider } from '@/i18n/I18nProvider'
import { RecordField } from './record-field'
import type { RecordFieldSpec, RecordValue } from './record-viewer.types'

function renderField(spec: RecordFieldSpec, extra: {
  onCommit?: (v: RecordValue) => Promise<void>
  onCancel?: () => void
  onDirtyChange?: (dirty: boolean) => void
} = {}) {
  const onCommit = extra.onCommit ?? vi.fn(async () => {})
  const onCancel = extra.onCancel ?? vi.fn()
  const onDirtyChange = extra.onDirtyChange ?? vi.fn()
  const wrapper = ({ children }: { children: ReactNode }) => <I18nProvider>{children}</I18nProvider>
  const utils = render(
    <RecordField spec={spec} onCommit={onCommit} onCancel={onCancel} onDirtyChange={onDirtyChange} />,
    { wrapper },
  )
  return { ...utils, onCommit, onCancel, onDirtyChange }
}

// Value-first: an editable field renders its VALUE first; activating the row (click/Enter)
// swaps in the edit control. Every editing journey begins by activating the field.
function activate(label: string) {
  fireEvent.click(screen.getByRole('button', { name: `Edit ${label}` }))
}

const textSpec: RecordFieldSpec = {
  key: 'title',
  label: 'Title',
  control: 'text',
  value: 'Restock oat milk',
  displayValue: 'Restock oat milk',
  editable: true,
}

describe('RecordField', () => {
  it('AC-V3-008: pressing Enter commits a text field and reports Saving then Saved', async () => {
    let resolveCommit!: () => void
    const onCommit = vi.fn(
      () => new Promise<void>((r) => { resolveCommit = r }),
    )
    renderField(textSpec, { onCommit })

    activate('Title')
    const input = screen.getByLabelText('Title') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Restock oat milk cartons' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onCommit).toHaveBeenCalledWith('Restock oat milk cartons')
    // Saving is announced while the promise is in flight.
    expect(await screen.findByText('Saving…')).toBeInTheDocument()

    await act(async () => { resolveCommit() })
    // Commit returns to the value rendering; "Saved" is announced there.
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })

  it('AC-V3-008: Escape restores the saved value and does not call save', () => {
    const onCommit = vi.fn(async () => {})
    const onCancel = vi.fn()
    const onDirtyChange = vi.fn()
    renderField(textSpec, { onCommit, onCancel, onDirtyChange })

    activate('Title')
    const input = screen.getByLabelText('Title') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'a draft nobody keeps' } })
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)

    fireEvent.keyDown(input, { key: 'Escape' })

    // Escape returns to the value rendering showing the SAVED value (the draft is discarded).
    expect(screen.getByText('Restock oat milk')).toBeInTheDocument()
    expect(screen.queryByLabelText('Title')).toBeNull()
    expect(onCommit).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalled()
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
  })

  it('NFR-V3-001: Escape cancels only the field draft before any host leave transition is considered', () => {
    const hostLeave = vi.fn()
    const onCommit = vi.fn(async () => {})
    const wrapper = ({ children }: { children: ReactNode }) => <I18nProvider>{children}</I18nProvider>
    render(
      <div onKeyDown={hostLeave}>
        <RecordField spec={textSpec} onCommit={onCommit} />
      </div>,
      { wrapper },
    )

    activate('Title')
    const input = screen.getByLabelText('Title') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'mid-edit' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    // The field cancels its own draft and stops the Escape from bubbling to a host
    // leave-guard listener — the field draft is cancelled first, in isolation.
    expect(hostLeave).not.toHaveBeenCalled()
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('FieldErrorRetryContract: a rejected save preserves the draft and exposes retry plus an error message', async () => {
    const onCommit = vi
      .fn<(v: RecordValue) => Promise<void>>()
      .mockRejectedValueOnce(new Error('nope'))
      .mockResolvedValueOnce(undefined)
    renderField(textSpec, { onCommit })

    activate('Title')
    const input = screen.getByLabelText('Title') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'a resilient draft' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    // The error is surfaced and the draft is NOT rolled back.
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(input.value).toBe('a resilient draft')

    const retry = screen.getByRole('button', { name: 'Retry' })
    fireEvent.click(retry)

    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(2))
    expect(onCommit).toHaveBeenLastCalledWith('a resilient draft')
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })

  // D2 (dead-defect verification): the redesign's record-grammar merge hardened the
  // upstream-sync effect (`useEffect([spec.value])` above) to check `editingRef.current` in
  // ADDITION to save status — it now skips adopting a new spec.value whenever the field is
  // mid-edit, not just mid-save/mid-error. A real Task commit failure rolls the tenant's
  // optimistic write back (task-surface.tsx handleUpdateField's catch: `setLocalTask(prev)`,
  // then re-throws) BEFORE this field's own onCommit rejection is even observed here — so
  // spec.value churns TWICE around the failure (optimistic write, then rollback) while this
  // component is still "editing". Before the hardening, a rollback landing while status had
  // not yet flipped to 'error' would have re-adopted the reverted spec.value and wiped the
  // typed draft (defeating FieldErrorRetryContract). This proves that race is closed: neither
  // spec.value churn — landing mid-flight, and landing exactly with the rejection — ever
  // clobbers the draft.
  it('D2 (dead defect): a spec.value churn from the tenant\'s optimistic-write-then-rollback around a failed commit never clobbers the in-flight draft', async () => {
    let rejectCommit!: (err: Error) => void
    const onCommit = vi.fn(
      () => new Promise<void>((_resolve, reject) => { rejectCommit = reject }),
    )
    const { rerender } = renderField(textSpec, { onCommit })

    activate('Title')
    const input = screen.getByLabelText('Title') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'a resilient draft' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCommit).toHaveBeenCalledWith('a resilient draft')
    expect(await screen.findByText('Saving…')).toBeInTheDocument()

    // 1) The tenant's OPTIMISTIC write lands mid-flight: task-surface.tsx sets localTask (and
    // therefore spec.value) to the new value before the API call has settled.
    rerender(
      <RecordField
        spec={{ ...textSpec, value: 'a resilient draft', displayValue: 'a resilient draft' }}
        onCommit={onCommit}
      />,
    )
    expect(input.value).toBe('a resilient draft')

    // 2) The API call is about to fail; the tenant's catch block rolls localTask back to the
    // PRE-EDIT baseline SYNCHRONOUSLY, so spec.value reverts to the ORIGINAL value — and only
    // THEN does the rejection reach this component's own commit() catch.
    rerender(<RecordField spec={textSpec} onCommit={onCommit} />)
    await act(async () => { rejectCommit(new Error('offline')) })

    // The draft survived both churns intact — never reset to the rolled-back baseline, error
    // surfaced, retry available, exactly like a rejection with no tenant churn at all.
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(input.value).toBe('a resilient draft')

    const retry = screen.getByRole('button', { name: 'Retry' })
    fireEvent.click(retry)
    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(2))
    expect(onCommit).toHaveBeenLastCalledWith('a resilient draft')
  })

  it('AC-V3-009: a read-only field exposes its value and reason without an enabled control', () => {
    const spec: RecordFieldSpec = {
      key: 'team',
      label: 'Team',
      control: 'team',
      value: null,
      displayValue: 'Team not assigned yet (data migration)',
      editable: false,
      readOnlyReason: 'No team_id on this task yet',
    }
    renderField(spec)

    expect(screen.getByText('Team not assigned yet (data migration)')).toBeInTheDocument()
    expect(screen.getByText('No team_id on this task yet')).toBeInTheDocument()
    // No enabled editor is rendered for a read-only spec.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('commits a select control eagerly on change', async () => {
    const onCommit = vi.fn(async () => {})
    const spec: RecordFieldSpec = {
      key: 'status',
      label: 'Status',
      control: 'status',
      value: 'open',
      displayValue: 'Open',
      editable: true,
      options: [
        { value: 'open', label: 'Open' },
        { value: 'done', label: 'Done' },
      ],
    }
    renderField(spec, { onCommit })

    activate('Status')
    const select = screen.getByLabelText('Status') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'done' } })

    await waitFor(() => expect(onCommit).toHaveBeenCalledWith('done'))
  })

  // F4 fix: an unpopulated relation row (e.g. Task Project/Process or Objective) is exposed as
  // `data-empty` on the row so a scoped CSS rule can de-emphasize it (record-viewer.css) without
  // touching its edit affordance or its text content.
  it('F4: an editable field with no value carries data-empty="true"; a populated one carries "false"', () => {
    const emptyRelation: RecordFieldSpec = {
      key: 'objective', label: 'Objective', control: 'relation',
      value: null, displayValue: '—', editable: true,
      options: [{ value: '', label: '—' }, { value: 'obj-1', label: 'Grow direct orders' }],
    }
    renderField(emptyRelation)
    expect(document.querySelector('[data-field-key="objective"]')?.getAttribute('data-empty')).toBe('true')
  })

  it('F4: a read-only field with no value also carries data-empty="true"', () => {
    const spec: RecordFieldSpec = {
      key: 'team', label: 'Team', control: 'team',
      value: null, displayValue: 'Team not assigned yet (data migration)', editable: false,
    }
    renderField(spec)
    expect(document.querySelector('[data-field-key="team"]')?.getAttribute('data-empty')).toBe('true')
  })

  it('F4: a populated field carries data-empty="false"', () => {
    renderField(textSpec)
    expect(document.querySelector('[data-field-key="title"]')?.getAttribute('data-empty')).toBe('false')
  })
})

describe('NFR-V3-006: field controls meet the 44px keyboard target', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/components/records/record-viewer.css'), 'utf8')

  it('encodes a 44px minimum for the field control, the shared select, and its retry action', () => {
    expect(css).toMatch(/\.record-field__control[\s\S]*min-height:\s*44px/)
    expect(css).toMatch(/\.record-field__select \.mk-select__field[\s\S]*min-height:\s*44px/)
    expect(css).toMatch(/\.record-field__retry[\s\S]*min-height:\s*44px/)
  })

  // F5 density: the RESTING value activation target (.record-field__edit) is a touch floor, not an
  // NFR-guarded edit-mode control. On a fine pointer (desktop mouse) it tightens to E7's kv rhythm
  // so editable rows stop reading at 52px; the EDIT-mode controls above keep 44px unconditionally.
  it('tightens the resting value target to the E7 kv rhythm on a fine pointer (touch keeps 44px)', () => {
    // The default (touch) resting target stays at the 44px floor.
    expect(css).toMatch(/\.record-field__edit\s*\{[\s\S]*?min-height:\s*44px/)
    // A pointer:fine block tightens the resting target below 44px.
    expect(css).toMatch(/@media \(pointer: fine\)[\s\S]*\.record-field__edit[\s\S]*min-height:\s*32px/)
  })
})
