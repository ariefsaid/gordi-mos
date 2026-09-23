// AC-021 (#755) — the Home half of the origin-aware Back. The record page can only name the
// origin if the origin RIDES the navigation: StreamRow is the ONE Home record-row anatomy
// (FR-930), so its link is where a Home arrival marks itself. The page half (reading the state
// into the Back label) is pinned in pages/tasks-layout.test.tsx.
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { StreamRow } from './stream-row'
import type { StreamItem } from '@/lib/home-stream'

const ITEM: StreamItem = {
  id: 't-1',
  title: 'Replace grinder burrs',
  route: '/work/tasks/t-1',
  pic: { name: 'Cahya Cafe' },
}

function StateProbe() {
  const state = useLocation().state as { from?: string } | null
  return <div data-testid="nav-state">{state?.from ?? 'none'}</div>
}

describe('AC-021: a Home row marks its navigation with the origin', () => {
  it('the row link to a record carries state { from: "home" }', async () => {
    render(
      <I18nProvider>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<ul><StreamRow item={ITEM} /></ul>} />
            <Route path="/work/tasks/:id" element={<StateProbe />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    )
    fireEvent.click(screen.getByRole('link', { name: /replace grinder burrs/i }))
    expect(await screen.findByTestId('nav-state')).toHaveTextContent('home')
  })
})
