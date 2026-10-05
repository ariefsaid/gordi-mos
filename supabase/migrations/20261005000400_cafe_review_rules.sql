-- Keep review decisions tied to the submitted facts and current row version.
-- DOWN (manual): drop triggers kitchen_logs_default_review_fields and kitchen_logs_reviewed_facts,
--   then drop functions ops._guard_kitchen_log_review_insert() and ops._guard_kitchen_log_review_update();
--   rename ops._approve_kitchen_log_impl(uuid,text) to ops.approve_kitchen_log(uuid,text),
--   re-grant it to authenticated, and restore ops.approve_kitchen_logs(uuid[],text) from
--   20261002000030_ops_cafe_waste_photos.sql; restore mos.create_notification's authenticated
--   grant and the original mos.comments comments_select policy from 20260805000006_mos_access_control.sql;
--   re-grant shared.role_authority_scope(text,text) and shared.is_designated_team_lead(uuid,uuid) to authenticated;
--   drop mos.create_comment_mention_notification(uuid,uuid,text) and remove the expected-version app arguments.

-- Authenticated inserts start without review or posting state; trusted server writers retain their
-- import and delivery responsibilities.
create or replace function ops._guard_kitchen_log_review_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    new.batch_id := null;
    new.posted_to_esb := false;
    new.esb_doc_num := null;
    new.posted_at := null;
    new.push_group_id := null;
    new.review_note := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
  end if;
  return new;
end;
$$;
comment on function ops._guard_kitchen_log_review_insert() is
  'Authenticated inserts leave review and posting fields at their database defaults.';
revoke execute on function ops._guard_kitchen_log_review_insert() from public, anon, authenticated;
drop trigger if exists kitchen_logs_default_review_fields on ops.kitchen_logs;
create trigger kitchen_logs_default_review_fields
  before insert on ops.kitchen_logs
  for each row execute function ops._guard_kitchen_log_review_insert();

create or replace function ops._guard_kitchen_log_review_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status = 'Submitted' and new.status = 'Approved'
     and current_user is distinct from (
       select pg_catalog.pg_get_userbyid(proc.proowner)
         from pg_catalog.pg_proc proc
        where proc.oid = pg_catalog.to_regprocedure('ops.approve_kitchen_log(uuid,text,timestamptz)')
     ) then
    raise exception 'approval goes through the review step' using errcode = '42501';
  end if;

  if old.status in ('Approved', 'Rejected') and (
       new.business_unit_id is distinct from old.business_unit_id
       or new.log_date is distinct from old.log_date
       or new.branch_id is distinct from old.branch_id
       or new.activity is distinct from old.activity
       or new.action is distinct from old.action
       or new.destination_branch_id is distinct from old.destination_branch_id
       or new.wip_item_id is distinct from old.wip_item_id
       or new.qty_porsi is distinct from old.qty_porsi
       or new.item_unit_id is distinct from old.item_unit_id
       or new.entry_quantity is distinct from old.entry_quantity
       or new.entry_unit_factor is distinct from old.entry_unit_factor
       or new.entry_unit_name is distinct from old.entry_unit_name
     ) then
    raise exception 'reviewed kitchen log facts are immutable' using errcode = '42501';
  end if;

  return new;
end;
$$;
comment on function ops._guard_kitchen_log_review_update() is
  'Approval uses its RPC owner; reviewed production facts stay fixed while posting state may advance.';
revoke execute on function ops._guard_kitchen_log_review_update() from public, anon, authenticated;
drop trigger if exists kitchen_logs_reviewed_facts on ops.kitchen_logs;
create trigger kitchen_logs_reviewed_facts
  before update on ops.kitchen_logs
  for each row execute function ops._guard_kitchen_log_review_update();

-- The original implementation remains private and is called only after the public entry point has
-- locked the row and checked the version supplied by the reviewer.
drop function if exists ops.approve_kitchen_logs(uuid[],text);
do $$
begin
  if pg_catalog.to_regprocedure('ops.approve_kitchen_log(uuid,text)') is not null then
    execute 'alter function ops.approve_kitchen_log(uuid,text) rename to _approve_kitchen_log_impl';
  end if;
end;
$$;
revoke execute on function ops._approve_kitchen_log_impl(uuid,text) from public, anon, authenticated;

create or replace function ops.approve_kitchen_log(
  p_log_id uuid,
  p_review_note text,
  p_expected_updated_at timestamptz
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_log ops.kitchen_logs;
  v_batch_id text;
begin
  select * into v_log from ops.kitchen_logs where id = p_log_id for update;

  if v_log.id is null then
    raise exception 'kitchen log not found' using errcode = 'P0002';
  end if;
  if v_log.org_id is distinct from shared.current_org_id() then
    raise exception 'cannot approve a log outside your org' using errcode = '42501';
  end if;
  if v_log.status <> 'Submitted' then
    raise exception 'log is not Submitted (current: %)', v_log.status using errcode = 'P0003';
  end if;
  if not ops.can_review_stream(v_log.branch_id, v_log.activity) then
    raise exception 'only the stream''s supervisor or ops_lead/admin may approve' using errcode = '42501';
  end if;
  if v_log.updated_at is distinct from p_expected_updated_at then
    raise exception 'review row changed; refresh before approval' using errcode = 'P0003';
  end if;
  if v_log.submitted_by = shared.current_person_id()
     and not (shared.has_access_role('ops_lead') or shared.has_access_role('admin')) then
    raise exception 'approval requires a different reviewer' using errcode = '42501';
  end if;

  select ops._approve_kitchen_log_impl(p_log_id, p_review_note) into v_batch_id;
  return v_batch_id;
end;
$$;
comment on function ops.approve_kitchen_log(uuid,text,timestamptz) is
  'Locks the submitted row, checks its expected version and applies the configured self-review rule before approval.';
revoke execute on function ops.approve_kitchen_log(uuid,text,timestamptz) from public, anon;
grant execute on function ops.approve_kitchen_log(uuid,text,timestamptz) to authenticated;

create or replace function ops.approve_kitchen_logs(
  p_log_ids uuid[],
  p_review_note text,
  p_expected_updated_at timestamptz[]
) returns table(group_id uuid, batch_ids text[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid := gen_random_uuid();
  v_env text := integrations.current_esb_target_env();
  v_endpoint text;
  v_org uuid;
  v_log_id uuid;
  v_ids uuid[];
  v_versions timestamptz[];
  v_batch_id text;
  v_batch_ids text[] := '{}';
  v_dedup text;
  v_first_branch uuid;
  v_first_activity text;
  v_first_destination uuid;
  v_first_log_date date;
  v_index integer;
begin
  if p_log_ids is null or cardinality(p_log_ids) = 0
     or p_expected_updated_at is null
     or cardinality(p_log_ids) <> cardinality(p_expected_updated_at) then
    raise exception 'bulk approval requires one row version per log' using errcode = '22023';
  end if;
  if (select count(distinct submitted.id) from unnest(p_log_ids) as submitted(id)) <> cardinality(p_log_ids) then
    raise exception 'bulk approval requires distinct log ids' using errcode = '22023';
  end if;

  select array_agg(submitted.id order by submitted.id),
         array_agg(submitted.version order by submitted.id)
    into v_ids, v_versions
    from unnest(p_log_ids, p_expected_updated_at) as submitted(id, version);

  select l.org_id, ops.esb_endpoint_for(l.action, l.branch_id, l.destination_branch_id),
         l.branch_id, l.activity, l.destination_branch_id, l.log_date
    into v_org, v_endpoint, v_first_branch, v_first_activity, v_first_destination, v_first_log_date
    from ops.kitchen_logs l where l.id = v_ids[1];
  if v_org is null then
    raise exception 'kitchen log not found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from ops.kitchen_logs l
     where l.id = any(v_ids)
       and (l.org_id is distinct from shared.current_org_id() or l.status <> 'Submitted')
  ) or (select count(*) from ops.kitchen_logs where id = any(v_ids)) <> cardinality(v_ids) then
    raise exception 'bulk approval contains a log that is not eligible' using errcode = 'P0003';
  end if;
  if exists (
    select 1 from ops.kitchen_logs l
     where l.id = any(v_ids)
       and (ops.esb_endpoint_for(l.action, l.branch_id, l.destination_branch_id) <> v_endpoint
         or l.destination_branch_id is distinct from v_first_destination
         or l.branch_id is distinct from v_first_branch
         or l.activity is distinct from v_first_activity
         or l.log_date is distinct from v_first_log_date)
  ) then
    raise exception 'bulk approval requires one ERP endpoint, stream, and date per document' using errcode = '22023';
  end if;
  if exists (select 1 from ops.kitchen_logs l where l.id = any(v_ids) and l.action = 'waste') then
    raise exception 'waste logs must be approved individually; ERP posting is held' using errcode = '22023';
  end if;
  if v_endpoint = 'noop' then
    raise exception 'bulk approval cannot mint a document for noop-only movements' using errcode = '22023';
  end if;
  if not (shared.has_access_role('ops_lead') or shared.has_access_role('admin')) then
    raise exception 'only ops_lead/admin may approve' using errcode = '42501';
  end if;

  v_dedup := 'kitchen-group|' || v_group::text || '|' || v_env;
  insert into integrations.esb_push_groups(id, org_id, target_env, dedup_key)
    values (v_group, v_org, v_env, v_dedup);

  for v_index in 1..cardinality(v_ids) loop
    v_log_id := v_ids[v_index];
    select ops.approve_kitchen_log(v_log_id, p_review_note, v_versions[v_index]) into v_batch_id;
    v_batch_ids := array_append(v_batch_ids, v_batch_id);
    update ops.kitchen_logs set push_group_id = v_group where id = v_log_id;
    update integrations.esb_push set push_group_id = v_group
     where org_id = v_org and source_module = 'kitchen'
       and source_ref = (select l.batch_id from ops.kitchen_logs l where l.id = v_log_id);
  end loop;

  return query select v_group, v_batch_ids;
end;
$$;
comment on function ops.approve_kitchen_logs(uuid[],text,timestamptz[]) is
  'Approves one endpoint-homogeneous group only when every row still matches the versions supplied by the reviewer.';
revoke execute on function ops.approve_kitchen_logs(uuid[],text,timestamptz[]) from public, anon;
grant execute on function ops.approve_kitchen_logs(uuid[],text,timestamptz[]) to authenticated;

-- The notification writer is reserved for database-owned callers. Comment mentions use a narrow
-- entry point that derives the source, actor, body and destination from a persisted comment.
revoke execute on function mos.create_notification(uuid,text,text,text,jsonb) from public, anon, authenticated;
create or replace function mos.create_comment_mention_notification(
  p_owner uuid,
  p_comment_id uuid,
  p_locale text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comment mos.comments;
  v_actor_name text;
  v_owner_name text;
  v_entity_label text;
  v_title text;
  v_slug text;
  v_slug_count integer;
  v_is_mentioned boolean;
  v_route text;
  v_id uuid;
begin
  select * into v_comment
    from mos.comments c
   where c.id = p_comment_id
     and c.org_id = shared.current_org_id()
     and c.author_id = shared.current_person_id();
  if v_comment.id is null then
    raise exception 'comment notification requires its author' using errcode = '42501';
  end if;

  select p.full_name into v_actor_name
    from shared.people p
   where p.id = shared.current_person_id()
     and p.org_id = shared.current_org_id()
     and p.archived_at is null;
  if v_actor_name is null then
    raise exception 'comment author must be active in the current org' using errcode = '42501';
  end if;
  if p_locale is null or p_locale not in ('en', 'id') then
    raise exception 'comment notification locale is not supported' using errcode = '22023';
  end if;

  select p.full_name into v_owner_name
    from shared.people p
   where p.id = p_owner
     and p.org_id = shared.current_org_id()
     and p.archived_at is null;
  if v_owner_name is null then
    raise exception 'comment recipient must be active in the current org' using errcode = '42501';
  end if;

  v_slug := lower(split_part(btrim(v_owner_name), ' ', 1));
  if v_slug !~ '^[a-z0-9_.-]+$' then
    raise exception 'comment recipient must be named in the comment' using errcode = '42501';
  end if;
  select count(*) into v_slug_count
    from shared.people p
   where p.org_id = shared.current_org_id()
     and p.archived_at is null
     and lower(split_part(btrim(p.full_name), ' ', 1)) = v_slug;
  if v_slug_count <> 1 then
    raise exception 'comment recipient must be named in the comment' using errcode = '42501';
  end if;
  select exists (
    select 1
      from pg_catalog.regexp_matches(v_comment.body, '(^|[^[:alnum:]_])@([[:alnum:]_.-]+)', 'g') as token(parts)
     where lower(token.parts[2]) = v_slug
  ) into v_is_mentioned;
  if not v_is_mentioned then
    raise exception 'comment recipient must be named in the comment' using errcode = '42501';
  end if;

  v_entity_label := case v_comment.entity_type
    when 'task' then case p_locale when 'id' then 'tugas' else 'task' end
    when 'weekly_update' then case p_locale when 'id' then 'pembaruan mingguan' else 'weekly update' end
    when 'daily_log' then case p_locale when 'id' then 'log harian' else 'daily log' end
    when 'follow_up' then case p_locale when 'id' then 'tindak lanjut' else 'follow-up' end
    when 'signal' then case p_locale when 'id' then 'sinyal' else 'signal' end
    else null
  end;
  if v_entity_label is null then
    raise exception 'comment entity cannot receive a mention notification' using errcode = '22023';
  end if;
  v_title := case p_locale
    when 'id' then v_actor_name || ' menyebut Anda dalam sebuah ' || v_entity_label
    else v_actor_name || ' mentioned you in a ' || v_entity_label
  end;

  v_route := case v_comment.entity_type
    when 'task' then '/work/tasks?record=' || v_comment.entity_id
    when 'signal' then '/work/signals?record=' || v_comment.entity_id
    when 'follow_up' then '/work/follow-ups/' || v_comment.entity_id
    else null
  end;

  v_id := mos.create_notification(
    p_owner,
    'info',
    v_title,
    left(v_comment.body, 200),
    jsonb_build_object(
      'source', 'mention',
      'actor', jsonb_build_object(
        'id', shared.current_person_id(),
        'name', v_actor_name),
      'entity', jsonb_build_object(
        'type', v_comment.entity_type,
        'id', v_comment.entity_id,
        'route', v_route))
  );
  return v_id;
end;
$$;
comment on function mos.create_comment_mention_notification(uuid,uuid,text) is
  'Creates a same-org comment-mention notification with the persisted comment, session actor and selected locale.';
revoke execute on function mos.create_comment_mention_notification(uuid,uuid,text) from public, anon;
grant execute on function mos.create_comment_mention_notification(uuid,uuid,text) to authenticated;

-- Comment readers enter through the corresponding parent RLS policies.
drop policy comments_select on mos.comments;
create policy comments_select on mos.comments
  for select to authenticated
  using (
    org_id = shared.current_org_id()
    and case entity_type
      when 'task' then exists (
        select 1 from mos.tasks parent
         where parent.id = mos.comments.entity_id
           and parent.org_id = mos.comments.org_id
      )
      when 'signal' then mos.can_read_signal(entity_id)
      when 'weekly_update' then exists (
        select 1 from mos.weekly_updates parent
         where parent.id = mos.comments.entity_id
           and parent.org_id = mos.comments.org_id
      )
      when 'follow_up' then exists (
        select 1 from mos.follow_ups parent
         where parent.id = mos.comments.entity_id
           and parent.org_id = mos.comments.org_id
      )
      when 'daily_log' then exists (
        select 1 from ops.kitchen_logs parent
         where parent.id = mos.comments.entity_id
           and parent.org_id = mos.comments.org_id
      )
      else false
    end
  );
comment on policy comments_select on mos.comments is
  'Comments follow their parent row visibility and organization boundary.';

-- These predicates are implementation details of SECURITY DEFINER authority evaluators.
revoke execute on function shared.role_authority_scope(text,text) from public, anon, authenticated;
revoke execute on function shared.is_designated_team_lead(uuid,uuid) from public, anon, authenticated;
