import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { Button } from '@/components/ui/button'
import { TextInput } from '@/components/ui/text-input'
import { CloseIcon, TasksIcon } from '@/shell/icons'

export const v3Matrix = {
  jobs: [
    "foundation.typography-roles",
    "foundation.spacing-rhythm",
    "foundation.colors-borders-radii-elevation",
    "foundation.icons",
    "foundation.focus-visible",
    "foundation.runtime-fonts-background",
    "foundation.responsive-frames",
    "accessibility.runtime-proof",
  ],
  states: ["button.focus-visible"],
  responsive: ["desktop1280", "intermediate", "phone390"],
  canonicalImports: [
    { symbol: "Button", file: "mos-app/src/components/ui/button.tsx", importPath: "@/components/ui/button" },
    { symbol: "TextInput", file: "mos-app/src/components/ui/text-input.tsx", importPath: "@/components/ui/text-input" },
    { symbol: "TasksIcon", file: "mos-app/src/shell/icons.tsx", importPath: "@/shell/icons" },
    { symbol: "CloseIcon", file: "mos-app/src/shell/icons.tsx", importPath: "@/shell/icons" },
  ],
  scope: { applicationMigration: false, representativeAcceptance: false, futureIssue4Host: false },
} as const

const meta = {
  title: 'Foundation',
  excludeStories: /^v3Matrix$/,
  parameters: { docs: { description: { component: 'E7 foundation roles and runtime token proof. These specimens read the app tokens; they do not introduce a new visual system.' } } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const RuntimeTypography: Story = {
  render: () => (
    <div className="v3-story-frame">
      <section className="v3-story-section" aria-labelledby="foundation-runtime-title">
        <h1 id="foundation-runtime-title" className="v3-story-section__title">Runtime typography and surface</h1>
        <p className="v3-story-section__copy">The same font files and global token entrypoint used by the app shell load in the workbench.</p>
        <div className="v3-story-grid">
          <div className="v3-token-card"><strong style={{ fontFamily: 'var(--font-display)', fontSize: 24 }}>Gordi</strong><span className="v3-token-card__name">display / Plus Jakarta Sans</span></div>
          <div className="v3-token-card"><strong style={{ fontFamily: 'var(--font-sans)', fontSize: 16 }}>Daily control</strong><span className="v3-token-card__name">body / DM Sans</span></div>
          <div className="v3-token-card"><strong className="tabular" style={{ fontSize: 16 }}>OPS-2026-071</strong><span className="v3-token-card__name">tabular / Inter</span></div>
        </div>
      </section>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'Runtime typography and surface' })).toBeVisible()
    await expect(getComputedStyle(document.documentElement).getPropertyValue('--font-sans')).not.toBe('')
    await expect(getComputedStyle(document.body).backgroundColor).not.toBe('transparent')
  },
}

export const TokenRoles: Story = {
  render: () => (
    <div className="v3-story-frame">
      <section className="v3-story-section" aria-labelledby="foundation-token-title">
        <h1 id="foundation-token-title" className="v3-story-section__title">E7 token roles</h1>
        <p className="v3-story-section__copy">Structural navy, warm surfaces, and One Blue interactive emphasis are read from runtime variables.</p>
        <div className="v3-story-grid">
          {[
            ['--background', 'warm surface'],
            ['--card', 'raised surface'],
            ['--primary', 'One Blue action'],
            ['--border', 'hairline border'],
            ['--radius-sm', 'control radius'],
            ['--shadow-overlay', 'overlay elevation'],
          ].map(([token, label]) => (
            <div className="v3-token-card" key={token}>
              <div className="v3-token-card__sample">{label}</div>
              <span className="v3-token-card__name">{token}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  ),
}

export const ResponsiveFrames: Story = {
  render: () => (
    <div className="v3-story-frame">
      <section className="v3-story-section" aria-labelledby="foundation-responsive-title">
        <h1 id="foundation-responsive-title" className="v3-story-section__title">Responsive regimes</h1>
        <p className="v3-story-section__copy">The proof matrix uses the named desktop, intermediate, and phone frames without changing application routes.</p>
        <div className="v3-story-grid">
          {[
            ['desktop1280', 'wide collection and split panel'],
            ['intermediate', 'compact panel regime'],
            ['phone390', 'full-width touch surface'],
          ].map(([viewport, copy]) => (
            <div className="v3-responsive-frame" key={viewport} data-viewport={viewport}>
              <span className="v3-responsive-frame__viewport">{viewport}</span>
              <div className="v3-responsive-frame__content">{copy}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  ),
}

export const FocusSurface: Story = {
  render: () => (
    <div className="v3-story-frame">
      <section className="v3-story-section" aria-labelledby="foundation-focus-title">
        <h1 id="foundation-focus-title" className="v3-story-section__title">Focus-visible surface</h1>
        <p className="v3-story-section__copy">Keyboard focus uses the canonical One Blue ring and never relies on color alone.</p>
        <div className="v3-story-row">
          <Button variant="primary">Open task focus</Button>
          <TextInput aria-label="Search Gordi tasks" placeholder="Search Gordi tasks" />
          <span className="v3-story-label"><TasksIcon /> icon</span>
          <span className="v3-story-label"><CloseIcon /> dismiss</span>
        </div>
      </section>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.tab()
    await expect(canvas.getByRole('button', { name: 'Open task focus' })).toHaveFocus()
  },
}
