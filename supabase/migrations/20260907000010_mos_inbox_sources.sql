-- Ticket #771 · OD-WAY-96 (4). AC-010..AC-015.
--
-- Inbox carries three new sources besides @mentions: task_named (PIC/Supervisor assignment),
-- task_comment (a comment on a Task you own or supervise), signal_urgent (an Urgent Signal in a
-- Team you lead). Approvals leaves the copy until an approval concept exists in the schema.
--
-- Every notification — the existing mention fan-out included — carries one metadata shape:
--   source · actor {id, name} · entity {type, id, route} · attention (Signal sources only)
-- Actor name is stamped at delivery. The actor never notifies themself. Deliveries dedupe per
-- (owner_id, source, entity_id) — a re-save that names the same PIC delivers nothing, and a lead
-- already notified by mention for a Signal is not notified twice.
--
-- Cross-owner delivery goes through the ONE existing SECURITY DEFINER helper
-- (mos.create_notification). No new definer function is introduced by this migration; the guards
-- stay SECURITY INVOKER (mos._guard_tasks) or the SECURITY DEFINER it already was
-- (mos._guard_signals delivering the retract row from #767). The recipient-only
-- notifications_insert policy from #767 is unchanged.
--
-- DOWN (copy into a transaction to restore the released predecessor):
--   drop index if exists mos.notifications_fanout_source_entity_once;
--   drop trigger if exists comments_deliver on mos.comments;
--   drop function if exists mos._deliver_task_comment();
--   -- Re-create mos._guard_tasks (drop the task_named branch — see 20260905000003_mos_task_permission_rules.sql for the pre-#771 body).
--   -- Re-create mos._guard_signals (drop the signal_urgent branch — see 20260906000001_mos_signal_post_scope_and_lead_retract.sql).
--   -- Re-create mos.fan_out_signal_mention (strip actor/attention and the trailing signal_urgent loop — see 20260805000007_mos_functions.sql for the pre-#771 body).

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 0. Comment refresh on the ONE existing definer delivery function
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- mos.create_notification (unchanged) now delivers four fan-out sources on top of the mention path:
-- task_named + task_comment (through mos._guard_tasks / mos._deliver_task_comment) and
-- signal_urgent (through mos._guard_signals / mos.fan_out_signal_mention). The retract row still
-- writes inline in the signals guard (a legacy path preserved from #767, not re-routed here so RLS
-- and the DOWN of #767 stay verbatim).
comment on function mos.create_notification(uuid, text, text, text, jsonb) is
  'The ONE cross-owner delivery path (SECURITY DEFINER). Delivers @mention fan-out and the #771 '
  'Inbox sources (task_named, task_comment, signal_urgent); org-walled to a same-org non-archived '
  'target. The signal_retracted row is still written inline in the signals guard (#767).';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. Dedupe index
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- One row per (owner, source, entity) across the four fan-out sources. The retract-only index the
-- #767 change shipped is a strict subset; kept intact so the DOWN of that migration still
-- restores its predecessor cleanly. A concurrent double-delivery hits this index and raises
-- unique_violation, which every delivery site below catches and swallows — the notification is a
-- pointer, not an accumulator.
create unique index if not exists notifications_fanout_source_entity_once
  on mos.notifications (owner_id, (metadata->>'source'), (metadata#>>'{entity,id}'))
  where metadata->>'source' in ('task_named','task_comment','signal_urgent','signal_mention');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. mos._guard_tasks — deliver task_named on INSERT and on a PIC/Supervisor change
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The guard already sees OLD/NEW for PIC and Supervisor and already runs on every direct write.
-- Adding the delivery here keeps every task-writing path — direct INSERT, RPC — covered by one
-- rule rather than a per-caller reminder. Body preserves the #742 layout verbatim; the delivery
-- pass appends at the end where NEW is fully validated and any refusal above has already raised.
create or replace function mos._guard_tasks()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_bu_org      uuid;
  v_resp_org    uuid;
  v_acc_org     uuid;
  v_creator_org uuid;
  v_team_org    uuid;
  v_team_bu     uuid;
  v_actor_id    uuid;
  v_actor_name  text;
  v_route       text;
begin
  -- (A) ARCHIVE GATE (ADR-0004 D2, narrowed #742 AC-057). Supervisor or a manager above the PIC —
  -- a manager of the Supervisor alone no longer qualifies (same narrowing as can_edit_task).
  -- Covers archive and unarchive symmetrically, and reads OLD so a caller cannot re-point
  -- PIC/Supervisor in the same statement to grant themselves the right they lack.
  if tg_op = 'UPDATE' and new.archived_at is distinct from old.archived_at then
    if not (
      old.accountable_person_id = shared.current_person_id()
      or shared.is_manager_of(old.responsible_person_id)
    ) then
      raise exception 'archive requires Supervisor or a manager above the PIC' using errcode = '42501';
    end if;
  end if;

  -- (B) CASCADE + OCCURRENCE REFERENCES ARE SAME-ORG (NFR-201). Existence-only FKs.
  if new.objective_id is not null and not exists (
    select 1 from mos.objectives where id = new.objective_id and org_id = new.org_id) then
    raise exception 'objective_id belongs to a different org' using errcode = '42501';
  end if;
  if new.work_line_id is not null and not exists (
    select 1 from mos.work_lines where id = new.work_line_id and org_id = new.org_id) then
    raise exception 'work_line_id belongs to a different org' using errcode = '42501';
  end if;
  if new.process_run_id is not null and not exists (
    select 1 from mos.process_runs where id = new.process_run_id and org_id = new.org_id) then
    raise exception 'process_run_id belongs to a different org' using errcode = '42501';
  end if;

  -- (C) OCCURRENCE PROVENANCE IS RPC-ONLY (SECURITY LOW-1).
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      if new.process_run_id is not null or new.generated_from_task_def_id is not null then
        raise exception 'process_run_id / generated_from_task_def_id are set only by the process spawn/resolve RPCs, not a direct write'
          using errcode = '42501';
      end if;
    elsif tg_op = 'UPDATE' then
      if new.process_run_id is distinct from old.process_run_id
         or new.generated_from_task_def_id is distinct from old.generated_from_task_def_id then
        raise exception 'process_run_id / generated_from_task_def_id are immutable on a direct write'
          using errcode = '42501';
      end if;
    end if;
  end if;

  -- (D) IMMUTABILITY (round-2 audit A1).
  if tg_op = 'UPDATE' then
    if new.created_by is distinct from old.created_by then
      raise exception 'created_by is immutable on a task' using errcode = '42501';
    end if;
    if new.org_id is distinct from old.org_id then
      raise exception 'org_id is immutable on a task' using errcode = '42501';
    end if;
  end if;

  -- (D) DIRECTORY REFERENCES ARE SAME-ORG (round-2 audit A1).
  select bu.org_id into v_bu_org from shared.business_units bu where bu.id = new.business_unit_id;
  if v_bu_org is distinct from new.org_id then
    raise exception 'business_unit_id must belong to the same org as the task' using errcode = '23514';
  end if;

  select p.org_id into v_resp_org from shared.people p where p.id = new.responsible_person_id;
  if v_resp_org is distinct from new.org_id then
    raise exception 'responsible_person_id must belong to the same org as the task' using errcode = '23514';
  end if;

  select p.org_id into v_acc_org from shared.people p where p.id = new.accountable_person_id;
  if v_acc_org is distinct from new.org_id then
    raise exception 'accountable_person_id must belong to the same org as the task' using errcode = '23514';
  end if;

  select p.org_id into v_creator_org from shared.people p where p.id = new.created_by;
  if v_creator_org is distinct from new.org_id then
    raise exception 'created_by must belong to the same org as the task' using errcode = '23514';
  end if;

  if exists (
    select 1 from unnest(new.consulted_person_ids) pid
    where not exists (select 1 from shared.people p where p.id = pid and p.org_id = new.org_id)
  ) then
    raise exception 'every consulted_person_id must belong to the same org as the task' using errcode = '23514';
  end if;

  if exists (
    select 1 from unnest(new.informed_person_ids) pid
    where not exists (select 1 from shared.people p where p.id = pid and p.org_id = new.org_id)
  ) then
    raise exception 'every informed_person_id must belong to the same org as the task' using errcode = '23514';
  end if;

  if new.team_id is not null then
    select tm.org_id, tm.business_unit_id into v_team_org, v_team_bu
      from shared.teams tm where tm.id = new.team_id;
    if v_team_org is distinct from new.org_id then
      raise exception 'team_id must belong to the same org as the task' using errcode = '23514';
    end if;
    if v_team_bu is distinct from new.business_unit_id then
      raise exception 'business_unit_id must equal the team''s business_unit_id' using errcode = '23514';
    end if;
  end if;

  -- (E) WHO MAY BE PIC (#742 AC-053/054/055).
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      if new.responsible_person_id <> shared.current_person_id()
         and not shared.is_manager_of(new.responsible_person_id) then
        raise exception 'PIC must be the writer or a person in the writer''s downline' using errcode = '42501';
      end if;
    elsif tg_op = 'UPDATE' and new.responsible_person_id is distinct from old.responsible_person_id then
      if new.responsible_person_id <> shared.current_person_id()
         and not shared.is_manager_of(new.responsible_person_id) then
        raise exception 'PIC must be the writer or a person in the writer''s downline' using errcode = '42501';
      end if;
    end if;
  end if;

  -- (F) CREATED BY IS THE CALLER ON A DIRECT INSERT (#742 delta).
  if current_user = 'authenticated' and tg_op = 'INSERT' then
    if new.created_by is distinct from shared.current_person_id() then
      raise exception 'created_by must be the caller on a direct insert' using errcode = '42501';
    end if;
  end if;

  -- (G) DELIVER task_named (#771 AC-010). Every naming that lands a new person on this Task's PIC
  -- or Supervisor row delivers one row into their Inbox. The actor never notifies themself, so a
  -- self-assignment stays silent; a re-save that keeps the same person is dedup'd by the shared
  -- (owner, source, entity) index above, so idempotent writes are silent too. The role tag on the
  -- metadata is only there to steer the UI copy — dedupe is by (owner, task).
  --
  -- Scoped to current_user='authenticated' for the same reason (C)/(E)/(F) are: the
  -- SECURITY DEFINER spawn/resolve RPCs stamp assignments the session did not choose (a factory,
  -- not a person naming another), and the seed/service paths mint the same rows on empty
  -- fixtures. Neither path should light up an Inbox.
  if current_user = 'authenticated' then
    v_actor_id := shared.current_person_id();
    if v_actor_id is not null then
      select full_name into v_actor_name from shared.people where id = v_actor_id;
      v_route := '/work/tasks/' || new.id::text;

      -- PIC arm: INSERT sets it from nothing; UPDATE fires only when the value changes.
      if (tg_op = 'INSERT' and new.responsible_person_id is distinct from v_actor_id)
         or (tg_op = 'UPDATE' and new.responsible_person_id is distinct from old.responsible_person_id
             and new.responsible_person_id is distinct from v_actor_id) then
        if not exists (
          select 1 from mos.notifications n
          where n.owner_id = new.responsible_person_id
            and n.metadata->>'source' = 'task_named'
            and n.metadata#>>'{entity,id}' = new.id::text
        ) then
          begin
            perform mos.create_notification(
              new.responsible_person_id,
              'info',
              coalesce(v_actor_name, 'A teammate') || ' named you PIC on a Task',
              left(new.title, 200),
              jsonb_build_object(
                'source', 'task_named',
                'role', 'PIC',
                'actor', jsonb_build_object('id', v_actor_id, 'name', coalesce(v_actor_name, 'A teammate')),
                'entity', jsonb_build_object('type', 'task', 'id', new.id, 'route', v_route)
              )
            );
          -- Best-effort delivery: a concurrent double-write races on the dedupe index, and a
          -- recipient may have been archived since the write started (mos.create_notification
          -- refuses 42501). The gating write is real; the Inbox row is a pointer.
          exception when unique_violation or insufficient_privilege then null;
          end;
        end if;
      end if;

      -- Supervisor arm: same shape, using accountable_person_id.
      if (tg_op = 'INSERT' and new.accountable_person_id is distinct from v_actor_id
          and new.accountable_person_id is distinct from new.responsible_person_id)
         or (tg_op = 'UPDATE' and new.accountable_person_id is distinct from old.accountable_person_id
             and new.accountable_person_id is distinct from v_actor_id
             and new.accountable_person_id is distinct from new.responsible_person_id) then
        if not exists (
          select 1 from mos.notifications n
          where n.owner_id = new.accountable_person_id
            and n.metadata->>'source' = 'task_named'
            and n.metadata#>>'{entity,id}' = new.id::text
        ) then
          begin
            perform mos.create_notification(
              new.accountable_person_id,
              'info',
              coalesce(v_actor_name, 'A teammate') || ' named you Supervisor on a Task',
              left(new.title, 200),
              jsonb_build_object(
                'source', 'task_named',
                'role', 'Supervisor',
                'actor', jsonb_build_object('id', v_actor_id, 'name', coalesce(v_actor_name, 'A teammate')),
                'entity', jsonb_build_object('type', 'task', 'id', new.id, 'route', v_route)
              )
            );
          -- Best-effort delivery: a concurrent double-write races on the dedupe index, and a
          -- recipient may have been archived since the write started (mos.create_notification
          -- refuses 42501). The gating write is real; the Inbox row is a pointer.
          exception when unique_violation or insufficient_privilege then null;
          end;
        end if;
      end if;
    end if;
  end if;

  return new;
end;
$$;
comment on function mos._guard_tasks() is
  'The ONE guard on mos.tasks (#742 body + #771 task_named delivery). Archive requires Supervisor '
  'or a manager above the PIC (42501); objective/work_line/process_run must be same-org (42501); '
  'process_run_id and generated_from_task_def_id are RPC-only (42501); created_by/org_id immutable '
  'on UPDATE and created_by equal to the caller on INSERT (42501); on INSERT and on any UPDATE '
  'that changes the PIC, the new PIC must be the writer or a person in the writer''s downline '
  '(42501); BU, R, A, created_by, the consulted/informed arrays and a supplied team_id must be '
  'same-org, and team BU must equal task BU (23514). At the end, a naming that lands a new person '
  'on PIC or Supervisor delivers one task_named row through mos.create_notification — actor never '
  'notifies themself, and (owner, source, entity) dedupe makes re-saves silent. SECURITY INVOKER.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 3. mos.comments — deliver task_comment on INSERT (task entity only)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- One delivery per (owner, task) — a busy conversation is one Inbox row per recipient that keeps
-- pointing at the same Task, not a new row per reply. That is what the dedupe index enforces; the
-- explicit not-exists check keeps the ordinary case a no-op instead of relying on a caught
-- unique_violation. The polymorphic comments table already carries weekly_update / daily_log /
-- follow_up / signal entity types; only 'task' delivers here because only 'task' has a
-- PIC/Supervisor pair for #771 to name.
create or replace function mos._deliver_task_comment()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_task        mos.tasks%rowtype;
  v_actor_name  text;
  v_actor_id    uuid;
  v_route       text;
  v_meta        jsonb;
begin
  if new.entity_type <> 'task' then return new; end if;
  -- Scoped to current_user='authenticated' for the same reason mos._guard_tasks does: the seed
  -- and admin/service paths mint comments on fresh fixtures where mos.create_notification cannot
  -- resolve current_org_id() (no JWT), and no Inbox should light up on them either.
  if current_user <> 'authenticated' then return new; end if;

  select * into v_task from mos.tasks where id = new.entity_id;
  if v_task.id is null then return new; end if;

  v_actor_id := new.author_id;
  select full_name into v_actor_name from shared.people where id = v_actor_id;
  v_route := '/work/tasks/' || v_task.id::text;
  v_meta := jsonb_build_object(
    'source', 'task_comment',
    'actor', jsonb_build_object('id', v_actor_id, 'name', coalesce(v_actor_name, 'A teammate')),
    'entity', jsonb_build_object('type', 'task', 'id', v_task.id, 'route', v_route)
  );

  -- PIC: only if the PIC is not the commenter and no earlier task_comment row exists for them
  -- against this Task.
  if v_task.responsible_person_id is distinct from v_actor_id
     and not exists (
       select 1 from mos.notifications n
       where n.owner_id = v_task.responsible_person_id
         and n.metadata->>'source' = 'task_comment'
         and n.metadata#>>'{entity,id}' = v_task.id::text
     ) then
    begin
      perform mos.create_notification(
        v_task.responsible_person_id, 'info',
        coalesce(v_actor_name, 'A teammate') || ' commented on your Task',
        left(new.body, 200), v_meta);
    -- A concurrent double-comment races on the dedupe index; a recipient may have been archived
    -- since the task was created and mos.create_notification refuses 42501. Either way, the
    -- comment itself is real and should still commit — the Inbox row is best-effort, not gating.
    exception when unique_violation or insufficient_privilege then null;
    end;
  end if;

  -- Supervisor: same, and only if the Supervisor is not the PIC (a duplicate person collapses to
  -- one row, matching the ownership shape where PIC=Supervisor is common).
  if v_task.accountable_person_id is distinct from v_actor_id
     and v_task.accountable_person_id is distinct from v_task.responsible_person_id
     and not exists (
       select 1 from mos.notifications n
       where n.owner_id = v_task.accountable_person_id
         and n.metadata->>'source' = 'task_comment'
         and n.metadata#>>'{entity,id}' = v_task.id::text
     ) then
    begin
      perform mos.create_notification(
        v_task.accountable_person_id, 'info',
        coalesce(v_actor_name, 'A teammate') || ' commented on your Task',
        left(new.body, 200), v_meta);
    exception when unique_violation then null;
    end;
  end if;

  return new;
end;
$$;
comment on function mos._deliver_task_comment() is
  'AFTER INSERT on mos.comments where entity_type=task: deliver one task_comment row per '
  'PIC/Supervisor recipient through mos.create_notification. Actor never notifies themself; '
  '(owner, source, entity) dedupe folds repeated comments into one queued row per recipient. '
  'SECURITY INVOKER — the definer cross-owner path lives in mos.create_notification.';
revoke execute on function mos._deliver_task_comment() from public, anon, authenticated;

create trigger comments_deliver
  after insert on mos.comments
  for each row execute function mos._deliver_task_comment();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 4. mos._guard_signals — deliver signal_urgent on a raise-to-Urgent UPDATE
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The guard is already SECURITY DEFINER (it appends to signal_revisions, which has no INSERT
-- grant, and it delivers the retraction row from #767). Adding the raise-to-Urgent path here
-- keeps every direct UPDATE covered by one rule.
--
-- The INSERT path (a fresh Urgent post) is NOT handled here — mentions have not been inserted
-- yet at BEFORE INSERT time, so the guard cannot skip a lead who is also a mention target. That
-- delivery rides mos.fan_out_signal_mention, which fires after mentions are inserted and folds
-- the mention/urgent choice into one place. See the fan_out body below.
create or replace function mos._guard_signals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team_org      uuid;
  v_author_org    uuid;
  v_actor_id      uuid;
  v_actor_name    text;
  v_route         text;
  v_lead          record;
begin
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
  if tg_op = 'INSERT' then return new; end if;

  if new.id is distinct from old.id
     or new.author_id is distinct from old.author_id
     or new.owning_team_id is distinct from old.owning_team_id
     or new.source is distinct from old.source
     or new.source_ref is distinct from old.source_ref
     or new.org_id is distinct from old.org_id
     or new.created_at is distinct from old.created_at
     or new.updated_at is distinct from old.updated_at then
    raise exception 'signal id/author/owning_team/source/source_ref/org/created_at/updated_at are immutable' using errcode = '42501';
  end if;
  if new.edited_at is distinct from old.edited_at
     and new.body is not distinct from old.body
     and new.occurred_at is not distinct from old.occurred_at
     and new.category is not distinct from old.category
     and new.attention is not distinct from old.attention then
    raise exception 'signal edited_at is server-owned' using errcode = '42501';
  end if;
  if new.retract_reason is distinct from old.retract_reason
     and new.retracted_at is not distinct from old.retracted_at
     and old.author_id is distinct from shared.current_person_id() then
    raise exception 'retract_reason is author-only unless the signal is being retracted' using errcode = '42501';
  end if;
  if (new.body is distinct from old.body
      or new.occurred_at is distinct from old.occurred_at
      or new.category is distinct from old.category
      or new.attention is distinct from old.attention)
     and old.author_id is distinct from shared.current_person_id() then
    raise exception 'signal content is author-only; signal.retract may only retract' using errcode = '42501';
  end if;
  if new.retracted_at is distinct from old.retracted_at then
    if not (old.author_id = shared.current_person_id()
            or shared.can('signal.retract')
            or mos.is_team_lead(old.owning_team_id)) then
      raise exception 'retract requires author, Team lead, or signal.retract' using errcode = '42501';
    end if;
    if new.retracted_at is not null and btrim(coalesce(new.retract_reason, '')) = '' then
      raise exception 'retraction requires a reason' using errcode = '23514';
    end if;
    if new.retracted_at is not null and old.retracted_at is null then
      select full_name into v_actor_name
      from shared.people where id = shared.current_person_id();
      insert into mos.notifications (org_id, owner_id, severity, title, body, metadata)
      values (
        old.org_id, old.author_id, 'warning',
        coalesce(v_actor_name, 'A lead') || ' retracted your Signal',
        new.retract_reason,
        jsonb_build_object(
          'source', 'signal_retracted',
          'actor', jsonb_build_object('id', shared.current_person_id(), 'name', coalesce(v_actor_name, 'A lead')),
          'attention', new.attention,
          'entity', jsonb_build_object('type', 'signal', 'id', old.id, 'route', '/work/signals?record=' || old.id)
        )
      ) on conflict (owner_id, (metadata->>'source'), (metadata#>>'{entity,id}'))
        where metadata->>'source' = 'signal_retracted' do nothing;
    end if;
  end if;
  if new.body is distinct from old.body then
    insert into mos.signal_revisions(org_id, signal_id, actor_id, field, old_value, new_value)
      values (old.org_id, old.id, shared.current_person_id(), 'body', old.body, new.body);
    new.edited_at := now();
  end if;
  if new.occurred_at is distinct from old.occurred_at then
    insert into mos.signal_revisions(org_id, signal_id, actor_id, field, old_value, new_value)
      values (old.org_id, old.id, shared.current_person_id(), 'occurred_at', old.occurred_at::text, new.occurred_at::text);
    new.edited_at := now();
  end if;
  if new.category is distinct from old.category then
    insert into mos.signal_revisions(org_id, signal_id, actor_id, field, old_value, new_value)
      values (old.org_id, old.id, shared.current_person_id(), 'category', old.category, new.category);
    new.edited_at := now();
  end if;
  if new.attention is distinct from old.attention then
    insert into mos.signal_revisions(org_id, signal_id, actor_id, field, old_value, new_value)
      values (old.org_id, old.id, shared.current_person_id(), 'attention', old.attention::text, new.attention::text);
    new.edited_at := now();
  end if;

  -- signal_urgent delivery on a raise-to-Urgent UPDATE (#771 AC-012). Skip the author and skip a
  -- lead who already has a signal_mention or signal_urgent row for this Signal — the mention row
  -- came from the author's post, the urgent row from the previous raise, and dedupe folds either
  -- into one row per (owner, Signal) at the index level. Retraction on the same statement leaves
  -- retracted_at set on NEW; we short-circuit that so a raise-then-retract does not queue a
  -- misleading row.
  v_actor_id := shared.current_person_id();
  if new.attention = 'Urgent'
     and old.attention is distinct from 'Urgent'
     and new.retracted_at is null
     -- Skip on any path with no acting person (seed/service — current_org_id() is NULL there and
     -- mos.create_notification would raise). No Inbox should light up without a real actor.
     and v_actor_id is not null
     and shared.current_org_id() is not null then
    select full_name into v_actor_name from shared.people where id = v_actor_id;
    v_route := '/work/signals?record=' || new.id::text;

    for v_lead in
      select p.id as person_id
      from shared.people p
      where p.org_id = new.org_id
        and p.archived_at is null
        and p.id is distinct from coalesce(new.author_id, '00000000-0000-0000-0000-000000000000'::uuid)
        and p.id is distinct from coalesce(v_actor_id, '00000000-0000-0000-0000-000000000000'::uuid)
        and (
          exists (
            select 1 from shared.person_access_roles par
            where par.person_id = p.id and par.org_id = new.org_id
              and par.access_role = 'admin' and par.revoked_at is null
          )
          or (
            exists (
              select 1 from shared.person_access_roles par
              where par.person_id = p.id and par.org_id = new.org_id
                and par.access_role in ('ops_lead','supervisor','manager') and par.revoked_at is null
            )
            and exists (
              select 1 from shared.team_memberships home
              join shared.teams home_t on home_t.id = home.team_id
              where home.person_id = p.id and home.org_id = new.org_id
                and home_t.org_id = new.org_id
                and home.effective_from <= current_date
                and (home.effective_to is null or home.effective_to >= current_date)
                and home_t.business_unit_id = (
                  select business_unit_id from shared.teams where id = new.owning_team_id
                )
            )
          )
          or exists (
            select 1 from shared.person_roles pr
            join shared.roles r on r.id = pr.role_id
            where pr.person_id = p.id and pr.org_id = new.org_id
              and r.business_unit_id = (
                select business_unit_id from shared.teams where id = new.owning_team_id
              )
              and r.reports_to_role_id is null
          )
        )
    loop
      if not exists (
        select 1 from mos.notifications n
        where n.owner_id = v_lead.person_id
          and n.metadata->>'source' in ('signal_mention','signal_urgent')
          and n.metadata#>>'{entity,id}' = new.id::text
      ) then
        begin
          perform mos.create_notification(
            v_lead.person_id, 'warning',
            'Urgent Signal in ' || coalesce((select name from shared.teams where id = new.owning_team_id), 'a Team you lead'),
            left(new.body, 200),
            jsonb_build_object(
              'source', 'signal_urgent',
              'actor', jsonb_build_object('id', v_actor_id, 'name', coalesce(v_actor_name, 'A teammate')),
              'attention', new.attention,
              'entity', jsonb_build_object('type', 'signal', 'id', new.id, 'route', v_route)
            )
          );
        exception when unique_violation then null;
        end;
      end if;
    end loop;
  end if;

  return new;
end;
$$;
comment on function mos._guard_signals() is
  'The ONE guard on mos.signals (#767 body + #771 signal_urgent on a raise-to-Urgent UPDATE). '
  'Same-org tenancy for owning_team_id and author_id on INSERT/UPDATE (42501). On UPDATE: '
  'immutability of id/author/team/source/source_ref/org/created_at/updated_at; edited_at is '
  'server-owned; content is author-only; retraction requires author, Team lead, or signal.retract '
  'plus a non-blank reason; a fresh retraction delivers one signal_retracted row to the author '
  '(actor named, attention captured). A raise-to-Urgent UPDATE (old.attention <> Urgent, '
  'new.attention = Urgent, not retracted in the same write) delivers one signal_urgent row to '
  'every Team lead in the owning-Team business unit, skipping the author and skipping anyone '
  'who already holds a signal_mention or signal_urgent row for this Signal. SECURITY DEFINER; '
  'the (owner, source, entity) dedupe index catches concurrent races. INSERT-time signal_urgent '
  'delivery lives in mos.fan_out_signal_mention (mentions are not in the DB at BEFORE INSERT '
  'time on the RPC path, so the mention/urgent skip cannot be evaluated here).';
revoke execute on function mos._guard_signals() from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 5. mos.fan_out_signal_mention — carry actor/attention, deliver signal_urgent on the INSERT path
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Two additions, one shape:
--   (a) every signal_mention row carries actor {id, name} + attention on its metadata (AC-013);
--   (b) after the mention loop, if attention='Urgent' the same function delivers signal_urgent to
--       every Team lead in the owning-Team business unit, skipping the author AND skipping every
--       person who was just delivered a signal_mention for this Signal — the "mentioned lead is
--       not notified twice" rule from AC-012. Placing the urgent delivery here (rather than in
--       the signals guard) is what makes the skip evaluable: by this point, both the mention
--       rows and the notifications for them exist in the same transaction.
create or replace function mos.fan_out_signal_mention(p_signal_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sig            mos.signals;
  v_author_name    text;
  v_person         uuid;
  v_lead           record;
  v_count          int := 0;
  v_recipients     uuid[];
  v_metadata       jsonb;
begin
  select * into v_sig from mos.signals where id = p_signal_id;
  if v_sig.id is null then
    raise exception 'signal not found' using errcode = 'P0002';
  end if;
  if v_sig.org_id is distinct from shared.current_org_id() then
    raise exception 'cannot fan out a signal outside your org' using errcode = '42501';
  end if;
  if v_sig.author_id is distinct from shared.current_person_id() then
    raise exception 'only the author may fan out' using errcode = '42501';
  end if;

  select full_name into v_author_name from shared.people where id = v_sig.author_id;

  select array_agg(distinct pid) into v_recipients from (
    select sm.target_person_id as pid from mos.signal_mentions sm
      where sm.signal_id = p_signal_id and sm.revoked_at is null and sm.mention_kind = 'person'
    union
    select m.person_id from mos.signal_mentions sm
      join shared.team_memberships m on m.team_id = sm.target_team_id
      where sm.signal_id = p_signal_id and sm.revoked_at is null and sm.mention_kind = 'team'
        and m.effective_from <= current_date and (m.effective_to is null or m.effective_to >= current_date)
    union
    select m2.person_id from mos.signal_mentions sm
      join shared.teams tt on tt.business_unit_id = sm.target_bu_id
      join shared.team_memberships m2 on m2.team_id = tt.id
      where sm.signal_id = p_signal_id and sm.revoked_at is null and sm.mention_kind = 'bu'
        and shared.can('signal.mention_bu')
        and m2.effective_from <= current_date and (m2.effective_to is null or m2.effective_to >= current_date)
    union
    select pr.person_id from mos.signal_mentions sm
      join shared.roles r on r.business_unit_id = sm.target_bu_id
      join shared.person_roles pr on pr.role_id = r.id
      where sm.signal_id = p_signal_id and sm.revoked_at is null and sm.mention_kind = 'bu'
        and shared.can('signal.mention_bu')
  ) dedup
  where pid is not null and pid <> v_sig.author_id
    and not exists (
      select 1 from mos.notifications n
      where n.owner_id = dedup.pid
        and n.metadata ->> 'source' = 'signal_mention'
        and n.metadata #>> '{entity,id}' = p_signal_id::text);

  v_metadata := jsonb_build_object(
    'source', 'signal_mention',
    'actor', jsonb_build_object('id', v_sig.author_id, 'name', coalesce(v_author_name, 'A teammate')),
    'attention', v_sig.attention,
    'entity', jsonb_build_object('type', 'signal', 'id', v_sig.id, 'route', '/work/signals?record=' || v_sig.id)
  );

  if v_recipients is not null then
    if array_length(v_recipients, 1) > 50 then
      raise exception 'fan-out exceeds cap of 50 recipients (%). Confirm before broadcasting.', array_length(v_recipients,1)
        using errcode = 'P0003';
    end if;
    foreach v_person in array v_recipients loop
      perform mos.create_notification(v_person, 'info', 'You were mentioned in a Signal',
        left(v_sig.body, 200), v_metadata);
      v_count := v_count + 1;
    end loop;
  end if;

  -- signal_urgent delivery on the INSERT path (#771 AC-012). Only when attention='Urgent' and the
  -- signal is live; the mention loop above has already committed inside this transaction so the
  -- "already notified by mention" skip below is evaluable. Actor never notifies themself.
  if v_sig.attention = 'Urgent' and v_sig.retracted_at is null then
    for v_lead in
      select p.id as person_id
      from shared.people p
      where p.org_id = v_sig.org_id
        and p.archived_at is null
        and p.id is distinct from v_sig.author_id
        and (
          exists (
            select 1 from shared.person_access_roles par
            where par.person_id = p.id and par.org_id = v_sig.org_id
              and par.access_role = 'admin' and par.revoked_at is null
          )
          or (
            exists (
              select 1 from shared.person_access_roles par
              where par.person_id = p.id and par.org_id = v_sig.org_id
                and par.access_role in ('ops_lead','supervisor','manager') and par.revoked_at is null
            )
            and exists (
              select 1 from shared.team_memberships home
              join shared.teams home_t on home_t.id = home.team_id
              where home.person_id = p.id and home.org_id = v_sig.org_id
                and home_t.org_id = v_sig.org_id
                and home.effective_from <= current_date
                and (home.effective_to is null or home.effective_to >= current_date)
                and home_t.business_unit_id = (
                  select business_unit_id from shared.teams where id = v_sig.owning_team_id
                )
            )
          )
          or exists (
            select 1 from shared.person_roles pr
            join shared.roles r on r.id = pr.role_id
            where pr.person_id = p.id and pr.org_id = v_sig.org_id
              and r.business_unit_id = (
                select business_unit_id from shared.teams where id = v_sig.owning_team_id
              )
              and r.reports_to_role_id is null
          )
        )
    loop
      if not exists (
        select 1 from mos.notifications n
        where n.owner_id = v_lead.person_id
          and n.metadata->>'source' in ('signal_mention','signal_urgent')
          and n.metadata#>>'{entity,id}' = v_sig.id::text
      ) then
        begin
          perform mos.create_notification(
            v_lead.person_id, 'warning',
            'Urgent Signal in ' || coalesce((select name from shared.teams where id = v_sig.owning_team_id), 'a Team you lead'),
            left(v_sig.body, 200),
            jsonb_build_object(
              'source', 'signal_urgent',
              'actor', jsonb_build_object('id', v_sig.author_id, 'name', coalesce(v_author_name, 'A teammate')),
              'attention', v_sig.attention,
              'entity', jsonb_build_object('type', 'signal', 'id', v_sig.id, 'route', '/work/signals?record=' || v_sig.id)
            )
          );
        exception when unique_violation then null;
        end;
      end if;
    end loop;
  end if;

  return v_count;
end;
$$;
comment on function mos.fan_out_signal_mention(uuid) is
  'Synchronous @mention fan-out + #771 signal_urgent INSERT-path delivery. Author-only, org-walled, '
  'deduplicated, capped at 50, and idempotent — a recipient already notified for this Signal is '
  'skipped. Every signal_mention row carries actor {id, name} + attention on its metadata. When '
  'the Signal is Urgent, every Team lead in the owning-Team business unit is also delivered a '
  'signal_urgent row, skipping the author and skipping anyone just mentioned. SECURITY DEFINER.';
revoke execute on function mos.fan_out_signal_mention(uuid) from public, anon, authenticated;
grant  execute on function mos.fan_out_signal_mention(uuid) to authenticated;
