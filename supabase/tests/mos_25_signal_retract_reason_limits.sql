-- #1016: a Signal retraction reason of only invisible formatting characters (NEL, Mongolian vowel
-- separator, zero-width non-joiner/joiner, word joiner, BOM) counts as blank, and the trimmed
-- reason is capped at 500 characters (a character count, not bytes). One normalisation expression
-- in mos._guard_signals serves the blank check, the length check and the stored value, so every
-- assertion below goes through the real UPDATE path as the Signal's author.
-- Characters are built with chr() so this file carries no invisible bytes.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

select set_config('app.allow_test_seeds', 'on', true);
select mos._test_seed_process_tree();
reset role;

create temp table t1016 (
  live_signal   uuid,
  max_signal    uuid,
  multi_signal  uuid,
  normal_signal uuid,
  padded_signal uuid,
  inner_signal  uuid
) on commit drop;
insert into t1016 default values;
grant select, update on t1016 to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
update t1016 set live_signal = mos.create_signal_with_mentions('Limits: live target', now(), '[]'::jsonb);
update t1016 set max_signal = mos.create_signal_with_mentions('Limits: 500 target', now(), '[]'::jsonb);
update t1016 set multi_signal = mos.create_signal_with_mentions('Limits: multibyte target', now(), '[]'::jsonb);
update t1016 set normal_signal = mos.create_signal_with_mentions('Limits: normal target', now(), '[]'::jsonb);
update t1016 set padded_signal = mos.create_signal_with_mentions('Limits: padded target', now(), '[]'::jsonb);
update t1016 set inner_signal = mos.create_signal_with_mentions('Limits: inner target', now(), '[]'::jsonb);

-- ── Each newly covered invisible character alone is blank ───────────────────────────────────────
select throws_ok(format($$
  update mos.signals set retracted_at = now(), retract_reason = %L
   where id = (select live_signal from t1016)
$$, chr(133) || chr(133)), '23514', null, 'a U+0085 (NEL)-only reason is refused as blank');
select throws_ok(format($$
  update mos.signals set retracted_at = now(), retract_reason = %L
   where id = (select live_signal from t1016)
$$, chr(6158) || chr(6158)), '23514', null, 'a U+180E-only reason is refused as blank');
select throws_ok(format($$
  update mos.signals set retracted_at = now(), retract_reason = %L
   where id = (select live_signal from t1016)
$$, chr(8204) || chr(8204)), '23514', null, 'a U+200C (zero-width non-joiner)-only reason is refused as blank');
select throws_ok(format($$
  update mos.signals set retracted_at = now(), retract_reason = %L
   where id = (select live_signal from t1016)
$$, chr(8205) || chr(8205)), '23514', null, 'a U+200D (zero-width joiner)-only reason is refused as blank');
select throws_ok(format($$
  update mos.signals set retracted_at = now(), retract_reason = %L
   where id = (select live_signal from t1016)
$$, chr(8288) || chr(8288)), '23514', null, 'a U+2060 (word joiner)-only reason is refused as blank');
select throws_ok(format($$
  update mos.signals set retracted_at = now(), retract_reason = %L
   where id = (select live_signal from t1016)
$$, chr(65279) || chr(65279)), '23514', null, 'a U+FEFF (BOM)-only reason is refused as blank');
select throws_ok(format($$
  update mos.signals set retracted_at = now(), retract_reason = %L
   where id = (select live_signal from t1016)
$$, ' ' || chr(133) || chr(6158) || chr(8204) || chr(8205) || chr(8288) || chr(65279) || chr(8203) || chr(160)),
  '23514', null, 'a reason mixing every invisible and space character is refused as blank');

-- ── Length: 500 characters accepted, 501 refused, measured after trimming ───────────────────────
select throws_ok(format($$
  update mos.signals set retracted_at = now(), retract_reason = %L
   where id = (select live_signal from t1016)
$$, repeat('x', 501)), '23514', null, 'a 501-character reason is refused');
select throws_ok(format($$
  update mos.signals set retracted_at = now(), retract_reason = %L
   where id = (select live_signal from t1016)
$$, chr(8288) || ' ' || repeat('x', 501) || chr(8204)), '23514', null,
  'a reason that is 501 characters after trimming is refused');
select is((select retracted_at is null and retract_reason is null from mos.signals
            where id = (select live_signal from t1016)), true,
  'every refused retraction left the Signal live with no reason');

select lives_ok(format($$
  update mos.signals set retracted_at = now(), retract_reason = %L
   where id = (select max_signal from t1016)
$$, chr(8288) || ' ' || repeat('x', 500) || chr(8204)), 'a reason of exactly 500 characters plus invisible padding is accepted');
select is((select char_length(retract_reason) from mos.signals where id = (select max_signal from t1016)), 500,
  'the stored 500-character reason is trimmed of the padding and keeps all 500 characters');

select lives_ok(format($$
  update mos.signals set retracted_at = now(), retract_reason = %L
   where id = (select multi_signal from t1016)
$$, repeat(chr(233), 500)), 'a 500-character multibyte reason is accepted (the limit counts characters, not bytes)');
select is((select char_length(retract_reason) from mos.signals where id = (select multi_signal from t1016)), 500,
  'the stored multibyte reason keeps all 500 characters');

-- ── Ordinary reasons are unchanged ──────────────────────────────────────────────────────────────
select lives_ok($$
  update mos.signals set retracted_at = now(), retract_reason = 'Wrong entry, superseded'
   where id = (select normal_signal from t1016)
$$, 'an ordinary reason retracts successfully');
select is((select retract_reason from mos.signals where id = (select normal_signal from t1016)),
  'Wrong entry, superseded', 'an ordinary reason is stored byte-identical');

select lives_ok(format($$
  update mos.signals set retracted_at = now(), retract_reason = %L
   where id = (select padded_signal from t1016)
$$, chr(8288) || chr(133) || ' Padded reason ' || chr(6158) || chr(65279)), 'a reason padded with the new invisible characters retracts successfully');
select is((select retract_reason from mos.signals where id = (select padded_signal from t1016)),
  'Padded reason', 'the stored reason is trimmed of the new invisible padding');

select lives_ok(format($$
  update mos.signals set retracted_at = now(), retract_reason = %L
   where id = (select inner_signal from t1016)
$$, 'a' || chr(8204) || 'b'), 'a reason with an invisible character between letters retracts successfully');
select is((select retract_reason from mos.signals where id = (select inner_signal from t1016)),
  'a' || chr(8204) || 'b', 'inner invisible characters are stored unchanged');

select * from finish();
rollback;
