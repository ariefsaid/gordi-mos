-- Nightly source evidence and append-only human reviews of stable register cases.
-- DOWN: run supabase/rollbacks/20261020009000_reporting_cancel_void_reviews.sql (refuses nonempty history).

create table reporting.cancel_void_register (
  org_id uuid not null references shared.orgs(id) on delete restrict,
  esb_code text not null check (btrim(esb_code) <> ''),
  row_id text not null check (btrim(row_id) <> ''),
  case_id text not null check (btrim(case_id) <> ''),
  is_case boolean not null,
  branch_code text not null check (btrim(branch_code) <> ''),
  sales_date date not null,
  sales_num text not null,
  action_kind text not null check (action_kind in ('sale_cancelled','sale_void','menu_cancelled')),
  node_kind text not null,
  menu_name text,
  review_value_idr numeric,
  review_value_basis text not null,
  line_total numeric,
  creator_account text,
  last_editor_account text,
  minutes_to_last_edit numeric,
  reason_text text,
  reason_scope text not null check (reason_scope in ('sale_reason_not_exposed','source_line_reason')),
  source_evidence_hash text,
  snapshot_as_of timestamptz not null,
  source_contract_version text not null,
  primary key (org_id, esb_code, row_id),
  check (not is_case or row_id = case_id)
);
create index cancel_void_branch_date on reporting.cancel_void_register(org_id,branch_code,sales_date,esb_code,row_id);
comment on table reporting.cancel_void_register is
  'Bounded nightly evidence, including case details. Only is_case rows carry additive review values. Accounts and last-edit delays do not prove the action actor or time. No source rows are deleted by the copy.';

create table mos.cancel_void_reviews (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default shared.current_org_id() references shared.orgs(id) on delete restrict,
  esb_code text not null,
  case_id text not null,
  person_id uuid not null,
  reason text not null check (reason in ('order_error','customer_request','unavailable','quality','training','other')),
  note text not null check (length(btrim(note)) between 1 and 2000),
  reviewed_by uuid not null default shared.current_person_id(),
  created_at timestamptz not null default clock_timestamp(),
  source_evidence_hash text,
  foreign key (org_id, esb_code, case_id) references reporting.cancel_void_register(org_id, esb_code, row_id) on delete restrict,
  foreign key (org_id, person_id) references shared.people(org_id, id) on delete restrict,
  foreign key (org_id, reviewed_by) references shared.people(org_id, id) on delete restrict
);
create index cancel_void_review_case on mos.cancel_void_reviews(org_id,esb_code,case_id,created_at desc,id desc);
comment on table mos.cancel_void_reviews is
  'Each correction appends another human review. Source accounts/reasons remain separate. Latest review per case supplies summaries; all earlier reviews and observed source fingerprints remain readable. No delete or update path.';

create function mos._stamp_cancel_void_review() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if not (shared.has_access_role('finance') or shared.has_access_role('manager') or shared.has_access_role('ops_lead')) then
    raise exception 'Review access required' using errcode = '42501';
  end if;
  select source_evidence_hash into new.source_evidence_hash
  from reporting.cancel_void_register
  where org_id = new.org_id and esb_code = new.esb_code and row_id = new.case_id and is_case;
  if not found then
    raise exception 'Review requires a readable register case' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function mos._stamp_cancel_void_review() from public, anon, authenticated, service_role;
create trigger stamp_cancel_void_review before insert on mos.cancel_void_reviews
  for each row execute function mos._stamp_cancel_void_review();

revoke all on reporting.cancel_void_register, mos.cancel_void_reviews from public, anon, authenticated, service_role, reporting_writer;
grant select on reporting.cancel_void_register, mos.cancel_void_reviews to authenticated;
grant insert (esb_code,case_id,person_id,reason,note) on mos.cancel_void_reviews to authenticated;
grant select, insert, update on reporting.cancel_void_register to reporting_writer;
alter table reporting.cancel_void_register enable row level security;
alter table reporting.cancel_void_register force row level security;
alter table mos.cancel_void_reviews enable row level security;
alter table mos.cancel_void_reviews force row level security;

create policy cancel_void_read on reporting.cancel_void_register for select to authenticated
using (org_id = (select shared.current_org_id()) and (
  (select shared.has_access_role('finance')) or (select shared.has_access_role('manager')) or (select shared.has_access_role('ops_lead'))));
create policy cancel_void_copy on reporting.cancel_void_register for all to reporting_writer
using (org_id = (select reporting.current_writer_org()))
with check (org_id = (select reporting.current_writer_org()));
create policy cancel_void_reviews_read on mos.cancel_void_reviews for select to authenticated
using (org_id = (select shared.current_org_id()) and (
  (select shared.has_access_role('finance')) or (select shared.has_access_role('manager')) or (select shared.has_access_role('ops_lead'))));
create policy cancel_void_reviews_append on mos.cancel_void_reviews for insert to authenticated
with check (org_id = (select shared.current_org_id()) and reviewed_by = (select shared.current_person_id()) and (
  (select shared.has_access_role('finance')) or (select shared.has_access_role('manager')) or (select shared.has_access_role('ops_lead'))));
