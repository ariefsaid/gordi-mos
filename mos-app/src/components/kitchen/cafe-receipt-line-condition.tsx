import { useEffect, useId, useRef, useState } from 'react'
import { Pill } from '@/components/ui/pill'
import { useT } from '@/i18n/use-t'
import type { CafeReceiptExplanation } from '@/lib/cafe-receipt-explanation-draft'
import {
  saveCafeReceiptLineExplanation,
  type CafeReceiptCondition,
  type CafeReceiptLine,
} from '@/lib/db/cafe-receipts'
import { uploadCafeReceiptLinePhoto } from '@/lib/db/cafe-receipt-photos'
import type { CafeReceiptPhoto } from '@/lib/db/cafe-receipt-photos'
import { useIsOffline } from '@/shell/use-is-offline'
import { WastePhotoCapture } from './waste-photo-capture'
import { WastePhotoStrip } from './waste-photo-strip'
import './cafe-receipt.css'

export type EvidenceValidation = 'reason' | 'photo' | 'both'
type EvidencePatch = Pick<Partial<CafeReceiptLine>, 'conditions' | 'condition_reason' | 'photos'>

/** The one place a line condition gets its label. */
const CONDITION_LABEL = { damaged_wrong: 'cafe.receive.damageFlag' } as const satisfies Record<CafeReceiptCondition, string>

/** A line's conditions as status pills, for the lock step, the sent receipt and review. */
export function CafeReceiptConditionPills({ conditions }: { conditions: readonly CafeReceiptCondition[] }) {
  const t = useT()
  return conditions.map(condition => <Pill key={condition} tone="warning">{t(CONDITION_LABEL[condition])}</Pill>)
}

/** Read-only evidence under a received line: its conditions, reason and private photos. */
export function CafeReceiptLineEvidence({ line }: { line: CafeReceiptLine }) {
  const t = useT()
  if (line.conditions.length === 0 && line.photos.length === 0) return null
  return (
    <div className="cafe-receipt-evidence">
      <CafeReceiptConditionPills conditions={line.conditions} />
      {line.condition_reason && <p>{line.condition_reason}</p>}
      <WastePhotoStrip
        photos={line.photos}
        copy={{
          reviewLabel: t('cafe.receive.photoReview'),
          openAlt: (n, total) => t('cafe.receive.photoOpen', { n, total }),
        }}
      />
    </div>
  )
}

/** Receiver-owned condition and evidence editor, separate from the immutable counted quantity. */
export function CafeReceiptLineCondition({
  line,
  dirty,
  photosUnavailable = false,
  disabled,
  validation,
  focusError = false,
  onChange,
  onSaved,
}: {
  line: CafeReceiptLine
  /** The flag or reason differs from what the server holds. */
  dirty: boolean
  /** The photo read failed, so whether the line has a photo is not known here. */
  photosUnavailable?: boolean
  disabled: boolean
  validation?: EvidenceValidation
  focusError?: boolean
  onChange: (patch: EvidencePatch) => void
  onSaved: (saved: CafeReceiptExplanation & { condition_updated_at: string | null }) => void
}) {
  const t = useT()
  const reasonId = useId()
  const helpId = useId()
  const errorId = useId()
  const errorRef = useRef<HTMLParagraphElement>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const online = !useIsOffline()
  const damagedWrong = line.conditions.includes('damaged_wrong')
  const reasonError = validation === 'reason' || validation === 'both'
  const photoError = validation === 'photo' || validation === 'both'
  useEffect(() => {
    if (validation && focusError) errorRef.current?.focus()
  }, [focusError, validation])

  function edit(patch: EvidencePatch) {
    onChange(patch)
    setSaved(false)
    setSaveFailed(false)
  }

  function updateCondition(checked: boolean) {
    const conditions = checked
      ? [...line.conditions.filter(condition => condition !== 'damaged_wrong'), 'damaged_wrong' as const]
      : line.conditions.filter(condition => condition !== 'damaged_wrong')
    edit({ conditions, condition_reason: conditions.length > 0 ? line.condition_reason : null })
  }

  async function saveExplanation() {
    if (saving || !dirty || !online) return
    setSaving(true)
    setSaveFailed(false)
    try {
      onSaved(await saveCafeReceiptLineExplanation(line.id, damagedWrong, line.condition_reason ?? ''))
      setSaved(true)
    } catch {
      setSaveFailed(true)
    } finally {
      setSaving(false)
    }
  }

  function receivePhoto(photo: CafeReceiptPhoto) {
    if (line.photos.some(existing => existing.path === photo.path)) return
    onChange({ photos: [...line.photos, photo] })
  }

  return (
    <section className="cafe-receive__condition" aria-label={line.item_name}>
      <label className="cafe-receive__damage-flag">
        <input
          type="checkbox"
          aria-label={t('cafe.receive.damageFlagFor', { item: line.item_name })}
          checked={damagedWrong}
          disabled={disabled || saving}
          onChange={event => updateCondition(event.target.checked)}
        />
        {t('cafe.receive.damageFlag')}
      </label>
      {validation && (
        <p ref={errorRef} id={errorId} className="cafe-count__field-error" role="alert" tabIndex={-1}>
          {t(validation === 'both'
            ? 'cafe.receive.reasonAndPhotoRequired'
            : validation === 'reason'
              ? 'cafe.receive.reasonRequired'
              : 'cafe.receive.photoRequired', { item: line.item_name })}
        </p>
      )}
      {line.conditions.length > 0 && (
        <div className="cafe-receive__evidence-fields">
          <div className="cafe-receive__reason">
            <label htmlFor={reasonId}>{t('cafe.receive.reasonLabel', { item: line.item_name })}</label>
            <textarea
              id={reasonId}
              value={line.condition_reason ?? ''}
              placeholder={t('cafe.receive.reasonPlaceholder')}
              maxLength={500}
              rows={3}
              disabled={disabled || saving}
              aria-invalid={reasonError || undefined}
              aria-describedby={reasonError ? `${helpId} ${errorId}` : helpId}
              onChange={event => edit({ condition_reason: event.target.value })}
            />
            <div className="cafe-receive__reason-meta">
              <span id={helpId}>{t('cafe.receive.reasonHelp')}</span>
              <span className="tabular">{(line.condition_reason ?? '').length}/500</span>
            </div>
          </div>
          <WastePhotoCapture<CafeReceiptPhoto>
            ownerId={line.id}
            initialPhotos={line.photos}
            onUpload={uploadCafeReceiptLinePhoto}
            onPhotoUploaded={receivePhoto}
            disabled={disabled || !online}
            copy={{
              title: t('cafe.receive.photoTitle'),
              help: t('cafe.receive.photoHelp'),
              add: t('cafe.receive.photoAddShort'),
              addName: t('cafe.receive.photoAdd', { item: line.item_name }),
              invalidType: t('cafe.receive.photoType'),
              tooMany: t('cafe.receive.photoTooMany'),
              tooLarge: t('cafe.receive.photoTooLarge'),
              // A refused line already names the missing photo in its alert above; an unread one is not known.
              required: t(photosUnavailable ? 'cafe.receipts.photosUnavailable' : photoError ? 'cafe.receive.photoNone' : 'cafe.receive.photoNeeded'),
              upload: t('cafe.receive.photoUpload'),
              uploaded: t('cafe.receive.photoUploaded'),
              failed: t('cafe.receive.photoUploadFailed'),
              progress: n => t('cafe.receive.photoProgress', { n }),
              preview: n => t('cafe.receive.photoPreview', { n }),
              remove: n => t('cafe.receive.photoRemove', { n }),
              retry: n => t('cafe.receive.photoRetry', { n }),
              ready: n => t(n === 1 ? 'cafe.receive.photoReady.one' : 'cafe.receive.photoReady.other', { count: n }),
              windowExpired: () => t('cafe.receive.photoUploadFailed'),
            }}
          />
          {dirty && (
            <button type="button" className="btn btn-outline btn-touch" disabled={disabled || saving || !online} onClick={() => void saveExplanation()}>
              {saving ? t('common.working') : t('cafe.receive.saveExplanation')}
            </button>
          )}
          {saved && !dirty && <p className="cafe-count__line-success" role="status">{t('cafe.receive.explanationSaved')}</p>}
          {saveFailed && <p className="cafe-count__field-error" role="alert">{t('cafe.receive.explanationSaveFailed')}</p>}
        </div>
      )}
    </section>
  )
}
