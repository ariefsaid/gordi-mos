import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { DemoLogin } from './demo-login'
import { DEMO_PASSWORD, DEMO_PERSONAS } from './demo-personas'

describe('DemoLogin — dev-only one-click sign-in panel', () => {
  it('renders the DEMO LOGIN heading', () => {
    render(<DemoLogin onPick={vi.fn()} busyEmail={null} disabled={false} />)
    expect(screen.getByText(/demo login/i)).toBeInTheDocument()
  })

  it('shows the shared dev password', () => {
    render(<DemoLogin onPick={vi.fn()} busyEmail={null} disabled={false} />)
    expect(screen.getByText(new RegExp(DEMO_PASSWORD.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument()
  })

  it('renders one button per Gordi persona', () => {
    render(<DemoLogin onPick={vi.fn()} busyEmail={null} disabled={false} />)
    for (const p of DEMO_PERSONAS) {
      expect(screen.getByRole('button', { name: new RegExp(p.label, 'i') })).toBeInTheDocument()
    }
    expect(DEMO_PERSONAS).toHaveLength(6)
  })

  it('uses Gordi real personas (Director/Cafe/Kitchen/Roastery/Sales/Finance), not the generic mockup labels', () => {
    const labels = DEMO_PERSONAS.map((p) => p.label)
    expect(labels).toEqual(
      expect.arrayContaining(['Director', 'Cafe Ops', 'Kitchen', 'Roastery', 'Sales', 'Finance']),
    )
    // generic mockup labels must NOT leak in
    expect(labels).not.toContain('Executive')
    expect(labels).not.toContain('Engineer')
    expect(labels).not.toContain('Project Manager')
    // every persona maps to a fictional dev email (never real PII)
    for (const p of DEMO_PERSONAS) {
      expect(p.email).toMatch(/\.dev@example\.test$/)
    }
  })

  it('clicking a persona calls onPick with that persona email', async () => {
    const onPick = vi.fn()
    const user = userEvent.setup()
    render(<DemoLogin onPick={onPick} busyEmail={null} disabled={false} />)

    await user.click(screen.getByRole('button', { name: /director/i }))
    expect(onPick).toHaveBeenCalledWith('dewi.dev@example.test')
  })

  it('disables all persona buttons while disabled', () => {
    render(<DemoLogin onPick={vi.fn()} busyEmail={null} disabled />)
    for (const p of DEMO_PERSONAS) {
      expect(screen.getByRole('button', { name: new RegExp(p.label, 'i') })).toBeDisabled()
    }
  })

  it('marks the busy persona with aria-busy while its sign-in is in flight', () => {
    const busy = DEMO_PERSONAS[0]
    render(<DemoLogin onPick={vi.fn()} busyEmail={busy.email} disabled />)
    expect(screen.getByRole('button', { name: new RegExp(busy.label, 'i') })).toHaveAttribute(
      'aria-busy',
      'true',
    )
  })
})
