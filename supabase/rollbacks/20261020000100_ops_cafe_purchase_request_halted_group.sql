begin;
drop function ops.resolve_cafe_purchase_request_halted_group(uuid, text, text);
drop function ops.list_cafe_purchase_request_halted_groups();
delete from shared.record_history_readers
 where schema_name = 'ops' and table_name = 'cafe_purchase_request_posting_resolutions';
drop function shared._history_reader_ops_cafe_purchase_request_posting_resolutions(text, text, jsonb);
drop table ops.cafe_purchase_request_posting_resolutions;
commit;
