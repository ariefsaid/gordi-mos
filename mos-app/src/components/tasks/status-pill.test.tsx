// StatusPill — the task lifecycle status always carries its text label.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusPill } from './status-pill'
import type { TaskStatus } from '@/lib/db/tasks.types'

describe('StatusPill — AC-118 always-label rule (label is the redundant cue)', () => {
  // WCAG 1.4.1 / OBS-120: status is never colour-alone, so the text label must always be present.
  const statuses: TaskStatus[] = ['In Progress', 'Blocked', 'Open', 'Done']
  for (const status of statuses) {
    it(`AC-118: "${status}" always renders its text label (never colour-only)`, () => {
      render(<StatusPill status={status} />)
      expect(screen.getByText(status)).toBeInTheDocument()
    })
  }
})
