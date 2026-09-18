-- Signals: explicit All Teams audience (ticket 867).
--
-- Every NEW Signal is org-wide (`audience = 'org'`, `owning_team_id = null`): there is no Team
-- target in capture and it never comes back. `audience = 'team'` is a RETIRED state kept so
-- historical rows stay describable; it is valid on historical rows only and is never written again.
-- `audience` is the discriminator; is-null owning_team_id is derived validity from that explicit
-- state, never an absent audience. Precedent: mos.comments.entity_type.
--
-- Reads: every active same-org member reads every org Signal (passive, never a notification);
-- historical team rows keep their Team-rooted grants; the mention grant stays additive.
-- Notifications stay mention-only. Retraction on org rows is author-or-org-scoped; on historical
-- rows the Team/BU chain is unchanged. signal.tag authority becomes scope org for every role as
-- durable configuration. The composer Team machinery is retired with the state.

begin;

-- ── Schema (AC-1) ──────────────────────────────────────────────────────────────────────────────
-- Backfill historical rows as team-audience, then make audience NOT NULL and couple it to whether
-- an owning Team is present. owning_team_id becomes nullable so org rows can carry NULL.
alter table mos.signals add column audience text;
update mos.signals set audience = 'team';
alter table mos.signals alter column audience set not null;
alter table mos.signals alter column owning_team_id drop not null;
alter table mos.signals add constraint signals_audience_check
  check (audience in ('org','team'));
alter table mos.signals add constraint signals_audience_team_coupling
  check ((audience = 'team') = (owning_team_id is not null));

comment on table mos.signals is
  'The Signal factual record (ADR-0050 D3). `audience` discriminates org-wide rows (All Teams; '
  'owning_team_id NULL) from retired team-scoped rows (owning_team_id set). BU and Site derive via '
  'owning_team_id on historical rows only. Retraction is soft; no DELETE anywhere.';
comment on column mos.signals.audience is
  'All Teams (org) for every new row; team is a retired historical value never written again. '
  'Immutable after post.';

-- ── Immutable guard: extend the append-only set to audience (AC-1) ─────────────────────────────
create or replace function mos._guard_signals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team_org   uuid;
  v_author_org uuid;
begin
  -- SAME-ORG REFERENCES, checked on INSERT as well as UPDATE — which is why this trigger is no
  -- longer UPDATE-only. owning_team_id (historical rows only) and author_id are existence-only FKs
  -- into org-scoped tables. The INSERT policy pins the row's own org_id and pins author_id to the
  -- session person. Compared against new.org_id, the idiom the sibling guards use, so the rule
  -- states the row's own internal consistency and holds identically on the seed and service paths.
  if new.owning_team_id is not null then
    select t.org_id into v_team_org from shared.teams t where t.id = new.owning_team_id;
    if v_team_org is distinct from new.org_id then
      raise exception 'owning_team_id belongs to a different org' using errcode = '42501';
    end if;
  end if;
  if new.author_id is not null then
    select p.org_id into v_author_org from shared.people p where p.id = new.author_id;
    if v_author_org is distinct from new.org_id then
      raise exception 'author_id belongs to a different org' using errcode = '42501';
    end if;
  end if;

  -- Everything below reads OLD and is therefore UPDATE-only. Guarded explicitly rather than left to
  -- the trigger definition, so the two halves cannot drift apart if the definition is ever widened
  -- again: on INSERT, OLD is not merely empty, it is not a row at all.
  if tg_op = 'INSERT' then
    return new;
  end if;

  if new.author_id is distinct from old.author_id
     or new.owning_team_id is distinct from old.owning_team_id
     or new.audience is distinct from old.audience
     or new.source is distinct from old.source
     or new.org_id is distinct from old.org_id
     or new.created_at is distinct from old.created_at then
    raise exception 'signal author/owning_team/audience/source/org/created_at are immutable' using errcode = '42501';
  end if;

  -- SECURITY HIGH-1: content is AUTHOR-ONLY. The UPDATE policy's USING clause admits both the author
  -- and any signal.retract holder — it has to, so a holder can retract someone else's Signal — but
  -- without this that same holder could rewrite the body. A non-author may move only the retraction
  -- columns.
  if (new.body is distinct from old.body
      or new.occurred_at is distinct from old.occurred_at
      or new.category is distinct from old.category
      or new.attention is distinct from old.attention)
     and old.author_id is distinct from shared.current_person_id() then
    raise exception 'signal content is author-only; signal.retract may only retract' using errcode = '42501';
  end if;

  if new.retracted_at is distinct from old.retracted_at then
    if not (old.author_id = shared.current_person_id() or shared.can('signal.retract')) then
      raise exception 'retract requires author or signal.retract' using errcode = '42501';
    end if;
    if new.retracted_at is not null and btrim(coalesce(new.retract_reason,'')) = '' then
      raise exception 'retraction requires a reason' using errcode = '23514';
    end if;
  end if;

  -- Edit history. One branch per mutable field so the revision row names the field that moved.
  if new.body is distinct from old.body then
    insert into mos.signal_revisions(org_id,signal_id,actor_id,field,old_value,new_value)
      values (old.org_id, old.id, shared.current_person_id(), 'body', old.body, new.body);
    new.edited_at := now();
  end if;
  if new.occurred_at is distinct from old.occurred_at then
    insert into mos.signal_revisions(org_id,signal_id,actor_id,field,old_value,new_value)
      values (old.org_id, old.id, shared.current_person_id(), 'occurred_at', old.occurred_at::text, new.occurred_at::text);
    new.edited_at := now();
  end if;
  if new.category is distinct from old.category then
    insert into mos.signal_revisions(org_id,signal_id,actor_id,field,old_value,new_value)
      values (old.org_id, old.id, shared.current_person_id(), 'category', old.category, new.category);
    new.edited_at := now();
  end if;
  if new.attention is distinct from old.attention then
    insert into mos.signal_revisions(org_id,signal_id,actor_id,field,old_value,new_value)
      values (old.org_id, old.id, shared.current_person_id(), 'attention', old.attention, new.attention);
    new.edited_at := now();
  end if;

  return new;
end;
$$;
comment on function mos._guard_signals() is
  'Guard (ADR-0050 D5 + SECURITY HIGH-1): owning_team_id and author_id must be same-org on INSERT '
  'and UPDATE (42501); author/owning_team/audience/source/org/created_at immutable; content is '
  'author-only so a signal.retract holder may only retract; a retraction requires a reason; every '
  'content change appends a signal_revisions row. SECURITY DEFINER solely to write that revision '
  'table, which has no INSERT grant.';
revoke execute on function mos._guard_signals() from public, anon, authenticated;

-- ── Read wall (AC-2) ───────────────────────────────────────────────────────────────────────────
-- Org rows: every active same-org member reads (passive). Historical team rows: keep the surviving
-- Team-rooted grants R1..R3 plus additive R4 mention and inert R5. SECURITY DEFINER stays
-- load-bearing (self-referential RLS); org-gated first; returns only a boolean for the JWT caller.
create or replace function mos.can_read_signal(p_signal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from mos.signals s
    where s.id = p_signal_id
      and s.org_id = shared.current_org_id()
      and (
        (s.audience = 'org' and shared._current_person_is_live())
        or (s.audience = 'team' and mos._can_read_signal_rules(s.id, s.owning_team_id))
      )
  )
$$;
comment on function mos.can_read_signal(uuid) is
  'Default-deny Signal read gate. All Teams (org) rows are readable by every active same-org '
  'member; historical team rows keep the Team-rooted R1..R3 grants plus additive R4 mention and '
  'inert R5. SECURITY DEFINER to break self-referential RLS recursion; org-gated first; returns only '
  'a boolean computed for the JWT caller.';
revoke execute on function mos.can_read_signal(uuid) from public, anon, authenticated;
grant  execute on function mos.can_read_signal(uuid) to authenticated;

-- ── Post path (AC-3): retire team machinery ───────────────────────────────────────────────────
-- Only org-audience rows can be inserted, gated on base signal.post authority. A team-audience row
-- is impossible to insert from here; the retired historical rows keep theirs.
-- Drop the policy first: the retired post gate depends on it, so the function drop needs the
-- policy gone first.
drop policy signals_insert on mos.signals;
create policy signals_insert on mos.signals
  for insert to authenticated
  with check (
    org_id = shared.current_org_id()
    and author_id = shared.current_person_id()
    and source = 'human'
    and audience = 'org'
    and owning_team_id is null
    and shared.role_authority_allows('signal.post', null, null, null)
  );
comment on policy signals_insert on mos.signals is
  'New Signals are always All Teams: org audience, no owning Team, gated on the base signal.post '
  'authority. The retired team audience exists on historical rows only and cannot be inserted.';

-- The author-destination and team-post gates are retired with the composer Team machinery.
drop function if exists mos.teams_author_can_read_back(uuid);
drop function if exists mos.can_post_signal_for_team(uuid);
delete from shared.role_capabilities where capability = 'signal.create_for_team';

-- ── Retraction (AC-4) ─────────────────────────────────────────────────────────────────────────
-- Org rows branch without joining shared.teams: author (own semantics) or an org-scoped holder
-- (ops_lead/admin). Historical team rows keep the Team/BU chain. signals_update_author and the
-- guard triggers carry the same rule; a team-audience insert is impossible so no new-row gap.
create or replace function mos.can_retract_signal(p_signal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select case when s.audience = 'org' then
               shared.role_authority_allows('signal.retract', null, null, s.author_id)
             else
               shared.role_authority_allows(
                 'signal.retract', t.business_unit_id, s.owning_team_id, s.author_id)
             end
        from mos.signals s
        left join shared.teams t on t.id = s.owning_team_id and t.org_id = s.org_id
       where s.id = p_signal_id
         and s.org_id = shared.current_org_id()
         and s.retracted_at is null
    ),
    false
  )
$$;
comment on function mos.can_retract_signal(uuid) is
  'Same-org row affordance for an active Signal. On All Teams rows: the author, or an org-scoped '
  'signal.retract holder (ops_lead/admin). On historical team rows: the owning-Team/BU chain per '
  'signal.retract. Missing/foreign/retracted ids return false.';
revoke execute on function mos.can_retract_signal(uuid) from public, anon, authenticated;
grant execute on function mos.can_retract_signal(uuid) to authenticated;

-- ── Post RPC (AC-3/AC-5): drop the Team parameter, always write org audience ───────────────────
-- The Team-taking overload (text, uuid, timestamptz, jsonb, text) is retired with the team
-- audience. Signatures differ, so create-or-replace cannot retire an overload — it must be dropped
-- explicitly, leaving only the 4-arg All-Teams form.
drop function if exists mos.create_signal_with_mentions(text, uuid, timestamptz, jsonb, text);
create or replace function mos.create_signal_with_mentions(
  p_body text,
  p_occurred_at timestamptz,
  p_mentions jsonb default '[]'::jsonb,
  p_attention text default 'FYI'
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id     uuid;
  v_m      jsonb;
  v_kind   text;
  v_target uuid;
begin
  for v_m in select value from jsonb_array_elements(coalesce(p_mentions, '[]'::jsonb)) loop
    v_kind := v_m->>'kind';
    v_target := (v_m->>'targetId')::uuid;
    if v_kind = 'person' then
      if not exists (
        select 1 from shared.people p
         where p.id = v_target
           and p.org_id = shared.current_org_id()
           and p.archived_at is null
      ) then
        raise exception 'mention target person is not an active member of your org'
          using errcode = '42501';
      end if;
    elsif v_kind = 'team' then
      if not exists (
        select 1 from shared.teams t
         where t.id = v_target
           and t.org_id = shared.current_org_id()
           and t.archived_at is null
      ) then
        raise exception 'mention target Team is not active in your org' using errcode = '42501';
      end if;
    elsif v_kind = 'bu' then
      if not exists (
        select 1 from shared.business_units b
         where b.id = v_target
           and b.org_id = shared.current_org_id()
           and b.archived_at is null
      ) then
        raise exception 'mention target BU is not active in your org' using errcode = '42501';
      end if;
    else
      raise exception 'unknown mention kind' using errcode = '22023';
    end if;
  end loop;
  if p_attention not in ('FYI', 'Needs attention', 'Urgent') then
    raise exception 'invalid attention' using errcode = '22023';
  end if;

  v_id := gen_random_uuid();
  insert into mos.signals (id, body, audience, owning_team_id, occurred_at, attention)
    values (v_id, p_body, 'org', null, p_occurred_at, p_attention);
  insert into mos.signal_mentions
    (signal_id, mention_kind, target_person_id, target_team_id, target_bu_id)
  select v_id,
         m->>'kind',
         case when m->>'kind' = 'person' then (m->>'targetId')::uuid end,
         case when m->>'kind' = 'team'   then (m->>'targetId')::uuid end,
         case when m->>'kind' = 'bu'     then (m->>'targetId')::uuid end
    from jsonb_array_elements(coalesce(p_mentions, '[]'::jsonb)) as m;
  perform mos.fan_out_signal_mention(v_id);
  return v_id;
end;
$$;
comment on function mos.create_signal_with_mentions(text,timestamptz,jsonb,text) is
  'Transactional Signal post with attention capture — always writes an All Teams (org) row with no '
  'owning Team. Preflights active same-org mention targets; the SECURITY INVOKER INSERTs remain the '
  'authoritative post/tag gates, and fan-out is atomic. Retired Team-taking signatures are gone.';
revoke execute on function mos.create_signal_with_mentions(text,timestamptz,jsonb,text) from public, anon;
grant execute on function mos.create_signal_with_mentions(text,timestamptz,jsonb,text) to authenticated;

-- ── signal.tag authority: org for every role, durable configuration (AC-6) ────────────────────
create or replace function shared._role_authority_defaults()
returns table(action text, role text, default_scope text, allowed_scopes text[])
language sql
immutable
set search_path = ''
as $$
  with actions(action, allowed_scopes) as (
    values
      ('workline.manage',  array['none','own_bu','org']::text[]),
      ('objective.manage',  array['none','own_bu','org']::text[]),
      ('signal.post',      array['none','org']::text[]),
      ('signal.tag',       array['none','org']::text[]),
      ('signal.retract',   array['none','own','own_team','own_bu','org']::text[]),
      ('process.start',    array['none','own_team','org']::text[]),
      ('process.close',    array['none','own','own_team','org']::text[])
  ),
  roles(role) as (
    values
      ('member'), ('team_lead'), ('bu_head'), ('ops_lead'), ('admin'),
      ('finance'), ('manager'), ('supervisor')
  ),
  defaults(action, role, default_scope) as (
    values
      ('workline.manage',  'member',     'none'),
      ('workline.manage',  'team_lead',  'none'),
      ('workline.manage',  'bu_head',    'own_bu'),
      ('workline.manage',  'ops_lead',   'org'),
      ('workline.manage',  'admin',      'org'),
      ('workline.manage',  'finance',    'none'),
      ('workline.manage',  'manager',    'none'),
      ('workline.manage',  'supervisor', 'none'),

      ('objective.manage',  'member',     'none'),
      ('objective.manage',  'team_lead',  'none'),
      ('objective.manage',  'bu_head',    'own_bu'),
      ('objective.manage',  'ops_lead',   'org'),
      ('objective.manage',  'admin',      'org'),
      ('objective.manage',  'finance',    'none'),
      ('objective.manage',  'manager',    'none'),
      ('objective.manage',  'supervisor', 'none'),

      ('signal.post',      'member',     'org'),
      ('signal.post',      'team_lead',  'none'),
      ('signal.post',      'bu_head',    'none'),
      ('signal.post',      'ops_lead',   'org'),
      ('signal.post',      'admin',      'org'),
      ('signal.post',      'finance',    'none'),
      ('signal.post',      'manager',    'none'),
      ('signal.post',      'supervisor', 'none'),

      ('signal.tag',       'member',     'org'),
      ('signal.tag',       'team_lead',  'org'),
      ('signal.tag',       'bu_head',    'org'),
      ('signal.tag',       'ops_lead',   'org'),
      ('signal.tag',       'admin',      'org'),
      ('signal.tag',       'finance',    'org'),
      ('signal.tag',       'manager',    'org'),
      ('signal.tag',       'supervisor', 'org'),

      ('signal.retract',   'member',     'own'),
      ('signal.retract',   'team_lead',  'own_team'),
      ('signal.retract',   'bu_head',    'own_bu'),
      ('signal.retract',   'ops_lead',   'org'),
      ('signal.retract',   'admin',      'org'),
      ('signal.retract',   'finance',    'none'),
      ('signal.retract',   'manager',    'none'),
      ('signal.retract',   'supervisor', 'none'),

      ('process.start',    'member',     'own_team'),
      ('process.start',    'team_lead',  'none'),
      ('process.start',    'bu_head',    'none'),
      ('process.start',    'ops_lead',   'org'),
      ('process.start',    'admin',      'org'),
      ('process.start',    'finance',    'none'),
      ('process.start',    'manager',    'none'),
      ('process.start',    'supervisor', 'none'),

      ('process.close',    'member',     'own'),
      ('process.close',    'team_lead',  'own_team'),
      ('process.close',    'bu_head',    'none'),
      ('process.close',    'ops_lead',   'org'),
      ('process.close',    'admin',      'org'),
      ('process.close',    'finance',    'none'),
      ('process.close',    'manager',    'none'),
      ('process.close',    'supervisor', 'none')
  )
  select d.action, d.role, d.default_scope, a.allowed_scopes
    from defaults d
    join actions a on a.action = d.action
    join roles r on r.role = d.role
   order by d.action, case r.role
       when 'member' then 1 when 'team_lead' then 2 when 'bu_head' then 3
       when 'ops_lead' then 4 when 'admin' then 5 when 'finance' then 6
       when 'manager' then 7 else 8 end;
$$;
comment on function shared._role_authority_defaults() is
  'Complete settings surface. signal.post and signal.tag default to org for every role — every '
  'active same-org member posts and tags org-wide; signal.retract keeps scoped defaults.';

-- ── Test fixture: keep seam Signals readable-close (historical team audience) ───────────────
-- mos._test_seed_rows inserts a seam Signal in BOTH test orgs. audience is now NOT NULL with no
-- default, and the fail-closed read tests (mos_03) prove a non-reaching same-org member sees ZERO
-- Signals. That property survives only on the retired team-audience surface (org rows are
-- deliberately org-readable), so this fixture seeds its seam Signals as historical team rows. The
-- owning Team and membership that make R1 resolve are already created just above.
create or replace function mos._test_seed_rows()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if coalesce(current_setting('app.allow_test_seeds', true), '') <> 'on' then
    raise exception '_test_seed_rows is a TEST-ONLY fixture; set app.allow_test_seeds=on to run it'
      using errcode = '42501';
  end if;

  for r in
    select * from (values
      ('00000000-0000-0000-0000-0000000000a1'::uuid, '00000000-0000-0000-0000-0000000000a2'::uuid,
       '00000000-0000-0000-0000-0000000000d1'::uuid, '70'::text),
      ('00000000-0000-0000-0000-0000000000b1'::uuid, '00000000-0000-0000-0000-0000000000b2'::uuid,
       '00000000-0000-0000-0000-0000000000b4'::uuid, '71'::text)
    ) as t(org_id, bu_id, person_id, p)
  loop
    insert into shared.sites (id, org_id, name, code)
      values (('00000000-0000-0000-0000-0000000' || r.p || '000')::uuid, r.org_id, 'Seam Site ' || r.p, 'seam_site_' || r.p);
    insert into shared.teams (id, org_id, business_unit_id, site_id, name, code)
      values (('00000000-0000-0000-0000-0000000' || r.p || '001')::uuid, r.org_id, r.bu_id,
              ('00000000-0000-0000-0000-0000000' || r.p || '000')::uuid, 'Seam Team ' || r.p, 'seam_team_' || r.p);
    insert into shared.team_memberships (org_id, person_id, team_id)
      values (r.org_id, r.person_id, ('00000000-0000-0000-0000-0000000' || r.p || '001')::uuid);

    insert into mos.objectives (id, org_id, name)
      values (('00000000-0000-0000-0000-0000000' || r.p || '002')::uuid, r.org_id, 'Seam Objective ' || r.p);
    insert into mos.work_lines (id, org_id, name, type, objective_id)
      values (('00000000-0000-0000-0000-0000000' || r.p || '003')::uuid, r.org_id, 'Seam Project ' || r.p, 'project',
              ('00000000-0000-0000-0000-0000000' || r.p || '002')::uuid);
    insert into mos.work_lines (id, org_id, name, type, business_unit_id, accountable_person_id)
      values (('00000000-0000-0000-0000-0000000' || r.p || '004')::uuid, r.org_id, 'Seam Process ' || r.p, 'process',
              r.bu_id, r.person_id);
    insert into mos.process_cadences (id, org_id, work_line_id, cadence_kind)
      values (('00000000-0000-0000-0000-0000000' || r.p || '005')::uuid, r.org_id,
              ('00000000-0000-0000-0000-0000000' || r.p || '004')::uuid, 'daily');
    insert into mos.process_task_defs (id, org_id, work_line_id, title, pic_person_id, pic_team_id)
      values (('00000000-0000-0000-0000-0000000' || r.p || '006')::uuid, r.org_id,
              ('00000000-0000-0000-0000-0000000' || r.p || '004')::uuid, 'Seam Step ' || r.p, r.person_id,
              ('00000000-0000-0000-0000-0000000' || r.p || '001')::uuid);
    insert into mos.process_runs (id, org_id, work_line_id, owning_team_id, period_key, caption,
                                  scheduled_date, definition_version, spec_snapshot, started_by)
      values (('00000000-0000-0000-0000-0000000' || r.p || '007')::uuid, r.org_id,
              ('00000000-0000-0000-0000-0000000' || r.p || '004')::uuid,
              ('00000000-0000-0000-0000-0000000' || r.p || '001')::uuid,
              '2026-01-01', 'Seam Run ' || r.p, date '2026-01-01', 1, '{}'::jsonb, r.person_id);

    insert into mos.tasks (id, org_id, title, business_unit_id, team_id, responsible_person_id,
                           accountable_person_id, created_by, objective_id, work_line_id)
      values (('00000000-0000-0000-0000-0000000' || r.p || '008')::uuid, r.org_id, 'Seam Task ' || r.p,
              r.bu_id, ('00000000-0000-0000-0000-0000000' || r.p || '001')::uuid,
              r.person_id, r.person_id, r.person_id,
              ('00000000-0000-0000-0000-0000000' || r.p || '002')::uuid,
              ('00000000-0000-0000-0000-0000000' || r.p || '003')::uuid);
    insert into mos.process_run_pending_tasks (id, org_id, process_run_id, task_def_id, reason)
      values (('00000000-0000-0000-0000-0000000' || r.p || '009')::uuid, r.org_id,
              ('00000000-0000-0000-0000-0000000' || r.p || '007')::uuid,
              ('00000000-0000-0000-0000-0000000' || r.p || '006')::uuid, 'none');
    insert into mos.task_checklist_items (id, org_id, task_id, label, position)
      values (('00000000-0000-0000-0000-0000000' || r.p || '00a')::uuid, r.org_id,
              ('00000000-0000-0000-0000-0000000' || r.p || '008')::uuid, 'Seam step', 0);
    insert into mos.task_events (id, org_id, task_id, actor_person_id, event_type)
      values (('00000000-0000-0000-0000-0000000' || r.p || '00b')::uuid, r.org_id,
              ('00000000-0000-0000-0000-0000000' || r.p || '008')::uuid, r.person_id, 'created');

    insert into mos.signals (id, org_id, author_id, owning_team_id, audience, occurred_at, body)
      values (('00000000-0000-0000-0000-0000000' || r.p || '00c')::uuid, r.org_id, r.person_id,
              ('00000000-0000-0000-0000-0000000' || r.p || '001')::uuid, 'team', now(), 'Seam signal ' || r.p);
    insert into mos.signal_mentions (id, org_id, signal_id, mention_kind, target_person_id)
      values (('00000000-0000-0000-0000-0000000' || r.p || '00d')::uuid, r.org_id,
              ('00000000-0000-0000-0000-0000000' || r.p || '00c')::uuid, 'person', r.person_id);
    insert into mos.signal_acknowledgements (id, org_id, signal_id, person_id)
      values (('00000000-0000-0000-0000-0000000' || r.p || '00e')::uuid, r.org_id,
              ('00000000-0000-0000-0000-0000000' || r.p || '00c')::uuid, r.person_id);
    insert into mos.signal_revisions (id, org_id, signal_id, actor_id, field, old_value, new_value)
      values (('00000000-0000-0000-0000-0000000' || r.p || '00f')::uuid, r.org_id,
              ('00000000-0000-0000-0000-0000000' || r.p || '00c')::uuid, r.person_id, 'body', 'old', 'new');
    insert into mos.signal_tasks (id, org_id, signal_id, task_id, created_by)
      values (('00000000-0000-0000-0000-0000000' || r.p || '010')::uuid, r.org_id,
              ('00000000-0000-0000-0000-0000000' || r.p || '00c')::uuid,
              ('00000000-0000-0000-0000-0000000' || r.p || '008')::uuid, r.person_id);

    insert into mos.weekly_updates (id, org_id, person_id, week_start, created_by)
      values (('00000000-0000-0000-0000-0000000' || r.p || '011')::uuid, r.org_id, r.person_id,
              date '2026-01-05', r.person_id);
    insert into mos.weekly_update_items (id, org_id, weekly_update_id, label, position)
      values (('00000000-0000-0000-0000-0000000' || r.p || '012')::uuid, r.org_id,
              ('00000000-0000-0000-0000-0000000' || r.p || '011')::uuid, 'Seam line', 0);

    insert into mos.comments (id, org_id, author_id, entity_type, entity_id, body)
      values (('00000000-0000-0000-0000-0000000' || r.p || '013')::uuid, r.org_id, r.person_id, 'task',
              ('00000000-0000-0000-0000-0000000' || r.p || '008')::uuid, 'Seam comment');
    insert into mos.notifications (id, org_id, owner_id, title)
      values (('00000000-0000-0000-0000-0000000' || r.p || '014')::uuid, r.org_id, r.person_id, 'Seam notification');
    insert into mos.push_subscriptions (id, org_id, owner_id, endpoint)
      values (('00000000-0000-0000-0000-0000000' || r.p || '015')::uuid, r.org_id, r.person_id,
              'https://push.example/' || r.p);
    insert into mos.user_views (id, org_id, owner_id, name)
      values (('00000000-0000-0000-0000-0000000' || r.p || '016')::uuid, r.org_id, r.person_id, 'Seam view');

    insert into mos.agent_threads (id, org_id, owner_id, title)
      values (('00000000-0000-0000-0000-0000000' || r.p || '017')::uuid, r.org_id, r.person_id, 'Seam thread');
    insert into mos.agent_runs (id, org_id, thread_id, owner_id)
      values (('00000000-0000-0000-0000-0000000' || r.p || '018')::uuid, r.org_id,
              ('00000000-0000-0000-0000-0000000' || r.p || '017')::uuid, r.person_id);
    insert into mos.agent_events (id, org_id, run_id, owner_id, seq, type, text)
      values (('00000000-0000-0000-0000-0000000' || r.p || '019')::uuid, r.org_id,
              ('00000000-0000-0000-0000-0000000' || r.p || '018')::uuid, r.person_id, 1, 'assistant', 'Seam turn');

    insert into mos.certified_metrics (org_id, key, name, meaning, unit, grain)
      values (r.org_id, 'cogs.budgeted', 'Budgeted COGS', 'Seam fixture definition', 'IDR', 'menu item');

    insert into mos.budgets (id, org_id, menu_item_esb_code, menu_item_name, scenario_label,
                             owning_bu_id, total_budgeted_cogs, cost_basis_as_of, created_by)
      values (('00000000-0000-0000-0000-0000000' || r.p || '01a')::uuid, r.org_id, 'SKU-' || r.p, 'Seam Item',
              'baseline', r.bu_id, 1000, now(), r.person_id);
    insert into mos.budget_lines (id, org_id, budget_id, ingredient_esb_code, recipe_qty, qty_unit)
      values (('00000000-0000-0000-0000-0000000' || r.p || '01b')::uuid, r.org_id,
              ('00000000-0000-0000-0000-0000000' || r.p || '01a')::uuid, 'ING-' || r.p, 1, 'kg');

    insert into mos.follow_ups (id, org_id, counterparty, kind, lane, source_invoice_ref,
                                original_amount, running_balance)
      values (('00000000-0000-0000-0000-0000000' || r.p || '01c')::uuid, r.org_id, 'Seam Counterparty ' || r.p,
              'b2b_ar', 'b2b_sales', 'SEAM-' || r.p, 100000, 100000);
    insert into mos.follow_up_events (id, org_id, follow_up_id, transition, from_state, to_state)
      values (('00000000-0000-0000-0000-0000000' || r.p || '01d')::uuid, r.org_id,
              ('00000000-0000-0000-0000-0000000' || r.p || '01c')::uuid, 'chase', 'open', 'chased');

    insert into reporting.esb_ar_reduction (org_id, counterparty, period, esb_reduction_amount, snapshot_as_of)
      values (r.org_id, 'Seam Counterparty ' || r.p, '2026-01', 50000, now());
  end loop;
end;
$$;
comment on function mos._test_seed_rows() is
  'TEST-ONLY fixture (SECURITY DEFINER): one row in EVERY mos table, plus the AR landing zone, in BOTH '
  'test orgs — so a zero read by an org-A session proves isolation rather than emptiness. Seam Signals '
  'are seeded as historical team-audience rows (org rows are deliberately org-readable). Call after '
  'shared._test_seed_directory(). Fail-closed behind app.allow_test_seeds.';
revoke execute on function mos._test_seed_rows() from public, anon, authenticated;

-- DOWN (apply in order, manual, before production):
--   drop policy signals_insert on mos.signals; (restore the previous team-post body if needed)
--   drop function mos.create_signal_with_mentions(text,timestamptz,jsonb,text);
--   drop function mos.can_retract_signal(uuid); drop function mos.can_read_signal(uuid);
--   recreate the retired can_post_signal_for_team / teams_author_can_read_back / _role_authority_defaults
--   re-insert the signal.create_for_team capability rows
--   alter table mos.signals drop constraint signals_audience_team_coupling;
--   alter table mos.signals drop constraint signals_audience_check;
--   alter table mos.signals drop column audience;
--   alter table mos.signals alter column owning_team_id set not null;

commit;