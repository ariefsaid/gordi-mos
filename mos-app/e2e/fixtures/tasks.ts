// E2E task fixtures for P2-1c tests. Fixed UUIDs so specs can reference them directly.
// Seeded idempotently by global-setup.ts before all e2e runs.

export const TASKS = {
  // A task where VIEWER (Cahya, 40000000-…-0001) is Accountable — used for AC-091 archive journey.
  VIEWER_ACCOUNTABLE: {
    id: 'a0000000-0000-0000-0000-000000000001',
    title:  'E2E Archiveable Task',
    // BU: Retail Ops (20000000-…-0014, code=retail_ops) — the live team BU Cafe Ops folded into
    // post-ADR-0019 D1 remap. The legacy Cafe Ops – General BU (…-0001) is archived and must not
    // be referenced by any mos.tasks row (AC-BU-003). R and A = VIEWER (40000000-…-0001).
    businessUnitId:         '20000000-0000-0000-0000-000000000014',
    responsiblePersonId:    '40000000-0000-0000-0000-000000000001',
    accountablePersonId:    '40000000-0000-0000-0000-000000000001',
    orgId:                  '10000000-0000-0000-0000-000000000001',
  },
}
