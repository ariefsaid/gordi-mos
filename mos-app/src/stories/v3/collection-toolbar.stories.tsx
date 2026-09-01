import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { CollectionToolbar } from '@/components/record-collection/collection-toolbar'

export const v3Matrix = {
  jobs: [
    'collection-toolbar.view-axis',
    'collection-toolbar.desktop-inline',
    'collection-toolbar.desktop-active-filter',
    'collection-toolbar.save-view-flow',
    'collection-toolbar.phone-regime',
  ],
  states: [
    'toolbar.preset-chip-active',
    'toolbar.saved-view-chip-active',
    'toolbar.desktop-inline',
    'toolbar.desktop-active-filter',
    'toolbar.save-view-row',
    'toolbar.phone-expanded',
  ],
  responsive: ['desktop1280', 'intermediate', 'phone390'],
  canonicalImports: [
    { symbol: 'CollectionToolbar', file: 'mos-app/src/components/record-collection/collection-toolbar.tsx', importPath: '@/components/record-collection/collection-toolbar' },
  ],
  scope: { applicationMigration: false, representativeAcceptance: false, futureIssue4Host: false },
} as const

const meta = {
  title: 'Collection toolbar',
  excludeStories: /^v3Matrix$/,
  parameters: {
    docs: {
      description: {
        component:
          'The one visible RecordCollection control grammar: row 1 is the single view axis — the labelled saved-view chip strip first-left, the presentation switch right. Desktop keeps secondary controls visible in a compact inline row; phone hosts expose them through the single outer View & filters door.',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

type StoryPresentation = 'table' | 'card'
type StoryView = 'all' | 'my-work' | 'overdue'

const PRESET_VIEWS = [
  { value: 'all', label: 'All' },
  { value: 'my-work', label: 'My work' },
  { value: 'overdue', label: 'Overdue' },
] as const

const PIC_OPTIONS = [
  { value: 'all', label: 'All PICs' },
  { value: 'p-aisyah', label: 'Aisyah Rahman' },
  { value: 'p-putri', label: 'Putri Lestari' },
] as const

const STATUS_OPTIONS = [
  { value: 'any', label: 'Any status' },
  { value: 'open', label: 'Open' },
  { value: 'blocked', label: 'Blocked' },
] as const

function ToolbarHarness({
  activePicFilter = false,
  withSavedViews = true,
}: {
  /** Start with the PIC filter away from its rest state for the active desktop select specimen. */
  activePicFilter?: boolean
  withSavedViews?: boolean
}) {
  const [presentation, setPresentation] = useState<StoryPresentation>('table')
  const [view, setView] = useState<StoryView>('all')
  const [selectedSavedId, setSelectedSavedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [pic, setPic] = useState(activePicFilter ? 'p-aisyah' : 'all')
  const [status, setStatus] = useState('any')

  return (
    <CollectionToolbar<StoryPresentation, StoryView>
      presentation={{
        label: 'Presentation',
        value: presentation,
        options: [
          { value: 'table', label: 'Table' },
          { value: 'card', label: 'Card' },
        ],
        onChange: setPresentation,
      }}
      views={{
        label: 'Saved view',
        value: view,
        options: PRESET_VIEWS,
        onChange: (next) => {
          setView(next)
          setSelectedSavedId(null)
        },
      }}
      search={{ label: 'Search tasks', placeholder: 'Search tasks', value: search, onChange: setSearch }}
      filters={[
        { id: 'pic', label: 'PIC', value: pic, options: PIC_OPTIONS, onChange: setPic },
        { id: 'status', label: 'Status', value: status, options: STATUS_OPTIONS, onChange: setStatus },
      ]}
      savedViews={
        withSavedViews
          ? {
              label: 'Saved views',
              selectedId: selectedSavedId,
              operation: 'idle',
              items: [
                { id: 'sv-1', name: 'Roastery focus' },
                { id: 'sv-2', name: 'Blocked only' },
              ],
              onApply: (id) => setSelectedSavedId(id),
              onSave: () => undefined,
            }
          : undefined
      }
    />
  )
}

function Specimen(props: { title: string; copy: string; activePicFilter?: boolean; withSavedViews?: boolean }) {
  return (
    <div className="v3-story-frame v3-story-frame--wide">
      <section className="v3-story-section" aria-labelledby="collection-toolbar-title">
        <h1 id="collection-toolbar-title" className="v3-story-section__title">{props.title}</h1>
        <p className="v3-story-section__copy">{props.copy}</p>
        <ToolbarHarness activePicFilter={props.activePicFilter} withSavedViews={props.withSavedViews} />
      </section>
    </div>
  )
}

export const DesktopInline: Story = {
  render: () => (
    <Specimen
      title="Desktop inline toolbar"
      copy="Row 1 carries the one view axis — preset chips and user-saved views in a single labelled strip, presentation switch trailing right. Row 2 is search plus compact secondary controls, always available inline."
    />
  ),
  parameters: { v3Viewport: 'desktop1280' },
  globals: { viewport: { value: 'desktop1280' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Presets and saved views share one strip; the default preset is the active chip.
    expect(canvas.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
    await expect(canvas.getByRole('button', { name: 'Roastery focus' })).toBeVisible()
    await expect(canvas.getByLabelText('PIC')).toBeVisible()
    await expect(canvas.getByLabelText('Status')).toBeVisible()
  },
}

export const SavedViewApplied: Story = {
  render: () => (
    <Specimen
      title="Saved view applied"
      copy="Applying a user-saved view moves the active state onto its chip; the preset chips release their pressed state — one axis, never two competing selections."
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Roastery focus' }))
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Roastery focus' })).toHaveAttribute('aria-pressed', 'true'))
    expect(canvas.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false')
  },
}

export const DesktopInlineControls: Story = {
  render: () => (
    <Specimen
      title="Desktop inline controls"
      copy="Desktop keeps every secondary control visible in one compact row: domain filters and Save view. Nothing is shown disabled — unsupported capabilities are omitted."
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText('PIC')).toBeVisible()
    await expect(canvas.getByLabelText('Status')).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Save view' })).toBeVisible()
  },
}

export const DesktopActiveFilter: Story = {
  render: () => (
    <Specimen
      title="Active filter stays visible"
      copy="With the PIC filter away from its rest state, the active selection remains visible in the compact desktop row."
      activePicFilter
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText('PIC')).toHaveValue('p-aisyah')
  },
}

export const SaveViewFlow: Story = {
  render: () => (
    <Specimen
      title="Save the current view"
      copy="Save view is always available on desktop; it opens a naming row whose Save action stays disabled until the name is non-empty."
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Save view' }))
    const nameField = canvas.getByLabelText('View name')
    await expect(nameField).toBeVisible()
    expect(canvas.getByRole('button', { name: 'Save' })).toBeDisabled()
    await userEvent.type(nameField, 'Café mornings')
    expect(canvas.getByRole('button', { name: 'Save' })).toBeEnabled()
  },
}

export const PhoneRegime: Story = {
  render: () => (
    <Specimen
      title="Phone: same grammar, outer door"
      copy="Below the desktop breakpoint the in-toolbar trigger disappears — phone hosts expose the identical View & filters door via their outer wrapper — and the options panel renders expanded inside it."
    />
  ),
  parameters: { v3Viewport: 'phone390' },
  globals: { viewport: { value: 'phone390' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // No desktop trigger button on phone…
    expect(canvas.queryByRole('button', { name: /View & filters/ })).toBeNull()
    // …but every secondary control is present, expanded.
    await expect(canvas.getByLabelText('PIC')).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Save view' })).toBeVisible()
  },
}
