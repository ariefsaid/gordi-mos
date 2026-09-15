import type { ManifestCellInput } from './types.ts'

export const INBOX_CELL_INPUTS = [
  ['inbox-default-desktop', {
    area: 'inbox', journey: 'inbox-triage', route: '/mos/inbox', fixture: 'VIEWER',
    viewport: 'desktop-1440x900', theme: 'light', language: 'en', state: 'default', status: 'covered',
  }],
  ['inbox-default-phone', {
    area: 'inbox', journey: 'inbox-triage', route: '/mos/inbox', fixture: 'VIEWER',
    viewport: 'phone-390x844', theme: 'light', language: 'en', state: 'default', status: 'covered',
  }],
  ['inbox-unread-phone', {
    area: 'inbox', journey: 'inbox-triage', route: '/mos/inbox', fixture: 'VIEWER',
    viewport: 'phone-390x844', theme: 'light', language: 'en', state: 'unread', status: 'untested', primary: true,
    note: 'No read-only audit fixture currently guarantees at least one unread Inbox record.',
  }],
  ['inbox-handled-desktop', {
    area: 'inbox', journey: 'inbox-triage', route: '/mos/inbox', fixture: 'VIEWER',
    viewport: 'desktop-1440x900', theme: 'dark', language: 'id', state: 'handled', status: 'untested', primary: true,
    note: 'No read-only audit fixture currently guarantees at least one handled Inbox record.',
  }],
  ['inbox-open-signal-compact', {
    area: 'inbox', journey: 'inbox-triage', route: '/mos/inbox', fixture: 'VIEWER',
    viewport: 'compact-1024x768', theme: 'light', language: 'en', state: 'open-signal', status: 'covered',
  }],
  ['inbox-tombstone-phone', {
    area: 'inbox', journey: 'inbox-triage', route: '/mos/inbox', fixture: 'VIEWER',
    viewport: 'phone-390x844', theme: 'dark', language: 'id', state: 'retracted-tombstone', status: 'covered',
  }],
  ['inbox-task-link-desktop', {
    area: 'inbox', journey: 'inbox-triage', route: '/mos/inbox', fixture: 'VIEWER',
    viewport: 'desktop-1440x900', theme: 'light', language: 'en', state: 'task-link', status: 'covered',
  }],
] satisfies readonly ManifestCellInput[]
