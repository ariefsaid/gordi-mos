import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { TaskComment } from '@/components/tasks/CommentThread'
import type { PersonOption } from '@/lib/db/directory'
import {
  SignalMessage, SignalReach, SignalDiscussion, SignalFacts, SignalHistory,
  type SignalRevisionView,
} from './signal-record'

// OD-REDESIGN-90 anatomy (docs/specs/record-page-anatomy.spec.md §2.1): the record's five regions
// are small presentational components. This file covers each region's goal behaviors; the RENDERED
// ORDER + the Step-2.5 FAIL gates live in signal-record-anatomy.test.tsx.

const PEOPLE: PersonOption[] = [{ id: 'person-cahya', full_name: 'Cahya Cafe' }]
const COMMENTS: TaskComment[] = [{ id: 'c1', author_id: 'person-cahya', body: 'Dispatching a tech now.', created_at: '2026-07-16T03:00:00Z' }]

function wrap(node: React.ReactNode) {
  return render(<I18nProvider>{node}</I18nProvider>)
}

describe('SignalMessage — the content leads (LAW-1/LAW-2)', () => {
  it('AC-ANAT-002: renders the FULL body prose unclipped, with the attention pill + occurred riding with it', () => {
    const body = 'HQ bar espresso volumes are down about 15% this week versus last week — corrected count. Investigating the grinder.'
    wrap(<SignalMessage body={body} attention="Needs attention" occurredLabel="22 Jul 2026, 17:18 WIB" />)
    expect(screen.getByText(body)).toBeInTheDocument() // full body, not a slice
    expect(screen.getByText('Needs attention')).toBeInTheDocument()
    expect(screen.getByText(/Occurred 22 Jul 2026, 17:18 WIB/)).toBeInTheDocument()
  })

  it('AC-ANAT-010: a retracted Signal shows only the tombstone + reason — no message body, no controls', () => {
    wrap(<SignalMessage body="Original text" attention="FYI" occurredLabel="x" retracted retractReason="Duplicate report" />)
    expect(screen.getByText(/retracted/i)).toBeInTheDocument()
    expect(screen.getByText('Duplicate report')).toBeInTheDocument()
    expect(screen.queryByText('Original text')).not.toBeInTheDocument()
  })
})

describe('SignalReach — the one action register (LAW-3), no Status/PIC/Supervisor (jtbd A1/A2)', () => {
  function renderReach(props: Partial<React.ComponentProps<typeof SignalReach>> = {}) {
    return wrap(
      <SignalReach
        mentions={[]} canAcknowledge hasAcknowledged={false}
        acknowledgements={[]} {...props}
      />,
    )
  }

  it('renders mentions + the visibility shield line', () => {
    renderReach({ mentions: [{ kind: 'person', label: 'Peer Person' }], shieldLine: 'Visible to HQ Operations · notify 1' })
    expect(screen.getByText('@Peer Person')).toBeInTheDocument()
    expect(screen.getByText('Visible to HQ Operations · notify 1')).toBeInTheDocument()
  })

  it('AC-ANAT-005: Acknowledge + Create follow-up + Link existing all occupy ONE actions register', () => {
    const onCreateFollowUpTask = vi.fn()
    const onLinkExistingTask = vi.fn()
    const onAcknowledge = vi.fn()
    renderReach({ onCreateFollowUpTask, onLinkExistingTask, onAcknowledge })
    const region = document.querySelector('[data-signal-region="reach"]') as HTMLElement
    const cluster = region.querySelector('[data-signal-actions]')!
    // Every mutating verb is inside the single cluster.
    for (const name of [/create follow-up task/i, /link existing task/i, /acknowledge/i]) {
      expect(within(cluster as HTMLElement).getByRole('button', { name })).toBeInTheDocument()
    }
  })

  it('drops the "0 Tasks · 0 open" noise when there is no linked work, shows the summary when there is', () => {
    const { rerender } = renderReach({ linkedTasksSummary: { total: 0, open: 0 } })
    expect(screen.queryByText(/0 Tasks/)).not.toBeInTheDocument()
    rerender(
      <I18nProvider>
        <SignalReach mentions={[]} canAcknowledge hasAcknowledged={false} acknowledgements={[]} linkedTasksSummary={{ total: 2, open: 1 }} />
      </I18nProvider>,
    )
    expect(screen.getByText(/2 Tasks · 1 open/)).toBeInTheDocument()
  })

  it('lists the "who\'s acknowledged" roster and disables Acknowledge once done (never disappears)', () => {
    renderReach({ hasAcknowledged: true, acknowledgements: [{ personId: 'person-cahya', personName: 'Cahya Cafe' }] })
    expect(screen.getByText('Cahya Cafe', { selector: '.signal-ack-name' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /acknowledged/i })).toBeDisabled()
  })

  it('never shows a Status/PIC/Supervisor/resolution control (a Signal is a fact, OD-39)', () => {
    renderReach()
    expect(screen.queryByText(/status/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/supervisor/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^pic$/i)).not.toBeInTheDocument()
  })
})

describe('SignalFacts — quiet provenance, ONE section note, no per-field captions (LAW-6/F3)', () => {
  function renderFacts(props: Partial<React.ComponentProps<typeof SignalFacts>> = {}) {
    return wrap(
      <SignalFacts authorName="Dewi Director" teamName="HQ Operations" businessUnitName="Retail Ops" siteName="Gordi HQ" category={null} {...props} />,
    )
  }

  it('AC-ANAT-003: renders the provenance rows with exactly ONE section-level note, not a caption per row', () => {
    renderFacts()
    const region = document.querySelector('[data-signal-region="facts"]') as HTMLElement
    expect(within(region).getByText('Dewi Director')).toBeInTheDocument()
    expect(within(region).getByText('Retail Ops')).toBeInTheDocument()
    // Exactly one quiet provenance note for the whole section.
    expect(region.querySelectorAll('.signal-facts-note')).toHaveLength(1)
    // No per-field "fixed after posting" caption stamped on each row (the old defect).
    expect(within(region).queryAllByText(/fixed after posting/i)).toHaveLength(0)
  })

  it('renders "Add category" when uncategorised and the value once set, and corrects via the 8-family picker', async () => {
    const onCategorize = vi.fn()
    const { rerender } = renderFacts({ onCategorize })
    expect(screen.getByRole('button', { name: /add category/i })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /add category/i }))
    await userEvent.click(within(screen.getByRole('listbox', { name: /categor/i })).getByRole('option', { name: 'Quality' }))
    expect(onCategorize).toHaveBeenCalledWith('Quality')

    rerender(
      <I18nProvider>
        <SignalFacts authorName="Dewi" teamName="HQ" businessUnitName={null} siteName={null} category="Equipment/facility" />
      </I18nProvider>,
    )
    expect(screen.getByText('Equipment/facility')).toBeInTheDocument()
  })
})

describe('SignalDiscussion — comments in the document grammar', () => {
  it('renders the comment thread with the Signal comments', () => {
    wrap(<SignalDiscussion comments={COMMENTS} people={PEOPLE} canComment onPostComment={vi.fn()} />)
    expect(screen.getByRole('heading', { name: /discussion/i })).toBeInTheDocument()
    expect(document.querySelector('[data-signal-region="discussion"]')).toBeTruthy()
    expect(screen.getByText('Dispatching a tech now.')).toBeInTheDocument()
  })
})

describe('SignalHistory — disclosed audit, no raw diff in the default view (LAW-5/F4)', () => {
  const revisions: SignalRevisionView[] = [
    { id: 'rev-1', field: 'body', old_value: 'down about 10%', new_value: 'down about 15%', created_at: '2026-07-16T04:00:00Z', actorName: 'Cahya Cafe' },
  ]

  it('renders nothing when the Signal has never been edited', () => {
    const { container } = wrap(<SignalHistory edited={false} revisions={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('AC-ANAT-004: shows an "Edited · N" disclosure; the old→new values appear ONLY after expanding', async () => {
    wrap(<SignalHistory edited revisions={revisions} />)
    // Default (collapsed) view: the raw diff values are absent.
    expect(screen.queryByText(/down about 10%/)).not.toBeInTheDocument()
    const toggle = screen.getByRole('button', { name: /edited · 1 revision/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(toggle)
    // Now behind the disclosure: a human-readable summary + the readable diff.
    expect(screen.getByText('Cahya Cafe')).toBeInTheDocument()
    expect(screen.getByText(/down about 10%.*down about 15%/)).toBeInTheDocument()
  })
})

// DO-5 (SR-2): the reused CommentThread wraps itself in a bordered .card with a 20px .card-h2 —
// correct standalone, but inside the Signal record DOCUMENT it read as a nested card. jsdom cannot
// compute the border, so pin the CSS grammar: within .signal-discussion the card chrome is
// neutralized so Comments reads as a quiet peer of the sibling regions (one document, LAW-7).
describe('DO-5: Comments joins the record document grammar (no nested card)', () => {
  const css = readFileSync(
    resolve(process.cwd(), 'src/components/signals/signal-record.css'),
    'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, '')

  it('DO-5: .signal-discussion .card sheds its border/shadow/background so it is not a nested card', () => {
    const m = /\.signal-discussion\s+\.card\s*\{([^}]*)\}/.exec(css)
    expect(m, 'signal-record.css must neutralize .signal-discussion .card').not.toBeNull()
    const body = m![1]
    expect(body).toMatch(/border:\s*0/)
    expect(body).toMatch(/box-shadow:\s*none/)
    expect(body).toMatch(/background:\s*transparent/)
  })
})
