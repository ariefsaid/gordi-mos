# ADR 0002 — Client auth architecture: plain context (no TanStack yet), schema-qualified reads, admin-API test users

- **Status:** Accepted
- **Date:** 2026-06-11
- **Issue:** P1-3 — Auth (roadmap Phase 1.3)
- **Deciders:** Director (within the signed `docs/specs/auth.spec.md`; OD-P1-8/9/10 locked)
- **Supersedes / superseded by:** none. Builds on ADR-0001 (org seam, person-first auth, fixed read posture).

This ADR records the three cross-cutting client-side commitments P1-3 introduces that future MOS
features inherit. The task-level implementation is in `docs/plans/2026-06-11-auth.md`; this records
*why* so a maintainer (and P1-4) does not re-litigate them.

---

## Context

P1-3 is the **first real app/TypeScript logic** in `mos-app/` (P1-1 was an empty scaffold, P1-2 was
DB-only). It introduces: a Supabase browser client, a session/viewer state layer consumed app-wide, the
route-guard shape every future protected page sits behind, and the first cross-stack e2e journeys that
need authenticated test users. Each of those is a seam later features build on, so the shape is chosen
once, here.

## Decision 1 — Viewer/session state is a plain React context for this slice; TanStack Query arrives with P1-4

`docs/director-playbook.md` §8 mandates TanStack Query for **hooks over list/refetch surfaces**
(`queryKey` org/user-scoped, `enabled` gated on auth). P1-3 has **no such surface**: the viewer's
Person + held Roles are read **exactly once** when a session is established and held for the session
lifetime; there is no pagination, no background refetch, no cache-invalidation story, and no second
consumer. Wrapping a single boot-time read in a `QueryClientProvider` would add a dependency and a
caching model with nothing to cache.

**Decision:** ship session + viewer state as a plain `AuthProvider` context (`src/auth/`). The viewer
read goes through a typed data-access module (`src/lib/db/viewer.ts`) so that when P1-4 adds My-Week
list hooks (`src/hooks/*`, TanStack), the **data-access layer is already in the §8 shape** and the
provider can delegate to a query without a rewrite. **Consequence:** P1-4 introduces
`@tanstack/react-query` + `QueryClientProvider` as its own first task and the viewer read may migrate
into a `useQuery` then; nothing in P1-3 blocks that. This is the deliberate, recorded deviation from
the "TanStack for all reads" default — justified by *single boot-time read, no refetch surface*.

## Decision 2 — Client reads are schema-qualified against the `shared`-exposed PostgREST; the client never sends `org_id`

`shared` is exposed in `config.toml` `api.schemas`. The browser client is created with
`db: { schema: 'shared' }` so `.from('people')` resolves to `shared.people` over PostgREST. RLS
(ADR-0001) scopes every read to the JWT's `org_id`/`person_id` claims minted by the access-token hook;
the client **never sends `org_id`** (playbook §8) — doing so is both unnecessary and, per the
06_org_id_spoof proof, unspoofable anyway. **Consequence:** the data-access layer mirrors the §8 rule
("never send `org_id`, RLS scopes it") from day one; future schemas read via per-call `.schema('mos')`
on the same client.

## Decision 3 — e2e test users are minted via the Supabase Admin API in Playwright global-setup, not a SQL `auth.users` seed

The committed `supabase/seed.sql` deliberately leaves dev people with `user_id = NULL` (no auth link).
e2e (AC-001/002/004) needs auth users **linked** to people, plus a known password and a
no-people-row orphan (AC-003). Hand-writing `auth.users` rows in SQL (`encrypted_password`,
`crypt()`, the identities row, confirmation columns) is **GoTrue-version-sensitive** — playbook §9 lists
"GoTrue seed shape is version-sensitive" among the inherited scars: a column rename across a CLI bump
silently breaks login.

**Decision:** create test users through the documented **Admin API** (`POST {url}/auth/v1/admin/users`
with the local `service_role` key, `email_confirm: true`, a fixed password) in a Playwright
**global-setup** (`e2e/global-setup.ts`), and link each to its `shared.people` row by `UPDATE`-ing
`user_id` via the service-role PostgREST/SQL. The admin endpoint is a **stable public contract** across
CLI versions; GoTrue owns the internal row shape. The orphan user is created the same way but **not**
linked, so the hook mints no `person_id` and the orphan path (FR-016) is exercised end-to-end.
**Consequence:** e2e requires the local stack up (`supabase start`) and the local anon + service_role
keys in env; global-setup is idempotent (delete-by-email then create) so reruns are clean.

## Consequences (rollup)

- P1-4 owns introducing TanStack Query; the §8 data-access shape is already in place to receive it.
- Every future client read is schema-qualified and `org_id`-free; the seam is consistent across schemas.
- e2e auth fixtures are version-robust; no `auth.users` SQL to re-pay for on a CLI bump.
- No production secrets enter the repo: only the local anon + service_role keys (which are public,
  well-known local-dev constants) live in `mos-app/.env.example`; `.env` stays gitignored (NFR-001).
