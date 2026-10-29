drop function if exists shared.finish_assistant_usage(uuid);
drop function if exists shared.reserve_assistant_usage(uuid,uuid,integer);
drop table if exists shared.assistant_usage;
