// Typed catalog LIST presentation (V3 catalog grammar — Projects & Processes / Objectives).
// One quiet list of small catalog rows. Each active row carries its name, an optional Project/Process
// type tag, its FR-422 up/down trace, and the inline management actions (Rename / Archive) that ARE
// the row's primary interaction — a catalog row has no record panel, so it never invents one. The
// Archived view swaps those for Unarchive. Mutations are read from the page via the actions context.
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { TextInput } from '@/components/ui/text-input'
import { Tag } from '@/components/ui/tag'
import { useT } from '@/i18n/use-t'
import type { CollectionPresentationProps, CollectionProjection } from '@/lib/record-collection/types'
import type {
  CatalogCollectionContext,
  CatalogCollectionQuery,
  CatalogRenderGroup,
  CatalogRow,
} from './catalog-collection-adapter'
import { useCatalogCollectionActions } from './catalog-collection-actions'
import './catalog-collection.css'

type CatalogListProps = CollectionPresentationProps<
  CatalogRow,
  CatalogCollectionQuery,
  CollectionProjection<CatalogRow, CatalogRenderGroup>,
  CatalogCollectionContext,
  string
>

export function CatalogListPresentation({ query, projection, context }: CatalogListProps) {
  const t = useT()
  const actions = useCatalogCollectionActions()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editError, setEditError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const archivedView = query.view === 'archived'
  const viewLabel = t(archivedView ? 'catalog.view.archived' : 'catalog.view.active')

  function startEdit(row: CatalogRow) {
    setEditingId(row.id)
    setEditName(row.name)
    setEditError('')
  }

  async function submitRename(event: React.FormEvent, id: string) {
    event.preventDefault()
    const name = editName.trim()
    if (!name) {
      setEditError(t('catalog.nameRequired'))
      return
    }
    setBusyId(id)
    setEditError('')
    try {
      await actions.rename(id, name)
      setEditingId(null)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : t('catalog.saveFailed'))
    } finally {
      setBusyId(null)
    }
  }

  async function runArchive(row: CatalogRow, archive: boolean) {
    setBusyId(row.id)
    try {
      await (archive ? actions.archive(row.id) : actions.unarchive(row.id))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <ul className="catalog-collection__list" aria-label={viewLabel}>
      {projection.visibleRecords.map((row) => {
        const busy = busyId === row.id
        const typeTag = row.type ? (
          <Tag color={row.type === 'project' ? 'blue' : 'sand'}>
            {t(row.type === 'project' ? 'catalog.tag.project' : 'catalog.tag.process')}
          </Tag>
        ) : null
        const trace = !archivedView ? context.traceById.get(row.id) : undefined

        if (editingId === row.id) {
          return (
            <li key={row.id} className="catalog-collection__row">
              <form className="catalog-collection__edit" onSubmit={(e) => submitRename(e, row.id)}>
                <div className="catalog-collection__edit-field">
                  <TextInput
                    label=""
                    aria-label={t('catalog.renameAria', { name: row.name })}
                    value={editName}
                    onChange={(e) => {
                      setEditName(e.target.value)
                      if (editError) setEditError('')
                    }}
                    error={!!editError}
                    fullWidth
                    autoFocus
                    disabled={busy}
                  />
                </div>
                <Button type="submit" variant="primary" disabled={busy} aria-busy={busy}>
                  {t('common.save')}
                </Button>
                <Button type="button" variant="ghost" disabled={busy} onClick={() => setEditingId(null)}>
                  {t('common.cancel')}
                </Button>
                {editError && (
                  <span role="alert" className="catalog-collection__error">{editError}</span>
                )}
              </form>
            </li>
          )
        }

        return (
          <li
            key={row.id}
            className={`catalog-collection__row${archivedView ? ' catalog-collection__row--archived' : ''}`}
          >
            <div className="catalog-collection__identity">
              <span className="catalog-collection__name">{row.name}</span>
              {typeTag}
            </div>
            <div className="catalog-collection__actions">
              {archivedView ? (
                <Button
                  variant="ghost"
                  disabled={busy}
                  aria-label={t('catalog.unarchiveAria', { name: row.name })}
                  onClick={() => void runArchive(row, false)}
                >
                  {t('catalog.unarchive')}
                </Button>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    aria-label={t('catalog.renameAria', { name: row.name })}
                    onClick={() => startEdit(row)}
                  >
                    {t('catalog.rename')}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    aria-label={t('catalog.archiveAria', { name: row.name })}
                    onClick={() => void runArchive(row, true)}
                  >
                    {t('catalog.archive')}
                  </Button>
                </>
              )}
            </div>
            {trace && (
              <span className="catalog-collection__trace" data-testid="catalog-trace">{trace}</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
