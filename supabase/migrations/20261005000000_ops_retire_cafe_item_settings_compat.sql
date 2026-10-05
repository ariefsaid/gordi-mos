begin;

-- DOWN (manual): restore the six-argument compatibility overload verbatim from
-- 20261004000010_ops_cafe_team_item_kind.sql:493-522, including the following function comment
-- and grants at lines 523-528.
-- The app writes kind and activation explicitly through the eight-argument save RPC.
drop function if exists ops.save_cafe_item_settings(uuid, text, uuid, text, uuid, uuid[]);

commit;
