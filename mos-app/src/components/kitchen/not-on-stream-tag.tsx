import { Tag } from '@/components/ui/tag'
import { useT } from '@/i18n/use-t'

/** Names an item that is not on the current stream's item list (#222). */
export function NotOnStreamTag() {
  const t = useT()
  return <Tag color="gray">{t('kitchen.item.notOnStream')}</Tag>
}
