-- Reconcile attendance corrections and route cover claims to eligible deciders.
-- DOWN: supabase/rollbacks/20261029002200_ops_staff_attendance_cover_controls.sql

create or replace function ops.correct_attendance_record(
  p_person_id uuid, p_shift_start_at timestamptz, p_clock_in_at timestamptz, p_clock_out_at timestamptz, p_reason text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := shared.current_org_id(); v_actor uuid := shared.current_person_id(); v_now timestamptz := ops._attendance_now();
  v_shift record; r ops.attendance_records; v_before jsonb; v_set ops.attendance_settings; v_in timestamptz; v_out timestamptz;
  v_outcome jsonb;
  v_late boolean; v_early boolean; v_status text; v_team uuid; v_id uuid;
begin
  if v_org is null or v_actor is null or not shared.is_org_member() then raise exception 'STAFF_FORBIDDEN' using errcode = '42501'; end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'STAFF_REASON_REQUIRED' using errcode = '22023'; end if;
  if p_person_id is null or p_shift_start_at is null then raise exception 'STAFF_CLOCK_INVALID' using errcode = '22023'; end if;
  -- Serialize with the no-show scheduler so a correction cannot race its insert.
  perform pg_advisory_xact_lock(hashtextextended('ops-staff-attendance-jobs', 0));
  -- Nobody corrects their own record, whatever their role.
  if p_person_id = v_actor then raise exception 'STAFF_ATTENDANCE_FORBIDDEN' using errcode = '42501'; end if;
  select * into r from ops.attendance_records where org_id = v_org and person_id = p_person_id and shift_start_at = p_shift_start_at for update;
  if found then
    v_team := r.team_id;
  else
    select s.* into v_shift from ops._attendance_shifts_between(v_org, p_shift_start_at, p_shift_start_at + interval '1 second') s
     where s.person_id = p_person_id and s.start_at = p_shift_start_at limit 1;
    if not found then raise exception 'STAFF_SHIFT_NOT_FOUND' using errcode = 'P0002'; end if;
    v_team := v_shift.team_id;
  end if;
  if not (shared.has_access_role('hr') or shared.is_designated_team_lead(v_team, v_actor)) then raise exception 'STAFF_ATTENDANCE_FORBIDDEN' using errcode = '42501'; end if;
  v_in := coalesce(p_clock_in_at, r.clock_in_at);
  v_out := coalesce(p_clock_out_at, r.clock_out_at);
  if v_in is null then raise exception 'STAFF_CLOCK_INVALID' using errcode = '22023'; end if;
  if v_out is not null and v_out <= v_in then raise exception 'STAFF_CLOCK_INVALID' using errcode = '22023'; end if;
  v_set := ops._attendance_settings_at(v_org, p_shift_start_at);
  v_status := case when v_out is not null then 'out' when r.status = 'closed' then 'closed' else 'in' end;
  if r.id is null then
    insert into ops.attendance_records (org_id, person_id, team_id, site_id, shift_start_at, shift_end_at, status, clock_in_at, clock_out_at,
      grace_min, late, late_minutes, early_leave, early_minutes, source, created_at, updated_at)
    values (v_org, p_person_id, v_team, v_shift.site_id, v_shift.start_at, v_shift.end_at, v_status, v_in, v_out, v_set.late_grace_min,
      false, null, false, null, 'correction', v_now, v_now)
    returning * into r;
    v_before := null;
  else
    v_before := jsonb_build_object('status', r.status, 'clock_in_at', r.clock_in_at, 'clock_out_at', r.clock_out_at, 'late', r.late,
      'early_leave', r.early_leave, 'closure', r.closure);
  end if;
  v_late := v_in > r.shift_start_at + coalesce(r.grace_min, v_set.late_grace_min) * interval '1 minute';
  v_early := v_out is not null and v_out < r.shift_end_at;
  update ops.attendance_records set status = v_status, clock_in_at = v_in, clock_out_at = v_out,
    late = v_late, late_minutes = case when v_late then floor(extract(epoch from (v_in - r.shift_start_at)) / 60)::integer else null end,
    early_leave = v_early, early_minutes = case when v_early then ceil(extract(epoch from (r.shift_end_at - v_out)) / 60)::integer else null end,
    closure = case when v_out is not null then null else r.closure end, source = 'correction', updated_at = v_now
   where id = r.id returning id into v_id;
  delete from ops.staff_shift_outcomes
   where org_id = v_org and person_id = p_person_id and shift_start_at = p_shift_start_at and outcome = 'no_show'
   returning to_jsonb(staff_shift_outcomes) into v_outcome;
  if v_outcome is not null then
    v_before := coalesce(v_before, '{}'::jsonb) || jsonb_build_object('reconciled_no_show', v_outcome);
  end if;
  insert into ops.attendance_record_history (org_id, record_id, changed_by, reason, before_state, after_state, created_at)
  select v_org, rec.id, v_actor, btrim(p_reason), v_before,
    jsonb_build_object('status', rec.status, 'clock_in_at', rec.clock_in_at, 'clock_out_at', rec.clock_out_at, 'late', rec.late,
      'early_leave', rec.early_leave, 'closure', rec.closure), v_now
    from ops.attendance_records rec where rec.id = v_id;
  return v_id;
end;
$$;

create or replace function ops.claim_staff_shift(p_offer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_org uuid := shared.current_org_id(); v_actor uuid := shared.current_person_id(); v_offer ops.staff_shift_offers; v_shift ops.staff_shifts; v_err text; v_id uuid; v_name text; v_rcpt uuid;
begin
  if v_org is null or v_actor is null or not shared.is_org_member() then raise exception 'STAFF_FORBIDDEN' using errcode = '42501'; end if;
  -- The offer row lock serialises claimants: whoever gets it second sees 'claimed' and loses.
  select * into v_offer from ops.staff_shift_offers where id = p_offer_id and org_id = v_org for update;
  if v_offer.id is null then raise exception 'STAFF_OFFER_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_offer.status = 'claimed' then raise exception 'STAFF_CLAIM_TAKEN' using errcode = '23505'; end if;
  if v_offer.status <> 'open' then raise exception 'STAFF_OFFER_CLOSED' using errcode = 'P0003'; end if;
  select * into v_shift from ops.staff_shifts where id = v_offer.shift_id and org_id = v_org and removed_at is null;
  if v_shift.id is null then raise exception 'STAFF_OFFER_CLOSED' using errcode = 'P0003'; end if;
  if v_shift.start_at <= ops._attendance_now() then raise exception 'STAFF_SHIFT_STARTED' using errcode = '22023'; end if;
  v_err := ops._attendance_cover_eligible(v_org, v_shift, v_actor);
  if v_err is not null then raise exception '%', v_err using errcode = case v_err when 'STAFF_SHIFT_OVERLAP' then '23P01' else '42501' end; end if;
  insert into ops.staff_shift_claims (org_id, offer_id, claimant_id) values (v_org, v_offer.id, v_actor) returning id into v_id;
  update ops.staff_shift_offers set status = 'claimed' where id = v_offer.id;
  select full_name into v_name from shared.people where org_id = v_org and id = v_actor;
  for v_rcpt in select r from ops._attendance_deciders(v_org, v_shift.team_id, v_actor) as r loop
    perform ops._attendance_notify(v_org, v_rcpt, 'info', 'Cover claimed / Pengganti mengambil shift',
    v_name || ' wants to cover the shift on ' || to_char(v_shift.local_date, 'DD Mon') || '. Confirm or choose someone else. / ' || v_name || ' ingin menggantikan shift ' || to_char(v_shift.local_date, 'DD Mon') || '. Konfirmasi atau pilih orang lain.',
    'staff_claim', v_id, '/work/shifts/inbox');
  end loop;
  return v_id;
exception when unique_violation then
  raise exception 'STAFF_CLAIM_TAKEN' using errcode = '23505';
end;
$$;

create or replace function ops.list_staff_cover_queue()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid := shared.current_org_id(); v_actor uuid := shared.current_person_id(); v_now timestamptz := ops._attendance_now();
  v_admin boolean; v_unled boolean; v_teams uuid[];
begin
  if v_org is null or v_actor is null or not shared.is_org_member() then raise exception 'STAFF_FORBIDDEN' using errcode = '42501'; end if;
  v_admin := shared.has_access_role('admin');
  v_unled := shared.has_access_role('hr') and shared.can('attendance.receive_unled');
  select coalesce(array_agg(t.id), '{}') into v_teams from shared.teams t
   where t.org_id = v_org and t.archived_at is null
     and (v_admin or shared.is_designated_team_lead(t.id, v_actor)
       or (v_unled and not exists (select 1 from shared.team_lead_assignments a where a.org_id = t.org_id and a.team_id = t.id)));
  return jsonb_build_object(
    'absences', coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'person_name',p.full_name,'team_name',t.name,'kind',a.kind,'local_date',a.local_date,
        'start_at',a.shift_start_at,'end_at',a.shift_end_at,'reason',a.reason,'can_decide',ops._attendance_can_decide(a.team_id, a.person_id)) order by a.local_date, a.created_at)
      from ops.staff_absences a join shared.people p on p.org_id = a.org_id and p.id = a.person_id join shared.teams t on t.org_id = a.org_id and t.id = a.team_id
      where a.org_id = v_org and a.status = 'pending' and (a.team_id = any(v_teams)
        or (ops._attendance_requester_tier(v_org, a.person_id) <> 'staff' and ops._attendance_can_decide(a.team_id, a.person_id)))), '[]'::jsonb),
    'claims', coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'offer_kind',o.kind,'claimant_name',cp.full_name,'person_name',p.full_name,'team_name',t.name,
        'local_date',s.local_date,'start_at',s.start_at,'end_at',s.end_at,'can_decide',ops._attendance_can_decide(s.team_id, c.claimant_id)) order by s.start_at)
      from ops.staff_shift_claims c join ops.staff_shift_offers o on o.org_id = c.org_id and o.id = c.offer_id
      join ops.staff_shifts s on s.org_id = o.org_id and s.id = o.shift_id
      join shared.people cp on cp.org_id = c.org_id and cp.id = c.claimant_id join shared.people p on p.org_id = s.org_id and p.id = s.person_id
      join shared.teams t on t.org_id = s.org_id and t.id = s.team_id
      where c.org_id = v_org and c.status = 'pending' and (s.team_id = any(v_teams)
        or (ops._attendance_requester_tier(v_org, c.claimant_id) <> 'staff' and ops._attendance_can_decide(s.team_id, c.claimant_id)))), '[]'::jsonb),
    'uncovered', coalesce((select jsonb_agg(jsonb_build_object('offer_id',o.id,'offer_kind',o.kind,'person_id',s.person_id,'person_name',p.full_name,'team_name',t.name,'team_id',t.id,'site_id',s.site_id,
        'local_date',s.local_date,'start_at',s.start_at,'end_at',s.end_at,'can_decide',ops._attendance_can_lead(s.team_id)) order by s.start_at)
      from ops.staff_shift_offers o join ops.staff_shifts s on s.org_id = o.org_id and s.id = o.shift_id and s.removed_at is null and s.end_at > v_now
      join shared.people p on p.org_id = s.org_id and p.id = s.person_id join shared.teams t on t.org_id = s.org_id and t.id = s.team_id
      where o.org_id = v_org and o.status = 'open' and s.team_id = any(v_teams)), '[]'::jsonb),
    'sick', coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'person_name',p.full_name,'team_name',t.name,'local_date',a.local_date,'documented',a.note_path is not null) order by a.local_date desc)
      from ops.staff_absences a join shared.people p on p.org_id = a.org_id and p.id = a.person_id join shared.teams t on t.org_id = a.org_id and t.id = a.team_id
      where a.org_id = v_org and a.kind = 'sick' and a.flagged and a.status = 'accepted' and a.local_date >= (v_now at time zone 'Asia/Jakarta')::date - 7 and a.team_id = any(v_teams)), '[]'::jsonb),
    'candidates', coalesce((select jsonb_agg(jsonb_build_object('person_id',p.id,'full_name',p.full_name,'site_id',t.site_id) order by p.full_name)
      from (select distinct m.person_id, mt.site_id from shared.team_memberships m join shared.teams mt on mt.org_id = m.org_id and mt.id = m.team_id and mt.archived_at is null
        where m.org_id = v_org and mt.site_id is not null and m.effective_from <= (v_now at time zone 'Asia/Jakarta')::date + 14
          and (m.effective_to is null or m.effective_to >= (v_now at time zone 'Asia/Jakarta')::date)) t
      join shared.people p on p.org_id = v_org and p.id = t.person_id and p.archived_at is null
      where t.site_id in (select tt.site_id from shared.teams tt where tt.id = any(v_teams))), '[]'::jsonb)
  );
end;
$$;

revoke execute on function ops.correct_attendance_record(uuid, timestamptz, timestamptz, timestamptz, text) from public, anon;
grant execute on function ops.correct_attendance_record(uuid, timestamptz, timestamptz, timestamptz, text) to authenticated;
revoke execute on function ops.claim_staff_shift(uuid) from public, anon;
grant execute on function ops.claim_staff_shift(uuid) to authenticated;
revoke execute on function ops.list_staff_cover_queue() from public, anon;
grant execute on function ops.list_staff_cover_queue() to authenticated;
