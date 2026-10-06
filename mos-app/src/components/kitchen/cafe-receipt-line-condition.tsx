import { useEffect, useId, useRef, useState } from 'react'
import { useT } from '@/i18n/use-t'
import {
  saveCafeReceiptLineExplanation,
  type CafeReceiptLine,
} from '@/lib/db/cafe-receipts'
import { uploadCafeReceiptLinePhoto } from '@/lib/db/cafe-receipt-photos'
import type { CafeReceiptPhoto } from '@/lib/db/cafe-receipt-photos'
import { useIsOffline } from '@/shell/use-is-offline'
import { WastePhotoCapture } from './waste-photo-capture'

type EvidenceValidation = 'reason' | 'photo' | 'both'
type EvidencePatch = Pick<Partial<CafeReceiptLine>, 'conditions' | 'condition_reason' | 'photos'>

/** Receiver-owned condition and evidence editor, separate from the immutable counted quantity. */
export function CafeReceiptLineCondition({
  line,
  disabled,
  validation,
  focusError = false,
  onChange,
}: {
  line: CafeReceiptLine
  disabled: boolean
  validation?: EvidenceValidation
  focusError?: boolean
  onChange: (patch: EvidencePatch) => void
}) {
  const t = useT()
  const reasonId = useId()
  const helpId = useId()
  const errorId = useId()
  const errorRef = useRef<HTMLParagraphElement>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const online = !useIsOffline()
  const damagedWrong = line.conditions.includes('damaged_wrong')
  const showEvidence = line.conditions.length > 0 || dirty
  const reasonError = validation === 'reason' || validation === 'both'
  useEffect(() => {
    if (validation && focusError) errorRef.current?.focus()
  }, [focusError, validation])

  function updateCondition(checked: boolean) {
    const conditions = checked
      ? [...line.conditions.filter(condition => condition !== 'damaged_wrong'), 'damaged_wrong' as const]
      : line.conditions.filter(condition => condition !== 'damaged_wrong')
    onChange({
      conditions,
      condition_reason: conditions.length > 0 ? line.condition_reason : null,
    })
    setDirty(true)
    setSaved(false)
    setSaveFailed(false)
  }

  async function saveExplanation() {
    if (saving || !dirty || !online) return
    setSaving(true)
    setSaveFailed(false)
    try {
      const result = await saveCafeReceiptLineExplanation(line.id, damagedWrong, line.condition_reason ?? '')
      onChange(result)
      setDirty(false)
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
      {!showEvidence ? (
        <p className="cafe-receive__condition-help">{t('cafe.receive.conditionHelp')}</p>
      ) : (
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
              onChange={event => {
                onChange({ condition_reason: event.target.value })
                setDirty(true)
                setSaved(false)
                setSaveFailed(false)
              }}
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
              add: t('cafe.receive.photoAdd', { item: line.item_name }),
              invalidType: t('cafe.receive.photoType'),
              tooMany: t('cafe.receive.photoTooMany'),
              tooLarge: t('cafe.receive.photoTooLarge'),
              required: t('cafe.receive.photoRequired', { item: line.item_name }),
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
          {saved && <p className="cafe-count__line-success" role="status">{t('cafe.receive.explanationSaved')}</p>}
          {saveFailed && <p className="cafe-count__field-error" role="alert">{t('cafe.receive.explanationSaveFailed')}</p>}
        </div>
      )}
    </section>
  )
}
