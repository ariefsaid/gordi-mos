// ReportMissingItem — a stream-scoped needs-attention item for Café item-settings managers (#1286).
// The reporter gets a direct route to the item-settings queue; nothing is filed in the Daily Log.

import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { reportMissingCafeItem } from '@/lib/db/cafe-missing-item-reports'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'
import { TextInput } from '@/components/ui/text-input'
import './report-missing-item.css'

interface ReportMissingItemProps {
  stream: ProductionStream
  streamLabel?: string
}

type ReportState = 'idle' | 'open' | 'sending' | 'sent' | 'error'

export function ReportMissingItem({ stream, streamLabel }: ReportMissingItemProps) {
  const t = useT()
  const [state, setState] = useState<ReportState>('idle')
  const [itemName, setItemName] = useState('')
  const inputId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const focusTriggerAfterCancel = useRef(false)

  // Move focus into the field on open/retry and back to the launcher after Cancel.
  useEffect(() => {
    if (state === 'open' || state === 'error') document.getElementById(inputId)?.focus()
    if (state === 'idle' && focusTriggerAfterCancel.current) {
      focusTriggerAfterCancel.current = false
      triggerRef.current?.focus()
    }
  }, [state, inputId])

  function cancel() {
    if (state === 'sending') return
    focusTriggerAfterCancel.current = true
    setItemName('')
    setState('idle')
  }

  async function send() {
    const name = itemName.trim()
    if (!name || state === 'sending') return
    setState('sending')
    try {
      await reportMissingCafeItem(stream, name)
      setState('sent')
      setItemName('')
    } catch {
      setState('error')
    }
  }

  if (state === 'sent') {
    return (
      <div className="kl-missing kl-missing-done" role="status">
        <span>{t('kitchen.log.missing.success', { stream: streamLabel ?? t('nav.cafe') })}</span>
        {' '}
        <Link to="/cafe/items">{t('kitchen.log.missing.destination')}</Link>
      </div>
    )
  }

  if (state === 'idle') {
    return (
      <p className="kl-missing">
        <button
          ref={triggerRef}
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
        id={inputId}
        label={t('kitchen.log.missing.label')}
        value={itemName}
        onChange={e => setItemName(e.target.value)}
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
        className="btn btn-outline kl-missing-cancel"
        onClick={cancel}
        disabled={state === 'sending'}
      >
        {t('common.cancel')}
      </button>
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
