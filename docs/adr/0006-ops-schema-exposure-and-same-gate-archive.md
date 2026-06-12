# ADR-0006 — Exposing `ops` to PostgREST + the same-gate archive mechanism

- Status: Accepted (2026-06-12, P2-3 planning)
- Deciders: Owner (Arief) + Director
- Related: OD-P2-15..19 (Ops Log business rules, LOCKED 2026-06-12), OD-P1-1/3 (org seam + read
  posture), OD-P1-7 (union manager chain), ADR-0004 (mos PostgREST exposure + archive-gate — the
  mirror), ADR-0001 (org seam + read posture), the spec `docs/specs/ops-log.spec.md` §3/§5.

## Context

P2-3 ships `ops.log_entries` — the first table in the (created-but-empty since P1-2) `ops` schema and
the first business table outside `mos`. Two decisions touch the security boundary and are expensive to
reverse, so they are settled here before the migration.

### C1 — How does the app read/write `ops.*`?

The foundation exposed `shared` (P1-2) then `mos` (ADR-0004) to PostgREST
(`config.toml [api].schemas`). The browser data layer reaches each domain via a per-schema PostgREST
profile (`supabase.schema('mos')`, and now `supabase.schema('ops')`). PostgREST only issues endpoints
for schemas in `[api].schemas`; `ops` is not yet in the list, so the `ops` data layer
(`mos-app/src/lib/db/opsLog.ts`) has no REST path until `ops` is added. (`service_role` / `/pg/query`
is a server/admin path, not the app's browser read/write path.)

### C2 — How is archive (set/clear `archived_at`) gated at the DB layer?

OD-P2-19 sets the Ops Log lifecycle: **edit and archive share one gate** — the **author or a manager
of the author** (`is_manager_of`, the union chain, OD-P1-7). This is deliberately *unlike* P2-1's
tasks, where archive is **narrower** than edit (A-or-manager only), forcing a `mos._guard_archive`
`BEFORE UPDATE` trigger to police the `archived_at` column separately from the row's edit policy.

## Decision

1. **Expose `ops` to PostgREST.** Add `ops` to `config.toml [api].schemas`
   (`["public","graphql_public","shared","mos","ops"]`), mirroring ADR-0004's `mos` exposure. **RLS is
   the authority** — exposure is not open access: every `ops` table ships `enable` + `force` RLS in the
   same migration that creates it. `ops.log_entries` is enable+FORCE with an org-readable SELECT, an
   any-member INSERT (org_id + created_by server-stamped, both checked unspoofable in WITH CHECK), and a
   gated UPDATE; schema `usage` on `ops` was already granted to `authenticated` at P1-2.

2. **One UPDATE policy gates edit AND archive — no guard trigger.** Because OD-P2-19 makes archive the
   *same* gate as edit, the single UPDATE policy (`USING ops.can_edit_log_entry(id)` + `WITH CHECK
   org_id = current_org_id() AND ops.can_edit_log_entry(id)`) covers both editing fields and toggling
   `archived_at`. No `_guard_archive`-style trigger is needed (simpler than `mos.tasks`).
   `ops.can_edit_log_entry(uuid)` is `STABLE` **`SECURITY INVOKER`** `set search_path = ''`, schema-
   qualifying every reference — the `mos.can_edit_task` shape.

3. **No DELETE grant.** `authenticated` is granted only `select, insert, update`; hard delete is
   structurally impossible for the app tier (NFR-004). Removal is soft-archive (`archived_at`,
   reversible). `service_role` bypasses RLS but is not used by the P2-3 app tier.

## Consequences

- **Future `ops` tables inherit the exposure** — the schema is now PostgREST-visible, so every future
  `ops` table must ship its own enable+FORCE RLS in its creating migration (the exposure ≠ access
  discipline carries forward).
- **Simpler than `mos`** — no archive-guard trigger, because the archive gate is not narrowed below the
  edit gate. One UPDATE policy is the whole write story (besides INSERT).
- **CI lint trivially clean** — `ops.can_edit_log_entry` is `SECURITY INVOKER`, so the integration.yml
  "every `SECURITY DEFINER` migration must revoke PUBLIC execute" lint has nothing to flag (no DEFINER
  is introduced by this slice).
- **Reversible** — down = drop the UPDATE/INSERT/SELECT policies, drop `ops.can_edit_log_entry`, drop
  `ops.log_entries`; once `ops` is empty again, `ops` may be removed from `[api].schemas`.
- **No cross-schema embed** — under the `ops` PostgREST profile, FK-embedding `ops.log_entries →
  mos.tasks` / `shared.*` raises PGRST200 (the P2-1b lesson). The source Business-Unit name and
  linked-task title are resolved **client-side** from the directory / tasks layers (NFR-006).
