-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Bar capture 5/8 — the intra-branch hold is PERMANENT, not a placeholder (#235, FR-053).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- No structure changes. This migration exists because the thing #235 must record is a RULING
-- ABOUT AN ARM THAT ALREADY WORKS, and the place a future session reads a ruling about a
-- function is that function's comment.
--
-- The arm: ops.esb_endpoint_for returns 'noop' when a movement's destination branch equals its
-- origin branch, and ops.approve_kitchen_log stamps that endpoint on the outbox row it enqueues.
-- Approved, such a movement is logged, approved, and HELD — no ERP document (FR-050). #235 is
-- what finally makes the surface able to produce those rows from both activity surfaces (bar →
-- own branch's kitchen, kitchen → own branch's bar), so the arm stops being exercised only by
-- the incumbent's one carried case and starts carrying real intra-branch traffic.
--
-- What is being written down, and why it is not a TODO:
--   The production master-data lookup (2026-08-05, #227 addendum) found NO kitchen/bar location
--   distinction, and production-type locations are not valid transfer endpoints. There is
--   therefore no ERP counterpart for an intra-branch movement to post to — not "not built yet",
--   but nothing to post TO as the master data is configured. FR-053 states the consequence: the
--   held arm is the permanent model. It is revisitable only if that master data grows
--   per-activity locations, and the COGS question it raises is owner-deferred past the MVP
--   (OD-WAY-51, relitigation trigger: stock opname) and gates nothing.
--
--   The comment matters because the alternative reading is the expensive one. A 'noop' arm with
--   no explanation invites exactly one next move — "wire up the missing endpoint" — and that
--   move posts transfer documents against locations the ERP will reject or, worse, accept
--   against the wrong books. The stored model is unchanged and deliberately so: destination
--   stays a BRANCH, compared to the origin branch and to nothing else, and no
--   destination-activity dimension is added speculatively (FR-051, OD-WAY-44).
--
-- The comment text is also corrected in place in 20260805000011_ops_functions.sql so a fresh
-- database gets it from the baseline; this migration re-issues it for databases that already
-- applied that file (same pattern, and same reason, as 20260806000002).
--
-- DOWN: re-issue the previous comment text (the pre-#235 revision of the same COMMENT ON in
--   20260805000011_ops_functions.sql). Comment-only; there is no structural reversal to make.

comment on function ops.esb_endpoint_for(text, uuid, uuid) is
  'Derives the ERP operation for a movement (FR-071). produce posts an assembly; a transfer '
  'between branches posts a simple transfer; a transfer WITHIN one branch''s books posts '
  'nothing, because the ERP already books that branch as holding it (OD-WAY-26) — not because '
  'it stayed in the same place, which is what the incumbent''s own comments say. The noop arm '
  'is the PERMANENT model for intra-branch movements, not a placeholder (FR-053, #235): the '
  'production master-data lookup found no per-activity locations and production-type locations '
  'are invalid transfer endpoints, so no ERP counterpart exists to post to as configured. Do '
  'not add a posting arm here; revisit only if that master data grows per-activity locations. '
  'The comparison is branches only — no destination-activity dimension (FR-051, OD-WAY-44).';
