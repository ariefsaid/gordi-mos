import { useIsOffline } from '@/shell/use-is-offline'
import { useT } from '@/i18n/use-t'
import { Notice } from './notice'

/** Why saving is unavailable while the browser is offline, said once at the top of a page or record that saves as you go (ST2). */
export function OfflineNotice() {
  const t = useT()
  if (!useIsOffline()) return null
  return <Notice tone="attention">{t('common.offline.reconnect')}</Notice>
}
