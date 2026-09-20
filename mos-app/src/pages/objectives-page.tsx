// Objectives collection (route /work/objectives).
// Objectives remain readable to every authenticated organisation member. The existing objective
// manage capability only controls the head Create door and record overflow mutations; the
// collection itself is never replaced by a permission redirect.
import { useCallback, useRef, useEffect, useState } from 'react'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useSearchParams } from 'react-router-dom'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useIsNarrow } from '@/shell/use-is-narrow'
import { ViewOptionsDisclosure } from '@/shell/view-options-disclosure'
import { Button } from '@/components/ui/button'
import { getBusinessUnits, type BusinessUnitOption } from '@/lib/db/directory'
import { useRecordCollection } from '@/lib/record-collection/use-record-collection'
import { RecordCollectionSurface } from '@/components/record-collection/record-collection'
import {
  CollectionToolbar,
  CollectionToolbarSearchField,
  type CollectionToolbarSearch,
} from '@/components/record-collection/collection-toolbar'
import {
  objectivesCollectionDescriptor,
  objectivesCatalogActions,
  type CatalogCollectionQuery,
} from '@/components/catalog/catalog-collection-adapter'
import {
  CatalogCollectionActionsProvider,
  type CatalogCollectionActions,
  type CatalogCreateDraft,
} from '@/components/catalog/catalog-collection-actions'
import { CatalogCreateForm } from '@/components/catalog/catalog-create-form'
import { useCatalogRecordOverlay } from '@/components/catalog/use-catalog-record-overlay'
import { allowedBusinessUnitIds, canCreateForScope, useWorkWriteAuthority } from '@/components/catalog/use-work-write-authority'
import '@/components/catalog/catalog-collection.css'

export function ObjectivesPage() {
  const t = useT()
  const isDesktop = useIsDesktop()
  const isNarrow = useIsNarrow()
  const [searchParams, setSearchParams] = useSearchParams()
  useDocumentTitle(t('common.docTitle', { page: t('nav.work.objectives') }))
  const controller = useRecordCollection({
    descriptor: objectivesCollectionDescriptor,
    urlMode: 'synced',
    viewerId: null,
    accessRoles: [],
  })
  const query = controller.state.query
  const projection = controller.state.projection
  const auth = useAuth()
  const { scopes } = useWorkWriteAuthority()
  const canManage = auth.status === 'authenticated' && canCreateForScope('objective', scopes)
  const objectiveBuIds = allowedBusinessUnitIds('objective', scopes)
  const businessUnitRequired = objectiveBuIds !== null
  const [mobileOptionsOpen, setMobileOptionsOpen] = useState(false)
  const [live, setLive] = useState('')
  const announce = useCallback((message: string) => setLive(message), [])
  const createButtonRef = useRef<HTMLButtonElement>(null)
  const [draftOpen, setDraftOpen] = useState(false)
  const [newName, setNewName] = useState('')
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
    setNewBusinessUnitId(objectiveBuIds?.length === 1 ? objectiveBuIds[0] : null)
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
    // openDraft reads only state setters and the authority already listed here.
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
      if (newBusinessUnitId) await objectivesCatalogActions.create(name, newBusinessUnitId)
      else await objectivesCatalogActions.create(name)
      setDraftOpen(false)
      createButtonRef.current?.focus()
      setNewName('')
      announce(t('catalog.announce.added', { name }))
      controller.setQuery({ ...query, view: 'active', q: '', coverage: 'all' })
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
        const visible = objectiveBuIds ? options.filter((option) => objectiveBuIds.includes(option.id)) : options
        setBusinessUnitOptions(visible)
        if (objectiveBuIds?.length === 1 && !visible.some((option) => option.id === objectiveBuIds[0])) {
          setNewBusinessUnitId(null)
        }
      })
      .catch(() => { /* The create field remains optional; the record read still stays truthful. */ })
    return () => { live = false }
  }, [businessUnitOptions.length, draftOpen, objectiveBuIds])

  const draft: CatalogCreateDraft = {
    kind: 'objective',
    open: draftOpen,
    name: newName,
    businessUnitId: newBusinessUnitId,
    businessUnitOptions: businessUnitOptions.map((unit) => ({ value: unit.id, label: unit.name })),
    businessUnitRequired,
    adding,
    error: addError,
    onNameChange: (name: string) => { setNewName(name); if (addError) setAddError('') },
    onBusinessUnitChange: (id) => { setNewBusinessUnitId(id); if (addError) setAddError('') },
    onSubmit: () => { void handleDraftSubmit() },
    onCancel: cancelDraft,
  }

  const actions: CatalogCollectionActions = {
    canManage,
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
      } catch (error) {
        announce(t('catalog.announce.archiveFailed', { name }))
        throw error
      }
    },
    unarchive: async (id) => {
      const name = nameOf(id)
      try {
        await objectivesCatalogActions.setArchived(id, false)
        announce(t('catalog.announce.restored', { name }))
        controller.retry()
      } catch (error) {
        announce(t('catalog.announce.restoreFailed', { name }))
        throw error
      }
    },
    ...(canManage ? { createDraft: draft } : {}),
  }

  const viewLabel = query.coverage === 'has-tasks'
    ? t('catalog.coverage.withTasks')
    : query.coverage === 'no-tasks'
      ? t('catalog.coverage.noTasks')
      : t('catalog.coverage.all')
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
        value: query.coverage,
        options: [
          { value: 'all', label: t('catalog.coverage.all') },
          { value: 'has-tasks', label: t('catalog.coverage.withTasks') },
          { value: 'no-tasks', label: t('catalog.coverage.noTasks') },
        ],
        onChange: (coverage) => setQuery({ coverage }),
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
        hasActiveFilters={query.coverage !== 'all' || query.view !== 'active' || query.q.trim() !== ''}
        panelId="mobile-objective-options-panel"
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
    collectionKind: 'objective',
    onCollectionChanged: controller.retry,
  })

  return (
    <PageFamilyFrame
      family="management"
      title={t('nav.work.objectives')}
      jobSentence={t('job.objectives')}
      action={canManage && !isNarrow ? <Button ref={createButtonRef} variant="primary" onClick={openDraft}>{t('catalog.objectives.add')}</Button> : undefined}
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
                collectionLabel: t('nav.work.objectives'),
                viewLabel,
                count: projection ? projection.visibleRecords.length : null,
              }}
              controls={controls}
              onOpenRecord={overlay.onOpenRecord}
              keepBodyWhenEmpty={draftOpen}
              empty={{ title: t('catalog.objectives.empty.title'), copy: t('catalog.objectives.empty.copy') }}
              archivedEmpty={query.view === 'archived' && controller.state.data?.records.every((row) => row.archived_at === null)
                ? { title: t('catalog.archivedEmpty.title') } : undefined}
              filteredEmpty={{
                title: t('catalog.filteredEmpty.title'),
                clear: () => setQuery({ view: 'active', q: '', coverage: 'all' }),
              }}
              error={{ message: t('catalog.objectives.error'), retry: () => controller.retry() }}
              loadingLabel={t('catalog.objectives.loading')}
            />
          </div>
          {overlay.slot}
        </div>
      </CatalogCollectionActionsProvider>
    </PageFamilyFrame>
  )
}
