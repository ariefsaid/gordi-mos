// RecordPageChrome — the ONE chrome a STANDALONE record page renders, for every record kind.
//
// AUTHORED HERE (#190, DD-WAY-21). v4 ships this component with no test file at all, and the thing
// it exists to prevent is a per-surface fork: Task's full page carried a Back affordance baked into
// its own surface and the Signal full page carried none. So the cases below are about the SHARED
// contract — a labelled Back, source-aware, identical whatever renders inside it — not about any
// one kind.
//
// deputyDraft coverage added for #192 (Tasks): #190 parked the prop because no seeded-composer seam
// existed yet; #192 lands it (AgentRuntimeContext pendingDraft/consumePendingDraft). AskDeputyAction's
// own full open/seed/single-shot round trip is proved in `components/records/ask-deputy-action.test.tsx`
// — these cases only prove the prop actually reaches the chrome and its ordering.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { AgentRuntimeProvider } from '@/lib/agent/runtime/AgentRuntimeContext'
import type { AgentRuntime, AgentEvent } from '@/lib/agent/runtime/port'
import { RecordPageChrome } from './record-page-chrome'

function makeFakeRuntime(): AgentRuntime {
  return {
    createRun: vi.fn(async (input: { goal: string }) => ({ id: 'r1', title: input.goal.slice(0, 60), status: 'running' as const })),
    followUp: vi.fn(async () => {}),
    openThread: vi.fn(),
    control: vi.fn(async () => {}),
    subscribe: vi.fn(async function* (): AsyncGenerator<AgentEvent> {}),
  }
}

function renderChrome(
  props: Partial<React.ComponentProps<typeof RecordPageChrome>> = {},
  runtime: AgentRuntime | null = null,
) {
  return render(
    <I18nProvider>
      <MemoryRouter>
        <AgentRuntimeProvider runtime={runtime}>
          <RecordPageChrome
            backTo={props.backTo ?? { pathname: '/work/signals', search: '?view=mine' }}
            backLabel={props.backLabel ?? 'Signals'}
            deputyDraft={props.deputyDraft}
            trailing={props.trailing}
          />
        </AgentRuntimeProvider>
      </MemoryRouter>
    </I18nProvider>,
  )
}

describe('RecordPageChrome', () => {
  it('renders a LABELLED Back link naming the collection, not an unlabelled glyph', () => {
    renderChrome({ backLabel: 'Signals' })
    const back = screen.getByRole('link', { name: 'Back to Signals' })
    // The label is the accessible name AND visible text — the E7 grammar the record surfaces
    // diverged on. An icon-only Back would still satisfy a role query, so the text is asserted.
    expect(back).toHaveTextContent('Back to Signals')
  })

  it('is source-aware: the Back target is the caller\'s, query string included', () => {
    renderChrome({ backTo: { pathname: '/work/signals', search: '?view=mine&q=loss' } })
    expect(screen.getByRole('link', { name: /back to/i })).toHaveAttribute(
      'href',
      '/work/signals?view=mine&q=loss',
    )
  })

  it('names whichever collection the record came from — the chrome is not per-kind', () => {
    const { unmount } = renderChrome({ backLabel: 'Signals', backTo: '/work/signals' })
    const signals = screen.getByRole('link', { name: /back to/i })
    const signalsClass = signals.className
    expect(signals).toHaveTextContent('Back to Signals')
    unmount()

    renderChrome({ backLabel: 'Tasks', backTo: '/work/tasks' })
    const tasks = screen.getByRole('link', { name: /back to/i })
    expect(tasks).toHaveTextContent('Back to Tasks')
    // Same affordance, same skin — a different kind is not a different chrome.
    expect(tasks.className).toBe(signalsClass)
  })

  it('renders a kind-specific trailing control after the Back, when one is given', () => {
    renderChrome({ trailing: <button type="button">Collapse to panel</button> })
    const strip = document.querySelector('[data-viewer-region="page-chrome"]')!
    const controls = Array.from(strip.querySelectorAll('a, button'))
    expect(controls.map((el) => el.textContent)).toEqual([
      'Back to Signals',
      'Collapse to panel',
    ])
  })

  it('renders no trailing controls when the kind has none', () => {
    renderChrome()
    const strip = document.querySelector('[data-viewer-region="page-chrome"]')!
    expect(strip.querySelectorAll('button')).toHaveLength(0)
  })

  it('renders the record-scoped Ask Deputy affordance when deputyDraft is resolved', () => {
    renderChrome({ deputyDraft: 'About Task: Replace grinder burrs' }, makeFakeRuntime())
    expect(screen.getByRole('button', { name: 'Ask Deputy' })).toBeInTheDocument()
  })

  it('renders no Ask Deputy affordance while deputyDraft is null (title not resolved yet)', () => {
    renderChrome({ deputyDraft: null }, makeFakeRuntime())
    expect(screen.queryByRole('button', { name: 'Ask Deputy' })).toBeNull()
  })

  it('orders Ask Deputy AFTER any kind-specific trailing control', () => {
    renderChrome(
      { deputyDraft: 'About Task: X', trailing: <button type="button">Collapse to panel</button> },
      makeFakeRuntime(),
    )
    const strip = document.querySelector('[data-viewer-region="page-chrome"]')!
    // Ask Deputy is icon-only (accessible name via aria-label, no visible text) — accessible name,
    // not textContent, is the honest way to identify it.
    const controls = Array.from(strip.querySelectorAll('button')).map(
      (el) => el.getAttribute('aria-label') || el.textContent,
    )
    expect(controls).toEqual(['Collapse to panel', 'Ask Deputy'])
  })
})
