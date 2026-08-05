// Typed catalog LIST presentation (V3 catalog grammar — Projects & Processes / Objectives).
// One quiet list of small catalog rows. Each active row carries its name, an optional Project/Process
// type tag, its FR-422 up/down trace, and the inline management actions (Rename / Archive) that ARE
// the row's primary interaction — a catalog row has no record panel, so it never invents one. The
// Archived view swaps those for Unarchive. Mutations are read from the page via the actions context.
//
// OD-V4-1 H4: every row ALSO carries a disclosure toggle that expands its bidirectional
// relations — child Projects/Processes for an Objective, parent Objective(s) for a Project/Process,
// and either way the row's own Tasks — each a real <Link> to an existing route (/work/objectives,
// /work/projects, /work/tasks/:id). Not a new cascade page/route (docs/v4-inheritance.md INC-1):
// the relations live on the rows themselves, reusing routes that already exist.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { TextInput } from '@/components/ui/text-input'
import { Tag } from '@/components/ui/tag'
import { useT } from '@/i18n/use-t'
import type { CollectionPresentationProps, CollectionProjection } from '@/lib/record-collection/types'
import type {
  CatalogCollectionContext,
  CatalogCollectionQuery,
  CatalogRelations,
  CatalogRelationsKind,
  CatalogRenderGroup,
  CatalogRow,
} from './catalog-collection-adapter'
import { useCatalogCollectionActions } from './catalog-collection-actions'
import './catalog-collection.css'

/** OD-V4-1 H4 cap: an objective/work_line with dozens of tasks gets a bounded inline list, not a
    runaway DOM — the row's disclosure is a real drill-in for the common case, not a full report. */
const MAX_RELATIONS_TASKS = 12

// The disclosure marker is an SVG chevron, rotated by CSS when open — never a text triangle.
// RI-IXD-1 (src/consistency.regression.test.tsx) fails the suite on a literal triangle character
// anywhere in a non-test .tsx, comments included, so this note names none.

function DisclosureChevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`catalog-collection__disclosure-chevron${expanded ? ' catalog-collection__disclosure-chevron--open' : ''}`}
      width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}

function RelationsPanel({
  relations, kind, t,
}: {
  relations: CatalogRelations
  kind: CatalogRelationsKind
  t: ReturnType<typeof useT>
}) {
  const groupPath = kind === 'objective' ? '/work/projects' : '/work/objectives'
  const hasGroups = relations.groups.length > 0
  const hasTasks = relations.tasks.length > 0

  if (!hasGroups && !hasTasks) {
    return (
      <p className="catalog-collection__relations-empty">
        {t(kind === 'objective' ? 'catalog.relations.empty.objective' : 'catalog.relations.empty.workLine')}
      </p>
    )
  }

  const shownTasks = relations.tasks.slice(0, MAX_RELATIONS_TASKS)
  const overflow = relations.tasks.length - shownTasks.length

  return (
    <div className="catalog-collection__relations-body">
      {hasGroups && (
        <div className="catalog-collection__relations-group">
          <span className="catalog-collection__relations-heading">
            {t(kind === 'objective' ? 'catalog.relations.heading.children' : 'catalog.relations.heading.parents')}
          </span>
          <ul className="catalog-collection__relations-list">
            {relations.groups.map((group) => (
              <li key={group.id}>
                <Link
                  className="catalog-collection__relations-link"
                  to={{ pathname: groupPath, search: `?q=${encodeURIComponent(group.name)}` }}
                >
                  {group.name}
                </Link>
                <span className="catalog-collection__relations-count">({group.taskCount})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {hasTasks && (
        <div className="catalog-collection__relations-group">
          <span className="catalog-collection__relations-heading">{t('catalog.relations.heading.tasks')}</span>
          <ul className="catalog-collection__relations-list">
            {shownTasks.map((task) => (
              <li key={task.id}>
                <Link className="catalog-collection__relations-link" to={`/work/tasks/${task.id}`}>
                  {task.title}
                </Link>
              </li>
            ))}
            {overflow > 0 && (
              <li>
                <Link className="catalog-collection__relations-link" to="/work/tasks">
                  {t('catalog.relations.moreTasks', { count: String(overflow) })}
                </Link>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

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
  // OD-V4-1 H4: one row's relations open at a time (accordion) — a real drill target per row.
  const [expandedId, setExpandedId] = useState<string | null>(null)

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

        // OD-V4-1 H4: the row's real drill target — its bidirectional relations (child
        // Projects/Processes or parent Objective(s), plus its own Tasks), expandable in place.
        const relations = context.relationsById.get(row.id) ?? { groups: [], tasks: [] }
        const expanded = expandedId === row.id
        const relationsPanelId = `catalog-relations-${row.id}`

        return (
          <li
            key={row.id}
            className={`catalog-collection__row${archivedView ? ' catalog-collection__row--archived' : ''}`}
          >
            <button
              type="button"
              className="catalog-collection__disclosure"
              aria-expanded={expanded}
              aria-controls={relationsPanelId}
              /* polish (2026-07-28): the name announced "Show relations for X" even while the
                 panel was open, so a screen-reader user got told to do the thing they had just
                 done. `aria-expanded` alone carries the state; the NAME has to agree with it. */
              aria-label={t(
                expanded ? 'catalog.relations.hideAria' : 'catalog.relations.toggleAria',
                { name: row.name },
              )}
              onClick={() => setExpandedId((current) => (current === row.id ? null : row.id))}
            >
              <DisclosureChevron expanded={expanded} />
            </button>
            <div className="catalog-collection__identity">
              <span className="catalog-collection__name">{row.name}</span>
              {typeTag}
            </div>
            {/* PORT-028: a viewer without the write capability gets the row, its trace and its
                relations — everything that makes the cascade legible — and no write affordance at
                all. Rendering a disabled Rename would be worse than rendering none: it advertises
                a door that is not theirs. Objectives is the surface this can happen on (OD-V4-1
                removed its read gate); Projects/Processes is still route-gated, so its viewers
                always hold the capability and always see these. */}
            {actions.canManage && (
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
            )}
            {trace && (
              <span className="catalog-collection__trace" data-testid="catalog-trace">{trace}</span>
            )}
            {expanded && (
              <div
                id={relationsPanelId}
                className="catalog-collection__relations"
                data-testid="catalog-relations"
              >
                <RelationsPanel relations={relations} kind={context.relationsKind} t={t} />
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
