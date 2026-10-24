import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('@blocknote/react', () => ({ createReactInlineContentSpec: vi.fn() }))
vi.mock('@/lib/db/document-references', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/document-references')>()),
  resolveMentionNames: vi.fn(),
  resolveRecordTitles: vi.fn(),
}))

import { resolveMentionNames, resolveRecordTitles } from '@/lib/db/document-references'
import { DocumentReferencesProvider, MentionNode, RecordLinkNode, useDocumentReferences } from './block-document-references'

const names = vi.mocked(resolveMentionNames)
const titles = vi.mocked(resolveRecordTitles)

const DOC = [{
  type: 'paragraph',
  content: [
    { type: 'mention', props: { kind: 'person', id: 'p1' } },
    { type: 'mention', props: { kind: 'team', id: 't1' } },
    { type: 'mention', props: { kind: 'person', id: 'gone' } },
    { type: 'recordLink', props: { kind: 'task', id: 'k1' } },
    { type: 'recordLink', props: { kind: 'objective', id: 'o-hidden' } },
  ],
}]

function Harness({ open }: { open?: (ref: { kind: string; id: string }) => void }) {
  const { value, refresh } = useDocumentReferences(open as never)
  return (
    <DocumentReferencesProvider value={value}>
      <button type="button" onClick={() => refresh(DOC)}>resolve</button>
      <p><MentionNode kind="person" id="p1" /> <MentionNode kind="team" id="t1" /> <MentionNode kind="person" id="gone" /></p>
      <RecordLinkNode kind="task" id="k1" />
      <RecordLinkNode kind="objective" id="o-hidden" />
    </DocumentReferencesProvider>
  )
}

async function mount(open?: (ref: { kind: string; id: string }) => void) {
  render(<I18nProvider><Harness open={open} /></I18nProvider>)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'resolve' })) })
}

beforeEach(() => {
  vi.clearAllMocks()
  names.mockResolvedValue({ people: new Map([['p1', 'Rama Roastery']]), teams: new Map([['t1', 'Roastery Production']]) })
  titles.mockResolvedValue(new Map([['task:k1', 'Approve Q4 equipment budget']]))
})

describe('mentions and record chips', () => {
  it('shows a mention as the person or Team current name, @-prefixed', async () => {
    await mount()
    expect(screen.getByText('@Rama Roastery')).toBeInTheDocument()
    expect(screen.getByText('@Roastery Production')).toBeInTheDocument()
  })

  it('does not look the same names up twice', async () => {
    await mount()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'resolve' })) })
    expect(names).toHaveBeenCalledTimes(1)
    expect(titles).toHaveBeenCalledTimes(1)
  })

  it('shows a record as its kind and current title, and opens it on click', async () => {
    const open = vi.fn()
    await mount(open)
    const chip = screen.getByRole('button', { name: /Task.*Approve Q4 equipment budget/ })
    fireEvent.click(chip)
    expect(open).toHaveBeenCalledWith({ kind: 'task', id: 'k1' })
  })

  it('opens the record from the chip\'s phone hit area', async () => {
    const open = vi.fn()
    await mount(open)
    fireEvent.click(document.querySelector('.block-doc__chip-hit') as HTMLElement)
    expect(open).toHaveBeenCalledWith({ kind: 'task', id: 'k1' })
  })

  it('shows a record the viewer cannot read as a Restricted record chip with no title and nothing to open', async () => {
    const open = vi.fn()
    await mount(open)
    const restricted = screen.getByText('Restricted record')
    expect(restricted.closest('button')).toBeNull()
    expect(screen.queryByText('Objective')).toBeNull()
    fireEvent.click(restricted)
    expect(open).not.toHaveBeenCalled()
  })

  it('does not call a record restricted when the lookup itself failed, and asks again on the next refresh', async () => {
    titles.mockRejectedValueOnce(new Error('offline'))
    await mount()
    expect(screen.queryByText('Restricted record')).toBeNull()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'resolve' })) })
    expect(screen.getByText('Restricted record')).toBeInTheDocument()
  })

  it('says unknown person for a mention it cannot name', async () => {
    await mount()
    expect(screen.getByText('@unknown person')).toBeInTheDocument()
  })
})
