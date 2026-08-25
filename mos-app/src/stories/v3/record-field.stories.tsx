import { useRef, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { RecordField } from '@/components/records/record-field'
import { Button } from '@/components/ui/button'
import { formatDayMonthYear } from '@/lib/format/date'
import type { RecordFieldSpec, RecordValue } from '@/components/records/record-viewer.types'

export const v3Matrix = {
  jobs: [
    'record-field.document-view-matrix',
    'record-field.read-only-provenance',
    'record-field.edit-commit-journey',
    'record-field.escape-cancels-draft',
    'record-field.saving-in-flight',
    'record-field.error-retry-preserves-draft',
    'record-field.option-eager-commit',
    'record-field.option-error-reverts',
    'record-field.commits-frozen-blur-guard',
  ],
  states: [
    'record-field.view.prose',
    'record-field.view.status-pill',
    'record-field.view.entity-chip',
    'record-field.view.date',
    'record-field.view.empty-relation',
    'record-field.view.required',
    'record-field.readonly.with-reason',
    'record-field.readonly.provenance-no-reason',
    'record-field.edit.text',
    'record-field.edit.select',
    'record-field.saving',
    'record-field.saved',
    'record-field.error-retry',
    'record-field.commits-frozen',
  ],
  responsive: ['desktop1280', 'intermediate', 'phone390'],
  canonicalImports: [
    { symbol: 'RecordField', file: 'mos-app/src/components/records/record-field.tsx', importPath: '@/components/records/record-field' },
    { symbol: 'Button', file: 'mos-app/src/components/ui/button.tsx', importPath: '@/components/ui/button' },
  ],
  debt: [],
  scope: { applicationMigration: false, representativeAcceptance: false, futureIssue4Host: false },
} as const

/** Contrast debt PAID (record-viewer.css now uses --field-error-text, the AA-darkened red) —
 *  the error stories run the full unscoped axe gate. */
const errorContrastDebtA11y = {} as const

const meta = {
  title: 'Record field',
  excludeStories: /^v3Matrix$/,
  parameters: {
    docs: {
      description: {
        component:
          'The ONE value-first field primitive of the record-document grammar: value rendering first, the edit control swapped in on activation, field-local draft/commit/cancel lifecycle, and honest saving/saved/error feedback. Read-only fields show value + provenance with no affordance.',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function makeSpec(
  partial: Partial<RecordFieldSpec> & Pick<RecordFieldSpec, 'key' | 'label' | 'control'>,
): RecordFieldSpec {
  return { value: null, displayValue: '—', editable: true, ...partial }
}

const STATUS_OPTIONS = [
  { value: 'Open', label: 'Open' },
  { value: 'In Progress', label: 'In Progress' },
  { value: 'Blocked', label: 'Blocked' },
  { value: 'Done', label: 'Done' },
] as const

const PERSON_OPTIONS = [
  { value: 'p-aisyah', label: 'Aisyah Rahman' },
  { value: 'p-putri', label: 'Putri Lestari' },
  { value: 'p-budi', label: 'Budi Santoso' },
] as const

/** The adapter contract in miniature: the parent owns spec.value/displayValue and refreshes
 *  them after a successful commit, exactly as the live record adapters do. */
function displayFor(spec: RecordFieldSpec, value: RecordValue): string {
  if (value === null || value === undefined || value === '') return '—'
  if (spec.control === 'date') return formatDayMonthYear(String(value))
  const option = spec.options?.find((candidate) => candidate.value === value)
  return option ? option.label : String(value)
}

function CommittingField({
  base,
  latency = 350,
  failWith,
  commitsFrozen,
}: {
  base: RecordFieldSpec
  latency?: number
  /** When set, every commit rejects with this message (FieldErrorRetryContract). */
  failWith?: string
  commitsFrozen?: boolean
}) {
  const [spec, setSpec] = useState(base)
  const specRef = useRef(spec)
  specRef.current = spec
  return (
    <RecordField
      spec={spec}
      commitsFrozen={commitsFrozen}
      onCommit={async (value) => {
        // The live tenants churn spec.value optimistically on every write and roll it back on a
        // rejected one — the field's upstream-sync guard is designed against exactly this shape.
        const before = specRef.current
        setSpec((previous) => ({ ...previous, value, displayValue: displayFor(previous, value) }))
        await delay(latency)
        if (failWith) {
          setSpec(before)
          throw new Error(failWith)
        }
      }}
    />
  )
}

function NeverSettlingField({ base }: { base: RecordFieldSpec }) {
  return <RecordField spec={base} onCommit={() => new Promise<void>(() => undefined)} />
}

export const DocumentViewMatrix: Story = {
  render: () => (
    <div className="v3-story-frame">
      <section className="v3-story-section" aria-labelledby="record-field-view-title">
        <h1 id="record-field-view-title" className="v3-story-section__title">Document view matrix</h1>
        <p className="v3-story-section__copy">
          A record reads as a document: every editable field renders its value first — prose, a status
          pill, an entity chip, or a formatted date — with the pencil affordance revealed on hover and
          focus-visible. An unpopulated relation reads as quiet provenance (data-empty) without losing
          its edit affordance.
        </p>
        <div className="v3-story-stack">
          <CommittingField
            base={makeSpec({ key: 'title', label: 'Title', control: 'text', value: 'Confirm Roastery calibration notes', displayValue: 'Confirm Roastery calibration notes', required: true })}
          />
          <CommittingField
            base={makeSpec({ key: 'notes', label: 'Notes', control: 'textarea', value: 'Compare against the July batch log before sign-off.', displayValue: 'Compare against the July batch log before sign-off.' })}
          />
          <CommittingField
            base={makeSpec({ key: 'status', label: 'Status', control: 'status', value: 'In Progress', displayValue: 'In Progress', options: STATUS_OPTIONS })}
          />
          <CommittingField
            base={makeSpec({ key: 'pic', label: 'PIC', control: 'person', value: 'p-aisyah', displayValue: 'Aisyah Rahman', options: PERSON_OPTIONS })}
          />
          <CommittingField
            base={makeSpec({ key: 'due', label: 'Due date', control: 'date', value: '2026-07-28', displayValue: formatDayMonthYear('2026-07-28') })}
          />
          <CommittingField
            base={makeSpec({ key: 'objective', label: 'Objective', control: 'relation', options: [{ value: 'none', label: 'Not linked' }, { value: 'obj-1', label: 'Grow wholesale revenue' }] })}
          />
        </div>
      </section>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Status renders as a pill, person as a chip, and the unpopulated relation is marked empty.
    expect(canvasElement.querySelector('.record-field__pill')).not.toBeNull()
    expect(canvasElement.querySelector('.record-field__chip')).not.toBeNull()
    const relation = canvasElement.querySelector('[data-field-key="objective"]')
    expect(relation?.getAttribute('data-empty')).toBe('true')
    // Every editable value stays an activation target.
    await expect(canvas.getByRole('button', { name: 'Edit Status' })).toBeVisible()
  },
}

export const ReadOnlyProvenance: Story = {
  render: () => (
    <div className="v3-story-frame">
      <section className="v3-story-section" aria-labelledby="record-field-readonly-title">
        <h1 id="record-field-readonly-title" className="v3-story-section__title">Read-only and provenance</h1>
        <p className="v3-story-section__copy">
          A restricted field explains itself with a real reason; a derived/provenance field
          (read-only by design) shows no affordance and no noise reason line.
        </p>
        <div className="v3-story-stack">
          <RecordField
            spec={makeSpec({ key: 'supervisor', label: 'Supervisor', control: 'person', value: 'p-putri', displayValue: 'Putri Lestari', editable: false, readOnlyReason: 'This task is archived — reopen it to change ownership.' })}
            onCommit={async () => undefined}
          />
          <RecordField
            spec={makeSpec({ key: 'classification', label: 'Classification', control: 'text', value: 'Routine', displayValue: 'Routine', editable: false })}
            onCommit={async () => undefined}
          />
          <RecordField
            spec={makeSpec({ key: 'source', label: 'Source', control: 'relation', value: 'proc-7', displayValue: 'Weekly stock opname', editable: false })}
            onCommit={async () => undefined}
          />
        </div>
      </section>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByText('This task is archived — reopen it to change ownership.')).toBeVisible()
    // Read-only rows expose NO edit affordance at all.
    expect(canvas.queryByRole('button', { name: /Edit/ })).toBeNull()
    // The derived field renders no fallback reason noise.
    const classification = canvasElement.querySelector('[data-field-key="classification"]')
    expect(classification?.querySelector('.record-field__reason')).toBeNull()
  },
}

export const EditCommitJourney: Story = {
  render: () => (
    <div className="v3-story-frame">
      <section className="v3-story-section" aria-labelledby="record-field-commit-title">
        <h1 id="record-field-commit-title" className="v3-story-section__title">Activate, edit, commit</h1>
        <p className="v3-story-section__copy">
          Click (or Enter/Space) swaps in the text control; Enter commits, announces Saving… then
          Saved, and returns to the value rendering with the adapter-refreshed value.
        </p>
        <CommittingField
          base={makeSpec({ key: 'title', label: 'Title', control: 'text', value: 'Confirm Roastery calibration notes', displayValue: 'Confirm Roastery calibration notes' })}
          latency={120}
        />
      </section>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Edit Title' }))
    const input = canvas.getByLabelText('Title')
    await userEvent.clear(input)
    await userEvent.type(input, 'Recalibrate the Roastery grinder')
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(canvas.getByText('Saved')).toBeVisible())
    // Back to the document view, showing the committed value.
    const field = canvasElement.querySelector('[data-field-key="title"]')
    expect(field?.getAttribute('data-mode')).toBe('view')
    await expect(canvas.getByRole('button', { name: 'Edit Title' })).toHaveTextContent('Recalibrate the Roastery grinder')
  },
}

export const EscapeCancelsDraft: Story = {
  render: () => (
    <div className="v3-story-frame">
      <section className="v3-story-section" aria-labelledby="record-field-escape-title">
        <h1 id="record-field-escape-title" className="v3-story-section__title">Escape cancels the draft</h1>
        <p className="v3-story-section__copy">
          The first Escape is consumed by the field (native capture isolation): the draft is
          discarded, the value rendering returns, and focus goes back to the activation control —
          the host panel never sees the keystroke.
        </p>
        <CommittingField
          base={makeSpec({ key: 'notes', label: 'Notes', control: 'textarea', value: 'Compare against the July batch log.', displayValue: 'Compare against the July batch log.' })}
        />
      </section>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Edit Notes' }))
    const textarea = canvas.getByLabelText('Notes')
    await userEvent.type(textarea, ' A throwaway draft.')
    await userEvent.keyboard('{Escape}')
    const field = canvasElement.querySelector('[data-field-key="notes"]')
    await waitFor(() => expect(field?.getAttribute('data-mode')).toBe('view'))
    // The saved baseline is restored and keyboard users keep their place.
    const editButton = canvas.getByRole('button', { name: 'Edit Notes' })
    expect(editButton).toHaveTextContent('Compare against the July batch log.')
    expect(editButton).toHaveFocus()
  },
}

export const SavingInFlight: Story = {
  render: () => (
    <div className="v3-story-frame">
      <section className="v3-story-section" aria-labelledby="record-field-saving-title">
        <h1 id="record-field-saving-title" className="v3-story-section__title">Saving in flight</h1>
        <p className="v3-story-section__copy">
          While a commit is pending the control is disabled and aria-busy, and the field announces
          Saving… via a status region. (This specimen's commit never settles, freezing the state.)
        </p>
        <NeverSettlingField
          base={makeSpec({ key: 'title', label: 'Title', control: 'text', value: 'Confirm Roastery calibration notes', displayValue: 'Confirm Roastery calibration notes' })}
        />
      </section>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Edit Title' }))
    const input = canvas.getByLabelText('Title')
    await userEvent.type(input, ' — updated')
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(canvas.getByRole('status')).toHaveTextContent('Saving…'))
    expect(input).toBeDisabled()
    expect(input).toHaveAttribute('aria-busy', 'true')
  },
}

export const ErrorRetryPreservesDraft: Story = {
  parameters: errorContrastDebtA11y,
  render: () => (
    <div className="v3-story-frame">
      <section className="v3-story-section" aria-labelledby="record-field-error-title">
        <h1 id="record-field-error-title" className="v3-story-section__title">Rejected commit keeps the draft</h1>
        <p className="v3-story-section__copy">
          A rejected commit STAYS in edit mode, preserves the typed draft, announces the error, and
          exposes Retry (FieldErrorRetryContract) — the edit is never silently lost.
        </p>
        <CommittingField
          base={makeSpec({ key: 'title', label: 'Title', control: 'text', value: 'Confirm Roastery calibration notes', displayValue: 'Confirm Roastery calibration notes' })}
          latency={80}
          failWith="offline"
        />
      </section>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Edit Title' }))
    const input = canvas.getByLabelText('Title')
    await userEvent.clear(input)
    await userEvent.type(input, 'Recalibrate the Roastery grinder')
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(canvas.getByRole('alert')).toHaveTextContent("Couldn't save — try again."))
    // Still editing, draft intact, retry reachable.
    const field = canvasElement.querySelector('[data-field-key="title"]')
    expect(field?.getAttribute('data-mode')).toBe('edit')
    expect(canvas.getByLabelText('Title')).toHaveValue('Recalibrate the Roastery grinder')
    await expect(canvas.getByRole('button', { name: 'Retry' })).toBeVisible()
  },
}

export const OptionEagerCommit: Story = {
  render: () => (
    <div className="v3-story-frame">
      <section className="v3-story-section" aria-labelledby="record-field-option-title">
        <h1 id="record-field-option-title" className="v3-story-section__title">Picking an option IS the commit</h1>
        <p className="v3-story-section__copy">
          Option controls (status, person, team, relation) commit eagerly on change — no separate
          save step — then return to the value rendering with the refreshed pill or chip.
        </p>
        <CommittingField
          base={makeSpec({ key: 'status', label: 'Status', control: 'status', value: 'Open', displayValue: 'Open', options: STATUS_OPTIONS })}
          latency={100}
        />
      </section>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Edit Status' }))
    await userEvent.selectOptions(canvas.getByLabelText('Status'), 'In Progress')
    const field = canvasElement.querySelector('[data-field-key="status"]')
    await waitFor(() => expect(field?.getAttribute('data-mode')).toBe('view'))
    expect(canvasElement.querySelector('.record-field__pill')).toHaveTextContent('In Progress')
  },
}

export const OptionErrorRevertsSelection: Story = {
  parameters: errorContrastDebtA11y,
  render: () => (
    <div className="v3-story-frame">
      <section className="v3-story-section" aria-labelledby="record-field-option-error-title">
        <h1 id="record-field-option-error-title" className="v3-story-section__title">Rejected pick reverts the selection</h1>
        <p className="v3-story-section__copy">
          For an option control re-picking IS the retry, so a rejected commit reverts the visible
          selection to the saved baseline (matching the tenant's optimistic rollback) and stays in
          edit mode with the error and Retry exposed.
        </p>
        <CommittingField
          base={makeSpec({ key: 'pic', label: 'PIC', control: 'person', value: 'p-aisyah', displayValue: 'Aisyah Rahman', options: PERSON_OPTIONS })}
          latency={80}
          failWith="offline"
        />
      </section>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Edit PIC' }))
    await userEvent.selectOptions(canvas.getByLabelText('PIC'), 'p-budi')
    await waitFor(() => expect(canvas.getByRole('alert')).toHaveTextContent("Couldn't save — try again."))
    // The failed choice is not left selected — the picker shows the saved baseline again.
    expect(canvas.getByLabelText('PIC')).toHaveValue('p-aisyah')
    await expect(canvas.getByRole('button', { name: 'Retry' })).toBeVisible()
  },
}

function FrozenSpecimen() {
  return (
    <div className="v3-story-stack">
      <CommittingField
        base={makeSpec({ key: 'title', label: 'Title', control: 'text', value: 'Confirm Roastery calibration notes', displayValue: 'Confirm Roastery calibration notes' })}
        commitsFrozen
      />
      <Button variant="outline">A leave-guard dialog control stealing focus</Button>
    </div>
  )
}

export const CommitsFrozenBlurGuard: Story = {
  render: () => (
    <div className="v3-story-frame">
      <section className="v3-story-section" aria-labelledby="record-field-frozen-title">
        <h1 id="record-field-frozen-title" className="v3-story-section__title">commitsFrozen: the D1 blur guard</h1>
        <p className="v3-story-section__copy">
          While a host leave-guard dialog is open, its auto-focus fires a stray blur on the still
          editing field. With commitsFrozen the blur is a no-op: no commit runs and the draft stays
          exactly as typed until the dialog resolves Retain or Discard.
        </p>
        <FrozenSpecimen />
      </section>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Edit Title' }))
    const input = canvas.getByLabelText('Title')
    await userEvent.type(input, ' — unsaved edit')
    // The dialog's auto-focus steals focus: a plain blur, NOT a commit intent.
    await userEvent.click(canvas.getByRole('button', { name: 'A leave-guard dialog control stealing focus' }))
    const field = canvasElement.querySelector('[data-field-key="title"]')
    expect(field?.getAttribute('data-mode')).toBe('edit')
    expect(canvas.getByLabelText('Title')).toHaveValue('Confirm Roastery calibration notes — unsaved edit')
    // No Saving…/Saved feedback ever appeared — the commit path was frozen.
    expect(canvas.queryByRole('status')).toBeNull()
  },
}
