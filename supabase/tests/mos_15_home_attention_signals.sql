-- #773 AC-016..AC-018 — Home "Needs you now" for Signals (OD-WAY-96 (3, 6)).
--
-- Rides the production seed's Cikal Bar Team (retail_ops BU) and its dev fixtures — Cahya
-- (ops_lead + retail_ops home), Sinta (supervisor + retail_ops home), Dewi (admin), Bulan
-- (member + retail_ops home, NOT a lead), Fitri (finance + finance_team, NOT a Retail Ops lead).
-- Adds ONE fixture inside the test's transaction — a Retail Ops Head role (business_unit_id =
-- retail_ops, reports_to_role_id NULL) held by a fresh member — so arm 3 of mos.is_team_lead
-- (the unit head arm) has a distinct persona to exercise for AC-017.
--
-- The test never bypasses RLS on the read path (JWT claims, role = authenticated). Every seed
-- write done as the seed connection is wrapped by `reset role`, then role is set back before the
-- assertions. Nothing here changes lifecycle fields on mos.signals; the guard is deliberately
-- untouched (AC-018).
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

-- ── Fixtures the seed does not provide ─────────────────────────────────────────────────────────
-- A Retail Ops Head role (arm 3 of is_team_lead requires: business_unit_id = target's BU AND
-- reports_to_role_id IS NULL). The production seed's only such root role is Managing Director,
-- whose BU is NULL, so no persona exists to exercise arm 3 without this insert.
insert into shared.roles (id, org_id, business_unit_id, name, reports_to_role_id) values
  ('30000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000014', 'Retail Ops Head', null);

insert into shared.people (id, org_id, full_name, email) values
  ('40000000-0000-0000-0000-000000000020', '10000000-0000-0000-0000-000000000001',
   'Rana RetailHead', 'rana.retailhead.dev@example.test');

insert into shared.person_roles (org_id, person_id, role_id) values
  ('10000000-0000-0000-0000-000000000001',
   '40000000-0000-0000-0000-000000000020',
   '30000000-0000-0000-0000-000000000006');

insert into shared.person_access_roles (org_id, person_id, access_role) values
  ('10000000-0000-0000-0000-000000000001',
   '40000000-0000-0000-0000-000000000020', 'member');

-- Cikal Bar team id resolved by code (the seed creates it via shared.seed_stream_teams()).
-- Materialize into a temp so pgTAP asserts can join without repeating the lookup.
create temporary table _t_cikal on commit drop as
  select id from shared.teams
  where org_id = '10000000-0000-0000-0000-000000000001' and code = 'cikal_bar';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- AC-016 — Needs-attention Signal in Cikal Bar
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- Cahya posts (author is the JWT person; owning_team_id is Cikal Bar). Cahya is ops_lead + a
-- member of the retail_ops BU by her home team hq_operations, so she may post cross-Team via
-- mos.can_post_signal_for_team's lead-tier arm.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-000000000001","access_roles":["ops_lead","member"]}';
insert into mos.signals (id, owning_team_id, occurred_at, body, attention)
select '00000000-0000-0000-0000-000000006001', c.id, now(), 'Cikal grinder is jammed', 'Needs attention' from _t_cikal c;

-- Cahya (ops_lead lead-tier holder with retail_ops home) sees the row (arm A).
select is((select count(*)::int from mos.home_attention_signals() where id = '00000000-0000-0000-0000-000000006001'),
  1, 'AC-016 Cahya (ops_lead + retail_ops home) sees the Needs-attention Signal');

-- Sinta (supervisor + primary team gordi_hq_bar, a retail_ops stream team) sees it (arm A).
set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-00000000000a","access_roles":["supervisor","member"]}';
select is((select count(*)::int from mos.home_attention_signals() where id = '00000000-0000-0000-0000-000000006001'),
  1, 'AC-016 Sinta (supervisor + retail_ops stream home) sees the Signal');

-- Dewi (admin) sees it (arm A via admin arm of is_team_lead).
set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-000000000000","access_roles":["admin"]}';
select is((select count(*)::int from mos.home_attention_signals() where id = '00000000-0000-0000-0000-000000006001'),
  1, 'AC-016 Dewi (admin) sees the Signal');

-- Bulan (member, no lead role) does NOT see it — Needs-attention has no mentioned arm.
set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-000000000007","access_roles":["member"]}';
select is((select count(*)::int from mos.home_attention_signals() where id = '00000000-0000-0000-0000-000000006001'),
  0, 'AC-016 Bulan (member, retail_ops floor) does NOT see the Signal');

-- Fitri (finance + finance_team, not a Retail Ops lead) does NOT see it.
set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-000000000005","access_roles":["finance","member"]}';
select is((select count(*)::int from mos.home_attention_signals() where id = '00000000-0000-0000-0000-000000006001'),
  0, 'AC-016 Fitri (finance BU) does NOT see the Signal');

-- Sinta acks; person_id is stamped by the DB default from the JWT.
set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-00000000000a","access_roles":["supervisor","member"]}';
insert into mos.signal_acknowledgements (signal_id) values ('00000000-0000-0000-0000-000000006001');

-- After Sinta acks: NO lead sees the row (arm A is cleared for every lead).
set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-000000000001","access_roles":["ops_lead","member"]}';
select is((select count(*)::int from mos.home_attention_signals() where id = '00000000-0000-0000-0000-000000006001'),
  0, 'AC-016 after Sinta acks, Cahya no longer sees the Signal');
set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-00000000000a","access_roles":["supervisor","member"]}';
select is((select count(*)::int from mos.home_attention_signals() where id = '00000000-0000-0000-0000-000000006001'),
  0, 'AC-016 Sinta (the acker) no longer sees the Signal');
set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-000000000000","access_roles":["admin"]}';
select is((select count(*)::int from mos.home_attention_signals() where id = '00000000-0000-0000-0000-000000006001'),
  0, 'AC-016 Dewi (admin) no longer sees the Signal');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- AC-017 — Urgent Signal in Cikal Bar mentioning Bulan
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- Cahya posts an Urgent Signal.
set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-000000000001","access_roles":["ops_lead","member"]}';
insert into mos.signals (id, owning_team_id, occurred_at, body, attention)
select '00000000-0000-0000-0000-000000006002', c.id, now(), 'Cikal register locked out', 'Urgent' from _t_cikal c;

-- Mention Bulan explicitly. Author-only INSERT policy on signal_mentions is honored — Cahya
-- authored this Signal.
insert into mos.signal_mentions (signal_id, mention_kind, target_person_id)
values ('00000000-0000-0000-0000-000000006002', 'person', '40000000-0000-0000-0000-000000000007');

-- Leads see it (arm A).
select is((select count(*)::int from mos.home_attention_signals() where id = '00000000-0000-0000-0000-000000006002'),
  1, 'AC-017 Cahya (lead) sees the Urgent Signal');
set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-00000000000a","access_roles":["supervisor","member"]}';
select is((select count(*)::int from mos.home_attention_signals() where id = '00000000-0000-0000-0000-000000006002'),
  1, 'AC-017 Sinta (lead) sees the Urgent Signal');
set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-000000000000","access_roles":["admin"]}';
select is((select count(*)::int from mos.home_attention_signals() where id = '00000000-0000-0000-0000-000000006002'),
  1, 'AC-017 Dewi (admin) sees the Urgent Signal');

-- Bulan (mentioned) sees it — arm B; is_mentioned is true for her.
set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-000000000007","access_roles":["member"]}';
select is((select count(*)::int from mos.home_attention_signals() where id = '00000000-0000-0000-0000-000000006002'),
  1, 'AC-017 Bulan (mentioned) sees the Urgent Signal');
select ok(
  (select is_mentioned from mos.home_attention_signals() where id = '00000000-0000-0000-0000-000000006002'),
  'AC-017 Bulan reads is_mentioned = true (Seen ✓ chip renders prompted)');

-- Retail Ops head sees it (arm 3 of is_team_lead — unit head).
set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-000000000020","access_roles":["member"]}';
select is((select count(*)::int from mos.home_attention_signals() where id = '00000000-0000-0000-0000-000000006002'),
  1, 'AC-017 Retail Ops head sees the Urgent Signal (is_team_lead arm 3)');
-- The head is NOT a mentioned viewer here — is_mentioned is false, so the chip renders plain.
select is(
  (select is_mentioned from mos.home_attention_signals() where id = '00000000-0000-0000-0000-000000006002'),
  false,
  'AC-017 Retail Ops head reads is_mentioned = false (Seen ✓ chip renders plain)');

-- Bulan's own ack removes the row from Bulan's view but does NOT clear it for the leads.
set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-000000000007","access_roles":["member"]}';
insert into mos.signal_acknowledgements (signal_id) values ('00000000-0000-0000-0000-000000006002');
select is((select count(*)::int from mos.home_attention_signals() where id = '00000000-0000-0000-0000-000000006002'),
  0, 'AC-017 Bulan no longer sees the Urgent Signal after own ack');
set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-000000000001","access_roles":["ops_lead","member"]}';
select is((select count(*)::int from mos.home_attention_signals() where id = '00000000-0000-0000-0000-000000006002'),
  1, 'AC-017 Cahya (lead) still sees the Urgent Signal after Bulan''s own ack');

-- A lead's ack (Sinta) clears the row for all leads (arm A no longer holds).
set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-00000000000a","access_roles":["supervisor","member"]}';
insert into mos.signal_acknowledgements (signal_id) values ('00000000-0000-0000-0000-000000006002');
set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-000000000001","access_roles":["ops_lead","member"]}';
select is((select count(*)::int from mos.home_attention_signals() where id = '00000000-0000-0000-0000-000000006002'),
  0, 'AC-017 after Sinta (lead) acks, Cahya no longer sees the Urgent Signal');
set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-000000000000","access_roles":["admin"]}';
select is((select count(*)::int from mos.home_attention_signals() where id = '00000000-0000-0000-0000-000000006002'),
  0, 'AC-017 Dewi (admin) no longer sees the Urgent Signal after a lead''s ack');
set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-000000000020","access_roles":["member"]}';
select is((select count(*)::int from mos.home_attention_signals() where id = '00000000-0000-0000-0000-000000006002'),
  0, 'AC-017 Retail Ops head no longer sees the Urgent Signal after a lead''s ack');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- AC-018 — FYI appears for nobody in Needs you now; attention change touches no lifecycle field
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- The not-shown case first: FYI must NEVER surface here, whatever the viewer's arm.
set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-000000000001","access_roles":["ops_lead","member"]}';
insert into mos.signals (id, owning_team_id, occurred_at, body, attention, category)
select '00000000-0000-0000-0000-000000006003', c.id, now(), 'quiet log entry', 'FYI', 'Process' from _t_cikal c;
-- Mention Bulan on the FYI too — even a mentioned viewer must not see it in Needs you now.
insert into mos.signal_mentions (signal_id, mention_kind, target_person_id)
values ('00000000-0000-0000-0000-000000006003', 'person', '40000000-0000-0000-0000-000000000007');

select is((select count(*)::int from mos.home_attention_signals() where id = '00000000-0000-0000-0000-000000006003'),
  0, 'AC-018 Cahya (author + lead) sees no FYI in Needs you now');
set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-000000000000","access_roles":["admin"]}';
select is((select count(*)::int from mos.home_attention_signals() where id = '00000000-0000-0000-0000-000000006003'),
  0, 'AC-018 Dewi (admin) sees no FYI in Needs you now');
set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-000000000007","access_roles":["member"]}';
select is((select count(*)::int from mos.home_attention_signals() where id = '00000000-0000-0000-0000-000000006003'),
  0, 'AC-018 Bulan (mentioned on the FYI) sees no FYI in Needs you now');

-- Attention change from FYI → Urgent must leave retracted_at, body, owning_team_id untouched.
set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-000000000001","access_roles":["ops_lead","member"]}';
update mos.signals set attention = 'Urgent' where id = '00000000-0000-0000-0000-000000006003';
select is((select retracted_at from mos.signals where id = '00000000-0000-0000-0000-000000006003'), null,
  'AC-018 attention change leaves retracted_at untouched');
select is((select body from mos.signals where id = '00000000-0000-0000-0000-000000006003'), 'quiet log entry',
  'AC-018 attention change leaves body untouched');
select is(
  (select owning_team_id from mos.signals where id = '00000000-0000-0000-0000-000000006003'),
  (select id from shared.teams where org_id = '10000000-0000-0000-0000-000000000001' and code = 'cikal_bar'),
  'AC-018 attention change leaves owning_team_id untouched');

select * from finish();
rollback;
