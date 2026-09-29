import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PersonPicker } from './person-picker'
import type { PersonOption } from '@/lib/db/directory'

const people: PersonOption[] = [
  { id: 'p1', full_name: 'Ada Lovelace' },
  { id: 'p2', full_name: 'Alan Turing' },
  { id: 'p3', full_name: 'Grace Hopper' },
]

describe('PersonPicker', () => {
  it('renders in a portaled popover layer', () => {
    render(<div data-testid="host"><PersonPicker people={people} onSelect={vi.fn()} onClose={vi.fn()} /></div>)
    const content = screen.getByRole('listbox').closest('.person-picker')
    expect(content).not.toBeNull()
    expect(screen.getByTestId('host')).not.toContainElement(content as HTMLElement)
    expect(content?.closest('[data-radix-popper-content-wrapper]')).not.toBeNull()
  })

  it('lists selectable people and excludes the given ids', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(<PersonPicker people={people} exclude={['p2', 'p3']} onSelect={onSelect} onClose={onClose} />)
    expect(screen.getAllByRole('option')).toHaveLength(1)
    await user.click(screen.getByRole('option', { name: /ada lovelace/i }))
    expect(onSelect).toHaveBeenCalledWith('p1')
    expect(onClose).toHaveBeenCalled()
  })

  it('arrows/Home/End move the highlight and Enter picks it', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(<PersonPicker people={people} onSelect={onSelect} onClose={onClose} />)
    const [ada, alan, grace] = screen.getAllByRole('option')
    expect(ada).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowDown}')
    expect(alan).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{End}')
    expect(grace).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{Home}')
    expect(ada).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{End}{Enter}')
    expect(onSelect).toHaveBeenCalledWith('p3')
    expect(onClose).toHaveBeenCalled()
  })

  it('typing narrows the list and Enter picks the typed match, not the option under a resting pointer', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<PersonPicker people={people} onSelect={onSelect} onClose={vi.fn()} />)
    await user.hover(screen.getByRole('option', { name: /ada lovelace/i }))
    await user.keyboard('gra')
    expect(screen.getAllByRole('option')).toHaveLength(1)
    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledWith('p3')
  })

  it('shows an empty-result line when nobody matches', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<PersonPicker people={people} onSelect={onSelect} onClose={vi.fn()} />)
    await user.keyboard('zzz{Enter}')
    expect(screen.getByText('No people match')).toBeInTheDocument()
    expect(onSelect).not.toHaveBeenCalled()
  })

  // D-B2: Escape inside the picker dismisses it locally (and is consumed) so it never bubbles to
  // a host panel and closes the whole surface.
  it('Escape dismisses the picker via onClose and does not bubble to the host', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const hostEscape = vi.fn()
    render(
      <div onKeyDown={(e) => { if (e.key === 'Escape') hostEscape() }}>
        <PersonPicker people={people} onSelect={vi.fn()} onClose={onClose} />
      </div>,
    )
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(hostEscape).not.toHaveBeenCalled()
  })

  it('marks a 200-character unbroken name for single-line truncation', () => {
    const long = 'y'.repeat(200)
    render(<PersonPicker people={[{ id: 'p9', full_name: long }]} onSelect={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText(long)).toHaveClass('person-picker-label')
  })

  it('returns focus to the opener after Escape', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<button>opener</button>)
    const opener = screen.getByRole('button', { name: 'opener' })
    opener.focus()
    rerender(<><button>opener</button><PersonPicker people={people} onSelect={vi.fn()} onClose={vi.fn()} /></>)
    expect(screen.getByRole('combobox')).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(opener).toHaveFocus()
  })

  it('returns focus to the opener after a selection', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<button>opener</button>)
    const opener = screen.getByRole('button', { name: 'opener' })
    opener.focus()
    rerender(<><button>opener</button><PersonPicker people={people} onSelect={vi.fn()} onClose={vi.fn()} /></>)
    await user.click(screen.getAllByRole('option')[0])
    expect(opener).toHaveFocus()
  })
})

describe('PersonPicker mention use', () => {
  it('keeps focus in the composer textarea while typing, arrowing and picking', async () => {
    const { CommentThread } = await import('./CommentThread')
    const user = userEvent.setup()
    const onPost = vi.fn()
    render(<CommentThread comments={[]} people={people} canPost onPost={onPost} />)
    const box = screen.getByRole('textbox', { name: /comment/i })
    await user.click(box)
    await user.keyboard('Hey @al')
    expect(box).toHaveValue('Hey @al')
    expect(box).toHaveFocus()
    expect(screen.getAllByRole('option')).toHaveLength(1)
    await user.keyboard('{Enter}')
    expect(box).toHaveValue('Hey @alan ')
    expect(box).toHaveFocus()
  })

  it('ArrowDown in the textarea moves the highlighted person and Enter inserts it', async () => {
    const { CommentThread } = await import('./CommentThread')
    const user = userEvent.setup()
    render(<CommentThread comments={[]} people={people} canPost onPost={vi.fn()} />)
    const box = screen.getByRole('textbox', { name: /comment/i })
    await user.click(box)
    await user.keyboard('@a{ArrowDown}')
    const alan = screen.getByRole('option', { name: /alan turing/i })
    expect(alan).toHaveAttribute('aria-selected', 'true')
    expect(box).toHaveFocus()
    // Focus stays in the textarea, so it carries the listbox relationship for assistive tech.
    expect(box).toHaveAttribute('role', 'combobox')
    expect(box).toHaveAttribute('aria-autocomplete', 'list')
    expect(box).toHaveAttribute('aria-expanded', 'true')
    expect(box).toHaveAttribute('aria-controls', screen.getByRole('listbox').id)
    expect(box).toHaveAttribute('aria-activedescendant', alan.id)
    // The record panel host ignores an Escape whose target sits in a nested layer.
    expect(box.closest('[data-escape-layer="nested"]')).toBe(box)
    await user.keyboard('{Enter}')
    for (const name of ['role', 'aria-autocomplete', 'aria-expanded', 'aria-controls', 'aria-activedescendant', 'data-escape-layer']) {
      expect(box).not.toHaveAttribute(name)
    }
    expect(box).toHaveFocus()
    expect(box).toHaveValue('@alan ')
    expect(box).toHaveFocus()
  })

  it('Escape closes only the list and leaves the text and focus alone', async () => {
    const { CommentThread } = await import('./CommentThread')
    const user = userEvent.setup()
    render(<CommentThread comments={[]} people={people} canPost onPost={vi.fn()} />)
    const box = screen.getByRole('textbox', { name: /comment/i })
    await user.click(box)
    await user.keyboard('Hey @al')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(box).toHaveValue('Hey @al')
    expect(box).toHaveFocus()
  })
})
