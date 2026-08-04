-- SECURITY HIGH-1 fix (Step-4 review). Amend mos._signal_guard_update so a signal.retract holder who
-- is NOT the author can ONLY retract — never rewrite content. Spec §3 / RATIFY-9: UPDATE is
-- "author-only (or signal.retract for retraction)". The signals UPDATE policy USING clause admits both
-- the author AND any signal.retract holder (needed so a holder may retract another author's Signal);
-- without this guard that same holder could PATCH body/occurred_at/category/attention. This BEFORE
-- UPDATE guard rejects (42501) any content change whose actor is not the author, leaving the retract
-- branch to transition only retracted_at/retract_reason. New migration (never edit an applied one —
-- house rule; mirrors 20260711000001_mos_tasks_tenancy_guard / 20260712000001_mos_comments_entity_guard).
create or replace function mos._signal_guard_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.author_id is distinct from old.author_id or new.owning_team_id is distinct from old.owning_team_id
     or new.source is distinct from old.source or new.org_id is distinct from old.org_id
     or new.created_at is distinct from old.created_at then
    raise exception 'signal author/owning_team/source/org/created_at are immutable' using errcode = '42501';
  end if;
  -- HIGH-1: content (body/occurred_at/category/attention) is author-only. A signal.retract holder who
  -- is not the author passes the UPDATE policy USING clause but may ONLY transition the retraction
  -- columns — any content change by a non-author is rejected here.
  if (new.body is distinct from old.body
      or new.occurred_at is distinct from old.occurred_at
      or new.category is distinct from old.category
      or new.attention is distinct from old.attention)
     and old.author_id is distinct from shared.current_person_id() then
    raise exception 'signal content is author-only; signal.retract may only retract' using errcode = '42501';
  end if;
  if new.retracted_at is distinct from old.retracted_at then
    if not (old.author_id = shared.current_person_id() or shared.can('signal.retract')) then
      raise exception 'retract requires author or signal.retract' using errcode = '42501';
    end if;
    if new.retracted_at is not null and btrim(coalesce(new.retract_reason,'')) = '' then
      raise exception 'retraction requires a reason' using errcode = '23514';
    end if;
  end if;
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
end $$;

-- SECURITY DEFINER hygiene (integration lint): a trigger function cannot usefully be invoked
-- directly — Postgres rejects it with "trigger functions can only be called as triggers" — but the
-- house rule is belt-and-braces on every definer function, with no per-case exemptions to reason
-- about. The trigger itself is unaffected: triggers execute the function regardless of EXECUTE grants.
revoke execute on function mos._signal_guard_update() from public, anon, authenticated;

-- DOWN (manual, pre-production): restore the prior body from 20260716000003_mos_signals_rls.sql
-- (the version without the HIGH-1 content-author guard).
