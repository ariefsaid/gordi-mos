// WorkLineRecordPage — the Project/Process record surface at `/work/projects/:id`
// (ticket #806, OD-WAY-97 (2)). Reads the row by id; an unknown id renders a
// not-found INSIDE the record frame (`‹ Back to Projects & Processes`) rather than
// falling through to the app's global 404 — the record surface owns its own miss
// state, so the viewer's Back keeps meaning within the collection.
//
// Scope in this ticket: the standalone-page half of the panel/page regime. The
// pinned-header record adapter (Details · Tasks · Activity, inline title edit,
// chip picker for Objective, ⋯ menu) rides #806's follow-up so this file stays
// focused on the routing + the read boundary. Every string is keyed for both
// locales (LocaleParityContract).
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { RecordPageChrome } from '@/shell/record-page-chrome'
import { useDocumentTitle } from '@/shell/use-document-title'
import { EmptyState, ErrorState } from '@/components/ui/state-kit'
import { useT } from '@/i18n/use-t'
import { readWorkLine, type WorkLineRecord } from '@/lib/db/work-lines'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'not-found' }
  | { kind: 'ready'; record: WorkLineRecord }

export function WorkLineRecordPage() {
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
    readWorkLine(id)
      .then((record) => {
        if (cancelled) return
        setState(record ? { kind: 'ready', record } : { kind: 'not-found' })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const message = err instanceof Error ? err.message : t('workLines.record.error')
        setState({ kind: 'error', message })
      })
    return () => {
      cancelled = true
    }
  }, [id, t])

  const documentTitle =
    state.kind === 'ready'
      ? t('common.docTitle', { page: state.record.name })
      : t('common.docTitle', { page: t('nav.work.projects') })
  useDocumentTitle(documentTitle)

  const typeLabel =
    state.kind === 'ready'
      ? state.record.type === 'process'
        ? t('workLines.record.typeLabel.process')
        : t('workLines.record.typeLabel.project')
      : t('nav.work.projects')

  return (
    <PageFamilyFrame
      family="focused-record"
      title={typeLabel}
      jobSentence={t('workLines.record.loading')}
      state={state.kind === 'loading' ? 'loading' : 'default'}
      hideHead
    >
      <RecordPageChrome
        backTo="/work/projects"
        backLabel={t('workLines.record.backToCollection')}
      />
      {state.kind === 'loading' && (
        <p role="status" aria-live="polite">
          {t('workLines.record.loading')}
        </p>
      )}
      {state.kind === 'error' && (
        <ErrorState message={state.message} />
      )}
      {state.kind === 'not-found' && (
        <EmptyState
          variant="blank"
          headingLevel={2}
          title={t('workLines.record.notFound.title')}
          copy={t('workLines.record.notFound.copy')}
        />
      )}
      {state.kind === 'ready' && (
        <article
          data-testid="work-line-record"
          data-work-line-id={state.record.id}
          data-work-line-type={state.record.type}
        >
          <h1>{state.record.name}</h1>
          <p>{typeLabel}</p>
        </article>
      )}
    </PageFamilyFrame>
  )
}
