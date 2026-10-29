begin;
create or replace function mos.fan_out_signal_mention(p_signal_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := shared.current_org_id();
  v_sig mos.signals;
  v_person uuid;
  v_count int := 0;
  v_recipients uuid[];
  v_actor_name text;
begin
  select * into v_sig from mos.signals where id = p_signal_id and org_id = v_org;
  if v_sig.id is null then
    raise exception 'signal not found' using errcode = 'P0002';
  end if;
  if v_sig.author_id is distinct from shared.current_person_id() then
    raise exception 'only the author may fan out' using errcode = '42501';
  end if;

  select p.full_name into v_actor_name
    from shared.people p
   where p.id = v_sig.author_id and p.org_id = v_sig.org_id and p.archived_at is null;

  select array_agg(distinct pid) into v_recipients from (
    select sm.target_person_id as pid from mos.signal_mentions sm
      where sm.signal_id = p_signal_id and sm.revoked_at is null and sm.mention_kind = 'person'
    union
    select m.person_id from mos.signal_mentions sm
      join shared.team_memberships m on m.team_id = sm.target_team_id
      where sm.signal_id = p_signal_id and sm.revoked_at is null and sm.mention_kind = 'team'
        and m.effective_from <= current_date and (m.effective_to is null or m.effective_to >= current_date)
    union
    select m2.person_id from mos.signal_mentions sm
      join shared.teams tt on tt.business_unit_id = sm.target_bu_id
      join shared.team_memberships m2 on m2.team_id = tt.id
      where sm.signal_id = p_signal_id and sm.revoked_at is null and sm.mention_kind = 'bu'
        and shared.role_authority_allows('signal.tag', sm.target_bu_id, null, null)
        and m2.effective_from <= current_date and (m2.effective_to is null or m2.effective_to >= current_date)
    union
    select pr.person_id from mos.signal_mentions sm
      join shared.roles r on r.business_unit_id = sm.target_bu_id
      join shared.person_roles pr on pr.role_id = r.id
      where sm.signal_id = p_signal_id and sm.revoked_at is null and sm.mention_kind = 'bu'
        and shared.role_authority_allows('signal.tag', sm.target_bu_id, null, null)
  ) dedup
  where pid is not null and pid <> v_sig.author_id
    and not exists (
      select 1 from mos.notifications n
      where n.owner_id = dedup.pid
        and n.metadata ->> 'source' = 'signal_mention'
        and n.metadata #>> '{entity,id}' = p_signal_id::text);

  if v_recipients is null then return 0; end if;
  if array_length(v_recipients, 1) > 50 then
    raise exception 'fan-out exceeds cap of 50 recipients (%). Confirm before broadcasting.', array_length(v_recipients,1)
      using errcode = 'P0003';
  end if;
  foreach v_person in array v_recipients loop
    perform mos.create_notification(v_person, 'info', 'You were mentioned in a Signal',
      left(v_sig.body, 200), jsonb_build_object('source','signal_mention',
        'actor', jsonb_build_object('id', v_sig.author_id, 'name', v_actor_name),
        'entity', jsonb_build_object('type','signal','id', v_sig.id, 'route', '/work/signals?record=' || v_sig.id)));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
comment on function mos.fan_out_signal_mention(uuid) is
  'Author-only @mention fan-out; foreign and missing Signal ids share the same no-record response. BU delivery keeps signal.tag authority, and notification metadata retains the author actor.';
revoke execute on function mos.fan_out_signal_mention(uuid) from public, anon, authenticated;
grant execute on function mos.fan_out_signal_mention(uuid) to authenticated;

commit;
