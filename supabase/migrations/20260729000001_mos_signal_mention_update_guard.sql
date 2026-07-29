-- SEC-M1 (security audit 2026-07-28): make good on the promise 20260716000003 already wrote down.
--
-- That migration grants `update` on mos.signal_mentions with the comment "update = set revoked_at only
-- (guard)", but no such guard was ever created — signal_mentions_update_author only checks authorship
-- (USING) and org (WITH CHECK). So a plain `member` (holds signal.create, NOT signal.mention_bu) could
-- post a Signal, insert a harmless @person mention, then PATCH that row into
-- {mention_kind:'bu', target_bu_id:<any BU>} — satisfying the policy and signal_mentions_one_target —
-- and mos.can_read_signal rule R4 would then hand the Signal to every role-holder in that BU. That is
-- exactly the broadcast reach signal.mention_bu exists to gate (the same PATCH also accepted a
-- cross-org target_team_id/target_bu_id). Revoking the UPDATE grant is not an option: revoking a
-- mention is a real, author-owned action (ADR-0050 D4/R4), so the column-level guard is the fix.
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
  'SEC-M1 guard: mos.signal_mentions rows are immutable except revoked_at. Blocks author-scoped UPDATE from escalating a @person/@team mention into an unauthorised @BU broadcast (mos.can_read_signal R4).';
revoke execute on function mos._signal_mention_guard_update() from public, anon, authenticated;

create trigger signal_mentions_guard_update before update on mos.signal_mentions
  for each row execute function mos._signal_mention_guard_update();

-- DOWN (manual):
--   drop trigger if exists signal_mentions_guard_update on mos.signal_mentions;
--   drop function if exists mos._signal_mention_guard_update();
