-- Rollback for 20261007000500_ops_cafe_purchase_request.sql (#1428). Drops the purchase-request
-- tables, guards and functions; no other object depends on them.
begin;
drop function if exists ops.review_cafe_purchase_request(uuid, text, integer, text);
drop function if exists ops.submit_cafe_purchase_request(uuid, text, date, text, uuid, jsonb);
drop table if exists ops.cafe_purchase_request_lines;
drop table if exists ops.cafe_purchase_requests;
drop function if exists ops._guard_cafe_purchase_request_line();
drop function if exists ops._guard_cafe_purchase_request();
commit;
