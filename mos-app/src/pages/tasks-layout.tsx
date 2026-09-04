import { useCallback, useEffect, useState } from 'react'
import { Outlet, useParams, useMatch, useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { TasksWorkspace } from '@/components/tasks/tasks-workspace'
import { useIsSplitWidth } from '@/shell/use-is-split-width'
import { isTaskPageMode } from '@/components/tasks/task-page-mode'
import { TaskSurface } from '@/components/tasks/task-surface'
import { useSetBreadcrumbTitle } from '@/shell/breadcrumb-title'
import { RecordPageChrome } from '@/shell/record-page-chrome'
import { useT } from '@/i18n/use-t'
import type { TaskListRow, TaskStatus } from '@/lib/db/tasks.types'
import type { TaskDrawerOutletContext } from '@/components/tasks/task-drawer'

/**
 * Split-view shell for /work/tasks (ADR-0007, PR-B). The table persists while the
 * detail/create surface mounts beside it via <Outlet> (push/squash, no scrim):
 *   /work/tasks         → table full width (.split.nodrawer), no drawer
 *   /work/tasks/:id     → table + that task's drawer open
 *   /work/tasks/new     → table + drawer in create mode
 * GAP-2 (OD-REDESIGN-91 #7): expand-in-place is retired — the drawer holds a fixed
 * width; "Open full page" is the one escalation to the standalone canonical page.
 */
export function TasksLayout() {
  const t = useT()
  const { taskId } = useParams()
  const isNew = useMatch('/work/tasks/new')
  const location = useLocation()
  const navigationType = useNavigationType()
  // The live push/squash split starts only where all decision-column floors fit; below it
  // row activation navigates to the standalone record page.
  const isSplit = useIsSplitWidth()

  // R6 (owner review r2): whether this render is the standalone full canonical page. Computed BEFORE
  // useDocumentTitle so the split shell can DEFER the title (pass null) to TaskRecordPage, which owns
  // the record name. Child effects run before parent effects, so without this the parent's generic
  // "Tasks — Gordi MOS" would clobber the child's record title on every mount.
  const pageMode = isTaskPageMode({ taskId, isNew: Boolean(isNew), state: location.state, navigationType }) && Boolean(taskId)
  useDocumentTitle(pageMode ? null : t('common.docTitle', { page: t('nav.tasks') }))

  // Resize promotion (round-4 fix): a drawer opened at/above the split threshold stays mounted
  // if the viewport later shrinks below it — the record id doesn't change, so the route alone
  // never re-evaluates isTaskPageMode. Without this, `.split` keeps rendering table + drawer
  // side by side below the width that fits them, overflowing `.tasks-scroll`. When isSplit flips
  // false while a record is open in the drawer (not already the standalone page), promote it to
  // the record PAGE the same way a row click below the threshold would: navigate to
  // `/work/tasks/:id` with the "Open full page" state, keeping the collection's other query
  // params and dropping `record` (the panel-open marker some Tasks doors use).
  const navigate = useNavigate()
  useEffect(() => {
    if (isSplit || pageMode || !taskId || isNew) return
    const next = new URLSearchParams(location.search)
    next.delete('record')
    const search = next.toString()
    navigate(
      { pathname: `/work/tasks/${taskId}`, search: search ? `?${search}` : '' },
      { state: { taskSurface: 'page' } },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSplit])

  // Optimistic status overrides fed by the open drawer (AC-103) so the table row
  // reflects an inline status change without a full reload.
  const [statusOverrides, setStatusOverrides] = useState<Map<string, TaskStatus>>(new Map())
  const onTaskChanged = useCallback((task: TaskListRow) => {
    setStatusOverrides(prev => {
      const next = new Map(prev)
      next.set(task.id, task.status)
      return next
    })
  }, [])

  // C2/I3: create + archive have no optimistic-row channel, so bump a refresh key
  // the table watches — it refetches the list so a just-created row appears (and
  // becomes the selected row) and an archived row leaves the default list + the
  // count updates, both WITHOUT a reload.
  const [refreshKey, setRefreshKey] = useState(0)
  const onTaskCreated = useCallback(() => setRefreshKey(k => k + 1), [])
  const onTaskArchived = useCallback(() => setRefreshKey(k => k + 1), [])
  const outletContext: TaskDrawerOutletContext = { onTaskChanged, onTaskCreated, onTaskArchived }

  // OD-63 / Rule 4: a direct/new-tab/refresh (or the explicit "Open full page"
  // escalation) renders the SAME record as a standalone full canonical page — NOT
  // inside the table+drawer shell. An in-list click (in-app SPA navigation) keeps
  // the split drawer for fast triage. Detection lives in task-page-mode (jsdom has
  // no PerformanceNavigationTiming, so direct-render unit tests stay in panel mode;
  // the e2e proves the real-browser direct-open branch). All hooks run above so this
  // branch is a plain conditional return, not a conditional hook.
  if (pageMode && taskId) {
    return <TaskRecordPage taskId={taskId} />
  }

  const drawerOpen = Boolean(taskId) || Boolean(isNew)

  // TasksWorkspace now supplies its own PageFamilyFrame (family=workspace), which
  // owns the <main> landmark — no outer PageFrame here (that would double the frame).
  return (
    <TasksWorkspace
      selectedId={taskId ?? null}
      drawerOpen={drawerOpen}
      splitLayout={isSplit}
      statusOverrides={statusOverrides}
      refreshKey={refreshKey}
      onTaskChanged={onTaskChanged}
      drawerSlot={<Outlet context={outletContext} />}
    />
  )
}

/**
 * Standalone full canonical record page (OD-63). Reuses the ONE TaskSurface
 * renderer at width="full" / presentation="page" — no table shell, no drawer
 * chrome (expand/close belong to the split drawer). The shell breadcrumb reads
 * the resolved title so it shows "Work · Tasks · <title>" (mirrors TaskDrawer's
 * BreadcrumbTitleSync). Reachable only by a direct/new-tab/refresh of
 * `/work/tasks/:id` or the drawer's "Open full page" escalation.
 */
function TaskRecordPage({ taskId }: { taskId: string }) {
  const t = useT()
  const isSplit = useIsSplitWidth()
  const navigate = useNavigate()
  const location = useLocation()
  const [title, setTitle] = useState<string | null>(null)
  // Empty string before the title resolves keeps the crumb at "Work · Tasks";
  // once resolved it pushes the task title; on unmount the hook clears it.
  useSetBreadcrumbTitle(title ?? '')
  // R6-P2 (owner review r2): reflect the open record in document.title (the browser tab / history).
  // TasksLayout deferred the generic title (passed null) precisely so this record name wins.
  useDocumentTitle(t('common.docTitle', { page: title ? `${title} · ${t('tasks.title')}` : t('tasks.label.task') }))
  // R6(a) (owner verbatim: "blow up to full page, there should be resize back to drawer. currently
  // just back to table"): the inverse of "Open full page". Re-opens the SAME task in the split drawer
  // over the table by navigating to the same URL with the panel page-state (isTaskPageMode → false),
  // preserving the collection's query string. A PUSH, so browser Back from the drawer still works.
  const collapseToSplit = () => navigate(
    { pathname: `/work/tasks/${taskId}`, search: location.search },
    { state: { taskSurface: 'panel' } },
  )
  // V3 focused-record family, P1-2 (Luna: record identity behind a generic "Task" page head +
  // utility strip at y≈234, vs E7's compact chrome at y≈124). The RecordViewer's own identity
  // header (overline + resolved title) IS the page heading now — PageFamilyFrame's generic
  // PageHead ("Task" + a job-sentence paragraph) is hidden (hideHead) so there is exactly ONE
  // heading on the page, and TaskSurface's record-chrome row collapses to a single compact
  // Back-affordance-and-actions strip immediately above the identity (see TaskSurface.css
  // .record-chrome). identityHeadingLevel is 1 (not 2): the shell no longer owns an h1 here, so
  // the RecordViewer heading is promoted to be that h1.
  return (
    <PageFamilyFrame
      family="focused-record"
      title={t('tasks.label.task')}
      jobSentence="Review and update this task."
      state={title ? 'default' : 'loading'}
      hideHead
    >
      {/* H3 (Luna floor): the record-page Back lives at the SHARED record-page seam now (mirror of
          the Signal page), not baked into TaskSurface — so every record kind returns the same way.
          TaskSurface's own utility strip is suppressed (showPanelUtility={false}); its record-scoped
          Ask Deputy + the collapse-to-split affordance ride this shared chrome instead. */}
      <RecordPageChrome
        backTo={{ pathname: '/work/tasks', search: location.search }}
        backLabel={t('tasks.title')}
        deputyDraft={title ? t('assistant.askAbout.task', { title }) : null}
        trailing={isSplit ? (
          <button
            type="button"
            className="record-page-collapse"
            aria-label={t('tasks.backToSplit')}
            title={t('tasks.backToSplit')}
            onClick={collapseToSplit}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" />
            </svg>
          </button>
        ) : null}
      />
      <TaskSurface
        taskId={taskId}
        mode="view"
        width="full"
        presentation="page"
        showPanelUtility={false}
        onTitleResolved={setTitle}
        onCollapseToSplit={collapseToSplit}
        identityHeadingLevel={1}
      />
    </PageFamilyFrame>
  )
}
