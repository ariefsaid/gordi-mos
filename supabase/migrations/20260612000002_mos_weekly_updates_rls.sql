-- P2-2 — mos.weekly_updates RLS (ADR-0005). Upward-only read; author-only write; line submit-lock.
-- THE security crux: this is the ONE non-org-readable mos entity. SELECT = author OR up-chain manager.

-- Read gate: current person is the author OR an up-chain manager of the author, org-scoped
-- (mirrors can_edit_task shape; reuses shared.is_manager_of — the recursive cycle-safe union, OD-P1-7).
create or replace function mos.can_read_weekly_update(p_person_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select shared.current_org_id() is not null
    and (
      p_person_id = shared.current_person_id()
      or shared.is_manager_of(p_person_id)
    )
$$;
comment on function mos.can_read_weekly_update(uuid) is 'Read gate: current person is the author OR an up-chain manager of the author (OD-P1-3/P1-7).';

-- Write gate for lines: parent update is the caller's OWN and in DRAFT, org-scoped (FR-011/015).
-- Fails closed: a submitted parent yields zero writable line rows (the line submit-lock).
create or replace function mos.can_write_own_update(p_weekly_update_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from mos.weekly_updates w
    where w.id = p_weekly_update_id
      and w.org_id = shared.current_org_id()
      and w.person_id = shared.current_person_id()
      and w.status = 'draft'
  )
$$;
comment on function mos.can_write_own_update(uuid) is 'Line-write gate: parent is the caller''s own update and still draft (FR-011/015).';

grant select, insert, update on mos.weekly_updates             to authenticated; -- no delete (soft-exists as draft)
grant select, insert, update, delete on mos.weekly_update_items to authenticated;

----------------------------------------------------------------------
-- mos.weekly_updates: upward-only read (NOT org-readable); author-only write.
----------------------------------------------------------------------
alter table mos.weekly_updates enable row level security;
alter table mos.weekly_updates force  row level security;

-- SELECT: upward-only (author OR manager-of-author), org-scoped. Peers/downward see zero rows.
create policy weekly_updates_select_upward on mos.weekly_updates
  for select to authenticated
  using (org_id = shared.current_org_id() and mos.can_read_weekly_update(person_id));

-- INSERT: author-only; org defaulted + unspoofable.
create policy weekly_updates_insert_author on mos.weekly_updates
  for insert to authenticated
  with check (org_id = shared.current_org_id() and person_id = shared.current_person_id());

-- UPDATE: author-only (managers never write). Summary submit-lock enforced by the trigger.
create policy weekly_updates_update_author on mos.weekly_updates
  for update to authenticated
  using (org_id = shared.current_org_id() and person_id = shared.current_person_id())
  with check (org_id = shared.current_org_id() and person_id = shared.current_person_id());
-- No delete policy (updates soft-exist as draft).

----------------------------------------------------------------------
-- mos.weekly_update_items: inherit parent's upward-only read; writes author-only AND parent draft.
----------------------------------------------------------------------
alter table mos.weekly_update_items enable row level security;
alter table mos.weekly_update_items force  row level security;

-- SELECT: read a line iff the caller may read its parent update (upward-only inheritance).
create policy weekly_update_items_select_upward on mos.weekly_update_items
  for select to authenticated
  using (org_id = shared.current_org_id() and exists (
    select 1 from mos.weekly_updates w
    where w.id = weekly_update_id and mos.can_read_weekly_update(w.person_id)
  ));

-- INSERT/UPDATE/DELETE: author-only AND parent draft (line submit-lock).
create policy weekly_update_items_insert_own on mos.weekly_update_items
  for insert to authenticated
  with check (org_id = shared.current_org_id() and mos.can_write_own_update(weekly_update_id));
create policy weekly_update_items_update_own on mos.weekly_update_items
  for update to authenticated
  using (mos.can_write_own_update(weekly_update_id))
  with check (org_id = shared.current_org_id() and mos.can_write_own_update(weekly_update_id));
create policy weekly_update_items_delete_own on mos.weekly_update_items
  for delete to authenticated
  using (mos.can_write_own_update(weekly_update_id));

-- DOWN:
--   drop policy weekly_update_items_delete_own on mos.weekly_update_items;
--   drop policy weekly_update_items_update_own on mos.weekly_update_items;
--   drop policy weekly_update_items_insert_own on mos.weekly_update_items;
--   drop policy weekly_update_items_select_upward on mos.weekly_update_items;
--   alter table mos.weekly_update_items disable row level security;
--   drop policy weekly_updates_update_author on mos.weekly_updates;
--   drop policy weekly_updates_insert_author on mos.weekly_updates;
--   drop policy weekly_updates_select_upward on mos.weekly_updates;
--   alter table mos.weekly_updates disable row level security;
--   drop function mos.can_write_own_update(uuid);
--   drop function mos.can_read_weekly_update(uuid);
