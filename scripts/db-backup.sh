#!/usr/bin/env bash
# Nightly production database dump (cron): pg_dump custom format into a local directory, verified
# readable with pg_restore --list before anything older is pruned. Any failure alerts through the
# Telegram notifier. Coordinates come from the untracked env file (scripts/ops.env.example).
#
#   30 19 * * * /path/to/scripts/db-backup.sh >> ~/db-backup.log 2>&1
#
# The credential is read by libpq from PGPASSFILE; it never appears in argv.
# Self-test: scripts/db-backup.test.sh
set -u -o pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/ops-common.sh
. "$HERE/lib/ops-common.sh" || { echo "db-backup: lib/ops-common.sh missing" >&2; exit 2; }

ops_load_env db-backup || exit 2
ops_require db-backup TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID OPS_DB_HOST OPS_DB_PORT OPS_DB_NAME \
  PGPASSFILE OPS_BACKUP_DIR || exit 2
DB_USER="${OPS_BACKUP_DB_USER:-${OPS_DB_USER:-}}"
[ -n "$DB_USER" ] || { echo "db-backup: refusing to run, missing in $OPS_ENV_FILE: OPS_BACKUP_DB_USER or OPS_DB_USER" >&2; exit 2; }
KEEP_DAYS="${OPS_BACKUP_KEEP_DAYS:-14}"
[[ "$KEEP_DAYS" =~ ^[0-9]+$ ]] && [ "$KEEP_DAYS" -ge 1 ] || { echo "db-backup: OPS_BACKUP_KEEP_DAYS must be a positive integer" >&2; exit 2; }

umask 077
mkdir -p "$OPS_BACKUP_DIR" || { echo "db-backup: cannot create OPS_BACKUP_DIR" >&2; exit 2; }

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
final="$OPS_BACKUP_DIR/mos-$stamp.dump"
part="$final.partial"
errf="$(mktemp)"; trap 'rm -f "$errf" "$part"' EXIT

fail() { # stage
  local tail
  tail="$(ops_scrub < "$errf" | tail -n 3 | tr '\n' ' ' | head -c 300)"
  ops_notify "❌ db-backup FAILED at ${1} ($(date '+%H:%M WIB')): ${tail}" || true
  echo "db-backup: FAILED at $1" >&2
  exit 1
}

echo "--- db-backup START: $(date) ---"
pg_dump --format=custom --no-password -h "$OPS_DB_HOST" -p "$OPS_DB_PORT" -U "$DB_USER" \
  -d "$OPS_DB_NAME" -f "$part" 2>"$errf" </dev/null || fail "dump"

# A dump that cannot list its own table of contents is not a backup: stop before pruning.
entries="$(pg_restore --list "$part" 2>"$errf" </dev/null | grep -vc '^;')" || true
[[ "$entries" =~ ^[0-9]+$ ]] && [ "$entries" -gt 0 ] || fail "verify (dump lists no entries)"

mv "$part" "$final" || fail "rename"
find "$OPS_BACKUP_DIR" -maxdepth 1 -type f -name 'mos-*.dump' -mtime +"$KEEP_DAYS" -delete 2>"$errf" || fail "prune"

echo "--- db-backup END: $(date) $(basename "$final") entries=$entries ---"
