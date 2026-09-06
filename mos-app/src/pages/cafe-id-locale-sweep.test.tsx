import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { AuthState } from '@/auth/context'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'

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
vi.mock('@/lib/db/branches', () => ({ listActiveBranches: vi.fn().mockResolvedValue([]) }))
vi.mock('@/lib/db/default-stream', () => ({ fetchDefaultStream: vi.fn().mockResolvedValue(null) }))
vi.mock('@/lib/db/kitchen-logs', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/kitchen-logs')>('@/lib/db/kitchen-logs')
  return { ...actual,
    listActiveWipItems: vi.fn().mockResolvedValue([]), listCaptureFormItems: vi.fn().mockResolvedValue([]),
    fetchPlanMap: vi.fn().mockResolvedValue({}), fetchStockMap: vi.fn().mockResolvedValue({}),
    fetchActualsMap: vi.fn().mockResolvedValue({}), listStreamPairs: vi.fn().mockResolvedValue([]),
    resolveKitchenBuId: vi.fn().mockResolvedValue('bu'), listSubmittedKitchenLogs: vi.fn().mockResolvedValue([]),
    fetchKitchenStock: vi.fn().mockResolvedValue([]), approveKitchenLog: vi.fn(), approveKitchenLogsBulk: vi.fn(),
    rejectKitchenLog: vi.fn(),
  }
})
vi.mock('@/lib/db/kitchen-plans', () => ({ listKitchenPlans: vi.fn().mockResolvedValue([]), listPesanan: vi.fn().mockResolvedValue([]), upsertKitchenPlan: vi.fn() }))
vi.mock('@/lib/db/kitchen-pushes', () => ({ listEsbPushes: vi.fn().mockResolvedValue([]) }))
vi.mock('@/lib/db/directory', () => ({ getPeople: vi.fn().mockResolvedValue([]) }))
vi.mock('@/lib/db/stream-completeness', () => ({ listStreamCompleteness: vi.fn().mockResolvedValue([]), confirmStreamComplete: vi.fn() }))

import { useAuth } from '@/auth/use-auth'
import { KitchenLogPage } from './kitchen-log-page'
import { KitchenPlanPage } from './kitchen-plan-page'
import { KitchenStockPage } from './kitchen-stock-page'
import { KitchenReviewPage } from './kitchen-review-page'
import { KitchenPushesPage } from './kitchen-pushes-page'

const auth = { status: 'authenticated', viewer: {
  person: { id: 'p', org_id: 'o', user_id: 'u', full_name: 'Budi', email: 'budi@example.test', archived_at: null, must_change_password: false, created_at: '', updated_at: '' },
  roles: [], isManager: false, accessRoles: ['ops_lead'], affiliated: ['cafe'],
}, signOut: vi.fn() } as unknown as AuthState

const ENGLISH_TOKENS = /\b(?:Stock|Chicken|Meat|Seafood|Snack|Veg|Rice|Pushes|Review|Plan|Stream|Transfer to)\b/i
const pages = [
  ['Log', KitchenLogPage], ['Plan', KitchenPlanPage], ['Stock', KitchenStockPage],
  ['Review', KitchenReviewPage], ['Pushes', KitchenPushesPage],
] as const

describe('AC-063/AC-064: Café pages stay Indonesian end to end', () => {
  beforeEach(() => {
    localStorage.setItem('mos.locale', 'id')
    vi.mocked(useAuth).mockReturnValue(auth)
  })

  it('renders every stream-resolved page and has no audit English token in visible text', async () => {
    for (const [name, Page] of pages) {
      const { container } = render(<MemoryRouter><I18nProvider><Page /></I18nProvider></MemoryRouter>)
      await waitFor(() => expect(container.textContent).not.toMatch(ENGLISH_TOKENS), { timeout: 3000 })
      expect(container.textContent).toContain('Tim')
      if (name === 'Pushes') expect(container.textContent).toContain('Kiriman')
      cleanup()
    }
  })
})
