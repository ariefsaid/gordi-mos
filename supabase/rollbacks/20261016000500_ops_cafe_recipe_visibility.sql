-- Guarded rollback for 20261016000500_ops_cafe_recipe_visibility.sql.
-- Visibility choices and their audit history are durable user data; preserve them before rollback.
begin;

do $$
begin
  if exists (select 1 from ops.recipe_visibility)
     or exists (select 1 from ops.recipe_visibility_audit) then
    raise exception 'recipe visibility data exists; preserve it before rolling back' using errcode = '55000';
  end if;
end;
$$;

drop function ops.set_recipe_visibility(text, boolean, integer, uuid);
drop function ops.list_recipe_visibility();
drop trigger recipe_visibility_audit_immutable on ops.recipe_visibility_audit;
drop function ops._reject_recipe_visibility_audit_mutation();
drop table ops.recipe_visibility_audit;
drop table ops.recipe_visibility;

commit;
