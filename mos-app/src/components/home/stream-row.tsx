import { Link } from 'react-router-dom'
import type { StreamItem } from '@/lib/home-stream'
import { StatusPill } from '@/components/tasks/status-pill'
import { Reason, type ReasonStyle } from './stream-reason'

// The ONE Home record-row anatomy. Shared by HomeStream and all three layout arrangements
// (FR-930) — a Home row must never have a second implementation.
export function StreamRow({ item, hidePic = false, reasonStyle = 'chip' }: {
  item: StreamItem; hidePic?: boolean; reasonStyle?: ReasonStyle
}) {
  // Compact decision-context subline = PIC (avatar + name) · owning Team/BU · due date, so "what
  // should I do next" is answerable without opening the record (Luna J01/J02). Each segment is its
  // own span (dot separators decorative, aria-hidden) so caption + due stay addressable.
  // F16 (OD-REDESIGN-91 #28): in the "my work today" band the PIC is always the viewer — a
  // self-avatar carries zero information, so those rows suppress it. Avatars stay everywhere the
  // person varies (attention bands, mentions).
  const showPic = item.pic != null && !hidePic
  const segments = [
    item.caption && <span key="caption" className="stream-row-tail-seg">{item.caption}</span>,
    item.meta && <span key="due" className="stream-row-tail-seg">{item.meta}</span>,
  ].filter(Boolean)
  const hasMeta = showPic || segments.length > 0

  return (
    <li className="stream-row">
      <Link to={item.route} className="stream-row-link">
        <span className="stream-row-body">
          <span className="stream-row-title">{item.title}</span>
          {hasMeta && (
            <span className="stream-row-meta">
              {showPic && item.pic && (
                <span className="stream-row-pic">
                  <span className="stream-row-avatar" aria-hidden="true">{item.pic.initials}</span>
                  <span className="stream-row-pic-name">{item.pic.name}</span>
                </span>
              )}
              {segments.map((seg, i) => (
                <span key={i} className="stream-row-seg">
                  {(showPic || i > 0) && <span className="stream-row-sep" aria-hidden="true">·</span>}
                  {seg}
                </span>
              ))}
            </span>
          )}
        </span>
        <span className="stream-row-tail">
          {item.reason && <Reason reason={item.reason} style={reasonStyle} />}
          {/* F3 (design-review): Open shares no attention hierarchy with Urgent/Needs-
              attention when it's amber too — neutral treatment restores the ranking
              (rule:product-color-state-vocab, rule:product-ban-heavy-inactive-color). */}
          {item.status && <StatusPill status={item.status} openTreatment="neutral" />}
        </span>
      </Link>
    </li>
  )
}
