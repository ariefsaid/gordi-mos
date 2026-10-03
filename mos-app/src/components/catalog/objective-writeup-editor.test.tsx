import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { I18nProvider } from '@/i18n/I18nProvider'

const fake = vi.hoisted(() => ({
  document: [] as unknown[],
  saved: [] as unknown[],
  crash: false,
  domElement: undefined as undefined | HTMLElement,
}))

vi.mock('@blocknote/react', () => ({
  useCreateBlockNote: () => fake,
  SuggestionMenuController: () => <div data-testid="slash" />,
  FormattingToolbarController: () => <div data-testid="toolbar" />,
  FormattingToolbar: () => null,
  getFormattingToolbarItems: () => [],
  SideMenuController: () => <div data-testid="sidemenu" />,
  SideMenu: () => null,
  DragHandleMenu: () => null,
  RemoveBlockItem: () => null,
  blockTypeSelectItems: () => [],
  useDictionary: () => ({ drag_handle: { delete_menuitem: 'Delete' } }),
  getDefaultReactSlashMenuItems: () => [],
}))

vi.mock('@blocknote/ariakit', () => ({
  BlockNoteView: ({ onChange, editable, formattingToolbar, sideMenu, linkToolbar, slashMenu, children }: {
    onChange?: () => void; editable?: boolean; formattingToolbar?: boolean; sideMenu?: boolean; linkToolbar?: boolean; slashMenu?: boolean; children?: React.ReactNode
  }) => {
    if (fake.crash) throw new Error('malformed document')
    return (
    <div data-testid="bn" data-editable={String(editable)} data-menus={String([formattingToolbar, sideMenu, linkToolbar].join())} data-default-slash={String(slashMenu)}>
      {children}
      <button type="button" onClick={() => { fake.document = [...fake.document, { type: 'paragraph' }]; onChange?.() }}>type</button>
      <button type="button" onClick={() => { fake.document = [...fake.saved]; onChange?.() }}>restore saved</button>
      <div role="textbox" aria-label="pm" tabIndex={0} />
      <button type="button">toolbar</button>
    </div>
    )
  },
}))

vi.mock('@/lib/db/objective-writeup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/objective-writeup')>()),
  readWriteUp: vi.fn(),
  saveWriteUp: vi.fn(),
}))

import { readWriteUp, saveWriteUp, WriteUpConflictError, WriteUpTooLargeError } from '@/lib/db/objective-writeup'
import { ObjectiveWriteupEditor } from './objective-writeup-editor'

const read = vi.mocked(readWriteUp)
const save = vi.mocked(saveWriteUp)

async function mount(props: { canEdit?: boolean; archived?: boolean; onDirtyChange?: (d: boolean) => void } = {}) {
  const view = render(
    <I18nProvider>
      <ObjectiveWriteupEditor objectiveId="o1" canEdit={props.canEdit ?? true} archived={props.archived ?? false} onDirtyChange={props.onDirtyChange} />
    </I18nProvider>,
  )
  await act(async () => { await Promise.resolve() })
  return view
}
const typeOnce = () => fireEvent.click(screen.getByText('type'))

beforeEach(() => {
  vi.useFakeTimers()
  fake.document = []
  fake.saved = []
  fake.crash = false
  fake.domElement = document.createElement('div')
  read.mockResolvedValue({ writeUp: [], updatedAt: 't1' })
  save.mockResolvedValue('t2')
})
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks() })

describe('ObjectiveWriteupEditor', () => {
  it('renders editable for content authority and read-only otherwise or when archived', async () => {
    const a = await mount()
    expect(screen.getByTestId('bn').dataset.editable).toBe('true')
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
    a.unmount()
    read.mockResolvedValue({ writeUp: [{ type: 'paragraph' }], updatedAt: 't1' })
    const b = await mount({ canEdit: false })
    expect(screen.getByTestId('bn').dataset.editable).toBe('false')
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(screen.getByRole('note').textContent).toMatch(/not edit/)
    b.unmount()
    await mount({ archived: true })
    expect(screen.getByTestId('bn').dataset.editable).toBe('false')
  })

  it('shows a calm unreadable state when the editor cannot render the document, leaving the page intact', async () => {
    fake.crash = true
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <I18nProvider>
        <ObjectiveWriteupEditor objectiveId="o1" canEdit archived={false} />
        <p>rest of the page</p>
      </I18nProvider>,
    )
    await act(async () => { await Promise.resolve() })
    spy.mockRestore()
    expect(screen.getByRole('alert').textContent).toContain("Couldn't display this write-up")
    expect(screen.getByText('rest of the page')).toBeTruthy()
  })

  it('typing and idle pauses keep the draft local: nothing writes until explicit Save', async () => {
    const onDirtyChange = vi.fn()
    await mount({ onDirtyChange })
    typeOnce(); typeOnce(); typeOnce()
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)
    await act(async () => { vi.advanceTimersByTime(60000) })
    expect(save).not.toHaveBeenCalled()
    await act(async () => { fireEvent.blur(screen.getByTestId('bn')) })
    expect(save).not.toHaveBeenCalled()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('o1', fake.document, 't1')
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
    expect(screen.getByRole('status').textContent).toContain('Saved')
  })

  it('does not write when an edited document is restored to its saved snapshot', async () => {
    const original = [{ type: 'paragraph', content: [{ type: 'text', text: 'Keep this', styles: {} }] }]
    fake.document = original
    fake.saved = original
    read.mockResolvedValue({ writeUp: original, updatedAt: 't1' })
    const onDirtyChange = vi.fn()
    await mount({ onDirtyChange })

    typeOnce()
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)
    fireEvent.click(screen.getByRole('button', { name: 'restore saved' }))
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })
    expect(save).not.toHaveBeenCalled()
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
  })

  it('saves only on explicit Save, adopts the returned updated_at, and reports Saved', async () => {
    await mount()
    typeOnce()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })
    expect(screen.getByRole('status').textContent).toContain('Saved')
    typeOnce()
    await act(async () => { fireEvent.blur(screen.getByText('type')) })
    expect(save).toHaveBeenCalledTimes(1)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })
    expect(save).toHaveBeenCalledTimes(2)
    expect(save.mock.calls[1][2]).toBe('t2')
  })

  it("moving focus into the editor's own menus, or out of the editor, keeps the draft local", async () => {
    await mount()
    typeOnce()
    const box = screen.getByRole('textbox', { name: 'pm' })
    await act(async () => { fireEvent.blur(box, { relatedTarget: screen.getByRole('button', { name: 'toolbar' }) }) })
    expect(save).not.toHaveBeenCalled()
    await act(async () => { fireEvent.blur(box) })
    expect(save).not.toHaveBeenCalled()
    expect(screen.getByRole('status').textContent).toContain('Unsaved')
  })

  it('a mid-flight edit stays draft: mid-flight clicks never duplicate, another explicit Save writes it', async () => {
    const onDirtyChange = vi.fn()
    let finish: (v: string) => void = () => {}
    save.mockImplementationOnce(() => new Promise<string>((r) => { finish = r }))
    await mount({ onDirtyChange })
    typeOnce()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })
    expect(screen.getByRole('status').textContent).toContain('Saving')
    typeOnce()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })
    await act(async () => { finish('t2') })
    // One write for one Save: the in-flight snapshot predates the mid-flight edit, later clicks wrote nothing.
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0][1]).toEqual([{ type: 'paragraph' }])
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)
    expect(screen.getByRole('status').textContent).toContain('Unsaved')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })
    expect(save).toHaveBeenCalledTimes(2)
    expect(save.mock.calls[1][1]).toEqual(fake.document)
    expect(save.mock.calls[1][2]).toBe('t2')
    expect(screen.getByRole('status').textContent).toContain('Saved')
  })

  it('shows Failed with Retry, keeps the text, and retries', async () => {
    save.mockRejectedValueOnce(new Error('boom'))
    await mount()
    typeOnce()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })
    expect(screen.getByRole('status').textContent).toContain('Save failed')
    expect(screen.getByTestId('bn').dataset.editable).toBe('true')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })) })
    expect(save).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('status').textContent).toContain('Saved')
  })

  it('refuses on a conflict: says changed elsewhere, never retries, keeps the text', async () => {
    save.mockRejectedValueOnce(new WriteUpConflictError())
    await mount()
    typeOnce()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })
    expect(screen.getByRole('status').textContent).toContain('changed elsewhere')
    await act(async () => { vi.advanceTimersByTime(10000) })
    expect(save).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy()
    expect(screen.getByTestId('bn')).toBeTruthy()
  })

  it('reports an oversize refusal as a failure with its own message', async () => {
    save.mockRejectedValueOnce(new WriteUpTooLargeError())
    await mount()
    typeOnce()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })
    expect(screen.getByRole('status').textContent).toContain('too long')
  })

  it('explains the size limit on a too-long refusal and offers no Retry', async () => {
    save.mockRejectedValueOnce(new WriteUpTooLargeError())
    await mount()
    typeOnce()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })
    expect(screen.getByRole('status').textContent).toContain('256 KB')
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
  })

  it('Escape moves focus from the editor to the Save control', async () => {
    await mount()
    const box = screen.getByRole('textbox', { name: 'pm' })
    box.focus()
    fireEvent.keyDown(box, { key: 'Escape' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText(/Esc/).textContent).toMatch(/Tab/)
  })

  it('hides the keyboard hint on touch and phone widths', () => {
    const css = readFileSync(resolve(__dirname, 'objective-writeup-editor.css'), 'utf8')
    expect(css).toMatch(/@media \(hover: none\), \(max-width: 767\.98px\) \{\s*\.objective-writeup__hint \{ display: none; \}/)
  })

  it('keeps the side-menu handle and every menu control a 44px target on touch and phone widths', () => {
    const css = readFileSync(resolve(__dirname, 'objective-writeup-editor.css'), 'utf8')
    const phone = css.slice(css.lastIndexOf('@media (hover: none), (max-width: 767.98px) {'))
    expect(phone).toMatch(/\.bn-side-menu \.bn-ak-button \{ min-width: 44px; min-height: 44px; \}/)
    expect(phone).not.toMatch(/\.bn-side-menu \{ display: none/)
  })

  it('points the editor at the key hint only while the hint is rendered, across editability changes', async () => {
    read.mockResolvedValue({ writeUp: [{ type: 'paragraph' }], updatedAt: 't1' })
    const ui = (canEdit: boolean) => (
      <I18nProvider><ObjectiveWriteupEditor objectiveId="o1" canEdit={canEdit} archived={false} /></I18nProvider>
    )
    const view = render(ui(false))
    await act(async () => { await Promise.resolve() })
    expect(document.querySelector('.objective-writeup__hint')).toBeNull()
    expect(fake.domElement!.hasAttribute('aria-describedby')).toBe(false)

    view.rerender(ui(true))
    const hint = document.querySelector('.objective-writeup__hint')!
    expect(fake.domElement!.getAttribute('aria-describedby')).toBe(hint.id)

    view.rerender(ui(false))
    expect(fake.domElement!.hasAttribute('aria-describedby')).toBe(false)
  })

  it("offers the library's menus to an editor and none to a read-only reader", async () => {
    read.mockResolvedValue({ writeUp: [{ type: 'paragraph' }], updatedAt: 't1' })
    const view = await mount({ canEdit: true })
    expect(screen.getByTestId('bn')).toHaveAttribute('data-menus', 'false,false,true')
    expect(screen.getByTestId('toolbar')).toBeInTheDocument()
    expect(screen.getByTestId('sidemenu')).toBeInTheDocument()
    // The library's built-in slash menu is off: the controller below it carries the allowed items.
    expect(screen.getByTestId('bn')).toHaveAttribute('data-default-slash', 'false')
    expect(screen.getByTestId('slash')).toBeInTheDocument()
    view.unmount()
    await mount({ canEdit: false })
    expect(screen.getByTestId('bn')).toHaveAttribute('data-menus', 'false,false,false')
    expect(screen.queryByTestId('slash')).toBeNull()
    expect(screen.queryByTestId('toolbar')).toBeNull()
    expect(screen.queryByTestId('sidemenu')).toBeNull()
  })

  it('steps Save down from primary once Saved, and back up on the next edit', async () => {
    await mount()
    const save_ = () => screen.getByRole('button', { name: 'Save' })
    expect(save_().className).toContain('btn-primary')
    typeOnce()
    await act(async () => { fireEvent.click(save_()) })
    expect(save_().className).not.toContain('btn-primary')
    typeOnce()
    expect(save_().className).toContain('btn-primary')
  })

  it('does not save on unmount: Discard with unsaved text leaves it unwritten', async () => {
    const view = await mount()
    typeOnce()
    view.unmount()
    await act(async () => { vi.advanceTimersByTime(10000) })
    expect(save).not.toHaveBeenCalled()
  })

  it('reports dirtiness for the leave guard until the save lands', async () => {
    const onDirtyChange = vi.fn()
    await mount({ onDirtyChange })
    typeOnce()
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
  })
})
