import { useId, useState } from 'react'
import { firstName, initials } from './task-formatters'

export type OwnerCellRaciMember = { role: 'A' | 'C' | 'I'; name: string }

type OwnerCellProps = {
  fullName: string
  otherCount: number
  /** When provided, the "+N" becomes an accessible disclosure listing the other
   *  RACI members (A/C/I) as a read-only tooltip on hover/focus (AC-130, FR-128).
   *  Absent → the "+N" stays a plain non-interactive badge (backward compatible). */
  others?: OwnerCellRaciMember[]
}

export function OwnerCell({ fullName, otherCount, others }: OwnerCellProps) {
  const [open, setOpen] = useState(false)
  const tipId = useId()
  const hasDisclosure = otherCount > 0 && others != null && others.length > 0

  return (
    <div className="owner">
      <span className="ownav" aria-hidden="true">{initials(fullName)}</span>
      <span className="own-name">{firstName(fullName)}</span>
      {otherCount > 0 && (
        hasDisclosure ? (
          <span className="own-more-wrap">
            <button
              type="button"
              className="own-more own-more-btn"
              aria-label="Show other RACI members"
              aria-describedby={open ? tipId : undefined}
              aria-expanded={open}
              onFocus={() => setOpen(true)}
              onBlur={() => setOpen(false)}
              onMouseEnter={() => setOpen(true)}
              onMouseLeave={() => setOpen(false)}
            >
              +{otherCount}
            </button>
            {open && (
              <span role="tooltip" id={tipId} className="own-tip">
                {others!.map((m, i) => (
                  <span key={i} className="own-tip-row">{`${m.role} · ${m.name}`}</span>
                ))}
              </span>
            )}
          </span>
        ) : (
          <span className="own-more">+{otherCount}</span>
        )
      )}
    </div>
  )
}
