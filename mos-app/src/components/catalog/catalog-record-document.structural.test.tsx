// Objective structural fields (name, Business Unit / Company-wide, period, accountable) follow the
// objective-manage authority, which the RPC grants to admin only. The write-up tier
// (objective_content_*) never opens them. The real authority hook runs over a mocked RPC read, so
// this pins the whole path from WorkWriteScopes to what the record offers.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { AuthContext, type AuthState } from '@/auth/context'
import type { WorkWriteScopes } from '@/lib/db/work-authority'
import type { ObjectivePatch } from '@/lib/db/objectives'

vi.mock('@/lib/db/objectives', () => ({ updateObjective: vi.fn() }))
vi.mock('@/lib/db/work-lines', () => ({ updateWorkLine: vi.fn() }))
vi.mock('@/components/processes/process-occurrence-controls', () => ({ ProcessOccurrenceControls: () => null }))
const editorModule = vi.hoisted(() => ({ loads: 0 }))
vi.mock('./objective-writeup-editor', () => {
  editorModule.loads += 1
  return { ObjectiveWriteupEditor: () => <p>write-up editor</p> }
})
vi.mock('./catalog-record-loader', () => ({ loadCatalogRecordData: vi.fn(), loadCatalogRecordEditDirectory: vi.fn() }))
vi.mock('@/lib/db/work-authority', () => ({
  emptyWorkWriteScopes: () => ({
    workline_org: false,
    objective_org: false,
    workline_bu_ids: [],
    objective_bu_ids: [],
    objective_content_org: false,
    objective_content_bu_ids: [],
  }),
  getWorkWriteScopes: vi.fn(),
}))

import { updateObjective } from '@/lib/db/objectives'
import { getWorkWriteScopes } from '@/lib/db/work-authority'
import { loadCatalogRecordData, loadCatalogRecordEditDirectory, type CatalogRecordData } from './catalog-record-loader'
import type { CatalogRow } from './catalog-collection-adapter'
import { CatalogRecordDocument } from './catalog-record-document'

const scopesFor = (overrides: Partial<WorkWriteScopes>): WorkWriteScopes => ({
  workline_org: false,
  objective_org: false,
  workline_bu_ids: [],
  objective_bu_ids: [],
  objective_content_org: false,
  objective_content_bu_ids: [],
  ...overrides,
})

// The four viewers the RPC distinguishes: only admin holds objective_org.
const VIEWERS: readonly { name: string; scopes: WorkWriteScopes; editable: boolean }[] = [
  { name: 'admin', scopes: scopesFor({ objective_org: true, objective_content_org: true }), editable: true },
  { name: 'ops_lead', scopes: scopesFor({ objective_content_org: true }), editable: false },
  { name: 'BU head', scopes: scopesFor({ objective_content_bu_ids: ['bu-1'] }), editable: false },
  { name: 'member', scopes: scopesFor({}), editable: false },
]

function auth(): AuthState {
  return {
    status: 'authenticated',
    viewer: {
      person: {
        id: 'p1', org_id: 'org-1', user_id: 'u1', full_name: 'Test Viewer',
        email: 'viewer@example.test', must_change_password: false, archived_at: null,
        created_at: '2026-08-01', updated_at: '2026-08-01',
      },
      roles: [], isManager: false, accessRoles: [], affiliated: [],
    },
    signOut: vi.fn(),
  }
}

let current: CatalogRow

function baseRow(overrides: Partial<CatalogRow> = {}): CatalogRow {
  return {
    id: 'obj-1', name: 'Grow revenue', archived_at: null,
    businessUnitId: 'bu-1', isCompanyWide: false, accountablePersonId: 'p1',
    periodYear: 2026, periodQuarter: 3,
    ...overrides,
  }
}

function recordData(row: CatalogRow): CatalogRecordData {
  return {
    row,
    context: {
      traceById: new Map(),
      relationsById: new Map([[row.id, { groups: [], tasks: [] }]]),
      relationsKind: 'objective',
      progressById: new Map([[row.id, { done: 0, total: 0 }]]),
      businessUnitsById: new Map([['bu-1', 'Retail Ops']]),
      peopleById: new Map([['p1', 'Test Viewer']]),
      objectiveOptions: [],
    },
    process: null,
    peopleById: new Map([['p1', 'Test Viewer']]),
    roleNamesById: new Map(),
    owningTeams: new Map(),
  }
}

function applyPatch(patch: ObjectivePatch) {
  const next = { ...current }
  if (patch.business_unit_id !== undefined) next.businessUnitId = patch.business_unit_id
  if (patch.is_company_wide !== undefined) next.isCompanyWide = patch.is_company_wide
  if (patch.period_year !== undefined) next.periodYear = patch.period_year
  if (patch.period_quarter !== undefined) next.periodQuarter = patch.period_quarter
  current = next
}

function renderObjective() {
  return render(
    <AuthContext.Provider value={auth()}>
      <I18nProvider>
        <MemoryRouter>
          <CatalogRecordDocument kind="objective" id="obj-1" mode="page" />
        </MemoryRouter>
      </I18nProvider>
    </AuthContext.Provider>,
  )
}

async function openDetails() {
  await screen.findByRole('heading', { name: 'Grow revenue' })
  await waitFor(() => expect(screen.getByRole('tab', { name: 'Work' })).toHaveAttribute('aria-selected', 'true'))
  fireEvent.click(screen.getByRole('tab', { name: 'Details' }))
  await waitFor(() => expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true'))
  return screen.getByRole('tabpanel', { name: 'Details' })
}

const fieldValue = (details: HTMLElement, key: string) =>
  details.querySelector(`[data-field-key="${key}"] .record-field__value`)?.textContent

beforeEach(() => {
  vi.clearAllMocks()
  editorModule.loads = 0
  current = baseRow()
  vi.mocked(getWorkWriteScopes).mockResolvedValue(VIEWERS[0].scopes)
  vi.mocked(loadCatalogRecordData).mockImplementation(async () => recordData(current))
  vi.mocked(loadCatalogRecordEditDirectory).mockResolvedValue({
    businessUnitsById: new Map([['bu-1', 'Retail Ops'], ['bu-2', 'Hospitality']]),
    peopleById: new Map([['p1', 'Test Viewer'], ['p2', 'Second Person']]),
    objectiveOptions: [],
  })
  vi.mocked(updateObjective).mockImplementation(async (_id, patch) => { applyPatch(patch) })
})

// First in the file: the module cache keeps an earlier import, which would hide an eager one.
describe('Objective write-up editor loading', () => {
  it('imports the editor module only when the Write-up tab is selected', async () => {
    renderObjective()
    await screen.findByRole('heading', { name: 'Grow revenue' })
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Work' })).toHaveAttribute('aria-selected', 'true'))
    fireEvent.click(screen.getByRole('tab', { name: 'Details' }))
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true'))
    expect(editorModule.loads).toBe(0)
    expect(screen.queryByText('write-up editor')).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: 'Write-up' }))
    expect(await screen.findByText('write-up editor')).toBeInTheDocument()
    expect(editorModule.loads).toBe(1)
  })
})

describe.each(VIEWERS)('Objective structural fields for $name', ({ scopes, editable }) => {
  beforeEach(() => { vi.mocked(getWorkWriteScopes).mockResolvedValue(scopes) })

  it(editable ? 'offers an edit control on every structural field' : 'shows every structural field as read-only text with the permission note', async () => {
    renderObjective()
    const details = await openDetails()
    if (editable) {
      await waitFor(() => expect(within(details).getByRole('button', { name: 'Edit Business Unit' })).toBeInTheDocument())
      for (const label of ['Edit Business Unit', 'Edit Accountable', 'Edit Period', 'Edit Quarter']) {
        expect(within(details).getByRole('button', { name: label })).toBeInTheDocument()
      }
      expect(within(details).queryByRole('note')).toBeNull()
      expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument()
      return
    }
    expect(within(details).getByRole('note'))
      .toHaveTextContent('You can view this. An admin sets the name, Business Unit, period and accountable person.')
    expect(within(details).queryAllByRole('button', { name: /^Edit / })).toHaveLength(0)
    expect(within(details).queryAllByRole('combobox')).toHaveLength(0)
    expect(fieldValue(details, 'businessUnit')).toBe('Retail Ops')
    expect(fieldValue(details, 'accountable')).toBe('Test Viewer')
    expect(fieldValue(details, 'period')).toBe('2026')
    expect(fieldValue(details, 'periodQuarter')).toBe('Q3')
    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull()
  })
})

describe('Objective Business Unit display', () => {
  it('reads Company-wide, never Not set, for a Company-wide Objective', async () => {
    current = baseRow({ businessUnitId: null, isCompanyWide: true })
    renderObjective()
    const details = await openDetails()
    expect(fieldValue(details, 'businessUnit')).toBe('Company-wide')
    expect(within(details).queryByText('Not set')).toBeNull()
  })

  it('keeps Not set for an Objective with neither a unit nor Company-wide', async () => {
    current = baseRow({ businessUnitId: null, isCompanyWide: false })
    renderObjective()
    const details = await openDetails()
    expect(fieldValue(details, 'businessUnit')).toBe('Not set')
    expect(details.querySelector('[data-field-key="businessUnit"]')).toHaveAttribute('data-empty', 'true')
  })
})

describe('Objective structural pickers (admin)', () => {
  beforeEach(() => { vi.mocked(getWorkWriteScopes).mockResolvedValue(VIEWERS[0].scopes) })

  async function openPicker(name: string) {
    const details = await openDetails()
    fireEvent.click(await within(details).findByRole('button', { name: `Edit ${name}` }))
    fireEvent.click(await screen.findByRole('combobox', { name }))
    return screen.getByRole('listbox')
  }

  it('offers Not set, Company-wide and the units in the Business Unit picker', async () => {
    renderObjective()
    const list = await openPicker('Business Unit')
    expect(within(list).getAllByRole('option').map((option) => option.textContent))
      .toEqual(['Not set', 'Company-wide', 'Retail Ops', 'Hospitality'])
  })

  it('picking Company-wide sets the flag and clears the unit in one patch', async () => {
    renderObjective()
    const list = await openPicker('Business Unit')
    fireEvent.click(within(list).getByRole('option', { name: 'Company-wide' }))
    await waitFor(() => expect(updateObjective).toHaveBeenCalledWith('obj-1', { is_company_wide: true, business_unit_id: null }))
    expect(vi.mocked(updateObjective).mock.calls[0][1]).not.toEqual(expect.objectContaining({ business_unit_id: expect.stringMatching(/.+/) }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Business Unit' })).toHaveTextContent('Company-wide'))
  })

  it('picking a unit clears Company-wide in the same patch', async () => {
    current = baseRow({ businessUnitId: null, isCompanyWide: true })
    renderObjective()
    const list = await openPicker('Business Unit')
    fireEvent.click(within(list).getByRole('option', { name: 'Hospitality' }))
    await waitFor(() => expect(updateObjective).toHaveBeenCalledWith('obj-1', { business_unit_id: 'bu-2', is_company_wide: false }))
  })

  it('picking Not set clears both', async () => {
    renderObjective()
    const list = await openPicker('Business Unit')
    fireEvent.click(within(list).getByRole('option', { name: 'Not set' }))
    await waitFor(() => expect(updateObjective).toHaveBeenCalledWith('obj-1', { business_unit_id: null, is_company_wide: false }))
  })

  it('lists exactly Whole year and Q1 to Q4 in the quarter picker', async () => {
    renderObjective()
    const list = await openPicker('Quarter')
    expect(within(list).getAllByRole('option').map((option) => option.textContent))
      .toEqual(['Whole year', 'Q1', 'Q2', 'Q3', 'Q4'])
  })

  it('saves a quarter, and Whole year saves none', async () => {
    renderObjective()
    let list = await openPicker('Quarter')
    fireEvent.click(within(list).getByRole('option', { name: 'Q1' }))
    await waitFor(() => expect(updateObjective).toHaveBeenCalledWith('obj-1', { period_quarter: 1 }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Quarter' })).toHaveTextContent('Q1'))
    fireEvent.click(screen.getByRole('button', { name: 'Edit Quarter' }))
    fireEvent.click(await screen.findByRole('combobox', { name: 'Quarter' }))
    list = screen.getByRole('listbox')
    fireEvent.click(within(list).getByRole('option', { name: 'Whole year' }))
    await waitFor(() => expect(updateObjective).toHaveBeenLastCalledWith('obj-1', { period_quarter: null }))
  })

  it('disables the quarter with a stated reason while no year is set', async () => {
    current = baseRow({ periodYear: null, periodQuarter: null })
    renderObjective()
    const details = await openDetails()
    await waitFor(() => expect(within(details).getByRole('button', { name: 'Edit Business Unit' })).toBeInTheDocument())
    expect(within(details).queryByRole('button', { name: 'Edit Quarter' })).toBeNull()
    expect(details.querySelector('[data-field-key="periodQuarter"]')).toHaveTextContent('Set a year first to choose a quarter.')
  })

  it('clears the quarter in the same patch when the year is cleared', async () => {
    renderObjective()
    const details = await openDetails()
    fireEvent.click(await within(details).findByRole('button', { name: 'Edit Period' }))
    const input = screen.getByRole('textbox', { name: 'Period' })
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(updateObjective).toHaveBeenCalledWith('obj-1', { period_year: null, period_quarter: null }))
  })

  it('keeps the quarter when the year is changed to another year', async () => {
    renderObjective()
    const details = await openDetails()
    fireEvent.click(await within(details).findByRole('button', { name: 'Edit Period' }))
    const input = screen.getByRole('textbox', { name: 'Period' })
    fireEvent.change(input, { target: { value: '2031' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(updateObjective).toHaveBeenCalledWith('obj-1', { period_year: 2031 }))
  })

  it('runs the keyboard journey on the Business Unit picker: open, type, arrows, Enter, Escape, focus return', async () => {
    const user = userEvent.setup()
    renderObjective()
    const details = await openDetails()
    const edit = await within(details).findByRole('button', { name: 'Edit Business Unit' })
    await user.click(edit)
    const trigger = await screen.findByRole('combobox', { name: 'Business Unit' })
    expect(trigger).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    await user.keyboard('company')
    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(1)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Business Unit' })).toHaveFocus())
    expect(updateObjective).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Edit Business Unit' }))
    await user.keyboard('{Enter}{ArrowUp}{Enter}')
    await waitFor(() => expect(updateObjective).toHaveBeenCalledTimes(1))
    expect(updateObjective).toHaveBeenCalledWith('obj-1', { is_company_wide: true, business_unit_id: null })
  })

  it.each(['Business Unit', 'Quarter'])('keeps focus on the %s edit control after choosing with Enter', async (name) => {
    const user = userEvent.setup()
    renderObjective()
    const details = await openDetails()
    await user.click(await within(details).findByRole('button', { name: `Edit ${name}` }))
    await screen.findByRole('combobox', { name })
    await user.keyboard('{Enter}{ArrowUp}{Enter}')
    await waitFor(() => expect(updateObjective).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByRole('button', { name: `Edit ${name}` })).toHaveFocus())
  })
})
