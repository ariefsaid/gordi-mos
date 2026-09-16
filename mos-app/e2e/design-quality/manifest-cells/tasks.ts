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
    viewport: 'phone-390x844', theme: 'light', language: 'en', state: 'create-draft', status: 'untested',
    note: 'Contract written and verified, held out of the change gate: driving this state for the first time surfaces real defects on a face that has never been measured, and a regression-only gate cannot tell new coverage from new breakage. Covering it belongs with the fixes for what it finds.', primary: true,
    // The phone head has no create door (`showNewTask` is gated on `!isNarrow`): the shell's
    // `+` Action Launcher owns Create task below 920px, so the door is the launcher's row.
    stateContract: {
      setup: [
        { action: 'click', selector: '.mobile-action-launcher' },
        { action: 'click', selector: '#a-task' },
      ],
      assertion: { selector: '.task-card-draft' },
      // The draft is PREPENDED to the first group, so the first card's body stops being the
      // record link it is in `default` — the queue itself stays mounted either way.
      negativeAssertion: { selector: 'article[data-testid="task-card"] >> nth=0 >> a.task-card-link' },
    },
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
    viewport: 'phone-390x844', theme: 'dark', language: 'id', state: 'open-task', status: 'untested',
    note: 'Contract written and verified, held out of the change gate: driving this state for the first time surfaces real defects on a face that has never been measured, and a regression-only gate cannot tell new coverage from new breakage. Covering it belongs with the fixes for what it finds.', primary: true,
    stateContract: {
      setup: [{ action: 'click', selector: 'a.task-card-link' }],
      assertion: { selector: '[data-overlay-host="true"][data-overlay-owner="tasks"]' },
      // `nodrawer` is on the split wrapper exactly while no Task record session is open.
      negativeAssertion: { selector: '.split.nodrawer' },
    },
  }],
  ['tasks-record-desktop-en-light', {
    area: 'tasks', journey: 'tasks-record', route: '/mos/work/tasks', fixture: 'MANAGER',
    viewport: 'desktop-1440x900', theme: 'light', language: 'en', state: 'editable', status: 'untested',
    note: 'Contract written and verified, held out of the change gate: driving this state for the first time surfaces real defects on a face that has never been measured, and a regression-only gate cannot tell new coverage from new breakage. Covering it belongs with the fixes for what it finds.', primary: true,
    stateContract: {
      setup: [{ action: 'click', selector: 'a.task-row-link' }],
      assertion: { selector: '[data-overlay-host="true"][data-overlay-owner="tasks"] .record-field[data-editable="true"] button.record-field__edit' },
      // The permission note is the read-only record face's marker — the face this cell is not.
      negativeAssertion: { selector: '.record-viewer__permission-note' },
    },
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
