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
Real names/emails NEVER enter `seed.sql`, and never enter **this directory at all**. At deploy time,
copy `seed.production.sql.example` to `docs/local-seeds/02-real-roster.sql` and fill in real people +
auth links; apply it manually against the deployed stack. The committed seed stays fictional.

The filled-in file lives outside `supabase/` on purpose. This directory is tracked, so anything under
it is one `git add supabase` away from a public commit, whatever the filename. `docs/` is gitignored
as a whole directory *and* is a nested repo with no remote, so `git add` cannot stage its contents at
all. Prefer that boundary to any filename rule.

## Common commands (run from repo root)
- `supabase start` — boot the local stack (Docker).
- `supabase db reset` — drop, re-apply all migrations, re-run `seed.sql` (the reversibility contract).
- `supabase test db` — run the pgTAP suite.

## Google sign-in (#1276)

Google sign-in is available to people whose Google-verified email matches exactly one admin-provisioned
`shared.people` record. The auth database guards link that identity to the existing login, and the
custom access-token hook validates later Google sign-ins; email/password sign-in remains enabled.

The local provider reads credentials through environment substitution in `config.toml`:
`SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`. Supply both to
the local Supabase process environment; keep their values in environment/secret management, never in
tracked files.

For each hosted environment, configure Google as an Auth provider, add the standard Supabase Auth
callback URI to the Google OAuth client, and allow the app's login callback in Auth redirect settings.
Keep the custom access-token hook pointed at `shared.custom_access_token_hook`; the migration updates
the function while preserving its existing directory and agent-token behavior.

## Deploy to staging

```sh
bash scripts/deploy-staging.sh            # preflight, y/N confirm, push, verify, promotion PR
bash scripts/deploy-staging.sh --dry-run  # stop after the preflight
```

Prerequisites: `op-get.sh` signed in on the host, and a local `supabase/op.staging.env` copied from
`supabase/op.staging.env.example` (gitignored; it names where the connection string is stored). Run it
from a checkout of `main` at `origin/main` (anything else is refused).

Order: dry-run list of pending migrations; edge-function changes on `main` vs `staging` are reported
but never deployed; a rolled-back probe of the privileged steps when a pending migration touches the
`authenticator` role or storage policies; confirmation (default No; `--yes` skips it); `supabase db
push`; then verify (newest migration applied, the request gate set when a migration sets it, no trusted
agent clients). The connection string is never printed. `--no-pr` skips the `main` to `staging`
promotion PR, which is opened from a temporary worktree on `main`.

## Writing a migration that is conditional on prior state (#393)

`supabase db reset` starts from nothing. So the moment a migration says `drop constraint if
exists`, `drop policy if exists`, `create … if not exists` or wraps a repair in `do $$ … $$`, it
has **a branch CI structurally cannot reach** — the only environments that run it are staging and
production. A green suite says nothing about that branch.

`scripts/applied-path-check.sh` is what covers it. It builds **two** databases in the one local
stack and compares them:

| | how it is built |
|---|---|
| FRESH | `supabase db reset` on the working tree — exactly what CI runs |
| APPLIED | `supabase db reset` on the `supabase/` tree at the **deployed** commit, seeded, then `supabase migration up` on the working tree — the real chain, applying exactly the versions that commit has not seen |

and asserts the property that actually protects a deployment: **a migrated database is
indistinguishable from a freshly reset one** — in CHECK / primary-key / unique / foreign-key
constraints, RLS posture, policies, function signatures, and the contents of every
migration-owned catalog table, across every business schema. `scripts/lib/applied-path-fingerprint.sql`
derives all of that from the catalog, so a new schema, table or vocabulary row is covered the day
it lands.

```
supabase start
scripts/applied-path-check.sh                 # green/red
scripts/applied-path-check.sh --prove         # ALSO break the conditional and require a red
```

Two things to know before you rely on it:

- **`supabase/applied-path-baseline` names the deployed commit.** It is the one fact no script can
  infer. Move it forward after a deploy, to the commit that was deployed. If nothing is pending
  against it the check exits 2 and says so — it never passes on air.
- **Do not build the "old" state by hand.** Re-adding the constraints a migration drops re-couples
  what the migration decoupled, and the comparison ends up being a database against itself. The
  baseline comes from git, and the check refuses to continue unless the pre-migration database is
  demonstrably different from a fresh one.

CI runs it on the `geometry` job's dev-PR fast lane and, with `--prove`, on the `db` job — the
gate immediately before a staging deploy. The proof run publishes its green/red contrast to the
job summary and keeps the fingerprints as a build artifact.

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

Supply mail credentials through the deployment secret configuration. Keep secret lookup coordinates and local environment files out of version control.

Sanity check after deploy: trigger a password-reset from the prod login page and confirm delivery +
that the link lands on `https://ops.gordi.id/mos/recovery` (proves the SMTP path specifically). Rate limits: Resend free tier (~3k/mo,
100/day) is ~10× MOS's worst case.

## Agent access to the data API

Outside AI agents sign in through the auth server's OAuth flow and call the `api_v1` schema. Every
data-API request that carries a `client_id` passes a pre-request fence
(`api_private.check_request`, set on the `authenticator` role by migration):

- only the `api_v1` schema is reachable;
- the client must be enabled in `shared.trusted_agent_clients` for the person's org, and the token's
  session must still exist (revoking the session ends access at once);
- the person must hold the `agent.connect` authority (Admin Settings, default: admins only).

The app's own tokens and anonymous requests carry no `client_id` and pass unchanged. The Edge Functions (`agent-chat`,
`compose-view`) refuse `client_id` tokens.

Setup per environment, as an admin/SQL operator (placeholders only):

```sql
-- the resource identifier the agent's token is issued for
update shared.agent_access_settings set mcp_resource = '<resource-identifier>';
-- register a client; it starts switched off
insert into shared.trusted_agent_clients (org_id, client_id, display_name)
  values ('<org-id>', '<client-id>', '<display name>');
update shared.trusted_agent_clients set enabled = true where client_id = '<client-id>';
```

The OAuth server itself is switched on only in the environment's auth configuration, never in
`supabase/config.toml`.

### Request time limit

Both token kinds run as `authenticated`, so its `statement_timeout` bounds every data-API request.
Verify it on an environment (read-only; the caller supplies the connection string, which the script hands to psql through
the `PG*` environment variables so it never appears in a process listing):

```bash
DATABASE_URL='<connection-string>' bash scripts/check-statement-timeout.sh   # MAX_MS=8000 to tighten
```

Exit 0 = set and within the ceiling (default 30 s); 1 = unset, unlimited or too high; 2 = unreadable.
