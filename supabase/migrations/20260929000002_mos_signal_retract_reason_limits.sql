-- Signal retraction reasons (#1016): a reason made only of invisible formatting characters counts as
-- blank, and the trimmed reason is capped at 500 characters.
--
-- mos._guard_signals keeps its full #1014 body (20260929000001). Only the reason normalisation
-- changes: the one character class used for the blank check, the length check and the stored value
-- also covers U+0085, U+180E, U+200C, U+200D, U+2060 and U+FEFF, and is written as regex escapes so
-- it stays readable; and a trimmed reason longer than 500 characters (a character count, not
-- bytes) raises 23514.
--
-- DOWN (manual, before production):
--   create or replace function mos._guard_signals() with its body from
--     20260929000001_mos_signal_retract_authority_and_work_line_code.sql (no length cap; the
--     narrower whitespace class).

create or replace function mos._guard_signals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team_org   uuid;
  v_author_org uuid;
  v_actor_name text;
  v_reason     text;
begin
  -- SAME-ORG REFERENCES, checked on INSERT as well as UPDATE (the trigger fires on both). The
  -- INSERT half pins owning_team_id (historical rows only) and author_id to the row's own org via
  -- existence-only FKs; the UPDATE half (further down) guards the immutable columns. Compared
  -- against new.org_id, the idiom the sibling guards use, so the rule states the row's own
  -- internal consistency and holds identically on the seed and service paths.
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
  -- and an effective retraction authority — it has to, so a holder can retract someone else's
  -- Signal — but without this that same holder could rewrite the body. A non-author may move only
  -- the retraction columns.
  if (new.body is distinct from old.body
      or new.occurred_at is distinct from old.occurred_at
      or new.category is distinct from old.category
      or new.attention is distinct from old.attention)
     and old.author_id is distinct from shared.current_person_id() then
    raise exception 'signal content is author-only; signal.retract may only retract' using errcode = '42501';
  end if;

  if new.retracted_at is distinct from old.retracted_at then
    if not mos.can_retract_signal(old.id) then
      raise exception 'retraction requires the effective signal.retract authority' using errcode = '42501';
    end if;
    -- One normalisation for the emptiness check, the length check and the stored value: strip ASCII
    -- whitespace (space, tab, newline, CR, form feed, vertical tab), Unicode space characters (NEL,
    -- NBSP, the U+2000 block incl. zero-width space, line/paragraph separators, narrow/medium
    -- spaces, ideographic space) and invisible formatting characters (Mongolian vowel separator,
    -- zero-width non-joiner/joiner, word joiner, BOM) from both ends. The character class is
    -- explicit, not locale-derived.
    v_reason := regexp_replace(
      coalesce(new.retract_reason, ''),
      '^[ \t\n\r\f\v\u0085\u00a0\u1680\u180e\u2000-\u200d\u2028\u2029\u202f\u205f\u2060\u3000\ufeff]+'
      '|[ \t\n\r\f\v\u0085\u00a0\u1680\u180e\u2000-\u200d\u2028\u2029\u202f\u205f\u2060\u3000\ufeff]+$',
      '', 'g');
    if new.retracted_at is not null and v_reason = '' then
      raise exception 'retraction requires a reason' using errcode = '23514';
    end if;
    if char_length(v_reason) > 500 then
      raise exception 'a retraction reason is at most 500 characters' using errcode = '23514';
    end if;
    new.retract_reason := v_reason;
    -- Notify the author when someone else retracts their Signal. A self-retraction is silent — the
    -- actor already knows. A missing/archived author (historical rows) has nobody to notify.
    if old.author_id is distinct from shared.current_person_id()
       and exists (
      select 1 from shared.people p
       where p.id = old.author_id
         and p.org_id = old.org_id
         and p.archived_at is null
    ) then
      select p.full_name
        into v_actor_name
        from shared.people p
       where p.id = shared.current_person_id()
         and p.org_id = old.org_id
         and p.archived_at is null;
      perform mos.create_notification(
        old.author_id,
        'warning',
        'Signal retracted',
        new.retract_reason,
        jsonb_build_object(
          'source', 'signal_retraction',
          'actor', jsonb_build_object(
            'id', shared.current_person_id(),
            'name', v_actor_name),
          'reason', new.retract_reason,
          'entity', jsonb_build_object(
            'type', 'signal',
            'id', old.id,
            'route', '/work/signals?record=' || old.id))
      );
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
  'author-only so a retraction authority holder may only retract; retraction authority is the '
  'configured mos.can_retract_signal scope, reason required and normalised (ASCII, Unicode '
  'space and invisible formatting characters trimmed) and capped at 500 characters, author '
  'notified on a non-self retraction; every content change appends a '
  'signal_revisions row. The retraction audit fields (restore, reason write timing, attribution) '
  'are owned by mos._guard_signal_retraction_attribution, which runs first. SECURITY DEFINER solely to write the '
  'revision/notification tables, which have no INSERT grant.';
revoke execute on function mos._guard_signals() from public, anon, authenticated;
