-- ADR-0050 D6: synchronous DEFINER fan-out. Author-only; dedup recipients; cap 50 (reject above → client confirms);
-- deliver via mos.create_notification (org-walled). No retroactive notify (recipients snapshotted at post).
create or replace function mos.fan_out_signal_mention(p_signal_id uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare v_sig mos.signals; v_person uuid; v_count int := 0; v_recipients uuid[];
begin
  select * into v_sig from mos.signals where id = p_signal_id;
  if v_sig.id is null then raise exception 'signal not found' using errcode = 'P0002'; end if;
  if v_sig.org_id is distinct from shared.current_org_id() then
    raise exception 'cannot fan out a signal outside your org' using errcode = '42501'; end if;
  if v_sig.author_id is distinct from shared.current_person_id() then
    raise exception 'only the author may fan out' using errcode = '42501'; end if;

  -- Deduplicated recipient set (exclude the author). @Person=self; @Team=active members; @BU=active members of
  -- child Teams + BU-scoped-Role holders. @BU re-checks signal.mention_bu (fail-closed).
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
      where sm.signal_id = p_signal_id and sm.revoked_at is null and sm.mention_kind = 'bu' and shared.can('signal.mention_bu')
        and m2.effective_from <= current_date and (m2.effective_to is null or m2.effective_to >= current_date)
    union
    select pr.person_id from mos.signal_mentions sm
      join shared.roles r on r.business_unit_id = sm.target_bu_id
      join shared.person_roles pr on pr.role_id = r.id
      where sm.signal_id = p_signal_id and sm.revoked_at is null and sm.mention_kind = 'bu' and shared.can('signal.mention_bu')
  ) dedup where pid is not null and pid <> v_sig.author_id;

  if v_recipients is null then return 0; end if;
  if array_length(v_recipients, 1) > 50 then
    raise exception 'fan-out exceeds cap of 50 recipients (%). Confirm before broadcasting.', array_length(v_recipients,1)
      using errcode = 'P0003';
  end if;

  foreach v_person in array v_recipients loop
    perform mos.create_notification(v_person, 'info', 'You were mentioned in a Signal',
      left(v_sig.body, 200), jsonb_build_object('source','signal_mention',
        'entity', jsonb_build_object('type','signal','id', v_sig.id, 'route', '/work/signals?record=' || v_sig.id)));
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke execute on function mos.fan_out_signal_mention(uuid) from public, anon, authenticated;
grant  execute on function mos.fan_out_signal_mention(uuid) to authenticated;
-- DOWN: drop function if exists mos.fan_out_signal_mention(uuid);
