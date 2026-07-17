import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { SignalRow } from '@/lib/db/signals.types'
import type { TaskComment } from '@/components/tasks/CommentThread'
import type { PersonOption } from '@/lib/db/directory'
import { SignalRecord } from './signal-record'

function baseSignal(overrides: Partial<SignalRow> = {}): SignalRow {
  return {
    id: 'signal-1', author_id: 'person-cahya', owning_team_id: 'team-hq',
    occurred_at: '2026-07-16T02:00:00Z', body: 'The freezer alarm went off',
    attention: 'Needs attention', category: null, source: 'human',
    retracted_at: null, retract_reason: null, edited_at: null,
    created_at: '2026-07-16T02:00:00Z',
    ...overrides,
  }
}

const PEOPLE: PersonOption[] = [{ id: 'person-cahya', full_name: 'Cahya Cafe' }]
const COMMENTS: TaskComment[] = [{ id: 'c1', author_id: 'person-cahya', body: 'Dispatching a tech now.', created_at: '2026-07-16T03:00:00Z' }]

function renderRecord(props: Partial<React.ComponentProps<typeof SignalRecord>> = {}) {
  return render(
    <I18nProvider>
      <SignalRecord
        mode="panel"
        signal={baseSignal()}
        authorName="Cahya Cafe"
        teamName="HQ Operations"
        businessUnitName="Retail Ops"
        siteName="Gordi HQ"
        mentions={[]}
        revisions={[]}
        acknowledgements={[]}
        hasAcknowledged={false}
        comments={COMMENTS}
        people={PEOPLE}
        canComment
        onPostComment={vi.fn()}
        {...props}
      />
    </I18nProvider>,
  )
}

describe('SignalRecord — core content', () => {
  it('renders body/author/Team/derived BU+Site/occurred-at/attention', () => {
    renderRecord()
    expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument()
    expect(screen.getByText('Cahya Cafe', { selector: '.signal-record-author' })).toBeInTheDocument()
    expect(screen.getByText('HQ Operations')).toBeInTheDocument()
    expect(screen.getByText('Retail Ops')).toBeInTheDocument()
    expect(screen.getByText('Gordi HQ')).toBeInTheDocument()
    expect(screen.getByText('Needs attention')).toBeInTheDocument()
  })

  it('renders "Add category" when uncategorised, and the category once set', () => {
    const { rerender } = render(
      <I18nProvider>
        <SignalRecord
          mode="panel" signal={baseSignal()} authorName="Cahya Cafe" teamName="HQ Operations"
          mentions={[]} revisions={[]} acknowledgements={[]} hasAcknowledged={false}
          comments={[]} people={PEOPLE} canComment onPostComment={vi.fn()}
        />
      </I18nProvider>,
    )
    expect(screen.getByRole('button', { name: /add category/i })).toBeInTheDocument()

    rerender(
      <I18nProvider>
        <SignalRecord
          mode="panel" signal={baseSignal({ category: 'Equipment/facility' })} authorName="Cahya Cafe" teamName="HQ Operations"
          mentions={[]} revisions={[]} acknowledgements={[]} hasAcknowledged={false}
          comments={[]} people={PEOPLE} canComment onPostComment={vi.fn()}
        />
      </I18nProvider>,
    )
    expect(screen.getByText('Equipment/facility')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add category/i })).not.toBeInTheDocument()
  })

  it('renders rendered mentions and the shield line', () => {
    renderRecord({ mentions: [{ kind: 'person', label: 'Peer Person' }], shieldLine: 'Visible to HQ Operations · notify 1' })
    expect(screen.getByText('@Peer Person')).toBeInTheDocument()
    expect(screen.getByText('Visible to HQ Operations · notify 1')).toBeInTheDocument()
  })
})

describe('SignalRecord — Edited indicator + revision history (FR-410)', () => {
  it('shows no Edited indicator when edited_at is unset', () => {
    renderRecord()
    expect(screen.queryByText(/edited/i)).not.toBeInTheDocument()
  })

  it('shows the Edited indicator with revision history when edited_at is set', async () => {
    renderRecord({
      signal: baseSignal({ edited_at: '2026-07-16T04:00:00Z', body: 'Corrected body' }),
      revisions: [{ id: 'rev-1', field: 'body', old_value: 'The freezer alarm went off', new_value: 'Corrected body', created_at: '2026-07-16T04:00:00Z', actorName: 'Cahya Cafe' }],
    })
    expect(screen.getByText(/edited/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /edited/i }))
    expect(screen.getByText('The freezer alarm went off')).toBeInTheDocument() // old_value shown
    expect(screen.getAllByText('Corrected body').length).toBeGreaterThan(0) // new_value + current body
  })
})

describe('SignalRecord — retraction tombstone (FR-411)', () => {
  it('renders only the tombstone + reason when retracted, no body/actions/comments', () => {
    renderRecord({ signal: baseSignal({ retracted_at: '2026-07-16T05:00:00Z', retract_reason: 'Duplicate report' }) })
    expect(screen.getByText(/retracted/i)).toBeInTheDocument()
    expect(screen.getByText('Duplicate report')).toBeInTheDocument()
    expect(screen.queryByText('The freezer alarm went off')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /acknowledge/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /comments/i })).not.toBeInTheDocument()
  })
})

describe('SignalRecord — Acknowledge (FR-412)', () => {
  it('shows an Acknowledge control and calls onAcknowledge, and lists acknowledgers', async () => {
    const onAcknowledge = vi.fn()
    renderRecord({
      onAcknowledge,
      acknowledgements: [{ personId: 'person-cahya', personName: 'Cahya Cafe' }],
    })
    expect(screen.getByText('Cahya Cafe', { selector: '.signal-ack-name' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^acknowledge$/i }))
    expect(onAcknowledge).toHaveBeenCalledTimes(1)
  })

  it('shows "Acknowledged" (disabled) once the viewer has already acknowledged', () => {
    renderRecord({ hasAcknowledged: true })
    const button = screen.getByRole('button', { name: /acknowledged/i })
    expect(button).toBeDisabled()
  })
})

describe('SignalRecord — reused comment thread (Rule 11 — record-feed/CommentThread)', () => {
  it('renders the CommentThread with the Signal comments', () => {
    renderRecord()
    expect(screen.getByRole('region', { name: /comments/i })).toBeInTheDocument()
    expect(screen.getByText('Dispatching a tech now.')).toBeInTheDocument()
  })
})

describe('SignalRecord — Linked work (Create follow-up Task / Link existing Task, D25/OD-39)', () => {
  it('renders the linked-work summary and both actions, wired to their handlers', async () => {
    const onCreateFollowUpTask = vi.fn()
    const onLinkExistingTask = vi.fn()
    renderRecord({
      linkedTasksSummary: { total: 2, open: 1 },
      onCreateFollowUpTask, onLinkExistingTask,
    })

    const linkedWork = screen.getByRole('region', { name: /linked work/i })
    expect(within(linkedWork).getByText(/2 Tasks/)).toBeInTheDocument()
    expect(within(linkedWork).getByText(/1 open/)).toBeInTheDocument()

    await userEvent.click(within(linkedWork).getByRole('button', { name: /create follow-up task/i }))
    expect(onCreateFollowUpTask).toHaveBeenCalledTimes(1)
    await userEvent.click(within(linkedWork).getByRole('button', { name: /link existing task/i }))
    expect(onLinkExistingTask).toHaveBeenCalledTimes(1)
  })

  it('never shows Status/PIC/Supervisor/resolution fields (a Signal has none, OD-39)', () => {
    renderRecord()
    expect(screen.queryByText(/status/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/supervisor/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^pic$/i)).not.toBeInTheDocument()
  })
})
