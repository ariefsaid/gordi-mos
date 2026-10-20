/**
 * Resolve the active route to its owning job-sentence i18n key for ContextRow.
 */
import type { MessageKey } from '@/i18n/messages'

const SEG_TO_JOB: Record<string, MessageKey> = {
  home: 'job.home',
  work: 'job.work',
  tasks: 'job.tasks',
  signals: 'job.signals',
  events: 'job.events',
  projects: 'job.projects',
  objectives: 'job.objectives',
  money: 'job.money',
  inbox: 'job.inbox',
  cafe: 'job.cafe',
  ecommerce: 'job.ecommerce',
  roastery: 'job.roastery',
  profile: 'job.profile',
  // /admin is a settings surface with its own job key, not Home's.
  admin: 'job.admin',
}

/**
 * Resolve a pathname to its owning job-sentence i18n key (MessageKey).
 *
 * Mirrors the convergence `contextRow` jobKey resolution:
 *  - `/work/:child` → the child's job key (signals/tasks/projects/objectives);
 *    `/work/tasks/:id` (a record) → the owning `tasks` job key.
 *  - `/work` (bare) → `tasks` (Work parent default child).
 *  - top-level destinations + Modules → their own job key.
 *  - `/profile` → `job.profile`; `/admin/*` → `job.admin`.
 *  - unknown (a 404 — the only page an unrecognized route renders) → `job.notFound`
 *    (OD-REDESIGN-91 #42: the 404 owns its own line, no longer borrowing Home's sentence).
 */
export function jobKeyForPath(pathname: string): MessageKey {
  const segments = pathname.replace(/^\/+/, '').split('/').filter(Boolean)
  if (segments.length === 0) return 'job.home'

  const root = segments[0]

  // Work → resolve the child (or the record's owning child).
  if (root === 'work') {
    const child = segments[1]
    if (child && SEG_TO_JOB[child]) return SEG_TO_JOB[child]
    // bare /work, or /work/<unknown> → default Work child = tasks
    return 'job.tasks'
  }

  // Module sub-routes resolve to the module job key (e.g. /cafe/log → job.cafe).
  // Events is a Work child only; the retired root spelling must stay a not-found sentence.
  if (root !== 'events' && SEG_TO_JOB[root]) return SEG_TO_JOB[root]

  // Unknown route → the 404 line (OD-REDESIGN-91 #42). An unrecognized path renders the
  // NotFoundPage, so its context sentence is the 404's own, never Home's borrowed one.
  return 'job.notFound'
}
