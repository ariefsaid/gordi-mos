import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { SignalRow } from '@/lib/db/signals.types'
import type { CollectionPresentationProps, CollectionProjection } from '@/lib/record-collection/types'
import { SignalFeedPresentation } from './signal-feed-presentation'
import { SignalCollectionActionsProvider, type SignalCollectionActions } from './signal-collection-actions'
import type { SignalCollectionContext, SignalCollectionQuery, SignalRenderGroup } from './signal-collection-adapter'
import { SIGNAL_COLLECTION_NEUTRAL_QUERY } from './signal-collection-adapter'

function row(overrides: Partial<SignalRow> = {}): SignalRow {
  return {
    id: 'signal-1', author_id: 'p-cahya', owning_team_id: 'team-hq',
    occurred_at: '2026-07-16T02:00:00Z', body: 'The freezer alarm went off',
    attention: 'FYI', category: null, source: 'human',
    retracted_at: null, retract_reason: null, edited_at: null,
    created_at: '2026-07-16T02:00:00Z',
    ...overrides,
  }
}

const CONTEXT: SignalCollectionContext = {
  authorNamesById: new Map([['p-cahya', 'Cahya Cafe']]),
  teamNamesById: new Map([['team-hq', 'HQ Operations']]),
  siteNamesByTeamId: new Map(),
  viewerId: 'p-me',
}

function renderFeed(
  rows: readonly SignalRow[],
  actions: SignalCollectionActions,
  onOpenRecord = vi.fn(),
) {
  const projection: CollectionProjection<SignalRow, SignalRenderGroup> = {
    visibleRecords: rows,
    groups: [{ key: 'all', label: null, rows }],
    totalRecords: rows.length,
    visibleRecordsAreFiltered: false,
  }
  const props: CollectionPresentationProps<
    SignalRow,
    SignalCollectionQuery,
    CollectionProjection<SignalRow, SignalRenderGroup>,
    SignalCollectionContext,
    string
  > = {
    query: { ...SIGNAL_COLLECTION_NEUTRAL_QUERY, layout: 'feed' },
    projection,
    context: CONTEXT,
    selectedIds: new Set<string>(),
    onToggleSelected: vi.fn(),
    onOpenRecord,
    onToggleGroup: vi.fn(),
    isGroupCollapsed: () => false,
  }
  return render(
    <I18nProvider>
      <SignalCollectionActionsProvider actions={actions}>
        <SignalFeedPresentation {...props} />
      </SignalCollectionActionsProvider>
    </I18nProvider>,
  )
}

describe('SignalFeedPresentation — Feed renderer reads the collection ACTIONS context', () => {
  it('renders the Signal rows with resolved author/Team names', () => {
    renderFeed([row()], {})
    expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument()
    expect(screen.getByText('Cahya Cafe')).toBeInTheDocument()
    expect(screen.getByText('HQ Operations')).toBeInTheDocument()
  })

  it('gives an attention-worthy archive row the Operations-event row treatment; FYI rows stay quiet (P1-1)', () => {
    renderFeed(
      [
        row({ id: 'sig-attn', body: 'Grinder is down', attention: 'Needs attention' }),
        row({ id: 'sig-fyi', body: 'Restocked cups', attention: 'FYI' }),
      ],
      {},
    )
    // The archive Feed opts into the attention treatment via the shared component's variant.
    expect(document.querySelector('.home-signal-feed--archive')).toBeInTheDocument()
    // Attention-worthy row carries the modifier the CSS lights up (warning fill + 2px left rule);
    // FYI does not. Home's ambient variant never sets `--archive`, so Home is untouched.
    const attnRow = document.querySelector('[data-signal-id="sig-attn"]')
    const fyiRow = document.querySelector('[data-signal-id="sig-fyi"]')
    expect(attnRow?.classList.contains('home-signal-row--attention')).toBe(true)
    expect(fyiRow?.classList.contains('home-signal-row--attention')).toBe(false)
  })

  it('wires Share and the injected collection opener while hiding unavailable Task creation', async () => {
    const onOpenRecord = vi.fn()
    const actions: SignalCollectionActions = {
      onShareClick: vi.fn(),
    }
    renderFeed([row({ id: 'signal-9' })], actions, onOpenRecord)

    await userEvent.click(screen.getByRole('button', { name: /share a signal/i }))
    expect(actions.onShareClick).toHaveBeenCalledTimes(1)

    // The record-open affordance is now accessibly named ("Open signal: <body>") — Luna (c).
    await userEvent.click(screen.getByRole('button', { name: /open signal: the freezer alarm went off/i }))
    expect(onOpenRecord).toHaveBeenCalledWith(expect.objectContaining({ id: 'signal-9' }))
    expect(screen.queryByRole('button', { name: /create task/i })).not.toBeInTheDocument()
  })
})

// DO-14 (signals F-3): on a phone the row is a flex ROW — a fixed-width tail (attention pill +
// category control) squeezes the title column to ~3 words (identity starvation). jsdom has no
// layout engine, so pin the CSS grammar of the fix: at ≤480px the row stacks to a column so the
// title/main span the full width and the tail drops beneath.
describe('DO-14: mobile feed row stacks so the Signal title is not starved by the tail', () => {
  const css = readFileSync(
    resolve(process.cwd(), 'src/components/signals/signal-feed-rows.css'),
    'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, '')

  function mediaBody(query: string): string {
    const idx = css.indexOf(`@media (${query})`)
    expect(idx, `signal-feed-rows.css must contain @media (${query})`).toBeGreaterThanOrEqual(0)
    const open = css.indexOf('{', idx)
    let depth = 0
    for (let i = open; i < css.length; i += 1) {
      if (css[i] === '{') depth += 1
      if (css[i] === '}') {
        depth -= 1
        if (depth === 0) return css.slice(open + 1, i)
      }
    }
    throw new Error(`unterminated media block: ${query}`)
  }

  it('DO-14: the ≤480px block flips .home-signal-row to a column', () => {
    const body = mediaBody('max-width: 480px')
    expect(body).toMatch(/\.home-signal-row\s*\{[^}]*flex-direction:\s*column/)
  })

  it('DO-14 (guard the guard): the base .home-signal-row stays a flex ROW at wide widths', () => {
    // The stack is a scoped phone exception; the desktop/tablet row must keep its row layout so
    // the title + tail sit side-by-side above 480px.
    const base = css.slice(0, css.indexOf('@media'))
    expect(base).toMatch(/\.home-signal-row\s*\{[^}]*display:\s*flex/)
    expect(base).not.toMatch(/\.home-signal-row\s*\{[^}]*flex-direction:\s*column/)
  })
})
