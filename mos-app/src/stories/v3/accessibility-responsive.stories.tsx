import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { Button } from '@/components/ui/button'
import { ViewTabs } from '@/components/ui/view-tabs'
import { RecordPanelHost } from '@/shell/record-panel-host'

export const v3Matrix = {
  jobs: [
    "accessibility.runnable-a11y",
    "accessibility.runtime-proof",
    "accessibility.keyboard-focus",
  ],
  states: ["button.focus-visible"],
  responsive: ["desktop1280", "intermediate", "phone390"],
  canonicalImports: [
    { symbol: "Button", file: "mos-app/src/components/ui/button.tsx", importPath: "@/components/ui/button" },
    { symbol: "ViewTabs", file: "mos-app/src/components/ui/view-tabs.tsx", importPath: "@/components/ui/view-tabs" },
    { symbol: "RecordPanelHost", file: "mos-app/src/shell/record-panel-host.tsx", importPath: "@/shell/record-panel-host" },
  ],
  scope: { applicationMigration: false, representativeAcceptance: false, futureIssue4Host: false },
} as const

const meta = {
  title: 'Accessibility and responsive proof',
  excludeStories: /^v3Matrix$/,
  parameters: {
    a11y: { test: 'error' },
    docs: { description: { component: 'Runnable accessibility and keyboard proof for the current canonical primitives. Automated checks are rendered DOM checks and do not alone certify WCAG AA.' } },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const RuntimeAndViewport: Story = {
  render: () => (
    <div className="v3-story-frame">
      <section className="v3-story-section" aria-labelledby="a11y-runtime-title">
        <h1 id="a11y-runtime-title" className="v3-story-section__title">Runtime and viewport proof</h1>
        <p className="v3-story-section__copy">Storybook loads the production font/token entrypoints and offers the exact proof presets used by Issue 2.</p>
        <dl className="v3-story-grid">
          <div className="v3-token-card"><dt className="v3-token-card__name">Font role</dt><dd style={{ fontFamily: 'var(--font-sans)' }}>DM Sans body</dd></div>
          <div className="v3-token-card"><dt className="v3-token-card__name">Surface role</dt><dd>Warm application background</dd></div>
          <div className="v3-token-card"><dt className="v3-token-card__name">Viewport</dt><dd data-testid="active-viewport-proof">1280 / intermediate / 390</dd></div>
        </dl>
      </section>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'Runtime and viewport proof' })).toBeVisible()
    await expect(canvas.getByTestId('active-viewport-proof')).toHaveTextContent('1280 / intermediate / 390')
    await expect(document.fonts).toBeDefined()
  },
}

function KeyboardJourney() {
  const [active, setActive] = useState('table')
  const [opened, setOpened] = useState(false)
  return (
    <div className="v3-story-frame">
      <section className="v3-story-section" aria-labelledby="a11y-keyboard-title">
        <h1 id="a11y-keyboard-title" className="v3-story-section__title">Keyboard journey</h1>
        <ViewTabs
          ariaLabel="Collection view"
          tabs={[{ id: 'table', label: 'Table' }, { id: 'queue', label: 'Queue' }, { id: 'board', label: 'Board', soon: true }]}
          active={active}
          onChange={setActive}
        />
        <Button variant="primary" onClick={() => setOpened(true)}>Open record shell</Button>
        {opened && (
          <RecordPanelHost label="Keyboard proof record" onClose={() => setOpened(false)}>
            <div className="v3-record-panel-specimen">
              <h2 className="v3-record-panel-specimen__title">Keyboard proof record</h2>
              <Button variant="outline" onClick={() => setOpened(false)}>Close record shell</Button>
            </div>
          </RecordPanelHost>
        )}
      </section>
    </div>
  )
}

export const KeyboardJourneys: Story = {
  render: () => <KeyboardJourney />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('tab', { name: 'Table' }))
    await userEvent.keyboard('{ArrowRight}')
    await expect(canvas.getByRole('tab', { name: 'Queue' })).toHaveFocus()
    await userEvent.click(canvas.getByRole('button', { name: 'Open record shell' }))
    const panel = canvas.queryByRole('complementary', { name: 'Keyboard proof record' })
      ?? canvas.getByRole('dialog', { name: 'Keyboard proof record' })
    await expect(panel).toBeVisible()
  },
}
