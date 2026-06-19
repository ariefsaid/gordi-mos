# Plan — MOS Phase 3.1: production platform deploy (the first foundation slice)

- **Roadmap gate:** Phase 3.1 — production deploy to `ops.gordi.id/mos` on ris-dev (owner-approved).
  `docs/roadmap.md` L39. **Acceptance gate (the Phase-1.4 gate, re-run in prod):** the owner logs in at
  the (preview, then prod) URL and sees the shell with **their own name + role** (`docs/roadmap.md` L25).
- **Source ADR:** ADR-0010 (platform topology/hosting/operations) — binding decisions D1–D12. This slice
  executes the **OLTP/app side only**: the SPA (CF Pages) + self-hosted Supabase (trimmed) on ris-dev,
  hardened, backed up, observed. **Not in this slice:** the thin FastAPI backend (D6 — leave the seam),
  the OLAP warehouse (D2), the `reporting` schema (D5), the kitchen Module migration / Teable retirement
  (D10 step 3), the 8→16 GB resize (D10 — documented trigger only).
- **Runbook conventions:** `docs/environments.md` (env registry, op-get.sh secrets, prod = ris-dev),
  `supabase/README.md` (§Production email = Resend SMTP), `docs/director-playbook.md` (owner-gated infra).
- **Scope boundary (hard):** the planner/agents write only under `docs/`, `supabase/`, and **new** deploy
  IaC files; the live ris-dev `core` stack (Caddy + Teable + kitchen FastAPI) must **NOT** be disturbed —
  MOS is *added alongside*. No production cut or internet exposure happens until the two **owner gates**
  below; the security-auditor gate is hard-blocking before exposure (ADR-0010 D11).

---

## 0. Design

### 0.1 Target production topology (ADR-0010 D1/D2/D3/D6/D11)

```
  Browser ──HTTPS──> Cloudflare Pages           (the MOS SPA, base path /mos, static)
                          │
                          │  VITE_SUPABASE_URL = https://<supabase-api-host>   (CF Tunnel hostname)
                          ▼
  Cloudflare ──Tunnel(outbound-only)──> ris-dev (8GB Hetzner, /opt/stacks/core, compose project `core`)
                                          ├── cloudflared            (the tunnel daemon, outbound)
                                          ├── Caddy (existing)       reverse-proxy, path-routes /kitchen + Teable (UNTOUCHED)
                                          │      └── + NEW route → Supabase Kong (API only)
                                          ├── Supabase (NEW, trimmed): kong, auth(GoTrue), rest(PostgREST),
                                          │      meta, studio(gated), postgres(:localhost only)
                                          │      └── Realtime / Storage / analytics(Logflare) / imgproxy / vector: DISABLED (D10)
                                          ├── Teable + its Postgres + Redis   (UNTOUCHED)
                                          └── kitchen FastAPI                 (UNTOUCHED)
  Backups: pg_dump (cron) ──S3 API──> Cloudflare R2 (10GB free)   + Healthchecks.io dead-man's-switch
  Auth email: GoTrue SMTP ──> Resend (admin@gordi.id, OD-P1-11)
  Observability: PostHog (SPA product+error, masked) · monitor script (SSH) · Healthchecks (cron)
```

**Layer ownership of the seam:** the SPA is built by CF Pages from `mos-app/` with two build-time env
vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — read in `mos-app/src/lib/supabase.ts:3-4`). The SPA
reaches Supabase **only** through the CF Tunnel public hostname for Kong; the box opens **zero inbound
ports** (D11). `service_role` never enters the SPA build (D9) — the SPA carries only the anon key, and RLS
governs every read (`src/lib/supabase.ts:11-14`, ADR-0001/0002).

### 0.2 Self-hosted Supabase is NOT the CLI local stack — a key clarification

`supabase/config.toml` configures the **CLI local dev stack** (`supabase start`, ports +1000). Production
self-hosting uses the **Supabase Docker distribution** (`supabase/docker/docker-compose.yml` + `.env`),
which is a *separate* artifact this slice must author as IaC (D8: "box config as IaC … in git"). The two
share **one source of truth: `supabase/migrations/` + the reference seed** — `config.toml` is the
connection-target/feature config for *local*, the self-hosted compose is the *prod* one. Migrations are
promoted dev → prod via `supabase db push --db-url …@ris-dev` (`docs/environments.md` L29); the live DB is
**never hand-edited** (D9).

### 0.3 Prerequisite gaps found in the current tree (must be fixed before a cut — see Phase P)

| # | Gap | Where | Fix task |
|---|-----|-------|----------|
| G1 | No self-hosted Supabase compose/`.env`-shape/Caddy-route/cloudflared IaC exists in the repo | `supabase/` has only CLI `config.toml` | P1, P2, P3 |
| G2 | `config.toml` enables Realtime/Storage/analytics/vector — D10 says **trim** for prod | `config.toml:93,123,396,155` | self-hosted compose omits those services (P1); local config unchanged |
| G3 | Prod hardening flags not set: `enable_signup=true`, `minimum_password_length=6`, no session timebox, `enable_confirmations=false` | `config.toml:184,189,234,280-284` (and self-hosted GoTrue env) | P4 (prod GoTrue env values; local config untouched) |
| G4 | No `mos-app/.env.example` although `supabase.ts:6` error message references it | `mos-app/` | P5 |
| G5 | `seed.production.sql.example` is a comment-only stub; real-people provisioning path not concrete | `supabase/seed.production.sql.example` | P6 (author a runnable template + invite flow) |
| G6 | No PostHog wiring in the SPA (D7), no input-masking config | `mos-app/src/` | P7 |
| G7 | No R2 backup script, no restore proof, no monitor script, no Healthchecks wiring (D7/D8) | repo root / `supabase/ops/` | Phase D, Phase O |
| G8 | `vite.config.ts` test env stubs the Supabase URL but there is no documented prod-build env contract | `vite.config.ts:46-49` | P5 (document the CF Pages build env) |

These are **plan prerequisites**: every G is closed by a task below *before* the production cut (Phase C).

### 0.4 IaC file layout to be created (all committed; **no secrets** — coordinates only, D9)

```
supabase/docker/docker-compose.yml      # trimmed self-hosted Supabase (P1)
supabase/docker/.env.example            # env SHAPE only — every value is an op:// coordinate (P2)
supabase/docker/volumes/db/init/        # (only if self-hosted needs init SQL beyond migrations) (P1)
supabase/op.supabase.env                # 1Password coordinates for Supabase secrets (P2) — like op.resend.env
supabase/op.posthog.env                 # PostHog project key coordinate (P7)
supabase/op.r2.env                       # R2 S3 creds coordinates (D1 backups)
supabase/op.healthchecks.env             # Healthchecks ping-URL coordinate
infra/ris-dev/caddy.mos.snippet          # the ADDED Caddy route block (P3) — appended to existing Caddyfile
infra/ris-dev/cloudflared.mos.example    # the tunnel ingress rule for the Supabase API host (P3)
supabase/ops/backup-to-r2.sh             # pg_dump → R2 + Healthchecks ping (Phase D)
supabase/ops/restore-from-r2.sh          # tested-restore script (Phase D)
supabase/ops/monitor.sh                  # free -m / df -h / docker stats / pg conns / last-backup age (Phase O)
docs/runbooks/ris-dev-rebuild.md         # DR rebuild runbook + RTO (Phase R)
```

### 0.5 Owner-gated checkpoints (binding)

- **GATE A — staging/preview verification (before prod cut).** Supabase up on ris-dev (reachable only
  over the Tunnel), migrations applied, reference seed loaded, the owner's real person+auth provisioned;
  a **CF Pages preview deployment** points at it. The owner opens the **preview URL**, logs in, and sees
  the shell with their own name+role. Owner approves the production cut. *(This is the roadmap gate, run
  at preview first.)*
- **GATE B — security-auditor pass (HARD BLOCK before internet exposure / rollout).** ADR-0010 D11: a
  security-auditor (OWASP/STRIDE) pass on auth + RLS + the hardened box (zero inbound ports, localhost
  Postgres, gated Studio, key-only SSH + fail2ban, patching cadence, least-privilege roles) **must pass**
  before `ops.gordi.id/mos` is exposed and before user rollout. The plan **ends at "ready for owner to
  execute the cut + ready for the auditor gate"** — the Director does not flip exposure without owner sign-off.

---

## Phase P — Prerequisites & IaC authoring (close G1–G8; nothing touches the live box yet)

> All Phase-P tasks produce committed files / local artifacts only. **No SSH to ris-dev, no live deploy.**
> Verify commands run locally. (P0 is the exception — an owner account-signup prerequisite.)

### Task P0 — OWNER: provision the free-tier accounts (prerequisite — none exist yet; owner-grill 2026-06-19)
None of the external free-tier accounts exist yet (owner-confirmed), so the **owner provisions them first** —
they block the wiring tasks below:
- **Cloudflare R2** — create a bucket for OLTP backups + mint an S3 API token (Access Key ID + Secret) →
  store coordinates in `op` (`supabase/op.r2.env`). *Blocks D1/D2/D3.*
- **PostHog** — create a project; copy the project API key + host → `op` (`supabase/op.posthog.env`). *Blocks P7/C2.*
- **Healthchecks.io** — create a check for the daily backup cron; copy its ping URL → `op`
  (`supabase/op.healthchecks.env`). *Blocks D1/D3.*
These are **owner-executed account signups**, not agent tasks; only the `op://` coordinates land in the
`op.*.env` files (D9 — no secrets in git). Until done, D1/D3/P7 cannot wire real values.
**Verify:** each of the three `op://AS/...` coordinates resolves (`op-get.sh` returns non-empty) — run once, never echo the value.

### Task P1 — Author the trimmed self-hosted Supabase compose
Create `supabase/docker/docker-compose.yml` from the official Supabase self-hosting compose pinned to the
distribution matching `config.toml` `major_version = 17` (Postgres 17). **Include** services: `db`
(postgres), `kong`, `auth` (GoTrue), `rest` (PostgREST), `meta`, `studio`. **Remove/omit** (D10 trim):
`realtime`, `storage`, `imgproxy`, `analytics` (Logflare), `vector`, `functions` (edge-runtime), `supavisor`
(pooler not needed at this scale). On `db`: bind the host port to `127.0.0.1` only — `ports: ["127.0.0.1:5432:5432"]`
(never `0.0.0.0` — D11 anti-pattern, the Teable-port-exposure incident). Set memory limits on `db`
(`mem_limit: 2g`) and `studio`/`meta` (cap small) to fit alongside Teable+kitchen on 8 GB (D10).
PostgREST `PGRST_DB_SCHEMAS` must list `public,graphql_public,shared,mos,ops` to mirror `config.toml:14`.
Add a one-line provenance comment citing the upstream compose version + ADR-0010 D10.
**Verify:** `docker compose -f supabase/docker/docker-compose.yml config -q` exits 0 (compose parses) and
`grep -c 'realtime\|storage\|imgproxy\|logflare\|vector\|edge-runtime' supabase/docker/docker-compose.yml`
returns `0`.

### Task P2 — Author the `.env` SHAPE (coordinates only, no secrets) + op coordinates
Create `supabase/docker/.env.example` listing **every** env key the compose consumes with a placeholder
value and an inline `# op://AS/<item>/<field>` coordinate comment — **never a real value** (D9). Cover at
minimum: `POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `DASHBOARD_USERNAME`,
`DASHBOARD_PASSWORD` (Studio basic-auth), `SITE_URL=https://ops.gordi.id/mos/`,
`ADDITIONAL_REDIRECT_URLS=https://ops.gordi.id/mos/,https://ops.gordi.id/mos/recovery`,
`API_EXTERNAL_URL` (the CF-Tunnel Supabase host), `SUPABASE_PUBLIC_URL`, and the Resend SMTP block from
`supabase/README.md` §Production email (`GOTRUE_SMTP_HOST=smtp.resend.com`, `…PORT=465`, `…USER=resend`,
`…PASS` → op coordinate, `…ADMIN_EMAIL=admin@gordi.id`, `…SENDER_NAME=Gordi Admin`). Then create
`supabase/op.supabase.env` mirroring the `supabase/op.resend.env` format (item/vault/field for
`POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `DASHBOARD_PASSWORD`). Add a header
note: rendered on the box via `op-get.sh` at deploy time; this file is gitignored when filled.
**Verify:** `grep -rE '(re_[A-Za-z0-9]|eyJ|sb-|postgres://[^ ]*:[^ ]*@)' supabase/docker/.env.example` returns
**no matches** (no real secret leaked); `grep -c 'op://' supabase/docker/.env.example` ≥ 5.

### Task P3 — Author the ADDED Caddy route + cloudflared ingress (additive, reviewed offline)
Create `infra/ris-dev/caddy.mos.snippet` — the **block to append** to the existing `/opt/stacks/core/Caddyfile`
that path-routes the Supabase API. Because the SPA is on CF Pages and reaches Supabase via the Tunnel, the
Caddy add is the **internal** route from cloudflared → Kong, e.g. a dedicated `reverse_proxy kong:8000`
under the tunnel-served Supabase API hostname; it must **not** alter the existing `/kitchen` or Teable
blocks (include them verbatim as `# UNTOUCHED — context only` so the diff against the live file is obvious).
Create `infra/ris-dev/cloudflared.mos.example` — the tunnel `ingress:` rule mapping the Supabase API
hostname → `http://kong:8000` (or the Caddy front), with a header note that the hostname is an **open
question** (§Open questions Q1) to be pinned with the owner before the cut. Studio is **not** given a
public ingress rule (D11 — gated, never public).
**Verify:** `test -f infra/ris-dev/caddy.mos.snippet && test -f infra/ris-dev/cloudflared.mos.example` exits 0;
`grep -i 'studio' infra/ris-dev/cloudflared.mos.example` returns **no public-ingress match** (a comment
explaining the omission is allowed).

### Task P4 — Pin prod GoTrue hardening env values (local `config.toml` untouched)
In `supabase/docker/.env.example`, set the hardening values (backlog L5 / `docs/environments.md` L55-59):
`GOTRUE_DISABLE_SIGNUP=true` (closed signup), `GOTRUE_PASSWORD_MIN_LENGTH=8` +
`GOTRUE_PASSWORD_REQUIRED_CHARACTERS=lower_upper_letters_digits`, `GOTRUE_JWT_EXP=3600` (matches
`config.toml:173`), session timebox via `GOTRUE_SESSIONS_TIMEBOX=24h` +
`GOTRUE_SESSIONS_INACTIVITY_TIMEOUT=8h`, `GOTRUE_MAILER_AUTOCONFIRM` left default (confirmations on for
real email). Add a comment block cross-referencing `docs/environments.md` §"Security hardening before
prod exposure" so the auditor (GATE B) can check each line. **Do NOT** change `supabase/config.toml`
(local keeps open signup + min-6 for dev ergonomics — `config.toml:184,189`).
**Verify:** `grep -E 'GOTRUE_DISABLE_SIGNUP=true|GOTRUE_PASSWORD_MIN_LENGTH=8|GOTRUE_SESSIONS_TIMEBOX=24h' supabase/docker/.env.example | wc -l`
returns `3`; `git diff --quiet supabase/config.toml` (no local-config drift).

### Task P5 — Add `mos-app/.env.example` + document the CF Pages build env contract
Create `mos-app/.env.example` with the two keys `supabase.ts` requires:
`VITE_SUPABASE_URL=https://<supabase-api-host>` and `VITE_SUPABASE_ANON_KEY=<anon-key>` (the **anon** key,
never `service_role` — D9), each with a comment that production values are set as **CF Pages environment
variables** (build-time, not committed) and the URL is the CF-Tunnel Supabase hostname (Q1). This closes
the dangling reference in `mos-app/src/lib/supabase.ts:6`. Confirm `mos-app/.gitignore` ignores `.env`
(not `.env.example`).
**Verify:** `cd mos-app && grep -E 'VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY' .env.example | wc -l` returns `2`;
`git check-ignore mos-app/.env` prints a match while `git check-ignore mos-app/.env.example` exits non-zero.

### Task P6 — Author a runnable production-seed template + the invite-provisioning note
Replace the comment-only `supabase/seed.production.sql.example` body with a **runnable** template (still
gitignored when copied to `seed.production.sql`): real `shared.people` inserts keyed to the existing seed
org/role UUIDs from `supabase/seed.sql` (org `10000000-…001`, the six role UUIDs `30000000-…`), with
`user_id` left as a `:user_id` psql variable to be filled after the Supabase invite creates the auth row.
Keep the existing SECURITY header (no dev-auth password pattern — `seed.production.sql.example:5-8`). Add a
short ordered procedure comment: (1) invite the real user via Studio/GoTrue (creates `auth.users`); (2)
copy their uuid into `user_id`; (3) `psql -v user_id=<uuid> -f seed.production.sql`. The **reference seed**
(orgs/business_units/roles) is `supabase/seed.sql` **minus** the fictional `shared.people` block — note that
the prod apply runs only the structural top of `seed.sql` (orgs/units/roles, lines 5-27) and the real
people come from `seed.production.sql`; the fictional people (lines 29-48) and `seed.dev-*.sql` are
**never** applied to prod (`config.toml:74-77` flags those dev-only).
**Verify:** `grep -c '40000000-0000-0000-0000' supabase/seed.production.sql.example` returns `0` (no
fictional dev-people UUIDs leak into the prod template); `grep -ci 'passw0rd' supabase/seed.production.sql.example`
returns `0`.

### Task P7 — Wire PostHog into the SPA with mask-then-allowlist (D7) — TDD
ADR-0010 D7 requires PostHog product+error tracking with **input masking on all auth fields** and no PII
capture. **Red first:** write `mos-app/src/lib/analytics.test.ts` asserting (a) `initAnalytics()` is a
no-op (does not construct the client) when `import.meta.env.VITE_POSTHOG_KEY` is undefined — so unit tests
and local dev never emit; (b) when a key is present, the init options include
`autocapture: { maskAllInputs: true }` and `session_recording.maskAllInputs: true` (mask-then-allowlist).
Then create `mos-app/src/lib/analytics.ts` exporting `initAnalytics()` implementing that contract, reading
`VITE_POSTHOG_KEY` + `VITE_POSTHOG_HOST`. Add the two keys to `mos-app/.env.example` (commented: prod-only,
set in CF Pages). The unit-test no-op path covers tests (no `vite.config.ts` stub needed). Call
`initAnalytics()` once at the app root (the same place `useTheme()` is wired). **posthog-js** is added to
`mos-app/package.json` dependencies.
**Verify:** `cd mos-app && npm test -- analytics` green; `npm run typecheck` zero errors.

### Task P8 — Confirm the SPA is build-ready for CF Pages (base path + SPA fallback) — no code change expected
Verify the existing build already targets `/mos/` (`vite.config.ts:33` `base: '/mos/'`) and produces a
static `dist/`. CF Pages needs a SPA fallback so deep links (`/mos/tasks`, `/mos/recovery`) serve
`index.html`. Create `mos-app/public/_redirects` with `/mos/* /mos/index.html 200` (Cloudflare Pages
honours `_redirects`). Do not change the router (`basename` is already `/mos`, per `vite.config.ts:52-54`
test setup).
**Verify:** `cd mos-app && npm run build && test -f dist/_redirects && grep -q '/mos/index.html' dist/_redirects`
and `grep -rq '/mos/' dist/index.html` (base path baked in).

---

## Phase B — Box bring-up on ris-dev (additive; Teable/kitchen UNTOUCHED) — DRY-RUN then live, owner-aware

> These tasks SSH to ris-dev. They **add** the Supabase stack to `/opt/stacks/core/` without altering the
> running Teable/kitchen services. Run each `docker compose` with the **Supabase project name** explicitly
> (`-p supabase-mos`) so it never collides with the `core` project. Conventions per `docs/environments.md`
> (op-get.sh secrets) + `docs/director-playbook.md` (ris-dev = owner-gated infra — these run with owner
> awareness, exposure stays off until GATE A/B). **B0 baseline:** before any change, capture
> `ssh ris-dev "docker compose -p core ps --format '{{.Service}} {{.State}}'"` so B3 can prove `core` is
> undisturbed.

### Task B1 — Provision secret-zero on the box (D12) — owner-executed, one-time
Per ADR-0010 D12 (lean path): inject a single least-privilege, read-only `op` service-account token
(scoped to vault `AS` MOS items only) into a root-only `0600` file on ris-dev (e.g.
`/etc/mos/op-token`, `chmod 600`, `chown root:root`), referenced by a systemd `EnvironmentFile` or sourced
by `op-get.sh`. **This is the one secret outside `op`** — never in git, never in an image. Document the
rotation cadence inline in `docs/runbooks/ris-dev-rebuild.md` (Phase R). *Resident-vs-deploy-render choice
is Q3 — confirm with owner before executing.*
**Verify (on box, owner runs):** `sudo stat -c '%a %U' /etc/mos/op-token` prints `600 root`;
`op-get.sh "$OP_RESEND_ITEM" AS "$OP_RESEND_FIELD"` returns the Resend key non-empty (token works) — run
once, do not echo the value into any log.

### Task B2 — rsync the IaC to ris-dev + render `.env` from op (no live secrets in git)
From the authenticated Mac: `rsync -avz --exclude='.env' supabase/docker/ ris-dev:/opt/stacks/core/supabase/`
(the compose + `.env.example`; never the filled `.env`). On the box, render the real `.env` from op:
`op-get.sh`-drive a small render step that reads `supabase/op.supabase.env` + `supabase/op.resend.env`
coordinates and writes `/opt/stacks/core/supabase/.env` (mode `0600`). The anon/JWT/service keys are
generated once (the Supabase self-hosting `jwt` generator), stored in op (`supabase/op.supabase.env`
coordinates — Q5), then rendered.
**Verify (on box):** `stat -c '%a' /opt/stacks/core/supabase/.env` prints `600`;
`grep -c 'CHANGE_ME\|<.*>' /opt/stacks/core/supabase/.env` returns `0` (every placeholder resolved).

### Task B3 — Bring up the trimmed Supabase stack alongside `core` (Teable/kitchen untouched)
On the box: `cd /opt/stacks/core/supabase && docker compose --env-file .env -p supabase-mos up -d`
(explicit `-p supabase-mos` so it never merges into the `core` project). Confirm the existing services are
undisturbed against the B0 baseline.
**Verify (on box):** `docker compose -p supabase-mos ps --format '{{.Service}} {{.State}}'` shows
`db`, `kong`, `auth`, `rest`, `meta`, `studio` all `running`; `docker port $(docker compose -p supabase-mos ps -q db)`
shows the db port bound to `127.0.0.1` only (D11 — **not** `0.0.0.0`); `docker compose -p core ps --format '{{.Service}} {{.State}}'`
is identical to the B0 baseline (Teable/kitchen/Caddy unchanged).

### Task B4 — Apply all migrations to the prod DB (promote dev → prod; never hand-edit — D9)
From the Mac, point the CLI at the prod DB over the localhost-bound port via an SSH tunnel:
`ssh -L 5432:127.0.0.1:5432 ris-dev` then `supabase db push --db-url "$(op-get.sh <pg-url-item> AS credential)"`
(the prod connection string is a secret in op — `docs/environments.md` L19,29). This applies all 16
files in `supabase/migrations/` (`20260611000001_schemas.sql` … `20260612000006_ops_log_guard.sql`) in
order. **No `db reset` against prod** (that would run dev seeds). The `shared.custom_access_token_hook`
(migration `…000005`) wires the org/person JWT claims that the access-token hook (`config.toml:292-294`)
relies on — confirm GoTrue's `GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_URI` points at it in the prod `.env` (P2/P4).
**Verify (over the tunnel):** `psql "$PRODURL" -c "select count(*) from supabase_migrations.schema_migrations;"`
returns `16`; `psql "$PRODURL" -c "\dn"` lists `shared mos ops` (+ public/graphql_public).

### Task B5 — Load the reference seed (structure only) + provision the owner (GATE-A precondition)
Apply only the structural top of the reference seed to prod: orgs/business_units/roles
(`supabase/seed.sql` lines 5-27) into the prod DB — **omit** the fictional people (lines 29-48) and never
run `seed.dev-*.sql` (`config.toml:74-77`). Then provision the owner's real account: invite Arief via
Studio/GoTrue (creates `auth.users`), and run the filled `seed.production.sql` (from P6) inserting his
`shared.people` row + `shared.person_roles` linking him to the `Managing Director` role
(`30000000-0000-0000-0000-000000000000`, `seed.sql:21`) so the shell shows his name+role.
**Verify (over the tunnel):** `psql "$PRODURL" -c "select count(*) from shared.business_units;"` returns `5`
and `select count(*) from shared.roles;` returns `6`; `select full_name from shared.people where user_id is not null;`
returns Arief's real name (exactly one auth-linked person at this stage).

### Task B6 — Confirm RLS is enabled+forced on every business table in prod (hardening pre-check for GATE B)
Run the RLS-shape probe against prod (mirrors the pgTAP contract in `supabase/tests/`): every table in
`shared`/`mos`/`ops` has `rowsecurity = true` AND `relforcerowsecurity = true`.
**Verify (over the tunnel):**
`psql "$PRODURL" -c "select n.nspname, c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('shared','mos','ops') and c.relkind='r' and not (c.relrowsecurity and c.relforcerowsecurity);"`
returns **0 rows** (no business table without RLS enabled+forced).

---

## Phase C — SPA deploy + tunnel wiring → GATE A (preview)

### Task C1 — Create the Cloudflare Tunnel hostname for the Supabase API (Q1 must be pinned first)
With the owner, pin the Supabase API hostname (Q1) and create the CF Tunnel ingress (from
`infra/ris-dev/cloudflared.mos.example`, P3): route `https://<supabase-api-host>` → `http://kong:8000` on
the box; reload cloudflared. **No inbound port is opened** (D11 — the tunnel is outbound-only). Studio gets
**no** public hostname.
**Verify (from the Mac, after reload):** `curl -fsS https://<supabase-api-host>/auth/v1/health` returns
HTTP 200 (GoTrue reachable over the tunnel); `curl -fsS -H "apikey: <anon>" https://<supabase-api-host>/rest/v1/`
returns 200; a port scan of ris-dev's public IP shows **no** open inbound app port
(`nmap -Pn <ris-dev-ip>` → no Postgres/Studio/API port reachable).

### Task C2 — Deploy the SPA to a Cloudflare Pages PREVIEW with prod env vars
Build with the prod env wired (P5/P7): set CF Pages env vars `VITE_SUPABASE_URL=https://<supabase-api-host>`,
`VITE_SUPABASE_ANON_KEY=<anon-key from op>`, `VITE_POSTHOG_KEY`/`VITE_POSTHOG_HOST` (the masked PostHog
project), build command `npm run build`, output dir `mos-app/dist`, root `mos-app/`. Deploy to a **preview**
branch (not production) so the URL is non-public-facing. Confirm `_redirects` (P8) ships so `/mos/recovery`
deep-links resolve.
**Verify:** the preview URL serves the login page at `https://<preview>.pages.dev/mos/`; browser console
shows no `Missing VITE_SUPABASE_*` throw (`supabase.ts:5-6`); a network request to `<supabase-api-host>/auth/v1`
succeeds (200/400, not CORS/DNS failure).

### Task C3 — Resend SMTP live path proof (auth email) — the §Production-email sanity check
With the prod GoTrue SMTP env (P2/P4) pointing at Resend, trigger a password-reset from the preview login
page for the owner's address and confirm: (a) the email is delivered via Resend; (b) the recovery link
lands on `https://<preview>/mos/recovery` (proves `ADDITIONAL_REDIRECT_URLS` + the SMTP path —
`supabase/README.md:56-57`).
**Verify:** the reset email arrives; clicking the link loads the `/mos/recovery` route (not a redirect
error); Resend dashboard shows the send (or the GoTrue logs show a 2xx SMTP handshake).

### Task C4 — GATE A: owner logs in at the preview URL and sees the shell with their name+role
**OWNER-GATED CHECKPOINT.** The owner opens the preview URL, authenticates (magic-link or password,
OD-P1-8), and confirms the app shell renders **their own name + role** (the `resolveViewer` path,
`mos-app/src/lib/db/viewer.ts:40-108`, surfaces `person.full_name` + the derived role). This is the
**roadmap Phase-3.1/1.4 acceptance gate** run at preview. On owner approval → proceed to the production
cut (Phase C5) and queue GATE B.
**Verify:** owner confirms the shell shows "Arief …" + the Managing-Director role; no console errors; the
owner explicitly approves the production cut. (Director does not flip production exposure without this.)

### Task C5 — Production cut: promote CF Pages to the production domain (post-GATE-A, pre-GATE-B exposure note)
After GATE A, promote the CF Pages deployment so the SPA serves at the production path. **Per ADR-0010
D10/D11 the internet-facing rollout to users is still gated by GATE B** — the production domain mapping is
prepared and verified by the owner, but broad user rollout (Phase 3.2) does not begin until the
security-auditor pass (GATE B) is green. Wire the production CF Pages env vars (same as C2, production
scope) and confirm `ops.gordi.id/mos` resolves to the SPA (the existing Caddy `/kitchen` + Teable routes
remain untouched — the MOS SPA is served by CF Pages, only the Supabase API traverses the box via the
tunnel).
**Verify:** `curl -fsS https://ops.gordi.id/mos/ | grep -qi 'id="root"'` (SPA index served);
`curl -fsS https://ops.gordi.id/kitchen/ -o /dev/null -w '%{http_code}'` still returns the kitchen app's
prior status (UNTOUCHED).

---

## Phase D — Backups + restore proof (D8) — must exist before GATE B

### Task D1 — Author the pg_dump → R2 backup script + Healthchecks ping
Create `supabase/ops/backup-to-r2.sh`: `pg_dump` the prod DB (connection string via op), gzip, upload to
R2 via the S3 API (`aws s3 cp --endpoint-url <r2-endpoint>` with creds from `supabase/op.r2.env`
coordinates), retain N days, then `curl` the Healthchecks ping URL (from `supabase/op.healthchecks.env`)
on success only (dead-man's-switch — D7). All creds via op; **no secret in the script** (D9).
**Verify (locally, shellcheck):** `shellcheck supabase/ops/backup-to-r2.sh` exits 0;
`grep -rE 'AKIA|secret=|password=' supabase/ops/backup-to-r2.sh` returns no inlined secret.

### Task D2 — Author the restore script + run a TESTED restore (D8 — "a backup never restored is not a backup")
Create `supabase/ops/restore-from-r2.sh`: pull the latest dump from R2 and restore into a **throwaway**
local/scratch Postgres (never prod), then assert row counts match. Run it once against a fresh local stack
to prove the round-trip.
**Verify:** restore into a scratch DB succeeds; `psql <scratch> -c "select count(*) from shared.business_units;"`
returns `5` (the seed structure survived the dump→R2→restore round-trip). Record the restore-proof
timestamp in `docs/runbooks/ris-dev-rebuild.md`.

### Task D3 — Schedule the backup cron on the box + verify Healthchecks fires
Install `backup-to-r2.sh` as a daily cron (systemd timer or crontab) on ris-dev; register the
Healthchecks.io check with the expected schedule + grace.
**Verify (on box):** `systemctl list-timers | grep -i backup` (or `crontab -l | grep backup-to-r2`) shows
the schedule; after a manual run, the Healthchecks dashboard shows a green ping within the period.

---

## Phase O — Observability + hardening completion (D7/D11) — must be green for GATE B

### Task O1 — Author the server monitor script (D7)
Create `supabase/ops/monitor.sh` emitting `free -m`, `df -h`, `docker stats --no-stream`, `systemctl is-active`
for the Supabase + core services, the Postgres connection count, and the last-backup age (from R2 listing).
It is read-only and reads **no** financial/PII rows (D7 — non-financial monitor). Output is a single
structured block suitable for the later scheduled-agent digest (the agent layer is **not** built in this
slice — leave the seam).
**Verify (on box):** `bash supabase/ops/monitor.sh` prints all five sections non-empty;
`grep -ci 'select .* from \(shared\|mos\|ops\)' supabase/ops/monitor.sh` returns `0` (no business-row SQL).

### Task O2 — Box hardening baseline (D11 invariants)
On ris-dev confirm/apply (without breaking Teable/kitchen): `ufw` default-deny inbound + **zero inbound
ports**; Postgres bound to `127.0.0.1` (already from P1/B3); Supabase Studio reachable only over the tunnel/
gated path, never public (C1); SSH key-only (password+root login disabled); `fail2ban` active on SSH;
unattended-security-upgrades enabled + a scheduled reboot window (ris-dev carried ~50 pending updates — the
patching-cadence rationale, ADR-0010 D11); least-privilege DB roles (the SPA uses `anon`; `service_role`
is **not** wired to anything browser-facing in this slice).
**Verify (on box):** `sudo ufw status | grep -q 'Default: deny (incoming)'`; `sudo ufw status | grep -c 'ALLOW IN'`
returns only loopback/established (no public app port); `sudo sshd -T | grep -E 'passwordauthentication no|permitrootlogin no'`
both present; `systemctl is-active fail2ban` = `active`; `systemctl is-enabled unattended-upgrades` = `enabled`.

### Task O3 — Assemble the GATE-B evidence pack for the security-auditor
The Director collects into a single review brief (not a new doc the planner authors): the prod RLS probe
(B6), the hardening verifications (O2), the zero-open-ports scan (C1), the Studio-not-public proof (C1), the
secret-zero `0600` proof (B1), the backup+restore proof (D1/D2), the auth/RLS surface (ADR-0001/0002 +
migrations `…000006_rls.sql`, `…000009_mos_rls.sql`, `…000002_mos_weekly_updates_rls.sql`,
`…000005_ops_log_rls.sql`, `…000006_ops_log_guard.sql`).
**Verify:** the evidence pack references every D11 invariant with a passing check; hand to security-auditor.

### Task O4 — GATE B: security-auditor (OWASP/STRIDE) pass — HARD BLOCK before exposure/rollout
**OWNER-GATED + AUDITOR-GATED CHECKPOINT.** Per ADR-0010 D11 + CLAUDE.md §Quality gates, a security-auditor
pass on auth + RLS + the hardened box must be **green** before `ops.gordi.id/mos` is exposed to users and
before Phase 3.2 rollout. The plan **ends here** — the production cut (C5) is prepared and owner-verified,
but **user rollout / public announcement does not proceed until GATE B passes and the owner signs off.**
**Verify:** security-auditor report green on every D11 surface; owner signs off rollout. (Out of scope for
this plan: the rollout itself = Phase 3.2.)

---

## Phase R — DR runbook + RTO (D8)

### Task R1 — Write the ris-dev rebuild runbook + stated RTO
Create `docs/runbooks/ris-dev-rebuild.md`: the ordered steps to rebuild the box from IaC (Hetzner snapshot
restore → `git clone` the IaC → secret-zero injection (B1) → render `.env` from op → `docker compose -p supabase-mos up -d`
→ restore latest R2 dump (D2) → re-point cloudflared). State the **rough RTO** (single-box SPOF accepted,
ADR-0010 D8 — e.g. "~2–4h: snapshot restore + dump replay") and the Hetzner-snapshot schedule. Cross-ref
the secret-zero rotation cadence (B1) and the backup/restore scripts (Phase D).
**Verify:** `test -f docs/runbooks/ris-dev-rebuild.md`; it contains an "RTO" heading and references
`supabase/ops/restore-from-r2.sh` + the secret-zero `0600` step.

---

## Rollback / reversibility (it's a deploy)

- **SPA (CF Pages):** every deploy is an immutable, versioned Pages deployment — rollback = re-promote the
  previous deployment in the CF dashboard (instant, no box change). The production domain can be detached
  back to a holding page without touching ris-dev.
- **Tunnel:** removing the Supabase API ingress rule from cloudflared (C1) and reloading takes the API
  offline without opening/closing any inbound port — reversible config (ADR-0010 D11/Reversibility).
- **Supabase stack:** `docker compose -p supabase-mos down` removes the MOS Supabase services and leaves
  `core` (Teable/kitchen/Caddy) running — the project-name isolation (B3) is the rollback seam. The DB
  volume persists; a clean teardown including data is `down -v` (only on a deliberate abort, after a fresh
  backup).
- **Migrations:** each migration in `supabase/migrations/` is reversible-by-`db reset` *locally*; on prod
  the contract is **forward-only via `db push`** — rollback of a bad migration = a new compensating
  migration promoted dev → prod (never a hand-edit, D9). The DB itself is recoverable from the R2 dump
  (Phase D) within the stated RTO.
- **Hardening + secret-zero:** all declarative config (`ufw`, port bindings, SSH, fail2ban, the `0600`
  token) — tightenable/relaxable or rotatable without an app change (ADR-0010 Reversibility).
- **Full box loss:** the DR rebuild runbook (R1) + Hetzner snapshots + R2 dump = the documented recovery
  path at the stated RTO.

---

## Resolved (owner grill 2026-06-19)

All open questions are decided and incorporated into the tasks above:

- **Q1 — Supabase API hostname → `supabase.gordi.id`.** This is `VITE_SUPABASE_URL` (P5/C2),
  `API_EXTERNAL_URL`/`SUPABASE_PUBLIC_URL` (P2), and the cloudflared ingress target (P3/C1) — distinct from
  the `/mos` SPA path. `docs/environments.md` L19 (which lists the API URL as `ops.gordi.id/mos`) is
  **wrong** and must be corrected to split SPA-path from API-host (a doc-fix at deploy time). **C1/C2 unblocked.**
- **Q2 — trimmed service list → keep `db/kong/auth/rest/meta/studio`** (Studio tunnel-gated, never public —
  D11); drop `realtime/storage/imgproxy/analytics(Logflare)/vector/edge-runtime/supavisor` (P1).
- **Q3 — secret-zero → resident `0600` token** on the box (least-priv, read-only to the MOS vault items,
  rotatable; B1). Deploy-time render is **not** used.
- **Q4 — exposure → HOLD until GATE B.** The production domain is prepared + owner-verified at the cut (C5),
  but `ops.gordi.id/mos` is **not exposed to users** until the security-auditor pass (GATE B / O4) is green.
- **Q5 — keys → generated once** via the Supabase self-hosting generator, stored in `op`
  (`supabase/op.supabase.env`, P2); `service_role` intentionally **unused** this slice (D6 backend seam open).
- **Q6 — R2 / PostHog / Healthchecks accounts → NONE exist; the owner provisions them in Task P0**
  (new prerequisite). Blocks D1/D2/D3/P7.

**Cross-doc note (for the kitchen slice, not this one):** the GoTrue session timebox here is **24h/8h** (P4)
— conservative for the initial *manager* deploy. The kitchen PWA wants a **30-day** session (ADR-0011 D3);
GoTrue session config is **global**, so the kitchen slice must revisit the session policy (it can't be
per-role with a single GoTrue instance).

---

## Task count & gate summary

- **Tasks: 28** — Phase P (P0–P8 = 9), Phase B (B1–B6 = 6), Phase C (C1–C5 = 5), Phase D (D1–D3 = 3),
  Phase O (O1–O4 = 4), Phase R (R1 = 1) = **9+6+5+3+4+1 = 28** discrete tasks. (P0 = owner account-signup prereq.)
- **Owner-gated checkpoints: 2** — **GATE A** (C4: owner logs in at preview, sees own name+role — the
  roadmap acceptance gate) and **GATE B** (O4: security-auditor OWASP/STRIDE pass, HARD BLOCK before
  internet exposure / Phase-3.2 rollout). Secret-zero provisioning (B1) is also owner-executed.
- **Plan ends at:** production cut prepared + owner-verified (C5), backups/observability/hardening green,
  evidence pack assembled — **ready for the owner to execute exposure and for the GATE-B auditor pass.**
