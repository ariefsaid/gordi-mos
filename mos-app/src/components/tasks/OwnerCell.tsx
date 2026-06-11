import { firstName, initials } from './taskFormatters'

type OwnerCellProps = {
  fullName: string
  otherCount: number
}

export function OwnerCell({ fullName, otherCount }: OwnerCellProps) {
  return (
    <div className="owner">
      <span className="ownav" aria-hidden="true">{initials(fullName)}</span>
      <span className="own-name">{firstName(fullName)}</span>
      {otherCount > 0 && <span className="own-more">+{otherCount}</span>}
    </div>
  )
}
