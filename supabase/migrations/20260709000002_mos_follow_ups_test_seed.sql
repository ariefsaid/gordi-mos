-- Follow-up bridge test-support fixture: mos._test_seed_follow_ups(). SECURITY DEFINER so it can
-- write under RLS; called ONLY inside a begin;...rollback; pgTAP transaction, AFTER
-- _test_seed_role_tree() + _test_seed_access_roles(). Seeds coded BUs (b2b_sales / retail_ops) under
-- WU-A, two lane chasers, and open follow-ups (b2b_ar + retail_pending) + a foreign-org follow-up
-- for cross-org isolation. Author (...0d01) keeps her seeded finance grant → the confirm caller.
create or replace function mos._test_seed_follow_ups()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- coded team BUs under WU-A (...0a1)
  insert into shared.business_units (id, org_id, name, code) values
    ('00000000-0000-0000-0000-000000000a10','00000000-0000-0000-0000-0000000000a1','FU B2B Sales','b2b_sales'),
    ('00000000-0000-0000-0000-000000000a11','00000000-0000-0000-0000-0000000000a1','FU Retail Ops','retail_ops')
  on conflict (id) do nothing;

  -- lane lead roles in those BUs
  insert into shared.roles (id, org_id, business_unit_id, name, reports_to_role_id) values
    ('00000000-0000-0000-0000-000000000f10','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000a10','FU Sales Lead',  '00000000-0000-0000-0000-0000000000f1'),
    ('00000000-0000-0000-0000-000000000f11','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000a11','FU Retail Lead', '00000000-0000-0000-0000-0000000000f1')
  on conflict (id) do nothing;

  -- two lane chasers
  insert into shared.people (id, org_id, full_name) values
    ('00000000-0000-0000-0000-000000000d10','00000000-0000-0000-0000-0000000000a1','SalesChaser'),
    ('00000000-0000-0000-0000-000000000d11','00000000-0000-0000-0000-0000000000a1','RetailChaser')
  on conflict (id) do nothing;

  insert into shared.person_roles (org_id, person_id, role_id) values
    ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000d10','00000000-0000-0000-0000-000000000f10'),
    ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000d11','00000000-0000-0000-0000-000000000f11')
  on conflict (person_id, role_id) do nothing;

  -- open follow-ups: one b2b_ar (lane b2b_sales), one retail_pending (lane retail_ops)
  insert into mos.follow_ups
    (id, org_id, counterparty, kind, lane, source_invoice_ref, original_amount, running_balance, state, issued_date, due_date)
  values
    ('00000000-0000-0000-0000-000000000e01','00000000-0000-0000-0000-0000000000a1','PT Big Buyer','b2b_ar','b2b_sales','INV-1001', 1000000, 1000000, 'open', '2026-06-01','2026-06-30'),
    ('00000000-0000-0000-0000-000000000e02','00000000-0000-0000-0000-0000000000a1','Pak Regular','retail_pending','retail_ops','TAB-2002', 250000, 250000, 'open', '2026-06-15', null);

  -- a foreign-org follow-up (WU-B) for cross-org isolation
  insert into mos.follow_ups
    (id, org_id, counterparty, kind, lane, source_invoice_ref, original_amount, running_balance, state)
  values
    ('00000000-0000-0000-0000-000000000e03','00000000-0000-0000-0000-0000000000b1','Foreign Co','b2b_ar','b2b_sales','INV-F-1', 500000, 500000, 'open');
end;
$$;
comment on function mos._test_seed_follow_ups() is
  'TEST-ONLY fixture (SECURITY DEFINER): coded BUs + lane chasers + open follow-ups for the follow-up pgTAP suite. Call after _test_seed_role_tree() + _test_seed_access_roles(), inside begin;...rollback;.';

revoke execute on function mos._test_seed_follow_ups() from public, anon, authenticated;

-- DOWN: drop function mos._test_seed_follow_ups();
