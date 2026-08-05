// StatusPill — renders the soft <Tag> (records-workspace IxD). Each status maps
// to a semantic tag colour, and the text label is always present.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import { StatusPill } from './status-pill'
import type { TaskStatus } from '@/lib/db/tasks.types'

describe('StatusPill — status variants (soft Tag, records-workspace IxD)', () => {
  // Semantic colour mapping (In Progress→blue, Blocked→red, Open→amber, Done→green).
  const cases: [TaskStatus, string][] = [
    ['Open',        'amber'],
    ['In Progress', 'blue'],
    ['Blocked',     'red'],
    ['Done',        'green'],
  ]

  for (const [status, color] of cases) {
    it(`renders "${status}" as a soft Tag in "${color}"`, () => {
      const { container } = render(<StatusPill status={status} />)
      const tag = container.querySelector('.mk-tag') as HTMLElement | null
      expect(tag).toBeTruthy()
      // Colour applied via the tag palette token (background + text).
      expect(tag!.getAttribute('style') ?? '').toContain(`--ds-tag-background-${color}`)
      expect(screen.getByText(status)).toBeTruthy()
    })
  }
})

describe('StatusPill — AC-118 always-label rule (label is the redundant cue)', () => {
  // WCAG 1.4.1 / OBS-120: status is never colour-alone. The leading dot is an
  // aria-hidden redundant cue, so the text label remains the non-colour cue —
  // it must always be present.
  const statuses: TaskStatus[] = ['In Progress', 'Blocked', 'Open', 'Done']
  for (const status of statuses) {
    it(`AC-118: "${status}" always renders its text label (never colour-only)`, () => {
      const { container } = render(<StatusPill status={status} />)
      const tag = container.querySelector('.mk-tag')!
      expect(screen.getByText(status)).toBeInTheDocument()
      expect(tag.textContent).toContain(status)
    })
  }
})

describe('StatusPill — openTreatment="neutral" swaps Open\'s amber for the neutral gray (design review F3)', () => {
  // #191 (Home port) — Home's stream row sits an amber Open pill beside its own amber
  // reason chip, reading as a second warning tier. openTreatment="neutral" is the fix:
  // it swaps only Open's tag colour + text token to the DESIGN.md §5 neutral gray, and
  // leaves every other status (and every other StatusPill call site's default
  // 'flagged' treatment) untouched.
  it('renders Open as neutral gray, not amber, when openTreatment="neutral"', () => {
    const { container } = render(<StatusPill status="Open" openTreatment="neutral" />)
    const tag = container.querySelector('.mk-tag') as HTMLElement
    const style = tag.getAttribute('style') ?? ''
    expect(style).toContain('--ds-tag-background-gray')
    expect(style).not.toContain('--ds-tag-background-amber')
    expect(tag).toHaveStyle({ color: 'var(--muted-foreground)' })
  })

  it('leaves Open amber under the default "flagged" treatment', () => {
    const { container } = render(<StatusPill status="Open" />)
    const tag = container.querySelector('.mk-tag') as HTMLElement
    const style = tag.getAttribute('style') ?? ''
    expect(style).toContain('--ds-tag-background-amber')
    expect(style).not.toContain('--ds-tag-background-gray')
    expect(tag).toHaveStyle({ color: 'var(--warning-foreground)' })
  })

  it('ignores openTreatment="neutral" for every non-Open status', () => {
    const { container } = render(<StatusPill status="Blocked" openTreatment="neutral" />)
    const tag = container.querySelector('.mk-tag') as HTMLElement
    const style = tag.getAttribute('style') ?? ''
    expect(style).toContain('--ds-tag-background-red')
    expect(style).not.toContain('--ds-tag-background-gray')
    expect(tag).toHaveStyle({ color: 'var(--status-lost-text)' })
  })
})

describe('StatusPill — Issue 2 AA text-token lock', () => {
  it.each([
    ['Open', '--warning-foreground'],
    ['In Progress', '--status-open-text'],
    ['Blocked', '--status-lost-text'],
    ['Done', '--status-won-text'],
  ] as const)('uses the E7 AA text role for %s status text', (status, token) => {
    render(
      <I18nProvider>
        <StatusPill status={status} />
      </I18nProvider>,
    )

    expect(screen.getByText(status).closest('.mk-tag')).toHaveStyle({ color: `var(${token})` })
  })
})
