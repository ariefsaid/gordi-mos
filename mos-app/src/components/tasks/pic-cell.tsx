import { firstName, initials } from './task-formatters'
import { useT } from '@/i18n/use-t'

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
    <div className="owner task-pic-cell" aria-label={label}>
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
