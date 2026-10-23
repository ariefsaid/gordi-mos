-- DOWN for 20261023002000_ops_cafe_locations_first_backfill.sql. Restores the outlet sends it converted
-- (a Kitchen transfer inside its own Branch did not exist before, so every one is a converted send) and
-- clears the plan Location pointers. Locations it created or demoted, and the log pointers it set, stay.
begin;
alter table ops.kitchen_logs disable trigger user;
alter table ops.kitchen_plans disable trigger user;
update ops.kitchen_plans set action = 'outlet_send', destination_branch_id = null, to_location_id = null
 where action = 'transfer' and activity = 'kitchen' and destination_branch_id = branch_id;
update ops.kitchen_plans set from_location_id = null, to_location_id = null;
update ops.kitchen_logs set action = 'outlet_send', destination_branch_id = null
 where action = 'transfer' and activity = 'kitchen' and destination_branch_id = branch_id;
alter table ops.kitchen_logs enable trigger user;
alter table ops.kitchen_plans enable trigger user;
drop function ops._backfill_cafe_locations_first();
commit;
