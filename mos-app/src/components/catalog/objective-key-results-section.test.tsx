import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  createKeyResult, deleteKeyResult, listKeyResults, updateKeyResultCurrentValue, updateKeyResultTargets,
} from '@/lib/db/objective-key-results'
import { getPeople } from '@/lib/db/directory'
import { ObjectiveKeyResultsSection, type ObjectiveKeyResultsSectionProps } from './objective-key-results-section'

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
  props: Partial<Omit<ObjectiveKeyResultsSectionProps, 'objectiveId' | 'scopes'>> = {},
) {
  return render(
    <I18nProvider>
      <ObjectiveKeyResultsSection
        objectiveId="obj-1"
        businessUnitId={props.businessUnitId === undefined ? 'bu-1' : props.businessUnitId}
        isCompanyWide={props.isCompanyWide ?? false}
        archived={props.archived ?? false}
        scopes={scopes}
        {...props}
      />
    </I18nProvider>,
  )
}

const editCurrent = () => screen.getByRole('button', { name: 'Edit current value: Ship orders' })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listKeyResults).mockResolvedValue([kr()])
  vi.mocked(getPeople).mockResolvedValue([{ id: 'p-1', full_name: 'Sari Sales' }])
})

describe('key results authority', () => {
  it('shows add, edit and remove only to admin', async () => {
    const user = userEvent.setup()
    const view = renderSection(ADMIN)
    await screen.findByText('Ship orders')
    expect(screen.getByRole('button', { name: 'Add key result' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Edit key result: Ship orders' }))
    expect(screen.getByRole('button', { name: 'Remove key result' })).toBeInTheDocument()
    view.unmount()
    for (const scopes of [OPS_LEAD, OWN_HEAD, MEMBER]) {
      const v = renderSection(scopes)
      await screen.findByText('Ship orders')
      expect(screen.queryByRole('button', { name: 'Add key result' })).toBeNull()
      expect(screen.queryByRole('button', { name: /^Edit key result/ })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Remove key result' })).toBeNull()
      v.unmount()
    }
  })

  it.each([
    ['ops_lead', OPS_LEAD, {}],
    ['own-unit BU head', OWN_HEAD, {}],
    ['admin', ADMIN, {}],
  ])('lets %s update the current value in place', async (_n, scopes, props) => {
    renderSection(scopes, props)
    await screen.findByText('Ship orders')
    expect(editCurrent()).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Key result' })).toBeNull()
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
    expect(screen.queryByRole('button', { name: /Edit/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add key result' })).toBeNull()
    expect(screen.getByTestId('key-result-progress')).toHaveTextContent('42 / 60 orders')
  })

  it('opens an edit form with every target field for admin', async () => {
    const user = userEvent.setup()
    renderSection(ADMIN)
    await screen.findByText('Ship orders')
    await user.click(screen.getByRole('button', { name: 'Edit key result: Ship orders' }))
    const form = screen.getByRole('form', { name: 'Edit key result: Ship orders' })
    for (const name of ['Key result', 'Target', 'Unit']) expect(within(form).getByRole('textbox', { name })).toBeEnabled()
    expect(within(form).getByLabelText('Due')).toBeInTheDocument()
    expect(within(form).getByText('Responsible')).toBeInTheDocument()
  })
})

describe('key results permission lookup', () => {
  it('offers a retry when the permission lookup failed', async () => {
    const onRetryScopes = vi.fn()
    renderSection(MEMBER, { scopesStatus: 'error', onRetryScopes })
    await screen.findByText('Ship orders')
    expect(screen.getByText("Couldn't check your permissions.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetryScopes).toHaveBeenCalledTimes(1)
  })
})

describe('key result figures', () => {
  const text = () => screen.getByTestId('key-result-progress')

  it('shows current / target unit and a percent with a track when both are set', async () => {
    renderSection(MEMBER)
    await screen.findByText('Ship orders')
    expect(text()).toHaveTextContent('42 / 60 orders')
    expect(text()).toHaveTextContent('70%')
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '70')
  })

  it('groups thousands by locale', async () => {
    vi.mocked(listKeyResults).mockResolvedValue([kr({ current_value: 72000, target_value: 85000, unit: 'IDR' })])
    renderSection(MEMBER)
    await screen.findByText('Ship orders')
    expect(text()).toHaveTextContent('72,000 / 85,000 IDR')
  })

  it('shows current with unit and no percentage when only current is set', async () => {
    vi.mocked(listKeyResults).mockResolvedValue([kr({ target_value: null })])
    renderSection(MEMBER)
    await screen.findByText('Ship orders')
    expect(text()).toHaveTextContent(/^42 orders$/)
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('shows the target without a percentage when only target is set, and offers a writer the current value', async () => {
    vi.mocked(listKeyResults).mockResolvedValue([kr({ current_value: null })])
    const view = renderSection(MEMBER)
    await screen.findByText('Ship orders')
    expect(text()).toHaveTextContent('Target 60 orders')
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.queryByRole('button', { name: /Add current value/ })).toBeNull()
    view.unmount()
    renderSection(OPS_LEAD)
    expect(await screen.findByRole('button', { name: /Add current value/ })).toBeInTheDocument()
  })

  it('shows nothing numeric when neither is set', async () => {
    vi.mocked(listKeyResults).mockResolvedValue([kr({ current_value: null, target_value: null })])
    renderSection(MEMBER)
    await screen.findByText('Ship orders')
    expect(text()).toBeEmptyDOMElement()
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
    expect(rows[0]).toHaveTextContent('42 / 60 orders')
    expect(rows[1]).toHaveTextContent('3 / 10 kg')
    expect(screen.getAllByRole('progressbar')).toHaveLength(2)
  })

  it('shows the due date and the Responsible name on the row', async () => {
    vi.mocked(listKeyResults).mockResolvedValue([kr({ due_date: '2026-12-31', owner_person_id: 'p-1' })])
    renderSection(MEMBER)
    await screen.findByText('Ship orders')
    expect(screen.getByTestId('key-result-row')).toHaveTextContent('31 Dec 2026')
    await waitFor(() => expect(screen.getByTestId('key-result-row')).toHaveTextContent('Sari Sales'))
  })
})

describe('key result people directory', () => {
  it('shows a retryable error when the people list fails and reloads it on Retry', async () => {
    const user = userEvent.setup()
    vi.mocked(getPeople).mockRejectedValueOnce(new Error('down'))
    renderSection(ADMIN)
    await screen.findByText('Ship orders')
    await screen.findByText("Couldn't load the people list.")
    vi.mocked(getPeople).mockResolvedValueOnce([{ id: 'p-1', full_name: 'Sari' }])
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.queryByText("Couldn't load the people list.")).toBeNull())
    expect(getPeople).toHaveBeenCalledTimes(2)
  })
})

describe('current value commits', () => {
  it('keeps the typed value and offers Retry when a commit fails', async () => {
    const user = userEvent.setup()
    vi.mocked(updateKeyResultCurrentValue).mockRejectedValueOnce(new Error('nope'))
    renderSection(OPS_LEAD)
    await screen.findByText('Ship orders')
    await user.click(editCurrent())
    const input = screen.getByRole('textbox', { name: 'Current' })
    expect(input).toHaveFocus()
    await user.clear(input)
    await user.type(input, '55')
    await user.tab()
    await screen.findByRole('button', { name: 'Retry' })
    expect(input).toHaveValue('55')
    expect(screen.getByText(/Couldn't save/)).toBeInTheDocument()
    vi.mocked(updateKeyResultCurrentValue).mockResolvedValueOnce(kr({ current_value: 55 }))
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Current' })).toBeNull())
    expect(updateKeyResultCurrentValue).toHaveBeenLastCalledWith('kr-1', 55)
    expect(screen.getByTestId('key-result-progress')).toHaveTextContent('55 / 60 orders')
  })

  it('sends null for an empty current value, never zero', async () => {
    const user = userEvent.setup()
    vi.mocked(updateKeyResultCurrentValue).mockResolvedValue(kr({ current_value: null }))
    renderSection(OPS_LEAD)
    await screen.findByText('Ship orders')
    await user.click(editCurrent())
    await user.clear(screen.getByRole('textbox', { name: 'Current' }))
    await user.tab()
    await waitFor(() => expect(updateKeyResultCurrentValue).toHaveBeenCalledWith('kr-1', null))
  })

  it('refuses a non-numeric value on blur with a message, and sends nothing', async () => {
    renderSection(OPS_LEAD)
    await screen.findByText('Ship orders')
    fireEvent.click(editCurrent())
    const input = screen.getByRole('textbox', { name: 'Current' })
    fireEvent.change(input, { target: { value: 'Infinity' } })
    // The blur starts the commit; act drains it, so the invalid state is settled before any assertion.
    await act(async () => { fireEvent.blur(input) })
    expect(screen.getByRole('alert')).toHaveTextContent('Use a number, up to 6 decimals.')
    expect(updateKeyResultCurrentValue).not.toHaveBeenCalled()
    expect(input).toHaveValue('Infinity')
  })

  it.each(['1000000000000000', '-1000000000000000', '1.1234567', '0.0000001'])(
    'does not send %s, which the database refuses', async (typed) => {
      const user = userEvent.setup()
      renderSection(OPS_LEAD)
      await screen.findByText('Ship orders')
      await user.click(editCurrent())
      const input = screen.getByRole('textbox', { name: 'Current' })
      await user.clear(input)
      await user.type(input, typed)
      await user.tab()
      await screen.findByRole('alert')
      expect(updateKeyResultCurrentValue).not.toHaveBeenCalled()
    })

  it('sends the largest value the database accepts', async () => {
    const user = userEvent.setup()
    renderSection(OPS_LEAD)
    await screen.findByText('Ship orders')
    await user.click(editCurrent())
    const input = screen.getByRole('textbox', { name: 'Current' })
    await user.clear(input)
    await user.type(input, '12345.123456')
    await user.tab()
    await waitFor(() => expect(updateKeyResultCurrentValue).toHaveBeenCalledWith('kr-1', 12345.123456))
  })

  it('hands focus back to the value button when the editor closes', async () => {
    const user = userEvent.setup()
    renderSection(OPS_LEAD)
    await screen.findByText('Ship orders')
    await user.click(editCurrent())
    await user.keyboard('{Escape}')
    await waitFor(() => expect(editCurrent()).toHaveFocus())
  })

  it('Escape leaves the saved value alone', async () => {
    const user = userEvent.setup()
    renderSection(OPS_LEAD)
    await screen.findByText('Ship orders')
    await user.click(editCurrent())
    await user.type(screen.getByRole('textbox', { name: 'Current' }), '9')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('textbox', { name: 'Current' })).toBeNull()
    expect(updateKeyResultCurrentValue).not.toHaveBeenCalled()
    expect(screen.getByTestId('key-result-progress')).toHaveTextContent('42 / 60 orders')
  })
})

describe('key result form', () => {
  it('sends only the fields that changed, and returns focus to the Edit button', async () => {
    const user = userEvent.setup()
    vi.mocked(updateKeyResultTargets).mockResolvedValue(kr({ unit: 'boxes' }))
    renderSection(ADMIN)
    await screen.findByText('Ship orders')
    await user.click(screen.getByRole('button', { name: 'Edit key result: Ship orders' }))
    const unit = screen.getByRole('textbox', { name: 'Unit' })
    await user.clear(unit)
    await user.type(unit, 'boxes')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(updateKeyResultTargets).toHaveBeenCalledWith('kr-1', { unit: 'boxes' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit key result: Ship orders' })).toHaveFocus())
  })

  it('names what is wrong on blur, and keeps every typed value when a save fails', async () => {
    const user = userEvent.setup()
    vi.mocked(updateKeyResultTargets).mockRejectedValueOnce(new Error('down'))
    renderSection(ADMIN)
    await screen.findByText('Ship orders')
    await user.click(screen.getByRole('button', { name: 'Edit key result: Ship orders' }))
    const what = screen.getByRole('textbox', { name: 'Key result' })
    await user.clear(what)
    await user.tab()
    expect(await screen.findByText('Name the key result.')).toBeInTheDocument()
    await user.type(what, 'Ship more orders')
    const target = screen.getByRole('textbox', { name: 'Target' })
    await user.clear(target)
    await user.type(target, 'abc')
    await user.tab()
    expect(await screen.findByText('Use a number, up to 6 decimals.')).toBeInTheDocument()
    await user.clear(target)
    await user.type(target, '70')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByRole('button', { name: 'Retry' })
    expect(screen.getByText(/Couldn't save/)).toBeInTheDocument()
    expect(what).toHaveValue('Ship more orders')
    expect(target).toHaveValue('70')
    vi.mocked(updateKeyResultTargets).mockResolvedValueOnce(kr({ what: 'Ship more orders', target_value: 70 }))
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(updateKeyResultTargets).toHaveBeenLastCalledWith('kr-1', { what: 'Ship more orders', target_value: 70 }))
    expect(await screen.findByText('Ship more orders')).toBeInTheDocument()
  })

  it('a refused submit names the field, ties the message to it, and focuses it', async () => {
    const user = userEvent.setup()
    renderSection(ADMIN)
    await screen.findByText('Ship orders')
    await user.click(screen.getByRole('button', { name: 'Edit key result: Ship orders' }))
    const what = screen.getByRole('textbox', { name: 'Key result' })
    await user.clear(what)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    const message = await screen.findByText('Name the key result.')
    await waitFor(() => expect(what).toHaveFocus())
    expect(what).toHaveAttribute('aria-describedby', message.id)
    expect(updateKeyResultTargets).not.toHaveBeenCalled()
  })

  it('puts focus on the Add action when the blank row closes', async () => {
    const user = userEvent.setup()
    renderSection(ADMIN)
    await user.click(await screen.findByRole('button', { name: 'Add key result' }))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add key result' })).toHaveFocus())
  })

  it('Escape cancels and restores the saved values', async () => {
    const user = userEvent.setup()
    renderSection(ADMIN)
    await screen.findByText('Ship orders')
    await user.click(screen.getByRole('button', { name: 'Edit key result: Ship orders' }))
    await user.type(screen.getByRole('textbox', { name: 'Key result' }), ' changed')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('form')).toBeNull()
    expect(screen.getByText('Ship orders')).toBeInTheDocument()
    expect(updateKeyResultTargets).not.toHaveBeenCalled()
  })

  it('adds a key result as a blank row: creates it, then writes the figures', async () => {
    const user = userEvent.setup()
    vi.mocked(listKeyResults).mockResolvedValue([])
    vi.mocked(createKeyResult).mockResolvedValue(kr({ id: 'kr-9', what: 'New one', current_value: null, target_value: null, unit: null }))
    vi.mocked(updateKeyResultTargets).mockResolvedValue(kr({ id: 'kr-9', what: 'New one', current_value: null, target_value: 30, unit: null }))
    renderSection(ADMIN)
    await user.click(await screen.findByRole('button', { name: 'Add key result' }))
    await user.type(screen.getByRole('textbox', { name: 'Key result' }), 'New one')
    await user.type(screen.getByRole('textbox', { name: 'Target' }), '30')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(createKeyResult).toHaveBeenCalledWith('obj-1', 'New one'))
    await waitFor(() => expect(updateKeyResultTargets).toHaveBeenCalledWith('kr-9', { target_value: 30 }))
    expect(await screen.findByText('New one')).toBeInTheDocument()
    expect(screen.queryByRole('form')).toBeNull()
  })

  it('a retry after the figures failed does not create the key result twice', async () => {
    const user = userEvent.setup()
    vi.mocked(listKeyResults).mockResolvedValue([])
    vi.mocked(createKeyResult).mockResolvedValue(kr({ id: 'kr-9', what: 'New one', current_value: null, target_value: null, unit: null }))
    vi.mocked(updateKeyResultTargets).mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(kr({ id: 'kr-9', what: 'New one', target_value: 30 }))
    renderSection(ADMIN)
    await user.click(await screen.findByRole('button', { name: 'Add key result' }))
    await user.type(screen.getByRole('textbox', { name: 'Key result' }), 'New one')
    await user.type(screen.getByRole('textbox', { name: 'Target' }), '30')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await user.click(await screen.findByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(updateKeyResultTargets).toHaveBeenCalledTimes(2))
    expect(createKeyResult).toHaveBeenCalledTimes(1)
  })

  it('asks before removing', async () => {
    const user = userEvent.setup()
    vi.mocked(deleteKeyResult).mockResolvedValue()
    renderSection(ADMIN)
    await screen.findByText('Ship orders')
    await user.click(screen.getByRole('button', { name: 'Edit key result: Ship orders' }))
    await user.click(screen.getByRole('button', { name: 'Remove key result' }))
    expect(deleteKeyResult).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Remove key result' }))
    await waitFor(() => expect(deleteKeyResult).toHaveBeenCalledWith('kr-1'))
    await waitFor(() => expect(screen.queryByText('Ship orders')).toBeNull())
  })
})

describe('the record drives the section', () => {
  it('reports its count, and stays out of the way while empty when the setup region owns the action', async () => {
    vi.mocked(listKeyResults).mockResolvedValue([])
    const onCount = vi.fn()
    renderSection(ADMIN, { hideWhenEmpty: true, onCount })
    await waitFor(() => expect(onCount).toHaveBeenLastCalledWith(0))
    expect(screen.queryByRole('region', { name: 'Key results' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add key result' })).toBeNull()
  })

  it('opens a blank row each time the record asks, even while hidden', async () => {
    vi.mocked(listKeyResults).mockResolvedValue([])
    const view = renderSection(ADMIN, { hideWhenEmpty: true, openAddToken: 0 })
    await waitFor(() => expect(getPeople).toHaveBeenCalled())
    view.rerender(
      <I18nProvider>
        <ObjectiveKeyResultsSection objectiveId="obj-1" businessUnitId="bu-1" archived={false} scopes={ADMIN} hideWhenEmpty openAddToken={1} />
      </I18nProvider>,
    )
    expect(await screen.findByRole('textbox', { name: 'Key result' })).toHaveFocus()
  })

  it('omits an empty section for a viewer who cannot add to it', async () => {
    vi.mocked(listKeyResults).mockResolvedValue([])
    const onCount = vi.fn()
    renderSection(MEMBER, { onCount })
    await waitFor(() => expect(onCount).toHaveBeenLastCalledWith(0))
    expect(screen.queryByRole('region', { name: 'Key results' })).toBeNull()
  })
})
