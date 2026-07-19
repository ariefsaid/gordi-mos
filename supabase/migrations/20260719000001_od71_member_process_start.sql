-- OD-REDESIGN-71(iii) — members can start the café opening (owner "agree all", 2026-07-19).
-- Resolves RATIFY-7A toward the OD-66 barista zero-training front: the person who runs the floor
-- starts the day, not only a head-office lead.
--
-- SAFE BY THE EXISTING DOUBLE GATE (mos.spawn_process_run): starting still requires
--   shared.can('process.start')  AND  mos.can_start_process_for_team(team)  [Team membership].
-- So this grant lets a member start ONLY a process for a Team they belong to — a café barista
-- starts the café opening; it does NOT let an arbitrary member start an unrelated Team's process.
-- No new RPC surface, no RLS change; capability-registration row only.

insert into shared.role_capabilities (role, capability, scope) values
  ('member', 'process.start', 'org')
on conflict (role, capability) do nothing;

-- DOWN (reversible):
-- delete from shared.role_capabilities where role = 'member' and capability = 'process.start';
