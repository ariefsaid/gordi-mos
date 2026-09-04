-- Signal attention is an optional capture value; keep the existing transactional post path atomic.
--
-- Reversal:
--   drop function if exists mos.create_signal_with_mentions(text, uuid, timestamptz, jsonb);
--   create or replace function mos.create_signal_with_mentions(
--     p_body text, p_owning_team_id uuid, p_occurred_at timestamptz, p_mentions jsonb default '[]'::jsonb
--   ) returns uuid
--   language plpgsql
--   security invoker
--   set search_path = ''
--   as $$
--   declare
--     v_id     uuid;
--     v_m      jsonb;
--     v_kind   text;
--     v_target uuid;
--   begin
--     -- Reject any out-of-org mention target before writing anything, so the caller gets one clear
--     -- per-target error rather than a policy denial that names nothing.
--     for v_m in select value from jsonb_array_elements(coalesce(p_mentions, '[]'::jsonb)) loop
--       v_kind := v_m->>'kind'; v_target := (v_m->>'targetId')::uuid;
--       if v_kind = 'person' then
--         if not exists (select 1 from shared.people where id = v_target and org_id = shared.current_org_id()) then
--           raise exception 'mention target person % is not in your org', v_target using errcode = '42501'; end if;
--       elsif v_kind = 'team' then
--         if not exists (select 1 from shared.teams where id = v_target and org_id = shared.current_org_id()) then
--           raise exception 'mention target team % is not in your org', v_target using errcode = '42501'; end if;
--       elsif v_kind = 'bu' then
--         if not exists (select 1 from shared.business_units where id = v_target and org_id = shared.current_org_id()) then
--           raise exception 'mention target bu % is not in your org', v_target using errcode = '42501'; end if;
--       else
--         raise exception 'unknown mention kind %', coalesce(v_kind, '(null)') using errcode = '22023';
--       end if;
--     end loop;
--
--     -- The id is generated here rather than taken from RETURNING, and that is not a style choice:
--     -- INSERT ... RETURNING re-applies the SELECT policy, whose definer read cannot see the row it just
--     -- inserted within the same command, so RETURNING would spuriously trip the fail-closed read gate.
--     v_id := gen_random_uuid();
--     insert into mos.signals (id, body, owning_team_id, occurred_at)
--     values (v_id, p_body, p_owning_team_id, p_occurred_at);
--
--     insert into mos.signal_mentions (signal_id, mention_kind, target_person_id, target_team_id, target_bu_id)
--     select v_id, m->>'kind',
--       case when m->>'kind' = 'person' then (m->>'targetId')::uuid end,
--       case when m->>'kind' = 'team'   then (m->>'targetId')::uuid end,
--       case when m->>'kind' = 'bu'     then (m->>'targetId')::uuid end
--     from jsonb_array_elements(coalesce(p_mentions, '[]'::jsonb)) as m;
--
--     perform mos.fan_out_signal_mention(v_id);
--     return v_id;
--   end;
--   $$;
--   comment on function mos.create_signal_with_mentions(text, uuid, timestamptz, jsonb) is
--     'Transactional Signal post — signal + mentions + fan-out in one statement, so a retry cannot double-post. SECURITY INVOKER: the existing RLS INSERT policies stay the authority.';
--   revoke execute on function mos.create_signal_with_mentions(text, uuid, timestamptz, jsonb) from public, anon;
--   grant  execute on function mos.create_signal_with_mentions(text, uuid, timestamptz, jsonb) to authenticated;

drop function if exists mos.create_signal_with_mentions(text, uuid, timestamptz, jsonb);

create or replace function mos.create_signal_with_mentions(
  p_body text, p_owning_team_id uuid, p_occurred_at timestamptz,
  p_mentions jsonb default '[]'::jsonb, p_attention text default 'FYI'
) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_id uuid;
  v_m jsonb;
  v_kind text;
  v_target uuid;
begin
  for v_m in select value from jsonb_array_elements(coalesce(p_mentions, '[]'::jsonb)) loop
    v_kind := v_m->>'kind'; v_target := (v_m->>'targetId')::uuid;
    if v_kind = 'person' then
      if not exists (select 1 from shared.people where id = v_target and org_id = shared.current_org_id()) then raise exception 'mention target is not in your org' using errcode = '42501'; end if;
    elsif v_kind = 'team' then
      if not exists (select 1 from shared.teams where id = v_target and org_id = shared.current_org_id()) then raise exception 'mention target is not in your org' using errcode = '42501'; end if;
    elsif v_kind = 'bu' then
      if not exists (select 1 from shared.business_units where id = v_target and org_id = shared.current_org_id()) then raise exception 'mention target is not in your org' using errcode = '42501'; end if;
    else raise exception 'unknown mention kind' using errcode = '22023'; end if;
  end loop;
  if p_attention not in ('FYI', 'Needs attention', 'Urgent') then raise exception 'invalid attention' using errcode = '22023'; end if;
  v_id := gen_random_uuid();
  insert into mos.signals (id, body, owning_team_id, occurred_at, attention)
    values (v_id, p_body, p_owning_team_id, p_occurred_at, p_attention);
  insert into mos.signal_mentions (signal_id, mention_kind, target_person_id, target_team_id, target_bu_id)
    select v_id, m->>'kind', case when m->>'kind' = 'person' then (m->>'targetId')::uuid end,
      case when m->>'kind' = 'team' then (m->>'targetId')::uuid end,
      case when m->>'kind' = 'bu' then (m->>'targetId')::uuid end
    from jsonb_array_elements(coalesce(p_mentions, '[]'::jsonb)) as m;
  perform mos.fan_out_signal_mention(v_id);
  return v_id;
end;
$$;

comment on function mos.create_signal_with_mentions(text, uuid, timestamptz, jsonb, text) is
  'Transactional Signal post — signal + mentions + fan-out in one statement, so a retry cannot double-post. SECURITY INVOKER: the existing RLS INSERT policies stay the authority. Attention is validated server-side and defaults to FYI.';
revoke execute on function mos.create_signal_with_mentions(text, uuid, timestamptz, jsonb, text) from public, anon;
grant execute on function mos.create_signal_with_mentions(text, uuid, timestamptz, jsonb, text) to authenticated;
