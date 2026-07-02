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
- **Monitored:** `resource-watch.sh` (every 10 min) is the active monitor. Tencent CloudMonitor webhook
  exposure is **deferred** for now; the local receiver exists only as an unexposed stub.
- **Rebuildable from ESB → no backup** (the human-curated review tables were dropped; that workflow moves
  into MOS OLTP later, where ADR-0010 D7's R2 backup covers it).
- **Reporting snapshot live on staging:** `reporting.sales_daily_revenue` is deployed to Supabase Cloud
  staging (`hvnwcsmkdeqmgqlbwflm`) and the warehouse→Supabase snapshot runs at **03:30 WIB** after the
  03:05 ESB sync. Manual live proof on 2026-07-02 upserted 191 rows; B2B/Roastery landed as
  `channel=B2B`, `esb_code=GRI`, `branch_code=GRI`, `branch_name=Gordi Roastery`.

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
30 3 * * *    ~/gordi-esb-bak/scripts/reporting-snapshot-cron.sh >> ~/gordi-esb-bak/sync/logs/reporting-snapshot.log 2>&1
*/10 * * * *  ~/gordi-esb-pg/resource-watch.sh           >> ~/.openclaw/logs/resource-watch.log 2>&1
@reboot sleep 30 && python3 ~/gordi-esb-pg/cloudmonitor-webhook.py >> ~/.openclaw/logs/cloudmonitor-webhook.log 2>&1
```
- `esb-sync-cron.sh` — **cooperative guard** (aborts exit-0, no retry, if 1-min load > 2.0 **or** MemAvailable < 400 MB — OpenClaw is the latency-sensitive tenant), then `op run --env-file=.env -- bash scripts/run_sync.sh`. Staggered 5 min after the Sunday 03:00 wiki-refine job.
- **Logging:** cron stdout/stderr appends to `~/gordi-esb-bak/sync/logs/cron.log`; `run_sync.sh` also
  tees to `sync/logs/run_sync.log` (rolling) and `sync/logs/run_sync-YYYY-MM-DD.log` (per-day,
  overwritten each run). First scheduled run verified 2026-07-01: cron fired at 03:05 WIB, completed at
  03:13:04 WIB, and wrote `--- esb-sync-cron END: 2026-07-01 03:13:04 WIB exit=1 ---` before same-day
  cleanup. Manual cron-path proof after cleanup verified 2026-07-01 16:07-16:16 WIB:
  `22 ok, 0 fail, 0 skip`, `run_sync END`, and `--- esb-sync-cron END: 2026-07-01 16:16:55 WIB exit=0 ---`.
- Expected scoreboard after 2026-07-01 cleanup: **22 ok, 0 fail** on a normal non-sweep day if ESB
  endpoints are healthy. `teable_push_display` was removed from `run_sync.sh` because Teable
  display-table push is retired. `sync.validate` now separates **blocking sync-health errors** from
  **non-blocking ESB-source/business warnings**; host-side validation verified 2026-07-01 with
  `7 issue(s) found (0 blocking)` and exit code 0.
- Same-day investigation refreshed two stale warehouse slices (`GKID` OMS 2026-06-28 and `GKID` GL
  2026-06); this cleared the false OMS gap and the GL-vs-OMS June revenue warning. Four OMS gaps
  (`2025-03-01`, `2025-03-31`, `2026-02-19`, `2026-03-21`) were checked against live ESB and returned
  zero rows; the two March 31/21 dates also align with Eid al-Fitr holidays. Remaining non-blocking
  warnings are: three GKI Oct-Dec 2020 GL imbalances that match ESB live debit/credit totals exactly,
  GKI May/June 2020 negative gross margins that match ESB live GL revenue/COGS exactly, GKI
  balance-sheet imbalance derived from those GL balances, and GKID AP days >365 driven by AP balance vs
  trailing-12-month COGS.
- `reporting-snapshot-cron.sh` — runs after the warehouse sync and writes the trailing 60-day window to
  staging Supabase via op-injected credentials. Because the staging direct DB URL is IPv6-only from the
  VPS, the wrapper derives an IPv4 session-pooler DSN in memory from the op URL field and never writes
  or prints the password. Logs append to `sync/logs/reporting-snapshot.log`. Manual proof on
  2026-07-02 11:54 WIB: `reporting_snapshot END rows=191 window_days=60 contract=v_daily_revenue_unified.v1`
  and staging query showed `B2B / GRI / GRI / Gordi Roastery` (39 daily rows in the 60-day window,
  112 transactions, `263860642.93` clean revenue).

## Observability (ADR-0010 amendment A2)
- `~/gordi-esb-pg/resource-watch.sh` — every 10 min, **silent when healthy**; alerts on MemAvailable < 300 MB, active swap-in, 1-min load > 2.5, or a PG query running > 10 min.
- **Telegram delivery:** the `openclaw send` plugin is disabled, so the watch scripts read the bot token + approver chat id from `~/.openclaw/openclaw.json` and `curl` the Telegram Bot API. *(Posture note: token comes from `openclaw.json`, not op — fold into the `.env`→op cleanup someday.)*
- **CloudMonitor deferred:** Tencent CloudMonitor is not required for the lean current setup because
  `resource-watch.sh` already covers the practical VPS signals. `~/gordi-esb-pg/cloudmonitor-webhook.py`
  exists and listens on `127.0.0.1:19876`, but `alarm.asaid-lab.com` is not routed and no Tencent
  callback is live. Do **not** expose it unless/until there is a real need for Tencent host-level alarms;
  if revived, add inbound auth first.

## Security posture
- **Loopback only.** `docker port` + `ss` both show `127.0.0.1:5432`; no DNAT. An external TCP probe *appears* to connect (Tencent's edge ACKs SYNs on any port — a **false positive**), but a protocol-level probe gets **no Postgres response** → genuinely not reachable. Re-verify after any change with the Postgres SSLRequest probe (8 bytes `00 00 00 08 04 d2 16 2f` → real PG replies `S`/`N`; a hang = false positive).
- **pg_hba** (in-container) adds `host all all 172.18.0.0/16 trust` (the docker bridge) on top of the loopback trust rules; the catch-all stays `host all all all scram-sha-256`. Scoped to loopback + docker subnet — **not** world. Caveat: any *future* container on that bridge would get passwordless superuser; tighten to password auth (DB password in op) once the op service account has write access.

## Open items (owner / Director)
1. **Add sync success/failure alerting:** logging exists, but no external dead-man/success-failure alert
   is wired yet. Lean default: Healthchecks or a small Telegram summary on `esb-sync-cron.sh` completion.
2. **CloudMonitor deferred:** do not create `alarm.asaid-lab.com` or expose the webhook now. If revived,
   first add a shared-secret/header check to `cloudmonitor-webhook.py`; otherwise it becomes an open
   Telegram relay.
3. **Git on box is a tarball (no `.git`)** — future code updates need a deploy key / the GitHub key added so `git pull` works on the VPS.
4. **DB password in op (optional hardening):** op service account is read-only, so the DB falls back to pg_hba trust. To use password auth, grant the op SA write or create a `gordi-esb-warehouse-db` item manually, then `ALTER ROLE gordi` + reference it.
5. **`20-schema-*.sql` prefix collision** — two files share the `20` prefix; `apply-schema` re-applies one every run (harmless/idempotent). Rename `20a`/`20b` opportunistically.

## Verify (read-only)
```bash
ssh arief@43.153.213.28 'docker ps --filter name=gordi-esb-pg --format "{{.Status}} | {{.Ports}}"; \
  docker exec gordi-esb-pg psql -U gordi -d gordi_esb -tA -c "select current_setting(\"server_version\"), pg_size_pretty(pg_database_size(\"gordi_esb\"));"; \
  crontab -l | grep -E "esb-sync|resource-watch|cloudmonitor"'
```
