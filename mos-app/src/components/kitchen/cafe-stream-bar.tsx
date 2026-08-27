// CafeStreamBar — the ONE way a Café surface says which production stream it is showing,
// and (where switching applies) the ONE way it is switched (#440).
//
// Lifted from the capture surface's own picker (kitchen-log-page's `kl-scope-stream`), which
// is the grammar this module already shipped and the review queue already copied: a single
// <Select> over the ENUMERATED stream catalog (FR-003/005, OD-WAY-42). Not the branch ×
// activity pair the stock/plan surfaces grew separately — that cross-product can offer a pair
// that is not a stream at all (the roastery is a branch and never a stream), and two 44px
// selects do not fit a page head on a phone. The pair implementation (StreamScopePicker) was
// deleted when its last caller adopted this one: two implementations of one grammar is how the
// two surfaces came to disagree in the first place (#238), and re-authoring a shipped grammar
// is the failure #283 is open about.
//
// It renders in the page head (PageFamilyFrame `statusRow`), not in the toolbar, because it is
// not a filter over the list — it names which books the whole surface is written in. Per the
// shared head's contract a status row REPLACES the static job sentence, which is the right
// trade here: "Rumah Rames · Kitchen" answers "what am I looking at" better than "Run today's
// café floor work" does, and #440 exists because that question had no answer at all.
//
// THE NAMING RULE (CONTEXT.md, Production stream; #238 owner ruling): a stream is named by its
// branch's CANONICAL catalog name — never the 'Bungur' display alias, which names a transfer
// DESTINATION and the derived action label, and never "HQ"/"Stok HQ" for the central kitchen
// (that collides with the GHQ branch, FR-061).

import { Select } from '@/components/ui/select'
import { streamKey, streamLabel } from '@/lib/kitchen-action-label'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'
import { useT } from '@/i18n/use-t'
import './cafe-stream-bar.css'

/** Sentinel option value for the cross-stream view — never a stream key (those carry a '|'). */
export const ALL_STREAMS = 'all'

export interface CafeStreamBarProps {
  /** The enumerable stream catalog (FR-005). Empty while it loads — the control disables. */
  options: readonly ProductionStream[]
  /** The stream in view; null = none resolved yet, so the surface asks for an explicit choice. */
  stream: ProductionStream | null
  /** Omit on a surface that cannot switch — it then STATES its stream and offers no control. */
  onChange?: (next: ProductionStream) => void
  /** This surface is reading every stream at once (the outbox; the review queue's 'all'). */
  allStreams?: boolean
  /** Offer "All streams" as a choice. Review only — the one surface with a cross-stream job. */
  onAllStreams?: () => void
  disabled?: boolean
}

export function CafeStreamBar({
  options,
  stream,
  onChange,
  allStreams = false,
  onAllStreams,
  disabled = false,
}: CafeStreamBarProps) {
  const t = useT()
  const value = allStreams ? ALL_STREAMS : stream ? streamKey(stream.branch.id, stream.activity) : ''

  return (
    <div className="cafe-stream" data-testid="cafe-stream">
      <span className="cafe-stream__label">{t('cafe.stream.label')}</span>
      {onChange ? (
        <Select
          className="cafe-stream__select"
          aria-label={t('kitchen.log.stream.pickerAria')}
          value={value}
          disabled={disabled || options.length === 0}
          onChange={e => {
            if (e.target.value === ALL_STREAMS) {
              onAllStreams?.()
              return
            }
            const next = options.find(s => streamKey(s.branch.id, s.activity) === e.target.value)
            if (next) onChange(next)
          }}
        >
          {/* No default (FR-002) — the placeholder holds the empty value until a choice is made */}
          {value === '' && <option value="" disabled>{t('kitchen.log.stream.choose')}</option>}
          {onAllStreams && <option value={ALL_STREAMS}>{t('kitchen.review.allStreams')}</option>}
          {options.map(s => (
            <option key={streamKey(s.branch.id, s.activity)} value={streamKey(s.branch.id, s.activity)}>
              {streamLabel(t, s)}
            </option>
          ))}
        </Select>
      ) : (
        <span className="cafe-stream__value">
          {allStreams ? t('kitchen.review.allStreams') : streamLabel(t, stream)}
        </span>
      )}
    </div>
  )
}
