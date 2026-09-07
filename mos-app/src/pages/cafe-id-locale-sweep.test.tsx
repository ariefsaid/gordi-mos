import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { AuthState } from '@/auth/context'
import type { CaptureFormItem, KitchenStockRow, ProductionStream, ReviewLogRow, WipItemOption, PlanCell } from '@/lib/db/kitchen-logs.types'
import type { EsbPushRow } from '@/lib/db/kitchen-pushes'

vi.mock('@/auth/use-auth')
vi.mock('@/lib/use-cafe-stream', () => {
  const branch = { id: 'branch-1', code: 'rumah_rames', name: 'Rumah Rames' }
  const stream: ProductionStream = { branch, activity: 'kitchen' }
  const state = {
    branches: [branch], options: [stream], stream,
    resolve: vi.fn().mockResolvedValue({ branches: [branch], options: [stream], stream }),
    adopt: vi.fn(), setStream: vi.fn(),
  }
  return { useCafeStream: () => state }
})
vi.mock('@/lib/db/branches', () => {
  const branch = { id: 'branch-1', code: 'rumah_rames', name: 'Rumah Rames' }
  return { listActiveBranches: vi.fn().mockResolvedValue([branch]) }
})
vi.mock('@/lib/db/default-stream', () => ({ fetchDefaultStream: vi.fn().mockResolvedValue(null) }))
vi.mock('@/lib/db/kitchen-logs', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/kitchen-logs')>('@/lib/db/kitchen-logs')
  return { ...actual,
    listActiveWipItems: vi.fn(), listCaptureFormItems: vi.fn(), fetchPlanMap: vi.fn(), fetchStockMap: vi.fn(),
    fetchActualsMap: vi.fn(), listStreamPairs: vi.fn(), resolveKitchenBuId: vi.fn(), listSubmittedKitchenLogs: vi.fn(),
    fetchKitchenStock: vi.fn(), approveKitchenLog: vi.fn(), approveKitchenLogsBulk: vi.fn(), rejectKitchenLog: vi.fn(),
  }
})
vi.mock('@/lib/db/kitchen-plans', () => ({ listKitchenPlans: vi.fn(), listPesanan: vi.fn(), upsertKitchenPlan: vi.fn() }))
vi.mock('@/lib/db/kitchen-pushes', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/kitchen-pushes')>('@/lib/db/kitchen-pushes')
  return { ...actual, listEsbPushes: vi.fn() }
})
vi.mock('@/lib/db/directory', () => ({ getPeople: vi.fn() }))
vi.mock('@/lib/db/stream-completeness', () => ({ listStreamCompleteness: vi.fn().mockResolvedValue([]), confirmStreamComplete: vi.fn() }))

import { useAuth } from '@/auth/use-auth'
import { listActiveWipItems, listCaptureFormItems, fetchPlanMap, fetchStockMap, fetchActualsMap, listStreamPairs, resolveKitchenBuId, listSubmittedKitchenLogs, fetchKitchenStock } from '@/lib/db/kitchen-logs'
import { listKitchenPlans } from '@/lib/db/kitchen-plans'
import { listEsbPushes } from '@/lib/db/kitchen-pushes'
import { getPeople } from '@/lib/db/directory'
import { KitchenLogPage } from './kitchen-log-page'
import { KitchenPlanPage } from './kitchen-plan-page'
import { KitchenStockPage } from './kitchen-stock-page'
import { KitchenReviewPage } from './kitchen-review-page'
import { KitchenPushesPage } from './kitchen-pushes-page'

const auth = { status: 'authenticated', viewer: {
  person: { id: 'p', org_id: 'o', user_id: 'u', full_name: 'Budi', email: 'budi@example.test', archived_at: null, must_change_password: false, created_at: '', updated_at: '' },
  roles: [], isManager: false, accessRoles: ['ops_lead'], affiliated: ['cafe'],
}, signOut: vi.fn() } as unknown as AuthState

const ITEMS: WipItemOption[] = [
  { id: 'wip-chicken', name: 'Dish One', category: 'Chicken' },
  { id: 'wip-meat', name: 'Dish Two', category: 'Meat' },
  { id: 'wip-seafood', name: 'Dish Three', category: 'Seafood' },
  { id: 'wip-snack', name: 'Dish Four', category: 'Snack/Sweet' },
  { id: 'wip-rice', name: 'Dish Five', category: 'Rice/Staple' },
  { id: 'wip-veg', name: 'Dish Six', category: 'Veg/Tempe/Tofu' },
]
const CAPTURE_ITEMS: CaptureFormItem[] = ITEMS.map(item => ({
  ...item, units: [{ id: `${item.id}-unit`, name: 'porsi', is_default: true }],
}))
const PLAN_CELLS: PlanCell[] = [{ id: 'plan-1', wip_item_id: 'wip-chicken', movement: { action: 'produce', destinationBranchId: null }, qty_porsi: 4 }]
const STOCK_ROW: KitchenStockRow = { wip_item_id: 'wip-chicken', wip_item_name: 'Dish One', category: 'Chicken', stok: 2, tersedia: 1 }
const REVIEW_ROW: ReviewLogRow = {
  id: 'log-1', log_date: '2026-06-20', action_type: 'Production', action: 'produce', destination_branch_id: null,
  branch_id: 'branch-1', activity: 'kitchen', wip_item_id: 'wip-chicken', wip_item_name: 'Dish One', qty_porsi: 1,
  notes: null, status: 'Submitted', submitted_by: 'person-1', business_unit_id: 'bu', created_at: '2026-06-20T09:00:00Z',
}
const PUSH_ROW: EsbPushRow = {
  id: 'push-1', source_module: 'kitchen', source_ref: 'batch-1', endpoint: 'assembly-actual', target_env: 'dry_run',
  status: 'posted', retry_count: 0, last_error: null, esb_doc_num: 'doc-1', created_at: '2026-06-20T09:00:00Z', posted_at: '2026-06-20T09:01:00Z',
}
const ENGLISH_TOKENS = /\b(?:Stock|Chicken|Meat|Seafood|Snack|Veg|Rice|Pushes|Review|Plan|Stream|Transfer to)\b/i
const INDONESIAN_TOKENS = /\b(?:Stok|Ayam|Daging|Makanan|Camilan|Sayur|Tim|Kiriman|Tinjau|Rencana|Alur|Pindah ke)\b/i
const pages = [
  ['Log', KitchenLogPage], ['Plan', KitchenPlanPage], ['Stock', KitchenStockPage],
  ['Review', KitchenReviewPage], ['Pushes', KitchenPushesPage],
] as const

describe('AC-063/AC-064: Café pages stay Indonesian end to end', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue(auth)
    vi.mocked(listActiveWipItems).mockResolvedValue(ITEMS)
    vi.mocked(listCaptureFormItems).mockResolvedValue(CAPTURE_ITEMS)
    vi.mocked(fetchPlanMap).mockResolvedValue({ 'wip-chicken': { produce: 4 } })
    vi.mocked(fetchStockMap).mockResolvedValue({ 'wip-chicken': { stok: 2, tersedia: 1 } })
    vi.mocked(fetchActualsMap).mockResolvedValue({ 'wip-chicken': { produce: 1 } })
    vi.mocked(listStreamPairs).mockResolvedValue([{ branch_id: 'branch-1', activity: 'kitchen' }])
    vi.mocked(resolveKitchenBuId).mockResolvedValue('bu')
    vi.mocked(listSubmittedKitchenLogs).mockResolvedValue([REVIEW_ROW])
    vi.mocked(fetchKitchenStock).mockResolvedValue([STOCK_ROW])
    vi.mocked(listKitchenPlans).mockResolvedValue(PLAN_CELLS)
    vi.mocked(listEsbPushes).mockResolvedValue([PUSH_ROW])
    vi.mocked(getPeople).mockResolvedValue([{ id: 'person-1', full_name: 'Budi' }])
  })

  it.each([
    ['id', ENGLISH_TOKENS, 'Tim', 'Kirim Log', 'Ayam', 'Stok'],
    ['en', INDONESIAN_TOKENS, 'Stream', 'Pushes', 'Chicken', 'Stock'],
  ] as const)('renders every stream-resolved page in the %s catalog', async (locale, denyList, streamWord, pushesWord, categoryLabel, stockLabel) => {
    localStorage.setItem('mos.locale', locale)
    for (const [name, Page] of pages) {
      const { container } = render(<MemoryRouter><I18nProvider><Page /></I18nProvider></MemoryRouter>)
      await screen.findByText(name === 'Pushes' ? 'batch-1' : 'Dish One')
      expect(container.textContent).not.toMatch(denyList)
      expect(container.textContent).toContain(streamWord)
      if (name === 'Plan') expect(container.querySelector('.dt-group-label, .dt-cards-group-label')?.textContent).toContain(categoryLabel)
      if (name === 'Log') expect(container.textContent).toContain(stockLabel)
      if (name === 'Pushes') expect(container.textContent).toContain(pushesWord)
      cleanup()
    }
  })
})
