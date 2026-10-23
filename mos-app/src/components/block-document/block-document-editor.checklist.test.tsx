// The real editor library (no mocks of it): the checklist-note checkbox has a name, and a draft
// document reports edits to its host without a save bar.
import { describe, it, expect, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import { BlockDocumentEditor, type BlockDocumentCopy } from './block-document-editor'

const copy: BlockDocumentCopy = {
  label: 'Doc', loading: 'Loading', loadError: 'Load failed', unreadable: 'Unreadable', empty: 'Empty', placeholder: 'p',
  placeholderEmpty: 'pe', readOnly: '', save: 'Save', saving: 'Saving…', saved: 'Saved', unsaved: 'Unsaved changes',
  failed: 'Save failed', retry: 'Retry', reload: 'Reload', conflict: 'Changed elsewhere', tooLarge: (l) => l, keysHint: 'hint',
}
const checklist = [
  { id: 'a1', type: 'checkListItem', props: { checked: false }, content: [{ type: 'text', text: 'Call the supplier', styles: {} }] },
  { id: 'a2', type: 'checkListItem', props: { checked: true }, content: [] },
]

async function mount(extra: Partial<React.ComponentProps<typeof BlockDocumentEditor>> = {}, locale: 'en' | 'id' = 'en') {
  const save = vi.fn().mockResolvedValue('t2')
  render(
    <I18nProvider initialLocale={locale}>
      <BlockDocumentEditor documentKey="d" store={{ read: async () => ({ blocks: checklist, updatedAt: 't1' }), save }}
        canEdit copy={copy} checklistNote {...extra} />
    </I18nProvider>,
  )
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)) })
  return { save }
}

describe('checklist note checkboxes', () => {
  it('are named by the note label and their text', async () => {
    await mount()
    expect(screen.getByRole('checkbox', { name: 'Checklist note Call the supplier' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Checklist note' })).toBeChecked()
  })

  it('are named in Indonesian', async () => {
    await mount({}, 'id')
    expect(screen.getByRole('checkbox', { name: 'Catatan centang' })).toBeChecked()
  })

  it('still toggle, and the document keeps its checkListItem shape', async () => {
    const onDocumentChange = vi.fn()
    await mount({ draft: true, onDocumentChange })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Checklist note Call the supplier' }))
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)) })
    expect(screen.getByRole('checkbox', { name: 'Checklist note Call the supplier' })).toBeChecked()
    const doc = onDocumentChange.mock.calls.at(-1)?.[0] as Array<{ type: string; props: { checked: boolean } }>
    expect(doc[0]).toMatchObject({ type: 'checkListItem', props: { checked: true } })
  })
})

describe('a draft document', () => {
  it('has no save bar and writes nothing to the store', async () => {
    const { save } = await mount({ draft: true, onDocumentChange: () => {} })
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(save).not.toHaveBeenCalled()
  })

  it('shows the editor even when blank and not editable', async () => {
    render(
      <I18nProvider>
        <BlockDocumentEditor documentKey="d" store={{ read: async () => ({ blocks: null, updatedAt: '' }), save: async () => '' }}
          canEdit={false} draft copy={copy} />
      </I18nProvider>,
    )
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)) })
    expect(screen.queryByText('Empty')).toBeNull()
  })
})
