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
