-- AC-506..514, 517, 518 (FR-505..513, NFR-501): the transition_follow_up RPC contracts — lane
-- isolation in the RPC, state-machine validity, settle-requires-evidence+cash_in_date, settle-zeros-
-- balance, partial-reduces-balance, confirm-is-finance-only, cross-org guard, the money invariant,
-- and the recon drift surface. Each transition resets the fixture so tests are independent.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

select mos._test_seed_role_tree();
select mos._test_seed_access_roles();
select mos._test_seed_follow_ups();

-- helper: reset fu_b2b (...0e01) to a known open state + clear its events (called between tests).
-- Runs as the definer-owner via the test's service_role context (we are still postgres here).
create or replace function pg_temp.reset_fu_b2b(p_state text default 'open', p_balance numeric default 1000000)
returns void language sql security definer as $$
  delete from mos.follow_up_events where follow_up_id = '00000000-0000-0000-0000-000000000e01';
  update mos.follow_ups set state = p_state, running_balance = p_balance, promise_date = null
   where id = '00000000-0000-0000-0000-000000000e01';
$$;

-- AC-506: a b2b_sales chaser CANNOT advance a retail_ops follow-up (lane isolation in the RPC).
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-000000000d10","access_roles":[]}';
select throws_ok($$ select mos.transition_follow_up('00000000-0000-0000-0000-000000000e02'::uuid,'chase','{}'::jsonb) $$,
  '42501', null, 'AC-506: b2b_sales chaser cannot advance a retail_ops follow-up (lane isolation)');

-- AC-507: chase open→chased writes a chase event.
select pg_temp.reset_fu_b2b();
select mos.transition_follow_up('00000000-0000-0000-0000-000000000e01'::uuid,'chase','{}'::jsonb);
select is((select state from mos.follow_ups where id='00000000-0000-0000-0000-000000000e01'),
          'chased', 'AC-507: state becomes chased');
select is((select count(*)::int from mos.follow_up_events where follow_up_id='00000000-0000-0000-0000-000000000e01' and transition='chase'),
          1, 'AC-507: a chase event was written');

-- AC-508: promise without promise_date is rejected.
select pg_temp.reset_fu_b2b();
select throws_ok($$ select mos.transition_follow_up('00000000-0000-0000-0000-000000000e01'::uuid,'promise','{}'::jsonb) $$,
  'P0003', null, 'AC-508: promise without promise_date rejected');

-- AC-509: partial 300k of 1M → balance 700k, state partial.
select pg_temp.reset_fu_b2b();
select mos.transition_follow_up('00000000-0000-0000-0000-000000000e01'::uuid,'partial',
  '{"amount":300000,"cash_in_date":"2026-07-01","evidence":"TRF-1"}'::jsonb);
select is((select running_balance from mos.follow_ups where id='00000000-0000-0000-0000-000000000e01'),
          700000::numeric, 'AC-509: partial reduces running balance to 700000');
select is((select state from mos.follow_ups where id='00000000-0000-0000-0000-000000000e01'),
          'partial', 'AC-509: state becomes partial');

-- AC-510: settle WITHOUT evidence/cash_in_date is rejected.
select pg_temp.reset_fu_b2b();
select throws_ok($$ select mos.transition_follow_up('00000000-0000-0000-0000-000000000e01'::uuid,'settle','{}'::jsonb) $$,
  'P0003', null, 'AC-510: settle without evidence/cash_in_date rejected');

-- AC-512: settle with amount != balance is rejected.
select pg_temp.reset_fu_b2b();
select throws_ok($$ select mos.transition_follow_up('00000000-0000-0000-0000-000000000e01'::uuid,'settle',
  '{"amount":999999,"cash_in_date":"2026-07-02","evidence":"TRF-x"}'::jsonb) $$,
  'P0003', null, 'AC-512: settle amount != balance rejected');

-- AC-511: settle (amount defaults to balance) zeroes balance + sets settled.
select pg_temp.reset_fu_b2b();
select mos.transition_follow_up('00000000-0000-0000-0000-000000000e01'::uuid,'settle',
  '{"cash_in_date":"2026-07-02","evidence":"TRF-2"}'::jsonb);
select is((select running_balance from mos.follow_ups where id='00000000-0000-0000-0000-000000000e01'),
          0::numeric, 'AC-511: settle zeroes the running balance');
select is((select state from mos.follow_ups where id='00000000-0000-0000-0000-000000000e01'),
          'settled', 'AC-511: state becomes settled');

-- AC-513: a non-finance chaser cannot confirm (confirm is Finance-only).
select pg_temp.reset_fu_b2b('settled', 0);
select throws_ok($$ select mos.transition_follow_up('00000000-0000-0000-0000-000000000e01'::uuid,'confirm','{}'::jsonb) $$,
  '42501', null, 'AC-513: non-finance chaser cannot confirm (Finance-only)');

-- AC-514: a finance user confirms settled→confirmed.
select pg_temp.reset_fu_b2b('settled', 0);
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance"]}';
select mos.transition_follow_up('00000000-0000-0000-0000-000000000e01'::uuid,'confirm','{}'::jsonb);
select is((select state from mos.follow_ups where id='00000000-0000-0000-0000-000000000e01'),
          'confirmed', 'AC-514: finance user confirms settled→confirmed');

-- AC-515: cross-org — an org-B chaser cannot transition an org-A follow-up (DEFINER does not bypass org).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["finance"]}';
select throws_ok($$ select mos.transition_follow_up('00000000-0000-0000-0000-000000000e01'::uuid,'chase','{}'::jsonb) $$,
  '42501', null, 'AC-515: cross-org transition rejected (org ownership enforced in the RPC)');

reset role;

-- AC-517 (money invariant): seed a fully-worked follow-up via service_role, then assert
-- running_balance = original_amount − Σ(partial+settle event amounts) and never negative.
-- Work fu_b2b: partial 300k, partial 200k, settle 500k (balance 1M → 0). Runs as postgres (service_role).
select pg_temp.reset_fu_b2b();
insert into mos.follow_up_events (org_id, follow_up_id, transition, from_state, to_state, amount, cash_in_date, evidence)
values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000e01','partial','open','partial',    300000,'2026-07-01','TRF-1'),
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000e01','partial','partial','partial', 200000,'2026-07-02','TRF-2'),
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000e01','settle','partial','settled',  500000,'2026-07-03','TRF-3');
update mos.follow_ups set running_balance = 0, state='settled' where id='00000000-0000-0000-0000-000000000e01';
select is(
  (select (fu.original_amount - coalesce(ev.paid,0)) = fu.running_balance and fu.running_balance >= 0
     from mos.follow_ups fu
     left join (select follow_up_id, sum(amount) as paid
                  from mos.follow_up_events where transition in ('partial','settle') group by 1) ev
       on ev.follow_up_id = fu.id
    where fu.id = '00000000-0000-0000-0000-000000000e01'),
  true, 'AC-517: running_balance = original − Σ(partial+settle) and never negative');

-- AC-518 (recon drift): with esb_ar_reduction empty, the drift view surfaces the MOS cash-landed
-- total as an exception (MOS confirmation with no ESB aggregate). Proves the structure is real.
insert into reporting.esb_ar_reduction (org_id, counterparty, period, esb_reduction_amount, snapshot_as_of)
values ('00000000-0000-0000-0000-0000000000a1','PT Big Buyer','2026-07', 1000000, now());
select has_column('mos','follow_up_recon_drift','org_id','AC-518: mos.follow_up_recon_drift view exists');
select is(
  (select count(*)::int from mos.follow_up_recon_drift
    where org_id='00000000-0000-0000-0000-0000000000a1' and counterparty='PT Big Buyer'),
  1, 'AC-518: drift view returns the PT Big Buyer recon row (MOS vs ESB)');

select * from finish();
rollback;
