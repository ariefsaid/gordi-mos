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

## Production email (Resend) — OD-P1-11

Local dev uses **Mailpit** (`:44324`); nothing below applies locally. The production GoTrue must
send real mail (magic links, invites, password resets) through **Resend** via SMTP:

| GoTrue env var | Value |
|---|---|
| `GOTRUE_SMTP_HOST` | `smtp.resend.com` |
| `GOTRUE_SMTP_PORT` | `465` (implicit TLS; `587` STARTTLS also works) |
| `GOTRUE_SMTP_USER` | `resend` (literal) |
| `GOTRUE_SMTP_PASS` | a Resend API key (`re_…`) — secret, NEVER committed |
| `GOTRUE_SMTP_ADMIN_EMAIL` | `admin@gordi.id` (the From address — owner's alias) |
| `GOTRUE_SMTP_SENDER_NAME` | `Gordi Admin` |

Status (2026-06-11): domain **verified** in Resend; API key stored in **1Password vault `AS`**.
Secrets are fetched at deploy time via the host tool `op-get.sh <item> <vault> <field>`
(`~/.local/bin/op-get.sh`; loads the service-account token itself — see PMO
`docs/environments.md` for the pattern). Committed coordinates (NOT secret):
`supabase/op.resend.env`. Never copy the key into a file in this repo.

Sanity check after deploy: trigger a password-reset from the prod login page and confirm delivery +
that the link lands on `https://ops.gordi.id/mos/recovery`. Rate limits: Resend free tier (~3k/mo,
100/day) is ~10× MOS's worst case.
