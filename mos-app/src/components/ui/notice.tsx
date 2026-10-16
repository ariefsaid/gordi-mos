// Notice — the ONE page-level banner: icon + text + an optional link or action. Every banner in the
// app (offline lines, load errors, "held" notes, sign-in warnings, Money exceptions) renders this; no
// area draws its own. Tone follows the shared status map (status-badge.tsx): info = FYI, attention =
// Needs attention, urgent = Urgent, success = Done. Left-aligned in the content track, never centred.
// `role` defaults by tone (urgent = alert, the rest = status, a polite live region); pass `role="none"`
// for a notice that is plain page content, not a message about something that just happened.
import type { ReactNode } from 'react'
import { STATUS_MAP, type StatusKey } from './status-badge'
import './notice.css'

type NoticeTone = 'info' | 'attention' | 'urgent' | 'success'

const TONE_STATUS: Record<NoticeTone, StatusKey> = {
  info: 'fyi', attention: 'needsAttention', urgent: 'urgent', success: 'done',
}

export interface NoticeProps {
  tone: NoticeTone
  children: ReactNode
  /** A link or button after the text ("Retry", "Undo", "Open branch"). */
  action?: ReactNode
  role?: 'alert' | 'status' | 'none'
  /** Drop the leading icon (compact inline use). Default shows it. */
  icon?: boolean
  id?: string
  className?: string
  'aria-label'?: string
  'aria-live'?: 'off' | 'polite' | 'assertive'
  'data-testid'?: string
  /** Attach to the notice element (focus management after an action). */
  tabIndex?: number
  ref?: React.Ref<HTMLDivElement>
}

const PATHS: Record<NoticeTone, ReactNode> = {
  info: <><circle cx="10" cy="10" r="7.5" /><path d="M10 9v5M10 6.2v.1" /></>,
  attention: <><path d="M10 2.8 18 16.5H2L10 2.8Z" /><path d="M10 8v4M10 14.2v.1" /></>,
  urgent: <><circle cx="10" cy="10" r="7.5" /><path d="M10 6v5M10 13.8v.1" /></>,
  success: <><circle cx="10" cy="10" r="7.5" /><path d="m6.6 10.2 2.4 2.4 4.4-4.9" /></>,
}

export function Notice({ tone, children, action, role, icon = true, id, className, ref, tabIndex, ...aria }: NoticeProps) {
  const pillTone = STATUS_MAP[TONE_STATUS[tone]].tone
  const resolvedRole = role ?? (tone === 'urgent' ? 'alert' : 'status')
  return (
    <div
      ref={ref}
      id={id}
      tabIndex={tabIndex}
      role={resolvedRole === 'none' ? undefined : resolvedRole}
      className={`notice notice--${pillTone}${className ? ` ${className}` : ''}`}
      data-tone={tone}
      {...aria}
    >
      {icon && (
        <svg className="notice__icon" aria-hidden="true" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          {PATHS[tone]}
        </svg>
      )}
      <div className="notice__text">{children}</div>
      {action ? <div className="notice__action">{action}</div> : null}
    </div>
  )
}
