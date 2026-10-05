-- Reversible client-side error reporting sink.
-- DOWN: drop function shared.report_client_error(text, text, text, text, text); drop table shared.client_errors;

create table shared.client_errors (
  id uuid primary key default extensions.gen_random_uuid(),
  org_id uuid not null references shared.orgs(id) on delete cascade,
  person_id uuid not null references shared.people(id) on delete cascade,
  message text not null check (char_length(message) <= 1000),
  stack text not null check (char_length(stack) <= 8000),
  route text not null check (char_length(route) <= 500 and position('?' in route) = 0 and position('#' in route) = 0),
  release_sha text not null check (char_length(release_sha) <= 64),
  user_agent text not null check (char_length(user_agent) <= 500),
  created_at timestamptz not null default pg_catalog.now()
);

comment on table shared.client_errors is
  'Client error summaries for launch diagnostics. Identity is server-stamped; only admins can read; authenticated callers insert through the rate-limited RPC.';

create index client_errors_person_created_at_idx
  on shared.client_errors (org_id, person_id, created_at desc);

alter table shared.client_errors enable row level security;
alter table shared.client_errors force row level security;

create policy client_errors_select_admin on shared.client_errors
  for select to authenticated
  using (org_id = shared.current_org_id() and shared.has_access_role('admin'));

revoke all on table shared.client_errors from public, anon, authenticated, service_role;
grant select on table shared.client_errors to authenticated;

create or replace function shared.report_client_error(
  p_message text,
  p_stack text,
  p_route text,
  p_release_sha text,
  p_user_agent text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid := shared.current_org_id();
  v_person_id uuid := shared.current_person_id();
  v_message text;
  v_stack text;
  v_route text := left(split_part(split_part(coalesce(p_route, ''), '?', 1), '#', 1), 500);
  v_release_sha text := left(coalesce(p_release_sha, ''), 64);
  v_user_agent text := left(coalesce(p_user_agent, ''), 500);
  v_recent_count integer;
begin
  if v_org_id is null or v_person_id is null then
    raise exception 'authenticated person required' using errcode = '42501';
  end if;

  v_message := left(
    pg_catalog.regexp_replace(
      pg_catalog.regexp_replace(
        pg_catalog.regexp_replace(
          coalesce(nullif(btrim(p_message), ''), 'Unknown client error'),
          '((https?://|/)[^[:space:]''"<>?#]+)[?][^[:space:]''"<>#]*', '\1', 'gi'),
        '(access_token|refresh_token|id_token|token|password|authorization|api[_-]?key)[[:space:]]*[:=][^[:space:],;)}]+',
        '\1=[redacted]', 'gi'),
      'Bearer[[:space:]]+[A-Za-z0-9._~+/-]+=*', 'Bearer [redacted]', 'gi'),
    1000);
  v_stack := left(
    pg_catalog.regexp_replace(
      pg_catalog.regexp_replace(
        pg_catalog.regexp_replace(coalesce(p_stack, ''),
          '((https?://|/)[^[:space:]''"<>?#]+)[?][^[:space:]''"<>#]*', '\1', 'gi'),
        '(access_token|refresh_token|id_token|token|password|authorization|api[_-]?key)[[:space:]]*[:=][^[:space:],;)}]+',
        '\1=[redacted]', 'gi'),
      'Bearer[[:space:]]+[A-Za-z0-9._~+/-]+=*', 'Bearer [redacted]', 'gi'),
    8000);

  -- Serialize submissions per person so concurrent tabs cannot race past the hourly cap.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org_id::text || ':' || v_person_id::text, 0)
  );

  select count(*)::integer into v_recent_count
    from shared.client_errors e
   where e.org_id = v_org_id
     and e.person_id = v_person_id
     and e.created_at >= pg_catalog.now() - interval '1 hour';

  if v_recent_count >= 30 then
    return;
  end if;

  insert into shared.client_errors (org_id, person_id, message, stack, route, release_sha, user_agent)
  values (v_org_id, v_person_id, v_message, v_stack, v_route, v_release_sha, v_user_agent);
end;
$$;

comment on function shared.report_client_error(text, text, text, text, text) is
  'Accepts bounded, server-attributed client error summaries for signed-in people; drops submissions beyond 30 per person per rolling hour. SECURITY DEFINER.';

revoke execute on function shared.report_client_error(text, text, text, text, text) from public, anon, service_role;
grant execute on function shared.report_client_error(text, text, text, text, text) to authenticated;
