import { useId, useState } from 'react'
import { firstName, initials } from './task-formatters'

export type OwnerCellRaciMember = { role: 'A' | 'C' | 'I'; name: string }

type OwnerCellProps = {
  /** Legacy owner rendering is retained for non-Task historical cards. */
  fullName: string
  otherCount: number
  others?: OwnerCellRaciMember[]
  /** Task rows use the typed PIC rendering and never expose the legacy +N roles. */
  variant?: 'legacy' | 'task'
}

export function OwnerCell({ fullName, otherCount, others, variant = 'legacy' }: OwnerCellProps) {
  const [open, setOpen] = useState(false)
  const tipId = useId()
  const hasDisclosure = otherCount > 0 && others != null && others.length > 0

  if (variant === 'task') {
    return (
      <div className="owner task-pic-cell" aria-label={`PIC: ${fullName}`}>
        <span className="ownav" aria-hidden="true">{initials(fullName)}</span>
        <span className="own-name">{firstName(fullName)}</span>
      </div>
    )
  }

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
              aria-label="Show other people"
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
                {others!.map((member, i) => (
                  <span key={i} className="own-tip-row">{member.name}</span>
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
