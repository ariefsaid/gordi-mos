import { Link } from 'react-router-dom'
import type { StreamItem } from '@/lib/home-stream'
import { StatusPill } from '@/components/tasks/status-pill'
import { Reason, type ReasonStyle } from './stream-reason'

// The ONE Home record-row anatomy. Shared by HomeStream and all three layout arrangements
// (FR-930) — a Home row must never have a second implementation.
export function StreamRow({ item, hidePic = false, reasonStyle = 'chip' }: {
  item: StreamItem; hidePic?: boolean; reasonStyle?: ReasonStyle
}) {
  // Compact decision-context subline = PIC name · owning Team/BU · due date, so "what should I do
  // next" is answerable without opening the record (Luna J01/J02). Each segment is its own span
  // (dot separators decorative, aria-hidden) so caption + due stay addressable.
  // The person is their NAME — no initials disc (owner, 2026-07-28: "remove the profile icon for
  // the person's initial. just use the name"; the signed mockup carries it too). The name is the
  // meta line's anchor and takes the emphasis the disc used to supply.
  // F16 (OD-REDESIGN-91 #28): in the "my work today" band the PIC is always the viewer — naming
  // yourself on every one of your own rows carries zero information, so those rows suppress it.
  // The name stays everywhere the person varies (attention bands, mentions).
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
                <span className="stream-row-pic-name">{item.pic.name}</span>
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
