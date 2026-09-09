// Objectives collection (route /work/objectives).
// Objectives remain readable to every authenticated organisation member. The existing objective
// manage capability only controls the head Create door and record overflow mutations; the
// collection itself is never replaced by a permission redirect.
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/auth/use-auth'
import { can } from '@/lib/capabilities'
import { useT } from '@/i18n/use-t'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useIsDesktop } from '@/shell/use-is-desktop'
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
import { useCatalogRecordOverlay } from '@/components/catalog/use-catalog-record-overlay'
import '@/components/catalog/catalog-collection.css'

export function ObjectivesPage() {
  const t = useT()
  const isDesktop = useIsDesktop()
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
  const canManage = can(auth.status === 'authenticated' ? auth.viewer.accessRoles : [], 'objective.manage')
  const [mobileOptionsOpen, setMobileOptionsOpen] = useState(false)
  const [live, setLive] = useState('')
  const announce = useCallback((message: string) => setLive(message), [])
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
    setNewName('')
    setNewBusinessUnitId(null)
    setAddError('')
    setDraftOpen(true)
  }
  const cancelDraft = () => {
    if (adding) return
    setDraftOpen(false)
    setAddError('')
  }
  const handleDraftSubmit = async () => {
    const name = newName.trim()
    if (!name) {
      setAddError(t('catalog.nameRequired'))
      return
    }
    setAdding(true)
    setAddError('')
    try {
      if (newBusinessUnitId) await objectivesCatalogActions.create(name, newBusinessUnitId)
      else await objectivesCatalogActions.create(name)
      setDraftOpen(false)
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
      .then((options) => { if (live) setBusinessUnitOptions(options) })
      .catch(() => { /* The create field remains optional; the record read still stays truthful. */ })
    return () => { live = false }
  }, [businessUnitOptions.length, draftOpen])

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
    ...(canManage ? {
      createDraft: {
        kind: 'objective',
        open: draftOpen,
        name: newName,
        businessUnitId: newBusinessUnitId,
        businessUnitOptions: businessUnitOptions.map((unit) => ({ value: unit.id, label: unit.name })),
        adding,
        error: addError,
        onNameChange: (name: string) => { setNewName(name); if (addError) setAddError('') },
        onBusinessUnitChange: (id) => { setNewBusinessUnitId(id); if (addError) setAddError('') },
        onSubmit: () => { void handleDraftSubmit() },
        onCancel: cancelDraft,
      } satisfies CatalogCreateDraft,
    } : {}),
  }

  const viewLabel = query.coverage === 'has-tasks'
    ? t('catalog.coverage.withTasks')
    : query.coverage === 'no-tasks'
      ? t('catalog.coverage.noTasks')
      : t('catalog.coverage.all')
  const statusLabel = query.view === 'all' ? t('catalog.includeArchived') : query.view === 'archived' ? t('catalog.view.archived') : t('catalog.view.active')
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
        display: query.view === 'all' ? t('catalog.includeArchived') : t('catalog.view.active'),
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
      action={canManage ? <Button variant="primary" onClick={openDraft}>{t('catalog.objectives.add')}</Button> : undefined}
    >
      <div className="sr-only" aria-live="polite" role="status">{live}</div>
      <CatalogCollectionActionsProvider actions={actions}>
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
