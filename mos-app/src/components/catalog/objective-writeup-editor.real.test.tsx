import { describe, it, expect, vi, afterEach } from 'vitest'
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

  it('Escape with unsaved text keeps focus on Save through the save it triggers', async () => {
    jsdomLayout()
    let finish: (updatedAt: string) => void = () => {}
    vi.mocked(saveWriteUp).mockReturnValue(new Promise<string>((resolve) => { finish = resolve }))
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
    await waitFor(() => expect(save).toHaveAttribute('aria-busy', 'true'))
    // A focused button that becomes `disabled` loses focus in a browser, so it must stay enabled.
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

  describe('save cadence under network latency', () => {
    afterEach(() => { vi.useRealTimers() })

    // Fake timers drive both the 3 s idle window and a save that takes 800 ms to land, as on a real network.
    it('saves once per pause: typing while a save is in flight never chains another save', async () => {
      Range.prototype.getClientRects = () => [] as unknown as DOMRectList
      Range.prototype.getBoundingClientRect = () => new DOMRect()
      Element.prototype.getClientRects = () => [] as unknown as DOMRectList
      vi.mocked(readWriteUp).mockResolvedValueOnce({ writeUp: [], updatedAt: 't0' })
      let landed = 0
      vi.mocked(saveWriteUp).mockReset()
      vi.mocked(saveWriteUp).mockImplementation(() => new Promise<string>((resolve) => { setTimeout(() => resolve(`t${++landed}`), 800) }))
      const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime })
      const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

      render(
        <I18nProvider>
          <ObjectiveWriteupEditor objectiveId="o1" canEdit archived={false} />
        </I18nProvider>,
      )
      const box = await screen.findByRole('textbox', { name: 'Objective write-up' })
      // Faked only once the editor is on screen and editable: Testing Library's own polling needs the real clock.
      await waitFor(() => expect(box).toHaveAttribute('contenteditable', 'true'))
      vi.useFakeTimers({ shouldAdvanceTime: true })
      act(() => { box.focus() })
      await user.keyboard('start')
      await tick(3000)
      expect(saveWriteUp).toHaveBeenCalledTimes(1)

      // Keep typing, 100 ms apart, across the whole 800 ms flight and well after it.
      for (let i = 0; i < 40; i++) {
        await user.keyboard('x')
        await tick(100)
      }
      expect(saveWriteUp).toHaveBeenCalledTimes(1)

      // The pause after the burst produces the one save that carries every character.
      await tick(3000)
      expect(saveWriteUp).toHaveBeenCalledTimes(2)
      const saved = JSON.stringify(vi.mocked(saveWriteUp).mock.calls[1][1])
      expect(saved).toContain(`start${'x'.repeat(40)}`)
      await tick(5000)
      expect(saveWriteUp).toHaveBeenCalledTimes(2)
    })

    it('an idle pause that elapses mid-save is cancelled by the next edit: that edit waits for its own pause', async () => {
      Range.prototype.getClientRects = () => [] as unknown as DOMRectList
      Range.prototype.getBoundingClientRect = () => new DOMRect()
      Element.prototype.getClientRects = () => [] as unknown as DOMRectList
      vi.mocked(readWriteUp).mockResolvedValueOnce({ writeUp: [], updatedAt: 't0' })
      let landed = 0
      vi.mocked(saveWriteUp).mockReset()
      vi.mocked(saveWriteUp).mockImplementation(() => new Promise<string>((resolve) => { setTimeout(() => resolve(`t${++landed}`), 4000) }))
      const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime })
      const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

      render(
        <I18nProvider>
          <ObjectiveWriteupEditor objectiveId="o1" canEdit archived={false} />
        </I18nProvider>,
      )
      const box = await screen.findByRole('textbox', { name: 'Objective write-up' })
      await waitFor(() => expect(box).toHaveAttribute('contenteditable', 'true'))
      vi.useFakeTimers({ shouldAdvanceTime: true })
      act(() => { box.focus() })
      await user.keyboard('a')
      await tick(3000)
      expect(saveWriteUp).toHaveBeenCalledTimes(1)
      await user.keyboard('b')
      await tick(3200)
      expect(saveWriteUp).toHaveBeenCalledTimes(1)
      // The pause for "b" has elapsed while the first save is still in flight; typing again restarts the wait.
      await user.keyboard('c')
      await tick(1000)
      expect(landed).toBe(1)
      expect(saveWriteUp).toHaveBeenCalledTimes(1)
      await tick(1800)
      expect(saveWriteUp).toHaveBeenCalledTimes(1)
      await tick(1500)
      expect(saveWriteUp).toHaveBeenCalledTimes(2)
      expect(JSON.stringify(vi.mocked(saveWriteUp).mock.calls[1][1])).toContain('abc')
    })
  })
})
