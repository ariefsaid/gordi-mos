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

// ── AC-204 — the Objective → Project/Process → Task roll-up and drill ─────────────────────────
//
// Deterministic on purpose: this journey asserts exact COUNTS, so it cannot read whatever the
// database happens to hold. Every row below is e2e-namespaced (`4e20…`, names prefixed `AC204`)
// and cleared + re-seeded by global-setup, so a rerun asserts the same numbers as the first run.
//
// The shape covers all four branch cases at once:
//   OBJECTIVE → LAUNCH        real Objective, real Project      (2 tasks, 1 Done, both ADMIN's)
//   OBJECTIVE → (no work line) real Objective, synthetic branch  (1 task, ADMIN's)
//   (Unlinked) → LOOSE         synthetic Objective, real Process (1 task, ADMIN's)
//   …plus one task under LAUNCH owned by someone else, so Mine has something to exclude.
//
// Objective totals: 4 tasks, 1 Done for everyone — 3 tasks, 1 Done under Mine.
export const AC204 = {
  orgId:          '10000000-0000-0000-0000-000000000001',
  businessUnitId: '20000000-0000-0000-0000-000000000014', // Retail Ops
  objective:  { id: '4e204000-0000-0000-0000-000000000001', name: 'AC204 Grow revenue' },
  launch:     { id: '4e204000-0000-0000-0000-000000000010', name: 'AC204 Menu launch', type: 'project' },
  loose:      { id: '4e204000-0000-0000-0000-000000000011', name: 'AC204 Loose ends', type: 'process' },
  tasks: {
    /** Under the real Project. Done — the "1" in "1 / 4 done". */
    launchDone:   { id: '4e204000-0000-0000-0000-000000000100', title: 'AC204 Print the menus' },
    /** Under the real Project, carrying NO objective_id — reachable only via the work-line edge. */
    launchOpen:   { id: '4e204000-0000-0000-0000-000000000101', title: 'AC204 Brief the floor' },
    /** Straight off the Objective — the "No Project/Process" branch. */
    directOnObj:  { id: '4e204000-0000-0000-0000-000000000102', title: 'AC204 Sign the lease' },
    /** On a Project/Process with no parent Objective — the "(Unlinked)" branch. */
    orphanLine:   { id: '4e204000-0000-0000-0000-000000000103', title: 'AC204 Chase the invoice' },
    /** Someone else's work under the same Project (a dedicated e2e person, never a dev
     *  persona — a dev persona's workload caption is asserted by other specs). Mine must not
     *  show it. */
    someoneElse:  { id: '4e204000-0000-0000-0000-000000000104', title: 'AC204 Not my task' },
  },
  /** The whole-catalog roll-up (every viewer's work), and the Mine roll-up for ADMIN. */
  counts: { all: { done: 1, total: 4 }, mine: { done: 1, total: 3 } },
} as const
