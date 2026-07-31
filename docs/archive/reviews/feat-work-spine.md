# Review ledger — feat/work-spine (Work-spine v1: objective→task cascade everyone-surface)

Spec: `docs/specs/work-spine.spec.md` (Accepted, OD-WS-1). Plan: `docs/plans/2026-07-06-work-spine.md`.
Build: gpt-5.4 (6 commits on `feat/work-spine`, held). Review: gpt-5.4 cross-family (2026-07-06) +
Director. **Battery verdict: FIX-THEN-SHIP — fixes must land before merge.** No Critical / exploit found;
`can()` core verified sound.

## Gates (no-stack, run by reviewer)
- typecheck PASS · eslint --max-warnings=0 PASS · vitest (work-spine units) PASS.
- pgTAP / e2e NOT re-run during review (owner live-testing the shared local stack) — verified by reading + by the build's own run.

## Verdicts
- spec: FIX-THEN-SHIP — no non-goal breach; conformance incomplete (fixes below).
- code-quality: FIX-THEN-SHIP — good reuse (`useCascadeCatalogs`/`GroupHeaderRow`/`WorkloadCaption`/`db/*`; `buildLadder` only new helper); one fragile-coupling fix.
- security: FIX-THEN-SHIP — `can()` verified: SECURITY INVOKER, STABLE, `search_path=''`, resolves from `current_access_roles()` (no parallel identity path), `role_capabilities` read-only to authenticated, write policies retain `org_id` seam + no DELETE, fail-closed tested, no new DEFINER. **No exploit found.** Gap = pgTAP doesn't fully PROVE the signed RLS matrix.
- design (Director visual lens): DEFERRED to post-fix (phone-first split is a required fix; render-verify after).

## Required fixes (before merge)
1. **Phone-first split** on `cascade-page.tsx` — grouped cards on phone, dense table on desktop (NFR-300). Currently always nested tables.
2. **i18n** the hardcoded strings (e.g. "Overdue") through the catalog (FR-321/NFR-301).
3. **Expand pgTAP `73_mos_work_spine_rls.sql`** to fully prove AC-310..315: UPDATE paths (both tables), admin CAN write work_lines, full cross-org read+write matrix. (Security-critical — the authz rewrite must be fully proven.)
4. **Ladder resilience** — `build-ladder.ts` drops branches when objective/work_line catalogs are empty/late, so linked tasks can vanish. Degrade to fallback labels; never drop tasks (non-blocking reuse contract).
5. **e2e fixtures** — `AC-305-cascade.spec.ts` seeds via service-role `/pg/query`; replace with stable seeded fixtures.

Minor (non-blocking): `CascadePage` monolithic/inline-heavy (consider split); client `capabilities.ts` will drift if grants become dynamic (documented TODO — keep non-authoritative).

## Status
**Fixes LANDED on `feat/work-spine` (fix-then-ship round, 2026-07-06).** All 5 required fixes applied;
`shared.can()` security model + the write-policy SQL untouched (only the pgTAP that proves them expanded).

Re-run battery (full, by Director on the local stack — `supabase db reset` first):
- **pgTAP** `supabase test db` → **Files=74, Tests=481, PASS**. `73_mos_work_spine_rls.sql` expanded to
  `plan(23)` fully proving AC-310..315 (UPDATE paths both tables, admin CAN write work_lines, full
  cross-org read+write matrix for both tables); 51/58/72 still green.
- **typecheck** `npm run typecheck` → 0 errors. **eslint** `npx eslint src --max-warnings=0` → 0/0.
- **vitest** `CI=true npm test` → **233 files / 2246 tests PASS** (incl. new phone-branch + ladder-resilience units).
- **build** `npm run build` → OK (pre-existing chunk-size warning only).
- **e2e** `npx playwright test e2e/AC-305-cascade.spec.ts` → **1 passed**. Seeding moved to stable
  global-setup fixtures (`e2e/fixtures/tasks.ts` → `CASCADE`); the AC-305 journey + goal assertions unchanged.

Remaining (non-blocking, deferred): `CascadePage` split-out; client `capabilities.ts` dynamic-grants TODO.
Director phone render-verify folded into the AC-305 e2e (phone viewport, grouped cards). Ready for merge to `dev`.
