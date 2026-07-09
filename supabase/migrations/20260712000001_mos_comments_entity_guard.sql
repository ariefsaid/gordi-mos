-- P3a security hardening (round-2 audit 2026-07, finding A2) — guard trigger on mos.comments.
--
-- SEAM (MEDIUM — polymorphic existence + tenancy oracle): mos.comments.entity_id is a bare uuid with
-- NO foreign key (a polymorphic reference cannot FK to four different tables). The only WRITE control
-- is the comments_insert RLS WITH CHECK, which pins org_id + author_id to the caller but admits ANY
-- entity_id. So a caller can point a comment at a row that does not exist, or — worse — at a row in
-- ANOTHER org: the FK-free column has neither an existence oracle nor a tenancy check. The v1 SELECT
-- posture is same-org by design (a deliberate Director decision; this guard does NOT touch it), so the
-- leak vector is a dangling / cross-org WRITE that later surfaces as a comment pointing into a foreign
-- org. This IS the "later hardening" the comments migration explicitly defers on the WRITE/existence
-- side (20260706000004_mos_comments.sql).
--
-- FIX: a BEFORE INSERT OR UPDATE trigger resolves new.entity_id in the table named by new.entity_type
-- and requires the resolved org_id to equal new.org_id, else RAISE 23514:
--   'task'          -> mos.tasks          (org_id)
--   'weekly_update' -> mos.weekly_updates (org_id)
--   'daily_log'     -> ops.log_entries    (org_id)
--   'follow_up'     -> mos.follow_ups     (org_id)
--
-- SECURITY INVOKER is sufficient: all four target tables are org-scoped in their SELECT policy
-- (org_id = shared.current_org_id()), so under the caller's RLS a SAME-ORG reference is visible and
-- yields a matching org_id, while a cross-org reference (or a non-existent id) is invisible -> the
-- lookup returns NULL -> IS DISTINCT FROM new.org_id fires the raise.
--   Note on mos.follow_ups: its SELECT policy additionally lane-gates reads (admin OR finance OR
--   can_work_lane). That makes follow_ups org-scoped-AND-lane-scoped: a same-org caller who cannot
--   read a given follow_up is ALSO blocked here (lookup -> NULL -> raise). This is stricter than the
--   finding requires but safe and arguably correct — only a reader can usefully comment on a follow_up.
--   INVOKER is retained (the org predicate is the dominant tenancy control; do NOT silently switch to
--   DEFINER). Mirrors ops._guard_log_entry (audit 2026-06-12). INVOKER only (nothing to revoke; the
--   definer-revoke lint stays clean).
create or replace function mos._guard_comment_entity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org uuid;
begin
  -- Resolve the polymorphic target's org_id under the caller's RLS. A cross-org id is invisible
  -- under INVOKER -> NULL; a non-existent id -> NULL; both then fail the IS DISTINCT FROM guard.
  case new.entity_type
    when 'task' then
      select t.org_id into v_org from mos.tasks t where t.id = new.entity_id;
    when 'weekly_update' then
      select w.org_id into v_org from mos.weekly_updates w where w.id = new.entity_id;
    when 'daily_log' then
      select l.org_id into v_org from ops.log_entries l where l.id = new.entity_id;
    when 'follow_up' then
      select f.org_id into v_org from mos.follow_ups f where f.id = new.entity_id;
    else
      -- Unreachable while the entity_type CHECK constraint holds; defensive against a future
      -- entity_type added to the CHECK without a matching CASE branch (fail loud, not silent).
      raise exception 'comments.entity_type % is not mapped by the entity guard', new.entity_type
        using errcode = '23514';
  end case;

  if v_org is distinct from new.org_id then
    raise exception
      'comments.entity_id must resolve to a same-org row of entity_type % (cross-org or missing)',
      new.entity_type
      using errcode = '23514';
  end if;

  return new;
end;
$$;
comment on function mos._guard_comment_entity() is
  'Guard (round-2 audit 2026-07, finding A2): on INSERT/UPDATE resolve entity_id in the entity_type table and require a SAME-ORG row, else 23514. SECURITY INVOKER — the four target tables (mos.tasks, mos.weekly_updates, ops.log_entries, mos.follow_ups) are org-scoped, so cross-org/non-existent ids are invisible -> NULL -> raise.';

drop trigger if exists comments_guard_entity on mos.comments;
create trigger comments_guard_entity
  before insert or update on mos.comments
  for each row execute function mos._guard_comment_entity();

-- DOWN: drop trigger comments_guard_entity on mos.comments;
--       drop function mos._guard_comment_entity();
