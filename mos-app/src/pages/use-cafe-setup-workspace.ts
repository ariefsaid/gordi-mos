import { useEffect, useRef, useState, type RefObject } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { useI18n } from '@/i18n/I18nProvider'
import { useT } from '@/i18n/use-t'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useIsOffline } from '@/shell/use-is-offline'
import { canAdminCafe } from '@/lib/kitchen-gates'

export function useCafeSetupWorkspace<Data>() {
  const t = useT()
  const { locale } = useI18n()
  const auth = useAuth()
  const isAdmin = auth.status === 'authenticated' && canAdminCafe(auth.viewer.accessRoles)
  const isDesktop = useIsDesktop()
  const offline = useIsOffline()
  const [params, setParams] = useSearchParams()
  const [data, setData] = useState<Data>()
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  const [dirty, setDirty] = useState(false)
  const listRef = useRef<HTMLElement>(null)
  const lastOpened = useRef<string | null>(null)

  return {
    t, locale, isAdmin, isDesktop, offline, params, setParams, data, setData,
    error, setError, retry, setRetry, dirty, setDirty, listRef, lastOpened,
  }
}

/** Focus returns to the row that opened the record (marked `[data-<attr>="key"]`), or to the list, once the record closes. */
export function useOpenerFocusReturn(attr: string, closed: boolean, lastOpened: RefObject<string | null>, listRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!closed) return
    if (lastOpened.current) {
      const opener = document.querySelector<HTMLElement>(`[data-${attr}="${CSS.escape(lastOpened.current)}"]`)
      lastOpened.current = null
      if (opener) opener.focus(); else listRef.current?.focus()
    }
  }, [attr, closed, lastOpened, listRef])
}
