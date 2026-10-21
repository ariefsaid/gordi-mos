-- Retain metadata for the older initplan rollback to consume.
do $rollback$
begin
  raise notice 'Policy definition metadata retained for the 20261021043000 rollback; it will be consumed there';
end;
$rollback$;
