/**
 * useAssistantPanel — the panel's runtime state owner (T25, P2-slimmed port of the sibling
 * reference's useAssistantPanel).
 *
 * Owns: `transcript` (the rendered user/assistant turns), `phase` (idle|running|error — credits
 * are P3, so RATE_LIMITED maps to 'error'), the approve/deny `chips` map, the active `runId`, and
 * the SSE `drain` that folds agent-chat events into state.
 *
 * P2-slimmed vs the sibling reference: DROPS answerQuestion/answeredMap/hasPendingQuestion (P3
 * ask_user), the analytics/PostHog calls (MOS has no analytics SDK), and the credits branch.
 * KEEPS: send/stop/retry/newConversation/approve/deny/openThread, drain, the chip-state flow
 * (`status{needs-approval}`→pending, `tool{pendingId}`→approved, `system{write_resolved}`→
 * approved/denied), and `phase`.
 *
 * AC-AP-002 (transcript survives across phases), AC-WT-001/002 (chip flow).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAgentRuntime } from '@/lib/agent/runtime/AgentRuntimeContext'
import { makeId } from '@/lib/agent/runtime/makeId'
import { loadThreadForDisplay } from '@/lib/agent/history'
import type {
  AgentEvent, NeedsApprovalPayload, RunStatusPayload, WriteResolvedPayload, QuestionPayload,
} from '@/lib/agent/runtime/port'

export type RunPhase = 'idle' | 'running' | 'error'

export interface TranscriptItem {
  id: string
  role: 'user' | 'assistant'
  text: string
}

export interface ChipState {
  pendingId: string
  actionName: string
  humanSummary: string
  state: 'pending' | 'approved' | 'denied'
}

/** A pending ask_user question awaiting the user's answer (P3a, T21, FR-P3-AU-001). */
export interface PendingQuestion {
  questionId: string
  prompt: string
  options: { id: string; label: string }[]
  allowFreeText?: boolean
}

/** How long a running phase may go without progress before the stuck banner shows. */
const STUCK_TIMEOUT_MS = 5000

export function useAssistantPanel() {
  const { runtime } = useAgentRuntime()

  const [transcript, setTranscript] = useState<TranscriptItem[]>([])
  const [phase, setPhase] = useState<RunPhase>('idle')
  const [runId, setRunId] = useState<string | null>(null)
  const [chips, setChips] = useState<ChipState[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isStuck, setIsStuck] = useState(false)
  const [pendingQuestion, setPendingQuestion] = useState<PendingQuestion | null>(null)

  // lastProgressAt drives the stuck-run heartbeat: any streamed event refreshes it; a running
  // phase silent for STUCK_TIMEOUT_MS flips isStuck so the banner offers Stop.
  const lastProgressAtRef = useRef<number>(Date.now())
  const activeRunIdRef = useRef<string | null>(null)

  // ── Stuck-run heartbeat ──────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'running') {
      setIsStuck(false)
      return
    }
    const interval = setInterval(() => {
      if (Date.now() - lastProgressAtRef.current > STUCK_TIMEOUT_MS) {
        setIsStuck(true)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [phase])

  const mergeEvent = useCallback((ev: AgentEvent) => {
    lastProgressAtRef.current = Date.now()
    setIsStuck(false)

    switch (ev.type) {
      case 'assistant':
        if (ev.text) {
          setTranscript((prev) => [...prev, { id: ev.id, role: 'assistant', text: ev.text! }])
        }
        break
      case 'status': {
        const payload = ev.payload as RunStatusPayload | NeedsApprovalPayload | QuestionPayload
        // ask_user (P3a, FR-P3-AU-001): rides the `status` channel but WITHOUT an AgentRunStatus
        // `status` field of its own — distinguished by `payload.kind`, not `payload.status`. The
        // run pauses (the stream ends) awaiting the answer; phase stays 'running' (not idle) so
        // the composer stays disabled until the question resolves — mirrors the needs-approval
        // pending-chip UX (the run is "paused for input", not "idle").
        if ((payload as QuestionPayload)?.kind === 'question') {
          const q = payload as QuestionPayload
          setPendingQuestion({ questionId: q.questionId, prompt: q.prompt, options: q.options, allowFreeText: q.allowFreeText })
        } else if ((payload as RunStatusPayload).status === 'needs-approval') {
          const na = payload as NeedsApprovalPayload
          setChips((prev) => [
            ...prev,
            { pendingId: na.pendingId, actionName: na.actionName, humanSummary: na.humanSummary, state: 'pending' },
          ])
        } else if ((payload as RunStatusPayload).status === 'completed' || (payload as RunStatusPayload).status === 'cancelled') {
          setPhase('idle')
        } else if ((payload as RunStatusPayload).status === 'error') {
          setPhase('error')
          setError((payload as RunStatusPayload).error ?? 'error')
        }
        break
      }
      case 'tool': {
        // A tool event carrying a pendingId marks the write as executed (approved path).
        const payload = ev.payload as { pendingId?: string }
        if (payload?.pendingId) {
          setChips((prev) =>
            prev.map((c) => (c.pendingId === payload.pendingId && c.state === 'pending' ? { ...c, state: 'approved' } : c)),
          )
        }
        break
      }
      case 'system': {
        const payload = ev.payload as WriteResolvedPayload | undefined
        if (payload?.event === 'write_resolved' && payload.pendingId) {
          const state = payload.decision === 'approved' ? 'approved' : 'denied'
          setChips((prev) => prev.map((c) => (c.pendingId === payload.pendingId ? { ...c, state } : c)))
        }
        break
      }
      // 'user' events are server echoes of the user turn — the hook appends the user message
      // optimistically on send(), so the echo is ignored to avoid duplicates.
      default:
        break
    }
  }, [])

  /** Consume a run's SSE stream, folding events into transcript/chips/phase. */
  const drain = useCallback(
    async (id: string) => {
      if (!runtime) return
      try {
        for await (const ev of runtime.subscribe(id)) {
          mergeEvent(ev)
        }
      } catch {
        // A network/abort failure surfaces as an error phase (cancel aborts cleanly — see stop()).
        setPhase((prev) => (prev === 'running' ? 'error' : prev))
        setError('network')
      }
    },
    [runtime, mergeEvent],
  )

  // ── Public actions ───────────────────────────────────────────────────────────

  const send = useCallback(
    async (goal: string) => {
      if (!runtime) return
      setPhase('running')
      setError(null)
      setIsStuck(false)
      lastProgressAtRef.current = Date.now()
      setTranscript((prev) => [...prev, { id: makeId(), role: 'user', text: goal }])

      // CQ#2/SEC-Medium (conversation-model fix): a run already active on this panel surface
      // (i.e. a second-or-later turn in the SAME conversation) follows up on it rather than
      // minting a new thread/run — otherwise every send() fragmented the conversation into
      // orphan single-turn threads. Only the FIRST turn (no active run yet, or after
      // newConversation()/openThread() reset activeRunIdRef) creates a new run.
      if (activeRunIdRef.current) {
        const runId = activeRunIdRef.current
        await runtime.followUp(runId, goal)
        await drain(runId)
        return
      }

      const run = await runtime.createRun({ goal })
      setRunId(run.id)
      activeRunIdRef.current = run.id
      await drain(run.id)
    },
    [runtime, drain],
  )

  const decide = useCallback(
    async (pendingId: string, verdict: 'approve' | 'reject') => {
      if (!runtime || !activeRunIdRef.current) return
      setPhase('running')
      setIsStuck(false)
      lastProgressAtRef.current = Date.now()
      await runtime.control(activeRunIdRef.current, verdict, { pendingId })
      await drain(activeRunIdRef.current)
    },
    [runtime, drain],
  )

  const approve = useCallback((pendingId: string) => decide(pendingId, 'approve'), [decide])
  const deny = useCallback((pendingId: string) => decide(pendingId, 'reject'), [decide])

  /**
   * answer(questionId, optionId?, freeText?) — resolve a pending ask_user question (P3a, T21,
   * FR-P3-AU-002/AC-P3-AU-004). Clears pendingQuestion immediately (the chips disappear on tap,
   * mirroring the approve/deny chip's optimistic-in-flight feel) and continues the SAME run via
   * runtime.control('answer', ...) + drain.
   */
  const answer = useCallback(
    async (questionId: string, optionId?: string, freeText?: string) => {
      if (!runtime || !activeRunIdRef.current) return
      setPendingQuestion(null)
      setPhase('running')
      setIsStuck(false)
      lastProgressAtRef.current = Date.now()
      await runtime.control(activeRunIdRef.current, 'answer', {
        answer: { questionId, ...(optionId !== undefined ? { optionId } : {}), ...(freeText !== undefined ? { freeText } : {}) },
      })
      await drain(activeRunIdRef.current)
    },
    [runtime, drain],
  )

  const stop = useCallback(() => {
    if (!runtime || !activeRunIdRef.current) return
    void runtime.control(activeRunIdRef.current, 'cancel', {})
    setPhase('idle')
    setIsStuck(false)
  }, [runtime])

  const retry = useCallback(async () => {
    if (!runtime || !activeRunIdRef.current) return
    setPhase('running')
    setError(null)
    setIsStuck(false)
    lastProgressAtRef.current = Date.now()
    await drain(activeRunIdRef.current)
  }, [runtime, drain])

  const newConversation = useCallback(() => {
    activeRunIdRef.current = null
    setTranscript([])
    setChips([])
    setRunId(null)
    setError(null)
    setPhase('idle')
    setIsStuck(false)
    setPendingQuestion(null)
  }, [])

  // P3a (T6, AC-P3-RP-003): opening a prior thread loads its transcript from the DB
  // (loadThreadForDisplay — the thread's most-recent run's agent_events, RLS-scoped) and binds
  // that run as the active run via runtime.openThread, so a subsequent send() follows up on it
  // with replay:true (the server reconstructs model context from mos.agent_events — Phase A).
  // A thread with no runs yet (or a read failure — loadThreadForDisplay fails open) resets the
  // surface to a fresh, unbound conversation rather than binding a nonexistent run.
  const openThread = useCallback(async (threadId: string) => {
    setChips([])
    setError(null)
    setPhase('idle')
    setIsStuck(false)
    setPendingQuestion(null)

    const { activeRunId, transcript: loaded } = await loadThreadForDisplay(threadId)

    if (!activeRunId) {
      activeRunIdRef.current = null
      setRunId(null)
      setTranscript([])
      return
    }

    runtime?.openThread(activeRunId)
    activeRunIdRef.current = activeRunId
    setRunId(activeRunId)
    setTranscript(loaded)
  }, [runtime])

  return {
    runtime,
    transcript,
    phase,
    runId,
    chips,
    error,
    isStuck,
    pendingQuestion,
    send,
    stop,
    retry,
    approve,
    deny,
    answer,
    newConversation,
    openThread,
  }
}
