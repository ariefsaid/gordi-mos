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

    const input = screen.getByLabelText('Title') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Restock oat milk cartons' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onCommit).toHaveBeenCalledWith('Restock oat milk cartons')
    // Saving is announced while the promise is in flight.
    expect(await screen.findByText('Saving…')).toBeInTheDocument()

    await act(async () => { resolveCommit() })
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })

  it('AC-V3-008: Escape restores the saved value and does not call save', () => {
    const onCommit = vi.fn(async () => {})
    const onCancel = vi.fn()
    const onDirtyChange = vi.fn()
    renderField(textSpec, { onCommit, onCancel, onDirtyChange })

    const input = screen.getByLabelText('Title') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'a draft nobody keeps' } })
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)

    fireEvent.keyDown(input, { key: 'Escape' })

    expect(input.value).toBe('Restock oat milk')
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

    const select = screen.getByLabelText('Status') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'done' } })

    await waitFor(() => expect(onCommit).toHaveBeenCalledWith('done'))
  })
})

describe('NFR-V3-006: field controls meet the 44px keyboard target', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/components/records/record-viewer.css'), 'utf8')

  it('encodes a 44px minimum for the field control and its retry action', () => {
    expect(css).toMatch(/\.record-field__control[\s\S]*min-height:\s*44px/)
    expect(css).toMatch(/\.record-field__retry[\s\S]*min-height:\s*44px/)
  })
})
