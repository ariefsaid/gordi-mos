import type { ManifestCellInput } from './types.ts'

export const SIGNAL_CELL_INPUTS = [
  ['signals-default-desktop', {
    area: 'signals', journey: 'signals-feed', route: '/mos/work/signals', fixture: 'VIEWER',
    viewport: 'desktop-1440x900', theme: 'light', language: 'en', state: 'default', status: 'covered',
  }],
  ['signals-default-phone', {
    area: 'signals', journey: 'signals-feed', route: '/mos/work/signals', fixture: 'VIEWER',
    viewport: 'phone-390x844', theme: 'light', language: 'en', state: 'default', status: 'covered',
  }],
  ['signals-compose-phone-en-light', {
    area: 'signals', journey: 'signals-compose', route: '/mos/work/signals', fixture: 'BAR_MEMBER',
    viewport: 'phone-390x844', theme: 'light', language: 'en', state: 'composer', status: 'covered', primary: true,
    // Share Signal has no phone head door (the head action is desktop-only): the shell's `+`
    // Action Launcher owns it there.
    stateContract: {
      setup: [
        { action: 'click', selector: '.mobile-action-launcher' },
        { action: 'click', selector: '#a-signal' },
      ],
      assertion: { selector: '[data-testid="signal-composer"] textarea' },
      // The composer's other face — no eligible Team — renders an EmptyState and no body field.
      negativeAssertion: { selector: '[data-testid="signal-composer"] [data-testid="empty-state"]' },
    },
  }],
  ['signals-compose-desktop-id-dark', {
    area: 'signals', journey: 'signals-compose', route: '/mos/work/signals', fixture: 'BAR_MEMBER',
    viewport: 'desktop-1440x900', theme: 'dark', language: 'id', state: 'delivery-failure-retry', status: 'covered', primary: true,
  }],
  ['signals-feed-compact', {
    area: 'signals', journey: 'signals-feed', route: '/mos/work/signals', fixture: 'VIEWER',
    viewport: 'compact-1024x768', theme: 'light', language: 'en', state: 'populated-feed', status: 'covered',
    stateContract: {
      setup: [],
      assertion: { selector: '[data-testid="signal-feed"] [data-signal-id]' },
      negativeAssertion: { selector: '[data-collection-status="empty"]' },
    },
  }],
  ['signals-feed-phone-empty', {
    area: 'signals', journey: 'signals-feed', route: '/mos/work/signals', fixture: 'VIEWER',
    viewport: 'phone-390x844', theme: 'dark', language: 'id', state: 'empty-filter-result', status: 'covered',
    stateContract: {
      setup: [{ action: 'fill', selector: 'input[aria-label="Cari Sinyal"]', value: '__design_audit_no_signal_match__' }],
      assertion: { selector: '[data-collection-status="filtered-empty"]' },
      negativeAssertion: { selector: '[data-testid="signal-feed"] [data-signal-id]' },
    },
  }],
  ['signals-record-desktop', {
    area: 'signals', journey: 'signals-record', route: '/mos/work/signals', fixture: 'BAR_SUPERVISOR',
    viewport: 'desktop-1440x900', theme: 'light', language: 'en', state: 'record-panel', status: 'untested',
    note: 'The record opener is a status-modifier class; this fixture is not guaranteed a signal in that status, so the driver waits out the timeout on a row that never renders.',
    // Untested, deliberately: the opener class exists on this route but `--open` is a status
    // modifier, and this cell's fixture is not guaranteed a signal in that status. The driver
    // waited the full timeout for a row that never rendered. Needs a fixture-independent door,
    // or a fixture that guarantees one open signal.
  }],
  ['signals-retract-phone', {
    area: 'signals', journey: 'signals-record', route: '/mos/work/signals', fixture: 'BAR_MEMBER',
    viewport: 'phone-390x844', theme: 'light', language: 'en', state: 'retract-menu', status: 'covered',
    // The menu itself is reachable read-only — open a Signal, press its overflow trigger — and
    // was verified by hand. The contract is NOT registered: a setup selector that does not
    // resolve blocks for fifteen seconds and then THROWS out of prepareAuditPage, which takes
    // the whole lane down before it writes an artifact. `.home-signal-row` is what the author's
    // own session renders; what BAR_MEMBER sees on this route has not been established, and a
    // cell worth one row is not worth risking every other row in the run on that guess.
  }],
] satisfies readonly ManifestCellInput[]
