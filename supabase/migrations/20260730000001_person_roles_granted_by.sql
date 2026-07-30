-- M-1 (security audit 2026-07-30, docs/reviews/dev.md): make a Jabatan assignment ATTRIBUTABLE.
--
-- shared.person_roles is a permission-affecting write with no actor recorded. Assigning a
-- top-of-chain Position silently widens what its holder may read and write: shared.is_manager_of()
-- (20260611000004_helpers.sql) unions over person_roles, and that predicate gates mos.tasks SELECT
-- and UPDATE (20260611000009_mos_rls.sql), weekly-update reads (20260612000002) and ops-log reads
-- (20260612000005). Until now the row carried only (org_id, person_id, role_id, created_at) — so an
-- admin could grant themselves org-wide visibility and nothing recorded who did it.
--
-- Severity is Medium, not High, and the distinction matters for what this migration does and does
-- NOT change: there is no privilege ESCALATION here. An admin can already impersonate anyone in the
-- org via shared.admin_reset_password (20260626000001), so this grants no reach they lacked. The
-- residual is STRIDE Repudiation — an unattributable permission change. Attribution is therefore the
-- proportionate fix.
--
-- This also closes a self-inconsistency inside the same release window: the sibling table
-- reporting.supervisor_revenue_scope (ADR-0051, mig ...000004) — created two migrations later, for
-- the same class of grant — DOES carry granted_by and forces it in its guard. person_roles now
-- matches that pattern exactly.
--
-- DELIBERATELY NOT DONE — blocking self-assignment. The audit suggested it "for parity" with
-- shared.person_access_roles, which refuses self-assignment of admin/finance/manager/supervisor.
-- That parity is false: person_access_roles grants APP PRIVILEGE, while person_roles records an ORG
-- POSITION (Jabatan). An admin setting their own job title is a legitimate, expected action — and in
-- a single-admin org it is the ONLY way that position ever gets set, so a hard block is a lockout
-- footgun. It would also close no hole, per the no-escalation reasoning above. Attribution gives the
-- audit trail; a block would only cost usability. Revisit only if the owner decides an admin must
-- never hold a self-set position.

alter table shared.person_roles
  add column granted_by uuid references shared.people(id) on delete set null;

comment on column shared.person_roles.granted_by is
  'Who performed this assignment (shared.current_person_id() at insert, forced by the guard — never client-supplied). NULL for rows predating mig ...20260730000001 and for service/seed inserts, where there is no acting person.';

-- Stamp it in the existing BEFORE INSERT guard rather than a column default, so a client-supplied
-- value is OVERWRITTEN rather than merely defaulted-when-absent. A default would let the caller
-- name someone else as the granter, which makes the attribution worse than useless.
-- Body is otherwise IDENTICAL to mig ...20260729000005 — the null-org service/seed exemption and
-- both org-seam checks are preserved verbatim. Do not drop any existing invariant.
create or replace function shared._guard_person_roles()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Attribution (M-1): always the acting person, never what the client sent.
    -- NULL under the service/seed connection, which has no current_person_id() — correct and honest:
    -- there is no human actor to attribute a seed insert to.
    new.granted_by := shared.current_person_id();

    -- Only enforce the org seam for a real (authenticated) session; NULL org = service/seed context.
    if shared.current_org_id() is not null then
      if not exists (select 1 from shared.people p
                      where p.id = new.person_id and p.org_id = shared.current_org_id()) then
        raise exception 'person is not in your org' using errcode = '42501';
      end if;
      if not exists (select 1 from shared.roles r
                      where r.id = new.role_id and r.org_id = shared.current_org_id()) then
        raise exception 'position is not in your org' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;

comment on function shared._guard_person_roles() is
  'Guard (ADR-0050; org-null-safe ...000005; granted_by attribution ...20260730000001): a Jabatan assignment must reference a person AND a role in the caller''s org — enforced only when current_org_id() is not null (an authenticated session); the service/seed connection (null org) is exempt. granted_by is forced server-side from current_person_id(). SECURITY INVOKER.';

-- No grant change needed: shared.person_roles exposes only INSERT and DELETE to authenticated
-- (20260729000002_admin_assign_jabatan.sql:37-44) — there is no UPDATE path, so granted_by cannot be
-- rewritten after the fact and needs no separate immutability guard.
--
-- KNOWN REMAINING GAP (not closed here): removal is a hard DELETE, so revocation stays
-- unattributable — no row survives to carry the actor. Closing that needs a soft-delete column or a
-- separate audit-log table, a larger change than this fix; is_manager_of() reads live rows and would
-- have to learn to ignore revoked ones. Tracked in docs/reviews/dev.md.

-- DOWN:
--   create or replace function shared._guard_person_roles() with its pre-...20260730000001 body
--     (drop the `new.granted_by := shared.current_person_id();` line);
--   alter table shared.person_roles drop column granted_by;
