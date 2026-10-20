begin;
do $$
begin
  if exists (select 1 from mos.cancel_void_reviews) or exists (select 1 from reporting.cancel_void_register) then
    raise exception 'Archive register evidence and review history before rollback';
  end if;
end;
$$;
drop table mos.cancel_void_reviews;
drop function mos._stamp_cancel_void_review();
drop table reporting.cancel_void_register;
commit;
