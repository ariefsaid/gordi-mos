// #809 — AC-054 unit tests for HomeMoneyTile.
//
// The tile is the one entry Home carries on behalf of Money for revenue viewers once Money is
// live. Two gates ride together and are honoured by the SAME predicates every other Money door
// on this line asks:
//   • the ship gate (`isShipGated('/money')` in `@/lib/ship-gate`) — closed for EVERYONE while
//     '/money' sits in SHIP_GATED_PATHS,
//   • `canViewRevenue(accessRoles)` (`@/lib/capabilities`) — the ONE role answer every Money
//     door reads (finance, manager, supervisor).
//
// The tests mock the ship-gate module so the "gate closed" and "gate open" branches are both
// exercisable without editing SHIP_GATED_PATHS (which is the whole switch for the base branch).
// This mirrors `shell/rail-glyph-uniqueness.test.tsx`, which stubs the same module the same way.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider, useI18n } from '@/i18n/I18nProvider'
import { useEffect } from 'react'
import type { Locale } from '@/i18n/messages'
import { messages } from '@/i18n/messages'

// Mutable so each describe block can flip the ship-gate answer without re-importing the module.
let shipGateClosed = true
vi.mock('@/lib/ship-gate', () => ({
  SHIP_GATED_PATHS: [] as readonly string[],
  isShipGated: (path: string) => (path === '/money' ? shipGateClosed : false),
}))

// Import AFTER the mock so the component reads through it.
import { HomeMoneyTile } from './home-money-tile'

const DEFAULT_PROPS = {
  revenue: 'Rp 1,2M',
  basisLabel: 'interim — stock-movement',
  asOf: '2026-09-07T10:30:00Z',
} as const

function LocaleSwitcher({ locale }: { locale: Locale }) {
  const { setLocale } = useI18n()
  useEffect(() => { setLocale(locale) }, [locale, setLocale])
  return null
}

function renderTile(accessRoles: readonly string[], locale: Locale = 'en') {
  return render(
    <I18nProvider>
      <LocaleSwitcher locale={locale} />
      <MemoryRouter>
        <HomeMoneyTile accessRoles={accessRoles} {...DEFAULT_PROPS} />
      </MemoryRouter>
    </I18nProvider>,
  )
}

describe('AC-054: HomeMoneyTile — gate + role visibility', () => {
  describe('gate OPEN (Money is live)', () => {
    beforeEach(() => { shipGateClosed = false })

    it('renders one tile for a Finance viewer with figure, basis, as-of, and an Open Money link to /money', () => {
      renderTile(['finance'])
      // Section itself — one region per Home entry (h2 title lives inside).
      const tile = screen.getByRole('region', { name: /money/i })
      expect(tile).toBeInTheDocument()
      // The pre-formatted figure.
      expect(screen.getByText('Rp 1,2M')).toBeInTheDocument()
      // The basis qualifier (BasisChip's rendered text — a KPITile ships it as `basis.label`).
      expect(screen.getByText('interim — stock-movement')).toBeInTheDocument()
      // The as-of freshness label (FreshnessLabel formats the timestamp; the "as of" prefix is
      // the component's default, so we assert on that shape rather than on a locale-tied number).
      expect(screen.getByText(/as of/i)).toBeInTheDocument()
      // "Open Money →" links to /money — the destination is what makes the tile a door, not
      // just a display.
      const link = screen.getByRole('link', { name: /open money/i })
      expect(link).toHaveAttribute('href', '/money')
    })

    it('renders the tile for a Director (admin + manager together)', () => {
      renderTile(['admin', 'manager'])
      expect(screen.getByRole('region', { name: /money/i })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /open money/i })).toHaveAttribute('href', '/money')
    })

    it('renders the tile for a Manager alone (manager holds Revenue VIEW per ADR-0050 D8 / AC-127)', () => {
      renderTile(['manager'])
      expect(screen.getByRole('region', { name: /money/i })).toBeInTheDocument()
    })

    it('renders NOTHING for a plain member', () => {
      const { container } = renderTile(['member'])
      expect(container).toBeEmptyDOMElement()
      expect(screen.queryByRole('region', { name: /money/i })).not.toBeInTheDocument()
    })

    it('renders NOTHING for a Cafe Ops viewer (ops_lead)', () => {
      const { container } = renderTile(['ops_lead'])
      expect(container).toBeEmptyDOMElement()
    })

    it('renders NOTHING for a Sales viewer (no Revenue VIEW role held on this line)', () => {
      // Sales is a job-role identity, not an access role; a Sales viewer holding neither of the
      // revenue-view access roles must not see the tile (the RLS boundary would still refuse the
      // read, but the tile is affordance and must agree with the boundary — DD-WAY-8 / NFR-004).
      const { container } = renderTile(['sales'])
      expect(container).toBeEmptyDOMElement()
    })

    it('renders NOTHING for an admin alone (admin is users-and-settings, not a money tier — #797)', () => {
      const { container } = renderTile(['admin'])
      expect(container).toBeEmptyDOMElement()
    })

    it('renders NOTHING for an empty accessRoles set', () => {
      const { container } = renderTile([])
      expect(container).toBeEmptyDOMElement()
    })
  })

  describe('gate CLOSED (Money is not yet live)', () => {
    beforeEach(() => { shipGateClosed = true })

    it('renders NOTHING for a Finance viewer while /money is ship-gated', () => {
      const { container } = renderTile(['finance'])
      expect(container).toBeEmptyDOMElement()
    })

    it('renders NOTHING for a Manager while /money is ship-gated', () => {
      const { container } = renderTile(['manager'])
      expect(container).toBeEmptyDOMElement()
    })

    it('renders NOTHING for a Director while /money is ship-gated', () => {
      const { container } = renderTile(['admin', 'manager'])
      expect(container).toBeEmptyDOMElement()
    })

    it('renders NOTHING for a plain member while /money is ship-gated', () => {
      const { container } = renderTile(['member'])
      expect(container).toBeEmptyDOMElement()
    })
  })
})

// The new strings the tile introduces must carry BOTH locales — the parity is what makes the
// tile legible for the Indonesian floor and English admins alike. `dest.money` (the section
// title) is already both. The two NEW keys are the ones we assert on here.
describe('AC-054 (i18n): the new tile strings are catalogued in both locales', () => {
  const NEW_KEYS = ['home.money.open', 'home.money.figure'] as const

  it.each(NEW_KEYS)('en has %s', (key) => {
    const value = (messages.en as Record<string, string>)[key]
    expect(value, `messages.en['${key}']`).toBeTypeOf('string')
    expect(value.length, `messages.en['${key}'] not empty`).toBeGreaterThan(0)
  })

  it.each(NEW_KEYS)('id has %s', (key) => {
    const value = (messages.id as Record<string, string>)[key]
    expect(value, `messages.id['${key}']`).toBeTypeOf('string')
    expect(value.length, `messages.id['${key}'] not empty`).toBeGreaterThan(0)
    // A safeguard against copy-paste-and-forget: the Indonesian value must not accidentally be
    // the English one (both are short enough that a shared spelling would silently pass parity
    // without being an actual translation).
    expect(value, `id ≠ en for ${key}`).not.toBe((messages.en as Record<string, string>)[key])
  })
})

describe('AC-054 (i18n): the tile renders the Indonesian strings under locale=id', () => {
  beforeEach(() => { shipGateClosed = false })

  it('shows the Indonesian "Open Money →" for a Finance viewer', () => {
    renderTile(['finance'], 'id')
    const expected = (messages.id as Record<string, string>)['home.money.open']
    expect(screen.getByRole('link', { name: new RegExp(expected, 'i') })).toHaveAttribute('href', '/money')
  })
})
