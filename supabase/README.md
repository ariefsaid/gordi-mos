# Gordi MOS — Supabase (self-hosted, local-dev config)

One self-hosted Supabase stack serves MOS + future Gordi ops apps, separated by Postgres schemas
`shared` / `mos` / `ops` / `integrations` (OD-DIR-3). This directory targets **local dev**; the
ris-dev production deployment is a later issue.

> **Local ports (deviation).** This stack's `config.toml` ports are remapped **+1000** from the
> Supabase defaults (api 44321 · db 44322 · studio 44323 · mailpit 44324 · analytics 44327 ·
> pooler 44329 · shadow 44320) so it can run **alongside the pmo-portal local stack**, which holds
> the default ports. The local DB URL is therefore
> `postgresql://postgres:postgres@127.0.0.1:44322/postgres`.

## Layout
- `config.toml` — local stack config. `[api].schemas` exposes `shared`; the custom access token hook
  (`shared.custom_access_token_hook`) injects `org_id` + `person_id` JWT claims (OD-P1-1/2).
- `migrations/` — ordered, reversible-by-`db reset` SQL. Schemas → directory → triggers → helpers →
  hook → RLS.
- `seed.sql` — **committed** dev seed: real structure (OD-P1-5 units, role tree) + **fictional** dev
  people (OD-P1-6). Applied automatically by `supabase db reset`.
- `tests/` — pgTAP suite (`supabase test db`): schemas, RLS enabled+forced, cross-org isolation,
  person-without-auth, multi-role, `is_manager_of` dual-hat union chain, `org_id` spoof.

## Seed privacy (public repo — OD-P1-6)
Real names/emails NEVER enter `seed.sql`. At deploy time, copy `seed.production.sql.example` to
`seed.production.sql` (gitignored) and fill in real people + auth links; apply it manually against the
deployed stack. The committed seed stays fictional.

## Common commands (run from repo root)
- `supabase start` — boot the local stack (Docker).
- `supabase db reset` — drop, re-apply all migrations, re-run `seed.sql` (the reversibility contract).
- `supabase test db` — run the pgTAP suite.
