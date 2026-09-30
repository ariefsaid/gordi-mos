import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  const stored = useMemo(() => sanitizeWriteUp(initial.writeUp), [initial.writeUp])
  const editor = useCreateBlockNote({
    schema,
    initialContent: stored.length > 0 ? (stored as never) : undefined,
    links: { isValidLink: isSafeWriteUpLink },
    domAttributes: { editor: { 'aria-label': t('objective.writeUp.label') } },
  }, [])
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const updatedAtRef = useRef(initial.updatedAt)
  const dirtyRef = useRef(false)
  const inFlightRef = useRef(false)
  const conflictRef = useRef(false)
  const timerRef = useRef<number | undefined>(undefined)
  const dirtyCallbackRef = useRef(onDirtyChange)
  dirtyCallbackRef.current = onDirtyChange

  const setDirty = useCallback((dirty: boolean) => {
    if (dirtyRef.current === dirty) return
    dirtyRef.current = dirty
    dirtyCallbackRef.current?.(dirty)
  }, [])

  const flush = useCallback(async () => {
    window.clearTimeout(timerRef.current)
    if (!dirtyRef.current || inFlightRef.current || conflictRef.current) return
    inFlightRef.current = true
    setSaveState('saving')
    const snapshot = editor.document as WriteUpBlocks
    // Edits typed while the save is in flight re-mark dirty and are picked up by the next flush.
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
    setSaveState(next)
    if (next === 'saved') {
      if (dirtyRef.current) void flush()
      else dirtyCallbackRef.current?.(false)
    }
  }, [editor, objectiveId])

  const flushRef = useRef(flush)
  flushRef.current = flush

  const onEdit = useCallback(() => {
    if (!editable || conflictRef.current) return
    setDirty(true)
    if (saveState !== 'saving') setSaveState('idle')
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => { void flushRef.current() }, IDLE_SAVE_MS)
  }, [editable, saveState, setDirty])

  // Leaving with unsaved text is decided by the leave guard; Discard must not save it.
  useEffect(() => () => { window.clearTimeout(timerRef.current) }, [])

  const message =
    saveState === 'saving' ? t('objective.writeUp.saving')
    : saveState === 'saved' ? t('objective.writeUp.saved')
    : saveState === 'failed' ? t('objective.writeUp.failed')
    : saveState === 'tooLarge' ? t('objective.writeUp.tooLarge')
    : saveState === 'conflict' ? t('objective.writeUp.conflict')
    : ''
  const empty = !editable && stored.length === 0

  return (
    <div className="objective-writeup" onBlur={editable ? () => { void flush() } : undefined}>
      {!editable ? <p className="record-viewer__permission-note" role="note">{t('objective.writeUp.readOnly')}</p> : null}
      {empty ? <p className="objective-writeup__empty">{t('objective.writeUp.empty')}</p> : (
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
      )}
      {editable ? (
        <div className="objective-writeup__bar">
          <p className="objective-writeup__status" role="status" aria-live="polite">{message}</p>
          {saveState === 'failed' || saveState === 'tooLarge' ? (
            <Button type="button" variant="outline" onClick={() => { void flush() }}>{t('objective.writeUp.retry')}</Button>
          ) : null}
          {saveState === 'conflict' ? (
            <Button type="button" variant="outline" onClick={onReload}>{t('objective.writeUp.reload')}</Button>
          ) : (
            <Button type="button" variant="primary" disabled={saveState === 'saving'} onClick={() => { void flush() }}>{t('objective.writeUp.save')}</Button>
          )}
        </div>
      ) : null}
    </div>
  )
}
