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
  CatalogRelationTask,
  CatalogRelationsKind,
  CatalogRenderGroup,
  CatalogRow,
} from './catalog-collection-adapter'
import { useCatalogCollectionActions } from './catalog-collection-actions'
import { CatalogRowActions } from './catalog-row-actions'
import './catalog-collection.css'

/** OD-V4-1 H4 cap: an objective/work_line with dozens of tasks gets a bounded inline list, not a
    runaway DOM — the row's disclosure is a real drill-in for the common case, not a full report. */
const MAX_RELATIONS_TASKS = 12

/** Where a capped branch's overflow goes: Tasks grouped by Objective, every branch in full. */
const OVERFLOW_TASKS_DOOR = '/work/tasks?group=objective'

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

  const groupedTaskIds = new Set(relations.groups.flatMap((group) => (group.tasks ?? []).map((task) => task.id)))
  const ungroupedTasks = relations.tasks.filter((task) => !groupedTaskIds.has(task.id))

  /**
   * A capped list AND its way through (#204 finding 1). The cap without a door is the defect: task
   * 13 of a branch simply vanished, and the branches most likely to run long are the synthetic ones
   * — `No Project/Process` and `(Unlinked)` — which hold exactly the work nobody is tracking. So
   * the door is emitted by the same helper that does the capping; it cannot be forgotten for one
   * branch and remembered for another. It lands on Tasks grouped by Objective, where every branch,
   * synthetic included, is rendered in full.
   */
  const taskList = (tasks: readonly CatalogRelationTask[], branchName: string) => {
    const overflow = tasks.length - MAX_RELATIONS_TASKS
    return (
      <ul className="catalog-collection__relations-list">
        {tasks.slice(0, MAX_RELATIONS_TASKS).map((task) => (
          <li key={task.id}>
            <Link className="catalog-collection__relations-link" to={`/work/tasks/${task.id}`}>{task.title}</Link>
          </li>
        ))}
        {overflow > 0 && (
          <li>
            <Link
              className="catalog-collection__relations-link"
              to={OVERFLOW_TASKS_DOOR}
              /* Several branches can overflow in one panel, so the visible copy repeats. The
                 accessible name carries the branch, or a screen-reader user gets a list of
                 identical "+3 more" links with no way to tell them apart. */
              aria-label={t('catalog.relations.moreTasksAria', { count: String(overflow), name: branchName })}
            >
              {t('catalog.relations.moreTasks', { count: String(overflow) })}
            </Link>
          </li>
        )}
      </ul>
    )
  }

  return (
    <div className="catalog-collection__relations-body">
      {hasGroups && (
        <div className="catalog-collection__relations-group">
          <span className="catalog-collection__relations-heading">
            {t(kind === 'objective' ? 'catalog.relations.heading.children' : 'catalog.relations.heading.parents')}
          </span>
          <ul className="catalog-collection__relations-list">
            {relations.groups.map((group) => (
              <li key={group.id} className="catalog-collection__relations-branch">
                {/* Name + count on their own line, the branch's Tasks nested beneath. The default
                    row is a flex ROW, so without this the nested list became a third column and
                    a branch's tasks read as if they belonged to the branch beside it (390px). */}
                <span className="catalog-collection__relations-branch-head">
                  {/* A synthetic branch is not a record, so it gets no record door — linking one
                      into the catalog search would hunt for a name that does not exist there. */}
                  {group.synthetic ? (
                    <span className="catalog-collection__relations-link catalog-collection__relations-link--inert">
                      {group.name}
                    </span>
                  ) : (
                    <Link className="catalog-collection__relations-link" to={{ pathname: groupPath, search: `?q=${encodeURIComponent(group.name)}` }}>
                      {group.name}
                    </Link>
                  )}
                  <span className="catalog-collection__relations-count">
                    {t('catalog.relations.progress', { done: String(group.done), total: String(group.total) })}
                  </span>
                </span>
                {group.tasks && group.tasks.length > 0 && taskList(group.tasks, group.name)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {ungroupedTasks.length > 0 && (
        <div className="catalog-collection__relations-group">
          <span className="catalog-collection__relations-heading">{t('catalog.relations.heading.tasks')}</span>
          {taskList(ungroupedTasks, t('catalog.relations.heading.tasks'))}
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
        const progress = !archivedView ? context.progressById.get(row.id) : undefined

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
            <CatalogRowActions
              name={row.name}
              archived={archivedView}
              canManage={actions.canManage}
              disabled={busy}
              onRename={() => startEdit(row)}
              onArchive={() => void runArchive(row, true)}
              onUnarchive={() => void runArchive(row, false)}
            />
            {progress && (
              <span className="catalog-collection__trace" data-testid="catalog-progress">
                {t('catalog.relations.progress', { done: String(progress.done), total: String(progress.total) })}
              </span>
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
