import { createRef } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
    expect(screen.getByRole('dialog', { name: 'Select person' })).toBeInTheDocument()
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
    expect(box.tagName).toBe('TEXTAREA')
    expect(box).not.toHaveAttribute('role', 'combobox')
    expect(box).toHaveAttribute('aria-autocomplete', 'list')
    expect(box).toHaveAttribute('aria-controls', screen.getByRole('listbox').id)
    expect(box).toHaveAttribute('aria-activedescendant', alan.id)
    // The record panel host ignores an Escape whose target sits in a nested layer.
    expect(box.closest('[data-escape-layer="nested"]')).toBe(box)
    await user.keyboard('{Enter}')
    for (const name of ['aria-autocomplete', 'aria-controls', 'aria-activedescendant', 'data-escape-layer']) {
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

  it('reveals the active comment mention inside its list viewport', async () => {
    const { CommentThread } = await import('./CommentThread')
    const user = userEvent.setup()
    render(<CommentThread comments={[]} people={people} canPost onPost={vi.fn()} />)
    const box = screen.getByRole('textbox', { name: /comment/i })
    await user.click(box)
    await user.keyboard('@')

    const list = document.querySelector<HTMLElement>('.person-picker-list')!
    const [ada, alan] = screen.getAllByRole('option')
    const rect = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 240, width: 240, height: bottom - top, x: 0, y: top, toJSON: () => ({}) })
    vi.spyOn(list, 'getBoundingClientRect').mockReturnValue(rect(100, 180) as DOMRect)
    vi.spyOn(ada, 'getBoundingClientRect').mockReturnValue(rect(110, 140) as DOMRect)
    vi.spyOn(alan, 'getBoundingClientRect').mockReturnValue(rect(170, 200) as DOMRect)

    await user.keyboard('{ArrowDown}')

    expect(alan).toHaveAttribute('aria-selected', 'true')
    await waitFor(() => expect(list.scrollTop).toBe(20))
    expect(box).toHaveFocus()
  })

  it('keeps attached mention suggestions open when the driver is clicked again', async () => {
    const { CommentThread } = await import('./CommentThread')
    const user = userEvent.setup()
    render(<CommentThread comments={[]} people={people} canPost onPost={vi.fn()} />)
    const box = screen.getByRole('textbox', { name: /comment/i })
    await user.click(box)
    await user.keyboard('@')

    await user.click(box)

    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(box).toHaveFocus()
  })

  it('leaves navigation and Enter to the active IME composition', async () => {
    const { CommentThread } = await import('./CommentThread')
    const user = userEvent.setup()
    render(<CommentThread comments={[]} people={people} canPost onPost={vi.fn()} />)
    const box = screen.getByRole('textbox', { name: /comment/i })
    await user.click(box)
    await user.keyboard('@')
    const ada = screen.getByRole('option', { name: /ada lovelace/i })

    fireEvent.keyDown(box, { key: 'ArrowDown', isComposing: true })
    fireEvent.keyDown(box, { key: 'Enter', isComposing: true })

    expect(ada).toHaveAttribute('aria-selected', 'true')
    expect(box).toHaveValue('@')
    expect(box).toHaveFocus()
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it('does not consume an IME Escape while the attached picker is open', async () => {
    const { CommentThread } = await import('./CommentThread')
    const user = userEvent.setup()
    render(<CommentThread comments={[]} people={people} canPost onPost={vi.fn()} />)
    const box = screen.getByRole('textbox', { name: /comment/i })
    await user.click(box)
    await user.keyboard('@')

    fireEvent.keyDown(box, { key: 'Escape', isComposing: true })

    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(box).toHaveValue('@')
    expect(box).toHaveFocus()
  })

  it('preserves the native default for a composing Escape in the attached picker', async () => {
    const { CommentThread } = await import('./CommentThread')
    const user = userEvent.setup()
    const hostEscape = vi.fn()
    render(
      <div onKeyDown={(event) => { if (event.key === 'Escape') hostEscape() }}>
        <CommentThread comments={[]} people={people} canPost onPost={vi.fn()} />
      </div>,
    )
    const box = screen.getByRole('textbox', { name: /comment/i })
    await user.click(box)
    await user.keyboard('@')

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true, isComposing: true })
    box.dispatchEvent(event)

    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(hostEscape).not.toHaveBeenCalled()
    expect(box).toHaveFocus()
    expect(event.defaultPrevented).toBe(false)
  })

  it('treats the legacy 229 key code as an active composition in attached mode', async () => {
    const { CommentThread } = await import('./CommentThread')
    const user = userEvent.setup()
    render(<CommentThread comments={[]} people={people} canPost onPost={vi.fn()} />)
    const box = screen.getByRole('textbox', { name: /comment/i })
    await user.click(box)
    await user.keyboard('@')

    fireEvent.keyDown(box, { key: 'Enter', keyCode: 229 })

    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(box).toHaveValue('@')
    expect(box).toHaveFocus()
  })

  it('restores existing textbox relationships and leaves its native role alone when the attached picker closes', async () => {
    const anchorRef = createRef<HTMLTextAreaElement>()
    const initial = {
      'aria-autocomplete': 'inline',
      'aria-controls': 'existing-list',
      'aria-activedescendant': 'existing-option',
      'data-escape-layer': 'outer',
    } as const
    const { rerender } = render(
      <>
        <textarea ref={anchorRef} aria-label="Comment" {...initial} />
        <PersonPicker people={people} anchorRef={anchorRef} query="" onSelect={vi.fn()} onClose={vi.fn()} />
      </>,
    )
    const box = screen.getByRole('textbox', { name: 'Comment' })
    await waitFor(() => expect(box).toHaveAttribute('aria-controls', screen.getByRole('listbox').id))
    expect(box).not.toHaveAttribute('role', 'combobox')
    expect(box).toHaveAttribute('aria-autocomplete', 'list')
    expect(box).toHaveAttribute('data-escape-layer', 'nested')

    rerender(<textarea ref={anchorRef} aria-label="Comment" {...initial} />)

    expect(box).not.toHaveAttribute('role', 'combobox')
    expect(box).toHaveAttribute('aria-autocomplete', 'inline')
    expect(box).toHaveAttribute('aria-controls', 'existing-list')
    expect(box).toHaveAttribute('aria-activedescendant', 'existing-option')
    expect(box).toHaveAttribute('data-escape-layer', 'outer')
  })
})
