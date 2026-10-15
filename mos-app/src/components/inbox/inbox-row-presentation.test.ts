import { describe, expect, it } from 'vitest'
import type { TriageNotificationRow } from './read-handled-semantics'
import { deriveInboxRowPresentation } from './inbox-row-presentation'

function row(overrides: Partial<TriageNotificationRow> = {}): TriageNotificationRow {
  return {
    id: 'n-1',
    severity: 'info',
    title: 'You were mentioned in a Signal',
    body: 'The freezer alarm went off',
    metadata: {},
    read_at: null,
    created_at: '2026-09-09T00:00:00Z',
    ...overrides,
  }
}

describe('deriveInboxRowPresentation', () => {
  it('extracts actor, source type, attention, and the first source line from a Signal mention', () => {
    expect(deriveInboxRowPresentation(row({
      metadata: {
        source: 'mention',
        attention: 'Urgent',
        actor: { id: 'person-cahya', name: 'Cahya' },
        entity: { type: 'signal', id: 'signal-1' },
      },
      body: 'The freezer alarm went off\nInvestigating the grinder.',
    }))).toEqual({
      actorName: 'Cahya',
      entityType: 'signal',
      attention: 'Urgent',
      source: 'mention',
      reason: null,
      isSignalRetraction: false,
      sourceLine: 'The freezer alarm went off',
      fallbackTitle: 'You were mentioned in a Signal',
    })
  })

  it('keeps legacy rows honest when metadata has no actor or entity', () => {
    expect(deriveInboxRowPresentation(row({ title: 'Legacy notification', body: null }))).toEqual({
      actorName: null,
      entityType: 'unknown',
      attention: null,
      source: null,
      reason: null,
      isSignalRetraction: false,
      sourceLine: null,
      fallbackTitle: 'Legacy notification',
    })
  })

  it('extracts the actor and structured reason for a Signal retraction', () => {
    expect(deriveInboxRowPresentation(row({
      title: 'Signal retracted',
      body: 'Duplicate report',
      metadata: {
        source: 'signal_retraction',
        actor: { id: 'person-lead', name: 'Dewi' },
        reason: 'Duplicate report',
        entity: { type: 'signal', id: 'signal-1', route: '/work/signals?record=signal-1' },
      },
    }))).toMatchObject({
      actorName: 'Dewi',
      entityType: 'signal',
      source: 'signal_retraction',
      reason: 'Duplicate report',
      isSignalRetraction: true,
    })
  })
})
