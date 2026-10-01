select coalesce(json_agg(f order by f.name), '[]'::json)
from (
  select p.proname as name,
         obj_description(p.oid, 'pg_proc') as comment,
         coalesce((
           select json_agg(json_build_object(
                    'name', a.n,
                    'type', format_type(a.t, null),
                    'required', a.ord <= p.pronargs - p.pronargdefaults) order by a.ord)
             from unnest(p.proargnames, p.proargtypes::oid[]) with ordinality as a(n, t, ord)
         ), '[]'::json) as args
    from pg_proc p
   where p.pronamespace = 'api_v1'::regnamespace
) f;
