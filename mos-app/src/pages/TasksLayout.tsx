import { Outlet, useMatch } from 'react-router-dom'
import TasksPage from './TasksPage'

/**
 * Parent layout for the nested /tasks routes (ADR-0007).
 *
 * PR-A is a behavior-preserving routing refactor: the three former sibling
 * routes (`tasks`, `tasks/new`, `tasks/:taskId`) become a parent `/tasks` route
 * with `new` and `:taskId` as children, so a later PR can keep the table mounted
 * beside a drawer (split-view). For PR-A the *rendered output stays identical*:
 * at `/tasks` the table renders full-page; at `/tasks/new` or `/tasks/:taskId`
 * only the matched child renders (the full-page create/detail, exactly as today).
 * The split-view that renders the table AND the child together arrives in PR-B.
 */
export default function TasksLayout() {
  const isNew = useMatch('/tasks/new')
  const isDetail = useMatch('/tasks/:taskId')
  const childActive = Boolean(isNew || isDetail)

  // A child route is active → render only the child (identical to the old
  // sibling-route behavior). Otherwise render the list.
  if (childActive) return <Outlet />
  return <TasksPage />
}
