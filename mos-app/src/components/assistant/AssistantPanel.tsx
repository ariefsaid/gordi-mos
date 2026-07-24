/**
 * AssistantPanel — the deputy slide-over (T27, P2 port of the sibling reference's panel, re-skinned
 * to DESIGN.md tokens). One component mounted at the shell root; self-gates visibility on the
 * runtime context's `open`.
 *
 *   - Desktop (≥920px): the shared OverlayCompanionSlot/RecordPanelHost renders a non-modal
 *     companion. With a record open it contracts into the remaining canvas (OD-REDESIGN-80).
 *   - Phone (<920px): that same host renders the modal sheet above any mounted record.
 *
 * Keep-mounted (FR-P2-AP-003): this component and its hook state stay mounted while the physical
 * host closes, so transcript/chip/draft/history state survives close→open. The closed slot is inert.
 * Assistant prose renders through the safe markdown boundary (ADR-0049); user turns and control
 * strings stay literal. Typed artifact widgets render through the ADR-0045 registry.
 * Every string flows through useT() (FR-P2-AP-005).
 *
 * AC-AP-001/002/003/004 + a11y (role/aria/Esc/focus-trap).
 */

import { useEffect, useRef, useState, useCallback, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useAgentRuntime } from '@/lib/agent/runtime/AgentRuntimeContext'
import { useAssistantPanel, type TranscriptItem, type ChipState, type PendingQuestion, type AssistantRating } from '@/hooks/useAssistantPanel'
import { useT } from '@/i18n/use-t'
import { EmptyState } from '@/components/ui/state-kit'
import { ThreadList } from './ThreadList'
import { AssistantMarkdown } from './AssistantMarkdown'
import { AssistantWidgetSlot } from './AssistantWidgetSlot'
import { OverlayCompanionSlot } from '@/shell/overlay-host'
import './AssistantPanel.css'

const SUGGESTION_KEYS = [
  'assistant.empty.suggestion1',
  'assistant.empty.suggestion2',
  'assistant.empty.suggestion3',
] as const

/** The downvote reason vocabulary (T23, AC-P3-FB-002) — matches the plan's fixed reason set. */
const DOWNVOTE_REASONS = ['inaccurate', 'not_helpful', 'wrong_tool', 'too_slow'] as const

interface RatingLabels {
  up: string
  down: string
  reasonLabel: string
  reasons: { id: string; label: string }[]
}

export function AssistantPanel() {
  const { open, closePanel, pendingDraft, consumePendingDraft } = useAgentRuntime()
  const panel = useAssistantPanel()
  const t = useT()

  const [draft, setDraft] = useState('')

  // Record-scoped "Ask Deputy": when the panel opens with a seeded reference (e.g. "About Task: …"),
  // pre-fill the composer once and clear the seed. The user still edits and presses Send — this
  // NEVER auto-sends, and re-opening the panel later does not re-seed a consumed draft.
  useEffect(() => {
    if (open && pendingDraft != null) {
      setDraft(pendingDraft)
      consumePendingDraft()
    }
  }, [open, pendingDraft, consumePendingDraft])
  const [showHistory, setShowHistory] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // ── Body scroll-lock (phone modal) ───────────────────────────────────────────
  // ── Esc closes (never cancels) + focus trap (phone modal) ────────────────────
  // ── Autoscroll the transcript to the latest turn ─────────────────────────────
  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [panel.transcript, panel.chips, open])

  const submit = useCallback(
    async (text: string) => {
      const goal = text.trim()
      if (!goal || panel.phase === 'running') return
      setDraft('')
      await panel.send(goal)
    },
    [panel],
  )

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    void submit(draft)
  }

  const onKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter inserts a newline. (Enter-without-Shift only when not composing.)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void submit(draft)
    }
  }

  const transcriptEmpty = panel.transcript.length === 0
  const canSend = draft.trim().length > 0 && panel.phase !== 'running'

  return (
    <OverlayCompanionSlot
      open={open}
      onClose={() => closePanel()}
      entry={{
        key: 'deputy',
        owner: 'shell',
        tenant: 'deputy',
        label: t('assistant.title'),
        title: <strong className="assistant-panel__title">{t('assistant.title')}</strong>,
        actions: (
          <>
            <button
              type="button"
              className="record-panel-btn"
              aria-label={t('assistant.newConversation')}
              title={t('assistant.newConversation')}
              onClick={() => {
                panel.newConversation()
                setShowHistory(false)
              }}
              disabled={transcriptEmpty && !showHistory}
            >
              <PlusIcon />
            </button>
            <button
              type="button"
              className="record-panel-btn"
              aria-label={t('assistant.history')}
              title={t('assistant.history')}
              aria-expanded={showHistory}
              onClick={() => setShowHistory((v) => !v)}
            >
              <HistoryIcon />
            </button>
          </>
        ),
        content: (
          <div className="assistant-panel bg-background flex flex-col">

        {/* Body */}
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto" style={{ padding: '0.75rem' }}>
          {showHistory ? (
            <ThreadList
              emptyText={t('assistant.thread.empty')}
              onOpen={(threadId) => {
                setShowHistory(false)
                void panel.openThread(threadId)
              }}
            />
          ) : transcriptEmpty ? (
            // Cohesion-debt 2026-07-19, item #2: the Assistant's empty state is THE
            // kit EmptyState (next-step variant) with pickable suggestions — one
            // empty-state grammar app-wide, no bespoke local copy.
            <EmptyState
              nested
              variant="next-step"
              title={t('assistant.empty.title')}
              copy={t('assistant.empty.body')}
              suggestions={SUGGESTION_KEYS.map((k) => {
                const label = t(k)
                return { label, onSelect: () => void submit(label) }
              })}
            />
          ) : (
            <Transcript
              items={panel.transcript}
              chips={panel.chips}
              error={panel.error}
              errorTitle={t('assistant.error.title')}
              errorCta={t('assistant.error.cta')}
              onRetry={() => void panel.retry()}
              onApprove={panel.approve}
              onDeny={panel.deny}
              pendingQuestion={panel.pendingQuestion}
              onAnswer={panel.answer}
              freeTextPlaceholder={t('assistant.question.freeTextPlaceholder')}
              freeTextSubmitLabel={t('assistant.question.freeTextSubmit')}
              ratings={panel.ratings}
              onRate={panel.rate}
              ratingLabels={{
                up: t('assistant.rating.up'),
                down: t('assistant.rating.down'),
                reasonLabel: t('assistant.rating.reason.label'),
                reasons: DOWNVOTE_REASONS.map((r) => ({ id: r, label: t(`assistant.rating.reason.${r}`) })),
              }}
            />
          )}
        </div>

        {/* Stuck banner */}
        {panel.isStuck && panel.phase === 'running' && (
          <StuckRunBanner banner={t('assistant.stuck.banner')} stopLabel={t('assistant.stuck.stop')} onStop={() => panel.stop()} />
        )}

        {/* Composer — no Stop here (OD-REDESIGN-91 #40): the stuck-run banner owns the one Stop. */}
        <Composer
          placeholder={t('assistant.composer.placeholder')}
          sendLabel={t('assistant.send')}
          streamingLabel={t('assistant.streaming')}
          value={draft}
          onChange={setDraft}
          onSubmit={onSubmit}
          onKeyDown={onKeyDown}
          canSend={canSend}
          running={panel.phase === 'running'}
        />
          </div>
        ),
      }}
    />
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Transcript({
  items, chips, error, errorTitle, errorCta, onRetry, onApprove, onDeny,
  pendingQuestion, onAnswer, freeTextPlaceholder, freeTextSubmitLabel,
  ratings, onRate, ratingLabels,
}: {
  items: TranscriptItem[]
  chips: ChipState[]
  error: string | null
  errorTitle: string
  errorCta: string
  onRetry: () => void
  onApprove: (pendingId: string) => void
  onDeny: (pendingId: string) => void
  pendingQuestion: PendingQuestion | null
  onAnswer: (questionId: string, optionId?: string, freeText?: string) => void
  freeTextPlaceholder: string
  freeTextSubmitLabel: string
  ratings: Record<string, AssistantRating>
  onRate: (eventId: string, rating: AssistantRating, reason?: string) => void
  ratingLabels: RatingLabels
}) {
  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <div key={item.id} className="flex flex-col" style={{ alignItems: item.role === 'user' ? 'flex-end' : 'flex-start' }}>
          <div
            className="flex"
            style={{ justifyContent: item.role === 'user' ? 'flex-end' : 'flex-start' }}
          >
            {item.widget ? (
              <div
                className="rounded-md text-sm"
                style={{
                  width: '100%',
                  maxWidth: '100%',
                  padding: '0.75rem',
                  background: 'var(--surface-secondary)',
                  color: 'var(--text-primary)',
                }}
              >
                <AssistantWidgetSlot widget={item.widget} />
              </div>
            ) : (
              <div
                className="rounded-md text-sm whitespace-pre-wrap break-words"
                style={{
                  maxWidth: '85%',
                  padding: '0.5rem 0.75rem',
                  background: item.role === 'user' ? 'var(--accent)' : 'var(--surface-secondary)',
                  color: item.role === 'user' ? 'var(--text-inverted)' : 'var(--text-primary)',
                }}
              >
                {item.role === 'assistant' ? <AssistantMarkdown source={item.text} /> : item.text}
              </div>
            )}
          </div>
          {item.role === 'assistant' && (
            <RatingControl
              eventId={item.id}
              rating={ratings[item.id]}
              onRate={onRate}
              labels={ratingLabels}
            />
          )}
        </div>
      ))}
      {chips.map((chip) => (
        <ApprovalChip key={chip.pendingId} chip={chip} onApprove={onApprove} onDeny={onDeny} />
      ))}
      {pendingQuestion && (
        <QuestionChips
          question={pendingQuestion}
          onAnswer={onAnswer}
          freeTextPlaceholder={freeTextPlaceholder}
          freeTextSubmitLabel={freeTextSubmitLabel}
        />
      )}
      {error && (
        <div
          className="rounded-md border border-border bg-secondary flex items-center gap-2"
          style={{ padding: '0.625rem 0.75rem' }}
          role="alert"
        >
          <span className="text-foreground flex-1" style={{ fontSize: 13 }}>{errorTitle}</span>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-sm border border-border text-foreground"
            style={{ padding: '0.25rem 0.5rem', fontSize: 13 }}
          >
            {errorCta}
          </button>
        </div>
      )}
    </div>
  )
}

/** ApprovalChip — the needs-approval affordance. Buttons localize; the humanSummary is server-
 *  composed (FR-P2-WT-002) and shown verbatim as plain text. */
function ApprovalChip({ chip, onApprove, onDeny }: { chip: ChipState; onApprove: (pendingId: string) => void; onDeny: (pendingId: string) => void }) {
  const t = useT()
  const approveLabel = t('assistant.approval.approve')
  const denyLabel = t('assistant.approval.deny')
  const pending = chip.state === 'pending'
  return (
    <div
      className="rounded-md border bg-secondary flex flex-col gap-2"
      style={{ borderColor: 'var(--border-accent)', padding: '0.625rem 0.75rem' }}
    >
      <div className="text-muted-foreground" style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {t('assistant.approval.header')}
      </div>
      {/* Plain text — the server-composed summary, never model HTML. */}
      <div className="text-foreground" style={{ fontSize: 14 }}>{chip.humanSummary}</div>
      {pending ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onApprove(chip.pendingId)}
            className="rounded-sm font-medium flex-1"
            style={{ background: 'var(--accent)', color: 'var(--text-inverted)', padding: '0.4rem 0.5rem', fontSize: 14 }}
          >
            {approveLabel}
          </button>
          <button
            type="button"
            onClick={() => onDeny(chip.pendingId)}
            className="rounded-sm font-medium flex-1 border border-border"
            style={{ padding: '0.4rem 0.5rem', fontSize: 14 }}
          >
            {denyLabel}
          </button>
        </div>
      ) : (
        <div className="text-muted-foreground" style={{ fontSize: 12 }}>
          {chip.state === 'approved' ? approveLabel : denyLabel}
        </div>
      )}
    </div>
  )
}

/**
 * QuestionChips — the ask_user clarifying-question affordance (P3a Phase D, AC-P3-AU-004).
 * Renders the server-composed prompt (plain text) + tappable option chips; tapping a chip calls
 * answer(questionId, optionId). When allowFreeText is set, an inline free-text box + submit button
 * offer a typed answer instead (answer(questionId, undefined, freeText)).
 */
function QuestionChips({
  question, onAnswer, freeTextPlaceholder, freeTextSubmitLabel,
}: {
  question: PendingQuestion
  onAnswer: (questionId: string, optionId?: string, freeText?: string) => void
  freeTextPlaceholder: string
  freeTextSubmitLabel: string
}) {
  const [freeText, setFreeText] = useState('')
  return (
    <div
      className="rounded-md border bg-secondary flex flex-col gap-2"
      style={{ borderColor: 'var(--border-accent)', padding: '0.625rem 0.75rem' }}
    >
      {/* Plain text — the server-composed question prompt, never model HTML. */}
      <div className="text-foreground" style={{ fontSize: 14 }}>{question.prompt}</div>
      <div className="flex flex-wrap gap-2">
        {question.options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onAnswer(question.questionId, opt.id)}
            className="rounded-sm font-medium border border-border text-foreground"
            style={{ padding: '0.4rem 0.625rem', fontSize: 14 }}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {question.allowFreeText && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const trimmed = freeText.trim()
            if (!trimmed) return
            onAnswer(question.questionId, undefined, trimmed)
            setFreeText('')
          }}
        >
          <input
            type="text"
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            placeholder={freeTextPlaceholder}
            aria-label={freeTextPlaceholder}
            className="bg-background border-border text-foreground rounded-sm flex-1 min-w-0"
            style={{ padding: '0.4rem 0.625rem', fontSize: 14 }}
          />
          <button
            type="submit"
            disabled={!freeText.trim()}
            className="rounded-sm font-medium flex-none"
            style={{ padding: '0.4rem 0.625rem', fontSize: 14, background: 'var(--accent)', color: 'var(--text-inverted)', opacity: freeText.trim() ? 1 : 0.5 }}
          >
            {freeTextSubmitLabel}
          </button>
        </form>
      )}
    </div>
  )
}

/**
 * RatingControl — 👍/👎 on each assistant turn (P3a Phase E, T23, AC-P3-FB-002). A downvote opens
 * an inline reason picker (inaccurate|not_helpful|wrong_tool|too_slow); choosing a reason submits
 * the rate() call with it. Once rated, the control shows the resolved state (no re-tap loop).
 */
function RatingControl({
  eventId, rating, onRate, labels,
}: {
  eventId: string
  rating: AssistantRating | undefined
  onRate: (eventId: string, rating: AssistantRating, reason?: string) => void
  labels: RatingLabels
}) {
  const [pickingReason, setPickingReason] = useState(false)

  if (rating) {
    return (
      <div className="text-muted-foreground" style={{ fontSize: 12, marginTop: '0.25rem' }}>
        {rating === 'up' ? labels.up : labels.down}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1" style={{ marginTop: '0.25rem' }}>
      <div className="flex gap-1">
        <button
          type="button"
          aria-label={labels.up}
          title={labels.up}
          onClick={() => onRate(eventId, 'up')}
          className="text-muted-foreground hover:text-foreground rounded-sm flex items-center justify-center"
          style={{ width: 24, height: 24 }}
        >
          <ThumbsUpIcon />
        </button>
        <button
          type="button"
          aria-label={labels.down}
          title={labels.down}
          onClick={() => setPickingReason(true)}
          className="text-muted-foreground hover:text-foreground rounded-sm flex items-center justify-center"
          style={{ width: 24, height: 24 }}
        >
          <ThumbsDownIcon />
        </button>
      </div>
      {pickingReason && (
        <div
          className="rounded-md border border-border bg-secondary flex flex-col gap-2"
          style={{ padding: '0.5rem 0.625rem', maxWidth: '85%' }}
        >
          <div className="text-muted-foreground" style={{ fontSize: 12 }}>{labels.reasonLabel}</div>
          <div className="flex flex-wrap gap-1">
            {labels.reasons.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  onRate(eventId, 'down', r.id)
                  setPickingReason(false)
                }}
                className="rounded-sm border border-border text-foreground"
                style={{ padding: '0.3rem 0.5rem', fontSize: 12 }}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StuckRunBanner({ banner, stopLabel, onStop }: { banner: string; stopLabel: string; onStop: () => void }) {
  return (
    <div
      className="border-border bg-secondary flex items-center gap-2 flex-none"
      style={{ padding: '0.5rem 0.75rem', borderBottomWidth: 1, borderBottomStyle: 'solid' }}
      role="status"
    >
      <span className="text-muted-foreground flex-1" style={{ fontSize: 13 }}>{banner}</span>
      <button
        type="button"
        onClick={onStop}
        className="rounded-sm border border-border text-foreground"
        style={{ padding: '0.25rem 0.5rem', fontSize: 13 }}
      >
        {stopLabel}
      </button>
    </div>
  )
}

function Composer({
  placeholder, sendLabel, streamingLabel, value, onChange, onSubmit, onKeyDown, canSend, running,
}: {
  placeholder: string
  sendLabel: string
  streamingLabel: string
  value: string
  onChange: (v: string) => void
  onSubmit: (e: FormEvent) => void
  onKeyDown: (e: ReactKeyboardEvent<HTMLTextAreaElement>) => void
  canSend: boolean
  running: boolean
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="border-border flex items-end gap-2 flex-none"
      style={{ padding: '0.625rem 0.75rem', borderTopWidth: 1, borderTopStyle: 'solid' }}
    >
      <textarea
        className="bg-secondary border-border text-foreground rounded-md flex-1 min-w-0 resize-none"
        style={{ padding: '0.5rem 0.625rem', fontSize: 14, minHeight: 40, maxHeight: 140 }}
        aria-label={placeholder}
        placeholder={placeholder}
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
      {running ? (
        // OD-REDESIGN-91 #40 (G4): ONE Deputy Stop — the stuck-run banner owns Stop. The composer
        // no longer duplicates it; while running it shows only the streaming indicator.
        <span className="text-muted-foreground" style={{ fontSize: 13 }} aria-live="polite">{streamingLabel}</span>
      ) : (
        <button
          type="submit"
          disabled={!canSend}
          className="rounded-sm font-medium flex-none"
          style={{
            height: 40,
            padding: '0 0.875rem',
            fontSize: 14,
            background: 'var(--accent)',
            color: 'var(--text-inverted)',
            opacity: canSend ? 1 : 0.5,
          }}
        >
          {sendLabel}
        </button>
      )}
    </form>
  )
}

// ── Icons (16px, stroke-2, aria-hidden) ───────────────────────────────────────

function PlusIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}
function HistoryIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path d="M3 3v5h5" />
      <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
      <path d="M12 7v5l4 2" />
    </svg>
  )
}
function ThumbsUpIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path d="M7 10v12" />
      <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
    </svg>
  )
}
function ThumbsDownIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path d="M17 14V2" />
      <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
    </svg>
  )
}
