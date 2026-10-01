import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { BlockNoteSchema, defaultBlockSpecs } from '@blocknote/core'
import { BlockNoteViewRaw, useCreateBlockNote } from '@blocknote/react'
import '@blocknote/core/style.css'
import '@blocknote/react/style.css'
import { useT } from '@/i18n/use-t'
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
import './objective-writeup-editor.css'

const IDLE_SAVE_MS = 3000

// Text blocks only: no file, image, table, code or other upload-capable block exists in the schema.
const { paragraph, heading, bulletListItem, numberedListItem, checkListItem, quote } = defaultBlockSpecs
const schema = BlockNoteSchema.create({
  blockSpecs: { paragraph, heading, bulletListItem, numberedListItem, checkListItem, quote },
})

type SaveState = 'idle' | 'saving' | 'saved' | 'failed' | 'tooLarge' | 'conflict'

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
  const keysHintId = useId()
  const stored = useMemo(() => sanitizeWriteUp(initial.writeUp), [initial.writeUp])
  const editor = useCreateBlockNote({
    schema,
    initialContent: stored.length > 0 ? (stored as never) : undefined,
    links: { isValidLink: isSafeWriteUpLink },
    domAttributes: { editor: { 'aria-label': t('objective.writeUp.label') } },
    // No slash menu exists here, and a read-only reader never sees an editor hint.
    placeholders: {
      default: t('objective.writeUp.placeholder'),
      emptyDocument: t('objective.writeUp.placeholder'),
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
  const queuedRef = useRef(false)
  const idleQueuedRef = useRef(false)
  const conflictRef = useRef(false)
  const timerRef = useRef<number | undefined>(undefined)
  const saveRef = useRef<HTMLButtonElement>(null)
  const dirtyCallbackRef = useRef(onDirtyChange)
  dirtyCallbackRef.current = onDirtyChange

  const setDirty = useCallback((dirty: boolean) => {
    if (dirtyRef.current === dirty) return
    dirtyRef.current = dirty
    dirtyCallbackRef.current?.(dirty)
  }, [])

  const flush = useCallback(async (fromIdle = false) => {
    window.clearTimeout(timerRef.current)
    if (!dirtyRef.current || conflictRef.current) return
    // A Save or blur that arrives mid-flight runs right after it. An idle pause that elapses mid-flight
    // does too, until the next edit starts a new pause; plain edits never do.
    if (inFlightRef.current) {
      if (fromIdle) idleQueuedRef.current = true
      else queuedRef.current = true
      return
    }
    inFlightRef.current = true
    setSaveState('saving')
    const snapshot = editor.document as WriteUpBlocks
    // Edits typed while the save is in flight re-mark dirty and wait for their own idle pause.
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
    const queued = queuedRef.current || idleQueuedRef.current
    queuedRef.current = false
    idleQueuedRef.current = false
    if (next === 'saved' && dirtyRef.current) {
      if (queued) void flush()
      else setSaveState('idle')
      return
    }
    setSaveState(next)
    if (next === 'saved') dirtyCallbackRef.current?.(false)
  }, [editor, objectiveId])

  const flushRef = useRef(flush)
  flushRef.current = flush

  const onEdit = useCallback(() => {
    if (!editable || conflictRef.current) return
    setDirty(true)
    if (saveState !== 'saving') setSaveState('idle')
    idleQueuedRef.current = false
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => { void flushRef.current(true) }, IDLE_SAVE_MS)
  }, [editable, saveState, setDirty])

  // Leaving with unsaved text is decided by the leave guard; Discard must not save it.
  useEffect(() => () => { window.clearTimeout(timerRef.current) }, [])

  // Escape hands focus to the bar's primary control. It runs in the capture phase because the editor
  // handles Escape itself (blurs and marks the event handled), so a bubbling handler never sees it.
  const leaveEditor = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return
    event.stopPropagation()
    saveRef.current?.focus()
  }

  // The block type under the caret, so the format buttons can show which one is active.
  const [activeType, setActiveType] = useState<string | null>(null)
  useEffect(() => editor.onSelectionChange(() => { setActiveType(editor.getTextCursorPosition().block.type) }), [editor])

  // The editor points at the key hint only while the hint renders; editability can change without a remount.
  useEffect(() => {
    if (editable) editor.domElement?.setAttribute('aria-describedby', keysHintId)
    else editor.domElement?.removeAttribute('aria-describedby')
  }, [editor, editable, keysHintId])

  const formatBlock = (type: 'heading' | 'bulletListItem' | 'numberedListItem') => {
    const { block } = editor.getTextCursorPosition()
    if (block.type === type) editor.updateBlock(block, { type: 'paragraph' })
    else editor.updateBlock(block, type === 'heading' ? { type, props: { level: 2 } } : { type })
    setActiveType(editor.getTextCursorPosition().block.type)
    editor.focus()
  }

  // Save stays focusable while saving (aria-disabled, never `disabled`): a focused control that becomes
  // disabled loses focus, and Escape from the editor both focuses Save and starts the save. flush() ignores repeats.
  const message =
    saveState === 'saving' ? t('objective.writeUp.saving')
    : saveState === 'saved' ? t('objective.writeUp.saved')
    : saveState === 'failed' ? t('objective.writeUp.failed')
    : saveState === 'tooLarge' ? t('objective.writeUp.tooLarge', { limit: `${WRITE_UP_MAX_BYTES / 1024} KB` })
    : saveState === 'conflict' ? t('objective.writeUp.conflict')
    : ''
  const empty = !editable && stored.length === 0

  return (
    <div className="objective-writeup" onBlur={editable ? () => { void flush() } : undefined}>
      {!editable ? <p className="record-viewer__permission-note" role="note">{t('objective.writeUp.readOnly')}</p> : null}
      {editable ? (
        <div className="objective-writeup__format" role="toolbar" aria-label={t('objective.writeUp.format')}>
          <Button variant="ghost" aria-pressed={activeType === 'heading'} onClick={() => formatBlock('heading')}>{t('objective.writeUp.heading')}</Button>
          <Button variant="ghost" aria-pressed={activeType === 'bulletListItem'} onClick={() => formatBlock('bulletListItem')}>{t('objective.writeUp.bulletList')}</Button>
          <Button variant="ghost" aria-pressed={activeType === 'numberedListItem'} onClick={() => formatBlock('numberedListItem')}>{t('objective.writeUp.numberedList')}</Button>
        </div>
      ) : null}
      {empty ? <p className="objective-writeup__empty">{t('objective.writeUp.empty')}</p> : (
        <div onKeyDownCapture={editable ? leaveEditor : undefined}>
        <BlockNoteViewRaw
          editor={editor}
          editable={editable}
          onChange={onEdit}
          formattingToolbar={false}
          linkToolbar={false}
          slashMenu={false}
          sideMenu={false}
          filePanel={false}
          tableHandles={false}
          emojiPicker={false}
          className="objective-writeup__editor"
        />
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
