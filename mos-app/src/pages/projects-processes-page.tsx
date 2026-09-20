// Projects & Processes collection (route /work/projects).
//
// The collection is intentionally collection-first: the head owns the single Create door, the
// view axis is All / Projects / Processes, and every row is one real Project/Process record door.
// Record mutations stay in the record overflow; the collection keeps its scan grammar free of
// per-row action clusters and relation accordions.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useT } from '@/i18n/use-t'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useSearchParams } from 'react-router-dom'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useIsNarrow } from '@/shell/use-is-narrow'
import { ViewOptionsDisclosure } from '@/shell/view-options-disclosure'
import { Button } from '@/components/ui/button'
import { useRecordCollection } from '@/lib/record-collection/use-record-collection'
import { RecordCollectionSurface } from '@/components/record-collection/record-collection'
import {
  CollectionToolbar,
  CollectionToolbarSearchField,
  type CollectionToolbarSearch,
} from '@/components/record-collection/collection-toolbar'
import {
  projectsProcessesCollectionDescriptor,
  projectsProcessesCatalogActions,
  type CatalogCollectionQuery,
  type CatalogType,
} from '@/components/catalog/catalog-collection-adapter'
import {
  CatalogCollectionActionsProvider,
  type CatalogCollectionActions,
  type CatalogCreateDraft,
} from '@/components/catalog/catalog-collection-actions'
import { CatalogCreateForm } from '@/components/catalog/catalog-create-form'
import { useCatalogRecordOverlay } from '@/components/catalog/use-catalog-record-overlay'
import { getBusinessUnits, type BusinessUnitOption } from '@/lib/db/directory'
import { allowedBusinessUnitIds, canCreateForScope, useWorkWriteAuthority } from '@/components/catalog/use-work-write-authority'
import '@/components/catalog/catalog-collection.css'

export function ProjectsProcessesPage() {
  const t = useT()
  const isDesktop = useIsDesktop()
  const isNarrow = useIsNarrow()
  const [searchParams, setSearchParams] = useSearchParams()
  useDocumentTitle(t('common.docTitle', { page: t('nav.work.projects') }))
  const controller = useRecordCollection({
    descriptor: projectsProcessesCollectionDescriptor,
    urlMode: 'synced',
    viewerId: null,
    accessRoles: [],
  })
  const query = controller.state.query
  const projection = controller.state.projection
  const { scopes } = useWorkWriteAuthority()
  const worklineBuIds = allowedBusinessUnitIds('work-line', scopes)
  const canManage = canCreateForScope('work-line', scopes)
  const businessUnitRequired = worklineBuIds !== null
  const [mobileOptionsOpen, setMobileOptionsOpen] = useState(false)
  const [live, setLive] = useState('')
  const announce = useCallback((message: string) => setLive(message), [])
  const createButtonRef = useRef<HTMLButtonElement>(null)
  const [draftOpen, setDraftOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<CatalogType>('project')
  const [newObjectiveId, setNewObjectiveId] = useState<string | null>(null)
  const [newBusinessUnitId, setNewBusinessUnitId] = useState<string | null>(null)
  const [businessUnitOptions, setBusinessUnitOptions] = useState<BusinessUnitOption[]>([])
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')

  const setQuery = (patch: Partial<CatalogCollectionQuery>) => {
    controller.setQuery({ ...query, ...patch })
  }
  const nameOf = (id: string) =>
    controller.state.data?.records.find((record) => record.id === id)?.name ?? ''

  const openDraft = () => {
    if (!canManage) return
    setNewName('')
    setNewType('project')
    setNewObjectiveId(null)
    setNewBusinessUnitId(worklineBuIds?.length === 1 ? worklineBuIds[0] : null)
    setAddError('')
    setDraftOpen(true)
  }
  // `?create=1` is the global + menu's way in. It opens the draft once the viewer's create
  // authority has loaded, and leaves the URL without the intent so a reload does not reopen it.
  const createIntent = searchParams.get('create') === '1'
  useEffect(() => {
    if (!createIntent || !canManage) return
    openDraft()
    const next = new URLSearchParams(searchParams)
    next.delete('create')
    setSearchParams(next, { replace: true })
    // openDraft also reads the allowed Business Unit ids, which arrive in the same authority load
    // that turns canManage true — so the closure this effect captures is never stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createIntent, canManage])

  const cancelDraft = () => {
    if (adding) return
    setDraftOpen(false)
    createButtonRef.current?.focus()
    setAddError('')
  }
  const handleDraftSubmit = async () => {
    if (!canManage) return
    const name = newName.trim()
    if (!name) {
      setAddError(t('catalog.nameRequired'))
      return
    }
    if (businessUnitRequired && !newBusinessUnitId) {
      setAddError(t('catalog.record.businessUnitRequired'))
      return
    }
    setAdding(true)
    setAddError('')
    try {
      const metadata = { objectiveId: newObjectiveId, businessUnitId: newBusinessUnitId }
      if (metadata.objectiveId || metadata.businessUnitId) await projectsProcessesCatalogActions.create(name, newType, metadata)
      else await projectsProcessesCatalogActions.create(name, newType)
      setDraftOpen(false)
      createButtonRef.current?.focus()
      setNewName('')
      announce(t('catalog.announce.added', { name }))
      controller.setQuery({ ...query, view: 'active', q: '', type: 'all' })
      controller.retry()
    } catch (error) {
      setAddError(error instanceof Error ? error.message : t('catalog.addFailed'))
    } finally {
      setAdding(false)
    }
  }

  useEffect(() => {
    if (!draftOpen || businessUnitOptions.length > 0) return
    let live = true
    void getBusinessUnits()
      .then((options) => {
        if (!live) return
        const visible = worklineBuIds ? options.filter((option) => worklineBuIds.includes(option.id)) : options
        setBusinessUnitOptions(visible)
        if (worklineBuIds?.length === 1 && !visible.some((option) => option.id === worklineBuIds[0])) {
          setNewBusinessUnitId(null)
        }
      })
      .catch(() => { /* The create field remains optional; the catalog read stays available. */ })
    return () => { live = false }
  }, [businessUnitOptions.length, draftOpen, worklineBuIds])

  const draft: CatalogCreateDraft = {
    kind: 'work-line',
    open: draftOpen,
    name: newName,
    type: newType,
    objectiveId: newObjectiveId,
    objectiveOptions: controller.state.data?.context.objectiveOptions ?? [],
    businessUnitId: newBusinessUnitId,
    businessUnitOptions: businessUnitOptions.map((unit) => ({ value: unit.id, label: unit.name })),
    businessUnitRequired,
    adding,
    error: addError,
    onNameChange: (name) => { setNewName(name); if (addError) setAddError('') },
    onTypeChange: setNewType,
    onObjectiveChange: (id) => { setNewObjectiveId(id); if (addError) setAddError('') },
    onSubmit: () => { void handleDraftSubmit() },
    onCancel: cancelDraft,
  }

  const actions: CatalogCollectionActions = {
    canManage,
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
      } catch (error) {
        announce(t('catalog.announce.archiveFailed', { name }))
        throw error
      }
    },
    unarchive: async (id) => {
      const name = nameOf(id)
      try {
        await projectsProcessesCatalogActions.setArchived(id, false)
        announce(t('catalog.announce.restored', { name }))
        controller.retry()
      } catch (error) {
        announce(t('catalog.announce.restoreFailed', { name }))
        throw error
      }
    },
    createDraft: draft,
  }

  const viewLabel = query.type === 'project'
    ? t('catalog.type.project')
    : query.type === 'process'
      ? t('catalog.type.process')
      : t('catalog.type.all')
  const statusLabel = query.view === 'all'
    ? t('catalog.view.activeAndArchived')
    : query.view === 'archived'
      ? t('catalog.view.archivedOnly')
      : t('catalog.view.activeOnly')
  const search: CollectionToolbarSearch = {
    label: t('catalog.searchLabel'),
    placeholder: t('catalog.searchPlaceholder'),
    value: query.q,
    onChange: (q) => setQuery({ q }),
  }
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
        value: query.type,
        options: [
          { value: 'all', label: t('catalog.type.all') },
          { value: 'project', label: t('catalog.type.project') },
          { value: 'process', label: t('catalog.type.process') },
        ],
        onChange: (type) => setQuery({ type }),
      }}
      hideViewsLabel
      search={search}
      hideSearchRow={!isDesktop}
      filters={[{
        id: 'status',
        label: t('catalog.filter.status'),
        display: statusLabel,
        popover: {
          choices: [{
            key: 'include-archived',
            label: t('catalog.includeArchived'),
            checked: query.view === 'all',
            onChange: (checked) => setQuery({ view: checked ? 'all' : 'active' }),
          }],
        },
      }]}
    />
  )
  const mobileSummary = `${viewLabel}${query.view !== 'active' ? ` · ${statusLabel}` : ''}`
  const controls = isDesktop ? toolbar : (
    <>
      <CollectionToolbarSearchField search={search} />
      <ViewOptionsDisclosure
        open={mobileOptionsOpen}
        onToggle={() => setMobileOptionsOpen((open) => !open)}
        onClose={() => setMobileOptionsOpen(false)}
        label={t('catalog.viewAndFilters')}
        summary={mobileSummary}
        hasActiveFilters={query.type !== 'all' || query.view !== 'active' || query.q.trim() !== ''}
        panelId="mobile-work-options-panel"
        className="collection-mobile-options"
        triggerClassName="collection-mobile-options-trigger"
        summaryClassName="collection-mobile-options-summary"
        chevronClassName="collection-mobile-options-chevron"
        panelClassName="collection-mobile-options-panel"
      >
        {toolbar}
      </ViewOptionsDisclosure>
    </>
  )
  const overlay = useCatalogRecordOverlay({
    collectionKind: 'work-line',
    onCollectionChanged: controller.retry,
  })

  return (
    <PageFamilyFrame
      family="management"
      title={t('nav.work.projects')}
      jobSentence={t('job.projects')}
      action={canManage && !isNarrow ? <Button ref={createButtonRef} variant="primary" onClick={openDraft}>{t('catalog.projects.add')}</Button> : undefined}
    >
      <div className="sr-only" aria-live="polite" role="status">{live}</div>
      <CatalogCollectionActionsProvider actions={actions}>
        {draftOpen && (
          <div className="record-collection-view catalog-create-panel">
            <CatalogCreateForm draft={draft} />
          </div>
        )}
        <div className={overlay.splitOpen ? 'record-split' : undefined}>
          <div className="record-collection-view record-collection-view--list">
            <RecordCollectionSurface
              controller={controller}
              resultHeader={{
                collectionLabel: t('nav.work.projects'),
                viewLabel,
                count: projection ? projection.visibleRecords.length : null,
              }}
              controls={controls}
              onOpenRecord={overlay.onOpenRecord}
              keepBodyWhenEmpty={draftOpen}
              empty={{ title: t('catalog.projects.empty.title'), copy: t('catalog.projects.empty.copy') }}
              archivedEmpty={query.view === 'archived' && controller.state.data?.records.every((row) => row.archived_at === null)
                ? { title: t('catalog.archivedEmpty.title') } : undefined}
              filteredEmpty={{
                title: t('catalog.filteredEmpty.title'),
                clear: () => setQuery({ view: 'active', q: '', type: 'all' }),
              }}
              error={{ message: t('catalog.projects.error'), retry: () => controller.retry() }}
              loadingLabel={t('catalog.projects.loading')}
            />
          </div>
          {overlay.slot}
        </div>
      </CatalogCollectionActionsProvider>
    </PageFamilyFrame>
  )
}
