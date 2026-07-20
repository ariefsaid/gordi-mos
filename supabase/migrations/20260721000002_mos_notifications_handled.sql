-- RATIFY R-OWNER-3: provisional read-vs-handled semantics; do not deploy before owner ratification.
--
-- V3 Issue 7 owner-gated prerequisite (docs/plans/2026-07-20-v3-inbox-deputy.md §"Evidence-led data
-- seam gate" / §"provisional owner-gated semantics"). Adds ONLY the private `handled_at` state that
-- lets Inbox triage distinguish "seen" (read_at) from "explicitly triaged out of my active queue"
-- (handled_at). The provisional semantics encoded — mirrored by the pure client helpers in
-- mos-app/src/components/inbox/read-handled-semantics.ts — are:
--   * read_at    = this person has seen/opened the notification.
--   * handled_at = this person explicitly triaged it out of their active Inbox queue.
--   * Opening marks READ only; explicit "Mark handled" may ALSO mark read.
--   * read-but-unhandled is a valid, representable state.
--   * handled is PRIVATE notification state only — never Task completion, Signal acknowledgement,
--     approval, or ownership; no `handled_by` column is added.
--
-- The plan's separate `notification_target_envelope` cleanup rewrites the two Signal fan-out RPC
-- bodies (producer `{type,id}` identity) and adds NO column to this table, so no envelope columns are
-- introduced here. RLS/owner scope is preserved; the existing mark-read-only guard already restricts
-- UPDATE to read_at, and handled_at joins it as the second (and only other) mutable column.
-- Reversibility (pre-production): `supabase db reset`; manual DOWN at foot.

alter table mos.notifications
  add column handled_at timestamptz;
comment on column mos.notifications.handled_at is
  'PROVISIONAL (R-OWNER-3): set when the owner explicitly triaged this notification out of their active Inbox queue. NULL = still in the active queue (incl. read-but-unhandled). Private notification state only — never Task/Signal/approval/ownership state.';

-- Active-queue fast path: the default Inbox scans the owner's un-handled rows.
create index mos_notifications_owner_unhandled_idx
  on mos.notifications (owner_id) where handled_at is null;

-- The mark-read-only guard (mos._guard_notification_update, 20260706000002) already RAISES on any
-- change except read_at, and handled_at — being unlisted — is likewise permitted. The guard body is
-- therefore unchanged: content stays immutable, and read_at + handled_at are the only two columns an
-- UPDATE may flip. (No re-create needed; the immutable-column list is authoritative.)

-- ── Manual rollback (pre-production) ────────────────────────────────────────────
-- drop index if exists mos.mos_notifications_owner_unhandled_idx;
-- alter table mos.notifications drop column if exists handled_at;
