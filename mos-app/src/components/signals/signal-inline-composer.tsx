import { useCallback, useEffect, useRef, useState } from 'react'
import { useT } from '@/i18n/use-t'
import { IconButton } from '@/components/ui/icon-button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { CloseIcon } from '@/shell/icons'
import { RouteLeaveGuard } from '@/shell/route-leave-guard'
import type { SignalComposerPrefill } from '@/shell/signal-composer-host'
import { loadMentionRosters, type MentionRosters } from '@/lib/db/signals'
import { SignalComposer } from './signal-composer'
import './signal-inline-composer.css'

const EMPTY_ROSTERS: MentionRosters = { teamMembers: {}, buMembers: {} }

/**
 * The Signals page's own composer: capture above the list instead of a blocking dialog, so the
 * collection stays in view and in reach while the Signal is written. Closing a draft asks first.
 */
export function SignalInlineComposer({
  authorId, authorName, canTag, prefill, onShared, onClose,
}: {
  authorId: string
  authorName: string
  canTag: boolean
  prefill?: SignalComposerPrefill
  onShared: () => void
  onClose: () => void
}) {
  const t = useT()
  const [rosters, setRosters] = useState<MentionRosters>(EMPTY_ROSTERS)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [dirty, setDirty] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Mention rosters feed the "notify N" preview; a failed load degrades to an under-count and never blocks capture.
  useEffect(() => {
    let cancelled = false
    loadMentionRosters()
      .then((next) => { if (!cancelled) setRosters(next) })
      .catch(() => { if (!cancelled) setRosters(EMPTY_ROSTERS) })
    return () => { cancelled = true }
  }, [])
  useEffect(() => { textareaRef.current?.focus() }, [])

  const requestClose = useCallback(() => {
    if (dirty) setDiscardOpen(true)
    else onClose()
  }, [dirty, onClose])

  return (
    <section
      className="signal-inline-composer"
      aria-labelledby="signal-inline-composer-title"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented || discardOpen) return
        event.stopPropagation()
        requestClose()
      }}
    >
      <RouteLeaveGuard when={dirty} message={t('signals.composer.discardBody')} />
      <div className="signal-inline-composer__head">
        <h2 id="signal-inline-composer-title" className="signal-inline-composer__title">{t('signals.action.share')}</h2>
        <IconButton variant="tertiary" ariaLabel={t('signals.composer.close')} onClick={requestClose}>
          <CloseIcon />
        </IconButton>
      </div>
      <SignalComposer
        authorId={authorId}
        authorName={authorName}
        canTag={canTag}
        canMentionBu={canTag}
        teamMembers={rosters.teamMembers}
        buMembers={rosters.buMembers}
        onShared={onShared}
        onDirtyChange={setDirty}
        textareaRef={textareaRef}
        prefill={prefill}
      />
      <ConfirmDialog
        open={discardOpen}
        title={t('signals.composer.discardTitle')}
        body={t('signals.composer.discardBody')}
        confirmLabel={t('signals.composer.discard')}
        cancelLabel={t('signals.composer.stay')}
        tone="destructive"
        onConfirm={async () => { setDiscardOpen(false); setDirty(false); onClose() }}
        onCancel={() => { setDiscardOpen(false); setTimeout(() => textareaRef.current?.focus(), 0) }}
      />
    </section>
  )
}
