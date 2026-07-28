// ObjectivesPage — the Objectives catalog, Work's manage-mode (route /work/objectives). OD-V4-1
// (owner-ratified 2026-07-27, docs/v4-inheritance.md INC-1): "Objectives are visible to everyone
// and writeable at lead level" — the route carries NO RequireCapability read gate (RLS's
// objectives_select_org policy already grants SELECT to every authenticated org member with only
// the org_id tenancy check, FR-333); write (create/rename/archive) stays behind `can('objective.manage')`,
// held by admin + ops_lead (mos.objectives INSERT/UPDATE RLS via shared.can()). It speaks the V3
// collection grammar: a typed RecordCollection descriptor owns load / view (Active/Archived) / name
// search / task-coverage filter (H7), the shared RecordCollectionSurface + CollectionToolbar render
// it, and the FR-422 down-trace (each objective's child work_lines + per-work_line task count) rides
// under each active row. Each row also carries a relations disclosure (H4) — a real drill target
// into its child Projects/Processes and its own Tasks, bidirectional with ProjectsProcessesPage's
// own disclosure (docs/v4-inheritance.md INC-1: relations live on the records, not a new cascade
// route). A catalog row has no record panel, so its inline management actions (Rename / Archive /
// Unarchive) are its primary interaction; the ONE primary create affordance is the inline Add bar
// above the collection.
import { useCallback, useId, useState } from 'react'
import { useT } from '@/i18n/use-t'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { HelpTip } from '@/components/ui/help-tip'
import { Button } from '@/components/ui/button'
import { TextInput } from '@/components/ui/text-input'
import { useRecordCollection } from '@/lib/record-collection/use-record-collection'
import { RecordCollectionSurface } from '@/components/record-collection/record-collection'
import { CollectionToolbar } from '@/components/record-collection/collection-toolbar'
import {
  objectivesCollectionDescriptor,
  objectivesCatalogActions,
  type CatalogCollectionQuery,
} from '@/components/catalog/catalog-collection-adapter'
import {
  CatalogCollectionActionsProvider,
  type CatalogCollectionActions,
} from '@/components/catalog/catalog-collection-actions'
import '@/components/catalog/catalog-collection.css'

export function ObjectivesPage() {
  const t = useT()
  // harden (2026-07-28): this page set NO document title at all, so the browser tab, the PWA
  // task switcher and any bookmark all read the generic index fallback "Gordi MOS — Management
  // OS" — untranslated, and identical for every unlabelled route.
  useDocumentTitle(t('common.docTitle', { page: t('nav.work.objectives') }))
  const nameFieldId = useId()
  const controller = useRecordCollection({
    descriptor: objectivesCollectionDescriptor,
    urlMode: 'synced',
    viewerId: null,
    accessRoles: [],
  })
  const query = controller.state.query
  const projection = controller.state.projection

  const [live, setLive] = useState('')
  const announce = useCallback((msg: string) => setLive(msg), [])
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')

  const setQuery = (patch: Partial<CatalogCollectionQuery>) =>
    controller.setQuery({ ...query, ...patch })
  const nameOf = (id: string) =>
    controller.state.data?.records.find((r) => r.id === id)?.name ?? ''

  const actions: CatalogCollectionActions = {
    rename: async (id, name) => {
      await objectivesCatalogActions.rename(id, name)
      announce(t('catalog.announce.renamed', { name }))
      controller.retry()
    },
    archive: async (id) => {
      const name = nameOf(id)
      try {
        await objectivesCatalogActions.setArchived(id, true)
        announce(t('catalog.announce.archived', { name }))
        controller.retry()
      } catch (err) {
        announce(t('catalog.announce.archiveFailed', { name }))
        throw err
      }
    },
    unarchive: async (id) => {
      const name = nameOf(id)
      try {
        await objectivesCatalogActions.setArchived(id, false)
        announce(t('catalog.announce.restored', { name }))
        controller.retry()
      } catch (err) {
        announce(t('catalog.announce.restoreFailed', { name }))
        throw err
      }
    },
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) { setAddError(t('catalog.nameRequired')); return }
    setAdding(true)
    setAddError('')
    try {
      await objectivesCatalogActions.create(name)
      setNewName('')
      announce(t('catalog.announce.added', { name }))
      controller.setQuery({ ...query, view: 'active', q: '', coverage: 'all' })
      controller.retry()
    } catch (err) {
      setAddError(err instanceof Error ? err.message : t('catalog.addFailed'))
    } finally {
      setAdding(false)
    }
  }

  const viewLabel = t(query.view === 'archived' ? 'catalog.view.archived' : 'catalog.view.active')

  // OD-V4-1 H7: Objectives' one filter dimension — reuses the same CollectionToolbar `filters`
  // mechanism Projects/Processes already uses for its Type filter (no second filter grammar).
  const toolbar = (
    <CollectionToolbar
      presentation={{
        label: t('catalog.layoutLabel'),
        value: controller.state.presentation,
        options: [{ value: 'list', label: t('catalog.list') }],
        onChange: (next) => { controller.switchPresentation(next) },
      }}
      views={{
        label: t('catalog.viewsLabel'),
        value: query.view,
        options: [
          { value: 'active', label: t('catalog.view.active') },
          { value: 'archived', label: t('catalog.view.archived') },
        ],
        onChange: (view) => setQuery({ view }),
      }}
      search={{
        label: t('catalog.searchLabel'),
        placeholder: t('catalog.searchPlaceholder'),
        value: query.q,
        onChange: (q) => setQuery({ q }),
      }}
      filters={[
        {
          id: 'coverage',
          label: t('catalog.filter.coverage'),
          value: query.coverage,
          options: [
            { value: 'all', label: t('catalog.coverage.all') },
            { value: 'has-tasks', label: t('catalog.coverage.hasTasks') },
            { value: 'no-tasks', label: t('catalog.coverage.noTasks') },
          ],
          onChange: (coverage) => setQuery({ coverage: coverage as CatalogCollectionQuery['coverage'] }),
        },
      ]}
    />
  )

  return (
    // Census R2 DO-7 (objectives F7) + DO-20(d) (F6): no bare head count pill — the labeled
    // result-header inside the collection already carries the count ("N items in your scope"),
    // so the naked pill was a GUARD-R2-class duplicate. The extra meta subtitle overlapped the
    // job sentence (two subtitles vs Projects' one) and is dropped with it.
    <PageFamilyFrame
      family="management"
      title={t('nav.work.objectives')}
      jobSentence={t('job.objectives')}
      /* onboard (2026-07-28): Objectives scored 18/40 (the app's weakest surface) and OD-V4-1
         has just made it visible to EVERY role, so most of its readers are meeting it for the
         first time. The one thing they cannot infer from the screen is that the cascade is
         walked through the records rather than shown on a screen of its own. */
      meta={<HelpTip label={t('objectives.help')} />}
    >
      <div className="sr-only" aria-live="polite" role="status">{live}</div>

      {/* The ONE primary create affordance (State-Kit Rule): the inline Add bar. The head carries no
          action slot, so there is no duplicate create CTA. */}
      <form className="catalog-create" aria-label={t('catalog.objectives.add')} onSubmit={handleAdd}>
        <div className="catalog-create__name">
          <TextInput
            id={nameFieldId}
            label={t('catalog.nameLabel')}
            value={newName}
            onChange={(e) => { setNewName(e.target.value); if (addError) setAddError('') }}
            error={!!addError}
            fullWidth
            disabled={adding}
            placeholder={t('catalog.namePlaceholder')}
          />
        </div>
        <Button type="submit" variant="primary" disabled={adding} aria-busy={adding}>
          {adding ? t('catalog.objectives.adding') : t('catalog.objectives.add')}
        </Button>
        {addError && <p className="catalog-create__error" role="alert">{addError}</p>}
      </form>

      <CatalogCollectionActionsProvider actions={actions}>
        <div className="record-collection-view record-collection-view--list">
          <RecordCollectionSurface
            controller={controller}
            resultHeader={{
              collectionLabel: t('nav.work.objectives'),
              viewLabel,
              count: projection ? projection.visibleRecords.length : null,
            }}
            controls={toolbar}
            empty={{ title: t('catalog.objectives.empty.title'), copy: t('catalog.objectives.empty.copy') }}
            filteredEmpty={{ title: t('catalog.filteredEmpty.title'), clear: () => setQuery({ view: 'active', q: '', coverage: 'all' }) }}
            error={{ message: t('catalog.objectives.error'), retry: () => controller.retry() }}
            loadingLabel={t('catalog.objectives.loading')}
          />
        </div>
      </CatalogCollectionActionsProvider>
    </PageFamilyFrame>
  )
}
