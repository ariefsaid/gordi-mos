# Review ledger — feat/p2.1-db-side-aggregate

P2.1 — `mos.aggregate_compiled(jsonb)` DB-side aggregate RPC + executor wiring (T34 / AC-P2-RT-006).
Closes the P1 truncation carry-in so `SHOW_USER_VIEWS` can un-gate. Contract fixed verbatim in
`docs/plans/2026-07-05-port-p2-panel-runtime.md` Phase J (T34).

Diff scope: `git diff origin/dev..HEAD` — 2 commits, 4 files (1 migration + 1 pgTAP + executor wiring
+ executor tests). No UI change.

## Verdicts

- spec: PASS — Director, 2026-07-05; AC-P2-RT-006 (aggregate over full predicate, not capped) is the binding contract from the P2 plan; the pgTAP test proves it with 600 rows > the 500 cap.
- code-quality: FIX-THEN-SHIP — code-quality-reviewer, 2026-07-05; I1 (whitelist drift cross-ref + comment) + I2 (bom_coverage_pct decision documented) + I3 (`degraded` signal) — **all fixed in `fc63947`**.
- security: FIX-THEN-SHIP — security-auditor, 2026-07-05; **no SQL-injection vector found** (the central claim for the first dynamic-builder function in the repo); M1 (grant/revoke) + M2 (hint reflection) + L1 (injection-attempt pgTAP tests) — **all fixed in `fc63947`**.
- design: PASS — Director, 2026-07-05; no UI change in this slice (schema + RPC + executor wiring only); the renderer consumes the new optional `degraded` field defensively (no visual change).

## Gates

| Gate | Status |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` (`--max-warnings=0`) | PASS |
| `npm test` (Vitest) | PASS — 229 files, 2214 tests |
| `supabase test db` (pgTAP) | PASS — 72 files, 449 tests |
| `npm run build` | PASS |

## Decision

MERGE to `dev`. No Critical/High; all Important + Medium findings fixed; the central no-injection
claim is traced and regression-tested. Stacks on PR #88 (P3a).

---

## Spec review — Director

**Verdict: PASS**

The P2 plan (`docs/plans/2026-07-05-port-p2-panel-runtime.md:529-531`, Phase J T34) fixes the contract verbatim:

> **T34** — `mos.aggregate_compiled(jsonb) RETURNS table` RPC + executor wiring … ACs: (new) AC-P2-RT-006 (aggregate over full predicate, not capped). Verify: pgTAP `aggregate_compiled.test.sql` (sum over 10k rows == uncapped total) + Vitest executor test.

- **AC-P2-RT-006 (pgTAP)**: `supabase/tests/71_mos_aggregate_compiled.sql` test 2 seeds 600 rows (> the 500 in-memory cap) and asserts `sum(clean_revenue) == count × 100` over the FULL predicate — the load-bearing proof. An in-memory reduction capped at 500 would have returned ≤ 50000; the RPC returns the true total.
- **Item 6 (truncated aggregate is a lower bound)**: resolved — the aggregate path runs DB-side uncapped, returns `truncated: false`.
- **Item 7 (orderBy discarded by the in-memory reduction)**: resolved — ORDER BY applies to the real reduced rows server-side.
- **RLS isolation**: pgTAP test 12 — a cross-org caller aggregates 0 rows under SECURITY INVOKER.
- **Second trust boundary**: pgTAP tests 6-9 — non-whitelisted entity / non-numeric agg column / filter column outside allow-set / missing required time range all rejected with SQLSTATE 22023.
- **Vitest executor wiring**: 3 new cases — RPC happy path with `truncated:false`; single-row no-group mapping; RPC-error → in-memory fallback with `truncated:true` + `degraded:'aggregate-fallback'`. Plus a happy-path `degraded === undefined` assertion.

The contract is met at the correct layer (pgTAP for the SQL/RLS contracts; Vitest for the executor dispatch).

---

## Code-quality review — code-quality-reviewer

**Verdict: FIX-THEN-SHIP — resolved. All Important findings fixed in `fc63947`.**

#### Critical
None. The slice is cohesive; the security-by-construction pattern is sound; the pgTAP coverage genuinely proves the load-bearing AC-P2-RT-006 claim.

#### Important (all fixed)
- **I1 — Whitelist drift undocumented + uncaught.** The TS `ENTITY_WHITELIST` and the SQL `case v_entity` dispatch must stay byte-for-byte in sync across all 8 entities. **Fixed:** added a DRIFT-PAIR cross-reference comment in the migration header naming the sync requirement + the `bom_coverage_pct` decision; the security-auditor's per-entity cross-check (claim 6) confirmed no current drift.
- **I2 — `bom_coverage_pct` aggregatability.** Absent from `v_numeric` on both sides. **Fixed:** documented as a deliberate decision (it's a ratio, not summable) in the DRIFT-PAIR comment so the next contributor doesn't "fix" it.
- **I3 — Fallback swallows the RPC error with only `console.warn`.** A transient 5xx renders a plausible-but-wrong total with no distinct signal. **Fixed:** added `degraded?: 'aggregate-fallback'` to `ExecutedQueryResult`; the renderer can now badge "partial data" distinctly from a clean cap. Locked with Vitest assertions (set on fallback, undefined on happy path).

#### Minor (non-blocking)
- M1 — `executeAggregateViaRpc` casts `supabase` to a bespoke inline shape duplicating the cast in the non-aggregate path. Extractable to a shared helper; not blocking.
- M2 — `v_order_dir` defaults to `desc` on null/empty (a falsy check); an explicit `not in ('asc','desc')` rejection would be stricter. Defensive; not blocking.
- M3 — `applyGroupByAggregate` is now fallback-only; a one-line comment marking it as such would help. Not blocking.
- M4 — Two-pass filter loop (validate-all-then-build) is mildly repetitive but keeps injection-prone code separated from validation. Acceptable for clarity.
- M5 — pgTAP `throws_ok(..., null, ...)` doesn't match the message substring. Acceptable (SQLSTATE match is robust).
- M6 — Vitest "single-row" test asserts shape but the `null` group_key is mock-supplied (circular); the DB-side `null::jsonb` branch is covered by the migration. Acceptable.

#### Positive observations
- Decomposition is clean: `executeAggregateViaRpc` is the single RPC call site; the fallback preserves the P1 contract.
- Naming (`v_entity`, `v_group_by`, `v_agg_expr`, `v_where`) is clear and idiomatic.
- Consistency with established patterns (SECURITY INVOKER + `search_path = ''` + `statement_timeout` matches `ops.stock_available_for_date`).
- No dead code; the `else raise 'unreachable'` is intentional belt-and-braces.

---

## Security review — security-auditor

**Verdict: FIX-THEN-SHIP — resolved. No SQL-injection vector found. M1/M2/L1 fixed in `fc63947`.**

### Method

Read end-to-end: the migration, the pgTAP harness, `executor.ts`, `executor.test.ts`, and `types.ts` `ENTITY_WHITELIST`. Cross-referenced RLS posture on every base table touched and the schema USAGE grants. Compared against the two cited precedents (`ops.stock_available_for_date` SECURITY INVOKER static; `mos.create_notification` SECURITY DEFINER). Traced every flow of `p_compiled` into the generated SQL string by hand. Attempted crafted payloads mentally. No code was modified; report only.

**No SQL-injection vector was found.** Every payload-derived value that reaches an identifier position passes through `format('%I', ...)` against an allow-set; every payload-derived value in a value position passes through `format('%L', ...)`. No value escapes its literal context.

### Findings by severity

#### Critical / High
*None.* The central claim — "no payload value reaches an identifier position without `%I` + allow-set, and no value reaches the SQL un-`%L`-quoted" — holds under tracing.

#### Medium (both fixed)
- **M1 — `EXECUTE` not explicitly granted; relied on PG's `PUBLIC` default.** **Fixed (`fc63947`):** added `revoke execute on function mos.aggregate_compiled(jsonb) from public, anon; grant execute to authenticated;` — matches the `create_notification` precedent and narrows the surface. INVOKER grants no elevation; RLS still gates regardless.
- **M2 — `hint` field echoed the rejected payload value back.** Every `raise ... using hint = v_<payload>` reflected attacker-controlled input. **Fixed (`fc63947`):** all `hint` clauses dropped; the `message` string alone identifies the failure.

#### Low (L1 fixed; L2/L3/L4 non-blocking)
- **L1 — pgTAP suite did not exercise value-quoting or crafted-`fn` injection.** **Fixed (`fc63947`):** added two injection-attempt pgTAP tests — (a) crafted fn `"sum; drop table mos.tasks--"` rejected by the fn allow-set (SQLSTATE 22023); (b) crafted filter value `"POS) OR (1=1"` is `%L`-escaped (returns 0 rows, not the unconstrained set).
- **L2 — `v_op` re-read in the build loop without re-validation.** Safe (validation loop must pass first; the `else raise` is defense-in-depth). Readability nit; not blocking.
- **L3 — `in`-list length not re-capped server-side.** Client caps at 500; DB 2s `statement_timeout` bounds wall-clock. Mirroring the cap server-side is a one-liner; not blocking.
- **L4 — Fallback path injection-free.** Uses the supabase-js parameterised query builder; no new surface.

### Explicit confirm/refute per the 9 claims
1. **SECURITY INVOKER — base-table RLS fires.** ✅ CONFIRMED. `security invoker` + `set search_path = ''`; every base table has `enable + force row level security`. pgTAP test 12 proves cross-org isolation (0 rows). Matches `ops.stock_available_for_date`.
2. **Two trust boundaries.** ✅ CONFIRMED. (a) client `ENTITY_WHITELIST`; (b) hard-coded `case v_entity` dispatch with `else raise 22023`. jsonb never supplies schema/table.
3. **Identifier safety — `%I` + allow-set, never raw.** ✅ CONFIRMED. Every `format(` identifier slot is `%I`; every `%I` argument is allow-set-checked or a hard-coded literal. The two `%s` slots (`v_agg_fn`, `v_agg_expr`) are gated by allow-sets.
4. **Value safety — `%L` everywhere.** ✅ CONFIRMED. `eq/neq/gt/gte/lt/lte` → `%L`; `in` → `%L::text[]`; `between/date-range` → `%L and %L`; timeRange → `%L and %L`. No raw concatenation.
5. **SQL-injection vectors.** ✅ NONE FOUND. Enumerated: column-with-quote (rejected by exact-match allow-set), unknown op (rejected + defense-in-depth), value-with-embedded-`'` (escaped by `%L`), crafted `resolvedOrderBy.column` (never reaches SQL — equality-compared then raised).
6. **Whitelist completeness — DB vs `ENTITY_WHITELIST`.** ✅ CONFIRMED, no drift across all 8 entities. `requiresTimeRange` flags match. `org_id` deliberately absent on both sides.
7. **D7 ceilings.** ✅ CONFIRMED. `set statement_timeout = '2s'`; `requiresTimeRange` enforced. Single-table per call — no JOIN/subquery/CTE; no payload value can name a second relation.
8. **Privilege.** ✅ CONFIRMED after M1 fix. INVOKER = no elevation; EXECUTE now explicitly granted to `authenticated` only (revoked from public/anon).
9. **`search_path = ''`.** ✅ CONFIRMED. Every relation is `format('%I.%I', v_schema, v_table)` — fully qualified. No hijackable unqualified reference.

### 3-line summary
No SQL-injection vector: every identifier is `format('%I',…)` against a hard-coded allow-set, every value is `format('%L',…)`; the two-trust-boundary design holds and the SECURITY INVOKER + `force`-RLS posture is correctly proven by the cross-org pgTAP test. M1 (grant/revoke) + M2 (hint reflection) + L1 (injection-attempt tests) all fixed in `fc63947`. No Critical/High — **PASS, ship.**
