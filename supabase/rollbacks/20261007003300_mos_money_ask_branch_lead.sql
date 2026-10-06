-- Rollback for 20261007003300_mos_money_ask_branch_lead.sql (#1436). Tasks it created stay:
-- they are ordinary Tasks.
begin;
drop function if exists mos.ask_branch_lead(text, integer, date, text, text);
commit;
