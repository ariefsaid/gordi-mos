// TDD: StatusPill — each status renders correct pill class and text
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusPill } from './StatusPill'
import type { TaskStatus } from '../../lib/db/tasks.types'

describe('StatusPill — status variants (re-skinned onto the shared <Pill>)', () => {
  // VIS-4 (PR-2): StatusPill maps each status to a shared-Pill tone.
  const cases: [TaskStatus, import('../../components/ui/Pill').PillTone][] = [
    ['Open',        'warning'],
    ['In Progress', 'primary'],
    ['Blocked',     'destructive'],
    ['Done',        'success'],
  ]

  for (const [status, tone] of cases) {
    it(`renders "${status}" on a shared Pill with tone "${tone}"`, () => {
      const { container } = render(<StatusPill status={status} />)
      const pill = container.querySelector('.pill')
      expect(pill).toBeTruthy()
      expect(pill!.classList.contains(`pill--${tone}`)).toBe(true)
      expect(screen.getByText(status)).toBeTruthy()
    })
  }

  it('renders a decorative dot inside the pill', () => {
    const { container } = render(<StatusPill status="Blocked" />)
    expect(container.querySelector('.dot')).toBeTruthy()
  })
})

describe('StatusPill — AC-118 always-label rule (label COEXISTS with the dot)', () => {
  // The real intent (OBS-120, WCAG 1.4.1): status is a redundant cue = dot + label,
  // never one alone. Each case asserts the text label AND the dot are present together.
  const statuses: TaskStatus[] = ['In Progress', 'Blocked', 'Open', 'Done']
  for (const status of statuses) {
    it(`AC-118: "${status}" renders the text label AND the dot together (never dot-only, never label-only)`, () => {
      const { container } = render(<StatusPill status={status} />)
      const pill = container.querySelector('.pill')!
      // Label present
      expect(screen.getByText(status)).toBeInTheDocument()
      // Dot present as a redundant cue
      expect(pill.querySelector('.dot')).toBeTruthy()
      // Both live inside the same pill (coexist)
      expect(pill.textContent).toContain(status)
    })
  }
})
