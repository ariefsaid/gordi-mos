/**
 * job-sentences registry tests — Rule 1 (one job per rail item), Step 2 T2.
 * The registry is ported verbatim from the convergence `fixtures.js` `jobSentences`,
 * and `jobKeyForPath` resolves a route to its owning job-sentence i18n key
 * (Work child / record → owning type — convergence `contextRow` resolution).
 */
import { describe, it, expect } from 'vitest'
import { jobSentences, jobKeyForPath } from './job-sentences'

describe('jobSentences registry', () => {
  it('does not retain a retired Events destination key', () => {
    expect(Object.keys(jobSentences).sort()).toEqual(
      [
        'home', 'work', 'tasks', 'signals', 'projects', 'objectives',
        'money', 'inbox', 'cafe', 'ecommerce', 'roastery',
      ].sort(),
    )
  })

  it('ports the verbatim convergence strings', () => {
    expect(jobSentences.home).toBe('What needs my attention right now?')
    expect(jobSentences.work).toBe('Find and do the work I own or my Team owns.')
    expect(jobSentences.tasks).toBe('Find and do the work I own or my Team owns.')
    expect(jobSentences.signals).toBe('Search and revisit the Signals your Teams have shared.')
    expect(jobSentences.projects).toBe('Govern the Processes and Projects that generate the work.')
    expect(jobSentences.objectives).toBe('Track the Objectives the org committed to.')
    expect(jobSentences.money).toBe('Trust the financial figures and act on money exceptions.')
    // DELIBERATE copy change (Census R2 DO-24(b) · F-INBOX-7): the convergence string
    // "Triage what asked for me…" was ungrammatical — rewritten to plain second person.
    expect(jobSentences.inbox).toBe('Triage what was directed to you and return to its source.')
    expect(jobSentences.cafe).toBe("Run today's café floor work — openings, checks, stock, shifts.")
    expect(jobSentences.ecommerce).toBe("Fulfil today's online orders against the right stock.")
    expect(jobSentences.roastery).toBe('Record today’s roasts, yield, and transfers truthfully.')
  })
})

describe('jobKeyForPath — route → owning job key (Work child / record resolution)', () => {
  it('resolves Work children to their own job key', () => {
    expect(jobKeyForPath('/work/signals')).toBe('job.signals')
    expect(jobKeyForPath('/work/tasks')).toBe('job.tasks')
    expect(jobKeyForPath('/work/projects')).toBe('job.projects')
    expect(jobKeyForPath('/work/objectives')).toBe('job.objectives')
  })

  it('resolves a Work record route to the owning child (tasks)', () => {
    expect(jobKeyForPath('/work/tasks/123')).toBe('job.tasks')
    expect(jobKeyForPath('/work/tasks/new')).toBe('job.tasks')
  })

  it('resolves bare /work to the tasks job key (Work parent default child)', () => {
    expect(jobKeyForPath('/work')).toBe('job.tasks')
  })

  it('resolves top-level destination routes to their job key', () => {
    expect(jobKeyForPath('/')).toBe('job.home')
    expect(jobKeyForPath('/work/events')).toBe('job.events')
    expect(jobKeyForPath('/events')).toBe('job.notFound')
    expect(jobKeyForPath('/money')).toBe('job.money')
    expect(jobKeyForPath('/money/detail')).toBe('job.money')
    expect(jobKeyForPath('/inbox')).toBe('job.inbox')
  })

  it('resolves Module routes to their job key', () => {
    expect(jobKeyForPath('/cafe')).toBe('job.cafe')
    expect(jobKeyForPath('/cafe/log')).toBe('job.cafe')
    expect(jobKeyForPath('/ecommerce')).toBe('job.ecommerce')
    expect(jobKeyForPath('/roastery')).toBe('job.roastery')
  })

  it('resolves /profile to the profile job key', () => {
    expect(jobKeyForPath('/profile')).toBe('job.profile')
  })

  it('resolves /admin/* to the admin job key (not Home’s fallback)', () => {
    expect(jobKeyForPath('/admin/people')).toBe('job.admin')
    expect(jobKeyForPath('/admin')).toBe('job.admin')
  })

  // OD-REDESIGN-91 #42: an unrecognized route renders the 404 page, so it now owns its own
  // job-sentence line (job.notFound) instead of borrowing Home's ("What needs my attention…").
  it('resolves a genuinely unknown route (the 404) to its own line, not Home’s', () => {
    expect(jobKeyForPath('/unknown-xyz')).toBe('job.notFound')
    expect(jobKeyForPath('/unknown-xyz')).not.toBe('job.home')
  })
})
