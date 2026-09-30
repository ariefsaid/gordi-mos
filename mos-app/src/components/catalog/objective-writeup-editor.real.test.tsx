import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('@/lib/db/objective-writeup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/objective-writeup')>()),
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
})
