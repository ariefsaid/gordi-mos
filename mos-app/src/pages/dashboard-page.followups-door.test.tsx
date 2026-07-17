// DashboardPage — the Money queue-entry door (Step 9, AC-902). Sibling flag-variant
// test file (mirrors my-week.hidden.test.tsx): dashboard-page.test.tsx keeps testing
// the real (flag-off) default; this file owns the flag-on path.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/config/features', async () => {
  const actual = await vi.importActual<typeof import('@/config/features')>('@/config/features')
  return { ...actual, SHOW_FOLLOWUPS: true }
})
vi.mock('@/lib/db/reporting', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/reporting')>('@/lib/db/reporting')
  return { ...actual, listSalesDailyRevenue: vi.fn(() => new Promise(() => {})) }
})
vi.mock('@/lib/db/reporting-margin', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/reporting-margin')>('@/lib/db/reporting-margin')
  return { ...actual, listSalesMarginDaily: vi.fn(() => new Promise(() => {})) }
})

import { DashboardPage } from './dashboard-page'

describe('DashboardPage — Follow-up queue door (Step 9, AC-902)', () => {
  it('AC-902: shows a real Link to /money/follow-ups when SHOW_FOLLOWUPS is on', () => {
    render(
      <MemoryRouter initialEntries={['/money']}>
        <DashboardPage />
      </MemoryRouter>,
    )
    const link = screen.getByRole('link', { name: 'Follow-up queue' })
    expect(link).toHaveAttribute('href', '/money/follow-ups')
  })
})
