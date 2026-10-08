-- #1467 AC-1122: Finance labels are a MOS overlay keyed to one copied pending bill.
begin;
create extension if not exists pgtap with schema extensions;
select plan(46);

select shared._test_seed_directory();

\set org_a '00000000-0000-0000-0000-0000000000a1'
\set org_b '00000000-0000-0000-0000-0000000000b1'
\set finance_a '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}'
\set member_a  '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}'
\set finance_b '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member","finance"]}'

select has_table('mos', 'pending_bill_finance_labels', 'the Finance label overlay exists');
select has_function('mos', 'set_pending_bill_finance_label', ARRAY['text','text','text','text'], 'one Finance label writer exists');
select is((select prosecdef from pg_proc where oid = 'mos.set_pending_bill_finance_label(text,text,text,text)'::regprocedure),
  true, 'the Finance label writer is SECURITY DEFINER');
select ok((select 'search_path=""' = any(proconfig) from pg_proc
  where oid = 'mos.set_pending_bill_finance_label(text,text,text,text)'::regprocedure),
  'the Finance label writer pins an empty search_path');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'mos.pending_bill_finance_labels'::regclass),
  'the overlay enables and forces RLS');
select ok(has_table_privilege('authenticated', 'mos.pending_bill_finance_labels', 'SELECT'),
  'authenticated can request a label read, subject to Finance RLS');
select ok(not has_table_privilege('authenticated', 'mos.pending_bill_finance_labels', 'INSERT'), 'Finance has no direct label INSERT privilege');
select ok(not has_table_privilege('authenticated', 'mos.pending_bill_finance_labels', 'UPDATE'), 'Finance has no direct label UPDATE privilege');
select ok(not has_table_privilege('authenticated', 'mos.pending_bill_finance_labels', 'DELETE'), 'Finance has no direct label DELETE privilege');
select ok(not has_table_privilege('anon', 'mos.pending_bill_finance_labels', 'SELECT'), 'anonymous sessions cannot read the overlay');
select ok(has_function_privilege('authenticated', 'mos.set_pending_bill_finance_label(text,text,text,text)', 'EXECUTE'),
  'authenticated may call the gated label writer');
select ok(not has_function_privilege('anon', 'mos.set_pending_bill_finance_label(text,text,text,text)', 'EXECUTE'),
  'anonymous sessions cannot execute the label writer');
select is((select count(*)::int from pg_policies where schemaname = 'mos' and tablename = 'pending_bill_finance_labels'),
  1, 'the overlay has one Finance-scoped read policy');

insert into reporting.pending_bills (org_id, esb_code, branch_code, bill_no, bill_date, counterparty_note, amount, source_state, snapshot_as_of)
values
  (:'org_a', 'ESB-LABEL', 'BR-LABEL', 'PB-LABEL-A', current_date - 1, 'Original ESB note', 1000, 'present', now()),
  (:'org_b', 'ESB-LABEL', 'BR-LABEL', 'PB-LABEL-B', current_date - 1, 'Other org note', 2000, 'present', now());

set local role authenticated;
select shared._test_set_access_roles(:'finance_a');
select lives_ok($$select mos.set_pending_bill_finance_label('ESB-LABEL','BR-LABEL','PB-LABEL-A','  Owner Sari  ')$$,
  'Finance sets the label for a bill in the current org');
select is((select finance_label from mos.pending_bill_finance_labels where bill_no = 'PB-LABEL-A'),
  'Owner Sari', 'the writer trims the label before storing it');
select lives_ok($$select mos.set_pending_bill_finance_label('ESB-LABEL','BR-LABEL','PB-LABEL-A','Sari - Cafe Owner')$$,
  'Finance replaces the existing label');
select is((select count(*)::int from mos.pending_bill_finance_labels where bill_no = 'PB-LABEL-A'),
  1, 'replacing a label preserves one row for the bill identity');
select is((select finance_label from mos.pending_bill_finance_labels where bill_no = 'PB-LABEL-A'),
  'Sari - Cafe Owner', 'the replacement becomes the current label');
select throws_ok($$select mos.set_pending_bill_finance_label('ESB-LABEL','BR-LABEL','PB-LABEL-A',pg_catalog.repeat('x',61))$$,
  '23514', 'Finance label must be 60 characters or fewer.', 'the writer rejects labels longer than 60 characters');
select lives_ok($$select mos.set_pending_bill_finance_label('ESB-LABEL','BR-LABEL','PB-LABEL-A','   ')$$,
  'space-only input clears a label');
select is((select count(*)::int from mos.pending_bill_finance_labels where bill_no = 'PB-LABEL-A'),
  0, 'clearing removes the sparse overlay row');
select lives_ok($$select mos.set_pending_bill_finance_label('ESB-LABEL','BR-LABEL','PB-LABEL-A',E'\t')$$,
  'tab-only input clears a label');
select is((select count(*)::int from mos.pending_bill_finance_labels where bill_no = 'PB-LABEL-A'),
  0, 'tab-only input leaves no sparse overlay row');
select lives_ok($$select mos.set_pending_bill_finance_label('ESB-LABEL','BR-LABEL','PB-LABEL-A',E'\n')$$,
  'newline-only input clears a label');
select is((select count(*)::int from mos.pending_bill_finance_labels where bill_no = 'PB-LABEL-A'),
  0, 'newline-only input leaves no sparse overlay row');
select lives_ok($$select mos.set_pending_bill_finance_label('ESB-LABEL','BR-LABEL','PB-LABEL-A',U&'\0009\000A\000D\0020\00A0\2003')$$,
  'mixed ASCII and Unicode whitespace-only input clears a label');
select is((select count(*)::int from mos.pending_bill_finance_labels where bill_no = 'PB-LABEL-A'),
  0, 'mixed whitespace-only input leaves no sparse overlay row');
select lives_ok($$select mos.set_pending_bill_finance_label('ESB-LABEL','BR-LABEL','PB-LABEL-A',U&'\0009\000A Owner Sari \000D\000A\0009')$$,
  'tabs and newlines around a real label are trimmed');
select is((select finance_label from mos.pending_bill_finance_labels where bill_no = 'PB-LABEL-A'),
  'Owner Sari', 'only edge whitespace is removed from a real label');
select lives_ok($$select mos.set_pending_bill_finance_label('ESB-LABEL','BR-LABEL','PB-LABEL-A',U&'Owner\0009\000ASari')$$,
  'interior tabs and newlines remain valid label text');
select is((select finance_label from mos.pending_bill_finance_labels where bill_no = 'PB-LABEL-A'),
  U&'Owner\0009\000ASari', 'interior whitespace is preserved');
select lives_ok($$select mos.set_pending_bill_finance_label('ESB-LABEL','BR-LABEL','PB-LABEL-A',' ')$$,
  'Finance clears a normalized label');
select is((select count(*)::int from mos.pending_bill_finance_labels where bill_no = 'PB-LABEL-A'),
  0, 'clearing a normalized label removes the overlay row');
select throws_ok($$insert into mos.pending_bill_finance_labels (org_id, esb_code, branch_code, bill_no, finance_label)
  values ('00000000-0000-0000-0000-0000000000a1','ESB-LABEL','BR-LABEL','PB-LABEL-A','x')$$,
  '42501', null, 'Finance cannot bypass the RPC with a direct table write');
select is((select counterparty_note from reporting.pending_bills where bill_no = 'PB-LABEL-A'),
  'Original ESB note', 'the ESB counterparty note remains unchanged');
select shared._test_set_access_roles(:'member_a');
select is((select count(*)::int from mos.pending_bill_finance_labels), 0, 'a same-org non-Finance member reads no labels');
select throws_ok($$select mos.set_pending_bill_finance_label('ESB-LABEL','BR-LABEL','PB-LABEL-A','Not Finance')$$,
  '42501', 'Finance access is required.', 'a same-org non-Finance member cannot set a label');
select shared._test_set_access_roles(:'finance_a');
select throws_ok($$select mos.set_pending_bill_finance_label('ESB-LABEL','BR-LABEL','PB-LABEL-B','Wrong org')$$,
  'P0002', 'Pending bill was not found.', 'Finance cannot write a bill from another org');
select lives_ok($$select mos.set_pending_bill_finance_label('ESB-LABEL','BR-LABEL','PB-LABEL-A','Org A label')$$,
  'the current-org Finance user can still write a valid label');
select shared._test_set_access_roles(:'finance_b');
select is((select count(*)::int from mos.pending_bill_finance_labels), 0, 'Finance in another org reads no labels');
select throws_ok($$select mos.set_pending_bill_finance_label('ESB-LABEL','BR-LABEL','PB-LABEL-A','Cross-org edit')$$,
  'P0002', 'Pending bill was not found.', 'Finance in another org cannot edit the bill');
reset role;
select throws_ok($$insert into mos.pending_bill_finance_labels (org_id, esb_code, branch_code, bill_no, finance_label)
  values ('00000000-0000-0000-0000-0000000000a1','ESB-LABEL','BR-LABEL','PB-LABEL-A',U&'\0009\000A\00A0\2003')$$,
  '23514', null, 'the table check rejects a label that normalizes to empty');
select throws_ok($$insert into mos.pending_bill_finance_labels (org_id, esb_code, branch_code, bill_no, finance_label)
  values ('00000000-0000-0000-0000-0000000000a1','ESB-LABEL','BR-LABEL','PB-LABEL-A',E'\tlabel\n')$$,
  '23514', null, 'the table check rejects labels that are not normalized');
select throws_ok($$insert into mos.pending_bill_finance_labels (org_id, esb_code, branch_code, bill_no, finance_label)
  values ('00000000-0000-0000-0000-0000000000a1','ESB-LABEL','BR-LABEL','PB-LABEL-A',pg_catalog.repeat('x',61))$$,
  '23514', null, 'the table check rejects labels longer than 60 characters');
set local role anon;
select throws_ok($$select * from mos.pending_bill_finance_labels$$, '42501', null, 'anon cannot read the label overlay');
select throws_ok($$select mos.set_pending_bill_finance_label('ESB-LABEL','BR-LABEL','PB-LABEL-A','Anon')$$,
  '42501', null, 'anon cannot execute the label writer');

select * from finish();
rollback;
