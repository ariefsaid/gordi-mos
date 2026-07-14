/**
 * job-sentences — Rule 1 registry (one job per rail item).
 *
 * Ported verbatim from the convergence `fixtures.js` `jobSentences` (the
 * Experience Contract Rule-1 table is the authority). `jobSentences` holds the
 * 12 destination/child rows; `jobKeyForPath` resolves a route to its owning
 * job-sentence i18n key (Work child / record → owning type — convergence
 * `contextRow` resolution), so the ContextRow can render the active route's job
 * sentence via `t(jobKeyForPath(pathname))`.
 *
 * No such registry existed in the app before Step 2 (spec §3.1) — genuinely new.
 */
import type { MessageKey } from '@/i18n/messages'

/**
 * The 12 convergence job sentences, keyed by destination/child id. These mirror
 * the i18n `job.*` strings 1:1 (the i18n catalog is the rendered source; this
 * registry is the verbatim port for sanity + Rule-1 traceability).
 */
export const jobSentences = {
  home: 'What needs my attention right now?',
  work: 'Find and do the work I own or my Team owns.',
  tasks: 'Find and do the work I own or my Team owns.',
  signals: 'Search and revisit the Signals your Teams have shared.',
  projects: 'Govern the Processes and Projects that generate the work.',
  objectives: 'Track the Objectives the org committed to.',
  events: "See what's happening around our outlets and when.",
  money: 'Trust the financial figures and act on money exceptions.',
  inbox: 'Triage what asked for me and return to its source.',
  cafe: "Run today's café floor work — openings, checks, stock, shifts.",
  ecommerce: "Fulfil today's online orders against the right stock.",
  roastery: 'Record today’s roasts, yield, and transfers truthfully.',
} as const

/** The union of registry ids. */
export type JobKey = keyof typeof jobSentences

const SEG_TO_JOB: Record<string, MessageKey> = {
  home: 'job.home',
  work: 'job.work',
  tasks: 'job.tasks',
  signals: 'job.signals',
  projects: 'job.projects',
  objectives: 'job.objectives',
  events: 'job.events',
  money: 'job.money',
  inbox: 'job.inbox',
  cafe: 'job.cafe',
  ecommerce: 'job.ecommerce',
  roastery: 'job.roastery',
  profile: 'job.profile',
}

/**
 * Resolve a pathname to its owning job-sentence i18n key (MessageKey).
 *
 * Mirrors the convergence `contextRow` jobKey resolution:
 *  - `/work/:child` → the child's job key (signals/tasks/projects/objectives);
 *    `/work/tasks/:id` (a record) → the owning `tasks` job key.
 *  - `/work` (bare) → `tasks` (Work parent default child).
 *  - top-level destinations + Modules → their own job key.
 *  - `/profile` → `job.profile`.
 *  - unknown (e.g. `/admin/*`, 404) → `job.home` (the always-present fallback).
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
  if (SEG_TO_JOB[root]) return SEG_TO_JOB[root]

  // Unknown route → home fallback (context row is minimal on stubs / admin).
  return 'job.home'
}
