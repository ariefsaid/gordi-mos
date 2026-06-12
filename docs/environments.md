# Environments & Supabase CLI hygiene — Gordi MOS

The binding rules live in `CLAUDE.md` (§ Quality gates & checkpoints). This is the **full reference + registry**.
Mental model: **one source of truth = `supabase/migrations/` + `seed.sql` (in git); each environment is just a
different connection target** for that same schema.

## Topology

- **`local`** = where you develop **and test** — the Docker stack (`supabase start` / `supabase db reset`).
  Its keys are the well-known local dev keys (not secret).
- **`prod`** (ris-dev, self-hosted) = the **VPS-hosted Supabase** at `https://ops.gordi.id/mos`. Its DB connection
  string is a **secret, stored in 1Password** (vault `AS`). Deployment: later, Phase 3-1, owner-gated.

## Registry (current)

| Env | Supabase instance | API URL | Anon key | Frontend | Migrations | Seed |
|---|---|---|---|---|---|---|
| `local` | Docker (gordi-mos) | `http://127.0.0.1:44321` | local key in `mos-app/.env` | `npm run dev` from `mos-app/` | `supabase db reset` | `seed.sql` (auto) |
| `prod` (ris-dev) | self-hosted VPS | `https://ops.gordi.id/mos` | anon key in host env vars | TBD (Phase 3-1) | `supabase db push --db-url …@ris-dev` | reference data only (no demo seed) |

## Which command hits which target

| Command | Target | Notes |
|---|---|---|
| `supabase start -x edge-runtime` | **local** Docker | dev + test DB on `127.0.0.1:44322`; `-x edge-runtime` avoids CI flake |
| `supabase db reset` | **local** Docker | re-applies migrations + runs `seed.sql` locally |
| `supabase test db` | **local** Docker | pgTAP suite (needs pristine base) |
| `supabase login` / `link` | account / repo↔cloud pointer | no DB touched |
| future: `supabase db push --db-url …@ris-dev` | **prod** (self-hosted) | secret via 1Password; explicit `--db-url`; typed confirm |

## Local stack setup

**Project ID:** `gordi-mos` (in `config.toml`). Ports are remapped **+1000** from Supabase defaults so
the gordi stack can run **alongside the pmo-portal stack** (which holds the defaults):
- **API:** 44321  ·  **DB:** 44322  ·  **Studio:** 44323  ·  **Mailpit:** 44324  ·  **Analytics:** 44327  ·  **Pooler:** 44329  ·  **Shadow:** 44320

**Local DB URL:** `postgresql://postgres:postgres@127.0.0.1:44322/postgres`

**Start:** from repo root, run `supabase start -x edge-runtime` (the `-x edge-runtime` flag avoids a CI 502 flake; CI also excludes it). For migration/seed/pgTAP detail see `supabase/README.md`.

## Secrets via 1Password (`op-get.sh`)

The prod DB connection string is a secret. It is **never** stored in a file in the repo. Instead it lives in
1Password (vault `AS`) and is fetched at runtime by `op-get.sh <item> <vault> <field>`, which loads the
1Password service-account token itself (from `~/.op-token`).

**Resend prod key** (email SMTP, OD-P1-11): stored in 1Password vault `AS`. Committed non-secret coordinates: `supabase/op.resend.env` (cross-ref for the full SMTP env table in `supabase/README.md` §Production email). **NEVER commit a key into the repo.**

## Production deploy (ris-dev, self-hosted) — later (Phase 3-1, owner-gated)

Target: `https://ops.gordi.id/mos`, served via Caddy at base path `/mos`. One self-hosted Supabase instance (shared with future Gordi ops apps) via schemas `shared` / `mos` / `ops` / `integrations` (OD-DIR-3 — schema separation, not project separation).

Prod email = **Resend** (full SMTP env table in `supabase/README.md` §Production email — cross-ref, do NOT duplicate).

**Security hardening before prod exposure** (from `docs/backlog.md` L5 checklist):
- Disable open signup on both keys (verify with a live self-signup probe expecting 422)
- Raise password policy (≥8 + lower_upper_letters_digits)
- Set session timebox (~24h) + inactivity_timeout
- Tight CSP · configure prod Resend SMTP

**Production deploy / irreversible infra = owner approval only.**

## Local stack hygiene — parallel / multi-worktree development (binding)

The local Supabase stack is **one shared Docker stack keyed by `config.toml` `project_id` (`gordi-mos`)** — every gordi
worktree drives the SAME stack. **#1 parallel-dev footgun:** `db reset` is **global, not per-worktree** — running it from
worktree A re-applies A's migrations+seed to the single shared DB, clobbering worktree B's state.

**Discipline:**
- **Serialize all DB-driving work** (migrations, `supabase test db`/pgTAP, Playwright e2e) across worktrees. Know which worktree's
  migrations are applied before trusting a DB result.
- **Never run two DB-driving tasks concurrently** — even across worktrees they corrupt each other.
- **FE-only work** (vitest is mocked, typecheck, lint, build) needs NO stack and parallelizes freely.
- **pgTAP needs a pristine base** — always `db reset` BETWEEN an e2e run and pgTAP, or false pgTAP failures result.

**RAM / disk cleanup:** Stop the stack when not DB-testing — it's multi-GB. **`supabase stop` is a PARTIAL stop** (can leave the core db container up); to fully release RAM use **`supabase stop --no-backup`** or `docker stop $(docker ps -q --filter name=gordi-mos)`. Close browsers after every rendered check (`agent-browser close` / kill stray Chromium + `@playwright/mcp` servers) — they accumulate and, with the stack + the Electron app, have crashed the app at >20 GB, killing in-flight agent runs. Reclaim Docker disk periodically: `docker container prune` + `docker image prune` are safe (only STOPPED containers / DANGLING images; never a running stack or its volumes). ⚠ This host ALSO runs **pmo-portal's stack** — `docker container prune` spares its running containers, but **NEVER** `docker volume prune` or `docker system prune --volumes` (that destroys other projects' DB data). Prune merged worktrees promptly (`git worktree remove --force <path>` then `git worktree prune`).
