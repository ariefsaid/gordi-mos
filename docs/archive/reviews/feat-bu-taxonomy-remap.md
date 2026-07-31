# Review battery — `feat/bu-taxonomy-remap` (ADR-0019 D1 / OD-IA-1 BU=team re-mapping)

**Scope:** `git diff dev...feat/bu-taxonomy-remap` — migration `20260705000002` (stable `code` +
`archived_at` columns, 6 team BUs, FK re-point across roles/tasks/log_entries/kitchen_logs, legacy
soft-retire), pgTAP 63 (19 assertions), seed updates, `kitchen-logs.ts` code-based BU resolution,
`directory.ts` archived filter.
**Run:** 2026-07-04. Build sonnet (worktree, escalated correctly on the by-name coupling; Director
expanded scope atomically); reviews opus ×2 (spec+CQ combined lens, security).

### Machine-readable verdicts (parsed by `pre-merge-check.sh`)
- spec: SHIP — matches ADR-0019 D1/OD-IA-1 byte-for-byte (mapping table verified against the oracle); HR ambiguity flagged not guessed; dual-path org guard verified BOTH directions empirically (no-op on fresh reset, effective on pre-existing DB — staging push will remap real data).
- code-quality: SHIP — fix-then-ship with all 4 items FIXED (`1ae8381`): archived BUs filtered from every picker (`getBusinessUnits` + red-first test); DOWN trim-bug corrected (`regexp_replace`, character-set trim would have corrupted names); stale test literal; DOWN spelled out executable-as-written.
- design: SHIP — no visual surface changed (DB layer + a test-file literal only; the picker fix removes stale options, no new UI); render impact nil.
- security: PASS — org seam holds; `code` uniqueness org-scoped (live-probed: two orgs sharing `retail_ops` each resolve their own row); hardcoded UUIDs collision-free; single-transaction atomicity (no partial-apply window). The one Medium FIXED (`1ae8381`): every re-point UPDATE now carries an explicit `org_id` predicate (was safe only emergently). Pre-existing gap (BU FK not same-org-guarded on tasks/roles writes) is NOT this branch's — tracked as a spawned follow-up task; close before any second tenant.

## Evidence
- **375 pgTAP green** (19 new: 6 team codes, zero legacy FK references, persona role-chains resolve,
  org seam, live `retail_ops` target) · **1908 Vitest green** · typecheck + ESLint clean.
- Build-time Director catch: `resolveKitchenBuId` resolved by display name — the remap would have
  broken every kitchen log submission. Fixed at the class level (stable `code` column; name lookups
  eliminated repo-wide, verified by grep + the reviewer's independent sweep).
- Old→new mapping recorded in the migration header; owner action noted: re-assign genuinely-HR people
  via admin once HR staffing exists ("Finance and People"→Finance; HR seeded empty).

## Follow-ups (tracked, non-blocking)
- Spawned task: same-org guard for `business_unit_id` on `mos.tasks` + `shared.roles` writes
  (pre-existing; gates multi-org onboarding, not this merge).
- Owner-gated deploy tail: staging `db push` now queues THREE migrations (margin read-model,
  user_views, BU remap) — remap is the one that mutates existing staging rows; the dual-path guard
  is verified for exactly that case.

## Sign-off
- All lenses green; every blocking + Medium finding fixed and re-verified in-battery.
- Remaining before merge: `bash scripts/pre-merge-check.sh` exit 0.
