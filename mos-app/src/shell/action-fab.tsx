import { useT } from '@/i18n/use-t'
import './action-fab.css'

// Quick create on a phone: one 56px floating button, bottom-right above the tab bar, that opens the
// existing actions sheet. It steps aside wherever a page shows its own bottom action bar (action-fab.css).
export function ActionFab({ onOpen }: { onOpen?: () => void }) {
  const t = useT()
  return (
    <button type="button" className="mobile-action-fab" onClick={onOpen} aria-haspopup="dialog">
      <span className="icon-name">{t('commandMenu.group.actions')}</span>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="M12 5v14M5 12h14" />
      </svg>
    </button>
  )
}
