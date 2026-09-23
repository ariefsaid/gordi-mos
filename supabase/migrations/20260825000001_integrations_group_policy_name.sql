-- integrations: the approval-group read policy — rename to state its admitted set
--
-- The last policy still named for one member of the set it admits (#467).
--
-- #214 retired that convention: a policy name states the FULL admitted set, `_or_`-joined, so
-- `..._ops` became `..._ops_lead_or_admin` across eleven policies. This one escaped because it
-- was authored at 20260822 — BEFORE those rename migrations existed, and dated earlier than them,
-- so the 20260824 renames could not see it. Its posture was always correct and matches its
-- renamed sibling exactly (SELECT, to authenticated, org_id = shared.current_org_id() and
-- (ops_lead or admin)); only the name lied about the set.
--
-- Named for the integrations domain to match its three siblings: the migration-set guard
-- (mos-app/src/baseline-migration-set.test.ts) asserts every additive migration's FILENAME begins
-- with one of the five domain prefixes — it does not inspect the SQL, so this is convention, not
-- a constraint the guard enforces.
--
-- DOWN (reverse rename):
--   alter policy esb_push_groups_select_ops_lead_or_admin on integrations.esb_push_groups
--     rename to esb_push_groups_select_ops;

alter policy esb_push_groups_select_ops on integrations.esb_push_groups
  rename to esb_push_groups_select_ops_lead_or_admin;
