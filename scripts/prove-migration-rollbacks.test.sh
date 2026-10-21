#!/usr/bin/env bash
# Behaviour test for the CI rollback proof runner, isolated in a throwaway git repo.
set -euo pipefail

SCRIPT="$(cd "$(dirname "$0")" && pwd)/prove-migration-rollbacks.sh"
TEST_DIR="$(mktemp -d "${TMPDIR:-/tmp}/migration-rollback-proof.XXXXXXXX")"
trap 'rm -rf "$TEST_DIR"' EXIT
mkdir -p "$TEST_DIR/bin" "$TEST_DIR/psql-log"
export FAKE_DOCKER_LOG_DIR="$TEST_DIR/psql-log"
cat > "$TEST_DIR/bin/docker" <<'DOCKER'
#!/usr/bin/env bash
set -euo pipefail
[[ " $* " == *" exec -i "* && " $* " == *" psql "* && " $* " == *" ON_ERROR_STOP=1 "* && " $* " == *" -f - "* ]] \
  || { echo "fake docker received unsafe psql args: $*" >&2; exit 90; }
count="$(find "$FAKE_DOCKER_LOG_DIR" -type f -name 'call.*.sql' | wc -l | tr -d ' ')"
call="$FAKE_DOCKER_LOG_DIR/call.$((count + 1)).sql"
cat > "$call"
if grep -q 'FAIL_ROLLBACK' "$call"; then
  echo 'simulated rollback SQL error' >&2
  exit 1
fi
if grep -q 'FAIL_MIGRATION' "$call"; then
  echo 'simulated migration SQL error' >&2
  exit 1
fi
DOCKER
chmod +x "$TEST_DIR/bin/docker"
export PATH="$TEST_DIR/bin:$PATH"
cd "$TEST_DIR"
git init -q -b dev
git config user.email test@example.test
git config user.name test
mkdir -p supabase/migrations supabase/rollbacks
printf '%s\n' 'select 0; -- base migration' > supabase/migrations/20260101000000_base.sql
git add -A && git commit -qm base
BASE="$(git rev-parse HEAD)"
printf '%s\n' '-- DOWN: restore the pre-b migration state.' 'select 2; -- rollback b' > supabase/rollbacks/20260101000002_b.sql
printf '%s\n' '-- DOWN: restore the pre-a migration state.' 'select 1; -- rollback a' > supabase/rollbacks/20260101000001_a.sql
printf '%s\n' 'select 1; -- migration a' > supabase/migrations/20260101000001_a.sql
printf '%s\n' 'select 2; -- migration b' > supabase/migrations/20260101000002_b.sql
printf '%s\n' '-- DOWN: handled manually, no executable rollback.' 'select 3; -- manual-only migration' > supabase/migrations/20260101000003_manual.sql
git add -A && git commit -qm 'new migrations and rollback files'

pass=0
assert() {
  local label="$1" condition="$2"
  if ! eval "$condition"; then
    echo "FAIL $label" >&2
    exit 1
  fi
  echo "ok   $label"
  pass=$((pass + 1))
}
clear_log() { rm -f "$FAKE_DOCKER_LOG_DIR"/call.*.sql; }
call_count() { find "$FAKE_DOCKER_LOG_DIR" -type f -name 'call.*.sql' | wc -l | tr -d ' '; }

clear_log
rc=0
out="$(bash "$SCRIPT" "$BASE" fake-db 2>&1)" || rc=$?
assert 'rolls back in reverse order and reapplies in migration order' '[ "$rc" -eq 0 ] && [ "$(call_count)" -eq 4 ] && grep -q "rollback b" "$FAKE_DOCKER_LOG_DIR/call.1.sql" && grep -q "rollback a" "$FAKE_DOCKER_LOG_DIR/call.2.sql" && grep -q "migration a" "$FAKE_DOCKER_LOG_DIR/call.3.sql" && grep -q "migration b" "$FAKE_DOCKER_LOG_DIR/call.4.sql"'
assert 'header-only DOWN migration is reported unproven without failing' '[ "$rc" -eq 0 ] && grep -q "UNPROVEN.*20260101000003_manual.sql" <<< "$out"'
assert 'only migrations newer than base latest are processed' '[ "$(call_count)" -eq 4 ] && ! grep -q "base migration" "$FAKE_DOCKER_LOG_DIR"/call.*.sql'

printf '%s\n' '-- DOWN: restore the pre-wide migration state.' 'select 4; -- rollback wide' > supabase/rollbacks/202601010000001_wide.sql
printf '%s\n' 'select 4; -- migration wide' > supabase/migrations/202601010000001_wide.sql
git add -A && git commit -qm 'include numeric migration prefix wider than 14 digits'
clear_log
rc=0
out="$(bash "$SCRIPT" "$BASE" fake-db 2>&1)" || rc=$?
assert 'numeric migration prefixes wider than 14 digits are proven' '[ "$rc" -eq 0 ] && [ "$(call_count)" -eq 6 ] && grep -q "rollback wide" "$FAKE_DOCKER_LOG_DIR/call.1.sql" && grep -q "migration wide" "$FAKE_DOCKER_LOG_DIR/call.6.sql"'

clear_log
printf '%s\n' '-- DOWN: executable rollback.' 'select 1; -- FAIL_ROLLBACK' > supabase/rollbacks/20260101000001_a.sql
rc=0
out="$(bash "$SCRIPT" "$BASE" fake-db 2>&1)" || rc=$?
assert 'rollback SQL error fails closed before later commands' '[ "$rc" -ne 0 ] && [ "$(call_count)" -eq 3 ] && grep -q "rollback proof failed" <<< "$out"'
printf '%s\n' '-- DOWN: restore the pre-a migration state.' 'select 1; -- rollback a' > supabase/rollbacks/20260101000001_a.sql

clear_log
printf '%s\n' 'select 1; -- FAIL_MIGRATION' > supabase/migrations/20260101000001_a.sql
rc=0
out="$(bash "$SCRIPT" "$BASE" fake-db 2>&1)" || rc=$?
assert 'reapply SQL error fails closed before later migrations' '[ "$rc" -ne 0 ] && [ "$(call_count)" -eq 4 ] && grep -q "migration reapply failed" <<< "$out"'

printf '%s\n' 'select 5; -- no DOWN header or rollback' > supabase/migrations/202601010000004_missing.sql
git add -A && git commit -qm 'include migration without rollback path'
clear_log
rc=0
out="$(bash "$SCRIPT" "$BASE" fake-db 2>&1)" || rc=$?
assert 'migration with neither rollback nor DOWN header fails before SQL' '[ "$rc" -ne 0 ] && [ "$(call_count)" -eq 0 ] && grep -q "202601010000004_missing.sql" <<< "$out"'

rc=0
out="$(bash "$SCRIPT" no-such-base fake-db 2>&1)" || rc=$?
assert 'unknown base ref fails before running SQL' '[ "$rc" -ne 0 ] && grep -q "unknown ref" <<< "$out"'

echo "$pass/8 passed"
