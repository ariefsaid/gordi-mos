// AC-014 — the auth chrome names a role, never a person.
//
// A name in the login footer is an identity a signed-out stranger can read off the screen, and it
// goes stale the moment the person behind it changes. The sweep below is the half a wording test
// cannot do on its own: it reads every auth string in both locales and fails on a human name.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('./use-auth')
import { useAuth } from './use-auth'

import { AuthShell } from './auth-shell'
import { OrphanScreen } from './orphan-screen'
import { messages } from '@/i18n/messages'
import { I18nProvider } from '@/i18n/I18nProvider'

const mockUseAuth = vi.mocked(useAuth)

describe('AC-014: auth chrome names a role', () => {
  it('the shell footer reads Contact your admin', () => {
    render(<AuthShell><div /></AuthShell>)
    expect(screen.getByText(/Trouble signing in\? Contact your admin\./)).toBeInTheDocument()
    expect(screen.getByText(/^v0\.11\.0 · web/)).toBeInTheDocument()
  })

  it('the orphan screen body reads Contact your admin', () => {
    mockUseAuth.mockReturnValue({ status: 'orphan', signOut: vi.fn() })
    render(<OrphanScreen />)
    expect(
      screen.getByText(/Contact your admin to get set up\./),
    ).toBeInTheDocument()
  })

  it('the Indonesian catalog says Hubungi admin kamu on both', () => {
    expect(messages.id['auth.footer']).toContain('Hubungi admin kamu')
    expect(messages.id['auth.orphan.body']).toContain('Hubungi admin kamu')
  })

  it('renders the Indonesian footer when the catalog is switched to id', () => {
    render(<I18nProvider initialLocale="id"><AuthShell><div /></AuthShell></I18nProvider>)
    expect(screen.getByText(/Hubungi admin kamu/)).toBeInTheDocument()
  })

  // The dev personas are fictional and DEV-gated, so the sweep is over the shipped catalog.
  it('no auth catalog string names a person', () => {
    const names = /\b(Arden|Dewi|Cahya|Krishna|Kartika|Sinta|Rama|Sari|Fitri)\b/
    const offenders: string[] = []
    for (const locale of ['en', 'id'] as const) {
      const catalog = messages[locale] as Record<string, string>
      for (const [key, value] of Object.entries(catalog)) {
        if (key.startsWith('auth.') && names.test(value)) offenders.push(`${locale}:${key}`)
      }
    }
    expect(offenders, `auth strings naming a person: ${offenders.join(', ')}`).toEqual([])
  })

})
