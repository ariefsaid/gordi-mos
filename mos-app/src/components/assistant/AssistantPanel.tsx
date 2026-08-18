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
    // OD-REDESIGN-91 #10 (owner's variant): Shift+Enter SENDS; plain Enter inserts a newline.
    // Deputy changed from Enter=send to match the Signal composer — one composer contract app-wide.
    if (e.key === 'Enter' && e.shiftKey) {
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
        <div ref={scrollRef} className="assistant-body flex-1 min-h-0 overflow-y-auto">
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
              speakerLabel={t('assistant.title')}
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
          sendHint={t('assistant.composer.sendHint')}
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
  items, chips, speakerLabel, error, errorTitle, errorCta, onRetry, onApprove, onDeny,
  pendingQuestion, onAnswer, freeTextPlaceholder, freeTextSubmitLabel,
  ratings, onRate, ratingLabels,
}: {
  items: TranscriptItem[]
  chips: ChipState[]
  speakerLabel: string
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
  // OD-REDESIGN-91 #1 — HYBRID chrome (variant C, deputy-bubble-pick.html):
  //  · user turns  → a compact right-aligned bubble
  //  · Deputy prose → BARE (no bubble), left-aligned, under a small DEPUTY speaker label
  //  · widgets / tool-output → FULL-WIDTH first-class blocks, never inside a bubble
  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => {
        // Widgets stand alone as full-width first-class blocks (their own chrome, no tint/bubble).
        if (item.widget) {
          return (
            <div key={item.id} className="assistant-turn assistant-turn--widget">
              <AssistantWidgetSlot widget={item.widget} />
            </div>
          )
        }
        // User turns keep the chat bubble (right-aligned).
        if (item.role === 'user') {
          return (
            <div key={item.id} className="assistant-turn assistant-turn--user">
              <div className="assistant-bubble assistant-bubble--user">{item.text}</div>
            </div>
          )
        }
        // Deputy prose — bare, with a small speaker label; rating hangs below.
        return (
          <div key={item.id} className="assistant-turn assistant-turn--deputy">
            <div className="assistant-speaker">{speakerLabel}</div>
            <div className="assistant-prose">
              <AssistantMarkdown source={item.text} />
            </div>
            <RatingControl
              eventId={item.id}
              rating={ratings[item.id]}
              onRate={onRate}
              labels={ratingLabels}
            />
          </div>
        )
      })}
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
          className="assistant-banner--error rounded-md border border-border bg-secondary flex items-center gap-2"
          role="alert"
        >
          <span className="assistant-banner__text text-foreground flex-1">{errorTitle}</span>
          <button
            type="button"
            onClick={onRetry}
            className="assistant-banner__btn rounded-sm border border-border text-foreground"
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
    <div className="assistant-chip-card rounded-md border bg-secondary flex flex-col gap-2">
      <div className="assistant-chip-card__header text-muted-foreground">
        {t('assistant.approval.header')}
      </div>
      {/* Plain text — the server-composed summary, never model HTML. */}
      <div className="assistant-chip-card__text text-foreground">{chip.humanSummary}</div>
      {pending ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onApprove(chip.pendingId)}
            className="assistant-chip-btn assistant-chip-btn--approve rounded-sm font-medium flex-1"
          >
            {approveLabel}
          </button>
          <button
            type="button"
            onClick={() => onDeny(chip.pendingId)}
            className="assistant-chip-btn assistant-chip-btn--deny rounded-sm font-medium flex-1 border border-border"
          >
            {denyLabel}
          </button>
        </div>
      ) : (
        <div className="assistant-chip-card__meta text-muted-foreground">
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
    <div className="assistant-chip-card rounded-md border bg-secondary flex flex-col gap-2">
      {/* Plain text — the server-composed question prompt, never model HTML. */}
      <div className="assistant-chip-card__text text-foreground">{question.prompt}</div>
      <div className="flex flex-wrap gap-2">
        {question.options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onAnswer(question.questionId, opt.id)}
            className="assistant-chip-btn rounded-sm font-medium border border-border text-foreground"
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
            className="assistant-chip-input bg-background border-border text-foreground rounded-sm flex-1 min-w-0"
          />
          <button
            type="submit"
            disabled={!freeText.trim()}
            className="assistant-chip-btn assistant-chip-btn--submit rounded-sm font-medium flex-none"
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
      <div className="assistant-rating-meta text-muted-foreground">
        {rating === 'up' ? labels.up : labels.down}
      </div>
    )
  }

  return (
    <div className="assistant-rating-row flex flex-col gap-1">
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
        <div className="assistant-rating-picker rounded-md border border-border bg-secondary flex flex-col gap-2">
          <div className="assistant-chip-card__meta text-muted-foreground">{labels.reasonLabel}</div>
          <div className="flex flex-wrap gap-1">
            {labels.reasons.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  onRate(eventId, 'down', r.id)
                  setPickingReason(false)
                }}
                className="assistant-rating-reason-btn rounded-sm border border-border text-foreground"
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
      className="assistant-banner border-border bg-secondary flex items-center gap-2 flex-none"
      role="status"
    >
      <span className="assistant-banner__text text-muted-foreground flex-1">{banner}</span>
      <button
        type="button"
        onClick={onStop}
        className="assistant-banner__btn rounded-sm border border-border text-foreground"
      >
        {stopLabel}
      </button>
    </div>
  )
}

function Composer({
  placeholder, sendLabel, sendHint, streamingLabel, value, onChange, onSubmit, onKeyDown, canSend, running,
}: {
  placeholder: string
  sendLabel: string
  sendHint: string
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
      className="assistant-composer assistant-composer-form border-border flex-none"
    >
      <div className="assistant-composer-row flex items-end gap-2">
        <textarea
          className="assistant-composer-input bg-secondary border-border text-foreground rounded-md flex-1 min-w-0 resize-none"
          aria-label={placeholder}
          placeholder={placeholder}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {running ? (
          // OD-REDESIGN-91 #40 (G4): ONE Deputy Stop — the stuck-run banner owns Stop. The composer
          // shows only the streaming indicator while running.
          <span className="assistant-banner__text text-muted-foreground" aria-live="polite">{streamingLabel}</span>
        ) : (
          <button
            type="submit"
            disabled={!canSend}
            className="assistant-send-btn rounded-sm font-medium flex-none"
          >
            {sendLabel}
          </button>
        )}
      </div>
      {/* OD-REDESIGN-91 #10 — quiet Send hint; hidden on touch (no physical keyboard). */}
      {!running && <span className="assistant-composer-hint">{sendHint}</span>}
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
