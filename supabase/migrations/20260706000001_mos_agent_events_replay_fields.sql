-- mos.agent_events replay-field widening (P3a §3.1, ADR-0018 P3a train).
--
-- WHY: P2's agent_events persisted only assistant text + tool {name,input,result}, and DROPPED three
-- fields the model API needs to replay a thread: (a) the echoed `user` turn, (b) the assistant's
-- `tool_calls` blocks, (c) each tool event's `tool_call_id`. Without a persisted `user` row, deep
-- thread-history replay (reopen/resume a run from the DB) is impossible — replay cannot rebuild the
-- ModelMessage[] the model expects. This migration widens the `type` CHECK to admit `'user'` (the
-- echoed user turn) and `'artifact'` (journal completeness for compose_view artifacts) so the handler
-- can journal them; the tool_calls/tool_call_id travel inside the existing `payload jsonb` (NO new
-- columns — payload already holds arbitrary structured data). AC-P3-RP-004.
--
-- ADDITIVE ONLY: no column added, no policy changed, no trigger touched. A `user`/`artifact` row is
-- fully immutable exactly like tool/status/system (the agent_events_feedback_only trigger already
-- rejects any drift on non-assistant rows). Owner RLS is the enforcement authority (unchanged).
--
-- Reversibility (pre-production): `supabase db reset`. Manual rollback at file foot (restore the
-- 4-value check — spelled out, not "repeat above", per the standing DOWN-comment review convention).

alter table mos.agent_events drop constraint if exists agent_events_type_check;
alter table mos.agent_events add constraint agent_events_type_check
  check (type in ('user','assistant','tool','artifact','status','system'));

comment on constraint agent_events_type_check on mos.agent_events is
  'P3a replay (ADR-0018 P3a): agent_events.type admits user/assistant/tool/artifact/status/system. '
  'user = the echoed user turn; artifact = compose_view journal entry. Both are fully immutable '
  '(the feedback-only trigger rejects any non-rating drift). Widened from the P2 4-value check by '
  'migration 20260706000001; rollback restores the 4-value check.';

-- ── Manual rollback ───────────────────────────────────────────────────────────
-- Restore the P2 4-value check (drops the widened constraint, re-adds the original). Reversible
-- only pre-production (a prod rollback would reject any already-persisted 'user'/'artifact' rows —
-- none exist yet at P3a build time; run `supabase db reset` locally).
--
-- alter table mos.agent_events drop constraint if exists agent_events_type_check;
-- alter table mos.agent_events add constraint agent_events_type_check
--   check (type in ('assistant','tool','status','system'));
