import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { useT } from '@/i18n/use-t'
import { Button } from '@/components/ui/button'
import { DateField } from '@/components/ui/date-field'
import { ErrorState } from '@/components/ui/state-kit'
import {
  listAllTeams, createSignal, dedupeRecipients, type MemberLookup,
} from '@/lib/db/signals'
import type { TeamOption, StagedMention, MentionKind, Attention } from '@/lib/db/signals.types'
import { CloseIcon } from '@/shell/icons'
import type { SignalComposerPrefill } from '@/shell/signal-composer-host'
import { getBusinessUnits, getPeople } from '@/lib/db/directory'
import { MAX_SIGNAL_PHOTOS, uploadSignalPhotos } from '@/lib/db/signal-photos'
import { currentMentionToken, type MentionCandidate } from '@/lib/comments/mentions'
import { signalOccurredAtIsoFromWib, wibPartsFromInstant } from '@/lib/signal-occurred-at'
import { SignalMentionPicker, type SignalMentionPickerHandle } from './signal-mention-picker'
import { SignalAttentionPicker } from './signal-attention-picker'
import './signal-composer.css'

// All Teams Signal composer. Every Signal is org-wide with no owning Team, so capture is minimal
// (Rule 8 / OD-42 / D28): content, occurrence time, and the implicit read-only author line at the
// first paint. Enrichment (the `@` mention picker and the notify-N preview) never blocks Share.
export interface SignalComposerProps {
  authorId: string
  authorName: string
  /** Effective runtime signal.tag authority; also unlocks org-wide Person/Team/BU tagging. */
  canTag?: boolean
  /** Legacy-compatible @BU picker gate. The shell supplies the effective signal.tag decision;
   * defaults to false (fail-closed). */
  canMentionBu?: boolean
  /** Team/BU id → member person ids, for the fan-out preview count (AC-422). Supplied by the
   * caller from a directory cache — the composer never queries a full org roster on its own. */
  teamMembers?: MemberLookup
  buMembers?: MemberLookup
  onShared?: (id: string) => void
  onDirtyChange?: (dirty: boolean) => void
  textareaRef?: RefObject<HTMLTextAreaElement | null>
  prefill?: SignalComposerPrefill
}

type MentionRelationship = { listboxId: string; activeOptionId: string | null }

export function SignalComposer({
  authorId, authorName, canTag, canMentionBu = false,
  teamMembers = {}, buMembers = {}, onShared, prefill,
  onDirtyChange, textareaRef: externalTextareaRef,
}: SignalComposerProps) {
  const t = useT()
  const [mentionTeams, setMentionTeams] = useState<TeamOption[]>([])
  const [directoryError, setDirectoryError] = useState(false)
  const [directoryAttempt, setDirectoryAttempt] = useState(0)
  const [people, setPeople] = useState<MentionCandidate[]>([])
  const [businessUnits, setBusinessUnits] = useState<MentionCandidate[]>([])
  const [body, setBody] = useState(prefill?.body ?? '')
  // DateField keeps the shared day-first entry grammar; these stored parts are WIB wall time,
  // regardless of the device's local timezone.
  const [occurredFields, setOccurredFields] = useState(() =>
    wibPartsFromInstant(prefill?.occurredAt ?? new Date()) ?? { date: '', time: '' },
  )
  const occurredDate = occurredFields.date
  const occurredTime = occurredFields.time
  const [occurredDateInvalid, setOccurredDateInvalid] = useState(false)
  const occurredAt = signalOccurredAtIsoFromWib(occurredDate, occurredTime)
  const occurredReady = occurredAt !== null && !occurredDateInvalid
  const [attention, setAttention] = useState<Attention>(prefill?.attention ?? 'FYI')
  const [mentions, setMentions] = useState<StagedMention[]>(prefill?.mentions ?? [])
  const [mentionToken, setMentionToken] = useState<{ query: string; start: number } | null>(null)
  const [mentionRelationship, setMentionRelationship] = useState<MentionRelationship | null>(null)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Each staged photo owns its preview URL: minted when chosen, revoked when dropped or on unmount.
  const [photos, setPhotos] = useState<Array<{ file: File; url: string }>>([])
  const photosRef = useRef(photos)
  photosRef.current = photos
  useEffect(() => () => { photosRef.current.forEach((p) => URL.revokeObjectURL(p.url)) }, [])
  // Set once the Signal is posted but some photos did not upload: Share becomes a photo retry
  // against this id, so a second press never posts the Signal twice.
  const [sharedId, setSharedId] = useState<string | null>(null)
  const internalTextareaRef = useRef<HTMLTextAreaElement>(null)
  const textareaRef = externalTextareaRef ?? internalTextareaRef
  // The native textarea stays the editing driver while suggestion navigation is forwarded.
  const mentionPickerRef = useRef<SignalMentionPickerHandle>(null)
  const isComposingRef = useRef(false)
  const handleMentionRelationshipChange = useCallback((state: MentionRelationship | null) => {
    setMentionRelationship(state)
  }, [])
  const dismissMentionPicker = useCallback(() => {
    setMentionToken(null)
    setMentionRelationship(null)
  }, [])

  useEffect(() => {
    onDirtyChange?.(Boolean(prefill?.body.trim() || prefill?.mentions.length))
  }, [onDirtyChange, prefill])

  useEffect(() => {
    let cancelled = false
    setDirectoryError(false)
    // All Teams rows need no owning-Team options. Mention reach is a separate runtime signal.tag
    // decision; never fall back to the viewer's membership list because every org member may tag
    // any active Person or Team when that authority is granted.
    const tagAuthority = canTag ?? false
    const mentionTeamsLoad = tagAuthority ? listAllTeams() : Promise.resolve([] as TeamOption[])
    const peopleLoad = tagAuthority ? getPeople() : Promise.resolve([])
    // Keep the BU roster loaded even when the picker is disabled so the UI can explain the
    // effective signal.tag boundary with a disabled option rather than hiding the group.
    const businessUnitsLoad = getBusinessUnits()
    Promise.all([mentionTeamsLoad, peopleLoad, businessUnitsLoad]).then(([
      mentionTeamOptions, peopleOptions, buOptions,
    ]) => {
      if (cancelled) return
      setMentionTeams(mentionTeamOptions)
      setPeople(tagAuthority ? peopleOptions.filter((p) => p.id !== authorId).map((p) => ({ id: p.id, label: p.full_name })) : [])
      setBusinessUnits(buOptions.map((bu) => ({ id: bu.id, label: bu.name })))
    }).catch(() => { if (!cancelled) setDirectoryError(true) })
    return () => { cancelled = true }
  }, [authorId, canTag, canMentionBu, prefill, directoryAttempt])

  const teamCandidates: MentionCandidate[] = mentionTeams.map((team) => ({ id: team.id, label: team.name }))
  const notifyCount = dedupeRecipients(mentions, teamMembers, buMembers)
  // SR-1 (owner ruling — "notify N people"): the count carries its noun. English inflects
  // person/people by count; Indonesian "orang" is invariant (both keys resolve to it). The caller
  // resolves the noun in the active locale and threads it as ${noun}.
  const notifyNoun = t(notifyCount === 1 ? 'signals.notify.person' : 'signals.notify.people')
  // Keep notification targeting separate from the fixed All Teams audience.
  const audienceLabel = t('signals.composer.audience')
  const metaLine = notifyCount > 0
    ? t('signals.composer.authorLineNotify', { count: notifyCount, noun: notifyNoun, name: authorName })
    : t('signals.composer.authorLine', { name: authorName })

  function handleBodyChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    if (posting) return
    const value = e.target.value
    setBody(value)
    onDirtyChange?.(Boolean(value.trim() || mentions.length > 0 || photos.length > 0))
    const token = ((canTag ?? false) || canMentionBu)
      ? currentMentionToken(value, e.target.selectionStart ?? value.length)
      : null
    setMentionToken(token)
    if (!token) setMentionRelationship(null)
  }

  function insertMention(kind: MentionKind, option: MentionCandidate) {
    if (!mentionToken) return
    const before = body.slice(0, mentionToken.start)
    const after = body.slice(mentionToken.start).replace(/^@[^\s@]*/, '')
    setBody(`${before}@${option.label} ${after}`)
    setMentions((prev) => [
      ...prev.filter((m) => !(m.kind === kind && m.targetId === option.id)),
      { kind, targetId: option.id, label: option.label },
    ])
    onDirtyChange?.(true)
    dismissMentionPicker()
    textareaRef.current?.focus()
  }

  function removeMention(target: StagedMention) {
    if (posting || sharedId) return
    const next = mentions.filter((mention) =>
      mention.kind !== target.kind || mention.targetId !== target.targetId,
    )
    setMentions(next)
    onDirtyChange?.(Boolean(body.trim() || next.length > 0 || photos.length > 0))
  }

  function keepPhotos(keep: (photo: { file: File; url: string }) => boolean) {
    setPhotos((prev) => {
      prev.filter((p) => !keep(p)).forEach((p) => URL.revokeObjectURL(p.url))
      return prev.filter(keep)
    })
  }

  function addPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (chosen.length === 0) return
    setPhotos((prev) => [
      ...prev,
      ...chosen.slice(0, MAX_SIGNAL_PHOTOS - prev.length).map((file) => ({ file, url: URL.createObjectURL(file) })),
    ])
    onDirtyChange?.(true)
  }

  async function submit() {
    const trimmedBody = body.trim()
    if ((!trimmedBody && !sharedId) || posting || !occurredReady || !occurredAt) return
    setPosting(true)
    setError(null)
    try {
      const id = sharedId ?? await createSignal({
        body: trimmedBody, occurredAt, attention, mentions,
      })
      const files = photos.map((p) => p.file)
      const failed = await uploadSignalPhotos(id, files).catch(() => files)
      keepPhotos((p) => failed.includes(p.file))
      if (failed.length > 0) {
        setSharedId(id)
        setError(t('signals.composer.photoError', {
          count: failed.length, noun: t(failed.length === 1 ? 'signals.composer.photoNoun' : 'signals.composer.photosNoun'),
        }))
        return
      }
      setBody('')
      setMentions([])
      dismissMentionPicker()
      setSharedId(null)
      onDirtyChange?.(false)
      onShared?.(id)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(/permission|not authorized|42501|row-level security/i.test(message)
        ? t('signals.composer.permissionError')
        : t('signals.composer.postError'))
      textareaRef.current?.focus()
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="signal-composer" data-testid="signal-composer">
      {directoryError && <ErrorState message={t('signals.composer.directoryError')} onRetry={() => setDirectoryAttempt((attempt) => attempt + 1)} />}
      <div className="signal-composer-mention-anchor">
        <textarea
          ref={textareaRef}
          aria-label={t('signals.composer.placeholder')}
          placeholder={t('signals.composer.placeholder')}
          value={body}
          onChange={handleBodyChange}
          aria-controls={mentionToken ? mentionRelationship?.listboxId : undefined}
          aria-activedescendant={mentionToken ? mentionRelationship?.activeOptionId ?? undefined : undefined}
          // Mark the focused driver as nested so shared host layers leave Escape to this picker.
          // The marker exists only while suggestions are open; after dismissal, Escape belongs
          // to the host again.
          data-escape-layer={mentionToken ? 'nested' : undefined}
          onCompositionStart={() => { isComposingRef.current = true }}
          onCompositionEnd={() => { isComposingRef.current = false }}
          onKeyDown={(e) => {
            if (isComposingRef.current || e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return
            if (mentionToken && e.key === 'Enter' && e.shiftKey) {
              e.preventDefault()
              e.stopPropagation()
              return
            }
            // While the popover is open, forward ArrowUp/Down/Home/End/Enter/
            // Escape to the shared listbox contract. Escape is consumed here regardless (D-B2
            // isolation: it must not bubble to the composer's ModalShell host and lose the draft).
            if (mentionToken && mentionPickerRef.current?.handleKeyDown(e)) {
              if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
              }
              return
            }
            if (e.key === 'Escape' && mentionToken) {
              e.preventDefault()
              e.stopPropagation()
              dismissMentionPicker()
              return
            }
            // OD-REDESIGN-91 #10: Shift+Enter SENDS; plain Enter stays a newline. Held back while
            // the mention popover is open so a stray Shift+Enter never posts mid-mention.
            if (e.key === 'Enter' && e.shiftKey && !mentionToken) {
              e.preventDefault()
              void submit()
            }
          }}
          rows={3}
          readOnly={!!sharedId || posting}
        />
        {mentionToken && (
          <SignalMentionPicker
            ref={mentionPickerRef}
            people={people}
            teams={teamCandidates}
            businessUnits={businessUnits}
            query={mentionToken.query}
            canMentionBu={canMentionBu}
            anchorRef={textareaRef}
            onRelationshipChange={handleMentionRelationshipChange}
            onSelect={insertMention}
            onDismiss={dismissMentionPicker}
          />
        )}
      </div>

      {mentions.length > 0 && (
        <div className="signal-composer-targets" role="group" aria-label={t('signals.composer.targetsLabel')}>
          <span className="signal-composer-targets-label">{t('signals.composer.targetsLabel')}</span>
          <ul className="signal-composer-targets-list">
            {mentions.map((mention) => {
              const kind = mention.kind === 'person'
                ? t('signals.mention.group.person')
                : mention.kind === 'team'
                  ? t('signals.mention.group.team')
                  : t('signals.mention.group.bu')
              return (
                <li className="signal-composer-target" key={`${mention.kind}:${mention.targetId}`}>
                  <span className="signal-composer-target-name">{kind} · {mention.label}</span>
                  <button
                    type="button"
                    className="signal-composer-target-remove"
                    aria-label={t('signals.composer.removeTarget', { kind, name: mention.label })}
                    disabled={posting || !!sharedId}
                    onClick={() => removeMention(mention)}
                  >
                    <CloseIcon size={14} />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {photos.length > 0 && (
        <ul className="signal-composer-photos" aria-label={t('signals.composer.photosLabel')}>
          {photos.map((photo, i) => (
            // In the retry state every photo still listed is one that did not upload.
            <li key={photo.url} data-failed={sharedId ? true : undefined}>
              <img src={photo.url} alt={t(sharedId ? 'signals.composer.photoFailedAlt' : 'signals.composer.photoAlt', { n: i + 1, total: photos.length })} />
              <button
                type="button"
                aria-label={t('signals.composer.removePhoto', { n: i + 1 })}
                onClick={() => keepPhotos((p) => p !== photo)}
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="signal-composer-context" aria-label={t('signals.composer.contextLabel')}>
        <SignalAttentionPicker id="signals-compose-attention" value={attention} onChange={(next) => { setAttention(next); onDirtyChange?.(true) }} />
        <div className="signal-composer-context-pill signal-composer-occurred-pill">
          <span>{t('signals.composer.occurredLabel')}</span>
          <DateField
            compact
            required
            aria-label={t('signals.composer.occurredLabel')}
            value={occurredDate}
            onChange={(next) => { setOccurredFields((current) => ({ ...current, date: next })); onDirtyChange?.(true) }}
            onValidityChange={setOccurredDateInvalid}
          />
          <input
            type="time"
            className="signal-composer-time"
            aria-label={t('signals.composer.occurredTime')}
            value={occurredTime}
            required
            onChange={(e) => { setOccurredFields((current) => ({ ...current, time: e.target.value })); onDirtyChange?.(true) }}
          />
          <span className="signal-composer-field-hint">{t('signals.composer.occurredHint')}</span>
        </div>
        {/* A plain file input: on a phone the OS offers Camera or Photo Library itself. */}
        <label className="signal-composer-context-pill signal-composer-photo-pill" data-disabled={photos.length >= MAX_SIGNAL_PHOTOS || !!sharedId || undefined}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" />
          </svg>
          <span>{photos.length > 0 ? t('signals.composer.photoCount', { count: photos.length, max: MAX_SIGNAL_PHOTOS }) : t('signals.composer.addPhoto')}</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            aria-label={t('signals.composer.addPhoto')}
            disabled={photos.length >= MAX_SIGNAL_PHOTOS || !!sharedId}
            onChange={addPhotos}
          />
        </label>
      </div>

      <p className="signal-composer-vis">{metaLine}</p>

      {error && <p role="alert">{error}</p>}

      <div className="signal-composer-foot">
        <span className="signal-composer-audience">{audienceLabel}</span>
        <div className="signal-composer-send">
          {/* OD-REDESIGN-91 #10: quiet Shift+Enter hint by the Send button; hidden without a
              real keyboard (touch, or a pointer with no hover). */}
          {!sharedId && <span className="signal-composer-send-hint">{t('signals.composer.sendHint')}</span>}
          <Button
            variant="primary"
            disabled={(!body.trim() && !sharedId) || posting || !occurredReady}
            aria-busy={posting}
            onClick={() => { void submit() }}
          >
            {/* DO-17 F3: an explicit in-flight affordance (label + aria-busy), not just a disabled button. */}
            {posting ? t('signals.action.sharing') : sharedId ? t(photos.length > 0 ? 'signals.composer.retryPhotos' : 'signals.composer.finish') : t('signals.action.share')}
          </Button>
        </div>
      </div>
    </div>
  )
}
