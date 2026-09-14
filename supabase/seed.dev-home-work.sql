-- DEV ONLY: explicit ownership for fictional demo Tasks and ordinary Barista work.
-- These mappings define demo scenarios. They are not a migration rule for historical Tasks.
update mos.tasks task
set team_id = team.id, business_unit_id = team.business_unit_id
from (values
  ('Dial in new Brazil single-origin', 'roastery_team'),
  ('Update espresso recipe cards', 'gordi_hq_bar'),
  ('Photograph new pastry line', 'gordi_hq_kitchen'),
  ('Q3 wholesale price list', 'b2b_sales_team'),
  ('Replace grinder burrs (Cafe 2)', 'gordi_hq_bar'),
  ('Source compostable cups vendor', 'finance_team'),
  ('Plan barista latte-art workshop', 'gordi_hq_bar'),
  ('Roastery extractor PM schedule', 'roastery_team'),
  ('Draft Q3 OKRs for cafe team', 'gordi_hq_bar'),
  ('Refit cold brew taps', 'gordi_hq_kitchen'),
  ('Migrate POS to v4', 'b2b_sales_team')
) as scenario(title, team_code)
join shared.teams team on team.code = scenario.team_code
  and team.org_id = '10000000-0000-0000-0000-000000000001'
where task.org_id = team.org_id and task.title = scenario.title
  and task.team_id is null;

insert into mos.tasks (
  id, org_id, title, business_unit_id, team_id, status,
  responsible_person_id, accountable_person_id, description, due_date, created_by
)
select scenario.id::uuid, member.org_id, scenario.title, team.business_unit_id, team.id, 'Open',
  member.id, lead.id, scenario.description, (now() at time zone 'Asia/Jakarta')::date, lead.id
from (values
  ('e9000000-0000-0000-0000-000000000001', 'Check the espresso recipe before service',
   'Taste the opening espresso and record dose, yield and brew time on the bar card.'),
  ('e9000000-0000-0000-0000-000000000002', 'Prepare the bar handover',
   'Restock the bar and leave the next shift a short note about anything that needs attention.')
) as scenario(id, title, description)
join shared.people member on member.email = 'bulan.dev@example.test'
join shared.people lead on lead.email = 'cahya.dev@example.test' and lead.org_id = member.org_id
join shared.teams team on team.code = 'gordi_hq_bar' and team.org_id = member.org_id
where member.org_id = '10000000-0000-0000-0000-000000000001'
on conflict (id) do nothing;
