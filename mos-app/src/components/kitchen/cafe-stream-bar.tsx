// CafeStreamBar — the Café module's page-head stream affordance.
//
// #781 / DESIGN.md § Compact capture row A2 introduced the STATEMENT + text-link switch
// grammar (`mode: 'statement'`, kitchen-log-page's use) — text in the head, a picker of
// producing streams the person may write to. Callers that have not adopted it (plan / stock /
// review / pushes, in this branch) still see the legacy `<Select>`, which is fine for those
// surfaces until they run the same design change. Both modes route through this file, so the
// six surfaces still agree about naming and options.
//
// THE NAMING RULE (CONTEXT.md, Production stream; #238 owner ruling): a stream is named by its
// branch's CANONICAL catalog name — never the 'Bungur' display alias, which names a transfer
// DESTINATION and the derived action label, and never "HQ"/"Stok HQ" for the central kitchen
// (that collides with the GHQ branch, FR-061).

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Select } from '@/components/ui/select'
import { streamKey, streamLabel } from '@/lib/kitchen-action-label'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'
import { useT } from '@/i18n/use-t'
import './cafe-stream-bar.css'

/** Sentinel option value for the cross-stream view — never a stream key (those carry a '|'). */
export const ALL_STREAMS = 'all'

export interface CafeStreamBarProps {
  /** The enumerable stream catalog (FR-005). Empty while it loads — legacy mode disables the
   *  select; statement mode simply renders no switch. */
  options?: readonly ProductionStream[]
  /** The stream in view; null = none resolved yet, so the surface asks for an explicit choice. */
  stream: ProductionStream | null
  /** Omit on a surface that cannot switch — it then STATES its stream and offers no control. */
  onChange?: (next: ProductionStream) => void
  /** This surface is reading every stream at once (the outbox; the review queue's 'all'). */
  allStreams?: boolean
  /** Offer "All streams" as a choice. Review only — the one surface with a cross-stream job. */
  onAllStreams?: () => void
  disabled?: boolean
  /**
   * Rendering mode. `select` (default) is the legacy `<Select>` other Café surfaces still use.
   * `statement` is the #781 / A2 grammar the capture list opts into: statement text plus a
   * text-link picker of producing streams, no placeholder ever.
   */
  mode?: 'select' | 'statement'
}

export function CafeStreamBar(props: CafeStreamBarProps) {
  return props.mode === 'statement'
    ? <StatementBar {...props} />
    : <SelectBar {...props} />
}

// ── Legacy select mode (#440 grammar). Retained for surfaces that have not adopted A2 yet.
function SelectBar({
  options,
  stream,
  onChange,
  allStreams = false,
  onAllStreams,
  disabled = false,
}: CafeStreamBarProps) {
  const t = useT()
  const value = allStreams ? ALL_STREAMS : stream ? streamKey(stream.branch.id, stream.activity) : ''
  const optionList = options ?? []
  return (
    <div className="cafe-stream" data-testid="cafe-stream">
      <span className="cafe-stream__label">{t('cafe.stream.label')}</span>
      {onChange ? (
        <Select
          className="cafe-stream__select"
          aria-label={t('kitchen.log.stream.pickerAria')}
          value={value}
          disabled={disabled || optionList.length === 0}
          onChange={e => {
            if (e.target.value === ALL_STREAMS) {
              onAllStreams?.()
              return
            }
            const next = optionList.find(s => streamKey(s.branch.id, s.activity) === e.target.value)
            if (next) onChange(next)
          }}
        >
          {value === '' && <option value="" disabled>{t('kitchen.log.stream.pickerAria')}</option>}
          {onAllStreams && <option value={ALL_STREAMS}>{t('kitchen.review.allStreams')}</option>}
          {optionList.map(s => (
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

// ── Statement mode (#781 / DESIGN.md § Compact capture row A2). The stream is TEXT; the
// switch, where the caller admits one, is a text-link button that opens a listbox of the
// producing streams handed in `options`.
function StatementBar({
  stream,
  options,
  onChange,
  allStreams = false,
  onAllStreams,
}: CafeStreamBarProps) {
  const t = useT()
  const rendersSwitch = onChange != null && (options?.length ?? 0) > 1
  const rendersAllStreamsChoice = onAllStreams != null
  const rendersPicker = rendersSwitch || rendersAllStreamsChoice
  const menuId = useId()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    function onDoc(event: MouseEvent) {
      const target = event.target as Node
      if (menuRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      close()
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        close()
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])

  const statement = allStreams ? t('kitchen.review.allStreams') : streamLabel(t, stream)

  return (
    <div className="cafe-stream" data-testid="cafe-stream">
      <span className="cafe-stream__label">{t('cafe.stream.label')}</span>
      <span className="cafe-stream__value">{statement}</span>
      {rendersPicker && (
        <div className="cafe-stream__switch">
          <button
            ref={triggerRef}
            type="button"
            className="cafe-stream__switch-link"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={t('kitchen.log.stream.pickerAria')}
            onClick={() => setOpen(o => !o)}
          >
            {t('kitchen.log.stream.switch')}
          </button>
          {open && (
            <div
              ref={menuRef}
              id={menuId}
              role="listbox"
              className="cafe-stream__menu"
              aria-label={t('kitchen.log.stream.pickerAria')}
            >
              {rendersAllStreamsChoice && (
                <button
                  type="button"
                  role="option"
                  aria-selected={allStreams}
                  className="cafe-stream__option"
                  onClick={() => {
                    onAllStreams?.()
                    close()
                  }}
                >
                  {t('kitchen.review.allStreams')}
                </button>
              )}
              {(options ?? []).map(s => {
                const key = streamKey(s.branch.id, s.activity)
                const active = !allStreams && stream
                  ? streamKey(stream.branch.id, stream.activity) === key
                  : false
                return (
                  <button
                    key={key}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className="cafe-stream__option"
                    onClick={() => {
                      onChange?.(s)
                      close()
                    }}
                  >
                    {streamLabel(t, s)}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
