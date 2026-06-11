-- P1-2 — domain schemas (OD-DIR-3). Never dump MOS objects into public.
-- shared: cross-app directory & tenancy. mos/ops/integrations: created empty here;
-- Phase-2 issues add their tables (mos.tasks, mos.weekly_updates, ops.events, …).
create schema if not exists shared;
create schema if not exists mos;
create schema if not exists ops;
create schema if not exists integrations;

comment on schema shared is 'Cross-app directory and tenancy: orgs, people, roles, business units.';
comment on schema mos is 'Management OS domain (tasks, weekly updates) — tables land in Phase 2.';
comment on schema ops is 'Operational events feed — tables land in Phase 2.';
comment on schema integrations is 'Inbound mirrors from ops apps (kitchen, …) — tables land later.';

-- Authenticated app role may resolve objects in shared; PostgREST exposes it (config.toml).
grant usage on schema shared to authenticated, anon, service_role;
grant usage on schema mos, ops, integrations to authenticated, service_role;
