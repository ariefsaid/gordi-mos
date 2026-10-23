-- Staff (shifts, roster, attendance, absences) becomes an org-switchable module, independent of Work.
-- A missing settings row means enabled, like Work, Money and Café.
-- DOWN: supabase/rollbacks/20261022060000_mos_staff_module.sql
insert into mos.module_catalog (id) values ('staff') on conflict (id) do nothing;
