import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'

const fake = vi.hoisted(() => ({
  document: [] as unknown[],
  domElement: undefined as undefined | HTMLElement,
  dictionary: { slash_menu: { paragraph: { group: 'Basic blocks' } } },
  insertInlineContent: undefined as unknown as (content: unknown[]) => void,
  openSuggestionMenu: undefined as unknown as (trigger: string, options: unknown) => void,
  getExtension: undefined as unknown as () => unknown,
  controllers: [] as Array<{
    triggerCharacter: string
    getItems: (query: string) => Promise<Array<{ title: string; subtext?: string; group?: string; onItemClick: () => void }>>
    suggestionMenuComponent?: unknown
    onItemClick?: (item: { onItemClick: () => void }) => void
  }>,
}))

vi.mock('@blocknote/react', () => ({
  useCreateBlockNote: () => fake,
  SuggestionMenuController: (props: (typeof fake.controllers)[number]) => { fake.controllers.push(props); return <div data-testid={`menu-${props.triggerCharacter}`} /> },
  FormattingToolbarController: () => null,
  FormattingToolbar: () => null,
  getFormattingToolbarItems: () => [],
  SideMenuController: () => null,
  SideMenu: () => null,
  DragHandleMenu: () => null,
  RemoveBlockItem: () => null,
  blockTypeSelectItems: () => [],
  useDictionary: () => ({ drag_handle: { delete_menuitem: 'Delete' } }),
  getDefaultReactSlashMenuItems: () => [],
  createReactInlineContentSpec: vi.fn(() => ({})),
}))

vi.mock('@blocknote/core/extensions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@blocknote/core/extensions')>()),
  getDefaultSlashMenuItems: () => [],
}))

vi.mock('@blocknote/ariakit', () => ({
  BlockNoteView: ({ onChange, children }: { onChange?: () => void; children?: React.ReactNode }) => (
    <div data-testid="bn">
      {children}
      <button type="button" onClick={() => { fake.document = [...fake.document, { type: 'paragraph' }]; onChange?.() }}>type</button>
      <div role="textbox" aria-label="pm" tabIndex={0} />
    </div>
  ),
}))

vi.mock('@/lib/db/document-references', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/document-references')>()),
  loadMentionRoster: vi.fn(),
  searchLinkableRecords: vi.fn(),
  resolveMentionNames: vi.fn().mockResolvedValue({ people: new Map(), teams: new Map() }),
  resolveRecordTitles: vi.fn().mockResolvedValue(new Map()),
}))

import { loadMentionRoster, searchLinkableRecords } from '@/lib/db/document-references'
import { BlockDocumentConflictError, BlockDocumentTooLargeError } from '@/lib/db/block-document'
import { BlockDocumentEditor, type BlockDocumentCopy, type BlockDocumentEditorProps } from './block-document-editor'

const roster = vi.mocked(loadMentionRoster)
const search = vi.mocked(searchLinkableRecords)

const copy: BlockDocumentCopy = {
  label: 'Doc', loading: 'Loading', loadError: 'Load failed', unreadable: 'Unreadable', empty: 'Empty', placeholder: 'p',
  placeholderEmpty: 'pe', readOnly: '', save: 'Save', saving: 'Saving…', saved: 'Saved', unsaved: 'Unsaved changes',
  failed: 'Save failed', retry: 'Retry', reload: 'Reload', conflict: 'Changed elsewhere', tooLarge: (l) => `Too long ${l}`, keysHint: 'Esc then Tab',
}

const read = vi.fn()
const save = vi.fn()

async function mount(props: Partial<BlockDocumentEditorProps> = {}) {
  const view = render(
    <I18nProvider>
      <BlockDocumentEditor documentKey="d1" store={{ read, save }} canEdit copy={copy} {...props} />
    </I18nProvider>,
  )
  await act(async () => { await Promise.resolve() })
  return view
}
const controller = (trigger: string) => fake.controllers.filter((c) => c.triggerCharacter === trigger).at(-1)!

beforeEach(() => {
  vi.useFakeTimers()
  fake.document = []
  fake.controllers = []
  fake.domElement = document.createElement('div')
  fake.insertInlineContent = vi.fn()
  fake.openSuggestionMenu = vi.fn()
  fake.getExtension = () => ({ openSuggestionMenu: fake.openSuggestionMenu })
  read.mockResolvedValue({ blocks: [], updatedAt: 't1' })
  save.mockResolvedValue('t2')
  roster.mockResolvedValue({
    people: [{ id: 'p1', label: 'Rama Roastery' }, { id: 'p2', label: 'Rani Rahmawati' }],
    teams: [{ id: 't1', label: 'Roastery Production' }],
  })
  search.mockResolvedValue([
    { kind: 'signal', id: 's1', title: 'Cafe 2 espresso running fast', detail: null },
    { kind: 'objective', id: 'o1', title: 'Consistent espresso', detail: 'Q4 2026' },
    { kind: 'task', id: 'k1', title: 'Update espresso recipe cards', detail: 'In Progress' },
    { kind: 'project', id: 'w1', title: 'Espresso rollout', detail: 'project' },
  ])
})
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks() })

describe('BlockDocumentEditor menus', () => {
  it('offers only the slash menu to a text-only document', async () => {
    await mount()
    expect(fake.controllers.map((c) => c.triggerCharacter)).toEqual(['/'])
  })

  it('opens `/`, `@` and `[[` when mentions and record links are on', async () => {
    await mount({ mentions: true, recordLinks: true })
    expect(new Set(fake.controllers.map((c) => c.triggerCharacter))).toEqual(new Set(['/', '@', '[[']))
  })

  it('the @ menu lists Person and Team groups only, filtered by what is typed', async () => {
    await mount({ mentions: true })
    const items = await controller('@').getItems('ro')
    expect(items.map((i) => [i.group, i.title])).toEqual([
      ['Person', 'Rama Roastery'], ['Team', 'Roastery Production'],
    ])
    expect(roster).toHaveBeenCalledTimes(1)
  })

  it('picking a person or Team inserts a mention that stores the kind and id', async () => {
    await mount({ mentions: true })
    const [person, team] = await controller('@').getItems('')
    const pick = controller('@').onItemClick!
    pick(person)
    expect(fake.insertInlineContent).toHaveBeenLastCalledWith([{ type: 'mention', props: { kind: 'person', id: 'p1' } }, ' '])
    const teamItem = (await controller('@').getItems('')).find((i) => i.group === 'Team')!
    pick(teamItem)
    expect(fake.insertInlineContent).toHaveBeenLastCalledWith([{ type: 'mention', props: { kind: 'team', id: 't1' } }, ' '])
    expect(team).toBeDefined()
  })

  it('leaves the viewer out of the @ menu and loads the roster for them', async () => {
    await mount({ mentions: true, viewerId: 'me' })
    await controller('@').getItems('')
    expect(roster).toHaveBeenCalledWith('me')
  })

  it('the [[ menu groups records by kind and picking one stores the kind and id', async () => {
    await mount({ recordLinks: true })
    const items = await controller('[[').getItems('espresso')
    expect(search).toHaveBeenCalledWith('espresso')
    expect(items.map((i) => i.group)).toEqual(['Signal', 'Objective', 'Task', 'Project / Process'])
    controller('[[').onItemClick!(items[2])
    expect(fake.insertInlineContent).toHaveBeenLastCalledWith([{ type: 'recordLink', props: { kind: 'task', id: 'k1' } }, ' '])
  })

  it('/link ("Link a record") is in the slash menu only when record links are on, and opens the [[ menu', async () => {
    await mount()
    expect((await controller('/').getItems('link')).map((i) => i.title)).toEqual([])
    fake.controllers = []
    await mount({ recordLinks: true })
    const items = await controller('/').getItems('link')
    expect(items.map((i) => i.title)).toEqual(['Link a record'])
    items[0].onItemClick()
    expect(fake.openSuggestionMenu).toHaveBeenCalledWith('[[', expect.objectContaining({ deleteTriggerCharacter: true }))
  })

  it('gives a viewer no menus and no Save', async () => {
    read.mockResolvedValue({ blocks: [{ type: 'paragraph' }], updatedAt: 't1' })
    await mount({ canEdit: false, mentions: true, recordLinks: true })
    expect(fake.controllers).toEqual([])
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
  })
})

describe('BlockDocumentEditor save bar', () => {
  const typeOnce = () => fireEvent.click(screen.getByText('type'))
  const clickSave = async () => { await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) }) }

  it('saves the document against the read token and reports Saved', async () => {
    await mount()
    typeOnce()
    expect(screen.getByRole('status').textContent).toContain('Unsaved changes')
    await clickSave()
    expect(save).toHaveBeenCalledWith([{ type: 'paragraph' }], 't1')
    expect(screen.getByRole('status').textContent).toContain('Saved')
  })

  it('says Changed elsewhere with Reload when the document moved on', async () => {
    save.mockRejectedValueOnce(new BlockDocumentConflictError())
    await mount()
    typeOnce()
    await clickSave()
    expect(screen.getByRole('status').textContent).toContain('Changed elsewhere')
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy()
  })

  it('says Too long with the limit, keeps the text and lets Save be retried', async () => {
    save.mockRejectedValueOnce(new BlockDocumentTooLargeError())
    await mount()
    typeOnce()
    await clickSave()
    expect(screen.getByRole('status').textContent).toContain('Too long 256 KB')
  })

  it('says Save failed with Retry on any other failure', async () => {
    save.mockRejectedValueOnce(new Error('offline'))
    await mount()
    typeOnce()
    await clickSave()
    expect(screen.getByRole('status').textContent).toContain('Save failed')
    save.mockResolvedValueOnce('t3')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })) })
    expect(screen.getByRole('status').textContent).toContain('Saved')
  })

  it('Esc in the editor moves focus to Save without saving', async () => {
    await mount()
    typeOnce()
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'pm' }), { key: 'Escape' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Save' }))
    expect(save).not.toHaveBeenCalled()
  })
})
