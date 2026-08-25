-- applied-path-fingerprint.sql — the facts two databases must agree on (#393, AC-2).
--
-- Read by scripts/applied-path-check.sh against BOTH halves of the comparison: a freshly
-- reset database and a database built from the deployed baseline and then migrated forward.
-- Emits one `kind|object|name|detail` line per fact, ordered, so a drift names itself in a
-- plain `diff`.
--
-- NOTHING HERE NAMES A TABLE, A SCHEMA, A CONSTRAINT OR A MIGRATION. Every set is derived
-- from the catalog, so a new schema, table or activity is covered the day it lands and no
-- edit here is needed. That is the difference between a fingerprint and a checklist.
--
-- WHAT IS COVERED
--   CONSTRAINT  every pg_constraint row on a business relation — CHECK, PRIMARY KEY, UNIQUE,
--               FOREIGN KEY, EXCLUDE — with its definition and its validated flag (a FK added
--               NOT VALID behaves differently from a validated one and must not compare equal).
--   RLS         row-level security enabled / forced, per table.
--   FUNCTION    every function in a business schema, by identity signature, with its SECURITY
--               DEFINER flag, volatility and search_path config. Signature only, never the body.
--   POLICY      policy name, command and grantee roles. Deliberately NOT the USING /
--               WITH CHECK expressions: presence-and-shape is what drift looks like, and the
--               fingerprint is written to a CI artifact.
--   CATALOG     the contents of every MIGRATION-OWNED table — RLS on, no write policy, no
--               write grant, i.e. rows that arrive by migration or seed and never by a
--               session. shared.activities is one of these; so is anything like it added later.
--
-- WHAT IS DELIBERATELY EXCLUDED, and why the exclusion cannot hide drift
--   * Supabase-managed schemas (auth, storage, realtime, …) — not ours, not migrated by us.
--   * Columns a clock or a generator decides: every uuid and timestamp column, plus anything
--     with a volatile default (now(), gen_random_uuid(), nextval). Their values differ between
--     any two resets, so including them would make the comparison fail always rather than fail
--     meaningfully. A table whose every column is excluded still contributes its ROW COUNT, so
--     an added or missing row is still drift.
--   * Function BODIES. Signatures are fingerprinted (a stale overload left behind by a
--     conditional drop is exactly the drift this exists to catch) but prosrc is not: it would
--     dominate the artifact and add nothing a signature change does not already flag.
with biz as (
  select oid, nspname
    from pg_namespace
   where nspname not like 'pg\_%'
     and nspname not like '\_%'
     and nspname not in ('information_schema','auth','storage','realtime','vault','extensions',
                         'graphql','graphql_public','supabase_functions','supabase_migrations',
                         'pgbouncer','cron','net','pgsodium','pgsodium_masks','pgtap','topology',
                         'tiger','tiger_data')
),
rel as (
  select c.oid, b.nspname || '.' || c.relname as rel, c.relrowsecurity, c.relforcerowsecurity
    from pg_class c
    join biz b on b.oid = c.relnamespace
   where c.relkind in ('r','p')
),
-- Migration-owned = RLS on, and no session can write it: no INSERT/UPDATE/DELETE/ALL policy
-- and no write privilege granted to any Data API role.
owned as (
  select r.oid, r.rel
    from rel r
   where r.relrowsecurity
     and not exists (select 1 from pg_policy p
                      where p.polrelid = r.oid and p.polcmd in ('a','w','d','*'))
     and not exists (select 1
                       from information_schema.role_table_grants g
                      where g.table_schema || '.' || g.table_name = r.rel
                        and g.privilege_type in ('INSERT','UPDATE','DELETE')
                        -- Only grants a SESSION can use. The owner always holds every
                        -- privilege; what marks a table user-writable is a write grant to one
                        -- of the Data API roles (or to PUBLIC).
                        and g.grantee in ('anon','authenticated','service_role','PUBLIC'))
),
-- Stable columns: everything whose value is reproducible across two independent builds.
stable_cols as (
  select o.oid, o.rel,
         string_agg(quote_ident(a.attname), ', ' order by a.attnum) as cols
    from owned o
    join pg_attribute a on a.attrelid = o.oid and a.attnum > 0 and not a.attisdropped
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.atttypid not in ('uuid'::regtype, 'timestamptz'::regtype, 'timestamp'::regtype)
     and coalesce(pg_get_expr(d.adbin, d.adrelid), '') !~* '(now\(|current_(date|time|timestamp)|gen_random_uuid|uuid_generate|nextval)'
   group by o.oid, o.rel
)
select 'CONSTRAINT' as kind, r.rel as object, con.conname::text as name,
       con.contype::text || ' valid=' || con.convalidated::text || ' ' || pg_get_constraintdef(con.oid) as detail
  from pg_constraint con join rel r on r.oid = con.conrelid
union all
select 'RLS', r.rel, '-', 'enabled=' || r.relrowsecurity::text || ' forced=' || r.relforcerowsecurity::text
  from rel r
union all
-- The PREDICATE is hashed, never printed. Reviewed on this PR: name/cmd/roles alone let a
-- deployed policy carrying a DIFFERENT using/with-check clause converge GREEN — the drift class
-- this harness exists to catch, applied to the project's hard gate. The artifact is downloadable,
-- so the clause itself must not appear; md5 catches the change without publishing it.
select 'POLICY', r.rel, p.polname::text,
       'cmd=' || p.polcmd::text || ' permissive=' || p.polpermissive::text || ' roles=' ||
       coalesce((select string_agg(pg_get_userbyid(x), ',' order by pg_get_userbyid(x))
                   from unnest(p.polroles) as x), 'public') ||
       ' using=' || coalesce(md5(pg_get_expr(p.polqual, p.polrelid)), '-') ||
       ' check=' || coalesce(md5(pg_get_expr(p.polwithcheck, p.polrelid)), '-')
  from pg_policy p join rel r on r.oid = p.polrelid
union all
select 'FUNCTION', b.nspname, p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
       -- body hashed for the same reason as the policy predicate: a definer function whose body
       -- changed while its signature did not is exactly the drift a signature-only fact misses.
       'secdef=' || p.prosecdef::text || ' volatility=' || p.provolatile::text ||
       ' config=' || coalesce(array_to_string(p.proconfig, ','), '-') ||
       ' body=' || md5(coalesce(p.prosrc, ''))
  from pg_proc p join biz b on b.oid = p.pronamespace
union all
-- Contents of the migration-owned tables, rendered by query_to_xml so an unknown table list
-- needs no dynamic SQL and no second round-trip. Ordered by every projected column, so the
-- rendering is deterministic.
select 'CATALOG', o.rel, coalesce(sc.cols, '(row count only)'),
       case
         when sc.cols is null then
           'rows=' || (query_to_xml(format('select count(*) from %s', o.rel),
                                    false, true, ''))::text
         else replace(replace(
                (query_to_xml(format('select %s from %s order by %s', sc.cols, o.rel, sc.cols),
                              false, true, ''))::text, e'\n', ' '), '  ', ' ')
       end
  from owned o
  left join stable_cols sc on sc.oid = o.oid
order by 1, 2, 3, 4;
