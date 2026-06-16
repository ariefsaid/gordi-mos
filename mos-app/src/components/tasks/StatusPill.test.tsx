// TDD: StatusPill — each status renders correct pill class and text
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusPill } from './StatusPill'
import type { TaskStatus } from '../../lib/db/tasks.types'

describe('StatusPill — status variants', () => {
  const cases: [TaskStatus, string][] = [
    ['Open',        'pill-open'],
    ['In Progress', 'pill-inprogress'],
    ['Blocked',     'pill-blocked'],
    ['Done',        'pill-done'],
  ]

  for (const [status, cls] of cases) {
    it(`renders "${status}" with class "${cls}"`, () => {
      const { container } = render(<StatusPill status={status} />)
      const pill = container.querySelector('.pill')
      expect(pill).toBeTruthy()
      expect(pill!.classList.contains(cls)).toBe(true)
      expect(screen.getByText(status)).toBeTruthy()
    })
  }

  it('renders a decorative dot inside the pill', () => {
    const { container } = render(<StatusPill status="Blocked" />)
    expect(container.querySelector('.dot')).toBeTruthy()
  })
})

describe('StatusPill — AC-118 always-label rule', () => {
  it('AC-118: always renders the status text label (never dot-only) for "In Progress"', () => {
    render(<StatusPill status="In Progress" />)
    expect(screen.getByText('In Progress')).toBeInTheDocument()
  })

  it('AC-118: always renders the status text label (never dot-only) for "Blocked"', () => {
    render(<StatusPill status="Blocked" />)
    expect(screen.getByText('Blocked')).toBeInTheDocument()
  })

  it('AC-118: always renders the status text label (never dot-only) for "Open"', () => {
    render(<StatusPill status="Open" />)
    expect(screen.getByText('Open')).toBeInTheDocument()
  })

  it('AC-118: always renders the status text label (never dot-only) for "Done"', () => {
    render(<StatusPill status="Done" />)
    expect(screen.getByText('Done')).toBeInTheDocument()
  })
})
