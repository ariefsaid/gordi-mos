import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs, filterSuggestionItems } from '@blocknote/core'
import { getDefaultSlashMenuItems } from '@blocknote/core/extensions'
import { BlockNoteView } from '@blocknote/ariakit'
import {
  DragHandleMenu,
  FormattingToolbar,
  FormattingToolbarController,
  RemoveBlockItem,
  SideMenu,
  SideMenuController,
  SuggestionMenuController,
  blockTypeSelectItems,
  getDefaultReactSlashMenuItems,
  getFormattingToolbarItems,
  useCreateBlockNote,
  useDictionary,
} from '@blocknote/react'
import '@blocknote/core/style.css'
import '@blocknote/ariakit/style.css'
import { useT } from '@/i18n/use-t'
import { useI18n } from '@/i18n/I18nProvider'
import { Button } from '@/components/ui/button'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ErrorState, LoadingShell } from '@/components/ui/state-kit'
import {
  BLOCK_DOCUMENT_MAX_BYTES,
  BlockDocumentConflictError,
  BlockDocumentTooLargeError,
  isSafeDocumentLink,
  sanitizeBlockDocument,
  type BlockDocument,
  type BlockDocumentInlineOptions,
  type BlockDocumentRead,
  type BlockDocumentStore,
  type RecordLinkKind,
} from '@/lib/db/block-document'
import { loadMentionRoster, searchLinkableRecords, type MentionRoster, type RecordRef } from '@/lib/db/document-references'
import { blockDocumentDictionary } from './block-document-dictionary'
import { createInlineSpecs, DocumentReferencesProvider, KIND_LABEL, useDocumentReferences } from './block-document-references'
import { linkRecordSlashItem, mentionItems, recordItems, useFooterMenu } from './block-document-menus'
import './block-document-editor.css'

// Text blocks only: no file, image, table, code or other upload-capable block exists in the schema.
const { paragraph, heading, bulletListItem, numberedListItem, quote } = defaultBlockSpecs

// The library's checklist note with its checkbox named: the note label ("Checklist note") then the item's own
// text, so an empty item is still named. Same block type and `checked` prop as the library's.
const libraryCheckListItem = defaultBlockSpecs.checkListItem
const libraryRender = libraryCheckListItem.implementation.render as unknown as (
  this: unknown, block: never, editor: never,
) => { dom: DocumentFragment; contentDOM?: HTMLElement }
const checkListItem = {
  ...libraryCheckListItem,
  implementation: {
    ...libraryCheckListItem.implementation,
    render(this: unknown, block: never, editor: never) {
      const rendered = libraryRender.call(this, block, editor)
      const checkbox = rendered.dom.querySelector('input[type="checkbox"]')
      const id = (block as { id: string }).id
      rendered.contentDOM?.setAttribute('id', `check-text-${id}`)
      checkbox?.setAttribute('id', `check-box-${id}`)
      checkbox?.setAttribute('aria-label', (editor as { dictionary: { slash_menu: { check_list: { title: string } } } }).dictionary.slash_menu.check_list.title)
      checkbox?.setAttribute('aria-labelledby', `check-box-${id} check-text-${id}`)
      return rendered
    },
  },
} as typeof libraryCheckListItem
const blockSpecs = { paragraph, heading, bulletListItem, numberedListItem, checkListItem, quote }
const textOnlySchema = BlockNoteSchema.create({ blockSpecs })

// Mentions and record links are the only inline nodes beyond text and links, and only when the document allows them.
function createSchema(options: BlockDocumentInlineOptions) {
  if (!options.mentions && !options.recordLinks) return textOnlySchema
  return BlockNoteSchema.create({ blockSpecs, inlineContentSpecs: { ...defaultInlineContentSpecs, ...createInlineSpecs(options) } } as never)
}

// The slash menu offers the stored block types only: no toggle headings, headings past level 3 or emoji.
const SLASH_ITEM_KEYS = new Set(['heading', 'heading_2', 'heading_3', 'quote', 'numbered_list', 'bullet_list', 'check_list', 'paragraph'])

// The React items drop the key the core items carry; both lists come in the same order.
function allowedSlashItems(editor: Parameters<typeof getDefaultSlashMenuItems>[0], query: string) {
  const keys = getDefaultSlashMenuItems(editor).map((item) => item.key)
  return filterSuggestionItems(getDefaultReactSlashMenuItems(editor).filter((_, index) => SLASH_ITEM_KEYS.has(keys[index])), query)
}

// The stored block types, as the slash menu offers them: paragraph, quote, the three lists, headings 1-3.
const STORED_BLOCK_TYPES = new Set(['paragraph', 'quote', 'bulletListItem', 'numberedListItem', 'checkListItem'])

// The library's selection toolbar without text alignment (an ops write-up is left-aligned prose) and with
// the block-type list limited to the stored types, so nothing the sanitizer would change on reload is offered.
function DocumentToolbar() {
  const items = blockTypeSelectItems(useDictionary()).filter((item) => {
    if (item.type !== 'heading') return STORED_BLOCK_TYPES.has(item.type)
    const props = item.props as { level: number; isToggleable: boolean }
    return props.level <= 3 && !props.isToggleable
  })
  return <FormattingToolbar>{getFormattingToolbarItems(items).filter((item) => !String(item.key).startsWith('textAlign'))}</FormattingToolbar>
}

// Block menu: delete only. Colour is offered once, in the selection toolbar.
function DocumentDragHandleMenu() {
  const dict = useDictionary()
  return <DragHandleMenu><RemoveBlockItem>{dict.drag_handle.delete_menuitem}</RemoveBlockItem></DragHandleMenu>
}

function DocumentSideMenu() {
  return <SideMenu dragHandleMenu={DocumentDragHandleMenu} />
}

// An editor menu or popover (slash menu, block menu, link form, toolbar list) that Escape should close first.
// A closed popover stays in the DOM with `hidden`, so only a shown one counts.
const OPEN_MENU = ['.bn-suggestion-menu', '.bn-menu-dropdown', '.bn-ak-popover', '.bn-ak-menu', '.bn-ak-hovercard', '[aria-expanded="true"]']
  .map((menu) => `.block-doc__editor ${menu}:not([hidden])`)
  .join(', ')

type SaveState = 'idle' | 'draft' | 'saving' | 'saved' | 'failed' | 'tooLarge' | 'conflict'

/** The words a document shows around its content: its own label, empty and read-only lines, and the save bar. */
export interface BlockDocumentCopy {
  label: string
  loading: string
  loadError: string
  unreadable: string
  empty: string
  placeholder: string
  placeholderEmpty: string
  /** The "you can read but not edit" line; empty when the page already says so. */
  readOnly: string
  save: string
  saving: string
  saved: string
  unsaved: string
  failed: string
  retry: string
  reload: string
  conflict: string
  tooLarge: (limit: string) => string
  keysHint: string
}

export interface BlockDocumentEditorProps {
  /** Identity of the stored document: a new key loads (and remounts) another one. */
  documentKey: string
  /** Where the document is read from and saved to; read once per load and once per save. */
  store: BlockDocumentStore
  /** Whether the viewer may change the document (callers fold archived and offline rules into this). */
  canEdit: boolean
  /** `@` mentions of people and Teams. */
  mentions?: boolean
  /** `[[` and `/link` links to Tasks, Objectives, Projects/Processes and Signals. */
  recordLinks?: boolean
  /** The slash menu's checkbox item is a free note, not a counted checklist. */
  checklistNote?: boolean
  /** No box around the document: the body of a record page. */
  bare?: boolean
  /** The viewer's own person id: left out of the `@` menu. */
  viewerId?: string | null
  /** Opens a record chip. Without it a chip shows its title but is not a control. */
  onOpenRecord?: (ref: RecordRef) => void
  copy: BlockDocumentCopy
  onDirtyChange?: (dirty: boolean) => void
  onSaved?: () => void
  /**
   * A draft document: the host keeps it (its own Create is the save), so there is no save bar, no
   * conflict check and no store write; every edit goes to `onDocumentChange`. `store.read` seeds it.
   */
  draft?: boolean
  onDocumentChange?: (blocks: BlockDocument) => void
}

export function BlockDocumentEditor(props: BlockDocumentEditorProps) {
  const { documentKey, store, copy } = props
  const [loaded, setLoaded] = useState<BlockDocumentRead | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [reloadNonce, setReloadNonce] = useState(0)
  const storeRef = useRef(store)
  storeRef.current = store

  useEffect(() => {
    let live = true
    setStatus('loading')
    setLoaded(null)
    storeRef.current.read()
      .then((next) => {
        if (!live) return
        if (!next) { setStatus('error'); return }
        setLoaded(next)
        setStatus('ready')
      })
      .catch(() => { if (live) setStatus('error') })
    return () => { live = false }
  }, [documentKey, reloadNonce])

  if (status === 'loading') return <LoadingShell label={copy.loading} />
  if (status === 'error' || !loaded) return <ErrorState message={copy.loadError} onRetry={() => setReloadNonce((n) => n + 1)} />
  return (
    <ErrorBoundary key={`${documentKey}:${reloadNonce}`} fallback={<ErrorState message={copy.unreadable} />}>
      <DocumentSurface {...props} initial={loaded} storeRef={storeRef} onReload={() => setReloadNonce((n) => n + 1)} />
    </ErrorBoundary>
  )
}

function DocumentSurface({
  initial,
  storeRef,
  canEdit: editable,
  mentions = false,
  recordLinks = false,
  checklistNote = false,
  bare = false,
  viewerId = null,
  onOpenRecord,
  copy,
  onDirtyChange,
  onSaved,
  draft = false,
  onDocumentChange,
  onReload,
}: BlockDocumentEditorProps & {
  initial: BlockDocumentRead
  storeRef: { current: BlockDocumentStore }
  onReload: () => void
}) {
  const t = useT()
  const { locale } = useI18n()
  const keysHintId = useId()
  const inline = useMemo<BlockDocumentInlineOptions>(() => ({ mentions, recordLinks }), [mentions, recordLinks])
  const sanitize = useCallback((blocks: unknown) => sanitizeBlockDocument(blocks, inline), [inline])
  const stored = useMemo(() => sanitize(initial.blocks), [initial.blocks, sanitize])
  const schema = useMemo(() => createSchema(inline), [inline])
  const references = useDocumentReferences(onOpenRecord)
  const refreshReferences = references.refresh
  const editor = useCreateBlockNote({
    schema,
    initialContent: stored.length > 0 ? (stored as never) : undefined,
    links: { isValidLink: isSafeDocumentLink },
    dictionary: blockDocumentDictionary(locale, { checklistNote }),
    domAttributes: { editor: { 'aria-label': copy.label } },
    // A read-only reader never sees an editor hint.
    placeholders: {
      default: copy.placeholder,
      emptyDocument: copy.placeholderEmpty,
      heading: '',
      bulletListItem: '',
      numberedListItem: '',
      checkListItem: '',
    },
  }, [])
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const updatedAtRef = useRef(initial.updatedAt)
  const dirtyRef = useRef(false)
  const inFlightRef = useRef(false)
  const inFlightSnapshotRef = useRef<BlockDocument | null>(null)
  const savedSnapshotRef = useRef<BlockDocument>(sanitize(editor.document))
  const conflictRef = useRef(false)
  const saveRef = useRef<HTMLButtonElement>(null)
  const dirtyCallbackRef = useRef(onDirtyChange)
  dirtyCallbackRef.current = onDirtyChange
  const savedCallbackRef = useRef(onSaved)
  savedCallbackRef.current = onSaved
  const documentCallbackRef = useRef(onDocumentChange)
  documentCallbackRef.current = onDocumentChange

  // Names and titles of what the stored document points at.
  useEffect(() => { if (mentions || recordLinks) refreshReferences(stored) }, [mentions, recordLinks, refreshReferences, stored])

  const setDirty = useCallback((dirty: boolean) => {
    if (dirtyRef.current === dirty) return
    dirtyRef.current = dirty
    dirtyCallbackRef.current?.(dirty)
  }, [])

  // One explicit write per Save/Retry click: the latest snapshot as one logical document, one history
  // event. A click that arrives mid-flight is ignored (the bar says busy), never queued; edits typed
  // mid-flight stay draft and wait for the next explicit Save. Returning to the saved snapshot is clean.
  const flush = useCallback(async () => {
    if (!dirtyRef.current || conflictRef.current || inFlightRef.current) return
    inFlightRef.current = true
    setSaveState('saving')
    const snapshot = editor.document as BlockDocument
    inFlightSnapshotRef.current = sanitize(snapshot)
    dirtyRef.current = false
    let next: SaveState = 'saved'
    let saved = false
    try {
      updatedAtRef.current = await storeRef.current.save(snapshot, updatedAtRef.current)
      savedSnapshotRef.current = sanitize(snapshot)
      saved = true
    } catch (error) {
      if (error instanceof BlockDocumentConflictError) { conflictRef.current = true; next = 'conflict' }
      else next = error instanceof BlockDocumentTooLargeError ? 'tooLarge' : 'failed'
    }
    inFlightRef.current = false
    inFlightSnapshotRef.current = null
    if (saved) savedCallbackRef.current?.()
    const dirty = JSON.stringify(sanitize(editor.document)) !== JSON.stringify(savedSnapshotRef.current)
    dirtyRef.current = dirty
    if (next !== 'saved' && !dirty && next !== 'conflict') next = 'saved'
    setSaveState(dirty && next === 'saved' ? 'draft' : next)
    dirtyCallbackRef.current?.(dirty)
  }, [editor, sanitize, storeRef])

  const onEdit = useCallback(() => {
    if (!editable || conflictRef.current) return
    if (mentions || recordLinks) refreshReferences(editor.document as BlockDocument)
    if (draft) { documentCallbackRef.current?.(editor.document as BlockDocument); return }
    const baseline = inFlightSnapshotRef.current ?? savedSnapshotRef.current
    const dirty = JSON.stringify(sanitize(editor.document)) !== JSON.stringify(baseline)
    if (inFlightRef.current) {
      dirtyRef.current = dirty
      if (dirty) dirtyCallbackRef.current?.(true)
      return
    }
    const wasDirty = dirtyRef.current
    setDirty(dirty)
    if (dirty) setSaveState('draft')
    else if (wasDirty) setSaveState('saved')
  }, [draft, editable, editor, mentions, recordLinks, refreshReferences, sanitize, setDirty])

  // Escape hands focus to the bar's Save control; it never persists anything by itself — persistence
  // is the Save click, never a blur. It runs in the capture phase because the editor handles Escape
  // itself (blurs and marks the event handled), so a bubbling handler never sees it.
  const leaveEditor = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return
    if (document.querySelector(OPEN_MENU)) return
    event.stopPropagation()
    saveRef.current?.focus()
  }

  // The editor points at the key hint only while the hint renders; editability can change without a remount.
  useEffect(() => {
    if (editable) editor.domElement?.setAttribute('aria-describedby', keysHintId)
    else editor.domElement?.removeAttribute('aria-describedby')
  }, [editor, editable, keysHintId])

  // The library leaves aria-expanded="false" on the textbox after a menu closes; a textbox may not carry it.
  useEffect(() => {
    const dom = editor.domElement
    if (!dom) return
    const observer = new MutationObserver(() => { if (dom.getAttribute('aria-expanded') === 'false') dom.removeAttribute('aria-expanded') })
    observer.observe(dom, { attributes: true, attributeFilter: ['aria-expanded'] })
    return () => observer.disconnect()
  }, [editor])

  // `@` and `[[` data: the roster loads on the first `@`, records are searched as the query changes.
  const rosterRef = useRef<Promise<MentionRoster> | null>(null)
  const mentionMenu = useFooterMenu(t('blockDoc.mention.footer'), t('blockDoc.mention.label'))
  const linkMenu = useFooterMenu(t('blockDoc.link.footer'), t('blockDoc.link.label'))
  const kindLabel = useCallback((kind: RecordLinkKind) => t(KIND_LABEL[kind]), [t])
  const remember = references.remember
  const getSlashItems = useCallback(async (query: string) => {
    const items = allowedSlashItems(editor as never, query)
    if (!recordLinks) return items
    const link = linkRecordSlashItem(editor as never, {
      title: t('blockDoc.slash.link'),
      subtext: t('blockDoc.slash.linkSubtext'),
      group: editor.dictionary.slash_menu.paragraph.group ?? '',
    })
    return filterSuggestionItems([...items, link], query)
  }, [editor, recordLinks, t])
  const getMentionItems = useCallback(async (query: string) => {
    rosterRef.current ??= loadMentionRoster(viewerId).catch((error) => { rosterRef.current = null; throw error })
    return mentionItems(editor as never, await rosterRef.current, query,
      { person: t('blockDoc.mention.person'), team: t('blockDoc.mention.team') },
      (mention) => remember({ mention }))
  }, [editor, remember, t, viewerId])
  const getRecordItems = useCallback(async (query: string) => recordItems(
    editor as never, await searchLinkableRecords(query), kindLabel, (record) => remember({ record })),
  [editor, kindLabel, remember])

  // Save stays focusable while saving (aria-disabled, never `disabled`): a focused control that becomes
  // disabled loses focus, and Escape from the editor both focuses Save and starts the save. flush() ignores repeats.
  const message =
    saveState === 'draft' ? copy.unsaved
    : saveState === 'saving' ? copy.saving
    : saveState === 'saved' ? copy.saved
    : saveState === 'failed' ? copy.failed
    : saveState === 'tooLarge' ? copy.tooLarge(`${BLOCK_DOCUMENT_MAX_BYTES / 1024} KB`)
    : saveState === 'conflict' ? copy.conflict
    : ''
  const empty = !editable && !draft && stored.length === 0

  return (
    <div className={bare ? 'block-doc block-doc--bare' : 'block-doc'}>
      {!editable && copy.readOnly ? <p className="record-viewer__permission-note" role="note">{copy.readOnly}</p> : null}
      {empty ? <p className="block-doc__empty">{copy.empty}</p> : (
        <DocumentReferencesProvider value={references.value}>
        <div onKeyDownCapture={editable && !draft ? leaveEditor : undefined}>
        <BlockNoteView
          editor={editor}
          editable={editable}
          onChange={onEdit}
          // The library's own menus, only for an editor that can edit. No upload, table or emoji UI exists.
          formattingToolbar={false}
          linkToolbar={editable}
          sideMenu={false}
          slashMenu={false}
          filePanel={false}
          tableHandles={false}
          emojiPicker={false}
          comments={false}
          className={editable ? 'block-doc__editor block-doc__editor--menus' : 'block-doc__editor'}
        >
          {editable ? (
            <FormattingToolbarController
              formattingToolbar={DocumentToolbar}
              // A bottom placement keeps the active first line clear instead of floating the
              // toolbar over it. Floating UI flips it back above when the lower viewport edge is tight.
              floatingUIOptions={{ useFloatingOptions: { placement: 'bottom-start' } }}
            />
          ) : null}
          {editable ? <SideMenuController sideMenu={DocumentSideMenu} /> : null}
          {editable ? (
            <SuggestionMenuController
              triggerCharacter="/"
              getItems={getSlashItems}
            />
          ) : null}
          {editable && mentions ? (
            <SuggestionMenuController
              triggerCharacter="@"
              getItems={getMentionItems}
              suggestionMenuComponent={mentionMenu}
              onItemClick={(item) => item.onItemClick()}
            />
          ) : null}
          {editable && recordLinks ? (
            <SuggestionMenuController
              triggerCharacter="[["
              getItems={getRecordItems}
              suggestionMenuComponent={linkMenu}
              onItemClick={(item) => item.onItemClick()}
            />
          ) : null}
        </BlockNoteView>
        </div>
        </DocumentReferencesProvider>
      )}
      {editable && !empty ? <p id={keysHintId} className="block-doc__hint">{copy.keysHint}</p> : null}
      {editable && !draft ? (
        <div className="block-doc__bar">
          <p className="block-doc__status" role="status" aria-live="polite">{message}</p>
          {saveState === 'failed' ? (
            <Button type="button" variant="outline" onClick={() => { void flush() }}>{copy.retry}</Button>
          ) : null}
          {saveState === 'conflict' ? (
            <Button ref={saveRef} type="button" variant="outline" onClick={onReload}>{copy.reload}</Button>
          ) : (
            <Button ref={saveRef} type="button" variant={saveState === 'saved' ? 'outline' : 'primary'} aria-disabled={saveState === 'saving'} aria-busy={saveState === 'saving'} onClick={() => { void flush() }}>{copy.save}</Button>
          )}
        </div>
      ) : null}
    </div>
  )
}
