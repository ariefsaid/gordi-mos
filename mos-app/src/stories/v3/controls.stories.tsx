import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/state-kit'
import { Checkbox } from '@/components/ui/checkbox'
import { Pill } from '@/components/ui/pill'
import { Select } from '@/components/ui/select'
import { StatusPill } from '@/components/tasks/status-pill'
import { TextInput } from '@/components/ui/text-input'
import { Toggle } from '@/components/ui/toggle'
import { ViewTabs } from '@/components/ui/view-tabs'

export const v3Matrix = {
  jobs: [
    "controls.button-state-matrix",
    "controls.field-state-matrix",
    "controls.selection-status",
    "controls.keyboard-focus",
    "accessibility.keyboard-focus",
  ],
  states: [
    "button.default",
    "button.hover-documentation",
    "button.focus-visible",
    "button.active",
    "button.disabled",
    "button.loading-debt",
    "text-input.default",
    "text-input.focus-visible",
    "text-input.disabled",
    "text-input.error",
    "select.default",
    "select.focus-visible",
    "select.disabled",
    "select.error",
    "checkbox.default",
    "checkbox.checked",
    "checkbox.indeterminate",
    "checkbox.disabled",
    "toggle.default",
    "status.semantic-tones",
  ],
  responsive: ["desktop1280", "intermediate", "phone390"],
  canonicalImports: [
    { symbol: "Button", file: "mos-app/src/components/ui/button.tsx", importPath: "@/components/ui/button" },
    { symbol: "ErrorState", file: "mos-app/src/components/ui/state-kit.tsx", importPath: "@/components/ui/state-kit" },
    { symbol: "TextInput", file: "mos-app/src/components/ui/text-input.tsx", importPath: "@/components/ui/text-input" },
    { symbol: "Select", file: "mos-app/src/components/ui/select.tsx", importPath: "@/components/ui/select" },
    { symbol: "Checkbox", file: "mos-app/src/components/ui/checkbox.tsx", importPath: "@/components/ui/checkbox" },
    { symbol: "Toggle", file: "mos-app/src/components/ui/toggle.tsx", importPath: "@/components/ui/toggle" },
    { symbol: "Pill", file: "mos-app/src/components/ui/pill.tsx", importPath: "@/components/ui/pill" },
    { symbol: "StatusPill", file: "mos-app/src/components/tasks/status-pill.tsx", importPath: "@/components/tasks/status-pill" },
    { symbol: "ViewTabs", file: "mos-app/src/components/ui/view-tabs.tsx", importPath: "@/components/ui/view-tabs" },
  ],
  debt: ["Button loading state is not exposed by the canonical primitive; owner: Issue 3."],
  scope: { applicationMigration: false, representativeAcceptance: false, futureIssue4Host: false },
} as const

const meta = {
  title: 'Controls',
  excludeStories: /^v3Matrix$/,
  parameters: { docs: { description: { component: 'Canonical controls and status language. Hover and active are documented as native pseudo-states; loading is recorded as a primitive gap where the current Button has no loading prop.' } } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const ButtonStateMatrix: Story = {
  render: () => (
    <div className="v3-story-frame">
      <section className="v3-story-section" aria-labelledby="controls-button-title">
        <h1 id="controls-button-title" className="v3-story-section__title">Button state matrix</h1>
        <p className="v3-story-section__copy">Default, hover, focus-visible, active, disabled, and the current loading debt are named without replacing Button CSS.</p>
        <div className="v3-story-row">
          <Button variant="primary">Create task</Button>
          <Button variant="outline">Review queue</Button>
          <Button variant="ghost">View details</Button>
          <Button variant="destructive">Archive task</Button>
          <Button disabled>Disabled action</Button>
          <Button disabled aria-busy="true">Saving task</Button>
        </div>
        <p className="v3-status-copy">Hover and active are native Button pseudo-states. The current primitive has no loading prop; the disabled aria-busy specimen records that debt for Issue 3.</p>
      </section>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const destructive = canvas.getByRole('button', { name: 'Archive task' })
    const defaultBackground = getComputedStyle(destructive).backgroundColor
    expect(defaultBackground).not.toBe('transparent')

    await userEvent.hover(destructive)
    const hoverBackground = getComputedStyle(destructive).backgroundColor
    // @storybook/test's DOM hover dispatch does not guarantee that Chromium's
    // native :hover pseudo-state is active. The browser gate separately checks
    // the rendered default/hover colors; this play proof checks the hovered
    // element remains visibly painted and the CSS source uses the corrected
    // red12 family rather than the legacy destructive token.
    expect(hoverBackground).not.toBe('transparent')
    const hoverRule = Array.from(document.styleSheets)
      .flatMap((sheet) => {
        try {
          return Array.from(sheet.cssRules)
        } catch {
          return []
        }
      })
      .find((rule) => rule.cssText.includes('.btn-destructive:hover'))
    expect(hoverRule?.cssText).toContain('--ds-color-red12')

    await userEvent.unhover(destructive)
    destructive.focus()
    const focusStyle = getComputedStyle(destructive)
    expect(focusStyle.outlineStyle).toBe('solid')
    expect(focusStyle.outlineWidth).toBe('2px')
  },
}

export const FieldStateMatrix: Story = {
  render: () => (
    <div className="v3-story-frame">
      <section className="v3-story-section" aria-labelledby="controls-field-title">
        <h1 id="controls-field-title" className="v3-story-section__title">Field state matrix</h1>
        <div className="v3-story-grid--two v3-story-grid">
          <TextInput label="Example value" defaultValue="Ready for review" />
          <TextInput label="Search" placeholder="Search tasks" autoFocus />
          <TextInput label="Disabled example" defaultValue="Not editable in this state" disabled />
          <TextInput label="Task title" defaultValue="" error aria-describedby="controls-title-error" />
          <span id="controls-title-error" className="v3-status-copy">Task title is required before saving.</span>
          <Select label="Status" defaultValue="open">
            <option value="open">Open</option>
            <option value="progress">In Progress</option>
            <option value="blocked">Blocked</option>
          </Select>
          <Select label="Disabled status" defaultValue="done" disabled>
            <option value="done">Done</option>
          </Select>
          <Select label="Invalid status" defaultValue="open" error>
            <option value="open">Choose a status</option>
          </Select>
        </div>
      </section>
    </div>
  ),
}

export const SelectionAndStatus: Story = {
  render: () => (
    <div className="v3-story-frame">
      <section className="v3-story-section" aria-labelledby="controls-selection-title">
        <h1 id="controls-selection-title" className="v3-story-section__title">Selection and status language</h1>
        <div className="v3-story-stack">
          <div className="v3-story-row">
            <Checkbox aria-label="Select the daily planning task" />
            <Checkbox aria-label="Selected planning task" checked />
            <Checkbox aria-label="Partially selected planning group" indeterminate />
            <Checkbox aria-label="Unavailable planning task" disabled />
            <Toggle aria-label="Include completed tasks" value />
            <Toggle aria-label="Include archived tasks" disabled />
          </div>
          <div className="v3-story-row" aria-label="Operational status tones">
            <Pill tone="neutral">Not started</Pill>
            <Pill tone="primary">In progress</Pill>
            <Pill tone="success">Ready</Pill>
            <Pill tone="warning">At risk</Pill>
            <Pill tone="destructive">Blocked</Pill>
            <StatusPill status="Open" />
            <StatusPill status="In Progress" />
            <StatusPill status="Blocked" />
            <StatusPill status="Done" />
          </div>
        </div>
      </section>
    </div>
  ),
}

type RgbColor = { r: number; g: number; b: number; a: number; space: 'srgb' | 'display-p3' }

function parseComputedColor(value: string): RgbColor | null {
  const p3 = value.match(/^color\(display-p3\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)(?:\s*\/\s*([-+]?\d*\.?\d+))?\)$/)
  if (p3) return { r: Number(p3[1]), g: Number(p3[2]), b: Number(p3[3]), a: Number(p3[4] ?? 1), space: 'display-p3' }
  const channels = value.match(/[-+]?\d*\.?\d+/g)?.map(Number)
  if (!channels || channels.length < 3) return null
  const alpha = channels[3] ?? 1
  const normalized = value.startsWith('rgb') && channels.some((channel) => channel > 1)
  return { r: normalized ? channels[0] / 255 : channels[0], g: normalized ? channels[1] / 255 : channels[1], b: normalized ? channels[2] / 255 : channels[2], a: alpha, space: 'srgb' }
}

function toSrgb(color: RgbColor): RgbColor {
  if (color.space === 'srgb') return color
  const decode = (value: number) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  const encode = (value: number) => value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055
  const linear = [color.r, color.g, color.b].map(decode)
  const xyz = [
    0.48657095 * linear[0] + 0.26566769 * linear[1] + 0.19821729 * linear[2],
    0.22897456 * linear[0] + 0.69173852 * linear[1] + 0.07928691 * linear[2],
    0.04511338 * linear[1] + 1.04394437 * linear[2],
  ]
  const clamp = (value: number) => Math.min(1, Math.max(0, encode(value)))
  return {
    r: clamp(3.24096994 * xyz[0] - 1.53738318 * xyz[1] - 0.49861076 * xyz[2]),
    g: clamp(-0.96924364 * xyz[0] + 1.8759675 * xyz[1] + 0.04155506 * xyz[2]),
    b: clamp(0.05563008 * xyz[0] - 0.20397696 * xyz[1] + 1.05697151 * xyz[2]),
    a: color.a,
    space: 'srgb',
  }
}

function luminance(color: RgbColor) {
  const srgb = toSrgb(color)
  const linear = (value: number) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  return 0.2126 * linear(srgb.r) + 0.7152 * linear(srgb.g) + 0.0722 * linear(srgb.b)
}

function contrastRatio(foreground: RgbColor, background: RgbColor) {
  const foregroundLuminance = luminance(foreground)
  const backgroundLuminance = luminance(background)
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
}

function hueDegrees(color: RgbColor) {
  const srgb = toSrgb(color)
  const max = Math.max(srgb.r, srgb.g, srgb.b)
  const min = Math.min(srgb.r, srgb.g, srgb.b)
  const delta = max - min
  if (delta === 0) return 0
  let hue = max === srgb.r
    ? 60 * (((srgb.g - srgb.b) / delta) % 6)
    : max === srgb.g
      ? 60 * ((srgb.b - srgb.r) / delta + 2)
      : 60 * ((srgb.r - srgb.g) / delta + 4)
  if (hue < 0) hue += 360
  return hue
}

export const StatusSemanticColorProof: Story = {
  render: () => (
    <div className="v3-story-frame">
      <section className="v3-story-section" aria-labelledby="controls-status-proof-title">
        <h1 id="controls-status-proof-title" className="v3-story-section__title">Status and error color proof</h1>
        <p className="v3-story-section__copy">Blocked work and a failed Gordi task refresh use one destructive red text role, with the visible status word kept as the non-color cue.</p>
        <div className="v3-story-stack">
          <StatusPill status="Blocked" label="Blocked" />
          <ErrorState message="The Roastery task queue could not be refreshed." />
        </div>
      </section>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const blocked = canvas.getByText('Blocked').closest('.mk-tag')
    const errorText = canvas.getByText('The Roastery task queue could not be refreshed.')
    expect(blocked).not.toBeNull()
    const blockedStyles = getComputedStyle(blocked as HTMLElement)
    const errorStyles = getComputedStyle(errorText)
    const foreground = parseComputedColor(blockedStyles.color)
    const background = parseComputedColor(blockedStyles.backgroundColor)
    const pageBackground = parseComputedColor(getComputedStyle(document.body).backgroundColor)
    expect(foreground).not.toBeNull()
    expect(background).not.toBeNull()
    expect(pageBackground).not.toBeNull()
    expect(errorStyles.color).toBe(blockedStyles.color)
    expect(contrastRatio(foreground as RgbColor, background as RgbColor)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(foreground as RgbColor, pageBackground as RgbColor)).toBeGreaterThanOrEqual(4.5)
    const hue = hueDegrees(foreground as RgbColor)
    expect(hue < 15 || hue > 345).toBe(true)
  },
}

function KeyboardControls() {
  const [active, setActive] = useState('table')
  const [selected, setSelected] = useState(false)
  return (
    <div className="v3-story-frame">
      <section className="v3-story-section" aria-labelledby="controls-keyboard-title">
        <h1 id="controls-keyboard-title" className="v3-story-section__title">Keyboard focus and selection</h1>
        <ViewTabs
          ariaLabel="Task view"
          tabs={[{ id: 'table', label: 'Table', count: 11 }, { id: 'board', label: 'Board' }, { id: 'calendar', label: 'Calendar', soon: true }]}
          active={active}
          onChange={setActive}
        />
        <div className="v3-story-row">
          <Checkbox aria-label="Select the keyboard proof task" checked={selected} onChange={setSelected} />
          <span className="v3-status-copy">{selected ? 'Selected for the next review' : 'Not selected'}</span>
        </div>
      </section>
    </div>
  )
}

export const KeyboardFocus: Story = {
  render: () => <KeyboardControls />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const tableTab = canvas.getByRole('tab', { name: /Table/ })
    await userEvent.click(tableTab)
    await userEvent.keyboard('{ArrowRight}')
    await expect(canvas.getByRole('tab', { name: 'Board' })).toHaveFocus()
  },
}
