// UserViewRenderer tests (AC-UV-015..017). Mocks ./executor to isolate the compile→execute→
// hydrate loop from a real supabase call. Wrapped in I18nProvider (mirrors home-page.test.tsx).
import { createElement, type ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('./executor', () => ({ executeCompiledQuery: vi.fn() }))
import { executeCompiledQuery } from './executor'
import { UserViewRenderer, buildCompilerContext } from './renderer'
import type { CompositionSpec } from './types'

const mockExecute = vi.mocked(executeCompiledQuery)

function wrapper({ children }: { children: ReactNode }) {
  return createElement(I18nProvider, null, children)
}

const ctx = buildCompilerContext('person-1', 'org-1')

const validSpec: CompositionSpec = {
  version: 1,
  panels: [{
    id: 'p1', primitive: 'DataTable',
    querySpec: { entity: 'objectives', select: ['id', 'name'] },
  }],
}

beforeEach(() => { mockExecute.mockReset() })

describe('UserViewRenderer — AC-UV-015 (compile→execute→hydrate loop)', () => {
  it('compiles a valid spec, executes each panel once, and hydrates the registered primitive', async () => {
    mockExecute.mockResolvedValue([{ id: '1' }, { id: '2' }])
    render(<UserViewRenderer spec={validSpec} ctx={ctx} />, { wrapper })

    const panel = await screen.findByTestId('uv-panel-DataTable')
    expect(panel).toBeInTheDocument()
    expect(mockExecute).toHaveBeenCalledTimes(1)
    expect(await screen.findByTestId('uv-panel-row-count')).toHaveTextContent('2')
  })
})

describe('UserViewRenderer — AC-UV-016 (degrades on ValidationError, never crashes)', () => {
  it('shows the error state with UNKNOWN_PRIMITIVE and never calls the executor', async () => {
    const bad: CompositionSpec = {
      version: 1,
      panels: [{ id: 'p1', primitive: 'Bogus', querySpec: { entity: 'objectives', select: ['id'] } }],
    }
    render(<UserViewRenderer spec={bad} ctx={ctx} />, { wrapper })

    expect(await screen.findByText('This view could not be rendered')).toBeInTheDocument()
    expect(screen.getByTestId('uv-render-error-code')).toHaveTextContent('UNKNOWN_PRIMITIVE')
    expect(mockExecute).not.toHaveBeenCalled()
  })

  it('shows the error state with UNKNOWN_ENTITY for an off-whitelist entity and never calls the executor', async () => {
    const bad: CompositionSpec = {
      version: 1,
      panels: [{ id: 'p1', primitive: 'DataTable', querySpec: { entity: 'nope' as never, select: ['id'] } }],
    }
    render(<UserViewRenderer spec={bad} ctx={ctx} />, { wrapper })

    expect(await screen.findByTestId('uv-render-error-code')).toHaveTextContent('UNKNOWN_ENTITY')
    expect(mockExecute).not.toHaveBeenCalled()
  })
})

describe('UserViewRenderer — AC-UV-017 (stub primitive degrades to a placeholder)', () => {
  it('renders the "planned primitive" placeholder for a stub primitive and never calls the executor', async () => {
    const stubSpec: CompositionSpec = {
      version: 1,
      panels: [{ id: 'p1', primitive: 'doc-editor', querySpec: { entity: 'objectives', select: ['id'] } }],
    }
    render(<UserViewRenderer spec={stubSpec} ctx={ctx} />, { wrapper })

    expect(await screen.findByTestId('uv-stub-doc-editor')).toBeInTheDocument()
    expect(mockExecute).not.toHaveBeenCalled()
  })
})

describe('UserViewRenderer — per-panel executor error (degrades that panel only)', () => {
  it('shows the panel error state when executeCompiledQuery rejects', async () => {
    mockExecute.mockRejectedValue(new Error('boom'))
    render(<UserViewRenderer spec={validSpec} ctx={ctx} />, { wrapper })

    await waitFor(() => expect(screen.getByText('This panel could not be loaded.')).toBeInTheDocument())
  })
})
