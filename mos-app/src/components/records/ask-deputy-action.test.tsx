// Record-scoped "Ask Deputy" (V3 brave slice 1). Proves the quiet affordance in the RecordPanelHost
// actions seam opens the EXISTING Deputy panel pre-seeded with a compact record reference — for both
// task and signal records — and NEVER auto-sends. The seed is single-shot (a later reopen is clean).
//
// #758 adds the labelled FOOTER placement (AC-045) and the phone-Back-row accessible name (AC-046):
// the door on a Task record is a labelled footer control on desktop and the ✦ in the Back row on
// phone, both carrying the accessible name "Ask Deputy about this Task".
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { AgentRuntimeProvider, useAgentRuntime } from '@/lib/agent/runtime/AgentRuntimeContext'
import type { AgentRuntime, AgentEvent } from '@/lib/agent/runtime/port'
import { AssistantPanel } from '@/components/assistant/AssistantPanel'
import { AskDeputyAction } from './ask-deputy-action'

function makeFakeRuntime(): AgentRuntime {
  return {
    createRun: vi.fn(async (input: { goal: string }) => ({ id: 'r1', title: input.goal.slice(0, 60), status: 'running' as const })),
    followUp: vi.fn(async () => {}),
    openThread: vi.fn(),
    control: vi.fn(async () => {}),
    subscribe: vi.fn(async function* (): AsyncGenerator<AgentEvent> {}),
  }
}

// A plain launcher (calls openPanel with no seed) — lets a test prove the single-shot behaviour.
function PlainLauncher() {
  const { openPanel } = useAgentRuntime()
  return createElement('button', { type: 'button', onClick: () => openPanel() }, 'plain open')
}

function renderWithPanel(children: React.ReactNode, runtime: AgentRuntime | null = makeFakeRuntime()) {
  // Desktop, non-narrow: Deputy renders as a complementary drawer.
  Object.defineProperty(window, 'matchMedia', {
    writable: true, configurable: true,
    value: (query: string) => ({
      matches: query.includes('min-width'), media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    }),
  })
  localStorage.setItem('mos.assistant.open', 'false')
  return render(
    <I18nProvider>
      <MemoryRouter>
        <AgentRuntimeProvider runtime={runtime}>
          {children}
          <AssistantPanel />
          <PlainLauncher />
        </AgentRuntimeProvider>
      </MemoryRouter>
    </I18nProvider>,
  )
}

const composer = () => screen.getByRole('textbox', { name: /ask the deputy/i }) as HTMLTextAreaElement

describe('AskDeputyAction (V3 brave slice 1 — record-scoped Ask Deputy)', () => {
  beforeEach(() => { localStorage.clear() })
  afterEach(() => { vi.restoreAllMocks() })

  it('renders the quiet affordance on a task record and opens Deputy pre-seeded with the task reference', async () => {
    const runtime = makeFakeRuntime()
    const draft = 'About Task: Replace grinder burrs (Cafe 2)'
    renderWithPanel(<AskDeputyAction draft={draft} />, runtime)

    const button = screen.getByRole('button', { name: 'Ask Deputy' })
    expect(button).toBeInTheDocument()

    fireEvent.click(button)

    await waitFor(() => expect(screen.getByRole('complementary', { name: 'Deputy' })).toBeInTheDocument())
    // The composer is pre-filled with the record reference — but nothing was sent.
    expect(composer().value).toBe(draft)
    expect(runtime.createRun).not.toHaveBeenCalled()
  })

  it('renders on a signal record and seeds the signal reference (button present on both record types)', async () => {
    const runtime = makeFakeRuntime()
    const draft = 'About Signal: Chiller at Cafe 2 running warm since 06:00'
    renderWithPanel(<AskDeputyAction draft={draft} />, runtime)

    fireEvent.click(screen.getByRole('button', { name: 'Ask Deputy' }))

    await waitFor(() => expect(screen.getByRole('complementary', { name: 'Deputy' })).toBeInTheDocument())
    expect(composer().value).toBe(draft)
    expect(runtime.createRun).not.toHaveBeenCalled()
  })

  it('renders nothing when no runtime is available (SHOW_ASSISTANT off → no misleading affordance)', () => {
    renderWithPanel(<AskDeputyAction draft="About Task: X" />, null)
    expect(screen.queryByRole('button', { name: 'Ask Deputy' })).toBeNull()
  })

  // #718: `.record-panel-btn` (record-panel-host.css) already rests at 44×44 unconditionally —
  // the redundant `tap-floor` class added a second, now-dead 44px pin on top of a base that
  // already meets it.
  it('issue 718: does not carry the redundant tap-floor class (record-panel-btn base is already 44px)', () => {
    renderWithPanel(<AskDeputyAction draft="About Task: X" />)
    expect(screen.getByRole('button', { name: 'Ask Deputy' }).className).not.toMatch(/\btap-floor\b/)
  })

  it('the seed is single-shot: after adopting it, a later plain reopen does not resurrect the reference', async () => {
    renderWithPanel(<AskDeputyAction draft="About Task: Replace grinder burrs" />)

    fireEvent.click(screen.getByRole('button', { name: 'Ask Deputy' }))
    await waitFor(() => expect(screen.getByRole('complementary', { name: 'Deputy' })).toBeInTheDocument())
    expect(composer().value).toBe('About Task: Replace grinder burrs')

    // The user clears the composer and closes Deputy, then reopens it from the generic launcher.
    fireEvent.change(composer(), { target: { value: '' } })
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Deputy' })).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'plain open' }))

    await waitFor(() => expect(screen.getByRole('complementary', { name: 'Deputy' })).toBeInTheDocument())
    // The consumed record reference is NOT re-seeded (single-shot) — the composer stays empty.
    expect(composer().value).toBe('')
  })

  // Issue 758 — an explicit label overrides the generic "Ask Deputy" default so callers can supply
  // the record-type-aware accessible name (AC-046: the phone Back row ✦ names the record type).
  it('issue 758: chrome variant honours the label prop as the button\'s accessible name', () => {
    renderWithPanel(<AskDeputyAction draft="About Task: X" label="Ask Deputy about this Task" />)
    expect(screen.getByRole('button', { name: 'Ask Deputy about this Task' })).toBeInTheDocument()
    // The default generic name must NOT still resolve when an explicit label was supplied.
    expect(screen.queryByRole('button', { name: 'Ask Deputy' })).toBeNull()
  })

  // Issue 758 AC-045 — the footer variant renders the labelled row on the record document:
  //   ✦ Ask Deputy about this Task — Deputy will use this record as context
  // Activating it opens Deputy with the record reference seeded, exactly like the chrome ✦.
  describe('issue 758 footer variant (AC-045 — labelled door on the record document)', () => {
    it('renders the labelled control + helper text and opens Deputy with the record reference seeded', async () => {
      const runtime = makeFakeRuntime()
      const draft = 'About Task: Replace grinder burrs (Cafe 2)'
      renderWithPanel(
        <AskDeputyAction draft={draft} variant="footer" label="Ask Deputy about this Task" />,
        runtime,
      )

      const button = screen.getByRole('button', { name: 'Ask Deputy about this Task' })
      expect(button).toBeInTheDocument()
      // The visible label is inside the button, and the helper text sits beside it.
      expect(button.textContent).toMatch(/Ask Deputy about this Task/)
      expect(screen.getByText('Deputy will use this record as context')).toBeInTheDocument()
      // The helper is programmatically associated with the button (aria-describedby), so a screen
      // reader announces "Ask Deputy about this Task, Deputy will use this record as context".
      const helperId = button.getAttribute('aria-describedby')
      expect(helperId).toBeTruthy()
      expect(document.getElementById(helperId!)?.textContent).toBe('Deputy will use this record as context')

      fireEvent.click(button)
      await waitFor(() => expect(screen.getByRole('complementary', { name: 'Deputy' })).toBeInTheDocument())
      expect(composer().value).toBe(draft)
      expect(runtime.createRun).not.toHaveBeenCalled()
    })

    it('renders nothing when no runtime is available (same gate as chrome variant)', () => {
      renderWithPanel(
        <AskDeputyAction draft="About Task: X" variant="footer" label="Ask Deputy about this Task" />,
        null,
      )
      expect(screen.queryByRole('button', { name: 'Ask Deputy about this Task' })).toBeNull()
      expect(screen.queryByText('Deputy will use this record as context')).toBeNull()
    })

    // Issue 758 — record coexistence: opening Deputy from the footer must not tear the record down.
    // The chrome variant already proves this by opening Deputy without ever calling any close
    // seam; the footer must uphold the same contract (never dispatches a record close on click).
    it('opening Deputy from the footer never unmounts a mounted record beside it', async () => {
      const runtime = makeFakeRuntime()
      const draft = 'About Task: Replace grinder burrs'
      renderWithPanel(
        <>
          <div data-testid="record-frame">record body</div>
          <AskDeputyAction draft={draft} variant="footer" label="Ask Deputy about this Task" />
        </>,
        runtime,
      )

      fireEvent.click(screen.getByRole('button', { name: 'Ask Deputy about this Task' }))
      await waitFor(() => expect(screen.getByRole('complementary', { name: 'Deputy' })).toBeInTheDocument())
      // The record beside Deputy stays mounted (OD-REDESIGN-80 coexistence, DESIGN.md A8).
      expect(screen.getByTestId('record-frame')).toBeInTheDocument()
    })
  })
})
