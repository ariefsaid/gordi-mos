-- mos.create_notification — the ONE sanctioned cross-owner delivery path (ADR-0044 §5 / ADR-0019 D4
-- @mention). SECURITY DEFINER because delivering a notification to ANOTHER person requires writing a
-- row the caller's RLS INSERT policy forbids (that policy pins owner_id to the caller). The helper is
-- the controlled seam: it asserts the target is a same-org, non-archived person (so a caller can only
-- notify within their own org — the org wall holds), then inserts on the target's behalf. Everything
-- else about notifications stays caller-JWT/RLS; this is the single definer exception (ADR-0020 spirit:
-- provisioning/cross-actor writes are definer-scoped and narrow). FR-P3-CM-005 / AC-P3-NF-001.
-- Reversibility (pre-production): `supabase db reset`. Manual rollback at file foot.

create or replace function mos.create_notification(
  p_owner    uuid,
  p_severity text,
  p_title    text,
  p_body     text default null,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  -- Org wall: the target must be a same-org, non-archived person. A caller in org A can never
  -- deliver into org B (cross-org @mention is impossible), and cannot notify an archived person.
  if not exists (
    select 1 from shared.people
     where id = p_owner
       and org_id = shared.current_org_id()
       and archived_at is null
  ) then
    raise exception 'create_notification: target % is not a current-org active person', p_owner
      using errcode = '42501';
  end if;

  insert into mos.notifications (owner_id, org_id, severity, title, body, metadata)
  values (p_owner, shared.current_org_id(), coalesce(p_severity, 'info'), p_title, p_body,
          coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end;
$$;

comment on function mos.create_notification(uuid, text, text, text, jsonb) is
  'Sanctioned cross-owner notification delivery (@mention). SECURITY DEFINER; org-walled to a same-org non-archived target; the only path that writes a notification for another owner (FR-P3-CM-005).';

-- Callers are authenticated end users (the mention author); the org assertion is the guard.
revoke execute on function mos.create_notification(uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function mos.create_notification(uuid, text, text, text, jsonb) to authenticated;

-- DOWN (manual, pre-production):
-- revoke execute on function mos.create_notification(uuid, text, text, text, jsonb) from authenticated;
-- drop function if exists mos.create_notification(uuid, text, text, text, jsonb);
