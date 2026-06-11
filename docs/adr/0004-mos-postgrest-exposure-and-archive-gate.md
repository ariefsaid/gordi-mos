# ADR-0004 — Exposing `mos` to PostgREST + the archive-gate mechanism

- Status: Accepted (2026-06-11, P2-1 planning)
- Deciders: Owner (Arief) + Director
- Related: OD-DIR-3 (one Supabase, schema-separated), OD-P1-1/3 (org seam + fixed read posture),
  OD-P2-3 (edit/archive write gating), ADR-0001 (org seam + read posture), ADR-0002 (client auth /
  data-layer seam), the spec `docs/specs/tasks-raci.spec.md` §9.

## Context

P2-1 ships the first `mos.*` business tables (`mos.tasks`, `mos.task_checklist_items`,
`mos.task_events`). Two cross-cutting decisions have to be settled before the migration is written,
because both are expensive to reverse and both touch the security boundary.

### C1 — How does the app read/write `mos.*`?

The foundation (P1-2) deliberately exposed **only** `shared` to PostgREST
(`config.toml [api].schemas = ["public","graphql_public","shared"]`) and pinned the browser Supabase
client to `db: { schema: 'shared' }` (`mos-app/src/lib/supabase.ts`). The directory was read-only and
lived entirely in `shared`. P2-1 is the first feature whose tables live in `mos`, and the app must
read **and write** them from the browser tier over PostgREST/REST. PostgREST only issues endpoints for
schemas in `[api].schemas`. So `mos` has to be added to that list — there is no other REST path for
the browser client. (`service_role`/`/pg/query` is a server/admin path, not the app's read/write path.)

### C2 — How is the archive gate (narrower than the edit gate) enforced at the DB layer?

OD-P2-3 / FR-050 / FR-051 split the write rule:
- **Edit** (status, fields, RACI, checklist) — allowed to **R, A, or manager-of-(R or A)**.
- **Archive** (set/clear `archived_at`) — allowed to **A or manager-of-(R or A)** only; a non-A
  Responsible person can edit everything *except* `archived_at`.

A single RLS UPDATE policy (USING + WITH CHECK = R OR A OR mgr) cannot express "...but the `archived_at`
column specifically requires A-or-mgr", because a WITH CHECK predicate evaluates the **resulting row**,
not which columns changed; it cannot see OLD vs NEW to detect that `archived_at` is the column being
toggled by a non-A Responsible. PostgreSQL has no native per-column RLS for UPDATE that is conditional
on the old value. The candidate mechanisms:

1. **Two UPDATE policies** — PostgreSQL ORs multiple permissive policies, so a second, *narrower*
   policy cannot *subtract* from a broader one. Splitting into restrictive policies is fragile and
   still cannot key on "the `archived_at` column changed". Rejected.
2. **Column-level GRANT** — `revoke update (archived_at)` then `grant update (archived_at)` to a
   sub-role — does not exist per-row / per-relationship; the gate is relationship-based (A vs R), not
   role-based. Rejected.
3. **Security-definer RPC** for archive (`mos.archive_task(id)`) — works, but splits the write surface:
   general edits go through the table UPDATE policy while archive goes through an RPC, two code paths,
   two mental models, and the RPC re-implements the org/relationship checks the RLS policy already has.
   Heavier than needed.
4. **`BEFORE UPDATE` trigger guard** — a `SECURITY DEFINER`, `search_path=''` trigger sees both OLD and
   NEW, can detect `NEW.archived_at IS DISTINCT FROM OLD.archived_at`, and `RAISE EXCEPTION` (SQLSTATE
   `42501`) unless the actor is A-or-manager. The general UPDATE RLS policy (R/A/mgr) still guards
   *whether an UPDATE happens at all*; the trigger adds the *one* extra constraint on the *one*
   sensitive column transition. Smallest, most local, fully pgTAP-able.

## Decision

**D1 — Expose `mos` to PostgREST; add a dedicated `mos`-schema client.**
- Add `"mos"` to `config.toml [api].schemas` (keep `public`, `graphql_public`, `shared`). RLS is the
  authority: every `mos` table ships RLS **enabled + forced** with org-scoped SELECT and gated writes
  (NFR-001), so exposure adds REST endpoints but no readability beyond the policies — identical to how
  `shared` is exposed. The base privilege grants are minimal: `SELECT, INSERT, UPDATE` to
  `authenticated` on the three tables; **no DELETE grant** (NFR-002).
- The browser client in `mos-app/src/lib/supabase.ts` stays pinned to `shared` (it is consumed by the
  viewer/directory reads). The tasks data layer constructs a **second client** bound to `mos`
  (`supabase.schema('mos')` via the existing client, or a dedicated `mosClient`), so directory reads
  and task reads each target the right schema without a global default flip. Decision: reuse the single
  client via the per-call `.schema('mos')` selector so there is one auth session, one token refresh
  path — no second `createClient`. (`@supabase/supabase-js` `.schema(name)` returns a schema-scoped
  query builder on the same client.)

**D2 — Archive gate = a `BEFORE UPDATE` trigger guard (mechanism 4).**
- General edits: one RLS UPDATE policy, `USING` and `WITH CHECK` = `org_id = current_org_id() AND
  (responsible_person_id = current_person_id() OR accountable_person_id = current_person_id() OR
  is_manager_of(responsible_person_id) OR is_manager_of(accountable_person_id))`.
- Archive constraint: a `BEFORE UPDATE` trigger `mos._guard_archive()` raises `42501` when
  `NEW.archived_at IS DISTINCT FROM OLD.archived_at` and the current person is **not** A and **not**
  `is_manager_of(R or A)`. This covers both archive (NULL→ts) and unarchive (ts→NULL), gated
  identically (FR-052). The trigger is `SECURITY INVOKER` (it only reads `current_person_id()` and
  calls `is_manager_of`, both INVOKER) and pins `search_path=''`.
- No DELETE policy and no DELETE grant exist on any `mos` table for `authenticated`, so hard delete is
  structurally impossible for the app tier (FR-053, NFR-002); `service_role` bypasses RLS and is the
  only (server-side) destructive path, intentionally.

## Consequences

- **Positive:** the app gets the exact REST surface it needs with no readability widening — RLS is the
  single authority, consistent with `shared`. One client, one session.
- **Positive:** the archive gate is enforced in **one local place** (the trigger), fully provable in
  pgTAP (A allows, manager allows, non-A R denies, unarchive symmetric), and leaves the common edit
  path on the ordinary RLS policy. No RPC indirection, no column-grant gymnastics.
- **Negative / accepted:** a `BEFORE UPDATE` trigger runs on every task UPDATE. At Gordi's scale
  (hundreds of tasks, low write rate) this is negligible; the trigger short-circuits cheaply when
  `archived_at` is unchanged (the common edit case) before any `is_manager_of` recursion.
- **Watch:** the trigger's `is_manager_of` call duplicates the relationship logic already in the RLS
  policy. If the gate rule ever changes, both the policy and the trigger must move together — the pgTAP
  suite (AC-030..033) is the regression net that catches drift.
- **Watch:** exposing `mos` means every future `mos` table must ship RLS enabled+forced from its first
  migration (the `01_rls_enabled` pgTAP test must grow to assert it). The plan adds that assertion.
