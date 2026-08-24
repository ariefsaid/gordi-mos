-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- shared: the access-role vocabulary stated ONCE, as a domain (#216).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT THIS DOES. The access-role set was written out twice, 54 lines apart in the baseline: the
-- grant table (shared.person_access_roles.access_role) and the capability table
-- (shared.role_capabilities.role) each carried their own inline CHECK enumerating the six roles.
-- CONTEXT.md says the set grows by migration — and it already has, twice (manager, supervisor).
-- Growing a set that is stated twice is a silent two-place edit, and missing one produces an
-- asymmetric failure: a role that can be granted but holds no capabilities, or one the capability
-- table admits and the grant table refuses.
--
-- HOW. One shared DOMAIN — still text + CHECK underneath, so the baseline's "not a PG enum, stays
-- reversible" ruling holds. Both columns are retyped onto the domain and their private inline
-- CHECKs are dropped; from here the two tables cannot disagree because there is nothing left to
-- disagree with. shared_05_access_roles.sql asserts both columns resolve against the domain, so a
-- column quietly reverted to its own text+CHECK goes red there.
--
-- GROWING THE SET is now a one-place edit, in its own migration:
--   alter domain shared.access_role drop constraint access_role_allowed;
--   alter domain shared.access_role add constraint access_role_allowed
--     check (value in ('admin','ops_lead','finance','member','manager','supervisor','<new_role>'));
-- (drop+add in one transaction; the add revalidates existing rows, which by construction pass.)
--
-- ERROR CONTRACT UNCHANGED: a value outside the domain still raises 23514 (check_violation),
-- exactly what the inline CHECKs raised — shared_05's vocabulary assertions pass untouched.
--
-- DOWN (fully reversible, symmetric):
--   alter table shared.person_access_roles alter column access_role type text;
--   alter table shared.person_access_roles add constraint person_access_roles_access_role_check
--     check (access_role in ('admin','ops_lead','finance','member','manager','supervisor'));
--   alter table shared.role_capabilities alter column role type text;
--   alter table shared.role_capabilities add constraint role_capabilities_role_check
--     check (role in ('admin','ops_lead','finance','member','manager','supervisor'));
--   drop domain shared.access_role;

-- ── 1. The vocabulary, stated once ───────────────────────────────────────────────────────────
create domain shared.access_role as text
  constraint access_role_allowed
  check (value in ('admin','ops_lead','finance','member','manager','supervisor'));
comment on domain shared.access_role is
  'The access-role vocabulary (ADR-0011 D5) — the ONE statement of the set (#216). Fixed, grows '
  'by migration only: alter the access_role_allowed constraint (drop+add) in a new migration. '
  'Both shared.person_access_roles.access_role and shared.role_capabilities.role resolve against '
  'this domain; neither table may re-grow a private CHECK of its own.';

-- ── 2. The grant table resolves against it ───────────────────────────────────────────────────
alter table shared.person_access_roles
  drop constraint person_access_roles_access_role_check;
alter table shared.person_access_roles
  alter column access_role type shared.access_role;

-- ── 3. The capability table resolves against it ──────────────────────────────────────────────
alter table shared.role_capabilities
  drop constraint role_capabilities_role_check;
alter table shared.role_capabilities
  alter column role type shared.access_role;
