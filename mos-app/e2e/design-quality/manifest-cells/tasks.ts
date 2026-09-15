import type { ManifestCellInput } from './types.ts'

export const TASK_CELL_INPUTS = [
  ['tasks-default-desktop', {
    area: 'tasks', journey: 'tasks-filter', route: '/mos/work/tasks', fixture: 'VIEWER',
    viewport: 'desktop-1440x900', theme: 'light', language: 'en', state: 'default', status: 'covered',
  }],
  ['tasks-default-phone', {
    area: 'tasks', journey: 'tasks-filter', route: '/mos/work/tasks', fixture: 'VIEWER',
    viewport: 'phone-390x844', theme: 'light', language: 'en', state: 'default', status: 'covered',
  }],
  ['tasks-create-phone-en-light', {
    area: 'tasks', journey: 'tasks-create', route: '/mos/work/tasks', fixture: 'VIEWER',
    viewport: 'phone-390x844', theme: 'light', language: 'en', state: 'create-draft', status: 'covered', primary: true,
  }],
  ['tasks-create-desktop-id-dark', {
    area: 'tasks', journey: 'tasks-create', route: '/mos/work/tasks', fixture: 'VIEWER',
    viewport: 'desktop-1440x900', theme: 'dark', language: 'id', state: 'persistence-success', status: 'covered', primary: true,
  }],
  ['tasks-filter-compact-en-light', {
    area: 'tasks', journey: 'tasks-filter', route: '/mos/work/tasks', fixture: 'VIEWER',
    viewport: 'compact-1024x768', theme: 'light', language: 'en', state: 'filtered-queue', status: 'covered',
    stateContract: {
      setup: [{ action: 'fill', selector: 'input[aria-label="Search tasks"]', value: 'espresso' }],
      assertion: { selector: 'tr.task-row' },
      negativeAssertion: { selector: '[data-collection-status="filtered-empty"]' },
    },
  }],
  ['tasks-record-phone-id-dark', {
    area: 'tasks', journey: 'tasks-record', route: '/mos/work/tasks', fixture: 'VIEWER',
    viewport: 'phone-390x844', theme: 'dark', language: 'id', state: 'open-task', status: 'covered', primary: true,
  }],
  ['tasks-record-desktop-en-light', {
    area: 'tasks', journey: 'tasks-record', route: '/mos/work/tasks', fixture: 'MANAGER',
    viewport: 'desktop-1440x900', theme: 'light', language: 'en', state: 'editable', status: 'covered', primary: true,
  }],
  ['tasks-record-desktop-readonly', {
    area: 'tasks', journey: 'tasks-record', route: '/mos/work/tasks', fixture: 'ORPHAN',
    viewport: 'desktop-1440x900', theme: 'light', language: 'en', state: 'read-only', status: 'covered',
    note: 'Role-correct read-only or denied record face is recorded explicitly.',
  }],
  ['tasks-empty-phone', {
    area: 'tasks', journey: 'tasks-filter', route: '/mos/work/tasks', fixture: 'VIEWER',
    viewport: 'phone-390x844', theme: 'light', language: 'en', state: 'empty-result', status: 'untested',
    note: 'The shared VIEWER fixture has Tasks; a true unfiltered empty fixture is not available.',
  }],
  ['tasks-filtered-empty-phone', {
    area: 'tasks', journey: 'tasks-filter', route: '/mos/work/tasks', fixture: 'VIEWER',
    viewport: 'phone-390x844', theme: 'light', language: 'en', state: 'filtered-empty', status: 'covered',
    stateContract: {
      setup: [
        { action: 'click', selector: '.mobile-task-options-trigger' },
        { action: 'fill', selector: 'input[aria-label="Search tasks"]', value: '__design_audit_no_task_match__' },
      ],
      assertion: { selector: '[data-collection-status="filtered-empty"]' },
      negativeAssertion: { selector: 'tr.task-row' },
    },
  }],
  ['tasks-error-phone', {
    area: 'tasks', journey: 'tasks-record', route: '/mos/work/tasks', fixture: 'VIEWER',
    viewport: 'phone-390x844', theme: 'dark', language: 'id', state: 'save-failure-retry', status: 'covered',
  }],
  ['tasks-long-desktop', {
    area: 'tasks', journey: 'tasks-record', route: '/mos/work/tasks', fixture: 'VIEWER',
    viewport: 'desktop-1440x900', theme: 'light', language: 'id', state: 'long-content', status: 'covered',
  }],
] satisfies readonly ManifestCellInput[]
