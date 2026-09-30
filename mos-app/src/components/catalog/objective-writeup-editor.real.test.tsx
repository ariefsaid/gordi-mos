import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('@/lib/db/objective-writeup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/objective-writeup')>()),
  readWriteUp: vi.fn().mockResolvedValue({
    writeUp: [
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
  it('renders stored blocks through the editor; only allowed link schemes become anchors', async () => {
    const { container } = render(
      <I18nProvider><ObjectiveWriteupEditor objectiveId="o1" canEdit={false} archived={false} /></I18nProvider>,
    )
    await waitFor(() => expect(screen.getByText('Plan')).toBeTruthy())
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(['https://ok.test'])
    expect(container.textContent).toContain('bad')
    expect(screen.getByRole('textbox', { name: 'Objective write-up' })).toBeTruthy()
  })
})
