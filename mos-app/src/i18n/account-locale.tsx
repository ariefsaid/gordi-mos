/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState } from 'react'
import { useAuth } from '@/auth/use-auth'
import { readAccountLocale, saveAccountLocale } from '@/lib/db/account-locale'
import { DEFAULT_LOCALE, useI18n } from './I18nProvider'
import type { Locale } from './messages'

/**
 * AccountLocaleProvider (#927) — the interface language belongs to the signed-in account.
 *
 * Signed out: the product default. Signed in: the account's saved choice, or the default when it
 * never chose one. `status` is `loading` until that account's value is known (ProtectedRoute holds
 * the app behind its loading state meanwhile, so no screen renders in another account's language),
 * and `unavailable` when the read failed and the default is standing in. `save` resolves only after
 * the value is stored, and only then changes the language.
 */
export type AccountLocaleStatus = 'loading' | 'ready' | 'unavailable'

type AccountLocaleValue = {
  status: AccountLocaleStatus
  save: (next: Locale) => Promise<void>
}

const AccountLocaleContext = createContext<AccountLocaleValue>({
  status: 'ready',
  save: () => Promise.reject(new Error('AccountLocaleProvider is not mounted')),
})

export function AccountLocaleProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth()
  const { setLocale } = useI18n()
  const personId = auth.status === 'authenticated' ? auth.viewer.person.id : null
  const [resolved, setResolved] = useState<{ personId: string; status: 'ready' | 'unavailable' } | null>(null)
  // The account on screen now: a save that finishes after a switch must not restyle the next one.
  const currentPersonId = useRef(personId)

  // Layout effect: signing out resets the language before the sign-in screen paints.
  useLayoutEffect(() => {
    currentPersonId.current = personId
    if (!personId) {
      setLocale(DEFAULT_LOCALE)
      setResolved(null) // the next sign-in, even by the same account, reads its value afresh
      return
    }
    let cancelled = false
    readAccountLocale(personId).then(
      (saved) => {
        if (cancelled) return
        setLocale(saved ?? DEFAULT_LOCALE)
        setResolved({ personId, status: 'ready' })
      },
      () => {
        if (cancelled) return
        setLocale(DEFAULT_LOCALE)
        setResolved({ personId, status: 'unavailable' })
      },
    )
    return () => {
      cancelled = true
    }
  }, [personId, setLocale])

  const save = useCallback(async (next: Locale) => {
    if (!personId) throw new Error('No signed-in account')
    await saveAccountLocale(personId, next)
    if (currentPersonId.current !== personId) return
    setLocale(next)
    setResolved({ personId, status: 'ready' })
  }, [personId, setLocale])

  const status: AccountLocaleStatus =
    personId === null ? 'ready' : resolved?.personId === personId ? resolved.status : 'loading'

  return <AccountLocaleContext.Provider value={{ status, save }}>{children}</AccountLocaleContext.Provider>
}

export function useAccountLocale(): AccountLocaleValue {
  return useContext(AccountLocaleContext)
}
