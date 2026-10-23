// The real editor library (no mocks of it): the inline nodes a document stores render as names and
// record chips, and the sanitizer keeps them through a load.
import { describe, it, expect, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'

const { PERSON, TASK, SIGNAL } = vi.hoisted(() => ({
  PERSON: '0f4c2d6a-8a3e-4b8e-9a53-2c1f6d9e7b10',
  TASK: '5d9e1a2b-3c4d-4e5f-8a6b-7c8d9e0f1a2b',
  SIGNAL: '5d9e1a2b-3c4d-4e5f-8a6b-7c8d9e0f1a2c',
}))

vi.mock('@/lib/db/document-references', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/document-references')>()),
  resolveMentionNames: vi.fn().mockResolvedValue({ people: new Map([[PERSON, 'Rama Roastery']]), teams: new Map() }),
  // The Signal is absent: the viewer cannot read it.
  resolveRecordTitles: vi.fn().mockResolvedValue(new Map([[`task:${TASK}`, 'Approve Q4 equipment budget']])),
}))

import { BlockDocumentEditor, type BlockDocumentCopy } from './block-document-editor'

const copy: BlockDocumentCopy = {
  label: 'Doc', loading: 'Loading', loadError: 'Load failed', unreadable: 'Unreadable', empty: 'Empty', placeholder: 'p',
  placeholderEmpty: 'pe', readOnly: '', save: 'Save', saving: 'Saving…', saved: 'Saved', unsaved: 'Unsaved changes',
  failed: 'Save failed', retry: 'Retry', reload: 'Reload', conflict: 'Changed elsewhere', tooLarge: (l) => l, keysHint: 'hint',
}
const blocks = [{ type: 'paragraph', content: [
  { type: 'text', text: 'Ask ', styles: {} },
  { type: 'mention', props: { kind: 'person', id: PERSON } },
  { type: 'text', text: ' about ', styles: {} },
  { type: 'recordLink', props: { kind: 'task', id: TASK } },
  { type: 'recordLink', props: { kind: 'signal', id: SIGNAL } },
] }]

async function mount(canEdit: boolean, options: { mentions?: boolean; recordLinks?: boolean } = { mentions: true, recordLinks: true }) {
  render(
    <I18nProvider>
      <BlockDocumentEditor documentKey="d" store={{ read: async () => ({ blocks, updatedAt: 't1' }), save: async () => 't2' }}
        canEdit={canEdit} copy={copy} onOpenRecord={() => {}} {...options} />
    </I18nProvider>,
  )
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)) })
}

describe('a saved document with mentions and record links', () => {
  it.each([true, false])('shows the current name, the record title and a Restricted record chip (editable: %s)', async (canEdit) => {
    await mount(canEdit)
    expect(screen.getByText('@Rama Roastery')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Task.*Approve Q4 equipment budget/ })).toBeInTheDocument()
    expect(screen.getByText('Restricted record')).toBeInTheDocument()
  })

  it('drops both inline nodes from a document that does not allow them', async () => {
    await mount(false, {})
    expect(screen.queryByText('@Rama Roastery')).toBeNull()
    expect(screen.queryByText('Restricted record')).toBeNull()
  })
})
