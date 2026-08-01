-- #131 / GHSA-85fp-gf27-wg2c — close the gate that ...0003 left open.
--
-- ...0003 shipped shared.clear_must_change_password(): EXECUTE to `authenticated`, no argument, no
-- access role, and no check that anything had actually happened. The "set the password FIRST, then
-- clear the flag" ordering existed only in the SPA. So the threat actor the flag exists to stop —
-- the provisioner, who by definition holds the password — could sign in, POST that RPC straight
-- from devtools, and carry on using the admin-known password on an account that was now
-- permanently unflagged. ADR-0050/0051 financial visibility sits behind those accounts.
--
-- The fix is not to verify the password changed. It is to make the password change the ONLY thing
-- that clears the flag, so there is no separate act left to forge:
--
--   * a trigger on auth.users fires only when encrypted_password actually differs, and
--   * shared.clear_must_change_password() is dropped.
--
-- GoTrue stays the password authority (#130 installs its policy) — nothing here writes
-- encrypted_password, it only reacts to GoTrue having written it.
--
-- Rollback:
--   drop trigger clear_must_change_password_on_pw_change on auth.users;
--   drop function shared._clear_must_change_password_on_pw_change();
--   (and restore shared.clear_must_change_password() + the previous _guard_people message
--    from 20260731000003 — but note that restores the bypass.)

-- ── 1. The password change clears the flag ───────────────────────────────────────────────────
create or replace function shared._clear_must_change_password_on_pw_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Narrow by `and must_change_password` so an ordinary password change by an unflagged user is a
  -- no-op rather than a pointless write on shared.people (which would also bump updated_at and
  -- fire _guard_people for nothing).
  update shared.people
     set must_change_password = false, updated_at = now()
   where user_id = new.id
     and must_change_password;
  return new;
end;
$$;
comment on function shared._clear_must_change_password_on_pw_change() is
  '#131: lowers shared.people.must_change_password when GoTrue writes a new encrypted_password. '
  'SECURITY DEFINER so it can pass shared._guard_people(), which refuses to clear the flag from an '
  '`authenticated` session. This is the ONLY thing that clears the flag.';

-- WHEN (old.encrypted_password is distinct from new.encrypted_password) is the whole point: a plain
-- AFTER UPDATE would clear the flag on any incidental auth write — a sign-in stamp is enough — and
-- the gate would be exactly as forgeable as the RPC it replaces. Asserted by AC-131c2.
--
-- KNOWN RESIDUAL, do not read this trigger as "the flag can no longer be wrong". "The hash changed"
-- is weaker than "the password is now one the admin never saw", and the gap is reachable: an admin
-- holding the provisioned password can sign in as the holder BEFORE their first login and cycle it
-- A -> B -> A. GoTrue rejects only same-as-current (422 same_password), not a cycle, so the flag
-- ends up false with the admin-known password live. The holder is never prompted and never rotates.
--
-- This trigger cannot detect it: bcrypt salts per write, so the A-again hash differs from the
-- original, and the DB never sees plaintext. Closing it needs password history where the plaintext
-- is — GoTrue, i.e. #130's territory — not here. Tracked in the advisory.
--
-- (An earlier draft of this comment worried instead about GoTrue rehashing on login. That is not
-- the real gap, and it does not happen today.)
drop trigger if exists clear_must_change_password_on_pw_change on auth.users;
create trigger clear_must_change_password_on_pw_change
after update of encrypted_password on auth.users
for each row
when (old.encrypted_password is distinct from new.encrypted_password)
execute function shared._clear_must_change_password_on_pw_change();

-- ── 2. Drop the bypass ───────────────────────────────────────────────────────────────────────
-- Nothing replaces it. The SPA no longer calls anything after supabase.auth.updateUser() — the
-- trigger has already run inside GoTrue's own write by the time updateUser returns.
drop function if exists shared.clear_must_change_password();

-- ── 3. Guard: retarget the message now that the RPC is gone ──────────────────────────────────
-- Body copied from the LATEST definition (20260731000003), per the scar in the plan: rebuilding a
-- function from the first definition grep finds silently reverts every fix added in between. The
-- ONLY change here is the must_change_password message.
create or replace function shared._guard_people()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.org_id is distinct from old.org_id then
      raise exception 'org_id is immutable on a person' using errcode = '42501';
    end if;
    if current_user = 'authenticated' and new.user_id is distinct from old.user_id then
      raise exception 'user_id is set only by the provisioning RPCs, not a direct write' using errcode = '42501';
    end if;
    -- #131: clearing must_change_password is the password change's job. Raising it is not.
    if current_user = 'authenticated'
       and old.must_change_password and not new.must_change_password then
      raise exception 'must_change_password is cleared only by an actual password change'
        using errcode = '42501';
    end if;
    -- No-lockout (FR-041 / H-1): archiving the LAST active admin's people row is refused. The auth hook
    -- resolves a person `where archived_at is null`, so archiving the sole admin drops admin out of
    -- claim-minting -> permanent org lockout, no in-app recovery. Mirrors the last-admin block in
    -- shared._guard_person_access_roles (revoke arm) and admin_set_login_enabled (disable arm).
    if new.archived_at is not null and old.archived_at is null
       and exists (
         select 1 from shared.person_access_roles
          where person_id = old.id and access_role = 'admin' and revoked_at is null
       )
       and shared._count_active_admins() <= 1 then
      raise exception 'cannot archive the last active admin' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'INSERT' and current_user = 'authenticated' and new.user_id is not null then
    raise exception 'user_id is set only by the provisioning RPCs, not a direct write' using errcode = '42501';
  end if;
  return new;
end;
$$;
comment on function shared._guard_people() is
  'Guard (ADR-0016): org_id immutable on UPDATE; user_id is RPC-only (never a direct app write); '
  'must_change_password is cleared only by an actual password change, via the auth.users trigger (#131); '
  'no-lockout — cannot archive the last active admin (42501, FR-041/H-1). SECURITY INVOKER.';

-- ── 4. Restate the column contract ───────────────────────────────────────────────────────────
comment on column shared.people.must_change_password is
  '#131: the current password was set by an admin and is known to them. The app shell blocks on a '
  'set-password screen until the holder replaces it. Cleared ONLY by the '
  'clear_must_change_password_on_pw_change trigger on auth.users, i.e. only by the password '
  'actually changing. Raising it from an app session is allowed — that is an admin forcing a rotation.';
