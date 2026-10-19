import { Link } from 'react-router-dom'
import { ArrowRightIcon } from '@/shell/icons'
import type { StreamItem } from '@/lib/home-stream'
import { StatusPill } from '@/components/tasks/status-pill'
import { Reason, type ReasonStyle } from './stream-reason'

// The ONE Home record-row anatomy shared by all arrangements.
export function StreamRow({ item, hidePic = false, reasonStyle = 'chip', actionLabel, urgent = false, featured = false }: {
  item: StreamItem
  hidePic?: boolean
  reasonStyle?: ReasonStyle
  actionLabel?: string
  urgent?: boolean
  featured?: boolean
}) {
  const showPic = item.pic != null && !hidePic
  const segments = [
    item.caption && <span key="caption" className="stream-row-tail-seg">{item.caption}</span>,
    item.meta && <span key="due" className="stream-row-tail-seg">{item.meta}</span>,
  ].filter(Boolean)
  const hasMeta = showPic || segments.length > 0
  const rowClass = `stream-row${urgent ? ' stream-row--attention' : ''}${featured ? ' stream-row--featured' : ''}`

  return (
    <li className={rowClass}>
      {/* The origin rides with navigation so Back returns to Home. */}
      <Link to={item.route} state={{ from: 'home' }} className="stream-row-link">
        <span className="stream-row-body">
          {urgent && (item.status || item.reason) ? (
            <span className="stream-row-priority">
              {item.status && <StatusPill status={item.status} openTreatment="neutral" />}
              {item.reason && <Reason reason={item.reason} style={reasonStyle} />}
            </span>
          ) : null}
          <span className="stream-row-title">{item.title}</span>
          {hasMeta && (
            <span className="stream-row-meta">
              {showPic && item.pic && <span className="stream-row-pic-name">{item.pic.name}</span>}
              {segments.map((segment, index) => (
                <span key={index} className="stream-row-seg">
                  {(showPic || index > 0) && <span className="stream-row-sep" aria-hidden="true">·</span>}
                  {segment}
                </span>
              ))}
            </span>
          )}
          {!urgent && item.reason && <span className="stream-row-reason-line"><Reason reason={item.reason} style={reasonStyle} /></span>}
        </span>
        <span className="stream-row-tail">
          {!urgent && item.status && <StatusPill status={item.status} openTreatment="neutral" />}
          {actionLabel ? (
            <span className="stream-row-action">{actionLabel}<ArrowRightIcon /></span>
          ) : !urgent ? <ArrowRightIcon className="stream-row-open-icon" /> : null}
        </span>
      </Link>
    </li>
  )
}
