import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { BlockNoteSchema, defaultBlockSpecs, filterSuggestionItems } from '@blocknote/core'
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
  isSafeWriteUpLink,
  readWriteUp,
  sanitizeWriteUp,
  saveWriteUp,
  WriteUpConflictError,
  WriteUpTooLargeError,
  WRITE_UP_MAX_BYTES,
  type WriteUpBlocks,
} from '@/lib/db/objective-writeup'
import { writeUpDictionary } from './objective-writeup-dictionary'
import './objective-writeup-editor.css'

// Text blocks only: no file, image, table, code or other upload-capable block exists in the schema.
const { paragraph, heading, bulletListItem, numberedListItem, checkListItem, quote } = defaultBlockSpecs
const schema = BlockNoteSchema.create({
  blockSpecs: { paragraph, heading, bulletListItem, numberedListItem, checkListItem, quote },
})

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
function WriteUpToolbar() {
  const items = blockTypeSelectItems(useDictionary()).filter((item) => {
    if (item.type !== 'heading') return STORED_BLOCK_TYPES.has(item.type)
    const props = item.props as { level: number; isToggleable: boolean }
    return props.level <= 3 && !props.isToggleable
  })
  return <FormattingToolbar>{getFormattingToolbarItems(items).filter((item) => !String(item.key).startsWith('textAlign'))}</FormattingToolbar>
}

// Block menu: delete only. Colour is offered once, in the selection toolbar.
function WriteUpDragHandleMenu() {
  const dict = useDictionary()
  return <DragHandleMenu><RemoveBlockItem>{dict.drag_handle.delete_menuitem}</RemoveBlockItem></DragHandleMenu>
}

function WriteUpSideMenu() {
  return <SideMenu dragHandleMenu={WriteUpDragHandleMenu} />
}

// An editor menu or popover (slash menu, block menu, link form, toolbar list) that Escape should close first.
// A closed popover stays in the DOM with `hidden`, so only a shown one counts.
const OPEN_MENU = ['.bn-suggestion-menu', '.bn-menu-dropdown', '.bn-ak-popover', '.bn-ak-menu', '.bn-ak-hovercard', '[aria-expanded="true"]']
  .map((menu) => `.objective-writeup__editor ${menu}:not([hidden])`)
  .join(', ')

type SaveState = 'idle' | 'draft' | 'saving' | 'saved' | 'failed' | 'tooLarge' | 'conflict'

export interface ObjectiveWriteupEditorProps {
  objectiveId: string
  canEdit: boolean
  archived: boolean
  onDirtyChange?: (dirty: boolean) => void
}

export function ObjectiveWriteupEditor({ objectiveId, canEdit, archived, onDirtyChange }: ObjectiveWriteupEditorProps) {
  const t = useT()
  const [loaded, setLoaded] = useState<{ writeUp: WriteUpBlocks | null; updatedAt: string } | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [reloadNonce, setReloadNonce] = useState(0)

  useEffect(() => {
    let live = true
    setStatus('loading')
    setLoaded(null)
    readWriteUp(objectiveId)
      .then((next) => {
        if (!live) return
        if (!next) { setStatus('error'); return }
        setLoaded(next)
        setStatus('ready')
      })
      .catch(() => { if (live) setStatus('error') })
    return () => { live = false }
  }, [objectiveId, reloadNonce])

  if (status === 'loading') return <LoadingShell label={t('objective.writeUp.loading')} />
  if (status === 'error' || !loaded) return <ErrorState message={t('objective.writeUp.loadError')} onRetry={() => setReloadNonce((n) => n + 1)} />
  return (
    <ErrorBoundary key={`${objectiveId}:${reloadNonce}`} fallback={<ErrorState message={t('objective.writeUp.unreadable')} />}>
      <WriteUpSurface
        objectiveId={objectiveId}
        initial={loaded}
        editable={canEdit && !archived}
        onDirtyChange={onDirtyChange}
        onReload={() => setReloadNonce((n) => n + 1)}
      />
    </ErrorBoundary>
  )
}

function WriteUpSurface({
  objectiveId,
  initial,
  editable,
  onDirtyChange,
  onReload,
}: {
  objectiveId: string
  initial: { writeUp: WriteUpBlocks | null; updatedAt: string }
  editable: boolean
  onDirtyChange?: (dirty: boolean) => void
  onReload: () => void
}) {
  const t = useT()
  const { locale } = useI18n()
  const keysHintId = useId()
  const stored = useMemo(() => sanitizeWriteUp(initial.writeUp), [initial.writeUp])
  const editor = useCreateBlockNote({
    schema,
    initialContent: stored.length > 0 ? (stored as never) : undefined,
    links: { isValidLink: isSafeWriteUpLink },
    dictionary: writeUpDictionary(locale),
    domAttributes: { editor: { 'aria-label': t('objective.writeUp.label') } },
    // A read-only reader never sees an editor hint.
    placeholders: {
      default: t('objective.writeUp.placeholder'),
      emptyDocument: t('objective.writeUp.placeholderEmpty'),
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
  const conflictRef = useRef(false)
  const saveRef = useRef<HTMLButtonElement>(null)
  const dirtyCallbackRef = useRef(onDirtyChange)
  dirtyCallbackRef.current = onDirtyChange

  const setDirty = useCallback((dirty: boolean) => {
    if (dirtyRef.current === dirty) return
    dirtyRef.current = dirty
    dirtyCallbackRef.current?.(dirty)
  }, [])

  // One explicit write per Save/Retry click: the latest snapshot as one logical document, one history
  // event. A click that arrives mid-flight is ignored (the bar says busy), never queued; edits typed
  // mid-flight stay draft and wait for the next explicit Save. A Save with nothing new writes nothing.
  const flush = useCallback(async () => {
    if (!dirtyRef.current || conflictRef.current || inFlightRef.current) return
    inFlightRef.current = true
    setSaveState('saving')
    const snapshot = editor.document as WriteUpBlocks
    dirtyRef.current = false
    let next: SaveState = 'saved'
    try {
      updatedAtRef.current = await saveWriteUp(objectiveId, snapshot, updatedAtRef.current)
    } catch (error) {
      dirtyRef.current = true
      if (error instanceof WriteUpConflictError) { conflictRef.current = true; next = 'conflict' }
      else next = error instanceof WriteUpTooLargeError ? 'tooLarge' : 'failed'
    }
    inFlightRef.current = false
    if (next === 'saved' && dirtyRef.current) { setSaveState('draft'); return }
    setSaveState(next)
    if (next === 'saved') dirtyCallbackRef.current?.(false)
  }, [editor, objectiveId])

  const onEdit = useCallback(() => {
    if (!editable || conflictRef.current) return
    setDirty(true)
    if (saveState !== 'saving') setSaveState('draft')
  }, [editable, saveState, setDirty])

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

  // Save stays focusable while saving (aria-disabled, never `disabled`): a focused control that becomes
  // disabled loses focus, and Escape from the editor both focuses Save and starts the save. flush() ignores repeats.
  const message =
    saveState === 'draft' ? t('objective.writeUp.unsaved')
    : saveState === 'saving' ? t('objective.writeUp.saving')
    : saveState === 'saved' ? t('objective.writeUp.saved')
    : saveState === 'failed' ? t('objective.writeUp.failed')
    : saveState === 'tooLarge' ? t('objective.writeUp.tooLarge', { limit: `${WRITE_UP_MAX_BYTES / 1024} KB` })
    : saveState === 'conflict' ? t('objective.writeUp.conflict')
    : ''
  const empty = !editable && stored.length === 0

  return (
    <div className="objective-writeup">
      {!editable ? <p className="record-viewer__permission-note" role="note">{t('objective.writeUp.readOnly')}</p> : null}
      {empty ? <p className="objective-writeup__empty">{t('objective.writeUp.empty')}</p> : (
        <div onKeyDownCapture={editable ? leaveEditor : undefined}>
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
          className={editable ? 'objective-writeup__editor objective-writeup__editor--menus' : 'objective-writeup__editor'}
        >
          {editable ? <FormattingToolbarController formattingToolbar={WriteUpToolbar} /> : null}
          {editable ? <SideMenuController sideMenu={WriteUpSideMenu} /> : null}
          {editable ? (
            <SuggestionMenuController
              triggerCharacter="/"
              getItems={async (query) => allowedSlashItems(editor as never, query)}
            />
          ) : null}
        </BlockNoteView>
        </div>
      )}
      {editable && !empty ? <p id={keysHintId} className="objective-writeup__hint">{t('objective.writeUp.keysHint')}</p> : null}
      {editable ? (
        <div className="objective-writeup__bar">
          <p className="objective-writeup__status" role="status" aria-live="polite">{message}</p>
          {saveState === 'failed' ? (
            <Button type="button" variant="outline" onClick={() => { void flush() }}>{t('objective.writeUp.retry')}</Button>
          ) : null}
          {saveState === 'conflict' ? (
            <Button ref={saveRef} type="button" variant="outline" onClick={onReload}>{t('objective.writeUp.reload')}</Button>
          ) : (
            <Button ref={saveRef} type="button" variant={saveState === 'saved' ? 'outline' : 'primary'} aria-disabled={saveState === 'saving'} aria-busy={saveState === 'saving'} onClick={() => { void flush() }}>{t('objective.writeUp.save')}</Button>
          )}
        </div>
      ) : null}
    </div>
  )
}
