/** Route ownership for the job-sentence ContextRow. */
import { describe, it, expect } from 'vitest'
import { jobKeyForPath } from './job-sentences'

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
