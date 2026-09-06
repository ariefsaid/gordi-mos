import { firstName, initials } from './task-formatters'
import { useT } from '@/i18n/use-t'

export type PersonCellProps = {
  fullName: string
  /** Accessible-name prefix for the cell (e.g. the PIC label). Absent → the avatar is decorative
   *  and the first name is the accessible text. */
  label?: string
}

/**
 * The ONE person-cell grammar (DESIGN § Data Table A2): initials avatar + first name. Full names
 * belong to the record and to pickers — two person columns in one row never use two grammars.
 */
export function PersonCell({ fullName, label }: PersonCellProps) {
  return (
    // `title` carries the full name as a hover tooltip — the sole name affordance in the
    // condensed (drawer-open split) tier where the row renders the avatar only (owner-eyes item 3).
    <div className="owner" title={fullName} aria-label={label ? `${label}: ${fullName}` : undefined}>
      <span className="ownav" aria-hidden="true">{initials(fullName)}</span>
      <span className="own-name">{firstName(fullName)}</span>
    </div>
  )
}
type PicCellProps = {
  /** The task's typed PIC display name. */
  fullName: string
  /**
   * Design fix wave item 4 (OD-65 mockup regression) — the generated-ownership source: the NAME
   * of the Role the task's generating def bound the PIC through (e.g. "Cafe Ops Lead"). Only
   * given for occurrence-grouped rows whose def binds a pic_role; omitted for ad-hoc Tasks and
   * person-bound defs (no regression to the plain PIC display).
   */
  provenance?: string
}

/**
 * The typed PIC display cell (V3 Issue 6: renamed from the legacy `OwnerCell` primitive — no
 * `OwnerCell`/owner label crosses the Task collection UI contract; PIC is the person expected to
 * perform and close the Task).
 */
export function PicCell({ fullName, provenance }: PicCellProps) {
  const t = useT()
  const label = provenance
    ? `${t('tasks.pic')}: ${fullName} (${t('tasks.pic.via', { role: provenance })})`
    : `${t('tasks.pic')}: ${fullName}`
  return (
    // `title` carries the full PIC name as a hover tooltip — the sole name affordance in the
    // condensed (drawer-open split) tier where the row renders the avatar only (owner-eyes item 3).
    <div className="owner task-pic-cell" aria-label={label} title={fullName}>
      <span className="ownav" aria-hidden="true">{initials(fullName)}</span>
      {provenance ? (
        <span className="owner-name-stack">
          <span className="own-name">{firstName(fullName)}</span>
          <span className="owner-provenance">{t('tasks.pic.via', { role: provenance })}</span>
        </span>
      ) : (
        <span className="own-name">{firstName(fullName)}</span>
      )}
    </div>
  )
}
