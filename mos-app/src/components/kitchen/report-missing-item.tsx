// ReportMissingItem — the DD-WAY-29 exit route (FR-012, AC-013).
//
// The capture form's item list is gated: an item-unit with unconfirmed ERP coordinates is
// ABSENT, not disabled or warned. That gate has a human cost — a member who genuinely makes
// the item sees nothing and must never read the absence as a bug with no exit — so the
// capture surface carries a visible route to report it.
//
// Smallest honest implementation: the report is a Daily Log entry (ops.log_entries) flagged
// needs_attention, filed under the same Café BU as the capture itself — the cheapest existing
// in-app mechanism that already reaches the reviewer surfaces (no new table, no new channel).

import { useState } from 'react'
import { useT } from '@/i18n/use-t'
import { addLogEntry } from '@/lib/db/ops-log'
import { TextInput } from '@/components/ui/text-input'
import './report-missing-item.css'

interface ReportMissingItemProps {
  /** The Café BU the capture surface itself files under (already resolved by the page). */
  businessUnitId: string
  /** Optional stream context ("Rumah Rames / kitchen") carried into the report detail. */
  streamLabel?: string
}

type ReportState = 'idle' | 'open' | 'sending' | 'sent' | 'error'

export function ReportMissingItem({ businessUnitId, streamLabel }: ReportMissingItemProps) {
  const t = useT()
  const [state, setState] = useState<ReportState>('idle')
  const [itemName, setItemName] = useState('')

  async function send() {
    const name = itemName.trim()
    if (!name || state === 'sending') return
    setState('sending')
    try {
      await addLogEntry({
        businessUnitId,
        eventType: 'follow_up',
        // Stored data, not UI copy — deliberately not localised, like every other stored title.
        title: `Missing item on the capture form: ${name}`,
        detail: `Reported from the capture form${streamLabel ? ` (${streamLabel})` : ''}. The item is not offerable until its ERP coordinates are confirmed.`,
        needsAttention: true,
      })
      setState('sent')
      setItemName('')
    } catch {
      setState('error')
    }
  }

  if (state === 'sent') {
    return (
      <p className="kl-missing kl-missing-done" role="status">
        {t('kitchen.log.missing.success')}
      </p>
    )
  }

  if (state === 'idle') {
    return (
      <p className="kl-missing">
        <button
          type="button"
          className="btn btn-ghost kl-missing-cta"
          onClick={() => setState('open')}
        >
          {t('kitchen.log.missing.cta')}
        </button>
      </p>
    )
  }

  return (
    <div className="kl-missing kl-missing-form">
      {state === 'error' && (
        <p className="kl-missing-error" role="alert">{t('kitchen.log.missing.error')}</p>
      )}
      <TextInput
        label={t('kitchen.log.missing.label')}
        value={itemName}
        onChange={e => setItemName(e.target.value)}
        // The component may render INSIDE the capture <form>; Enter must send the report,
        // never submit (or be swallowed by) the surrounding capture form.
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void send()
          }
        }}
        disabled={state === 'sending'}
        fullWidth
      />
      <button
        type="button"
        className="btn btn-outline kl-missing-send"
        onClick={() => void send()}
        disabled={state === 'sending' || !itemName.trim()}
      >
        {t('kitchen.log.missing.submit')}
      </button>
    </div>
  )
}
