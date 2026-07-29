// "N more" is the way through, not a dead end (Nielsen #3).
//
// Overview renders a region's top rows only and states the remainder. That remainder used to be a
// static muted <p>: a `needs-you` region holding 9 items said "5 more" and — because only my-work
// carried a `drillTo` — offered no route to them from Home at all. The app named something and
// then refused to show it. The fact stays; it is now also the affordance.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { HomeOverview } from './home-overview'
import { buildHomeRegions, type HomeRegion } from './home-regions'
import type { StreamItem } from '@/lib/home-stream'

const item = (id: string): StreamItem => ({ id, title: `Item ${id}`, route: `/work/tasks/${id}` })
const many = (n: number, p: string) => Array.from({ length: n }, (_, i) => item(`${p}${i}`))

const draw = (regions: HomeRegion[]) =>
  render(
    <I18nProvider>
      <MemoryRouter>
        <HomeOverview regions={regions} feed={<div />} />
      </MemoryRouter>
    </I18nProvider>,
  )

describe('the remainder a region does not render is reachable from Home', () => {
  it('every over-cap region offers a link to its own destination, not a muted sentence', () => {
    draw(buildHomeRegions({
      overdue: many(9, 'o'), dueToday: [], blocked: [],
      myWork: many(6, 'w'), failedChecks: many(7, 'f'), mentions: many(5, 'm'),
    }))
    const hrefByName = Object.fromEntries(
      screen.getAllByRole('link', { name: /more in/i })
        .map((a) => [a.getAttribute('aria-label'), a.getAttribute('href')]),
    )
    expect(hrefByName).toEqual({
      '5 more in Needs you now': '/work/tasks?view=my-work',
      '3 more in Failed checks': '/cafe/log',
      '1 more in Mentions': '/inbox',
      '2 more in My work today': '/work/tasks?view=my-work',
    })
  })

  it('the link still states the plain fact — the count of what is not shown', () => {
    draw(buildHomeRegions({
      overdue: many(9, 'o'), dueToday: [], blocked: [],
      myWork: [], failedChecks: [], mentions: [],
    }))
    expect(screen.getByRole('link', { name: '5 more in Needs you now' })).toHaveTextContent('5 more')
  })

  it('a region that fits under the cap states no remainder at all', () => {
    draw(buildHomeRegions({
      overdue: many(3, 'o'), dueToday: [], blocked: [],
      myWork: [], failedChecks: [], mentions: [],
    }))
    expect(screen.queryByText(/more/i)).toBeNull()
  })

  it('a region with no destination degrades to the plain fact rather than a broken link', () => {
    const [needsYou, ...rest] = buildHomeRegions({
      overdue: many(9, 'o'), dueToday: [], blocked: [],
      myWork: [], failedChecks: [], mentions: [],
    })
    draw([{ ...needsYou, drillTo: undefined }, ...rest])
    expect(screen.queryByRole('link', { name: /more in/i })).toBeNull()
    expect(screen.getByText('5 more')).toBeInTheDocument()
  })
})
