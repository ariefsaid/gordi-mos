import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { WorkWriteScopes } from '@/lib/db/work-authority'
import type { KeyResultRow } from '@/lib/db/objective-key-results'

vi.mock('@/lib/db/objective-key-results', () => ({
  listKeyResults: vi.fn(),
  createKeyResult: vi.fn(),
  updateKeyResultTargets: vi.fn(),
  updateKeyResultCurrentValue: vi.fn(),
  deleteKeyResult: vi.fn(),
}))
vi.mock('@/lib/db/directory', () => ({ getPeople: vi.fn() }))

import {
  createKeyResult, deleteKeyResult, listKeyResults, updateKeyResultCurrentValue,
} from '@/lib/db/objective-key-results'
import { getPeople } from '@/lib/db/directory'
import { ObjectiveKeyResultsSection } from './objective-key-results-section'

const scopesFor = (o: Partial<WorkWriteScopes>): WorkWriteScopes => ({
  workline_org: false, objective_org: false, workline_bu_ids: [], objective_bu_ids: [],
  objective_content_org: false, objective_content_bu_ids: [], ...o,
})
const ADMIN = scopesFor({ objective_org: true, objective_content_org: true })
const OPS_LEAD = scopesFor({ objective_content_org: true })
const OWN_HEAD = scopesFor({ objective_content_bu_ids: ['bu-1'] })
const OTHER_HEAD = scopesFor({ objective_content_bu_ids: ['bu-2'] })
const MEMBER = scopesFor({})

const kr = (o: Partial<KeyResultRow> = {}): KeyResultRow => ({
  id: 'kr-1', objective_id: 'obj-1', what: 'Ship orders', target_value: 60, current_value: 42,
  unit: 'orders', due_date: null, owner_person_id: null, ...o,
})

function renderSection(
  scopes: WorkWriteScopes,
  props: { businessUnitId?: string | null; isCompanyWide?: boolean; archived?: boolean } = {},
) {
  return render(
    <I18nProvider>
      <ObjectiveKeyResultsSection
        objectiveId="obj-1"
        businessUnitId={props.businessUnitId === undefined ? 'bu-1' : props.businessUnitId}
        isCompanyWide={props.isCompanyWide ?? false}
        archived={props.archived ?? false}
        scopes={scopes}
      />
    </I18nProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listKeyResults).mockResolvedValue([kr()])
  vi.mocked(getPeople).mockResolvedValue([])
})

describe('key results authority', () => {
  it('shows add and remove only to admin', async () => {
    const view = renderSection(ADMIN)
    await screen.findByDisplayValue('Ship orders')
    expect(screen.getByRole('button', { name: 'Add key result' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Remove key result/ })).toBeInTheDocument()
    view.unmount()
    for (const scopes of [OPS_LEAD, OWN_HEAD, MEMBER]) {
      const v = renderSection(scopes)
      await screen.findByText('Ship orders')
      expect(screen.queryByRole('button', { name: 'Add key result' })).toBeNull()
      expect(screen.queryByRole('button', { name: /Remove key result/ })).toBeNull()
      v.unmount()
    }
  })

  it.each([
    ['ops_lead', OPS_LEAD, {}],
    ['own-unit BU head', OWN_HEAD, {}],
  ])('lets %s edit the current value only', async (_n, scopes, props) => {
    renderSection(scopes, props)
    await screen.findByText('Ship orders')
    expect(screen.getByRole('textbox', { name: 'Current' })).toBeEnabled()
    expect(screen.queryByRole('textbox', { name: 'Key result' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Target' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Unit' })).toBeNull()
  })

  it.each([
    ['other-unit BU head', OTHER_HEAD, {}],
    ['BU head on a Company-wide Objective', OWN_HEAD, { isCompanyWide: true, businessUnitId: null }],
    ['BU head on a unit-less Objective', OWN_HEAD, { businessUnitId: null }],
    ['member', MEMBER, {}],
    ['admin on an archived Objective', ADMIN, { archived: true }],
  ])('is read-only for %s', async (_n, scopes, props) => {
    renderSection(scopes, props)
    await screen.findByText('Ship orders')
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add key result' })).toBeNull()
    expect(screen.getByTestId('key-result-progress')).toHaveTextContent('42 / 60 orders')
  })

  it('admin edits every field', async () => {
    renderSection(ADMIN)
    await screen.findByDisplayValue('Ship orders')
    for (const name of ['Key result', 'Target', 'Current', 'Unit']) {
      expect(screen.getByRole('textbox', { name })).toBeEnabled()
    }
    expect(screen.getByLabelText('Due')).toBeInTheDocument()
    expect(screen.getByText('Owner')).toBeInTheDocument()
  })
})

describe('key result progress', () => {
  const text = () => screen.getByTestId('key-result-progress')

  it('shows current / target unit with a track when both are set', async () => {
    renderSection(MEMBER)
    await screen.findByText('Ship orders')
    expect(text()).toHaveTextContent('42 / 60 orders')
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '70')
  })

  it('shows current with unit and no percentage when only current is set', async () => {
    vi.mocked(listKeyResults).mockResolvedValue([kr({ target_value: null })])
    renderSection(MEMBER)
    await screen.findByText('Ship orders')
    expect(text()).toHaveTextContent(/^42 orders$/)
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('shows the target without a percentage when only target is set', async () => {
    vi.mocked(listKeyResults).mockResolvedValue([kr({ current_value: null })])
    renderSection(MEMBER)
    await screen.findByText('Ship orders')
    expect(text()).toHaveTextContent('Target 60 orders')
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('shows nothing numeric when neither is set', async () => {
    vi.mocked(listKeyResults).mockResolvedValue([kr({ current_value: null, target_value: null })])
    renderSection(MEMBER)
    await screen.findByText('Ship orders')
    expect(screen.queryByTestId('key-result-progress')).toBeNull()
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('draws no track for a zero target', async () => {
    vi.mocked(listKeyResults).mockResolvedValue([kr({ target_value: 0 })])
    renderSection(MEMBER)
    await screen.findByText('Ship orders')
    expect(text()).toHaveTextContent('42 / 0 orders')
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('never combines figures across rows', async () => {
    vi.mocked(listKeyResults).mockResolvedValue([kr(), kr({ id: 'kr-2', what: 'Cut waste', current_value: 3, target_value: 10, unit: 'kg' })])
    renderSection(MEMBER)
    await screen.findByText('Cut waste')
    const rows = screen.getAllByTestId('key-result-progress')
    expect(rows.map((r) => r.textContent)).toEqual(['42 / 60 orders', '3 / 10 kg'])
    expect(screen.getAllByRole('progressbar')).toHaveLength(2)
  })
})

describe('key result commits', () => {
  it('keeps the typed value and offers Retry when a commit fails', async () => {
    const user = userEvent.setup()
    vi.mocked(updateKeyResultCurrentValue).mockRejectedValueOnce(new Error('nope'))
    renderSection(OPS_LEAD)
    await screen.findByText('Ship orders')
    const input = screen.getByRole('textbox', { name: 'Current' })
    await user.clear(input)
    await user.type(input, '55')
    await user.tab()
    await screen.findByRole('button', { name: 'Retry' })
    expect(input).toHaveValue('55')
    expect(screen.getByText(/Couldn't save/)).toBeInTheDocument()
    vi.mocked(updateKeyResultCurrentValue).mockResolvedValueOnce(kr({ current_value: 55 }))
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByText('Saved')
    expect(updateKeyResultCurrentValue).toHaveBeenLastCalledWith('kr-1', 55)
  })

  it('sends null for an empty current value, never zero', async () => {
    const user = userEvent.setup()
    vi.mocked(updateKeyResultCurrentValue).mockResolvedValue(kr({ current_value: null }))
    renderSection(OPS_LEAD)
    await screen.findByText('Ship orders')
    const input = screen.getByRole('textbox', { name: 'Current' })
    await user.clear(input)
    await user.tab()
    await waitFor(() => expect(updateKeyResultCurrentValue).toHaveBeenCalledWith('kr-1', null))
  })

  it('does not send a non-numeric value', async () => {
    const user = userEvent.setup()
    renderSection(OPS_LEAD)
    await screen.findByText('Ship orders')
    const input = screen.getByRole('textbox', { name: 'Current' })
    await user.clear(input)
    await user.type(input, 'Infinity')
    await user.tab()
    await screen.findByRole('button', { name: 'Retry' })
    expect(updateKeyResultCurrentValue).not.toHaveBeenCalled()
    expect(input).toHaveValue('Infinity')
  })

  it('adds a key result as admin', async () => {
    const user = userEvent.setup()
    vi.mocked(listKeyResults).mockResolvedValue([])
    vi.mocked(createKeyResult).mockResolvedValue(kr({ id: 'kr-9', what: 'New one', current_value: null, target_value: null, unit: null }))
    renderSection(ADMIN)
    await screen.findByText('No key results yet.')
    await user.type(screen.getByRole('textbox', { name: 'New key result' }), 'New one')
    await user.click(screen.getByRole('button', { name: 'Add key result' }))
    await waitFor(() => expect(createKeyResult).toHaveBeenCalledWith('obj-1', 'New one'))
    expect(await screen.findByDisplayValue('New one')).toBeInTheDocument()
  })

  it('asks before removing', async () => {
    const user = userEvent.setup()
    vi.mocked(deleteKeyResult).mockResolvedValue()
    renderSection(ADMIN)
    await screen.findByDisplayValue('Ship orders')
    await user.click(screen.getByRole('button', { name: /Remove key result/ }))
    expect(deleteKeyResult).not.toHaveBeenCalled()
    await user.click(await screen.findByRole('button', { name: 'Remove key result', hidden: false }))
    await waitFor(() => expect(deleteKeyResult).toHaveBeenCalledWith('kr-1'))
  })
})
