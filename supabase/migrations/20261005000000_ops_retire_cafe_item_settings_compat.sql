begin;

-- The app writes kind and activation explicitly through the eight-argument save RPC.
drop function if exists ops.save_cafe_item_settings(uuid, text, uuid, text, uuid, uuid[]);

commit;
