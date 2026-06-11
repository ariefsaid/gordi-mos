// TimingChip unit tests — on-time/late pill (FIX-5, extracted from 3 consumers).
// Partially addresses the backlog TintPill item.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import TimingChip from './TimingChip'

vi.mock('../../lib/week', () => ({
  weeklyUpdateTiming: vi.fn(),
}))
import { weeklyUpdateTiming } from '../../lib/week'
const mockTiming = vi.mocked(weeklyUpdateTiming)

describe('TimingChip — on-time', () => {
  it('renders "on time" text with on-time styling', () => {
    mockTiming.mockReturnValue('on-time')
    const { container } = render(
      <TimingChip submittedAt="2026-06-12T08:00:00Z" weekStart="2026-06-08" />,
    )
    expect(screen.getByText('on time')).toBeTruthy()
    const chip = container.querySelector('.timing-chip') as HTMLElement
    expect(chip).toBeTruthy()
    expect(chip.className).toMatch(/timing-chip-ontime/)
  })

  it('dot is aria-hidden and present for on-time', () => {
    mockTiming.mockReturnValue('on-time')
    const { container } = render(
      <TimingChip submittedAt="2026-06-12T08:00:00Z" weekStart="2026-06-08" />,
    )
    const dot = container.querySelector('[aria-hidden="true"]') as HTMLElement
    expect(dot).toBeTruthy()
  })
})

describe('TimingChip — late', () => {
  it('renders "late" text with late styling', () => {
    mockTiming.mockReturnValue('late')
    const { container } = render(
      <TimingChip submittedAt="2026-06-13T05:00:00Z" weekStart="2026-06-08" />,
    )
    expect(screen.getByText('late')).toBeTruthy()
    const chip = container.querySelector('.timing-chip') as HTMLElement
    expect(chip).toBeTruthy()
    expect(chip.className).toMatch(/timing-chip-late/)
  })

  it('dot is aria-hidden and present for late', () => {
    mockTiming.mockReturnValue('late')
    const { container } = render(
      <TimingChip submittedAt="2026-06-13T05:00:00Z" weekStart="2026-06-08" />,
    )
    const dot = container.querySelector('[aria-hidden="true"]') as HTMLElement
    expect(dot).toBeTruthy()
  })
})
