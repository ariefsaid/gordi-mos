// The one "back to parent" control (UX-STANDARD NV2). Desktop: a text link above the page title, on
// the left edge. Phone (<768px): an icon button at the left of the top bar (44px target, name
// "Back to <parent>") so the page's work starts higher; with no top bar (sign-in) it stays inline.
// Never in the top-right primary slot. PageHead and RecordPageChrome render this same component.
// With `onClick` and no `to` it is a button (a capture page that must discard its draft before leaving).
import { createPortal } from 'react-dom'
import { Link, type To } from 'react-router-dom'
import { BackIcon } from './icons'
import { useIsDesktop } from './use-is-desktop'
import { useTopBarBackSlot } from './top-bar-back-slot'

export interface PageBackLinkProps {
  to?: To
  onClick?: () => void
  /** Already-localised label, e.g. "Back to Tasks". */
  label: string
  className?: string
}

export function PageBackLink({ to, onClick, label, className }: PageBackLinkProps) {
  const isDesktop = useIsDesktop()
  const slot = useTopBarBackSlot()
  const inBar = !isDesktop && slot !== null
  const cls = `page-back-link${inBar ? ' page-back-link--bar' : ''}${className ? ` ${className}` : ''}`
  const aria = inBar ? { 'aria-label': label, title: label } : {}
  const body = <><BackIcon />{inBar ? null : <span>{label}</span>}</>
  const el = to === undefined
    ? <button type="button" className={cls} onClick={onClick} {...aria}>{body}</button>
    : <Link to={to} className={cls} onClick={onClick} {...aria}>{body}</Link>
  return inBar ? createPortal(el, slot) : el
}
