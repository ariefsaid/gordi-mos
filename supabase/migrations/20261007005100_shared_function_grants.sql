-- Function EXECUTE in the shared schema is held only by the roles that need it, and every shared
-- and API function pins its search_path (supabase/tests/shared_29_function_grants.sql owns the rules).
--
--   * shared helper functions (claim readers and row-policy predicates): EXECUTE for authenticated,
--     which policies run as, and service_role; none for PUBLIC or anon.
--   * shared trigger functions: no EXECUTE for PUBLIC; firing a trigger checks no privilege.
--   * shared.set_updated_at pins search_path = ''.
--   api_private.check_request keeps no search_path of its own: it reads the request schema from the
--   caller's search_path, and every name in its body is schema-qualified.
--
-- DOWN (manual, reversible):
--   grant execute on function shared._claim_uuid(text), shared._claim_text_array(text),
--     shared.current_person_id(), shared.current_org_id(), shared.is_org_member(),
--     shared.is_manager_of(uuid), shared.is_managed_by(uuid), shared.can(text),
--     shared.default_stream(), shared.is_cafe_affiliated(), shared.cafe_opening_team(uuid),
--     shared.cafe_opening_can_start(uuid), shared._record_history_key(jsonb, text[]),
--     shared.is_org_wide(), shared.is_cafe_affiliated_at(uuid), shared.set_updated_at(),
--     shared._guard_people(), shared._guard_person_roles(), shared._guard_person_access_roles(),
--     shared._guard_teams(), shared._guard_team_memberships(), shared._set_team_produces_default()
--     to public;
--   revoke execute on function <the helpers in the first grant below> from authenticated, service_role, then
--     re-grant authenticated on shared.default_stream(), shared.is_cafe_affiliated(),
--     shared.cafe_opening_team(uuid), shared.cafe_opening_can_start(uuid),
--     shared.is_cafe_affiliated_at(uuid);
--   alter function shared.set_updated_at() reset search_path;

begin;

-- ── shared helpers: authenticated and service_role only ─────────────────────────────────────────
revoke execute on function
  shared._claim_uuid(text),
  shared._claim_text_array(text),
  shared.current_person_id(),
  shared.current_org_id(),
  shared.is_org_member(),
  shared.is_manager_of(uuid),
  shared.is_managed_by(uuid),
  shared.can(text),
  shared.default_stream(),
  shared.is_cafe_affiliated(),
  shared.cafe_opening_team(uuid),
  shared.cafe_opening_can_start(uuid),
  shared._record_history_key(jsonb, text[]),
  shared.is_org_wide(),
  shared.is_cafe_affiliated_at(uuid)
  from public, anon;
grant execute on function
  shared._claim_uuid(text),
  shared._claim_text_array(text),
  shared.current_person_id(),
  shared.current_org_id(),
  shared.is_org_member(),
  shared.is_manager_of(uuid),
  shared.is_managed_by(uuid),
  shared.can(text),
  shared.default_stream(),
  shared.is_cafe_affiliated(),
  shared.cafe_opening_team(uuid),
  shared.cafe_opening_can_start(uuid),
  shared._record_history_key(jsonb, text[]),
  shared.is_org_wide(),
  shared.is_cafe_affiliated_at(uuid)
  to authenticated, service_role;

-- ── shared trigger functions: no grant needed to fire ───────────────────────────────────────────
revoke execute on function
  shared.set_updated_at(),
  shared._guard_people(),
  shared._guard_person_roles(),
  shared._guard_person_access_roles(),
  shared._guard_teams(),
  shared._guard_team_memberships(),
  shared._set_team_produces_default()
  from public, anon;

alter function shared.set_updated_at() set search_path = '';

commit;
