-- Scoped Café stock comparison: nightly EOD source rows and Count-review-only projections.
-- DOWN (remove this feature in dependency order):
--   drop function if exists ops.get_stock_comparison_item(uuid, text, uuid, uuid, text);
--   drop function if exists ops.list_stock_comparison(uuid, text, boolean, text, text, text, text, text, text, integer);
--   drop function if exists ops._stock_comparison_rows(uuid, uuid, text, uuid);
--   drop table if exists reporting.esb_stock_on_hand;
--   drop table if exists reporting.esb_stock_coverage;
--   drop table if exists reporting.esb_stock_snapshots;
-- No integrations.esb_stock_mappings table is created: the first release uses the existing
-- ops.item_units.esb_product_detail_id and shared.branches.code coordinates.

create table reporting.esb_stock_snapshots (
  id uuid not null default gen_random_uuid(),
  org_id uuid not null references shared.orgs(id) on delete cascade,
  source_system text not null check (btrim(source_system) <> ''),
  esb_code text not null check (btrim(esb_code) <> ''),
  company_code text not null check (btrim(company_code) <> ''),
  source_snapshot_key text not null check (btrim(source_snapshot_key) <> ''),
  revision integer not null check (revision > 0),
  snapshot_date date not null,
  as_of timestamptz not null check (as_of <= statement_timestamp() + interval '5 minutes'),
  business_date date not null,
  source_timezone text not null check (btrim(source_timezone) <> ''),
  basis text not null check (basis in ('intraday', 'end_of_day')),
  scope jsonb not null check (jsonb_typeof(scope) = 'object'),
  source_complete boolean not null,
  ingestion_complete boolean not null,
  state text not null check (state in ('staging', 'published', 'failed')),
  started_at timestamptz not null,
  ingested_at timestamptz,
  published_at timestamptz,
  watermark text,
  failure_code text,
  source_fingerprint text not null check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  primary key (org_id, esb_code, snapshot_date),
  unique (org_id, id),
  unique (org_id, source_system, company_code, source_snapshot_key, revision),
  check (state <> 'published' or (ingestion_complete and published_at is not null))
);
comment on table reporting.esb_stock_snapshots is
  'Published nightly ESB end-of-day on-hand generations. The first release keeps one replaceable generation per org, ESB company and source business date; source as-of is the end of that WIB date.';
comment on column reporting.esb_stock_snapshots.as_of is
  'Source balance effective instant: the end of business_date in Asia/Jakarta, represented as UTC; not the worker start or ingestion time.';
comment on column reporting.esb_stock_snapshots.scope is
  'The source branch codes enumerated in this copied date slice; codes remain source text and are not rejected when unmapped.';

create table reporting.esb_stock_coverage (
  id uuid not null default gen_random_uuid(),
  org_id uuid not null,
  snapshot_id uuid not null,
  branch_code text not null check (btrim(branch_code) <> ''),
  partition_key text not null check (btrim(partition_key) <> ''),
  product_scope text,
  unit_scope text,
  status text not null check (status in ('complete', 'partial', 'missing', 'failed')),
  expected_rows integer check (expected_rows is null or expected_rows >= 0),
  received_rows integer not null check (received_rows >= 0),
  exhausted boolean not null,
  missing_rows_mean_zero boolean not null default false,
  source_evidence jsonb,
  primary key (org_id, id),
  unique (org_id, snapshot_id, branch_code, partition_key),
  constraint esb_stock_coverage_parent_fk foreign key (org_id, snapshot_id)
    references reporting.esb_stock_snapshots (org_id, id) on delete cascade on update cascade,
  check (status <> 'complete' or (exhausted and source_evidence is not null))
);
comment on table reporting.esb_stock_coverage is
  'Per-branch source-read coverage for a copied snapshot. Missing rows never imply zero; this full-table warehouse read records the number of rows received for each enumerated source branch.';

create table reporting.esb_stock_on_hand (
  id uuid not null default gen_random_uuid(),
  org_id uuid not null,
  snapshot_id uuid not null,
  branch_code text not null check (btrim(branch_code) <> ''),
  product_code text,
  product_detail_code text not null check (btrim(product_detail_code) <> ''),
  unit_code text not null check (btrim(unit_code) <> ''),
  quantity numeric not null check (quantity::text not in ('NaN', 'Infinity', '-Infinity')),
  location text not null check (btrim(location) <> ''),
  row_complete boolean not null,
  source_row_key text not null check (btrim(source_row_key) <> ''),
  raw_payload_hash text not null check (raw_payload_hash ~ '^[0-9a-f]{64}$'),
  primary key (org_id, id),
  constraint esb_stock_on_hand_parent_fk foreign key (org_id, snapshot_id)
    references reporting.esb_stock_snapshots (org_id, id) on delete cascade on update cascade,
  constraint esb_stock_on_hand_grain_uk unique nulls not distinct
    (org_id, snapshot_id, branch_code, product_code, product_detail_code, unit_code, location)
);
comment on table reporting.esb_stock_on_hand is
  'Exact EOD on-hand rows copied from public.stock_snapshot. Negative and actual zero quantities are retained; no source row is synthesized for an omitted coordinate.';
comment on column reporting.esb_stock_on_hand.location is
  'Original ESB location coordinate. It is preserved for provenance and is not a MOS stream or branch mapping.';

create index esb_stock_snapshots_latest_idx
  on reporting.esb_stock_snapshots (org_id, esb_code, snapshot_date desc, as_of desc)
  where state = 'published';
create index esb_stock_coverage_branch_idx
  on reporting.esb_stock_coverage (org_id, branch_code, snapshot_id);
create index esb_stock_on_hand_lookup_idx
  on reporting.esb_stock_on_hand (org_id, snapshot_id, branch_code, product_detail_code, unit_code);

revoke all on reporting.esb_stock_snapshots, reporting.esb_stock_coverage, reporting.esb_stock_on_hand
  from public, anon, authenticated, service_role, reporting_writer;
grant select, insert, update, delete
  on reporting.esb_stock_snapshots, reporting.esb_stock_coverage, reporting.esb_stock_on_hand
  to reporting_writer;
alter table reporting.esb_stock_snapshots enable row level security;
alter table reporting.esb_stock_snapshots force row level security;
alter table reporting.esb_stock_coverage enable row level security;
alter table reporting.esb_stock_coverage force row level security;
alter table reporting.esb_stock_on_hand enable row level security;
alter table reporting.esb_stock_on_hand force row level security;

create policy esb_stock_snapshots_writer on reporting.esb_stock_snapshots
  for all to reporting_writer
  using (org_id = (select reporting.current_writer_org()))
  with check (org_id = (select reporting.current_writer_org()));
create policy esb_stock_coverage_writer on reporting.esb_stock_coverage
  for all to reporting_writer
  using (org_id = (select reporting.current_writer_org()))
  with check (org_id = (select reporting.current_writer_org()));
create policy esb_stock_on_hand_writer on reporting.esb_stock_on_hand
  for all to reporting_writer
  using (org_id = (select reporting.current_writer_org()))
  with check (org_id = (select reporting.current_writer_org()));

create function ops._stock_comparison_rows(
  p_org_id uuid,
  p_branch_id uuid,
  p_activity text,
  p_snapshot_id uuid
)
returns table (
  item_id uuid,
  item_name text,
  item_kind text,
  item_category text,
  item_unit_id uuid,
  item_unit_name text,
  count_id uuid,
  counted_quantity numeric,
  count_date date,
  submitted_at timestamptz,
  count_status text,
  expected_quantity numeric,
  expected_unit_code text,
  expected_as_of timestamptz,
  expected_business_date date,
  expected_basis text,
  expected_snapshot_id uuid,
  expected_row_complete boolean,
  difference numeric,
  difference_pct numeric,
  missing text,
  flags text[],
  indicative boolean,
  zero_expected boolean,
  bucket text,
  row_data jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with countable as (
    select item.item_id, item.item_name, item.item_kind, item.item_category,
           item.item_unit_id, item.unit_name as item_unit_name, true as is_current
      from ops.cafe_countable_items(p_branch_id, p_activity) item
      join ops.item_units unit
        on unit.org_id = p_org_id and unit.id = item.item_unit_id
      join ops.wip_items catalog
        on catalog.org_id = p_org_id and catalog.id = item.item_id
  ), latest_counts as (
    select distinct on (line.wip_item_id, line.item_unit_id)
           line.wip_item_id as item_id, line.item_name, line.item_kind,
           line.item_category, line.item_unit_id, line.unit_name as item_unit_name,
           line.id as count_id, line.counted_quantity, line.count_date,
           line.submitted_at, line.status as count_status
      from ops.cafe_count_lines line
     where line.org_id = p_org_id
       and line.branch_id = p_branch_id
       and line.activity = p_activity
       and line.status in ('Submitted', 'Confirmed')
     order by line.wip_item_id, line.item_unit_id,
              line.count_date desc, line.submitted_at desc, line.id desc
  ), candidates as (
    select distinct on (candidate.item_id, candidate.item_unit_id)
           candidate.item_id, candidate.item_name, candidate.item_kind,
           candidate.item_category, candidate.item_unit_id, candidate.item_unit_name
      from (
        select current_item.item_id, current_item.item_name, current_item.item_kind,
               current_item.item_category, current_item.item_unit_id,
               current_item.item_unit_name, true as is_current
          from countable current_item
        union all
        select history.item_id, history.item_name, history.item_kind,
               history.item_category, history.item_unit_id,
               history.item_unit_name, false as is_current
          from latest_counts history
      ) candidate
     order by candidate.item_id, candidate.item_unit_id, candidate.is_current desc,
              candidate.item_name
  ), countable_with_history as (
    select candidate.*, history.count_id, history.counted_quantity,
           history.count_date, history.submitted_at, history.count_status
      from candidates candidate
      left join latest_counts history
        on history.item_id = candidate.item_id
       and history.item_unit_id = candidate.item_unit_id
  ), scope_pool as (
    select exists (
      select 1
        from shared.teams other_team
       where other_team.org_id = p_org_id
         and other_team.branch_id = p_branch_id
         and other_team.activity in ('kitchen', 'bar')
         and other_team.activity <> p_activity
         and other_team.archived_at is null
    ) as ambiguous_pool
  ), coverage as (
    select snap.id as snapshot_id, snap.as_of, snap.business_date, snap.basis,
           coalesce(snap.source_complete and snap.ingestion_complete
             and cover.status = 'complete' and cover.exhausted
             and cover.source_evidence is not null, false) as source_complete
      from reporting.esb_stock_snapshots snap
      left join reporting.esb_stock_coverage cover
        on cover.org_id = snap.org_id
       and cover.snapshot_id = snap.id
       and cover.branch_code = (select branch.code from shared.branches branch
                                 where branch.org_id = p_org_id and branch.id = p_branch_id)
       and cover.partition_key = 'branch'
     where snap.org_id = p_org_id and snap.id = p_snapshot_id
       and snap.state = 'published'
  ), source_rows as (
    select stock.product_detail_code, sum(stock.quantity) as quantity,
           max(stock.unit_code) as unit_code,
           bool_and(stock.row_complete) as row_complete,
           count(distinct stock.unit_code) > 1 as unit_code_ambiguous
      from reporting.esb_stock_on_hand stock
     where stock.org_id = p_org_id
       and stock.snapshot_id = p_snapshot_id
       and stock.branch_code = (select branch.code from shared.branches branch
                                 where branch.org_id = p_org_id and branch.id = p_branch_id)
     group by stock.product_detail_code
  ), enriched as (
    select item.*,
           source.quantity as expected_quantity,
           source.unit_code as expected_unit_code,
           source.row_complete as source_row_complete,
           source.unit_code_ambiguous,
           coverage.as_of as expected_as_of,
           coverage.business_date as expected_business_date,
           coverage.basis as expected_basis,
           coverage.snapshot_id as expected_snapshot_id,
           coverage.source_complete,
           coalesce(unit_mapping.mappings, 0) as unit_mapping_count,
           scope_pool.ambiguous_pool
      from countable_with_history item
      cross join scope_pool
      left join coverage on true
      left join source_rows source
        on source.product_detail_code = (
          select unit.esb_product_detail_id
            from ops.item_units unit
           where unit.org_id = p_org_id and unit.id = item.item_unit_id
        )
      left join lateral (
        select count(*)::integer as mappings
          from ops.item_units unit
         where unit.org_id = p_org_id
           and unit.esb_product_detail_id = (
             select item_unit.esb_product_detail_id
               from ops.item_units item_unit
              where item_unit.org_id = p_org_id and item_unit.id = item.item_unit_id
           )
      ) unit_mapping on true
  ), compared as (
    select enriched.*,
           case
             when expected_snapshot_id is null then 'not_connected'
             when ambiguous_pool then 'ambiguous_pool'
             when not source_complete then 'partial'
             when expected_quantity is null then 'mapping_needed'
             when unit_mapping_count <> 1 or unit_code_ambiguous then 'unit_mismatch'
             when count_id is null then 'not_counted'
             else null
           end as missing,
           case
             when expected_snapshot_id is not null and source_complete
              and expected_quantity is not null and source_row_complete
              and unit_mapping_count = 1 and not unit_code_ambiguous
              and count_id is not null and not ambiguous_pool
               then counted_quantity - expected_quantity
             else null
           end as difference,
           (expected_quantity is not null and count_id is not null
             and expected_business_date is distinct from count_date)
             or (expected_quantity is not null and expected_basis = 'intraday') as indicative,
           expected_snapshot_id is not null and expected_quantity = 0
             and source_complete and source_row_complete and unit_mapping_count = 1
             and not unit_code_ambiguous and count_id is not null
             and not ambiguous_pool and counted_quantity <> 0 as zero_expected
      from enriched
  ), finalized as (
    select compared.*,
           case when difference is null then null
                when expected_quantity = 0 then null
                else case
                  when trunc((difference / abs(expected_quantity)) * 100, 9) = 0 and difference <> 0
                    then sign(difference) / 1000000000::numeric
                  else trunc((difference / abs(expected_quantity)) * 100, 9)
                end
           end as difference_pct
      from compared
  ), reasoned as (
    select finalized.*,
           array_remove(array[
             missing,
             case when difference < 0 then 'shortage'
                  when difference > 0 then 'surplus'
                  when difference = 0 then 'no_difference' end,
             case when count_status = 'Submitted' then 'pending_confirmation' end,
             case when indicative then 'different_times' end,
             case when expected_as_of is not null
                    and statement_timestamp() - expected_as_of > interval '24 hours'
                  then 'stale_esb' end,
             case when count_date is not null
                    and statement_timestamp() >
                      ((count_date + 1)::timestamp at time zone 'Asia/Jakarta') + interval '24 hours'
                  then 'old_count' end,
             case when zero_expected then 'zero_expected' end
           ]::text[], null) as flags,
           case when difference is null then 'unknown'
                when difference = 0 then 'zero' else 'gap' end as bucket
      from finalized
  )
  select reasoned.item_id, reasoned.item_name, reasoned.item_kind, reasoned.item_category,
         reasoned.item_unit_id, reasoned.item_unit_name, reasoned.count_id,
         reasoned.counted_quantity, reasoned.count_date, reasoned.submitted_at,
         reasoned.count_status, reasoned.expected_quantity, reasoned.expected_unit_code,
         reasoned.expected_as_of, reasoned.expected_business_date, reasoned.expected_basis,
         reasoned.expected_snapshot_id,
         coalesce(reasoned.source_complete and reasoned.source_row_complete, false),
         reasoned.difference, reasoned.difference_pct, reasoned.missing, reasoned.flags,
         reasoned.indicative, reasoned.zero_expected, reasoned.bucket,
         jsonb_build_object(
           'key', reasoned.item_id::text || ':' || reasoned.item_unit_id::text,
           'item_id', reasoned.item_id,
           'item_name', reasoned.item_name,
           'kind', reasoned.item_kind,
           'category', reasoned.item_category,
           'unit_id', reasoned.item_unit_id,
           'unit_name', reasoned.item_unit_name,
           'expected', case when reasoned.expected_quantity is null then null else jsonb_build_object(
             'quantity', reasoned.expected_quantity::text,
             'unit_code', reasoned.expected_unit_code,
             'as_of', reasoned.expected_as_of,
             'business_date', reasoned.expected_business_date,
             'basis', reasoned.expected_basis,
             'provenance', 'source_row',
             'snapshot_id', reasoned.expected_snapshot_id,
             'row_complete', coalesce(reasoned.source_complete and reasoned.source_row_complete, false)
           ) end,
           'count', case when reasoned.count_id is null then null else jsonb_build_object(
             'id', reasoned.count_id,
             'quantity', reasoned.counted_quantity::text,
             'unit_id', reasoned.item_unit_id,
             'unit_name', reasoned.item_unit_name,
             'count_date', reasoned.count_date,
             'submitted_at', reasoned.submitted_at,
             'status', reasoned.count_status
           ) end,
           'difference', case when reasoned.difference is null then null else reasoned.difference::text end,
           'difference_pct', case when reasoned.difference_pct is null then null else reasoned.difference_pct::text end,
           'missing', reasoned.missing,
           'flags', to_jsonb(reasoned.flags),
           'indicative', reasoned.indicative
         ) as row_data
    from reasoned
$$;
revoke execute on function ops._stock_comparison_rows(uuid, uuid, text, uuid) from public, anon, authenticated, service_role;

create function ops.list_stock_comparison(
  p_branch_id uuid,
  p_activity text,
  p_only_differences boolean,
  p_q text,
  p_kind text,
  p_category text,
  p_sort text,
  p_dir text,
  p_cursor text,
  p_limit integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org_id uuid := shared.current_org_id();
  v_branch_code text;
  v_snapshot_id uuid;
  v_as_of timestamptz;
  v_synced_at timestamptz;
  v_source_complete boolean := false;
  v_generation text;
  v_source jsonb;
  v_cursor jsonb;
  v_after jsonb;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_result jsonb;
begin
  if v_org_id is null or shared.current_person_id() is null or not shared.is_org_member() then
    raise exception 'STOCK_COMPARISON_FORBIDDEN' using errcode = '42501';
  end if;
  if p_activity not in ('kitchen', 'bar')
     or coalesce(p_sort, '') not in ('gap', 'quantity', 'item', 'count-date')
     or coalesce(p_dir, '') not in ('asc', 'desc')
     or coalesce(p_kind, 'all') not in ('RAW', 'WIP', 'all')
     or coalesce(length(p_q), 0) > 200 then
    raise exception 'STOCK_COMPARISON_INVALID' using errcode = '22023';
  end if;
  select branch.code into v_branch_code
    from shared.branches branch
    join shared.teams team
      on team.org_id = branch.org_id and team.branch_id = branch.id
   where branch.org_id = v_org_id and branch.id = p_branch_id
     and branch.archived_at is null and team.archived_at is null
     and team.activity = p_activity;
  if v_branch_code is null or not ops.can_review_stream(p_branch_id, p_activity) then
    raise exception 'STOCK_COMPARISON_FORBIDDEN' using errcode = '42501';
  end if;

  select snapshot.id, snapshot.as_of, snapshot.published_at,
         coalesce(snapshot.source_complete and snapshot.ingestion_complete
           and coverage.status = 'complete' and coverage.exhausted
           and coverage.source_evidence is not null, false)
    into v_snapshot_id, v_as_of, v_synced_at, v_source_complete
    from reporting.esb_stock_snapshots snapshot
    left join reporting.esb_stock_coverage coverage
      on coverage.org_id = snapshot.org_id and coverage.snapshot_id = snapshot.id
     and coverage.branch_code = v_branch_code and coverage.partition_key = 'branch'
   where snapshot.org_id = v_org_id and snapshot.state = 'published'
     and exists (select 1 from reporting.esb_stock_coverage available
                  where available.org_id = snapshot.org_id and available.snapshot_id = snapshot.id
                    and available.branch_code = v_branch_code and available.partition_key = 'branch')
   order by snapshot.as_of desc, snapshot.published_at desc, snapshot.id desc
   limit 1;
  v_generation := coalesce(v_snapshot_id::text, 'not_connected:' || p_branch_id::text || ':' || p_activity);
  v_source := jsonb_build_object(
    'connection', case when v_snapshot_id is null then 'not_connected' else 'connected' end,
    'snapshot_id', v_snapshot_id,
    'mapping_version', null,
    'as_of', v_as_of,
    'synced_at', v_synced_at,
    'complete', coalesce(v_source_complete, false),
    'missing_scopes', case when v_snapshot_id is null or not coalesce(v_source_complete, false)
      then jsonb_build_array(v_branch_code) else '[]'::jsonb end,
    'stale_after_hours', 24,
    'count_stale_after_hours', 24,
    'last_complete_snapshot_id', case when v_source_complete then v_snapshot_id else null end
  );

  if p_cursor is not null then
    begin
      v_cursor := convert_from(decode(p_cursor, 'base64'), 'UTF8')::jsonb;
    exception when others then
      raise exception 'STOCK_COMPARISON_INVALID_CURSOR' using errcode = '22023';
    end;
    if v_cursor ->> 'branch_id' is distinct from p_branch_id::text
       or v_cursor ->> 'activity' is distinct from p_activity
       or v_cursor ->> 'only_differences' is distinct from coalesce(p_only_differences, false)::text
       or v_cursor ->> 'q' is distinct from coalesce(p_q, '')
       or v_cursor ->> 'kind' is distinct from coalesce(p_kind, 'all')
       or v_cursor ->> 'category' is distinct from coalesce(p_category, '')
       or v_cursor ->> 'sort' is distinct from p_sort
       or v_cursor ->> 'dir' is distinct from p_dir then
      raise exception 'STOCK_COMPARISON_INVALID_CURSOR' using errcode = '22023';
    end if;
    if v_cursor ->> 'generation' is distinct from v_generation then
      raise exception 'generation changed, reload' using errcode = '40001';
    end if;
    v_after := v_cursor -> 'after';
  end if;

  with all_rows as materialized (
    select * from ops._stock_comparison_rows(v_org_id, p_branch_id, p_activity, v_snapshot_id)
  ), filtered as materialized (
    select row.*,
           case row.bucket when 'gap' then 0 when 'unknown' then 1 else 2 end as bucket_order,
           case when row.zero_expected then 0 else 1 end as zero_order,
           case when row.difference is null or row.expected_quantity = 0 then 0
                else abs(row.difference) / abs(row.expected_quantity) end as gap_ratio,
           case when row.difference is null then 1 else 0 end as quantity_missing,
           case when row.count_id is null then 1 else 0 end as count_missing,
           coalesce(abs(row.difference), 0) as absolute_difference
      from all_rows row
     where (coalesce(p_kind, 'all') = 'all' or row.item_kind = p_kind)
       and (coalesce(p_category, '') = ''
         or (p_category = 'none' and row.item_category is null)
         or (p_category <> 'none' and row.item_category = case when left(p_category, 1) = '~'
                                                               then substring(p_category from 2)
                                                               else p_category end))
       and (coalesce(btrim(p_q), '') = ''
         or position(lower(btrim(p_q)) in lower(row.item_name || ' ' || coalesce(row.item_category, ''))) > 0)
       and (not coalesce(p_only_differences, false) or row.difference is distinct from 0)
  ), after_cursor as materialized (
    select row.*
      from filtered row
     where v_after is null or v_after = 'null'::jsonb
        or case p_sort
          when 'gap' then
            row.bucket_order > (v_after ->> 'bucket_order')::integer
            or (row.bucket_order = (v_after ->> 'bucket_order')::integer and row.zero_order > (v_after ->> 'zero_order')::integer)
            or (row.bucket_order = (v_after ->> 'bucket_order')::integer and row.zero_order = (v_after ->> 'zero_order')::integer and (
              (p_dir = 'desc' and row.gap_ratio < (v_after ->> 'gap_ratio')::numeric)
              or (p_dir = 'asc' and row.gap_ratio > (v_after ->> 'gap_ratio')::numeric)
              or (row.gap_ratio = (v_after ->> 'gap_ratio')::numeric and
                  (row.item_name collate "C" > v_after ->> 'item_name'
                   or (row.item_name collate "C" = v_after ->> 'item_name' and row.item_id::text > v_after ->> 'item_id')
                   or (row.item_name collate "C" = v_after ->> 'item_name' and row.item_id::text = v_after ->> 'item_id'
                       and row.item_unit_id::text > v_after ->> 'item_unit_id')))))
          when 'quantity' then
            row.quantity_missing > (v_after ->> 'quantity_missing')::integer
            or (row.quantity_missing = (v_after ->> 'quantity_missing')::integer and (
              (p_dir = 'desc' and row.absolute_difference < (v_after ->> 'absolute_difference')::numeric)
              or (p_dir = 'asc' and row.absolute_difference > (v_after ->> 'absolute_difference')::numeric)
              or (row.absolute_difference = (v_after ->> 'absolute_difference')::numeric and
                  (row.item_name collate "C" > v_after ->> 'item_name'
                   or (row.item_name collate "C" = v_after ->> 'item_name' and row.item_id::text > v_after ->> 'item_id')
                   or (row.item_name collate "C" = v_after ->> 'item_name' and row.item_id::text = v_after ->> 'item_id'
                       and row.item_unit_id::text > v_after ->> 'item_unit_id')))))
          when 'item' then
            case when p_dir = 'asc' then
              row.item_name collate "C" > v_after ->> 'item_name'
              or (row.item_name collate "C" = v_after ->> 'item_name' and row.item_id::text > v_after ->> 'item_id')
              or (row.item_name collate "C" = v_after ->> 'item_name' and row.item_id::text = v_after ->> 'item_id'
                  and row.item_unit_id::text > v_after ->> 'item_unit_id')
            else
              row.item_name collate "C" < v_after ->> 'item_name'
              or (row.item_name collate "C" = v_after ->> 'item_name' and row.item_id::text < v_after ->> 'item_id')
              or (row.item_name collate "C" = v_after ->> 'item_name' and row.item_id::text = v_after ->> 'item_id'
                  and row.item_unit_id::text < v_after ->> 'item_unit_id')
            end
          else
            row.count_missing > (v_after ->> 'count_missing')::integer
            or (row.count_missing = (v_after ->> 'count_missing')::integer and (
              (row.count_date is not null and nullif(v_after ->> 'count_date', '') is not null and (
                (p_dir = 'desc' and row.count_date < (v_after ->> 'count_date')::date)
                or (p_dir = 'asc' and row.count_date > (v_after ->> 'count_date')::date)
                or (row.count_date = (v_after ->> 'count_date')::date and (
                  (p_dir = 'desc' and row.submitted_at < (v_after ->> 'submitted_at')::timestamptz)
                  or (p_dir = 'asc' and row.submitted_at > (v_after ->> 'submitted_at')::timestamptz)
                  or (row.submitted_at = (v_after ->> 'submitted_at')::timestamptz and (
                    (p_dir = 'desc' and row.count_id::text < v_after ->> 'count_id')
                    or (p_dir = 'asc' and row.count_id::text > v_after ->> 'count_id')
                  ))
                ))
              ))
              or (row.count_date is null and nullif(v_after ->> 'count_date', '') is null and (
                row.item_name collate "C" > v_after ->> 'item_name'
                or (row.item_name collate "C" = v_after ->> 'item_name' and row.item_id::text > v_after ->> 'item_id')
                or (row.item_name collate "C" = v_after ->> 'item_name' and row.item_id::text = v_after ->> 'item_id'
                    and row.item_unit_id::text > v_after ->> 'item_unit_id')
              ))
            ))
        end
  ), numbered as (
    select row.*, row_number() over (order by
      case when p_sort = 'gap' then row.bucket_order end asc,
      case when p_sort = 'gap' then row.zero_order end asc,
      case when p_sort = 'gap' and p_dir = 'desc' then -row.gap_ratio end asc,
      case when p_sort = 'gap' and p_dir = 'asc' then row.gap_ratio end asc,
      case when p_sort = 'gap' and row.bucket_order <> 0 then row.item_name collate "C" end asc,
      case when p_sort = 'gap' and row.bucket_order = 0 then row.item_name collate "C" end asc,
      case when p_sort = 'gap' then row.item_id::text end asc,
      case when p_sort = 'gap' then row.item_unit_id::text end asc,
      case when p_sort = 'quantity' then row.quantity_missing end asc,
      case when p_sort = 'quantity' and p_dir = 'desc' then -row.absolute_difference end asc,
      case when p_sort = 'quantity' and p_dir = 'asc' then row.absolute_difference end asc,
      case when p_sort = 'quantity' then row.item_name collate "C" end asc,
      case when p_sort = 'quantity' then row.item_id::text end asc,
      case when p_sort = 'quantity' then row.item_unit_id::text end asc,
      case when p_sort = 'item' and p_dir = 'asc' then row.item_name collate "C" end asc,
      case when p_sort = 'item' and p_dir = 'desc' then row.item_name collate "C" end desc,
      case when p_sort = 'item' and p_dir = 'asc' then row.item_id::text end asc,
      case when p_sort = 'item' and p_dir = 'desc' then row.item_id::text end desc,
      case when p_sort = 'item' and p_dir = 'asc' then row.item_unit_id::text end asc,
      case when p_sort = 'item' and p_dir = 'desc' then row.item_unit_id::text end desc,
      case when p_sort = 'count-date' then row.count_missing end asc,
      case when p_sort = 'count-date' and p_dir = 'desc' then row.count_date end desc,
      case when p_sort = 'count-date' and p_dir = 'asc' then row.count_date end asc,
      case when p_sort = 'count-date' and p_dir = 'desc' then row.submitted_at end desc,
      case when p_sort = 'count-date' and p_dir = 'asc' then row.submitted_at end asc,
      case when p_sort = 'count-date' and p_dir = 'desc' then row.count_id::text end desc,
      case when p_sort = 'count-date' and p_dir = 'asc' then row.count_id::text end asc,
      case when p_sort = 'count-date' then row.item_name collate "C" end asc,
      case when p_sort = 'count-date' then row.item_id::text end asc,
      case when p_sort = 'count-date' then row.item_unit_id::text end asc
    ) as row_number
      from after_cursor row
  ), page as (
    select * from numbered where row_number <= v_limit
  ), last_page as (
    select * from page where row_number = v_limit
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(page.row_data order by page.row_number) from page), '[]'::jsonb),
    'next', case when (select count(*) from numbered) > v_limit then (
      select replace(encode(convert_to(jsonb_build_object(
        'generation', v_generation,
        'branch_id', p_branch_id,
        'activity', p_activity,
        'only_differences', coalesce(p_only_differences, false),
        'q', coalesce(p_q, ''),
        'kind', coalesce(p_kind, 'all'),
        'category', coalesce(p_category, ''),
        'sort', p_sort,
        'dir', p_dir,
        'after', jsonb_build_object(
          'bucket_order', last_page.bucket_order,
          'zero_order', last_page.zero_order,
          'gap_ratio', last_page.gap_ratio::text,
          'quantity_missing', last_page.quantity_missing,
          'count_missing', last_page.count_missing,
          'absolute_difference', last_page.absolute_difference::text,
          'item_name', last_page.item_name,
          'item_id', last_page.item_id::text,
          'item_unit_id', last_page.item_unit_id::text,
          'count_date', last_page.count_date::text,
          'submitted_at', last_page.submitted_at::text,
          'count_id', last_page.count_id::text
        )
      )::text, 'UTF8'), 'base64'), E'\n', '') from last_page
    ) else null end,
    'generation', v_generation,
    'source', v_source,
    'counts', jsonb_build_object(
      'total', (select count(*) from all_rows),
      'shown_scope', (select count(*) from filtered),
      'gaps', (select count(*) from filtered where difference is not null and difference <> 0),
      'needs_data', (select count(*) from filtered where difference is null),
      'counted', (select count(*) from filtered where count_id is not null),
      'zero', (select count(*) from filtered where difference = 0)
    ),
    'counts_complete', true
  ) into v_result;
  return v_result;
end;
$$;
revoke execute on function ops.list_stock_comparison(uuid, text, boolean, text, text, text, text, text, text, integer)
  from public, anon, service_role;
grant execute on function ops.list_stock_comparison(uuid, text, boolean, text, text, text, text, text, text, integer)
  to authenticated;
comment on function ops.list_stock_comparison(uuid, text, boolean, text, text, text, text, text, text, integer) is
  'Count-review-authorized, branch-and-activity-scoped on-hand comparison. Uses newest published EOD generation, exact item-unit ESB detail IDs, whole-scope keyset filtering/sorting and no cost or raw payload.';

create function ops.get_stock_comparison_item(
  p_branch_id uuid,
  p_activity text,
  p_item_id uuid,
  p_unit_id uuid,
  p_generation text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org_id uuid := shared.current_org_id();
  v_branch_code text;
  v_snapshot_id uuid;
  v_as_of timestamptz;
  v_synced_at timestamptz;
  v_source_complete boolean := false;
  v_source jsonb;
  v_generation text;
  v_row record;
begin
  if v_org_id is null or shared.current_person_id() is null or not shared.is_org_member() then
    raise exception 'STOCK_COMPARISON_FORBIDDEN' using errcode = '42501';
  end if;
  if p_activity not in ('kitchen', 'bar') then
    raise exception 'STOCK_COMPARISON_FORBIDDEN' using errcode = '42501';
  end if;
  select branch.code into v_branch_code
    from shared.branches branch
    join shared.teams team
      on team.org_id = branch.org_id and team.branch_id = branch.id
   where branch.org_id = v_org_id and branch.id = p_branch_id
     and branch.archived_at is null and team.archived_at is null
     and team.activity = p_activity;
  if v_branch_code is null or not ops.can_review_stream(p_branch_id, p_activity) then
    raise exception 'STOCK_COMPARISON_FORBIDDEN' using errcode = '42501';
  end if;
  select snapshot.id, snapshot.as_of, snapshot.published_at,
         coalesce(snapshot.source_complete and snapshot.ingestion_complete
           and coverage.status = 'complete' and coverage.exhausted
           and coverage.source_evidence is not null, false)
    into v_snapshot_id, v_as_of, v_synced_at, v_source_complete
    from reporting.esb_stock_snapshots snapshot
    left join reporting.esb_stock_coverage coverage
      on coverage.org_id = snapshot.org_id and coverage.snapshot_id = snapshot.id
     and coverage.branch_code = v_branch_code and coverage.partition_key = 'branch'
   where snapshot.org_id = v_org_id and snapshot.state = 'published'
     and exists (select 1 from reporting.esb_stock_coverage available
                  where available.org_id = snapshot.org_id and available.snapshot_id = snapshot.id
                    and available.branch_code = v_branch_code and available.partition_key = 'branch')
   order by snapshot.as_of desc, snapshot.published_at desc, snapshot.id desc
   limit 1;
  v_generation := coalesce(v_snapshot_id::text, 'not_connected:' || p_branch_id::text || ':' || p_activity);
  if v_generation is distinct from p_generation then
    raise exception 'generation changed, reload' using errcode = '40001';
  end if;
  v_source := jsonb_build_object(
    'connection', case when v_snapshot_id is null then 'not_connected' else 'connected' end,
    'snapshot_id', v_snapshot_id, 'mapping_version', null,
    'as_of', v_as_of, 'synced_at', v_synced_at, 'complete', coalesce(v_source_complete, false),
    'missing_scopes', case when v_source_complete then '[]'::jsonb else jsonb_build_array(v_branch_code) end,
    'stale_after_hours', 24, 'count_stale_after_hours', 24,
    'last_complete_snapshot_id', case when v_source_complete then v_snapshot_id else null end
  );
  select comparison.* into v_row
    from ops._stock_comparison_rows(v_org_id, p_branch_id, p_activity, v_snapshot_id) comparison
   where comparison.item_id = p_item_id and comparison.item_unit_id = p_unit_id;
  if not found then
    raise exception 'STOCK_COMPARISON_NOT_FOUND' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'row', v_row.row_data,
    'source', v_source,
    'source_unit_quantity', case when v_row.missing = 'unit_mismatch' then
      jsonb_build_object('quantity', v_row.expected_quantity::text, 'unit_code', v_row.expected_unit_code)
      else null end
  );
end;
$$;
revoke execute on function ops.get_stock_comparison_item(uuid, text, uuid, uuid, text)
  from public, anon, service_role;
grant execute on function ops.get_stock_comparison_item(uuid, text, uuid, uuid, text)
  to authenticated;
comment on function ops.get_stock_comparison_item(uuid, text, uuid, uuid, text) is
  'Returns one item-unit comparison only within the caller''s Count-review stream scope and current published generation.';
