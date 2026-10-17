import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CollectionToolbar } from './collection-toolbar'

// Test collection operations independently of the Picker's portaled menu implementation.
vi.mock('@/components/ui/picker', () => ({ Picker: ({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) => <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> }))
vi.mock('@/shell/use-is-desktop', () => ({ useIsDesktop: () => false }))
afterEach(cleanup)

describe('Work decision boundary preserves collection operations', () => {
  it('routes built-in scopes and private saved views to their existing operations', () => {
    const onView = vi.fn(), onApply = vi.fn(), onLoad = vi.fn(), onSearch = vi.fn(), onSort = vi.fn()
    render(<CollectionToolbar resultSummary="2 results" exposedFilterIds={['sort']}
      presentation={{ label: 'Layout', value: 'list', options: [{ value: 'list', label: 'List' }], onChange: vi.fn() }}
      views={{ label: 'Scope', value: 'all', options: [{ value: 'all', label: 'All' }, { value: 'mine', label: 'My work' }], onChange: onView }}
      search={{ label: 'Search tasks', placeholder: 'Search', value: '', onChange: onSearch }}
      filters={[{ id: 'sort', label: 'Sort', value: 'due', options: [{ value: 'due', label: 'Due' }, { value: 'title', label: 'Title' }], onChange: onSort }]}
      savedViews={{ label: 'Saved views', selectedId: null, operation: 'idle', items: [{ id: 'custom', name: 'My saved view' }], onLoad, onApply, onSave: vi.fn() }} />)
    expect(onLoad).toHaveBeenCalledOnce()
    fireEvent.change(screen.getByLabelText('Scope'), { target: { value: 'mine' } })
    expect(onView).toHaveBeenCalledWith('mine')
    fireEvent.change(screen.getByLabelText('Scope'), { target: { value: 'saved:custom' } })
    expect(onApply).toHaveBeenCalledWith('custom')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'grinder' } })
    expect(onSearch).toHaveBeenCalledWith('grinder')
    fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'title' } })
    expect(onSort).toHaveBeenCalledWith('title')
  })

  it('Escape closes Filters & options and returns keyboard focus to its door', () => {
    render(<CollectionToolbar
      presentation={{ label: 'Layout', value: 'list', options: [{ value: 'list', label: 'List' }], onChange: vi.fn() }}
      views={{ label: 'Scope', value: 'all', options: [{ value: 'all', label: 'All' }], onChange: vi.fn() }}
      exposedFilterIds={[]}
      filters={[{ id: 'sort', label: 'Sort', value: 'due', options: [{ value: 'due', label: 'Due' }], onChange: vi.fn() }]} />)
    const door = screen.getByRole('button', { name: 'Filters & options' })
    fireEvent.click(door)
    const sort = screen.getByLabelText('Sort')
    sort.focus()
    fireEvent.keyDown(sort, { key: 'Escape' })
    expect(screen.queryByLabelText('Sort')).toBeNull()
    expect(door).toHaveAttribute('aria-expanded', 'false')
    expect(door).toHaveFocus()
  })

  it('keeps failed save drafts available for retry rather than clearing the name', async () => {
    const onSave = vi.fn().mockResolvedValue(null)
    render(<CollectionToolbar
      presentation={{ label: 'Layout', value: 'list', options: [{ value: 'list', label: 'List' }], onChange: vi.fn() }}
      views={{ label: 'Scope', value: 'all', options: [{ value: 'all', label: 'All' }], onChange: vi.fn() }}
      savedViews={{ label: 'Saved views', selectedId: null, operation: 'idle', items: [], onApply: vi.fn(), onSave }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Filters & options' }))
    fireEvent.click(screen.getByLabelText('Save view'))
    fireEvent.change(screen.getByLabelText('View name'), { target: { value: 'Drifting work' } })
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }))
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledWith('Drifting work'))
    expect(screen.getByLabelText('View name')).toHaveValue('Drifting work')
  })
})
