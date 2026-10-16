import type { ReactNode } from 'react'
import type { PageFamily, PageFamilyState } from './page-families'
import { PageFrame } from './page-frame'
import { PageHead } from './page-head'
import { useState } from 'react'
import type { To } from 'react-router-dom'
import { ActionBar } from '@/components/ui/action-bar'
import { useIsDesktop } from './use-is-desktop'
import { PhoneActionBarContext } from './page-action-bar'
import { useT } from '@/i18n/use-t'
import './page-action-bar.css'

export interface PageFamilyFrameProps {
  family: PageFamily
  title: string
  subtitle?: string
  /** Optional because a head carrying a `statusRow` DISCARDS it (PageHead: the two are mutually
   *  exclusive full-width rows and the header's budget is one of them). Home is such a head — it
   *  used to pass a sentence that could never render, which reads to the next maintainer as if the
   *  sentence were live. A head without a status row still wants one. */
  jobSentence?: string
  // #958: passthrough to PageHead.titleHelp.
  titleHelp?: ReactNode
  count?: number | string | null
  meta?: ReactNode
  action?: ReactNode
  /** Why the primary action is disabled; sits next to the button (head on desktop, action bar on phone). */
  actionReason?: ReactNode
  /** Full-width row below the title row, inside the same header block (see PageHead.statusRow).
   *  A head that carries one is rendered compact so the block keeps its ~70px budget. */
  statusRow?: ReactNode
  /** The one way back to the parent page: above the title, left edge (NV2). */
  back?: { to?: To; onClick?: () => void; label: string }
  /** The one freshness line under the subtitle. */
  freshness?: ReactNode
  state?: PageFamilyState
  surfaceWash?: boolean
  /**
   * P1-2 (Luna-measured y≈234 vs E7's y≈124): opt-in — skip the shared PageHead entirely. For a
   * tenant whose own typed content already supplies the ONE page heading, the generic shell
   * PageHead (h1 type-label + jobSentence prose) is pure duplication above it, not a second
   * landmark anything relies on — ContextRow's "who owns the job sentence" suppression is keyed
   * off the ROUTE registry (page-family-migration.ts), not whether PageHead itself rendered, so
   * hiding it here never resurrects a duplicate ContextRow sentence. Defaults false so every other
   * PageFamilyFrame caller (workspace/management, and focused-record pages that still want the
   * generic head) is byte-for-byte unchanged. (This shared frame stays family-agnostic — no
   * specific tenant renderer named here — per the page-family migration guard.)
   */
  hideHead?: boolean
  /** Passthrough to PageHead.headClassName — per-head opt-in modes of the shared grammar. */
  headClassName?: string
  /** Phone: the head's primary `action` moves out of the head into the shared bottom action bar
   *  (UX-STANDARD AC2); desktop keeps it top-right in the head. Default on; pass false only when
   *  the `action` is not the page's primary. */
  phoneActionBar?: boolean
  children: ReactNode
}

export function PageFamilyFrame({
  family,
  title,
  subtitle,
  jobSentence,
  titleHelp,
  count,
  meta,
  action,
  actionReason,
  statusRow,
  back,
  freshness,
  state = 'default',
  surfaceWash,
  hideHead = false,
  headClassName,
  phoneActionBar = true,
  children,
}: PageFamilyFrameProps) {
  const t = useT()
  const isDesktop = useIsDesktop()
  const [barEl, setBarEl] = useState<HTMLElement | null>(null)
  const phone = !isDesktop
  const barAction = phoneActionBar && phone && action ? action : null

  const content = <>
    {!hideHead && (
      <PageHead
        family={family}
        title={title}
        subtitle={subtitle}
        jobSentence={jobSentence}
        titleHelp={titleHelp}
        count={count}
        meta={meta}
        action={barAction ? undefined : action}
        actionReason={barAction ? undefined : actionReason}
        statusRow={statusRow}
        back={back}
        freshness={freshness}
        headClassName={headClassName}
      />
    )}
    {children}
  </>
  return (
    <PhoneActionBarContext.Provider value={phone ? (barEl ?? 'pending') : null}>
      <PageFrame family={family} state={state} variant="data" surfaceWash={surfaceWash}>{content}</PageFrame>
      {phone ? <div ref={setBarEl} role="region" aria-label={t('shell.pageActions')} className="page-action-bar" data-testid="page-action-bar" /> : null}
      {barAction && barEl ? <ActionBar primary={barAction} reason={actionReason} /> : null}
    </PhoneActionBarContext.Provider>
  )
}
