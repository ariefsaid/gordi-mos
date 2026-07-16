-- ADR-0050 D3 (REUSE): Signal comments reuse mos.comments. Add 'signal' to the entity_type CHECK and map it
-- in the polymorphic entity guard (20260712000001) so entity_id must resolve to a same-org signal (readable).
alter table mos.comments drop constraint if exists comments_entity_type_check;
alter table mos.comments add constraint comments_entity_type_check
  check (entity_type in ('task','weekly_update','daily_log','follow_up','signal'));

create or replace function mos._guard_comment_entity()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_org uuid;
begin
  case new.entity_type
    when 'task'          then select t.org_id into v_org from mos.tasks t          where t.id = new.entity_id;
    when 'weekly_update' then select w.org_id into v_org from mos.weekly_updates w where w.id = new.entity_id;
    when 'daily_log'     then select l.org_id into v_org from ops.log_entries l    where l.id = new.entity_id;
    when 'follow_up'     then select f.org_id into v_org from mos.follow_ups f     where f.id = new.entity_id;
    when 'signal'        then select s.org_id into v_org from mos.signals s        where s.id = new.entity_id;
    else raise exception 'comments.entity_type % is not mapped by the entity guard', new.entity_type using errcode = '23514';
  end case;
  if v_org is distinct from new.org_id then
    raise exception 'comments.entity_id must resolve to a same-org row of entity_type % (cross-org or missing)',
      new.entity_type using errcode = '23514';
  end if;
  return new;
end $$;
-- signal is org-scoped-AND-grant-scoped (can_read_signal): a same-org non-reader is blocked here too (invisible
-- → NULL → raise). That is the tighten AC-416 asserts at the comment-read layer.

-- DOWN: restore the CHECK to (task,weekly_update,daily_log,follow_up) and drop the 'signal' CASE branch.
