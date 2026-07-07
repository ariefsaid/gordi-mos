// T27 — AssistantPanel slide-over. AC-AP-001 (renders open), AC-AP-002 (keep-mounted: transcript
// survives close→open), AC-AP-003 (inert when closed), AC-AP-004 (safe assistant markdown),
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

function replyScript(text = 'Sure — here is your answer.'): AgentEvent[] {
  return [
    { id: 'a1', runId: 'r1', type: 'assistant', text, createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 's1', runId: 'r1', type: 'status', payload: { status: 'completed' }, createdAt: '2026-01-01T00:00:01.000Z' },
  ]
}

function makeFakeRuntime(events: AgentEvent[] = replyScript()): AgentRuntime {
  return {
    createRun: vi.fn(async (input: { goal: string }) => ({ id: 'r1', title: input.goal.slice(0, 60), status: 'running' as const })),
    followUp: vi.fn(async () => {}),
    openThread: vi.fn(),
    control: vi.fn(async () => {}),
    subscribe: vi.fn(async function* () {
      for (const ev of events) yield ev
    }),
  }
}

function renderPanel({ narrow, open, runtime = makeFakeRuntime() }: { narrow: boolean; open: boolean; runtime?: AgentRuntime }) {
  // matchMedia stub: narrow=true → phone (dialog); false → desktop (complementary).
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('max-width') ? narrow : query.includes('min-width') ? !narrow : narrow,
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
        <AgentRuntimeProvider runtime={runtime}>
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

  it('AC-AP-004: assistant prose renders safe markdown while user turns stay literal', async () => {
    renderPanel({
      narrow: false,
      open: true,
      runtime: makeFakeRuntime(replyScript([
        'Here are **blocked** items:',
        '',
        '- Roastery launch',
        '- Finance review',
        '',
        '| Owner | Count |',
        '| --- | ---: |',
        '| Ops | 2 |',
        '',
        '[Open MOS](https://ops.gordi.id/mos)',
      ].join('\n'))),
    })

    fireEvent.change(screen.getByRole('textbox', { name: /ask the deputy/i }), { target: { value: '**literal user text**' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByText('blocked')).toHaveProperty('tagName', 'STRONG')
    expect(screen.getByRole('list')).toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open MOS' })).toHaveAttribute('href', 'https://ops.gordi.id/mos')

    const userTurn = screen.getByText('**literal user text**')
    expect(userTurn.querySelector('strong')).toBeNull()
  })

  it('AC-AP-004: hostile assistant markdown cannot create raw HTML nodes or unsafe links', async () => {
    renderPanel({
      narrow: false,
      open: true,
      runtime: makeFakeRuntime(replyScript([
        '[safe](https://ops.gordi.id/mos)',
        '[bad](javascript:alert(1))',
        '<script>alert(1)</script>',
        '<img src=x onerror=alert(1)>',
        '<iframe src=x></iframe>',
      ].join('\n'))),
    })

    fireEvent.change(screen.getByRole('textbox', { name: /ask the deputy/i }), { target: { value: 'hi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByRole('link', { name: 'safe' })).toHaveAttribute('href', 'https://ops.gordi.id/mos')
    expect(screen.queryByRole('link', { name: 'bad' })).toBeNull()
    expect(document.querySelector('script,img,iframe')).toBeNull()
    expect(document.querySelector('[href^="javascript:"]')).toBeNull()
  })

  it('ADR-0045: data_table artifact events render as typed assistant widgets', async () => {
    renderPanel({
      narrow: false,
      open: true,
      runtime: makeFakeRuntime([
        {
          id: 'w1',
          runId: 'r1',
          type: 'artifact',
          createdAt: '2026-01-01T00:00:00.000Z',
          payload: {
            kind: 'data_table',
            title: 'Blocked tasks',
            columns: [
              { key: 'title', header: 'Task' },
              { key: 'owner', header: 'Owner' },
            ],
            rows: [
              { title: 'Fix stock sync', owner: 'Ops' },
              { title: 'Confirm pricing', owner: 'Finance' },
            ],
          },
        },
        { id: 's1', runId: 'r1', type: 'status', payload: { status: 'completed' }, createdAt: '2026-01-01T00:00:01.000Z' },
      ]),
    })

    fireEvent.change(screen.getByRole('textbox', { name: /ask the deputy/i }), { target: { value: 'show blocked tasks as a table' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByRole('heading', { name: 'Blocked tasks' })).toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Task' })).toBeInTheDocument()
    expect(screen.getByText('Fix stock sync')).toBeInTheDocument()
  })

  it('ADR-0045: invalid artifact payloads are dropped fail-closed', async () => {
    renderPanel({
      narrow: false,
      open: true,
      runtime: makeFakeRuntime([
        { id: 'bad-widget', runId: 'r1', type: 'artifact', payload: { kind: 'data_table', title: 'Unsafe', rows: [{ x: 'missing columns' }] }, createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 's2', runId: 'r1', type: 'status', payload: { status: 'completed' }, createdAt: '2026-01-01T00:00:01.000Z' },
      ]),
    })
    fireEvent.change(screen.getByRole('textbox', { name: /ask the deputy/i }), { target: { value: 'bad widget' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Unsafe' })).toBeNull())
  })

  it('ADR-0045: data_insight artifact renders a KPITile (value + label)', async () => {
    renderPanel({
      narrow: false,
      open: true,
      runtime: makeFakeRuntime([
        {
          id: 'w2',
          runId: 'r1',
          type: 'artifact',
          createdAt: '2026-01-01T00:00:00.000Z',
          payload: {
            kind: 'data_insight',
            title: 'Active Tasks',
            value: 12,
            label: 'In Progress',
            detail: '3 due this week',
          },
        },
        { id: 's1', runId: 'r1', type: 'status', payload: { status: 'completed' }, createdAt: '2026-01-01T00:00:01.000Z' },
      ]),
    })

    fireEvent.change(screen.getByRole('textbox', { name: /ask the deputy/i }), { target: { value: 'show active tasks' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    // KPITile renders with label and value visible.
    expect(await screen.findByText('In Progress')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('3 due this week')).toBeInTheDocument()
  })

  it('ADR-0045: data_chart artifact renders ChartFrame with SVG bar chart AND table fallback', async () => {
    renderPanel({
      narrow: false,
      open: true,
      runtime: makeFakeRuntime([
        {
          id: 'w3',
          runId: 'r1',
          type: 'artifact',
          createdAt: '2026-01-01T00:00:00.000Z',
          payload: {
            kind: 'data_chart',
            title: 'Weekly Revenue',
            xKey: 'week',
            yKey: 'revenue',
            points: [
              { week: 'W1', revenue: 45000 },
              { week: 'W2', revenue: 52000 },
              { week: 'W3', revenue: 38000 },
            ],
          },
        },
        { id: 's1', runId: 'r1', type: 'status', payload: { status: 'completed' }, createdAt: '2026-01-01T00:00:01.000Z' },
      ]),
    })

    fireEvent.change(screen.getByRole('textbox', { name: /ask the deputy/i }), { target: { value: 'show revenue chart' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    // ChartFrame title visible.
    expect(await screen.findByRole('heading', { name: 'Weekly Revenue' })).toBeInTheDocument()

    // SVG bar chart present with proper a11y.
    const svg = screen.getByRole('img', { name: 'Weekly Revenue bar chart' })
    expect(svg).toBeInTheDocument()
    expect(svg).toHaveAttribute('aria-label', 'Weekly Revenue bar chart')

    // Table fallback present (DataTable in fallback div).
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'week' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'revenue' })).toBeInTheDocument()
    // Verify both SVG labels and table rows exist (multiple W1 is OK — one in SVG, one in table).
    expect(screen.getAllByText('W1')).toHaveLength(2)
    expect(screen.getAllByText('45000')).toHaveLength(1)
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

  it('CQ#1: error banner shows the title text AND a distinct retry button (not "Try again / Try again")', async () => {
    function erroringRuntime(): AgentRuntime {
      return {
        createRun: vi.fn(async (input: { goal: string }) => ({ id: 'r1', title: input.goal.slice(0, 60), status: 'running' as const })),
        followUp: vi.fn(async () => {}),
        openThread: vi.fn(),
        control: vi.fn(async () => {}),
        subscribe: vi.fn(async function* () {
          const ev: AgentEvent = { id: 's1', runId: 'r1', type: 'status', payload: { status: 'error', error: 'UPSTREAM_ERROR' }, createdAt: '2026-01-01T00:00:00.000Z' }
          yield ev
        }),
      }
    }
    localStorage.setItem('mos.assistant.open', 'true')
    render(
      <I18nProvider>
        <MemoryRouter>
          <AgentRuntimeProvider runtime={erroringRuntime()}>
            <AssistantPanel />
          </AgentRuntimeProvider>
        </MemoryRouter>
      </I18nProvider>,
    )
    fireEvent.change(screen.getByRole('textbox', { name: /ask the deputy/i }), { target: { value: 'break it' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    // The banner title text renders (distinct from the retry button's own accessible name).
    await waitFor(() => expect(screen.getByText('Something went wrong')).toBeInTheDocument())
    // The retry button is a SEPARATE element bearing the CTA label — not a duplicate of the title text.
    const retryButton = screen.getByRole('button', { name: 'Try again' })
    expect(retryButton).toBeInTheDocument()
    expect(retryButton.textContent).not.toBe('Something went wrong')
  })
})
