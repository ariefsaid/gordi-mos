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

import { saveWriteUp } from '@/lib/db/objective-writeup'
import { ObjectiveWriteupEditor } from './objective-writeup-editor'

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
    Range.prototype.getClientRects = () => [] as unknown as DOMRectList
    Range.prototype.getBoundingClientRect = () => new DOMRect()
    Element.prototype.getClientRects = () => [] as unknown as DOMRectList
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
    Range.prototype.getClientRects = () => [] as unknown as DOMRectList
    Range.prototype.getBoundingClientRect = () => new DOMRect()
    Element.prototype.getClientRects = () => [] as unknown as DOMRectList
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
})
