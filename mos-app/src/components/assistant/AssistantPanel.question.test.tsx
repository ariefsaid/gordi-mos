// T21 (P3a Phase D) — AssistantPanel renders the ask_user question inline as tappable option
// chips (+ an optional free-text box when allowFreeText), and tapping a chip calls answer().
// AC-P3-AU-004.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { AgentRuntimeProvider } from '@/lib/agent/runtime/AgentRuntimeContext'
import { AssistantPanel } from './AssistantPanel'
import type { AgentRuntime, AgentEvent } from '@/lib/agent/runtime/port'

function questionEv(allowFreeText = false): AgentEvent {
  return {
    id: 'q-ev-1',
    runId: 'r1',
    type: 'status',
    payload: {
      kind: 'question',
      questionId: 'q1',
      prompt: 'Which business unit?',
      options: [{ id: 'bu-1', label: 'Kitchen' }, { id: 'bu-2', label: 'Sales' }],
      ...(allowFreeText ? { allowFreeText: true } : {}),
    },
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

function makeFakeRuntime(opts: { allowFreeText?: boolean } = {}): AgentRuntime {
  let subscribeCall = 0
  return {
    createRun: vi.fn(async (input: { goal: string }) => ({ id: 'r1', title: input.goal.slice(0, 60), status: 'running' as const })),
    followUp: vi.fn(async () => {}),
    openThread: vi.fn(),
    control: vi.fn(async () => {}),
    subscribe: vi.fn(async function* () {
      subscribeCall++
      if (subscribeCall === 1) {
        yield questionEv(opts.allowFreeText)
        return
      }
      yield { id: 'a2', runId: 'r1', type: 'assistant', text: 'Using Kitchen.', createdAt: '2026-01-01T00:00:01.000Z' } as AgentEvent
      yield { id: 's2', runId: 'r1', type: 'status', payload: { status: 'completed' }, createdAt: '2026-01-01T00:00:02.000Z' } as AgentEvent
    }),
  }
}

function renderPanel(runtime: AgentRuntime) {
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
        <AgentRuntimeProvider runtime={runtime}>
          <AssistantPanel />
        </AgentRuntimeProvider>
      </MemoryRouter>
    </I18nProvider>,
  )
}

describe('AssistantPanel — ask_user question chips (T21, AC-P3-AU-004)', () => {
  beforeEach(() => { localStorage.clear() })
  afterEach(() => { vi.restoreAllMocks() })

  it('renders the prompt + tappable option chips', async () => {
    const runtime = makeFakeRuntime()
    renderPanel(runtime)
    fireEvent.change(screen.getByRole('textbox', { name: /ask the deputy/i }), { target: { value: 'create a task' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(screen.getByText('Which business unit?')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Kitchen' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sales' })).toBeInTheDocument()
  })

  it('tapping an option chip calls control(runId, "answer", {answer:{questionId,optionId}})', async () => {
    const runtime = makeFakeRuntime()
    renderPanel(runtime)
    fireEvent.change(screen.getByRole('textbox', { name: /ask the deputy/i }), { target: { value: 'create a task' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Kitchen' })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Kitchen' }))

    await waitFor(() => {
      expect(runtime.control).toHaveBeenCalledWith('r1', 'answer', { answer: { questionId: 'q1', optionId: 'bu-1' } })
    })
    await waitFor(() => expect(screen.getByText('Using Kitchen.')).toBeInTheDocument())
    // The chips are gone once resolved.
    expect(screen.queryByRole('button', { name: 'Kitchen' })).not.toBeInTheDocument()
  })

  it('allowFreeText renders a free-text box + submit calls answer() with freeText', async () => {
    const runtime = makeFakeRuntime({ allowFreeText: true })
    renderPanel(runtime)
    fireEvent.change(screen.getByRole('textbox', { name: /ask the deputy/i }), { target: { value: 'create a task' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(screen.getByText('Which business unit?')).toBeInTheDocument())

    const freeTextBox = screen.getByPlaceholderText('Type your own answer…')
    fireEvent.change(freeTextBox, { target: { value: 'Marketing' } })
    fireEvent.click(screen.getByRole('button', { name: 'Answer' }))

    await waitFor(() => {
      expect(runtime.control).toHaveBeenCalledWith('r1', 'answer', { answer: { questionId: 'q1', freeText: 'Marketing' } })
    })
  })

  it('without allowFreeText, no free-text box renders', async () => {
    const runtime = makeFakeRuntime({ allowFreeText: false })
    renderPanel(runtime)
    fireEvent.change(screen.getByRole('textbox', { name: /ask the deputy/i }), { target: { value: 'create a task' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(screen.getByText('Which business unit?')).toBeInTheDocument())
    expect(screen.queryByPlaceholderText('Type your own answer…')).not.toBeInTheDocument()
  })
})
