-- Change history batch 2d — Directory & authority (#989, the rollout on the ADR-0059 mechanism
-- from 20260929000010). Attaches the one generic trigger to the ten directory/authority tables and
-- registers their read arms in shared.can_read_history_record. No shape changes: the mechanism,
-- its grants and its policy are Slice 1's and are not restated here.
--
-- Eight uuid-id tables — shared.business_units, shared.people, shared.person_access_roles,
-- shared.person_roles, shared.roles, shared.sites, shared.team_memberships, shared.teams — take
-- the bare registration (default id key, built-in exclude list). Their history reads through each
-- table's own SELECT policy: the plain org-membership predicate every one of them carries
-- (people_select_org and its siblings, 20260805000002), so each arm is that predicate over a live
-- lookup by record_key, with the guarded uuid cast that preserves the PK index.
--
-- TWO composite-key tables (change-history DA-1; the PK is the key, there is no uuid id):
--   shared.role_authority        (org_id, action, role) → record_key '<org-uuid>:<action>:<role>'
--   shared.team_lead_assignments (org_id, team_id)       → record_key '<org-uuid>:<team-uuid>'
-- The trigger registers the PK columns in PK order. Their dispatch arms are the one structural
-- exception to the live-lookup shape: both tables are deliberately RPC-only (20260909000006
-- revokes every table privilege from the application roles and creates no SELECT policy — the
-- admin-only SECURITY DEFINER list/save functions are the only surface), so a dispatch lookup
-- under the invoker would ERROR "permission denied" for every authenticated caller rather than
-- return false. The arms therefore restate the RPCs' read authority without touching the tables:
-- the org parsed from the record_key's first registered component (org_id is first in both PKs)
-- AND shared.has_access_role('admin'), exactly who can read these settings today. A malformed key
-- fails closed on the uuid shape test instead of erroring the policy query.
--
-- NOT wired: shared.orgs. The tenant root has no org_id column — it IS the org — and the Slice-1
-- trigger hardcodes the history row's org as (row ->> 'org_id')::uuid into record_history.org_id
-- (NOT NULL, FK to shared.orgs). Attaching the trigger would turn every org insert into a not-null
-- violation, starting with the test seed. Wiring it needs a mechanism change, and this batch does
-- not touch 20260929000010; orgs stays unnamed in the dispatch and fails closed.
--
-- The batch's one hard-DELETE with a wired arm: shared.person_roles — the schema's only
-- authenticated DELETE grant (person_roles_delete_admin, org-scoped admin; the Jabatan assignment
-- has no soft-delete column and is_manager_of reads live rows). Its delete row stays readable
-- through the SNAPSHOT arm: the org-wide person_roles_select_org predicate (no role gate)
-- evaluated over the captured columns, because the row itself is gone.
-- shared.team_lead_assignments is also hard-deletable (the settings RPC clears a designation with
-- NULL) and its delete row reads through the admin tier over the snapshot's org.
--
-- DOWN (restore the pre-batch shape; the mechanism itself stays):
--   drop trigger record_history_business_units on shared.business_units;
--   drop trigger record_history_people on shared.people;
--   drop trigger record_history_person_access_roles on shared.person_access_roles;
--   drop trigger record_history_person_roles on shared.person_roles;
--   drop trigger record_history_roles on shared.roles;
--   drop trigger record_history_sites on shared.sites;
--   drop trigger record_history_team_memberships on shared.team_memberships;
--   drop trigger record_history_teams on shared.teams;
--   drop trigger record_history_role_authority on shared.role_authority;
--   drop trigger record_history_team_lead_assignments on shared.team_lead_assignments;
--   -- then create or replace function shared.can_read_history_record(text, text, text, text, jsonb)
--   -- back to its pre-batch body (Slice 1's arms only, as of 808aa13b):
--   -- create or replace function shared.can_read_history_record(
--   --   p_schema     text,
--   --   p_table      text,
--   --   p_record_key text,
--   --   p_action     text,
--   --   p_snapshot   jsonb
--   -- )
--   -- returns boolean
--   -- language plpgsql
--   -- stable
--   -- security invoker
--   -- set search_path = ''
--   -- as $$
--   -- begin
--   --   if p_action in ('insert', 'update') then
--   --     case
--   --       -- The registered key of every arm below is a bare uuid (DA-1's id::text shape), so the
--   --       -- stored key is cast BACK to uuid against the PK — index-preserving, per the review of
--   --       -- this migration. The shape test keeps a malformed stored key fail-closed (no row) instead
--   --       -- of erroring the whole policy query. A future composite-key table (DA-1) whose key is not
--   --       -- one uuid registers a plain text-comparison arm instead.
--   --       when p_schema = 'mos' and p_table = 'objectives' then
--   --         return exists (
--   --           select 1 from mos.objectives o
--   --           where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
--   --             and o.id = p_record_key::uuid
--   --             and o.org_id = shared.current_org_id());
--   --       when p_schema = 'mos' and p_table = 'work_lines' then
--   --         return exists (
--   --           select 1 from mos.work_lines w
--   --           where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
--   --             and w.id = p_record_key::uuid
--   --             and w.org_id = shared.current_org_id());
--   --       else
--   --         return false;
--   --     end case;
--   --   end if;
--   --   -- p_action = 'delete' (or anything unrecognized): the snapshot arm registers hard-deletable
--   --   -- tables as their batches wire them. No audited table hard-deletes yet, so nothing is named
--   --   -- here and every delete row fails closed (FR-013, NFR-007).
--   --   return false;
--   -- end;
--   -- $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. Wire the ten directory/authority tables (batch 2d)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Observer triggers alongside each table's existing guards, exactly as the earlier batches wired
-- theirs. Eight tables take the bare default (single uuid id); the two settings tables register
-- their composite PKs (DA-1) — org_id first in both, so every record_key opens with its org uuid.
-- org_id is on the mechanism's built-in exclude list, so it still never appears as a field diff.
-- The DELETE branches of person_roles and team_lead_assignments are live: person_roles is the
-- schema's one authenticated hard-delete; team_lead_assignments is cleared through the admin RPC.
create trigger record_history_business_units
  after insert or update or delete on shared.business_units
  for each row execute function shared._record_history_write();

create trigger record_history_people
  after insert or update or delete on shared.people
  for each row execute function shared._record_history_write();

create trigger record_history_person_access_roles
  after insert or update or delete on shared.person_access_roles
  for each row execute function shared._record_history_write();

create trigger record_history_person_roles
  after insert or update or delete on shared.person_roles
  for each row execute function shared._record_history_write();

create trigger record_history_roles
  after insert or update or delete on shared.roles
  for each row execute function shared._record_history_write();

create trigger record_history_sites
  after insert or update or delete on shared.sites
  for each row execute function shared._record_history_write();

create trigger record_history_team_memberships
  after insert or update or delete on shared.team_memberships
  for each row execute function shared._record_history_write();

create trigger record_history_teams
  after insert or update or delete on shared.teams
  for each row execute function shared._record_history_write();

create trigger record_history_role_authority
  after insert or update or delete on shared.role_authority
  for each row execute function shared._record_history_write('org_id', 'action', 'role');

create trigger record_history_team_lead_assignments
  after insert or update or delete on shared.team_lead_assignments
  for each row execute function shared._record_history_write('org_id', 'team_id');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. The read dispatch — the ten new arms join the registry; everything else still fails closed
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The whole body is restated (create or replace has no per-arm edit). The eight uuid-keyed arms
-- are each table's own plain org-membership SELECT policy over a live lookup by record_key; the
-- two composite-key arms are the RPC-only tables' admin-tier authority over the key's own org
-- (see the header — a live lookup is unavailable there); the delete branch names the batch's one
-- authenticated hard-delete, person_roles, against its captured snapshot columns.
create or replace function shared.can_read_history_record(
  p_schema     text,
  p_table      text,
  p_record_key text,
  p_action     text,
  p_snapshot   jsonb
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_action in ('insert', 'update') then
    case
      -- The registered key of every arm below is a bare uuid (DA-1's id::text shape), so the
      -- stored key is cast BACK to uuid against the PK — index-preserving, per the review of
      -- this migration. The shape test keeps a malformed stored key fail-closed (no row) instead
      -- of erroring the whole policy query. A future composite-key table (DA-1) whose key is not
      -- one uuid registers a plain text-comparison arm instead.
      when p_schema = 'mos' and p_table = 'objectives' then
        return exists (
          select 1 from mos.objectives o
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and o.id = p_record_key::uuid
            and o.org_id = shared.current_org_id());
      when p_schema = 'mos' and p_table = 'work_lines' then
        return exists (
          select 1 from mos.work_lines w
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and w.id = p_record_key::uuid
            and w.org_id = shared.current_org_id());
      -- Batch 2d, uuid-keyed: each arm is the table's own plain org-membership read
      -- (org_id = current_org_id()), verbatim from its SELECT policy.
      when p_schema = 'shared' and p_table = 'business_units' then
        return exists (
          select 1 from shared.business_units bu
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and bu.id = p_record_key::uuid
            and bu.org_id = shared.current_org_id());
      when p_schema = 'shared' and p_table = 'people' then
        -- people's own SELECT policy is org-wide OR self (the self half is what still resolves
        -- while the password-rotation gate holds current_org_id() at NULL) — the history arm
        -- reuses both halves, so a person reads their own row's history exactly when they read
        -- the row.
        return exists (
          select 1 from shared.people pe
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and pe.id = p_record_key::uuid
            and (pe.org_id = shared.current_org_id()
                 or pe.id = shared.current_person_id()));
      when p_schema = 'shared' and p_table = 'person_access_roles' then
        return exists (
          select 1 from shared.person_access_roles par
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and par.id = p_record_key::uuid
            and par.org_id = shared.current_org_id());
      when p_schema = 'shared' and p_table = 'person_roles' then
        return exists (
          select 1 from shared.person_roles pr
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and pr.id = p_record_key::uuid
            and pr.org_id = shared.current_org_id());
      when p_schema = 'shared' and p_table = 'roles' then
        return exists (
          select 1 from shared.roles ro
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and ro.id = p_record_key::uuid
            and ro.org_id = shared.current_org_id());
      when p_schema = 'shared' and p_table = 'sites' then
        return exists (
          select 1 from shared.sites si
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and si.id = p_record_key::uuid
            and si.org_id = shared.current_org_id());
      when p_schema = 'shared' and p_table = 'team_memberships' then
        return exists (
          select 1 from shared.team_memberships tm
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and tm.id = p_record_key::uuid
            and tm.org_id = shared.current_org_id());
      when p_schema = 'shared' and p_table = 'teams' then
        return exists (
          select 1 from shared.teams te
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and te.id = p_record_key::uuid
            and te.org_id = shared.current_org_id());
      -- Batch 2d, composite-keyed (DA-1): role_authority and team_lead_assignments are RPC-only
      -- tables — no SELECT grant, no SELECT policy — so the arm cannot consult the live row (it
      -- would error the policy query, not return false). It restates the settings RPCs'
      -- admin-only read authority over the record_key's own first component, which is org_id in
      -- both registered PK orders.
      when p_schema = 'shared' and p_table = 'role_authority' then
        return split_part(p_record_key, ':', 1)
                 ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           and split_part(p_record_key, ':', 1)::uuid = shared.current_org_id()
           and shared.has_access_role('admin');
      when p_schema = 'shared' and p_table = 'team_lead_assignments' then
        return split_part(p_record_key, ':', 1)
                 ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           and split_part(p_record_key, ':', 1)::uuid = shared.current_org_id()
           and shared.has_access_role('admin');
      else
        return false;
    end case;
  end if;
  -- p_action = 'delete' (or anything unrecognized): the row is gone, so the table's read predicate
  -- is evaluated against the captured snapshot columns. This batch names the schema's one
  -- authenticated hard-delete: person_roles (person_roles_delete_admin), whose read gate is the
  -- org-wide person_roles_select_org predicate — no role gate — over the snapshot. Every other
  -- other tables in this batch stay fail closed on deletes (FR-013, NFR-007).
  if p_action = 'delete' then
    case
      when p_schema = 'shared' and p_table = 'person_roles' then
        return (p_snapshot ->> 'org_id')::uuid = shared.current_org_id();
      -- Clearing a Team-lead designation is save_team_lead_assignment's NULL write: the row is
      -- hard-removed by the admin settings RPC, so its delete row is readable through the same
      -- admin authority over the snapshot's org (the key's first registered component).
      when p_schema = 'shared' and p_table = 'team_lead_assignments' then
        return (p_snapshot ->> 'org_id')::uuid = shared.current_org_id()
           and shared.has_access_role('admin');
      else
        return false;
    end case;
  end if;
  return false;
end;
$$;
