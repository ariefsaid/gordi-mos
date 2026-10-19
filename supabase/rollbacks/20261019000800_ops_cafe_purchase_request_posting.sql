-- Rollback for 20261019000800_ops_cafe_purchase_request_posting.sql (#1432). Removes the
-- request-posting switch, the approval enqueue and the posting read, deletes any purchase-request
-- outbox rows, and restores the outbox CHECKs and comments to their previous text.
begin;
drop function if exists ops.cafe_purchase_request_posting(ops.cafe_purchase_requests);
drop trigger if exists cafe_purchase_requests_enqueue_on_approval on ops.cafe_purchase_requests;
drop function if exists ops._enqueue_approved_cafe_purchase_request();
drop function if exists ops._enqueue_cafe_purchase_request(uuid);
drop function if exists ops.set_cafe_purchase_request_posting_enabled(uuid, boolean);
drop table if exists ops.cafe_purchase_request_posting_switches;

delete from integrations.esb_push where source_module = 'cafe_purchase_request';
delete from integrations.esb_push_groups where source_module = 'cafe_purchase_request';
alter table integrations.esb_push drop constraint esb_push_source_module_check;
alter table integrations.esb_push add constraint esb_push_source_module_check
  check (source_module in ('kitchen', 'roastery', 'cafe_receipt'));
alter table integrations.esb_push drop constraint esb_push_endpoint_check;
alter table integrations.esb_push add constraint esb_push_endpoint_check
  check (endpoint in ('assembly-actual', 'simple-transfer', 'noop', 'goods-receipt'));
alter table integrations.esb_push_groups drop constraint esb_push_groups_source_module_check;
alter table integrations.esb_push_groups add constraint esb_push_groups_source_module_check
  check (source_module in ('kitchen', 'cafe_receipt'));
comment on column integrations.esb_push_groups.posting_stage is
  'Goods-receipt groups only. create_sent: a create may have reached ESB with its answer lost, so the worker looks the MOS key up before any create. awaiting_authorization: the worker created a number and ESB has not authorized it. operator_confirmed: procurement found and recorded the ESB number; the worker adopts it without another ERP call. Null: no ESB action is pending; with status posted, esb_doc_num is authorized.';
comment on function ops.review_cafe_purchase_request(uuid, text, integer, text) is
  'The only purchase-request decision. Requires ops.can_review_stream on the request''s stream, Submitted status and the current version; refuses approval by the requester with no ops-lead or admin exemption; a reject needs a note. Takes no request facts and enqueues nothing.';
comment on table ops.cafe_purchase_requests is
  'One Café purchase request raised on a stream: Submitted at send, then Approved or Rejected by a stream reviewer; nobody approves their own. Approved and Rejected requests are frozen and an Approved request is approved, not posted.';
commit;
