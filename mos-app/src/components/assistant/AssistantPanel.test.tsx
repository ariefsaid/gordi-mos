// T27 — AssistantPanel slide-over. AC-AP-001 (renders open), AC-AP-002 (keep-mounted: transcript
// survives close→open), AC-AP-003 (inert when closed), AC-AP-004 (plain-text only, no innerHTML),
// a11y (role/aria/Esc/focus-trap). Phone = modal dialog; desktop = complementary drawer.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { AgentRuntimeProvider } from '@/lib/agent/runtime/AgentRuntimeContext'
import { useAgentRuntime } from '@/lib/agent/runtime/AgentRuntimeContext'
import { AssistantPanel } from './AssistantPanel'
import type { AgentRuntime, AgentEvent } from '@/lib/agent/runtime/port'

// A test harness button that calls openPanel() — lets the test reopen the keep-mounted panel.
function OpenHarness() {
  const { openPanel } = useAgentRuntime()
  return createElement('button', { type: 'button', onClick: openPanel }, 'reopen')
}

function replyScript(): AgentEvent[] {
  return [
    { id: 'a1', runId: 'r1', type: 'assistant', text: 'Sure — here is your answer.', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 's1', runId: 'r1', type: 'status', payload: { status: 'completed' }, createdAt: '2026-01-01T00:00:01.000Z' },
  ]
}

function makeFakeRuntime(): AgentRuntime {
  return {
    createRun: vi.fn(async (input: { goal: string }) => ({ id: 'r1', title: input.goal.slice(0, 60), status: 'running' as const })),
    followUp: vi.fn(async () => {}),
    control: vi.fn(async () => {}),
    subscribe: vi.fn(async function* () {
      for (const ev of replyScript()) yield ev
    }),
  }
}

function renderPanel({ narrow, open }: { narrow: boolean; open: boolean }) {
  // matchMedia stub: narrow=true → phone (dialog); false → desktop (complementary).
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: narrow,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  })
  localStorage.setItem('mos.assistant.open', open ? 'true' : 'false')
  return render(
    <I18nProvider>
      <MemoryRouter>
        <AgentRuntimeProvider runtime={makeFakeRuntime()}>
          <AssistantPanel />
          <OpenHarness />
        </AgentRuntimeProvider>
      </MemoryRouter>
    </I18nProvider>,
  )
}

describe('AssistantPanel (T27)', () => {
  beforeEach(() => { localStorage.clear() })
  afterEach(() => { vi.restoreAllMocks() })

  it('AC-AP-001: phone renders a modal dialog named by assistant.title when open', () => {
    renderPanel({ narrow: true, open: true })
    expect(screen.getByRole('dialog', { name: 'Deputy' })).toBeInTheDocument()
  })

  it('AC-AP-001: desktop renders a complementary drawer region when open (non-modal)', () => {
    renderPanel({ narrow: false, open: true })
    expect(screen.getByRole('complementary', { name: 'Deputy' })).toBeInTheDocument()
    // Desktop is non-modal: no dialog landmark.
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('AC-AP-003: when closed, the panel is inert + aria-hidden (keep-mounted, hidden from AT)', () => {
    renderPanel({ narrow: true, open: false })
    // Keep-mounted: the container is in the DOM but inert.
    const region = document.querySelector('[aria-hidden="true"][inert]')
    expect(region).not.toBeNull()
  })

  it('AC-AP-002: transcript survives close→open (keep-mounted, state preserved)', async () => {
    const { container } = renderPanel({ narrow: false, open: true })
    // Send a message → an assistant reply lands in the transcript.
    const input = screen.getByRole('textbox', { name: /ask the deputy/i }) as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: 'hello deputy' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(screen.getByText('Sure — here is your answer.')).toBeInTheDocument())

    // Close the panel (Esc) → it becomes inert/hidden but stays mounted.
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByText('Sure — here is your answer.')).not.toBeNull())
    // The reply text node is still in the DOM (keep-mounted) — query off the container.
    expect(container.textContent).toContain('Sure — here is your answer.')

    // Reopen → the reply is visible again (transcript survived).
    fireEvent.click(screen.getByRole('button', { name: 'reopen' }))
    await waitFor(() => expect(screen.getByText('Sure — here is your answer.')).toBeInTheDocument())
  })

  it('AC-AP-004: assistant replies render as plain text (no dangerouslySetInnerHTML artifact)', async () => {
    renderPanel({ narrow: false, open: true })
    fireEvent.change(screen.getByRole('textbox', { name: /ask the deputy/i }), { target: { value: 'hi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    const reply = await screen.findByText('Sure — here is your answer.')
    // The message bubble holds only a text node — no element children (no innerHTML injection point).
    expect(reply.children.length).toBe(0)
    expect(reply.textContent).toBe('Sure — here is your answer.')
  })

  it('a11y: Esc closes the open panel (never cancels a run silently)', () => {
    renderPanel({ narrow: true, open: true })
    expect(screen.getByRole('dialog', { name: 'Deputy' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    // After Esc the panel is hidden (inert + aria-hidden); no dialog landmark is exposed.
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('empty state: shows the three suggestion chips when the transcript is empty', () => {
    renderPanel({ narrow: false, open: true })
    expect(screen.getByText("What's on my plate this week?")).toBeInTheDocument()
    expect(screen.getByText('Draft my weekly update')).toBeInTheDocument()
    expect(screen.getByText("Show last week's revenue")).toBeInTheDocument()
  })

  it('composer: Send button is disabled until there is input text', () => {
    renderPanel({ narrow: false, open: true })
    const send = screen.getByRole('button', { name: 'Send' })
    expect(send).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox', { name: /ask the deputy/i }), { target: { value: 'x' } })
    expect(send).not.toBeDisabled()
  })
})
