#!/usr/bin/env bash
# Production database deploy: preflight, fresh dump, confirm, push migrations, verify.
#
#   bash scripts/deploy-production.sh --dry-run
#   bash scripts/deploy-production.sh --confirm-production [--yes]
#
#   --dry-run             stop after the preflight (pending list, privileged-step probe); pushes nothing
#   --confirm-production  REQUIRED for anything that changes production; the script refuses without it
#   --yes                 skip the y/N prompt (default answer is No)
#
# Mirrors scripts/deploy-staging.sh: deploys origin/main only, dry run first, the connection string
# lives only in this process (read from the secret store, redacted from all output, password passed
# by PGPASSWORD and never in argv), and the result is verified after the push. Before any push it
# takes a fresh pg_dump and checks it lists; a dump that fails aborts the deploy.
# Coordinates (secret-store item names, dump directory) come from the untracked env file
# (scripts/ops.env.example, OPS_ENV_FILE). Never runs `supabase config push`, never deploys edge
# functions. App rollback and DB rollback: see the private production-launch runbook.
# Self-test: scripts/deploy-production.test.sh
{ set +x; } 2>/dev/null   # a traced run must not echo the connection string
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIG_DIR="${MIGRATIONS_DIR:-$ROOT/supabase/migrations}"
PATH="$PATH:$HOME/.local/bin:/opt/homebrew/opt/libpq/bin"
# shellcheck source=lib/ops-common.sh
. "$ROOT/scripts/lib/ops-common.sh"

DRY=0 YES=0 CONFIRM=0
for a in "$@"; do
  case "$a" in
    --dry-run) DRY=1 ;;
    --yes) YES=1 ;;
    --confirm-production) CONFIRM=1 ;;
    -h|--help) sed -n 2,10p "$0"; exit 0 ;;
    *) printf 'deploy-production: unknown option %s\n' "$a" >&2; exit 2 ;;
  esac
done

die() { printf '✗ deploy-production: %s\n' "$1" >&2; exit 1; }
say() { printf '%s\n' "$*"; }

if [ "$DRY" != 1 ] && [ "$CONFIRM" != 1 ]; then
  printf 'deploy-production: refusing to change production without --confirm-production (use --dry-run to preview)\n' >&2
  exit 2
fi

SECRETS=()
redact() {
  local line s
  while IFS= read -r line || [ -n "$line" ]; do
    for s in "${SECRETS[@]}"; do line="${line//"$s"/<redacted>}"; done
    printf '%s\n' "$line"
  done
}

errf="$(mktemp)"; dump=""
cleanup() { rm -f "$errf" "$errf.o"; [ -z "$dump" ] || rm -f "$dump.partial"; }
trap cleanup EXIT

for t in op-get.sh supabase psql pg_dump pg_restore git; do command -v "$t" >/dev/null 2>&1 || die "$t not found on PATH"; done

ops_load_env deploy-production || exit 1
ops_require deploy-production PRODUCTION_OP_ITEM PRODUCTION_OP_VAULT PRODUCTION_OP_FIELD OPS_PREDEPLOY_DUMP_DIR || exit 1

URL="$(op-get.sh "$PRODUCTION_OP_ITEM" "$PRODUCTION_OP_VAULT" "$PRODUCTION_OP_FIELD" 2>/dev/null </dev/null)" || die "op-get.sh could not read the production connection (is 1Password signed in?)"
[ -n "$URL" ] || die "the production connection string is empty"
rest="${URL#*://}"; hostpart="${rest#*@}"; host="${hostpart%%[:/?]*}"
userinfo=""; case "$rest" in *@*) userinfo="${rest%%@*}" ;; esac
user="${userinfo%%:*}"; pass=""; case "$userinfo" in *:*) pass="${userinfo#*:}" ;; esac
CONN="$URL"; PGPASSWORD=""
if [ -n "$pass" ]; then
  CONN="${URL%%://*}://${user}@${hostpart}"
  PGPASSWORD="$(printf '%b' "${pass//\%/\\x}")"
  export PGPASSWORD
fi
for s in "$URL" "$userinfo" "$pass" "$PGPASSWORD" "$user" "$host"; do [ "${#s}" -ge 3 ] && SECRETS+=("$s"); done

sqlq() { local o; if ! o="$(psql "$CONN" -X -At -v ON_ERROR_STOP=1 -c "$1" 2>"$errf" </dev/null)"; then redact < "$errf" >&2; return 1; fi; printf '%s' "$o"; }

say "PRODUCTION deploy from $(git -C "$ROOT" branch --show-current) @ $(git -C "$ROOT" rev-parse --short HEAD)"

# ── 1. Source: deploy exactly origin/main.
git -C "$ROOT" fetch -q origin main || die "git fetch failed"
[ "$(git -C "$ROOT" branch --show-current)" = main ] || die "run this from a checkout of main"
om="$(git -C "$ROOT" rev-parse --verify -q refs/remotes/origin/main)" || die "origin/main not found"
[ "$(git -C "$ROOT" rev-parse HEAD)" = "$om" ] || die "main is not at origin/main — update it first"
[ -z "$(git -C "$ROOT" status --porcelain -- supabase/migrations)" ] || die "supabase/migrations has uncommitted changes"

# ── 2. Dry run: the pending migration list (file names only).
set +e; out="$(supabase --workdir "$ROOT" db push --dry-run --db-url "$CONN" 2>&1 </dev/null)"; rc=$?; set -e
if [ "$rc" -ne 0 ]; then printf '%s\n' "$out" | redact >&2; die "supabase db push --dry-run failed (exit $rc)"; fi
pending=(); while IFS= read -r f; do [ -n "$f" ] && pending+=("$f"); done < <(printf '%s\n' "$out" | grep -oE '[0-9]{8,}_[A-Za-z0-9_.-]+\.sql' | sort -u || true)
if [ "${#pending[@]}" -eq 0 ]; then
  printf '%s\n' "$out" | grep -qi 'up to date' || die "could not read the pending migration list from the dry run"
  say "No pending migrations: production is up to date."
else
  say "Pending migrations (${#pending[@]}):"; printf '  %s\n' "${pending[@]}"
fi
say "Edge functions are never deployed by this script."

# ── 3. Privileged-step probe: only when a pending migration touches the authenticator role or storage policies.
probe=0
for f in "${pending[@]+"${pending[@]}"}"; do
  [ -f "$MIG_DIR/$f" ] || die "pending migration $f is not in supabase/migrations — check out the branch being deployed"
  if grep -Eiq 'alter[[:space:]]+role[[:space:]]+authenticator|on[[:space:]]+storage\.(objects|buckets)' "$MIG_DIR/$f"; then probe=1; fi
done
if [ "$probe" = 1 ]; then
  say "Probing privileged steps (rolled back)..."
  if ! psql "$CONN" -X -q -v ON_ERROR_STOP=1 >"$errf.o" 2>"$errf" <<'SQL'
begin;
alter role authenticator set pgrst.db_pre_request = 'api_private.check_request';
create policy zz_preflight_probe on storage.buckets as restrictive for all to authenticated using (true);
create policy zz_preflight_probe on storage.objects as restrictive for all to authenticated using (true);
rollback;
SQL
  then
    { cat "$errf.o" "$errf" | redact; } >&2; die "privileged-step probe failed — the deploy role cannot run these steps; nothing was pushed"
  fi
  left="$(sqlq "select count(*) from pg_policies where policyname='zz_preflight_probe'")" || die "could not confirm the probe rolled back"
  [ "$left" = 0 ] || die "probe left $left zz_preflight_probe policies behind — remove them before deploying"
  say "Probe ok, rolled back."
fi

if [ "$DRY" = 1 ]; then say "Dry run: stopping before dump and push."; exit 0; fi

# ── 4. Confirm, take a fresh dump, then push. A dump that does not list aborts the deploy.
if [ "${#pending[@]}" -gt 0 ]; then
  if [ "$YES" != 1 ]; then
    printf 'Apply %d migration(s) to PRODUCTION? [y/N] ' "${#pending[@]}" >&2
    ans=""; read -r ans || true
    case "$ans" in y|Y|yes|YES) ;; *) die "not confirmed — nothing was pushed" ;; esac
  fi
  umask 077; mkdir -p "$OPS_PREDEPLOY_DUMP_DIR" || die "cannot create OPS_PREDEPLOY_DUMP_DIR"
  dump="$OPS_PREDEPLOY_DUMP_DIR/pre-deploy-$(date -u +%Y%m%dT%H%M%SZ)-$(git -C "$ROOT" rev-parse --short HEAD).dump"
  say "Taking a fresh dump before the push..."
  if ! pg_dump --format=custom --no-password -d "$CONN" -f "$dump.partial" 2>"$errf" </dev/null; then
    redact < "$errf" >&2; die "pre-push dump failed — nothing was pushed"
  fi
  entries="$(pg_restore --list "$dump.partial" 2>/dev/null </dev/null | grep -vc '^;')" || true
  [[ "$entries" =~ ^[0-9]+$ ]] && [ "$entries" -gt 0 ] || die "pre-push dump does not list — nothing was pushed"
  mv "$dump.partial" "$dump"
  say "Dump verified ($entries entries): $dump"
  set +e; out="$(supabase --workdir "$ROOT" db push --yes --db-url "$CONN" 2>&1 </dev/null)"; rc=$?; set -e
  printf '%s\n' "$out" | redact
  [ "$rc" -eq 0 ] || die "supabase db push failed (exit $rc) — the pre-push dump is at $dump"
fi

# ── 5. Verify.
bad=0
fail() { printf '✗ VERIFY FAILED: %s\n' "$1" >&2; bad=1; }
newest="$(ls "$MIG_DIR" | grep -E '^[0-9]+_.*\.sql$' | sort | tail -1 | cut -d_ -f1)"
remote="$(sqlq "select max(version) from supabase_migrations.schema_migrations")" || remote="?"
[ "$remote" = "$newest" ] || fail "remote max migration version '$remote' != newest local '$newest'"
pre="skipped"
if grep -qs 'pgrst.db_pre_request' "$MIG_DIR"/*.sql; then
  cfg="$(sqlq "select coalesce(array_to_string(rolconfig, ','), '') from pg_roles where rolname='authenticator'")" || cfg=""
  case ",$cfg," in *,pgrst.db_pre_request=api_private.check_request,*) pre="set" ;; *) pre="MISSING"; fail "authenticator rolconfig lacks pgrst.db_pre_request=api_private.check_request" ;; esac
fi
tc="$(sqlq "select count(*) from shared.trusted_agent_clients")" || tc="?"
say "verify: max version $remote (newest local $newest) · db_pre_request $pre · trusted clients $tc"
[ "$bad" = 0 ] || die "verification failed — production is NOT in the expected state; the pre-push dump is the way back (private runbook)"
say "Production deploy complete."
