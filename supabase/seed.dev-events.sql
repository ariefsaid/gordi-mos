-- DEV ONLY: keeps /work/events populated after reset.
do $$
declare v_org uuid; v_person uuid; v_bu uuid;
begin
  if exists (select 1 from mos.events limit 1) then return; end if;
  select org_id, id into v_org, v_person from shared.people where email = 'dewi.dev@example.test';
  select id into v_bu from shared.business_units where org_id = v_org order by name limit 1;
  insert into mos.events (org_id, title, venue, is_outbound, starts_at, ends_at, note, business_unit_id, coordinator_person_id, created_by) values
    (v_org, 'Team planning session', 'HQ', false, date_trunc('month', now()) + interval '5 days 02 hours', date_trunc('month', now()) + interval '5 days 04 hours', 'Monthly planning.', v_bu, v_person, v_person),
    (v_org, 'Client booking', 'Client venue', true, date_trunc('month', now()) + interval '12 days 03 hours', date_trunc('month', now()) + interval '12 days 06 hours', null, v_bu, v_person, v_person),
    (v_org, 'Community workshop', 'HQ', false, date_trunc('month', now()) + interval '18 days 01 hours', date_trunc('month', now()) + interval '18 days 03 hours', null, v_bu, v_person, v_person),
    (v_org, 'Next month briefing', 'HQ', false, date_trunc('month', now()) + interval '1 month 2 days', date_trunc('month', now()) + interval '1 month 2 days 02 hours', null, v_bu, v_person, v_person);
end $$;
