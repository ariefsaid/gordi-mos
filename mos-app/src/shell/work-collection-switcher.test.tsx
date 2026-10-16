import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { I18nProvider } from '@/i18n/I18nProvider'
import { useWorkHomeBack } from './work-collection-switcher'
import { useIsNarrow } from './use-is-narrow'

vi.mock('./use-is-narrow', () => ({ useIsNarrow: vi.fn() }))

const mockUseIsNarrow = vi.mocked(useIsNarrow)

function backAt(pathname: string, isNarrow = true) {
  mockUseIsNarrow.mockReturnValue(isNarrow)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <I18nProvider>
      <MemoryRouter initialEntries={[pathname]}>{children}</MemoryRouter>
    </I18nProvider>
  )
  return renderHook(() => useWorkHomeBack(), { wrapper }).result.current
}

describe('useWorkHomeBack', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each(['/work/signals', '/work/tasks', '/work/projects', '/work/objectives'])(
    'on a phone, %s offers the way back to the Work directory',
    (path) => {
      const back = backAt(path)
      expect(back?.to).toBe('/work')
      expect(back?.label).toMatch(/Work/)
    },
  )

  it('offers nothing on the Work directory itself', () => {
    expect(backAt('/work')).toBeUndefined()
  })

  it('offers nothing outside the narrow layout, where the rail reaches every collection', () => {
    expect(backAt('/work/tasks', false)).toBeUndefined()
  })
})
