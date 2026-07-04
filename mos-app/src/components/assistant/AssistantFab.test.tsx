// T28 — AssistantFab (phone, above the bottom tab bar) + the desktop top-bar button. Both gate on
// SHOW_ASSISTANT and call openPanel(); AC-AP-001 (FAB opens the slide-over), AC-AP-005/AC-CF-003
// (neither mounts when the flag is off).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { AgentRuntimeProvider } from '@/lib/agent/runtime/AgentRuntimeContext'

// Mutable flag exposed via a getter so the mocked SHOW_ASSISTANT binding reads the live value on
// each render (toggle per test without a fragile module reset).
const flag = { SHOW_ASSISTANT: true }
vi.mock('@/config/features', () => ({
  get SHOW_ASSISTANT() {
    return flag.SHOW_ASSISTANT
  },
}))

vi.mock('@/shell/use-is-narrow')
import { useIsNarrow } from '@/shell/use-is-narrow'
const mockUseIsNarrow = vi.mocked(useIsNarrow)

import { AssistantFab } from './AssistantFab'
import { AssistantPanel } from './AssistantPanel'

// Render the FAB alongside the real panel so a click's effect (panel opens) is observable through
// the same context the FAB reads — the binding AC-AP-001 assertion is "FAB opens the slide-over".
function renderFab(narrow: boolean) {
  mockUseIsNarrow.mockReturnValue(narrow)
  return render(
    <I18nProvider>
      <MemoryRouter>
        <AgentRuntimeProvider runtime={null}>
          <AssistantFab />
          <AssistantPanel />
        </AgentRuntimeProvider>
      </MemoryRouter>
    </I18nProvider>,
  )
}

describe('AssistantFab (T28)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    flag.SHOW_ASSISTANT = true
  })

  it('AC-AP-001: renders on a narrow viewport (flag on) and opens the panel on click', () => {
    renderFab(true)
    const fab = screen.getByRole('button', { name: /open deputy/i })
    expect(fab).toBeInTheDocument()
    // Positioned above the tab bar — the button's own bottom references --tabbar-h (ADR-0019 D11).
    expect((fab as HTMLElement).style.bottom).toContain('var(--tabbar-h)')
    expect((fab as HTMLElement).style.zIndex).toBe('45')
    // Initially the panel is closed (no dialog exposed).
    expect(screen.queryByRole('dialog', { name: 'Deputy' })).toBeNull()
    fireEvent.click(fab)
    // Clicking the FAB opens the slide-over (the binding assertion — FAB opens the panel).
    expect(screen.getByRole('dialog', { name: 'Deputy' })).toBeInTheDocument()
  })

  it('does not render on a wide viewport (desktop uses the top-bar button instead)', () => {
    renderFab(false)
    expect(screen.queryByRole('button', { name: /open deputy/i })).toBeNull()
  })

  it('AC-AP-005/AC-CF-003: does not render when SHOW_ASSISTANT=false even on a narrow viewport', () => {
    flag.SHOW_ASSISTANT = false
    renderFab(true)
    expect(screen.queryByRole('button', { name: /open deputy/i })).toBeNull()
  })
})
