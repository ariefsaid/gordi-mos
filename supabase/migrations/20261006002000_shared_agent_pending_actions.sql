-- Approval is bound to a server-stored pending action.
-- DOWN: drop function shared.consume_agent_pending_action(uuid); drop table shared.agent_pending_actions;

create table shared.agent_pending_actions (
  id            uuid primary key,
  org_id        uuid not null references shared.orgs(id) on delete cascade,
  person_id     uuid not null references shared.people(id) on delete cascade,
  action_name   text not null check (action_name in ('create_task', 'post_update')),
  args          jsonb not null check (jsonb_typeof(args) = 'object'),
  tool_call_id  text not null check (char_length(tool_call_id) between 1 and 200),
  expires_at    timestamptz not null,
  created_at    timestamptz not null default pg_catalog.now(),
  consumed_at   timestamptz,
  constraint agent_pending_actions_expiry_ck
    check (expires_at > created_at and expires_at <= created_at + interval '5 minutes')
);

comment on table shared.agent_pending_actions is
  'Short-lived write approvals bound to the validated action arguments and the person who proposed them.';

create index agent_pending_actions_owner_idx
  on shared.agent_pending_actions (org_id, person_id, expires_at);

alter table shared.agent_pending_actions enable row level security;
alter table shared.agent_pending_actions force row level security;

revoke all on shared.agent_pending_actions from public, anon, authenticated, service_role;
grant select on shared.agent_pending_actions to authenticated;
grant insert on shared.agent_pending_actions to service_role;

create policy agent_pending_actions_select_owner on shared.agent_pending_actions
  for select to authenticated
  using (
    org_id = (select shared.current_org_id())
    and person_id = (select shared.current_person_id())
  );

create or replace function shared.consume_agent_pending_action(p_pending_id uuid)
returns table (id uuid, action_name text, args jsonb, tool_call_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid := (select shared.current_org_id());
  v_person_id uuid := (select shared.current_person_id());
begin
  if v_org_id is null or v_person_id is null then
    return;
  end if;

  return query
    update shared.agent_pending_actions as pending
       set consumed_at = pg_catalog.now()
     where pending.id = p_pending_id
       and pending.org_id = v_org_id
       and pending.person_id = v_person_id
       and pending.consumed_at is null
       and pending.expires_at > pg_catalog.now()
    returning pending.id, pending.action_name, pending.args, pending.tool_call_id;
end;
$$;

comment on function shared.consume_agent_pending_action(uuid) is
  'Atomically consumes one unexpired approval owned by the caller and returns its stored action.';

revoke execute on function shared.consume_agent_pending_action(uuid) from public, anon, authenticated;
revoke all on function shared.consume_agent_pending_action(uuid) from public, anon, service_role;
grant execute on function shared.consume_agent_pending_action(uuid) to authenticated;
