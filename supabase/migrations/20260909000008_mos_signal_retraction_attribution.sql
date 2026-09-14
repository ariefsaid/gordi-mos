-- Attribute new Signal tombstones without backfilling historical rows.
-- The existing signals_guard remains the authority/reason/notification guard; this trigger only
-- owns the server-stamped actor and transition time.

-- DOWN (manual, before production):
--   drop trigger signals_attribution_guard on mos.signals;
--   drop function mos._guard_signal_retraction_attribution();
--   alter table mos.signals drop column retracted_by_name, drop column retracted_by;

alter table mos.signals
  add column retracted_by uuid references shared.people(id),
  add column retracted_by_name text;
comment on column mos.signals.retracted_by is
  'Server-stamped actor for a new Signal tombstone. Historical tombstones may remain NULL; the '
  'first live retraction records the current same-org person and the trigger freezes it.';
comment on column mos.signals.retracted_by_name is
  'Server-stamped display-name snapshot for retracted_by. Historical tombstones may remain NULL; '
  'the snapshot remains truthful after the directory actor is archived.';
create index signals_retracted_by_idx on mos.signals (retracted_by);

create or replace function mos._guard_signal_retraction_attribution()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor_name text;
begin
  if tg_op = 'INSERT' then
    -- Existing/historical tombstones are allowed only with unknown actor provenance. A client may
    -- not manufacture a retracted_by value on either an active insert or a historical backfill.
    if new.retracted_by is not null or new.retracted_by_name is not null then
      raise exception 'retraction attribution is server-stamped and cannot be supplied on INSERT'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if old.retracted_at is null then
    if new.retracted_at is null then
      if new.retracted_by is not null or new.retracted_by_name is not null then
        raise exception 'retraction attribution can only be set by the first retraction'
          using errcode = '42501';
      end if;
      return new;
    end if;

    if new.retracted_by is not null or new.retracted_by_name is not null then
      raise exception 'retraction attribution must be server-stamped on the first retraction'
        using errcode = '42501';
    end if;
    new.retracted_at := now();
    new.retracted_by := shared.current_person_id();
    select p.full_name
      into v_actor_name
      from shared.people p
     where p.id = new.retracted_by
       and p.org_id = shared.current_org_id()
       and p.archived_at is null;
    if new.retracted_by is null or v_actor_name is null then
      raise exception 'retraction requires a live actor' using errcode = '42501';
    end if;
    new.retracted_by_name := v_actor_name;
    return new;
  end if;

  if new.retracted_at is distinct from old.retracted_at
     or new.retract_reason is distinct from old.retract_reason
     or new.body is distinct from old.body
     or new.occurred_at is distinct from old.occurred_at
     or new.category is distinct from old.category
     or new.attention is distinct from old.attention then
    raise exception 'a retracted Signal tombstone is immutable'
      using errcode = '42501';
  end if;

  if new.retracted_by is distinct from old.retracted_by
     or new.retracted_by_name is distinct from old.retracted_by_name then
    raise exception 'retraction attribution is immutable after the first retraction'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
comment on function mos._guard_signal_retraction_attribution() is
  'Server-stamps retracted_by, retracted_by_name, and retracted_at on the first live tombstone '
  'transition, rejects client attribution on active or historical INSERT, freezes all tombstone '
  'content and audit fields thereafter, and preserves NULL provenance on historical tombstones. It '
  'does not replace mos._guard_signals authority, reason, or notification checks.';
revoke execute on function mos._guard_signal_retraction_attribution() from public, anon, authenticated;

-- Trigger names order alphabetically for same-event BEFORE triggers. Run attribution before the
-- existing signals_guard so that its authority check and notification observe the server timestamp.
create trigger signals_attribution_guard
  before insert or update on mos.signals
  for each row execute function mos._guard_signal_retraction_attribution();
