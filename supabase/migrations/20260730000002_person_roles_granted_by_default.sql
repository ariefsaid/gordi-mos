-- Review follow-up (code-quality I-2, 2026-07-30) to mig ...20260730000001.
--
-- That migration's header claimed person_roles "now matches [the supervisor_revenue_scope] pattern
-- exactly". It did not. The sibling does BOTH:
--   20260729000004_supervisor_revenue_scope.sql:22  alter column granted_by set default shared.current_person_id()
--   20260729000004_supervisor_revenue_scope.sql:49  new.granted_by := shared.current_person_id()   (in the guard)
-- ...000001 shipped only the guard, and its comment argued against the default as though the two
-- were alternatives. They are not. The guard OVERWRITES the default, so keeping both costs nothing
-- and buys the sibling's real property: a correct value on the honest path even if the trigger is
-- ever missing. That is not hypothetical — during the review of ...000001 the guard trigger was
-- observed absent from a live database while its function body and migration record were both
-- present. With no default, that state silently yields NULL attribution on every insert.
--
-- Defence in depth here is now three layers, each catching a different failure:
--   1. column default        — correct value if the trigger is detached
--   2. guard assignment      — overwrites a client-supplied value (the default alone cannot)
--   3. AC-214 has_trigger    — fails CI if the trigger is detached at all
--
-- NOT DONE — `revoke insert (granted_by) on shared.person_roles from authenticated`, which the
-- review proposed as the stronger, privilege-layer form of "never client-supplied". It does not
-- work: a column-level REVOKE does not subtract from an existing table-level GRANT. Probed on the
-- live stack before rejecting it:
--     grant insert on t_probe to authenticated;
--     revoke insert (b) on t_probe from authenticated;
--     select has_column_privilege('authenticated','t_probe','b','insert');  -->  t
-- Making it bite would mean revoking the table-level INSERT and re-granting column-by-column, which
-- then silently denies every column added later — a worse failure mode than the one it fixes. The
-- guard already makes the value unspoofable; layer 3 proves the guard is present. Recorded so the
-- suggestion is not re-proposed and quietly applied as a no-op that reads like a fix.

alter table shared.person_roles
  alter column granted_by set default shared.current_person_id();

comment on column shared.person_roles.granted_by is
  'Who performed this assignment. Column default + BEFORE INSERT guard both stamp shared.current_person_id(); the guard also OVERWRITES any client-supplied value, so attribution cannot be forged (FR-208, AC-209/AC-211). NULL for rows predating mig ...20260730000001 and for service/seed inserts, which have no acting person (AC-215).';

-- DOWN:
--   alter table shared.person_roles alter column granted_by drop default;
