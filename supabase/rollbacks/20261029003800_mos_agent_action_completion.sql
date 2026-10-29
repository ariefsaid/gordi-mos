-- Revert the edge caller before applying this rollback. Existing rows remain intact.
drop function mos.execute_agent_approved_write(uuid,uuid,integer,text,text,text,jsonb,text);
