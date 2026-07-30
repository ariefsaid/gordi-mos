-- SEC-M1 (security audit 2026-07-28): enforce the invariant 20260716000003 already documented.
--
-- 20260716000003 grants `update` on mos.signal_mentions with the comment "update = set revoked_at only
-- (guard)". The row-level policy signal_mentions_update_author scopes that grant to the mention's author
-- and to their org, but a row policy cannot constrain WHICH columns an UPDATE moves — so the documented
-- "revoked_at only" rule needs a column guard to actually hold. Without it, a mention's kind and target
-- would be editable after insert, which would let a row bypass the capability checks that gate a mention
-- at INSERT time (a @BU mention requires `signal.mention_bu`; mos.can_read_signal rule R4 then grants
-- read to every role-holder in the mentioned BU) and would also sidestep the org scoping on the target.
-- Revoking the UPDATE grant is not an option: revoking a mention is a real, author-owned action
-- (ADR-0050 D4/R4). Hence a column-level guard — everything except revoked_at is immutable, and
-- re-pointing a mention means revoking it and inserting a new one, which re-runs the INSERT-time checks.
--
-- SECURITY INVOKER (unlike mos._signal_guard_update, which is DEFINER *solely* to append
-- signal_revisions with no INSERT grant to authenticated): this guard reads only OLD/NEW and writes
-- nothing, so it needs no elevated rights — least privilege. search_path is pinned to '' and every
-- reference is schema-qualified, per the convention every other function in this repo follows.
create or replace function mos._signal_mention_guard_update()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.id               is distinct from old.id
     or new.org_id           is distinct from old.org_id
     or new.signal_id        is distinct from old.signal_id
     or new.mention_kind     is distinct from old.mention_kind
     or new.target_person_id is distinct from old.target_person_id
     or new.target_team_id   is distinct from old.target_team_id
     or new.target_bu_id     is distinct from old.target_bu_id
     or new.created_at       is distinct from old.created_at then
    raise exception 'signal_mentions: only revoked_at may be updated'
      using errcode = '42501',
            detail  = 'id/org/signal/mention_kind/target_*/created_at are immutable; re-target by revoking and inserting a new mention (a @BU mention still requires signal.mention_bu).';
  end if;
  return new;
end $$;
comment on function mos._signal_mention_guard_update() is
  'SEC-M1 guard: mos.signal_mentions rows are immutable except revoked_at, so the author-scoped UPDATE grant cannot change a mention''s kind or target and thereby bypass the capability + org checks applied at INSERT (see mos.can_read_signal R4). Re-target by revoking and inserting a new mention.';
revoke execute on function mos._signal_mention_guard_update() from public, anon, authenticated;

create trigger signal_mentions_guard_update before update on mos.signal_mentions
  for each row execute function mos._signal_mention_guard_update();

-- DOWN (manual):
--   drop trigger if exists signal_mentions_guard_update on mos.signal_mentions;
--   drop function if exists mos._signal_mention_guard_update();
