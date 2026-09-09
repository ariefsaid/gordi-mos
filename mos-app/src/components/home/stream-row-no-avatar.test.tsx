// The person on a record row is their NAME, not a coloured disc of their initials.
//
// Owner, 2026-07-28: "remove the profile icon for the person's initial. just use the name" — and
// the signed mockup (docs/design-mockups/home-priority-2026-07-28/index.html) carries the
// directive in its own source: "No avatars anywhere … the name already carries the identity, and
// the disc cost 28px of measure in the 300px feed column."
//
// StreamRow is the ONE Home record-row anatomy (FR-930), shared by the daily brief and Signals.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { StreamRow } from './stream-row'
import { HomeDailyBrief } from './home-daily-brief'
import { buildHomeRegions } from './home-regions'
import type { StreamItem } from '@/lib/home-stream'

const ITEM: StreamItem = {
  id: 't-1',
  title: 'Replace grinder burrs',
  route: '/work/tasks/t-1',
  pic: { name: 'Cahya Cafe' },
  caption: 'Retail Ops',
  meta: 'Tue 21 Jul',
}

function renderRow(item: StreamItem = ITEM) {
  return render(
    <I18nProvider><MemoryRouter>
      <ul><StreamRow item={item} /></ul>
    </MemoryRouter></I18nProvider>,
  )
}

describe("a Home row names the person — it never draws their initials (owner, 2026-07-28)", () => {
  it('renders the PIC name as plain text', () => {
    renderRow()
    expect(screen.getByText('Cahya Cafe')).toBeInTheDocument()
  })

  // `AttentionPic` no longer carries an `initials` field at all (retired with the disc), so there
  // is nothing left to render one FROM — this pins the absence of the mark itself.
  it('renders no initials mark anywhere in the row', () => {
    const { container } = renderRow()
    expect(container.querySelector('.stream-row-avatar')).toBeNull()
    expect(screen.getByText('Cahya Cafe').textContent).not.toMatch(/^[A-Z]{2}$/)
  })

  it('the meta line still reads name · caption · due, in that order, with nothing orphaned', () => {
    const { container } = renderRow()
    const meta = container.querySelector('.stream-row-meta')!
    expect(meta.textContent).toBe('Cahya Cafe·Retail Ops·Tue 21 Jul')
  })

})

// ── F16 (OD-REDESIGN-91 #28), asserted where it actually has to hold ──────────────────────────
// In "My work today" the PIC is always the viewer, so naming them to themselves carries zero
// information and those rows suppress it. The rule used to be proved by handing `hidePic` to
// StreamRow directly — which cannot tell a WIRED rule from an unwired one, and it was in fact
// unwired: `RegionRows` took `hidePic` as a prop and not one of the three layouts passed it, so
// every my-work row on the real page named the viewer to themselves.
//
// So this renders the REGION in the daily brief with the SAME person on an attention row and on a
// my-work row. Suppression is region-scoped, not global.
const PERSON = { name: 'Cahya Cafe' }
const attentionItem: StreamItem = {
  id: 'a-1', title: 'Restock oat milk', route: '/work/tasks/a-1', pic: PERSON, caption: 'Retail Ops',
}
const myWorkItem: StreamItem = {
  id: 'm-1', title: 'Replace grinder burrs', route: '/work/tasks/m-1', pic: PERSON, caption: 'Kitchen',
}

function renderBrief(regions: ReturnType<typeof buildHomeRegions>) {
  return render(
    <I18nProvider><MemoryRouter>
      <HomeDailyBrief regions={regions} feed={<div />} />
    </MemoryRouter></I18nProvider>,
  )
}

describe('F16: a rendered "My work today" region never names the viewer to themselves', () => {
  const empty = { overdue: [], dueToday: [], blocked: [], myWork: [], failedChecks: [], failedChecksAdmitted: true }

  it('the my-work rows carry no PIC name in the daily brief', () => {
    renderBrief(buildHomeRegions({ ...empty, myWork: [myWorkItem] }))
    // The row itself is there (so this is not passing on an empty region), and its caption is too.
    expect(screen.getByText('Replace grinder burrs')).toBeInTheDocument()
    expect(screen.getByText('Kitchen')).toBeInTheDocument()
    expect(screen.queryByText('Cahya Cafe')).not.toBeInTheDocument()
  })

  it('the SAME person is still named on an attention row', () => {
    renderBrief(buildHomeRegions({ ...empty, overdue: [attentionItem] }))
    expect(screen.getByText('Cahya Cafe')).toBeInTheDocument()
  })
})
