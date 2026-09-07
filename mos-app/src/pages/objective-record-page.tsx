// ObjectiveRecordPage — the Objective record surface at `/work/objectives/:id`
// (ticket #813, OD-WAY-97 (2) (5) (7)). Reads the row by id; an unknown id renders
// a not-found INSIDE the record frame (`‹ Back to Objectives`) rather than falling
// through to the app's global 404 — the record surface owns its own miss state, so
// the viewer's Back keeps meaning within the collection.
//
// Scope in this ticket: the standalone-page half of the panel/page regime. The full
// pinned-header record adapter (Details · Projects & Processes · Tasks · Activity
// tabs, inline edits gated on `canManageDefinition`) rides the follow-up; this file
// carries the routing + read boundary the record surface stands on. Every string is
// keyed for both locales.
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { RecordPageChrome } from '@/shell/record-page-chrome'
import { useDocumentTitle } from '@/shell/use-document-title'
import { EmptyState, ErrorState } from '@/components/ui/state-kit'
import { useT } from '@/i18n/use-t'
import { readObjective, type ObjectiveRecord } from '@/lib/db/objectives'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'not-found' }
  | { kind: 'ready'; record: ObjectiveRecord }

export function ObjectiveRecordPage() {
  const t = useT()
  const { id } = useParams<{ id: string }>()
  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  useEffect(() => {
    if (!id) {
      setState({ kind: 'not-found' })
      return
    }
    let cancelled = false
    setState({ kind: 'loading' })
    readObjective(id)
      .then((record) => {
        if (cancelled) return
        setState(record ? { kind: 'ready', record } : { kind: 'not-found' })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const message = err instanceof Error ? err.message : t('objectives.record.error')
        setState({ kind: 'error', message })
      })
    return () => {
      cancelled = true
    }
  }, [id, t])

  const documentTitle =
    state.kind === 'ready'
      ? t('common.docTitle', { page: state.record.name })
      : t('common.docTitle', { page: t('nav.work.objectives') })
  useDocumentTitle(documentTitle)

  const surfaceLabel = t('nav.work.objectives')

  return (
    <PageFamilyFrame
      family="focused-record"
      title={surfaceLabel}
      jobSentence={t('objectives.record.loading')}
      state={state.kind === 'loading' ? 'loading' : 'default'}
      hideHead
    >
      <RecordPageChrome
        backTo="/work/objectives"
        backLabel={t('objectives.record.backToCollection')}
      />
      {state.kind === 'loading' && (
        <p role="status" aria-live="polite">
          {t('objectives.record.loading')}
        </p>
      )}
      {state.kind === 'error' && (
        <ErrorState message={state.message} />
      )}
      {state.kind === 'not-found' && (
        <EmptyState
          variant="blank"
          headingLevel={2}
          title={t('objectives.record.notFound.title')}
          copy={t('objectives.record.notFound.copy')}
        />
      )}
      {state.kind === 'ready' && (
        <article
          data-testid="objective-record"
          data-objective-id={state.record.id}
        >
          <h1>{state.record.name}</h1>
          <p>{surfaceLabel}</p>
        </article>
      )}
    </PageFamilyFrame>
  )
}
