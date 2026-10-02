import { describe, it, expect, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('@/lib/db/objective-writeup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/objective-writeup')>()),
  saveWriteUp: vi.fn(),
  readWriteUp: vi.fn().mockResolvedValue({
    writeUp: [
      { type: 'evil-block', content: [{ type: 'text', text: 'UNKNOWN-BLOCK', styles: {} }] },
      { type: 'image', props: { url: 'https://outside.test/pixel.png', caption: 'IMG' } },
      { type: 'paragraph', props: { textAlignment: { x: 1 }, level: 99, onclick: 'alert(1)' }, content: [
        { type: 'text', text: 'Survives', styles: { bold: true, onclick: 'alert(1)' } },
        { type: 'image', url: 'https://outside.test/inline.png' },
        { type: 'text', text: 7 },
        null,
      ] },
      { type: 'heading', props: { level: 2 }, content: [{ type: 'text', text: 'Plan', styles: {} }] },
      { type: 'paragraph', content: [
        { type: 'link', href: 'javascript:alert(1)', content: [{ type: 'text', text: 'bad', styles: {} }] },
        { type: 'link', href: 'https://ok.test', content: [{ type: 'text', text: 'good', styles: {} }] },
      ] },
    ],
    updatedAt: 't1',
  }),
}))

import { readWriteUp, saveWriteUp } from '@/lib/db/objective-writeup'
import { ObjectiveWriteupEditor } from './objective-writeup-editor'

// jsdom has no layout: answer the geometry questions ProseMirror and the floating menus ask.
function jsdomLayout() {
  const rect = { x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0, toJSON: () => ({}) } as DOMRect
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList
  Range.prototype.getBoundingClientRect = () => rect
  Element.prototype.getBoundingClientRect = () => rect
  Element.prototype.getClientRects = () => [] as unknown as DOMRectList
  Document.prototype.elementsFromPoint = () => []
}

describe('ObjectiveWriteupEditor with the real editor', () => {
  it('renders a hostile stored write-up safely: unknown blocks, bad props, unsafe links and media are dropped', async () => {
    const { container } = render(
      <I18nProvider>
        <ObjectiveWriteupEditor objectiveId="o1" canEdit={false} archived={false} />
        <p>rest of the page</p>
      </I18nProvider>,
    )
    await waitFor(() => expect(screen.getByText('Plan')).toBeTruthy())
    expect(screen.getByText('rest of the page')).toBeTruthy()
    expect(screen.getByText('Survives')).toBeTruthy()
    expect(container.textContent).not.toContain('UNKNOWN-BLOCK')
    expect(container.querySelector('img, video, audio, iframe, object, embed')).toBeNull()
    expect(container.innerHTML).not.toContain('outside.test')
    expect(container.innerHTML).not.toContain('onclick')
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(['https://ok.test'])
    expect(container.textContent).toContain('bad')
    expect(screen.getByRole('textbox', { name: 'Objective write-up' })).toBeTruthy()
  })

  // The editor handles Escape itself (blurs, marks the event handled); only a capture-phase handler
  // on the wrapper still sees it, which a mocked editor cannot prove.
  it('Escape in the editor moves focus to Save', async () => {
    // ProseMirror scrolls the caret into view after a focus; jsdom has no layout to answer with.
    jsdomLayout()
    render(
      <I18nProvider>
        <ObjectiveWriteupEditor objectiveId="o1" canEdit archived={false} />
      </I18nProvider>,
    )
    const box = await screen.findByRole('textbox', { name: 'Objective write-up' })
    act(() => { box.focus() })
    expect(document.activeElement).toBe(box)
    await userEvent.keyboard('{Escape}')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Save' }))
  })

  it('Escape with unsaved text moves focus to Save and writes nothing; only the Save click does', async () => {
    jsdomLayout()
    let finish: (updatedAt: string) => void = () => {}
    vi.mocked(saveWriteUp).mockReset()
    vi.mocked(saveWriteUp).mockImplementation(() => new Promise<string>((resolve) => { finish = resolve }))
    render(
      <I18nProvider>
        <ObjectiveWriteupEditor objectiveId="o1" canEdit archived={false} />
      </I18nProvider>,
    )
    const box = await screen.findByRole('textbox', { name: 'Objective write-up' })
    act(() => { box.focus() })
    await userEvent.keyboard('more')
    await userEvent.keyboard('{Escape}')
    const save = screen.getByRole('button', { name: 'Save' })
    // Escape reached Save, and neither the key nor the blur persisted anything.
    expect(vi.mocked(saveWriteUp)).not.toHaveBeenCalled()
    await userEvent.click(save)
    // A focused button that becomes `disabled` loses focus in a browser, so it must stay enabled.
    await waitFor(() => expect(save).toHaveAttribute('aria-busy', 'true'))
    expect(save).not.toBeDisabled()
    expect(document.activeElement).toBe(save)
    await act(async () => { finish('t2') })
    expect(document.activeElement).toBe(save)
  })

  it('the slash menu offers the stored text blocks only: no toggle or deep headings, emoji, code, table, media or file item', async () => {
    jsdomLayout()
    vi.mocked(readWriteUp).mockResolvedValueOnce({ writeUp: [], updatedAt: 't0' })
    render(
      <I18nProvider>
        <ObjectiveWriteupEditor objectiveId="o1" canEdit archived={false} />
      </I18nProvider>,
    )
    const box = await screen.findByRole('textbox', { name: 'Objective write-up' })
    act(() => { box.focus() })
    await userEvent.keyboard('/')
    const options = await screen.findAllByRole('option')
    expect(options.map((option) => option.textContent ?? '')).toEqual([
      expect.stringContaining('Heading 1'),
      expect.stringContaining('Heading 2'),
      expect.stringContaining('Heading 3'),
      expect.stringContaining('Quote'),
      expect.stringContaining('Numbered List'),
      expect.stringContaining('Bullet List'),
      expect.stringContaining('Check List'),
      expect.stringContaining('Paragraph'),
    ])
  })

  it('Escape in an open slash menu only closes the menu: the caret stays in the editor and nothing saves', async () => {
    jsdomLayout()
    vi.mocked(readWriteUp).mockResolvedValueOnce({ writeUp: [], updatedAt: 't0' })
    vi.mocked(saveWriteUp).mockReset()
    render(
      <I18nProvider>
        <ObjectiveWriteupEditor objectiveId="o1" canEdit archived={false} />
      </I18nProvider>,
    )
    const box = await screen.findByRole('textbox', { name: 'Objective write-up' })
    act(() => { box.focus() })
    await userEvent.keyboard('/')
    expect((await screen.findAllByRole('option')).length).toBeGreaterThan(0)
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('option')).toBeNull())
    expect(document.activeElement).toBe(box)
    expect(saveWriteUp).not.toHaveBeenCalled()
    // With no menu open, Escape still leaves for Save.
    await userEvent.keyboard('{Escape}')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Save' }))
  })

  it('a read-only reader gets no menus, handles or toolbar', async () => {
    jsdomLayout()
    vi.mocked(readWriteUp).mockResolvedValueOnce({ writeUp: [{ type: 'paragraph', content: [{ type: 'text', text: 'Read me', styles: {} }] }], updatedAt: 't0' })
    render(
      <I18nProvider>
        <ObjectiveWriteupEditor objectiveId="o1" canEdit={false} archived={false} />
      </I18nProvider>,
    )
    const box = await screen.findByRole('textbox', { name: 'Objective write-up' })
    expect(box).toHaveAttribute('contenteditable', 'false')
    act(() => { box.focus() })
    await userEvent.keyboard('/')
    await userEvent.hover(screen.getByText('Read me'))
    expect(screen.queryByRole('option')).toBeNull()
    expect(document.querySelector('.bn-side-menu, .bn-toolbar, .bn-suggestion-menu')).toBeNull()
  })

  describe('save cadence', () => {
    // Each Save stays pending until its `finish` resolves, so any write beyond the explicit clicks
    // (idle timer, blur, mid-flight chain) would show up as extra saveWriteUp calls.
    it('typing across pauses keeps the draft local; explicit Save writes the latest snapshot once', async () => {
      jsdomLayout()
      vi.mocked(readWriteUp).mockResolvedValueOnce({ writeUp: [], updatedAt: 't0' })
      vi.mocked(saveWriteUp).mockReset()
      let finish: (updatedAt: string) => void = () => {}
      vi.mocked(saveWriteUp).mockImplementationOnce(() => new Promise<string>((resolve) => { finish = resolve }))
      const user = userEvent.setup()

      render(
        <I18nProvider>
          <ObjectiveWriteupEditor objectiveId="o1" canEdit archived={false} />
        </I18nProvider>,
      )
      const box = await screen.findByRole('textbox', { name: 'Objective write-up' })
      act(() => { box.focus() })
      await user.keyboard('start')
      await user.keyboard('more')
      expect(saveWriteUp).not.toHaveBeenCalled()
      await user.click(screen.getByRole('button', { name: 'Save' }))
      await waitFor(() => expect(saveWriteUp).toHaveBeenCalledTimes(1))
      expect(JSON.stringify(vi.mocked(saveWriteUp).mock.calls[0][1])).toContain('startmore')
      expect(screen.getByRole('status').textContent).toContain('Saving')
      await act(async () => { finish('t2') })
      expect(screen.getByRole('status').textContent).toContain('Saved')
      expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('aria-busy', 'false')
    })

    it('an edit during a slow flight stays draft: mid-flight clicks do not duplicate, the next explicit Save writes it', async () => {
      jsdomLayout()
      vi.mocked(readWriteUp).mockResolvedValueOnce({ writeUp: [], updatedAt: 't0' })
      vi.mocked(saveWriteUp).mockReset()
      let finish: (updatedAt: string) => void = () => {}
      vi.mocked(saveWriteUp).mockImplementationOnce(() => new Promise<string>((resolve) => { finish = resolve }))
      const user = userEvent.setup()

      render(
        <I18nProvider>
          <ObjectiveWriteupEditor objectiveId="o1" canEdit archived={false} />
        </I18nProvider>,
      )
      const box = await screen.findByRole('textbox', { name: 'Objective write-up' })
      act(() => { box.focus() })
      await user.keyboard('start')
      await user.click(screen.getByRole('button', { name: 'Save' }))
      await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('aria-busy', 'true'))
      // The writer clicks back into the text and keeps typing while the save is in flight.
      act(() => { box.focus() })
      await user.keyboard('!')
      await user.click(screen.getByRole('button', { name: 'Save' }))
      await user.click(screen.getByRole('button', { name: 'Save' }))
      await act(async () => { finish('t2') })
      expect(saveWriteUp).toHaveBeenCalledTimes(1)
      // The landed write is the pre-edit snapshot; the '!' typed mid-flight is still draft.
      expect(JSON.stringify(vi.mocked(saveWriteUp).mock.calls[0][1])).not.toContain('!')
      expect(screen.getByRole('status').textContent).toContain('Unsaved')
      await user.click(screen.getByRole('button', { name: 'Save' }))
      await waitFor(() => expect(saveWriteUp).toHaveBeenCalledTimes(2))
      expect(JSON.stringify(vi.mocked(saveWriteUp).mock.calls[1][1])).toContain('start!')
      expect(vi.mocked(saveWriteUp).mock.calls[1][2]).toBe('t2')
    })
  })
})
