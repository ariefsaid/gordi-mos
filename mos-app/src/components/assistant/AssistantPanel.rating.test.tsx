// T23 (P3a Phase E) — AssistantPanel renders a 👍/👎 control on each assistant turn; a downvote
// shows a reason picker (inaccurate|not_helpful|wrong_tool|too_slow). AC-P3-FB-002.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { AgentRuntimeProvider } from '@/lib/agent/runtime/AgentRuntimeContext'
import { AssistantPanel } from './AssistantPanel'
import type { AgentRuntime, AgentEvent } from '@/lib/agent/runtime/port'

vi.mock('@/lib/supabase', () => ({
  supabase: { schema: vi.fn() },
}))

import { supabase } from '@/lib/supabase'

function assistantReplyScript(): AgentEvent[] {
  return [
    { id: 'assistant-event-1', runId: 'r1', type: 'assistant', text: 'Here is your answer.', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 's1', runId: 'r1', type: 'status', payload: { status: 'completed' }, createdAt: '2026-01-01T00:00:01.000Z' },
  ]
}

function makeFakeRuntime(): AgentRuntime {
  return {
    createRun: vi.fn(async (input: { goal: string }) => ({ id: 'r1', title: input.goal.slice(0, 60), status: 'running' as const })),
    followUp: vi.fn(async () => {}),
    openThread: vi.fn(),
    control: vi.fn(async () => {}),
    subscribe: vi.fn(async function* () {
      for (const ev of assistantReplyScript()) yield ev
    }),
  }
}

function makeSchema(result: { data: unknown; error: unknown } = { data: null, error: null }) {
  const updateCalls: unknown[] = []
  const eqCalls: Array<[string, unknown]> = []
  const fromImpl = () => ({
    update: (patch: unknown) => {
      updateCalls.push(patch)
      return { eq: (col: string, val: unknown) => { eqCalls.push([col, val]); return Promise.resolve(result) } }
    },
  })
  return { from: vi.fn(fromImpl), updateCalls, eqCalls }
}

function renderPanel() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: () => ({
      matches: false,
      media: '',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  })
  localStorage.setItem('mos.assistant.open', 'true')
  return render(
    <I18nProvider>
      <MemoryRouter>
        <AgentRuntimeProvider runtime={makeFakeRuntime()}>
          <AssistantPanel />
        </AgentRuntimeProvider>
      </MemoryRouter>
    </I18nProvider>,
  )
}

describe('AssistantPanel — rating/downvote (T23, AC-P3-FB-002)', () => {
  beforeEach(() => { localStorage.clear() })
  afterEach(() => { vi.restoreAllMocks() })

  it('renders a thumbs-up/down control on the assistant turn', async () => {
    vi.mocked(supabase.schema).mockReturnValue(makeSchema() as never)
    renderPanel()
    fireEvent.change(screen.getByRole('textbox', { name: /ask the deputy/i }), { target: { value: 'hi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(screen.getByText('Here is your answer.')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Good response' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Not helpful' })).toBeInTheDocument()
  })

  it('tapping thumbs-up calls the rate UPDATE with rating=up, downvote_reason=null (no reason picker)', async () => {
    const sch = makeSchema()
    vi.mocked(supabase.schema).mockReturnValue(sch as never)
    renderPanel()
    fireEvent.change(screen.getByRole('textbox', { name: /ask the deputy/i }), { target: { value: 'hi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Good response' })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Good response' }))

    await waitFor(() => {
      expect(sch.updateCalls).toContainEqual({ rating: 'up', downvote_reason: null })
    })
    expect(sch.eqCalls).toContainEqual(['id', 'assistant-event-1'])
    expect(screen.queryByText('What went wrong?')).not.toBeInTheDocument()
  })

  it('tapping thumbs-down shows the reason picker; choosing a reason calls the rate UPDATE with it', async () => {
    const sch = makeSchema()
    vi.mocked(supabase.schema).mockReturnValue(sch as never)
    renderPanel()
    fireEvent.change(screen.getByRole('textbox', { name: /ask the deputy/i }), { target: { value: 'hi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Not helpful' })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Not helpful' }))
    await waitFor(() => expect(screen.getByText('What went wrong?')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Inaccurate' }))

    await waitFor(() => {
      expect(sch.updateCalls).toContainEqual({ rating: 'down', downvote_reason: 'inaccurate' })
    })
  })
})
