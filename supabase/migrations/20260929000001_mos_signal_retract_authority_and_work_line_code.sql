-- Restore the configured per-role Signal retraction rule on top of the current All Teams audience
-- guard (#1010), and make mos.work_lines.code a stable, server-assigned state instead of an
-- unguarded column.
--
--   1. mos._guard_signals: the retraction branch now authorizes through mos.can_retract_signal
--      (the tenant's configured shared.role_authority scopes — member own, team_lead own_team,
--      bu_head own_bu, ops_lead/admin org, finance/manager/supervisor none, plus any admin
--      override) instead of the capability-table read shared.can('signal.retract'), which does not
--      see those per-role scopes. The reason is normalised (ASCII and Unicode space characters
--      trimmed) and stored, and the author is notified when someone else retracts — both restored
--      alongside the authority check they belong with.
--   2. mos._guard_signal_retraction_attribution (20260909000008) is the single owner of the
--      retraction audit fields' state machine: a retracted Signal cannot be restored, and
--      retract_reason is writable only in the UPDATE that sets retracted_at (null to not null). It
--      runs before mos._guard_signals on every INSERT/UPDATE.
--   3. signals_insert additionally requires a live row: a Signal is always created without
--      retracted_at or retract_reason.
--   4. mos._guard_work_lines: work_lines.code (20260906000002) becomes immutable on UPDATE for
--      every client access role, and a client INSERT may only use the column default 'standard' —
--      both gated on current_user = 'authenticated', the existing idiom this function already uses
--      for the business-unit-move check. The migration/seed paths that assign 'cafe_opening', by
--      INSERT or by a later UPDATE, run outside PostgREST and are unaffected.
--
-- DOWN (manual, before production):
--   create or replace function mos._guard_signals() with its body from
--     20260918000001_mos_signal_all_teams_audience.sql (shared.can('signal.retract') authority, no
--     reason trim, no notification);
--   create or replace function mos._guard_signal_retraction_attribution() with its body from
--     20260909000008_mos_signal_retraction_attribution.sql;
--   drop policy signals_insert on mos.signals and recreate it from
--     20260918000001_mos_signal_all_teams_audience.sql;
--   create or replace function mos._guard_work_lines() with its body from
--     20260909000006_mos_authority_settings.sql (no code checks).

-- ── Signal retraction audit fields: one state machine ────────────────────────────────────────────
create or replace function mos._guard_signal_retraction_attribution()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor_name text;
begin
  if tg_op = 'INSERT' then
    -- Existing/historical tombstones are allowed only with unknown actor provenance. A client may
    -- not manufacture a retracted_by value on either an active insert or a historical backfill.
    if new.retracted_by is not null or new.retracted_by_name is not null then
      raise exception 'retraction attribution is server-stamped and cannot be supplied on INSERT'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if old.retracted_at is null then
    if new.retracted_at is null then
      if new.retracted_by is not null or new.retracted_by_name is not null then
        raise exception 'retraction attribution can only be set by the first retraction'
          using errcode = '42501';
      end if;
      -- The reason exists only as part of a retraction: it is written by the UPDATE that sets
      -- retracted_at, never before.
      if new.retract_reason is distinct from old.retract_reason then
        raise exception 'a retraction reason can only be set by the retraction itself'
          using errcode = '42501';
      end if;
      return new;
    end if;

    if new.retracted_by is not null or new.retracted_by_name is not null then
      raise exception 'retraction attribution must be server-stamped on the first retraction'
        using errcode = '42501';
    end if;
    new.retracted_at := now();
    new.retracted_by := shared.current_person_id();
    select p.full_name
      into v_actor_name
      from shared.people p
     where p.id = new.retracted_by
       and p.org_id = shared.current_org_id()
       and p.archived_at is null;
    if new.retracted_by is null or v_actor_name is null then
      raise exception 'retraction requires a live actor' using errcode = '42501';
    end if;
    new.retracted_by_name := v_actor_name;
    return new;
  end if;

  if new.retracted_at is distinct from old.retracted_at
     or new.retract_reason is distinct from old.retract_reason
     or new.body is distinct from old.body
     or new.occurred_at is distinct from old.occurred_at
     or new.category is distinct from old.category
     or new.attention is distinct from old.attention then
    raise exception 'a retracted Signal tombstone is immutable'
      using errcode = '42501';
  end if;

  if new.retracted_by is distinct from old.retracted_by
     or new.retracted_by_name is distinct from old.retracted_by_name then
    raise exception 'retraction attribution is immutable after the first retraction'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
comment on function mos._guard_signal_retraction_attribution() is
  'Owns the retraction audit fields: server-stamps retracted_by, retracted_by_name, and retracted_at '
  'on the first live tombstone transition, rejects client attribution on active or historical '
  'INSERT, allows retract_reason only in the UPDATE that sets retracted_at, freezes all tombstone '
  'content and audit fields thereafter, and preserves NULL provenance on historical tombstones. It '
  'does not replace mos._guard_signals authority, reason-required, or notification checks.';
revoke execute on function mos._guard_signal_retraction_attribution() from public, anon, authenticated;

-- ── A Signal is always created live ──────────────────────────────────────────────────────────────
drop policy signals_insert on mos.signals;
create policy signals_insert on mos.signals
  for insert to authenticated
  with check (
    org_id = shared.current_org_id()
    and author_id = shared.current_person_id()
    and source = 'human'
    and audience = 'org'
    and owning_team_id is null
    and retracted_at is null
    and retract_reason is null
    and shared.role_authority_allows('signal.post', null, null, null)
  );
comment on policy signals_insert on mos.signals is
  'New Signals are always live All Teams posts: org audience, no owning Team, no retraction state, '
  'gated on the base signal.post authority. The retired team audience exists on historical rows '
  'only and cannot be inserted.';

create or replace function mos._guard_signals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team_org   uuid;
  v_author_org uuid;
  v_actor_name text;
  v_reason     text;
begin
  -- SAME-ORG REFERENCES, checked on INSERT as well as UPDATE (the trigger fires on both). The
  -- INSERT half pins owning_team_id (historical rows only) and author_id to the row's own org via
  -- existence-only FKs; the UPDATE half (further down) guards the immutable columns. Compared
  -- against new.org_id, the idiom the sibling guards use, so the rule states the row's own
  -- internal consistency and holds identically on the seed and service paths.
  if new.owning_team_id is not null then
    select t.org_id into v_team_org from shared.teams t where t.id = new.owning_team_id;
    if v_team_org is distinct from new.org_id then
      raise exception 'owning_team_id belongs to a different org' using errcode = '42501';
    end if;
  end if;
  if new.author_id is not null then
    select p.org_id into v_author_org from shared.people p where p.id = new.author_id;
    if v_author_org is distinct from new.org_id then
      raise exception 'author_id belongs to a different org' using errcode = '42501';
    end if;
  end if;

  -- Everything below reads OLD and is therefore UPDATE-only. Guarded explicitly rather than left to
  -- the trigger definition, so the two halves cannot drift apart if the definition is ever widened
  -- again: on INSERT, OLD is not merely empty, it is not a row at all.
  if tg_op = 'INSERT' then
    return new;
  end if;

  if new.author_id is distinct from old.author_id
     or new.owning_team_id is distinct from old.owning_team_id
     or new.audience is distinct from old.audience
     or new.source is distinct from old.source
     or new.org_id is distinct from old.org_id
     or new.created_at is distinct from old.created_at then
    raise exception 'signal author/owning_team/audience/source/org/created_at are immutable' using errcode = '42501';
  end if;

  -- SECURITY HIGH-1: content is AUTHOR-ONLY. The UPDATE policy's USING clause admits both the author
  -- and an effective retraction authority — it has to, so a holder can retract someone else's
  -- Signal — but without this that same holder could rewrite the body. A non-author may move only
  -- the retraction columns.
  if (new.body is distinct from old.body
      or new.occurred_at is distinct from old.occurred_at
      or new.category is distinct from old.category
      or new.attention is distinct from old.attention)
     and old.author_id is distinct from shared.current_person_id() then
    raise exception 'signal content is author-only; signal.retract may only retract' using errcode = '42501';
  end if;

  if new.retracted_at is distinct from old.retracted_at then
    if not mos.can_retract_signal(old.id) then
      raise exception 'retraction requires the effective signal.retract authority' using errcode = '42501';
    end if;
    -- One normalisation for both the emptiness check and the stored value: strip ASCII whitespace
    -- (space, tab, newline, CR, form feed, vertical tab) and Unicode space characters (NBSP, the
    -- U+2000 block incl. zero-width space, line/paragraph separators, narrow/medium spaces,
    -- ideographic space, BOM) from both ends. The character class is explicit, not locale-derived.
    v_reason := regexp_replace(
      coalesce(new.retract_reason, ''),
      '^[ \t\n\r\f\v   -​    　﻿]+|[ \t\n\r\f\v   -​    　﻿]+$',
      '', 'g');
    if new.retracted_at is not null and v_reason = '' then
      raise exception 'retraction requires a reason' using errcode = '23514';
    end if;
    new.retract_reason := v_reason;
    -- Notify the author when someone else retracts their Signal. A self-retraction is silent — the
    -- actor already knows. A missing/archived author (historical rows) has nobody to notify.
    if old.author_id is distinct from shared.current_person_id()
       and exists (
      select 1 from shared.people p
       where p.id = old.author_id
         and p.org_id = old.org_id
         and p.archived_at is null
    ) then
      select p.full_name
        into v_actor_name
        from shared.people p
       where p.id = shared.current_person_id()
         and p.org_id = old.org_id
         and p.archived_at is null;
      perform mos.create_notification(
        old.author_id,
        'warning',
        'Signal retracted',
        new.retract_reason,
        jsonb_build_object(
          'source', 'signal_retraction',
          'actor', jsonb_build_object(
            'id', shared.current_person_id(),
            'name', v_actor_name),
          'reason', new.retract_reason,
          'entity', jsonb_build_object(
            'type', 'signal',
            'id', old.id,
            'route', '/work/signals?record=' || old.id))
      );
    end if;
  end if;

  -- Edit history. One branch per mutable field so the revision row names the field that moved.
  if new.body is distinct from old.body then
    insert into mos.signal_revisions(org_id,signal_id,actor_id,field,old_value,new_value)
      values (old.org_id, old.id, shared.current_person_id(), 'body', old.body, new.body);
    new.edited_at := now();
  end if;
  if new.occurred_at is distinct from old.occurred_at then
    insert into mos.signal_revisions(org_id,signal_id,actor_id,field,old_value,new_value)
      values (old.org_id, old.id, shared.current_person_id(), 'occurred_at', old.occurred_at::text, new.occurred_at::text);
    new.edited_at := now();
  end if;
  if new.category is distinct from old.category then
    insert into mos.signal_revisions(org_id,signal_id,actor_id,field,old_value,new_value)
      values (old.org_id, old.id, shared.current_person_id(), 'category', old.category, new.category);
    new.edited_at := now();
  end if;
  if new.attention is distinct from old.attention then
    insert into mos.signal_revisions(org_id,signal_id,actor_id,field,old_value,new_value)
      values (old.org_id, old.id, shared.current_person_id(), 'attention', old.attention, new.attention);
    new.edited_at := now();
  end if;

  return new;
end;
$$;
comment on function mos._guard_signals() is
  'Guard (ADR-0050 D5 + SECURITY HIGH-1): owning_team_id and author_id must be same-org on INSERT '
  'and UPDATE (42501); author/owning_team/audience/source/org/created_at immutable; content is '
  'author-only so a retraction authority holder may only retract; retraction authority is the '
  'configured mos.can_retract_signal scope, reason required and normalised (ASCII and Unicode '
  'spaces trimmed), author notified on a non-self retraction; every content change appends a '
  'signal_revisions row. The retraction audit fields (restore, reason write timing, attribution) '
  'are owned by mos._guard_signal_retraction_attribution, which runs first. SECURITY DEFINER solely to write the '
  'revision/notification tables, which have no INSERT grant.';
revoke execute on function mos._guard_signals() from public, anon, authenticated;

-- ── mos.work_lines.code: stable, server-assigned state (#1010) ───────────────────────────────────
create or replace function mos._guard_work_lines()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_bu_org   uuid;
  v_acc_org  uuid;
  v_resp_org uuid;
begin
  if new.objective_id is not null then
    if not exists (
      select 1 from mos.objectives o
       where o.id = new.objective_id and o.org_id = new.org_id
    ) then
      raise exception 'objective_id belongs to a different org' using errcode = '42501';
    end if;
  end if;

  if new.business_unit_id is not null then
    select bu.org_id into v_bu_org from shared.business_units bu where bu.id = new.business_unit_id;
    if v_bu_org is distinct from new.org_id then
      raise exception 'business_unit_id belongs to a different org' using errcode = '42501';
    end if;
  end if;
  if new.accountable_person_id is not null then
    select p.org_id into v_acc_org from shared.people p where p.id = new.accountable_person_id;
    if v_acc_org is distinct from new.org_id then
      raise exception 'accountable_person_id belongs to a different org' using errcode = '42501';
    end if;
  end if;
  if new.responsible_person_id is not null then
    select p.org_id into v_resp_org from shared.people p where p.id = new.responsible_person_id;
    if v_resp_org is distinct from new.org_id then
      raise exception 'responsible_person_id belongs to a different org' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'INSERT' then
    -- A PostgREST client may only ever create the default state; the seed/migration path that
    -- assigns a non-default code (e.g. Café Opening) runs outside PostgREST and is untouched.
    if current_user = 'authenticated' and new.code is distinct from 'standard' then
      raise exception 'code is server-assigned; a client insert must use the default standard' using errcode = '42501';
    end if;
    return new;
  end if;

  -- Stable authorization state for process gates: no client access role may move it once the row
  -- exists. Server-side paths (migrations, the test-seed fixtures that assign Café Opening onto an
  -- already-inserted row) run outside PostgREST and are untouched, the same carve-out the unit-move
  -- check below already uses.
  if current_user = 'authenticated' and new.code is distinct from old.code then
    raise exception 'code is immutable' using errcode = '42501';
  end if;

  if new.type is distinct from old.type
     and exists (select 1 from mos.process_runs r where r.work_line_id = new.id) then
    raise exception 'type is locked once an occurrence exists' using errcode = '42501';
  end if;
  if current_user = 'authenticated'
     and new.business_unit_id is distinct from old.business_unit_id
     and not mos.can_manage_definition(old.business_unit_id) then
    raise exception 'the definition''s current unit is not one you manage' using errcode = '42501';
  end if;
  return new;
end;
$$;
comment on function mos._guard_work_lines() is
  'The ONE guard on mos.work_lines: references stay same-org, code is a server-assigned state no '
  'client access role can move once the row exists or claim as a non-default on insert (the '
  'migration/seed paths that assign it run outside PostgREST and are unaffected), Process type '
  'locks after a run, and a direct unit move requires the effective matrix on the OLD unit. '
  'SECURITY INVOKER.';
