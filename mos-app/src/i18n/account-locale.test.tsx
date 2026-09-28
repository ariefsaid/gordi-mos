// #927 — the interface language belongs to the signed-in account, never to the browser.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import type { AuthState } from '@/auth/context'
import { AuthShell } from '@/auth/auth-shell'
import { I18nProvider, useI18n } from './I18nProvider'
import { AccountLocaleProvider, useAccountLocale } from './account-locale'

vi.mock('@/auth/use-auth')
vi.mock('@/lib/db/account-locale')
import { useAuth } from '@/auth/use-auth'
import { readAccountLocale, saveAccountLocale } from '@/lib/db/account-locale'

const mockUseAuth = vi.mocked(useAuth)
const mockRead = vi.mocked(readAccountLocale)
const mockSave = vi.mocked(saveAccountLocale)

function signedIn(personId: string): AuthState {
  return {
    status: 'authenticated',
    viewer: {
      person: {
        id: personId, org_id: 'o1', user_id: `u-${personId}`, full_name: personId, email: null,
        must_change_password: false, archived_at: null, created_at: '', updated_at: '',
      },
      roles: [], isManager: false, accessRoles: [], affiliated: [],
    },
    signOut: vi.fn(),
  }
}

let save: (next: 'en' | 'id') => Promise<void>
function Probe() {
  const { locale } = useI18n()
  const account = useAccountLocale()
  save = account.save
  return <output data-testid="probe">{`${account.status}:${locale}`}</output>
}

function tree() {
  return (
    <I18nProvider>
      <AccountLocaleProvider>
        <Probe />
        <AuthShell><div /></AuthShell>
      </AccountLocaleProvider>
    </I18nProvider>
  )
}

const probe = () => screen.getByTestId('probe').textContent
const SAVED: Record<string, 'en' | 'id' | null> = { A: 'id', B: null }

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  mockRead.mockImplementation(async (personId) => SAVED[personId] ?? null)
  mockSave.mockResolvedValue(undefined)
})

describe('AccountLocaleProvider (#927)', () => {
  it('while auth is loading it shows the product default and reads nothing', () => {
    mockUseAuth.mockReturnValue({ status: 'loading' })
    render(tree())
    expect(probe()).toBe('ready:en')
    expect(mockRead).not.toHaveBeenCalled()
  })

  it('reports loading, not a value, until the signed-in account’s language is known', async () => {
    let release!: (value: 'id') => void
    mockRead.mockReturnValue(new Promise((resolve) => { release = resolve }))
    mockUseAuth.mockReturnValue(signedIn('A'))
    render(tree())
    expect(probe()).toBe('loading:en')
    await act(async () => release('id'))
    expect(probe()).toBe('ready:id')
    expect(document.documentElement.lang).toBe('id')
    expect(screen.getByText(/Hubungi admin kamu/)).toBeInTheDocument()
  })

  it('an account with no saved choice gets the product default', async () => {
    mockUseAuth.mockReturnValue(signedIn('B'))
    render(tree())
    await waitFor(() => expect(probe()).toBe('ready:en'))
    expect(mockSave).not.toHaveBeenCalled()
  })

  it('A→B in one browser restores B’s own value, and A→sign out→A reads A’s again', async () => {
    mockUseAuth.mockReturnValue(signedIn('A'))
    const view = render(tree())
    await waitFor(() => expect(probe()).toBe('ready:id'))

    mockUseAuth.mockReturnValue(signedIn('B'))
    view.rerender(tree())
    expect(probe()).toBe('loading:id') // withheld, never shown as B's value
    await waitFor(() => expect(probe()).toBe('ready:en'))

    mockUseAuth.mockReturnValue({ status: 'unauthenticated' })
    view.rerender(tree())
    mockUseAuth.mockReturnValue(signedIn('A'))
    view.rerender(tree())
    expect(probe()).toBe('loading:en')
    await waitFor(() => expect(probe()).toBe('ready:id'))
    expect(mockRead).toHaveBeenLastCalledWith('A')
  })

  it('signing out of an Indonesian account puts the sign-in screen in the product default', async () => {
    mockUseAuth.mockReturnValue(signedIn('A'))
    const view = render(tree())
    await waitFor(() => expect(screen.getByText(/Hubungi admin kamu/)).toBeInTheDocument())

    mockUseAuth.mockReturnValue({ status: 'unauthenticated' })
    view.rerender(tree())
    expect(screen.getByText('Trouble signing in? Contact your admin.')).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('en')
  })

  it('a browser-wide language key left by an older build never reaches the sign-in screen', () => {
    localStorage.setItem('mos.locale', 'id')
    mockUseAuth.mockReturnValue({ status: 'unauthenticated' })
    render(tree())
    expect(probe()).toBe('ready:en')
    expect(screen.getByText('Trouble signing in? Contact your admin.')).toBeInTheDocument()
  })

  it('save stores the value for the signed-in account and only then switches', async () => {
    mockUseAuth.mockReturnValue(signedIn('B'))
    render(tree())
    await waitFor(() => expect(probe()).toBe('ready:en'))
    await act(() => save('id'))
    expect(mockSave).toHaveBeenCalledWith('B', 'id')
    expect(probe()).toBe('ready:id')
    expect(localStorage.length).toBe(0) // nothing lands in a browser key another account reads
  })

  it('a failed save rejects and leaves the language in use unchanged', async () => {
    mockSave.mockRejectedValue(new Error('offline'))
    mockUseAuth.mockReturnValue(signedIn('B'))
    render(tree())
    await waitFor(() => expect(probe()).toBe('ready:en'))
    await expect(act(() => save('id'))).rejects.toThrow('offline')
    expect(probe()).toBe('ready:en')
  })

  it('a save that finishes after switching accounts does not restyle the next account', async () => {
    let finish!: () => void
    mockSave.mockReturnValue(new Promise((resolve) => { finish = () => resolve(undefined) }))
    mockUseAuth.mockReturnValue(signedIn('B'))
    const view = render(tree())
    await waitFor(() => expect(probe()).toBe('ready:en'))
    const pending = save('id')

    mockUseAuth.mockReturnValue(signedIn('C'))
    view.rerender(tree())
    await waitFor(() => expect(probe()).toBe('ready:en'))
    await act(async () => { finish(); await pending })
    expect(probe()).toBe('ready:en')
  })

  it('a failed read falls back to the default and says the value is unavailable', async () => {
    mockRead.mockRejectedValue(new Error('offline'))
    mockUseAuth.mockReturnValue(signedIn('A'))
    render(tree())
    await waitFor(() => expect(probe()).toBe('unavailable:en'))
  })
})
