import { firstName, initials } from './task-formatters'
import { useT } from '@/i18n/use-t'

type OwnerCellProps = {
  /** The task's typed PIC display name. */
  fullName: string
}

export function OwnerCell({ fullName }: OwnerCellProps) {
  const t = useT()
  return (
    <div className="owner task-pic-cell" aria-label={`${t('tasks.pic')}: ${fullName}`}>
      <span className="ownav" aria-hidden="true">{initials(fullName)}</span>
      <span className="own-name">{firstName(fullName)}</span>
    </div>
  )
}
