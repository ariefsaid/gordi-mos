import { useT } from '@/i18n/use-t'
import './task-private-lock.css'

/** The small padlock that marks a private Task in a list; spoken as "Private task". */
export function PrivateLock({ className }: { className?: string }) {
  const t = useT()
  return (
    <svg
      className={className ?? 'task-private-lock'}
      role="img"
      aria-label={t('tasks.private.lock')}
      width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"
    >
      <title>{t('tasks.private.lock')}</title>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  )
}
