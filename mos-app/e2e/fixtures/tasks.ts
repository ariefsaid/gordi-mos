// E2E task fixtures for P2-1c tests. Fixed UUIDs so specs can reference them directly.
// Seeded idempotently by global-setup.ts before all e2e runs.

export const TASKS = {
  // A task where VIEWER (Cahya, 40000000-…-0001) is Accountable — used for AC-091 archive journey.
  VIEWER_ACCOUNTABLE: {
    id: 'a0000000-0000-0000-0000-000000000001',
    title:  'E2E Archiveable Task',
    // BU: Cafe Ops – General (20000000-…-0001); R and A = VIEWER (40000000-…-0001)
    businessUnitId:         '20000000-0000-0000-0000-000000000001',
    responsiblePersonId:    '40000000-0000-0000-0000-000000000001',
    accountablePersonId:    '40000000-0000-0000-0000-000000000001',
    orgId:                  '10000000-0000-0000-0000-000000000001',
  },
}
