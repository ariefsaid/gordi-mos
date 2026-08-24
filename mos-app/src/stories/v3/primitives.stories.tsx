import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { Avatar } from '@/components/ui/avatar'
import { DateField } from '@/components/ui/date-field'
import { IconButton } from '@/components/ui/icon-button'
import { DataProvenanceNote } from '@/components/ui/data-provenance-note'
import { CloseIcon, MoreIcon, ProfileIcon } from '@/shell/icons'

export const v3Matrix = {
  jobs: [
    'primitives.avatar-identity',
    'primitives.date-field-matrix',
    'primitives.icon-button-matrix',
    'primitives.data-provenance',
  ],
  states: [
    'avatar.sizes',
    'avatar.squared-rounded',
    'avatar.seeded-initials',
    'avatar.image',
    'avatar.broken-image-debt',
    'avatar.icon-fallback',
    'date-field.value',
    'date-field.empty-placeholder',
    'date-field.error',
    'date-field.disabled',
    'icon-button.variant-accent-matrix',
    'icon-button.small',
    'icon-button.disabled',
    'provenance.snapshot-as-of',
    'provenance.snapshot-awaiting',
    'provenance.live-note',
  ],
  responsive: ['desktop1280', 'intermediate', 'phone390'],
  canonicalImports: [
    { symbol: 'Avatar', file: 'mos-app/src/components/ui/avatar.tsx', importPath: '@/components/ui/avatar' },
    { symbol: 'DateField', file: 'mos-app/src/components/ui/date-field.tsx', importPath: '@/components/ui/date-field' },
    { symbol: 'IconButton', file: 'mos-app/src/components/ui/icon-button.tsx', importPath: '@/components/ui/icon-button' },
    { symbol: 'DataProvenanceNote', file: 'mos-app/src/components/ui/data-provenance-note.tsx', importPath: '@/components/ui/data-provenance-note' },
  ],
  debt: [
    'Avatar has no broken-image fallback: a failed avatarUrl renders an empty tile instead of recovering to seeded initials. Recorded for the primitive-kit pass.',
    "IconButton's variant vocabulary (secondary/tertiary + accent danger) still diverges from Button's DESIGN §5 set (primary|outline|ghost|destructive); collapse pending the single-vocabulary decision.",
  ],
  scope: { applicationMigration: false, representativeAcceptance: false, futureIssue4Host: false },
} as const

const meta = {
  title: 'Primitives',
  excludeStories: /^v3Matrix$/,
  parameters: {
    docs: {
      description: {
        component:
          'Small identity and field primitives from the kit: Avatar (image | seeded-pastel initials | icon), DateField (token-styled box over a real native date input), IconButton (square icon-only control), and DataProvenanceNote (snapshot vs live freshness language).',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

// A tiny self-contained portrait so the image variant needs no network fetch.
const PORTRAIT_DATA_URI =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' fill='peru'/><circle cx='16' cy='12' r='6' fill='wheat'/><path d='M4 30c2-8 22-8 24 0z' fill='wheat'/></svg>"

export const AvatarIdentity: Story = {
  render: () => (
    <div className="v3-story-frame">
      <section className="v3-story-section" aria-labelledby="primitives-avatar-title">
        <h1 id="primitives-avatar-title" className="v3-story-section__title">Avatar identity matrix</h1>
        <p className="v3-story-section__copy">
          No image → the placeholder string seeds a deterministic pastel family (same name, same
          color, both themes). With an image the photo fills the tile; with neither, the icon
          fallback renders. A failed image URL currently leaves an empty tile — a recorded
          primitive gap, not a design intent.
        </p>
        <div className="v3-story-stack">
          <div className="v3-story-row">
            <span className="v3-story-label">Sizes</span>
            <Avatar size="xs" placeholder="Aisyah Rahman" />
            <Avatar size="sm" placeholder="Aisyah Rahman" />
            <Avatar size="md" placeholder="Aisyah Rahman" />
            <Avatar size="lg" placeholder="Aisyah Rahman" />
            <Avatar size="xl" placeholder="Aisyah Rahman" />
          </div>
          <div className="v3-story-row">
            <span className="v3-story-label">Seeded initials</span>
            <Avatar size="lg" placeholder="Aisyah Rahman" />
            <Avatar size="lg" placeholder="Putri Lestari" />
            <Avatar size="lg" placeholder="Budi Santoso" />
            <Avatar size="lg" placeholder="Ibnu Hakim" />
            <Avatar size="lg" type="rounded" placeholder="Nadia Pratama" />
          </div>
          <div className="v3-story-row">
            <span className="v3-story-label">Image · broken image · icon fallback</span>
            <Avatar size="lg" avatarUrl={PORTRAIT_DATA_URI} placeholder="Aisyah Rahman" />
            <Avatar size="lg" avatarUrl="/missing-avatar.png" placeholder="Aisyah Rahman" />
            <Avatar size="lg" Icon={<ProfileIcon />} />
          </div>
        </div>
      </section>
    </div>
  ),
  play: async ({ canvasElement }) => {
    // Same seed, same family: the two "Aisyah Rahman" initial tiles paint identically.
    const initialTiles = Array.from(canvasElement.querySelectorAll('.mk-avatar')).filter(
      (tile) => tile.textContent === 'A' && !tile.querySelector('img'),
    )
    expect(initialTiles.length).toBeGreaterThanOrEqual(2)
    const [first, second] = initialTiles
    expect(getComputedStyle(first).backgroundColor).toBe(getComputedStyle(second).backgroundColor)
  },
}

function DateFieldHarness() {
  const [value, setValue] = useState('2026-07-28')
  return <DateField label="Due date" value={value} onChange={setValue} />
}

export const DateFieldMatrix: Story = {
  render: () => (
    <div className="v3-story-frame">
      <section className="v3-story-section" aria-labelledby="primitives-date-title">
        <h1 id="primitives-date-title" className="v3-story-section__title">Date field matrix</h1>
        <p className="v3-story-section__copy">
          The real native date input stays underneath (native picker, keyboard segments, native
          a11y) while the box shows an unambiguous "28 Jul 2026" display instead of the browser's
          locale text. Empty shows a quiet em-dash placeholder.
        </p>
        <div className="v3-story-grid v3-story-grid--two">
          <DateFieldHarness />
          <DateField label="Follow-up date" value="" onChange={() => undefined} />
          <DateField label="Committed date" value="2026-07-01" onChange={() => undefined} error />
          <DateField label="Locked date" value="2026-06-15" onChange={() => undefined} disabled />
        </div>
      </section>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // The display slot renders the unambiguous day-month-year text, not the locale text.
    await expect(canvas.getByText('28 Jul 2026')).toBeVisible()
    expect(canvas.getByLabelText('Due date')).toHaveValue('2026-07-28')
    expect(canvas.getByLabelText('Committed date')).toHaveAttribute('aria-invalid', 'true')
    expect(canvas.getByLabelText('Locked date')).toBeDisabled()
  },
}

export const IconButtonMatrix: Story = {
  render: () => (
    <div className="v3-story-frame">
      <section className="v3-story-section" aria-labelledby="primitives-iconbtn-title">
        <h1 id="primitives-iconbtn-title" className="v3-story-section__title">Icon button matrix</h1>
        <p className="v3-story-section__copy">
          Square icon-only control: variant (secondary · tertiary · primary) × accent (default ·
          danger), 32px medium and 24px small. The accessible name always comes from ariaLabel —
          there is no visible text.
        </p>
        <div className="v3-story-stack">
          <div className="v3-story-row">
            <span className="v3-story-label">Variants</span>
            <IconButton ariaLabel="Close (secondary)"><CloseIcon /></IconButton>
            <IconButton ariaLabel="Close (tertiary)" variant="tertiary"><CloseIcon /></IconButton>
            <IconButton ariaLabel="Close (primary)" variant="primary"><CloseIcon /></IconButton>
          </div>
          <div className="v3-story-row">
            <span className="v3-story-label">Danger accent</span>
            <IconButton ariaLabel="Remove (secondary danger)" accent="danger"><CloseIcon /></IconButton>
            <IconButton ariaLabel="Remove (tertiary danger)" variant="tertiary" accent="danger"><CloseIcon /></IconButton>
            <IconButton ariaLabel="Remove (primary danger)" variant="primary" accent="danger"><CloseIcon /></IconButton>
          </div>
          <div className="v3-story-row">
            <span className="v3-story-label">Small and disabled</span>
            <IconButton ariaLabel="More actions (small)" size="small"><MoreIcon /></IconButton>
            <IconButton ariaLabel="More actions (disabled)" disabled><MoreIcon /></IconButton>
          </div>
        </div>
      </section>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const primary = canvas.getByRole('button', { name: 'Close (primary)' })
    expect(getComputedStyle(primary).backgroundColor).not.toBe('transparent')
    expect(canvas.getByRole('button', { name: 'More actions (disabled)' })).toBeDisabled()
    // Keyboard reachability of the icon-only control.
    await userEvent.tab()
    expect(canvas.getByRole('button', { name: 'Close (secondary)' })).toHaveFocus()
  },
}

export const ProvenanceNotes: Story = {
  render: () => (
    <div className="v3-story-frame">
      <section className="v3-story-section" aria-labelledby="primitives-provenance-title">
        <h1 id="primitives-provenance-title" className="v3-story-section__title">Data provenance notes</h1>
        <p className="v3-story-section__copy">
          Snapshot-fed surfaces say when the data was captured — or, before the first sync, when the
          next one runs. Live surfaces show a short note only when it earns its place (a hidden live
          note renders nothing at all).
        </p>
        <div className="v3-story-stack">
          <div className="v3-story-row">
            <span className="v3-story-label">Snapshot · has data</span>
            <DataProvenanceNote kind="snapshot" hasData asOf="2026-07-22T20:30:00Z" />
          </div>
          <div className="v3-story-row">
            <span className="v3-story-label">Snapshot · awaiting first sync</span>
            <DataProvenanceNote kind="snapshot" hasData={false} nextSyncLabel="03:30 WIB" />
          </div>
          <div className="v3-story-row">
            <span className="v3-story-label">Live · with note</span>
            <DataProvenanceNote kind="live" show note="Live from the operational database." />
          </div>
        </div>
      </section>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/No snapshot yet · next sync 03:30 WIB/)).toBeVisible()
    await expect(canvas.getByText('Live from the operational database.')).toBeVisible()
    expect(canvas.getByText(/as of/).textContent).toMatch(/WIB/)
  },
}
