// ProjectsProcessesPage — Projects & Processes catalog, Work's manage-mode (route /work/projects
// behind RequireCapability workline.manage; FR-424 — UNCHANGED by OD-V4-1, which only re-scopes
// Objectives' read gate). The physical table is mos.work_lines (ADR-0015); the UI term is
// Project/Process. It now speaks the V3 collection grammar: a typed RecordCollection descriptor
// owns load / view (Active/Archived) / name search / a Project·Process type filter, the shared
// RecordCollectionSurface + CollectionToolbar render it, and the FR-422 up-trace (each work_line's
// parent objective(s), inferred from task linkage — work_lines has no objective_id column) rides
// under each active row. Each row also carries a relations disclosure (OD-V4-1 H4) — a real drill
// target into its parent Objective(s) and its own Tasks, bidirectional with ObjectivesPage's own
// disclosure (docs/v4-inheritance.md INC-1: relations live on the records, not a new cascade
// route). A catalog row has no record panel, so its inline management actions (Rename / Archive /
// Unarchive) are its primary interaction; the ONE primary create affordance is the inline Add bar
// above the collection, carrying the create-time Type field (FR-013/014).
import { useCallback, useId, useState } from 'react'
import { useT } from '@/i18n/use-t'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { Button } from '@/components/ui/button'
import { TextInput } from '@/components/ui/text-input'
import { Select } from '@/components/ui/select'
import { useRecordCollection } from '@/lib/record-collection/use-record-collection'
import { RecordCollectionSurface } from '@/components/record-collection/record-collection'
import { CollectionToolbar } from '@/components/record-collection/collection-toolbar'
import {
  projectsProcessesCollectionDescriptor,
  projectsProcessesCatalogActions,
  type CatalogCollectionQuery,
  type CatalogType,
} from '@/components/catalog/catalog-collection-adapter'
import {
  CatalogCollectionActionsProvider,
  type CatalogCollectionActions,
} from '@/components/catalog/catalog-collection-actions'
import '@/components/catalog/catalog-collection.css'

export function ProjectsProcessesPage() {
  const t = useT()
  useDocumentTitle(t('common.docTitle', { page: t('nav.work.projects') }))
  const nameFieldId = useId()
  const controller = useRecordCollection({
    descriptor: projectsProcessesCollectionDescriptor,
    urlMode: 'synced',
    viewerId: null,
    accessRoles: [],
  })
  const query = controller.state.query
  const projection = controller.state.projection

  const [live, setLive] = useState('')
  const announce = useCallback((msg: string) => setLive(msg), [])
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<CatalogType>('project')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')

  const setQuery = (patch: Partial<CatalogCollectionQuery>) =>
    controller.setQuery({ ...query, ...patch })
  const nameOf = (id: string) =>
    controller.state.data?.records.find((r) => r.id === id)?.name ?? ''

  const actions: CatalogCollectionActions = {
    // Unconditionally true, and unlike Objectives that is actually load-bearing here: this route
    // sits behind `RequireCapability workline.manage` (FR-424, untouched by OD-V4-1), so reaching
    // this component IS the capability check. A viewer without it is bounced by the router and
    // never renders this page. Do not "harden" this into a can() call without first removing that
    // route gate — two checks for one rule is how they drift apart.
    canManage: true,
    rename: async (id, name) => {
      await projectsProcessesCatalogActions.rename(id, name)
      announce(t('catalog.announce.renamed', { name }))
      controller.retry()
    },
    archive: async (id) => {
      const name = nameOf(id)
      try {
        await projectsProcessesCatalogActions.setArchived(id, true)
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
        await projectsProcessesCatalogActions.setArchived(id, false)
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
      await projectsProcessesCatalogActions.create(name, newType)
      setNewName('')
      announce(t('catalog.announce.added', { name }))
      controller.setQuery({ ...query, view: 'active', q: '', type: 'all' })
      controller.retry()
    } catch (err) {
      setAddError(err instanceof Error ? err.message : t('catalog.addFailed'))
    } finally {
      setAdding(false)
    }
  }

  const viewLabel = t(query.view === 'archived' ? 'catalog.view.archived' : 'catalog.view.active')

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
          id: 'type',
          label: t('catalog.filter.type'),
          value: query.type,
          options: [
            { value: 'all', label: t('catalog.type.all') },
            { value: 'project', label: t('catalog.type.project') },
            { value: 'process', label: t('catalog.type.process') },
          ],
          onChange: (type) => setQuery({ type: type as CatalogCollectionQuery['type'] }),
        },
      ]}
    />
  )

  return (
    // Census R2 DO-7 (objectives F7, sibling sweep): no bare head count pill — the labeled
    // result-header inside the collection already carries the count.
    <PageFamilyFrame
      family="management"
      title={t('nav.work.projects')}
      jobSentence={t('job.projects')}
    >
      <div className="sr-only" aria-live="polite" role="status">{live}</div>

      {/* The ONE primary create affordance (State-Kit Rule): the inline Add bar with its create-time
          Type field. The head carries no action slot, so there is no duplicate create CTA. */}
      <form className="catalog-create" aria-label={t('catalog.projects.add')} onSubmit={handleAdd}>
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
        {/* Select's own `label` prop renders the established .mk-select__label chrome (12px/500
            muted-foreground, DESIGN.md Label token) — the previous hand-rolled <label> duplicated
            that role at the wrong size (--font-size-mono, 13px) instead of reusing it. */}
        <Select
          label={t('catalog.filter.type')}
          value={newType}
          onChange={(e) => setNewType(e.target.value as CatalogType)}
          disabled={adding}
        >
          <option value="project">{t('catalog.tag.project')}</option>
          <option value="process">{t('catalog.tag.process')}</option>
        </Select>
        <Button type="submit" variant="primary" disabled={adding} aria-busy={adding}>
          {adding ? t('catalog.projects.adding') : t('catalog.projects.add')}
        </Button>
        {addError && <p className="catalog-create__error" role="alert">{addError}</p>}
      </form>

      <CatalogCollectionActionsProvider actions={actions}>
        <div className="record-collection-view record-collection-view--list">
          <RecordCollectionSurface
            controller={controller}
            resultHeader={{
              collectionLabel: t('nav.work.projects'),
              viewLabel,
              count: projection ? projection.visibleRecords.length : null,
            }}
            controls={toolbar}
            empty={{ title: t('catalog.projects.empty.title'), copy: t('catalog.projects.empty.copy') }}
            filteredEmpty={{ title: t('catalog.filteredEmpty.title'), clear: () => setQuery({ view: 'active', q: '', type: 'all' }) }}
            error={{ message: t('catalog.projects.error'), retry: () => controller.retry() }}
            loadingLabel={t('catalog.projects.loading')}
          />
        </div>
      </CatalogCollectionActionsProvider>
    </PageFamilyFrame>
  )
}
