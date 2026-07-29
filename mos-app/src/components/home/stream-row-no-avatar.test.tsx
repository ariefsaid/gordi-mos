// The person on a record row is their NAME, not a coloured disc of their initials.
//
// Owner, 2026-07-28: "remove the profile icon for the person's initial. just use the name" — and
// the signed mockup (docs/design-mockups/home-priority-2026-07-28/index.html) carries the
// directive in its own source: "No avatars anywhere … the name already carries the identity, and
// the disc cost 28px of measure in the 300px feed column."
//
// StreamRow is the ONE Home record-row anatomy (FR-930), shared by every arrangement — List
// bands, Overview tiles and Focused tab bodies — so this contract is asserted once, here.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { StreamRow } from './stream-row'
import type { StreamItem } from '@/lib/home-stream'

const ITEM: StreamItem = {
  id: 't-1',
  title: 'Replace grinder burrs',
  route: '/work/tasks/t-1',
  pic: { initials: 'CC', name: 'Cahya Cafe' },
  caption: 'Retail Ops',
  meta: 'Tue 21 Jul',
}

function renderRow(item: StreamItem = ITEM, hidePic = false) {
  return render(
    <I18nProvider><MemoryRouter>
      <ul><StreamRow item={item} hidePic={hidePic} /></ul>
    </MemoryRouter></I18nProvider>,
  )
}

describe("a Home row names the person — it never draws their initials (owner, 2026-07-28)", () => {
  it('renders the PIC name as plain text', () => {
    renderRow()
    expect(screen.getByText('Cahya Cafe')).toBeInTheDocument()
  })

  it('renders no initials mark anywhere in the row', () => {
    const { container } = renderRow()
    expect(screen.queryByText('CC')).not.toBeInTheDocument()
    expect(container.querySelector('.stream-row-avatar')).toBeNull()
  })

  it('the meta line still reads name · caption · due, in that order, with nothing orphaned', () => {
    const { container } = renderRow()
    const meta = container.querySelector('.stream-row-meta')!
    expect(meta.textContent).toBe('Cahya Cafe·Retail Ops·Tue 21 Jul')
  })

  it('hidePic still drops the person entirely (my-work: the PIC is always the viewer)', () => {
    renderRow(ITEM, true)
    expect(screen.queryByText('Cahya Cafe')).not.toBeInTheDocument()
    expect(screen.getByText('Retail Ops')).toBeInTheDocument()
  })
})
