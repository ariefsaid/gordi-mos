import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { Button } from '@/components/ui/button'
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
          <TextInput label="Owner" defaultValue="Aisyah Rahman" />
          <TextInput label="Search" placeholder="Search tasks" autoFocus />
          <TextInput label="Read-only owner" defaultValue="Putri Lestari" disabled />
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
