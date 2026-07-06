// E2E task fixtures for P2-1c tests. Fixed UUIDs so specs can reference them directly.
// Seeded idempotently by global-setup.ts before all e2e runs.

// AC-305 (Work-spine v1 cascade) — the everyone-cascade e2e journey. Fixed UUIDs; seeded
// idempotently by global-setup.ts (deterministic clean slate, AFTER the mos.tasks wipe) so the spec
// needs NO runtime /pg/query seeding. VIEWER (Cahya) is R+A on all three tasks so the "Mine"
// line-of-sight keeps all three visible. Mirrors the ladder AC-305 asserts (linked / objective-
// unlinked / no-work-line).
export const CASCADE = {
  orgId: '10000000-0000-0000-0000-000000000001',
  businessUnitId: '20000000-0000-0000-0000-000000000014', // Retail Ops (live team BU)
  viewerPersonId: '40000000-0000-0000-0000-000000000001',  // Cahya Cafe (VIEWER)
  objective: {
    id: 'c3050000-0000-0000-0000-000000000010',
    name: 'Operational Excellence',
  },
  workLine: {
    id: 'c3050000-0000-0000-0000-000000000001',
    name: 'Daily IG Content',
    type: 'process',
  },
  tasks: {
    linked: {
      id: 'c3050000-0000-0000-0000-000000000101',
      title: 'AC-305 linked task',
      objectiveId: 'c3050000-0000-0000-0000-000000000010',
      workLineId: 'c3050000-0000-0000-0000-000000000001',
    },
    unlinked: {
      id: 'c3050000-0000-0000-0000-000000000102',
      title: 'AC-305 unlinked task',
      objectiveId: null,
      workLineId: 'c3050000-0000-0000-0000-000000000001',
    },
    noWorkLine: {
      id: 'c3050000-0000-0000-0000-000000000103',
      title: 'AC-305 no work line task',
      objectiveId: 'c3050000-0000-0000-0000-000000000010',
      workLineId: null,
    },
  },
}

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
