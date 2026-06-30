# ESB warehouse online (Tencent VPS) — reference (for future agents)

**Status:** ONLINE since 2026-06-30 (ADR-0010 2026-06-30 amendment A1–A3). This doc exists so no future
agent re-derives the box coordinates, the op secret map, or the cron/observability wiring from scratch.
Authority for the *decision*: `docs/adr/0010-…` (amendment) + `docs/decisions.md` OD-P4-2 (the `reporting`
read-model the snapshot feeds). De-reference firewall: these are integration/infra coordinates, not
external design references.

## TL;DR
- The **OLAP ESB warehouse** (`gordi-esb-bak` repo / `gordi-esb-pg` Postgres) now runs **online on the
  Tencent VPS** (`tencent-OpenClaw`), co-located with the agentic layer (OpenClaw + vault MCP), **off** the
  OLTP box (`ris-dev`) per ADR-0010 D2's isolation rule.
- **Postgres 17.10** (matches MOS Supabase `major_version=17`), container `gordi-esb-pg` at
  `~/gordi-esb-pg/`, **bound `127.0.0.1:5432` only** (verified not externally reachable), `mem_limit 1g`,
  `shared_buffers 256MB`. DB `gordi_esb`, role `gordi`.
- **Self-sustaining:** nightly sync at **03:05 Asia/Jakarta** (cooperative — defers if load/RAM high) via
  `op run --env-file` (all ESB creds resolve from the **`Gordi` op vault** at runtime; no secrets at rest).
- **Monitored:** `resource-watch.sh` (every 10 min) + a CloudMonitor→Telegram webhook receiver.
- **Rebuildable from ESB → no backup** (the human-curated review tables were dropped; that workflow moves
  into MOS OLTP later, where ADR-0010 D7's R2 backup covers it).
- **Next track (NOT built):** the `reporting` migration + warehouse→Supabase snapshot job that feeds the
  sales dashboard (ADR-0017 D3 / OD-P4-2).

## Box coordinates
| Field | Value |
|---|---|
| Host | `tencent-OpenClaw` — `arief@43.153.213.28` (the SSH alias may not resolve non-interactively; use the raw IP + default key). Singapore, ~3.7 GB / 2 vCPU, Ubuntu 24.04 |
| Warehouse dir | `~/gordi-esb-pg/` (compose + `pgdata/` bind-mount + the watch scripts) |
| Sync repo | `~/gordi-esb-bak/` — **tarball copy, NO `.git`** (see Open items: needs a deploy key for `git pull`); venv at `sync/venv` (py3.12) |
| Container | `gordi-esb-pg`, `postgres:17-alpine`, `127.0.0.1:5432->5432`, `mem_limit 1g`, `shm 256mb`, `shared_buffers 256MB` |
| DB | `gordi_esb` / role `gordi` (superuser). Password **empty** — auth via pg_hba trust on `127.0.0.1` + the docker subnet (see Security) |
| Size | ~579 MB (restored 2026-06-30 from the local PG16 warehouse via a 52 MB `-Fc` dump; row counts verified equal) |

## Secrets — the op convention (NEVER read `~/.op-token`/`.env`; use op)
- Tooling on the box: `op` at `/usr/bin/op`, `op-get.sh` at `~/.local/bin/op-get.sh`, token at `~/.op-token`.
- `op-get.sh <item> <vault> <field>` sources the token and runs `op item get … --reveal`. For `op run`,
  the cron wrapper does `set -a; source ~/.op-token; set +a` then `op run --env-file=.env -- …`.
- `~/gordi-esb-bak/.env` holds **`op://` references, not values** (resolved at runtime; nothing secret at rest).

### ESB → op coordinate map (vault `Gordi`)
| Env var | `op://` reference |
|---|---|
| `ESB_GKID_USERNAME` | `op://Gordi/esb-gkid/username` |
| `ESB_GKID_PASSWORD` | `op://Gordi/esb-gkid/password` |
| `ESB_GKID_STATIC_TOKEN` | `op://Gordi/esb-gkid-static-token/credential` |
| `ESB_GKI_USERNAME` | `op://Gordi/bzxyzfl27khr5eujxkzfoo64ia/username` (item `esb-gki (legacy)` — by ID; `()` is invalid in op:// URIs) |
| `ESB_GKI_PASSWORD` | `op://Gordi/bzxyzfl27khr5eujxkzfoo64ia/password` |
| `ESB_GKI_STATIC_TOKEN` | `op://Gordi/vbmlstaujtlhi64zd525f7vvde/credential` (item `esb-gki-static-token (legacy)`) |
| `ESB_GRI_USERNAME` | `op://Gordi/esb-gri/username` |
| `ESB_GRI_PASSWORD` | `op://Gordi/esb-gri/password` |
| `ESB_GRI_STATIC_TOKEN` | `op://Gordi/esb-gri-static-token/credential` |

`DB_*` point at the local container (`localhost:5432`, `gordi_esb`, `gordi`); `DB_PASSWORD` empty (trust).
`esb-staging`/`esb-staging-static-token` are the *kitchen-worker* coordinates (`docs/reference/esb-goo-integration.md`), **not** used by the warehouse sync.

## Cron (box TZ = Asia/Jakarta)
```
5 3 * * *     ~/gordi-esb-bak/scripts/esb-sync-cron.sh   >> ~/gordi-esb-bak/sync/logs/cron.log 2>&1
*/10 * * * *  ~/gordi-esb-pg/resource-watch.sh           >> ~/.openclaw/logs/resource-watch.log 2>&1
@reboot sleep 30 && python3 ~/gordi-esb-pg/cloudmonitor-webhook.py >> ~/.openclaw/logs/cloudmonitor-webhook.log 2>&1
```
- `esb-sync-cron.sh` — **cooperative guard** (aborts exit-0, no retry, if 1-min load > 2.0 **or** MemAvailable < 400 MB — OpenClaw is the latency-sensitive tenant), then `op run --env-file=.env -- bash scripts/run_sync.sh`. Staggered 5 min after the Sunday 03:00 wiki-refine job.
- Expected scoreboard: **21 ok, 2 fail** — the 2 are **expected**: `validate` (9 pre-existing ESB data-quality warnings — GL imbalances 2020, OMS date gaps; informational, not a sync failure) and `teable_push_display` (intentionally off — Teable is the sunsetting layer; `TEABLE_*` unset).

## Observability (ADR-0010 amendment A2)
- `~/gordi-esb-pg/resource-watch.sh` — every 10 min, **silent when healthy**; alerts on MemAvailable < 300 MB, active swap-in, 1-min load > 2.5, or a PG query running > 10 min.
- **Telegram delivery:** the `openclaw send` plugin is disabled, so the watch scripts read the bot token + approver chat id from `~/.openclaw/openclaw.json` and `curl` the Telegram Bot API. *(Posture note: token comes from `openclaw.json`, not op — fold into the `.env`→op cleanup someday.)*
- `~/gordi-esb-pg/cloudmonitor-webhook.py` — loopback receiver on `127.0.0.1:19876`; parses a Tencent CloudMonitor alarm payload → Telegram. **Not yet exposed** (see Open items).

## Security posture
- **Loopback only.** `docker port` + `ss` both show `127.0.0.1:5432`; no DNAT. An external TCP probe *appears* to connect (Tencent's edge ACKs SYNs on any port — a **false positive**), but a protocol-level probe gets **no Postgres response** → genuinely not reachable. Re-verify after any change with the Postgres SSLRequest probe (8 bytes `00 00 00 08 04 d2 16 2f` → real PG replies `S`/`N`; a hang = false positive).
- **pg_hba** (in-container) adds `host all all 172.18.0.0/16 trust` (the docker bridge) on top of the loopback trust rules; the catch-all stays `host all all all scram-sha-256`. Scoped to loopback + docker subnet — **not** world. Caveat: any *future* container on that bridge would get passwordless superuser; tighten to password auth (DB password in op) once the op service account has write access.

## Open items (owner / Director)
1. **🔴 MUST-FIX before exposing the CloudMonitor webhook:** `cloudmonitor-webhook.py` has **no inbound auth** — once routed through cloudflared it's an open Telegram-spam relay. Add a shared-secret check (secret path or header) first.
2. **CloudMonitor → Telegram (owner, 2 steps):** `sudo` add `alarm.asaid-lab.com → http://localhost:19876` to `/etc/cloudflared/config.yml` (root-owned) + `systemctl restart cloudflared`; then paste the callback URL into the Tencent CloudMonitor console. (Do #1 first.)
3. **Git on box is a tarball (no `.git`)** — future code updates need a deploy key / the GitHub key added so `git pull` works on the VPS.
4. **DB password in op (optional hardening):** op service account is read-only, so the DB falls back to pg_hba trust. To use password auth, grant the op SA write or create a `gordi-esb-warehouse-db` item manually, then `ALTER ROLE gordi` + reference it.
5. **`validate` 9 DQ warnings** — pre-existing ESB source-data issues (not our sync). Owner decides whether to surface as alerts or suppress (`gordi-esb-bak/OUTSTANDING.md`).
6. **Teable 401 root cause** — repo still reads `.env` directly; migrate to op (`gordi-esb-bak/OUTSTANDING.md` §5).
7. **`20-schema-*.sql` prefix collision** — two files share the `20` prefix; `apply-schema` re-applies one every run (harmless/idempotent). Rename `20a`/`20b` opportunistically.

## Verify (read-only)
```bash
ssh arief@43.153.213.28 'docker ps --filter name=gordi-esb-pg --format "{{.Status}} | {{.Ports}}"; \
  docker exec gordi-esb-pg psql -U gordi -d gordi_esb -tA -c "select current_setting(\"server_version\"), pg_size_pretty(pg_database_size(\"gordi_esb\"));"; \
  crontab -l | grep -E "esb-sync|resource-watch|cloudmonitor"'
```
