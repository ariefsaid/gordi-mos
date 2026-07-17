-- CQ IMPORTANT-1 + SECURITY LOW-1/LOW-2 fix (Step-4 review).
--
-- IMPORTANT-1 (atomicity): the DAL used to post a Signal in three separate PostgREST calls (insert
-- signal → insert mentions → fan-out RPC). A failure after the signal insert left a committed Signal,
-- and the composer's retry double-posted. mos.create_signal_with_mentions folds the whole post into
-- ONE transactional statement, so a failure anywhere rolls the Signal back and a retry is safe.
--
-- SECURITY INVOKER (not DEFINER): the function inserts into mos.signals + mos.signal_mentions, both of
-- which already carry fail-closed RLS INSERT policies (author-self + org pin + can('signal.create') +
-- can_post_signal_for_team; author-of-parent + org-target + @BU cap). Running as the invoker keeps
-- those policies as the authority — no gate is re-implemented or bypassed. It calls the existing
-- SECURITY DEFINER fan_out_signal_mention internally (author-only asserted there; the caller IS the
-- author). org_id/author_id stay DB-default-stamped in the caller's context.
--
-- LOW-1 (mention target validation): every mention target must exist in the caller's org. Enforced in
-- BOTH places — the RPC (a clear per-target error) AND the signal_mentions_insert WITH CHECK (so a
-- direct PostgREST insert is gated identically, not just the RPC path).
--
-- LOW-2 (idempotent fan-out): fan_out_signal_mention now skips any recipient who already holds a
-- notification for this Signal, so a repeated call (retry, double-tap) cannot notification-flood.

-- ── LOW-1: gate mention-target org membership at the RLS layer (covers direct inserts too) ────────
drop policy signal_mentions_insert on mos.signal_mentions;
create policy signal_mentions_insert on mos.signal_mentions for insert to authenticated
  with check (org_id = shared.current_org_id()
    and exists (select 1 from mos.signals s where s.id = signal_id and s.author_id = shared.current_person_id())
    and (mention_kind <> 'bu' or shared.can('signal.mention_bu'))
    and case mention_kind
      when 'person' then exists (select 1 from shared.people p          where p.id = target_person_id and p.org_id = shared.current_org_id())
      when 'team'   then exists (select 1 from shared.teams t           where t.id = target_team_id   and t.org_id = shared.current_org_id())
      when 'bu'     then exists (select 1 from shared.business_units b   where b.id = target_bu_id     and b.org_id = shared.current_org_id())
      else false end);

-- ── LOW-2: make the fan-out idempotent (skip already-notified recipients for this Signal) ─────────
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

  -- Deduplicated recipient set (exclude the author). @Person=self; @Team=active members; @BU=active
  -- members of child Teams + BU-scoped-Role holders. @BU re-checks signal.mention_bu (fail-closed).
  -- LOW-2: a recipient already holding a notification for THIS Signal is skipped (idempotent re-run).
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
        'entity', jsonb_build_object('type','signal','id', v_sig.id, 'route', '/work/signals?record=' || v_sig.id)));
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke execute on function mos.fan_out_signal_mention(uuid) from public, anon, authenticated;
grant  execute on function mos.fan_out_signal_mention(uuid) to authenticated;

-- ── IMPORTANT-1: the ONE transactional post path (signal + mentions + fan-out) ────────────────────
create or replace function mos.create_signal_with_mentions(
  p_body text, p_owning_team_id uuid, p_occurred_at timestamptz, p_mentions jsonb default '[]'::jsonb
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid; v_m jsonb; v_kind text; v_target uuid;
begin
  -- LOW-1: reject any mention target that is not a current-org row before writing anything.
  for v_m in select value from jsonb_array_elements(coalesce(p_mentions, '[]'::jsonb)) loop
    v_kind := v_m->>'kind'; v_target := (v_m->>'targetId')::uuid;
    if v_kind = 'person' then
      if not exists (select 1 from shared.people where id = v_target and org_id = shared.current_org_id()) then
        raise exception 'mention target person % is not in your org', v_target using errcode = '42501'; end if;
    elsif v_kind = 'team' then
      if not exists (select 1 from shared.teams where id = v_target and org_id = shared.current_org_id()) then
        raise exception 'mention target team % is not in your org', v_target using errcode = '42501'; end if;
    elsif v_kind = 'bu' then
      if not exists (select 1 from shared.business_units where id = v_target and org_id = shared.current_org_id()) then
        raise exception 'mention target bu % is not in your org', v_target using errcode = '42501'; end if;
    else
      raise exception 'unknown mention kind %', coalesce(v_kind, '(null)') using errcode = '22023';
    end if;
  end loop;

  -- Signal insert (RLS signals_insert gates author/org/team; org_id/author_id default-stamped). The id
  -- is generated here rather than via RETURNING: an INSERT...RETURNING re-applies the SELECT policy
  -- (can_read_signal), whose DEFINER self-query cannot see the just-inserted row within the same
  -- command, so RETURNING would spuriously fail the fail-closed read gate. Explicit id sidesteps that.
  v_id := gen_random_uuid();
  insert into mos.signals (id, body, owning_team_id, occurred_at)
  values (v_id, p_body, p_owning_team_id, p_occurred_at);

  -- Mentions (RLS signal_mentions_insert re-gates author-of-parent + org-target + @BU cap).
  insert into mos.signal_mentions (signal_id, mention_kind, target_person_id, target_team_id, target_bu_id)
  select v_id, m->>'kind',
    case when m->>'kind' = 'person' then (m->>'targetId')::uuid end,
    case when m->>'kind' = 'team'   then (m->>'targetId')::uuid end,
    case when m->>'kind' = 'bu'     then (m->>'targetId')::uuid end
  from jsonb_array_elements(coalesce(p_mentions, '[]'::jsonb)) as m;

  perform mos.fan_out_signal_mention(v_id);
  return v_id;
end $$;
comment on function mos.create_signal_with_mentions(text, uuid, timestamptz, jsonb) is
  'Transactional Signal post (signal + mentions + fan-out). SECURITY INVOKER — existing RLS INSERT policies stay the authority; calls the DEFINER fan-out internally. Validates mention targets in-org (LOW-1).';
revoke execute on function mos.create_signal_with_mentions(text, uuid, timestamptz, jsonb) from public, anon;
grant  execute on function mos.create_signal_with_mentions(text, uuid, timestamptz, jsonb) to authenticated;

-- DOWN (manual, pre-production):
-- drop function if exists mos.create_signal_with_mentions(text, uuid, timestamptz, jsonb);
-- restore mos.fan_out_signal_mention from 20260716000004 (without the idempotency filter);
-- restore signal_mentions_insert from 20260716000003 (without the org-target case).
