import { useEffect, useRef, useState, type RefObject } from 'react'
import { useT } from '@/i18n/use-t'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/state-kit'
import {
  listAllTeams, createSignal, dedupeRecipients, type MemberLookup,
} from '@/lib/db/signals'
import type { TeamOption, StagedMention, MentionKind, Attention } from '@/lib/db/signals.types'
import type { SignalComposerPrefill } from '@/shell/signal-composer-host'
import { getBusinessUnits, getPeople } from '@/lib/db/directory'
import { currentMentionToken, type MentionCandidate } from '@/lib/comments/mentions'
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

function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

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
  const [occurredAt, setOccurredAt] = useState(() => prefill ? toDatetimeLocalValue(new Date(prefill.occurredAt)) : toDatetimeLocalValue(new Date()))
  const [attention, setAttention] = useState<Attention>(prefill?.attention ?? 'FYI')
  const [mentions, setMentions] = useState<StagedMention[]>(prefill?.mentions ?? [])
  const [mentionToken, setMentionToken] = useState<{ query: string; start: number } | null>(null)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const internalTextareaRef = useRef<HTMLTextAreaElement>(null)
  const textareaRef = externalTextareaRef ?? internalTextareaRef
  // GAP-8 (OD-91 #13): the mention popover is a combobox — the textarea keeps focus and forwards its
  // navigation keydowns to the picker's shared listbox contract.
  const mentionPickerRef = useRef<SignalMentionPickerHandle>(null)

  useEffect(() => {
    onDirtyChange?.(Boolean(prefill?.body.trim()))
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
  // #855 (required outcome + addendum B2): ONE metadata line — audience, then notify count, then
  // author — with a STABLE "All teams" prefix. Typing an @mention only APPENDS the notify segment;
  // it never swaps the audience phrase out from under the reader (the "Visible to all teams" →
  // "All teams · notify…" flicker the addendum caught).
  const metaLine = notifyCount > 0
    ? t('signals.composer.shareAllNotify', { count: notifyCount, noun: notifyNoun, name: authorName })
    : t('signals.composer.shareAll', { name: authorName })

  function handleBodyChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value
    setBody(value)
    onDirtyChange?.(Boolean(value.trim()))
    const token = ((canTag ?? false) || canMentionBu)
      ? currentMentionToken(value, e.target.selectionStart ?? value.length)
      : null
    setMentionToken(token)
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
    setMentionToken(null)
    textareaRef.current?.focus()
  }

  async function submit() {
    const trimmedBody = body.trim()
    if (!trimmedBody || posting) return
    setPosting(true)
    setError(null)
    try {
      const occurredIso = new Date(occurredAt).toISOString()
      const id = await createSignal({ body: trimmedBody, occurredAt: occurredIso, attention, mentions })
      setBody('')
      setMentions([])
      setMentionToken(null)
      onDirtyChange?.(false)
      onShared?.(id)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(/permission|not authorized|42501|row-level security/i.test(message)
        ? t('signals.composer.permissionError')
        : message || t('signals.composer.postError'))
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
          // Combobox aria: while the mention popover is open the textarea is the combobox that
          // controls the listbox and reflects the active option (aria-activedescendant is on the
          // listbox; role=combobox marks the input as the driver).
          role={mentionToken ? 'combobox' : undefined}
          aria-expanded={mentionToken ? true : undefined}
          // While the popover is open Escape belongs to it, not to whatever modal hosts the
          // composer. A modal owns Escape from the capture phase, so it decides before this
          // handler runs; the marker is what tells it to stand down. It is keyed to the open
          // token because the marker must NOT outlive the popover — with no suggestion list on
          // screen, Escape is the host's again.
          data-escape-layer={mentionToken ? 'nested' : undefined}
          onKeyDown={(e) => {
            // GAP-8 combobox idiom: while the popover is open, forward ArrowUp/Down/Home/End/Enter/
            // Escape to the shared listbox contract. Escape is consumed here regardless (D-B2
            // isolation: it must not bubble to the composer's ModalShell host and lose the draft).
            if (mentionToken && mentionPickerRef.current?.handleKeyDown(e)) return
            if (e.key === 'Escape' && mentionToken) {
              e.preventDefault()
              e.stopPropagation()
              setMentionToken(null)
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
        />
        {mentionToken && (
          <SignalMentionPicker
            ref={mentionPickerRef}
            people={people}
            teams={teamCandidates}
            businessUnits={businessUnits}
            query={mentionToken.query}
            canMentionBu={canMentionBu}
            onSelect={insertMention}
            onDismiss={() => setMentionToken(null)}
          />
        )}
      </div>

      <div className="signal-composer-context" aria-label={t('signals.composer.contextLabel')}>
        <SignalAttentionPicker id="signals-compose-attention" value={attention} onChange={(next) => { setAttention(next); onDirtyChange?.(true) }} />
        <label className="signal-composer-context-pill signal-composer-occurred-pill">
          <span aria-hidden="true">◷</span>
          <span>{t('signals.composer.occurredNow')}</span>
          <span className="signal-composer-field-hint">{t('signals.composer.occurredHint')}</span>
          <input
            type="datetime-local"
            aria-label={t('signals.composer.occurredLabel')}
            value={occurredAt}
            onChange={(e) => { setOccurredAt(e.target.value); onDirtyChange?.(true) }}
          />
        </label>
      </div>

      <p className="signal-composer-vis">{metaLine}</p>

      {error && <p role="alert">{error}</p>}

      <div className="signal-composer-foot">
        <div className="signal-composer-send">
          {/* OD-REDESIGN-91 #10: quiet Shift+Enter hint by the Send button; hidden without a
              real keyboard (touch, or a pointer with no hover — #5/#855). */}
          <span className="signal-composer-send-hint">{t('signals.composer.sendHint')}</span>
          <Button
            variant="primary"
            disabled={!body.trim() || posting}
            aria-busy={posting}
            onClick={() => { void submit() }}
          >
            {/* DO-17 F3: an explicit in-flight affordance (label + aria-busy), not just a disabled button. */}
            {posting ? t('signals.action.sharing') : t('signals.action.share')}
          </Button>
        </div>
      </div>
    </div>
  )
}