import { useLocation } from 'react-router-dom'
import { useIsNarrow } from './use-is-narrow'
import { useT } from '@/i18n/use-t'

/**
 * The way back from a Work collection (Tasks, Signals, Projects & Processes, Objectives) to the
 * Work directory, shown on a phone only (desktop reaches every collection from the rail). It goes in
 * the page head's one back-link slot; undefined elsewhere.
 */
export function useWorkHomeBack(): { to: string; label: string } | undefined {
  const isNarrow = useIsNarrow()
  const { pathname } = useLocation()
  const t = useT()
  if (!isNarrow || pathname === '/work') return undefined
  return { to: '/work', label: t('record.backToCollection', { collection: t('dest.work') }) }
}
