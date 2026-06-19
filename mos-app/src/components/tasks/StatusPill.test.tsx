// StatusPill — renders the soft <Tag> (Twenty IxD). Each status maps to a
// semantic tag colour, and the text label is always present.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusPill } from './StatusPill'
import type { TaskStatus } from '../../lib/db/tasks.types'

describe('StatusPill — status variants (soft Tag, Twenty IxD)', () => {
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
  // WCAG 1.4.1 / OBS-120: status is never colour-alone. The Tag carries no dot,
  // so the text label IS the non-colour cue — it must always be present.
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
