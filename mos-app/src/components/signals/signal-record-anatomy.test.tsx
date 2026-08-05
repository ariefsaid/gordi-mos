import { describe, it, expect, vi } from 'vitest'
import { render, within } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { SignalDetail } from '@/lib/db/signals'
import type { SignalRow } from '@/lib/db/signals.types'
import { RecordViewer } from '@/components/records/record-viewer'
import { wrapSignalRecord } from './signal-record-adapter'
import {
  SignalReach, SignalDiscussion, SignalFacts, SignalHistory, type SignalRevisionView,
} from './signal-record'

// ── Census Step 2.5 — anatomy conformance (docs/specs/record-page-anatomy.spec.md §3, AC-ANAT-009).
// This is the EXECUTABLE body of Step 2.5 for the Signal record: it composes the record the way the
// live host does (the five region nodes → wrapSignalRecord → the shared RecordViewer), extracts the
// observed section-order vector from the rendered DOM, asserts observed === declared, and evaluates
// the five FAIL gates F1–F5. A green mechanical guard does NOT substitute for this recorded pass.

const DECLARED = ['message', 'reach', 'discussion', 'facts', 'history'] as const

const LONG_BODY =
  'HQ bar espresso volumes are down about 15% this week versus last week — corrected count. Investigating the grinder over the next two mornings.'

function makeSignal(overrides: Partial<SignalRow> = {}): SignalRow {
  return {
    id: 'signal-1', author_id: 'p-author', owning_team_id: 't-1', occurred_at: '2026-07-20T08:00:00Z',
    body: LONG_BODY, attention: 'Needs attention', category: 'Quality', source: 'human',
    retracted_at: null, retract_reason: null, edited_at: '2026-07-20T09:00:00Z',
    created_at: '2026-07-20T08:05:00Z', ...overrides,
  }
}

const REVISIONS: SignalRevisionView[] = [
  { id: 'rev-1', field: 'body', old_value: 'down about 10%', new_value: 'down about 15%', created_at: '2026-07-20T09:00:00Z', actorName: 'Dewi Director' },
]

function composeAndRender(signal: SignalRow) {
  const detail: SignalDetail = { signal, mentions: [], acknowledgements: [], tasks: [] }
  const retracted = signal.retracted_at !== null
  const adapter = wrapSignalRecord({
    detail,
    occurredLabel: '20 Jul 2026, 15:00 WIB',
    reach: retracted ? null : (
      <SignalReach
        mentions={[{ kind: 'person', label: 'Cahya' }]}
        shieldLine="Visible to HQ Operations · notify 4 people"
        canAcknowledge hasAcknowledged={false} onAcknowledge={vi.fn()}
        acknowledgements={[]} linkedTasksSummary={{ total: 0, open: 0 }}
        onCreateFollowUpTask={vi.fn()} onLinkExistingTask={vi.fn()}
      />
    ),
    discussion: retracted ? null : (
      <SignalDiscussion comments={[]} people={[]} canComment onPostComment={vi.fn()} />
    ),
    facts: (
      <SignalFacts authorName="Dewi Director" teamName="HQ Operations" businessUnitName="Retail Ops" siteName="Gordi HQ" category={signal.category} onCategorize={vi.fn()} />
    ),
    history: signal.edited_at ? <SignalHistory edited revisions={REVISIONS} /> : null,
  })
  return render(
    <I18nProvider>
      <RecordViewer adapter={adapter} mode="page" headingLevel={1} />
    </I18nProvider>,
  )
}

function observedVector(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[data-content-slot]')].map(
    (n) => (n as HTMLElement).dataset.contentSlot!,
  )
}

describe('Census Step 2.5 — Signal record anatomy conformance (AC-ANAT-009)', () => {
  it('observed section-order vector === declared [message, reach, discussion, facts, history]', () => {
    const { container } = composeAndRender(makeSignal())
    expect(observedVector(container)).toEqual([...DECLARED])
  })

  it('F1 — content leads: the first body region after identity is the message', () => {
    const { container } = composeAndRender(makeSignal())
    expect(observedVector(container)[0]).toBe('message')
    // No metadata/Facts region emitted before the content (the old defect).
    const regions = [...container.querySelectorAll('[data-viewer-region]')].map((n) => (n as HTMLElement).dataset.viewerRegion)
    expect(regions.indexOf('content')).toBeLessThan(regions.length) // content present
    expect(regions.filter((r) => r === 'metadata')).toHaveLength(0)
  })

  it('F2 — the identity heading is not a truncated slice, and the full body is present in a content region', () => {
    const { container } = composeAndRender(makeSignal())
    const h1 = container.querySelector('h1')!
    expect(h1.textContent).toBe(LONG_BODY)
    expect(h1.textContent!.endsWith('…')).toBe(false)
    const message = container.querySelector('[data-content-slot="message"]')!
    expect(message.textContent).toContain(LONG_BODY) // full content lives in a content region
  })

  it('F3 — no per-field provenance captions: the facts region carries exactly one section note', () => {
    const { container } = composeAndRender(makeSignal())
    const facts = container.querySelector('[data-content-slot="facts"]') as HTMLElement
    expect(facts.querySelectorAll('.signal-facts-note')).toHaveLength(1)
    expect(within(facts).queryAllByText(/fixed after posting/i)).toHaveLength(0)
  })

  it('F4 — no raw diff dumped in the default view; the revision list lives in exactly ONE region', () => {
    const { container } = composeAndRender(makeSignal())
    // Default (collapsed) view: the old→new values are NOT in the DOM.
    expect(container.textContent).not.toContain('down about 10%')
    // The revision toggle exists in exactly one content region (history), nowhere else.
    const historyRegions = [...container.querySelectorAll('[data-content-slot]')].filter(
      (n) => n.querySelector('.signal-history-toggle'),
    )
    expect(historyRegions).toHaveLength(1)
    expect((historyRegions[0] as HTMLElement).dataset.contentSlot).toBe('history')
  })

  it('F5 — every record-mutating action resolves to ONE actions register', () => {
    const { container } = composeAndRender(makeSignal())
    expect(container.querySelectorAll('[data-signal-actions]')).toHaveLength(1)
  })

  it('retracted: the observed vector collapses to [message, facts] (reach/discussion drop)', () => {
    const { container } = composeAndRender(makeSignal({ retracted_at: '2026-07-21T00:00:00Z', retract_reason: 'Duplicate', edited_at: null }))
    expect(observedVector(container)).toEqual(['message', 'facts'])
  })
})
