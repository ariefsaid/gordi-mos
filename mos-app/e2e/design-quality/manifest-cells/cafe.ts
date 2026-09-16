import type { ManifestCellInput } from './types.ts'

export const CAFE_CELL_INPUTS = [
  ['cafe-opening-default-desktop', {
    area: 'cafe-opening', journey: 'cafe-opening', route: '/mos/cafe', fixture: 'VIEWER',
    viewport: 'desktop-1440x900', theme: 'light', language: 'en', state: 'default', status: 'covered',
  }],
  ['cafe-opening-default-phone', {
    area: 'cafe-opening', journey: 'cafe-opening', route: '/mos/cafe', fixture: 'VIEWER',
    viewport: 'phone-390x844', theme: 'light', language: 'en', state: 'default', status: 'covered',
  }],
  ['cafe-plan-default-desktop', {
    area: 'cafe-wip', journey: 'cafe-plan', route: '/mos/cafe/plan', fixture: 'BAR_MEMBER',
    viewport: 'desktop-1440x900', theme: 'light', language: 'en', state: 'default', status: 'covered',
  }],
  ['cafe-plan-default-phone', {
    area: 'cafe-wip', journey: 'cafe-plan', route: '/mos/cafe/plan', fixture: 'BAR_MEMBER',
    viewport: 'phone-390x844', theme: 'light', language: 'en', state: 'default', status: 'covered',
  }],
  ['cafe-log-default-desktop', {
    area: 'cafe-wip', journey: 'cafe-log', route: '/mos/cafe', fixture: 'BAR_MEMBER',
    viewport: 'desktop-1440x900', theme: 'light', language: 'en', state: 'default', status: 'covered',
  }],
  ['cafe-log-default-phone', {
    area: 'cafe-wip', journey: 'cafe-log', route: '/mos/cafe', fixture: 'BAR_MEMBER',
    viewport: 'phone-390x844', theme: 'light', language: 'en', state: 'default', status: 'covered',
  }],
  ['cafe-review-default-phone', {
    area: 'cafe-wip', journey: 'cafe-review', route: '/mos/cafe/review', fixture: 'BAR_SUPERVISOR',
    viewport: 'phone-390x844', theme: 'light', language: 'en', state: 'default', status: 'covered',
  }],
  ['cafe-stock-default-desktop', {
    area: 'cafe-wip', journey: 'cafe-stock', route: '/mos/cafe/stock', fixture: 'VIEWER',
    viewport: 'desktop-1440x900', theme: 'light', language: 'en', state: 'default', status: 'covered',
  }],
  ['cafe-stock-default-phone', {
    area: 'cafe-wip', journey: 'cafe-stock', route: '/mos/cafe/stock', fixture: 'VIEWER',
    viewport: 'phone-390x844', theme: 'light', language: 'en', state: 'default', status: 'covered',
  }],
  ['cafe-pushes-default-desktop', {
    area: 'cafe-wip', journey: 'cafe-pushes', route: '/mos/cafe/pushes', fixture: 'ADMIN',
    viewport: 'desktop-1440x900', theme: 'light', language: 'en', state: 'default', status: 'covered',
  }],
  ['cafe-pushes-default-phone', {
    area: 'cafe-wip', journey: 'cafe-pushes', route: '/mos/cafe/pushes', fixture: 'ADMIN',
    viewport: 'phone-390x844', theme: 'light', language: 'en', state: 'default', status: 'covered',
  }],
  ['cafe-opening-assigned-phone', {
    area: 'cafe-opening', journey: 'cafe-opening', route: '/mos/cafe', fixture: 'BAR_MEMBER',
    viewport: 'phone-390x844', theme: 'light', language: 'en', state: 'assigned-location', status: 'covered', primary: true,
    stateContract: {
      setup: [],
      assertion: { selector: '[data-testid="cafe-opening-location"]' },
      negativeAssertion: { selector: '[data-testid="cafe-location-chooser"]' },
    },
  }],
  ['cafe-opening-switch-desktop', {
    area: 'cafe-opening', journey: 'cafe-opening', route: '/mos/cafe', fixture: 'VIEWER',
    viewport: 'desktop-1440x900', theme: 'dark', language: 'id', state: 'multi-location-switch', status: 'untested', primary: true,
    note: 'No read-only audit fixture currently has two eligible Café locations.',
  }],
  ['cafe-opening-missing-compact', {
    area: 'cafe-opening', journey: 'cafe-opening', route: '/mos/cafe', fixture: 'ORPHAN',
    viewport: 'compact-1024x768', theme: 'light', language: 'en', state: 'missing-assignment', status: 'untested',
    note: 'ORPHAN is stopped by the authentication boundary; no linked no-location fixture exists.',
  }],
  ['cafe-opening-failed-phone', {
    area: 'cafe-opening', journey: 'cafe-opening', route: '/mos/cafe', fixture: 'VIEWER',
    viewport: 'phone-390x844', theme: 'dark', language: 'id', state: 'failed-configuration-load', status: 'covered',
  }],
  // The two faces of a plan are decided by the stream the fixture lands on, so neither needs a
  // setup action: a producing stream gets the quantity cells, a receiving-only one gets the
  // read view and no capture at all. Each cell's assertion is the other's negative, so landing
  // on the wrong stream reports itself instead of passing as the face it is not.
  ['cafe-plan-producing-phone', {
    area: 'cafe-wip', journey: 'cafe-plan', route: '/mos/cafe/plan', fixture: 'BAR_MEMBER',
    viewport: 'phone-390x844', theme: 'light', language: 'en', state: 'producing', status: 'covered', primary: true,
    // `.pqf` is the planned-quantity field itself, which the plan renders at every width. The
    // table cell that holds it on desktop, `.kp-cell-qty`, does not exist on a phone, where the
    // plan is cards — and the state being asserted is "this stream produces", not "it produces
    // at one width".
    stateContract: {
      setup: [],
      assertion: { selector: '.pqf' },
      negativeAssertion: { selector: '.kp-receiving-only-title' },
    },
  }],
  ['cafe-plan-receiving-desktop', {
    area: 'cafe-wip', journey: 'cafe-plan', route: '/mos/cafe/plan', fixture: 'AUDIT_RECEIVING_ONLY',
    viewport: 'desktop-1440x900', theme: 'dark', language: 'id', state: 'receiving-only', status: 'untested', primary: true,
    note: 'AUDIT_RECEIVING_ONLY is named here but no provisioned identity exists for it, so the cell cannot be signed in as. The contract below is verified against the rendered receiving-only face and becomes runnable the moment that identity is provisioned.',
    stateContract: {
      setup: [],
      assertion: { selector: '.kp-receiving-only-title' },
      negativeAssertion: { selector: '.pqf' },
    },
  }],
  ['cafe-log-producing-compact', {
    area: 'cafe-wip', journey: 'cafe-log', route: '/mos/cafe', fixture: 'BAR_MEMBER',
    viewport: 'compact-1024x768', theme: 'light', language: 'en', state: 'producing', status: 'covered', primary: true,
    // A producing stream gets the capture form; a receiving-only one gets a read view and no
    // form at all. BAR_MEMBER has one assigned location, so the root IS the capture surface
    // (DD-MVP-17) and no location has to be chosen first.
    stateContract: {
      setup: [],
      assertion: { selector: '.kl-form .kl-submit' },
      negativeAssertion: { selector: '.kl-receiving-only' },
    },
  }],
  ['cafe-log-loading-phone', {
    area: 'cafe-wip', journey: 'cafe-log', route: '/mos/cafe', fixture: 'BAR_MEMBER',
    viewport: 'phone-390x844', theme: 'dark', language: 'id', state: 'loading', status: 'covered', primary: true,
  }],
  ['cafe-log-success-desktop', {
    area: 'cafe-wip', journey: 'cafe-log', route: '/mos/cafe', fixture: 'BAR_MEMBER',
    viewport: 'desktop-1440x900', theme: 'light', language: 'en', state: 'success', status: 'covered', primary: true,
  }],
  ['cafe-review-authorized-desktop', {
    area: 'cafe-wip', journey: 'cafe-review', route: '/mos/cafe/review', fixture: 'BAR_SUPERVISOR',
    viewport: 'desktop-1440x900', theme: 'light', language: 'en', state: 'default', status: 'covered', primary: true,
  }],
  ['cafe-review-denied-phone', {
    area: 'cafe-wip', journey: 'cafe-review', route: '/mos/cafe/review', fixture: 'BAR_MEMBER',
    viewport: 'phone-390x844', theme: 'dark', language: 'id', state: 'denied', status: 'untested',
    note: 'The denied face renders correctly, but the focus and control drivers require at least one interactive control inside main and a permission face has none.', primary: true,
    // Untested, deliberately: the denied face renders correctly, but the focus and control
    // drivers require at least one interactive control inside `main` and a permission face
    // has none. Covering it needs the drivers to tolerate a control-less face, not a
    // different contract.
  }],
  ['cafe-stock-empty-compact', {
    area: 'cafe-wip', journey: 'cafe-stock', route: '/mos/cafe/stock', fixture: 'VIEWER',
    viewport: 'compact-1024x768', theme: 'light', language: 'en', state: 'empty', status: 'untested', primary: true,
    note: 'No seeded production stream has an empty stock list: all seven return 32 rows, so no read-only drive reaches this state. The page-level "choose a stream" face is a missing selection, not an empty list.',
  }],
  ['cafe-stock-validation-phone', {
    area: 'cafe-wip', journey: 'cafe-stock', route: '/mos/cafe/stock', fixture: 'VIEWER',
    viewport: 'phone-390x844', theme: 'dark', language: 'id', state: 'validation', status: 'covered', primary: true,
  }],
  ['cafe-pushes-authorized-desktop', {
    area: 'cafe-wip', journey: 'cafe-pushes', route: '/mos/cafe/pushes', fixture: 'ADMIN',
    viewport: 'desktop-1440x900', theme: 'light', language: 'en', state: 'success', status: 'covered', primary: true,
  }],
  ['cafe-pushes-denied-phone', {
    area: 'cafe-wip', journey: 'cafe-pushes', route: '/mos/cafe/pushes', fixture: 'BAR_MEMBER',
    viewport: 'phone-390x844', theme: 'dark', language: 'id', state: 'denied', status: 'untested',
    note: 'The denied face renders correctly, but the focus and control drivers require at least one interactive control inside main and a permission face has none.', primary: true,
    // Untested, deliberately: the denied face renders correctly, but the focus and control
    // drivers require at least one interactive control inside `main` and a permission face
    // has none. Covering it needs the drivers to tolerate a control-less face, not a
    // different contract.
  }],
  ['cafe-pushes-error-compact', {
    area: 'cafe-wip', journey: 'cafe-pushes', route: '/mos/cafe/pushes', fixture: 'ADMIN',
    viewport: 'compact-1024x768', theme: 'light', language: 'en', state: 'error', status: 'covered',
  }],
  ['cafe-wip-long-content', {
    area: 'cafe-wip', journey: 'cafe-plan', route: '/mos/cafe/plan', fixture: 'BAR_MEMBER',
    viewport: 'desktop-1440x900', theme: 'dark', language: 'id', state: 'long-content', status: 'covered',
  }],
] satisfies readonly ManifestCellInput[]
