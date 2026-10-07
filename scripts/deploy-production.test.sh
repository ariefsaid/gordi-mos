#!/usr/bin/env bash
# Self-test for scripts/deploy-production.sh. op-get.sh, supabase, psql, pg_dump, pg_restore and git
# are PATH shims that record their calls; no database or network is touched. Every refusal case
# asserts the dump and the push did NOT happen, so each check can fail.
set -uo pipefail
cd "$(dirname "$0")/.."
SCRIPT="$(pwd)/scripts/deploy-production.sh"
tmp="$(mktemp -d -t deployprod.XXXXXX)"; trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0
ok()  { pass=$((pass+1)); printf '  ok    %s\n' "$1"; }
bad() { fail=$((fail+1)); printf '  FAIL  %s\n' "$1"; }

SECRET_PW='p4ssw0rdZZ'
SECRET_HOST='db.fakehost-zz.example.test'
SECRET_URL="postgresql://deployer:${SECRET_PW}@${SECRET_HOST}:5432/postgres"
ROOT_REPO="$(pwd -P)"; calls="$tmp/calls"; argvlog="$tmp/argv"; allout="$tmp/allout"; : > "$allout"; : > "$argvlog"
mkdir -p "$tmp/bin" "$tmp/mig"

cat > "$tmp/bin/op-get.sh" <<'SH'
#!/usr/bin/env bash
printf 'op-get %s\n' "$*" >> "$CALLS"
[ "${FAKE_OP_FAIL:-}" = 1 ] && { echo "not signed in" >&2; exit 1; }
printf '%s\n' "$FAKE_URL"
SH
cat > "$tmp/bin/supabase" <<'SH'
#!/usr/bin/env bash
printf 'argv supabase %s\npgpw %s\n' "$*" "${PGPASSWORD:-}" >> "$ARGVLOG"
case "$*" in
  *--dry-run*) printf 'supabase dry-run\n' >> "$CALLS"
    echo "Connecting to $FAKE_URL"
    if [ "${FAKE_DRY_RC:-0}" != 0 ]; then echo "failed to connect to host=$FAKE_HOST user=deployer" >&2; exit "$FAKE_DRY_RC"; fi
    printf '%s\n' "${FAKE_DRY_OUT}" ;;
  *"db push"*) printf 'supabase push\n' >> "$CALLS"; echo "Finished supabase db push." ;;
  *"functions deploy"*) printf 'supabase functions-deploy\n' >> "$CALLS" ;;
  *"config push"*) printf 'supabase config-push\n' >> "$CALLS" ;;
esac
SH
cat > "$tmp/bin/psql" <<'SH'
#!/usr/bin/env bash
printf 'argv psql %s\npgpw %s\n' "$*" "${PGPASSWORD:-}" >> "$ARGVLOG"
sql="$*"; stdin=""; case "$sql" in *" -c "*) ;; *) stdin="$(cat)" ;; esac
case "$sql$stdin" in
  *zz_preflight_probe*"create policy"*|*"create policy"*zz_preflight_probe*) printf 'psql probe\n' >> "$CALLS"
    [ "${FAKE_PROBE_RC:-0}" = 0 ] || { echo "permission denied for $FAKE_HOST" >&2; exit 3; } ;;
  *"count(*) from pg_policies"*) echo "${FAKE_LEFT:-0}" ;;
  *"max(version)"*) echo "${FAKE_MAX:-20260101000002}" ;;
  *rolconfig*) echo "${FAKE_ROLCONFIG:-pgrst.db_pre_request=api_private.check_request}" ;;
  *trusted_agent_clients*) echo "${FAKE_TRUSTED:-0}" ;;
esac
SH
cat > "$tmp/bin/git" <<'SH'
#!/usr/bin/env bash
c=""; [ "${1:-}" = -C ] && { c="$2"; shift 2; }
printf 'git %s\n' "$*" >> "$CALLS"
case "$*" in
  "branch --show-current") echo "${FAKE_BRANCH:-main}" ;;
  "rev-parse --short HEAD") echo abc1234 ;;
  "rev-parse HEAD") echo "${FAKE_HEAD:-aaaa}" ;;
  *refs/remotes/origin/main*) echo "${FAKE_ORIGIN_MAIN:-aaaa}" ;;
  "status --porcelain"*) printf '%s' "${FAKE_DIRTY:-}" ;;
esac
exit 0
SH
chmod +x "$tmp"/bin/*
# Shared dump fakes keep staging and production self-tests on the same backup contract.
. scripts/lib/ops-db-dump-test-shims.sh
ops_test_install_db_dump_shims "$tmp/bin"

printf 'create table t();\n' > "$tmp/mig/20260101000001_plain.sql"
printf "alter role authenticator set pgrst.db_pre_request = 'api_private.check_request';\n" > "$tmp/mig/20260101000002_gate.sql"
mkenv() { # omit list
  local omit=" $* " k v; : > "$tmp/ops.env"
  while IFS='=' read -r k v; do case "$omit" in *" $k "*) continue ;; esac; printf '%s=%s\n' "$k" "$v" >> "$tmp/ops.env"; done <<EOT
PRODUCTION_OP_ITEM=fake-item
PRODUCTION_OP_VAULT=fake-vault
PRODUCTION_OP_FIELD=FAKE
OPS_PREDEPLOY_DUMP_DIR=$tmp/dumps
EOT
}
mkenv

run() { # NAME EXPECT_RC STDIN [ENV=val ...] -- args
  local name="$1" want="$2" input="$3"; shift 3
  local envs=(); while [ "$#" -gt 0 ] && [ "$1" != -- ]; do envs+=("$1"); shift; done; shift
  : > "$calls"; : > "$argvlog"
  out="$(printf '%s' "$input" | env PATH="$tmp/bin:$PATH" CALLS="$calls" ARGVLOG="$argvlog" FAKE_URL="$SECRET_URL" FAKE_HOST="$SECRET_HOST" \
    FAKE_DRY_OUT="Would push these migrations:
 • 20260101000001_plain.sql
 • 20260101000002_gate.sql" \
    OPS_ENV_FILE="$tmp/ops.env" MIGRATIONS_DIR="$tmp/mig" HOME="$tmp" \
    "${envs[@]+"${envs[@]}"}" bash ${BASHX:-} "$SCRIPT" "$@" 2>&1)"; rc=$?
  printf '%s\n' "$out" >> "$allout"
  if [ "$rc" -eq "$want" ]; then ok "$name"; else bad "$name (rc=$rc, want $want)"; printf '%s\n' "$out" | sed 's/^/        /'; fi
}
called()     { grep -q "^$1" "$calls"; }
expect()     { if called "$2"; then ok "$1"; else bad "$1 (missing call: $2)"; fi; }
expect_not() { if called "$2"; then bad "$1 (unexpected call: $2)"; else ok "$1"; fi; }
has()        { if printf '%s' "$out" | grep -qF -- "$2"; then ok "$1"; else bad "$1 (output lacks: $2)"; fi; }
nothing_changed() { expect_not "$1: no dump" "pg_dump"; expect_not "$1: no push" "supabase push"; }

echo "refusals before any work"
run "no flag refuses" 2 ""
nothing_changed "no flag"; expect_not "no flag: secret store untouched" "op-get"
run "--yes alone refuses" 2 "" -- --yes
nothing_changed "--yes alone"; expect_not "--yes alone: secret store untouched" "op-get"
run "unknown option refused" 2 "" -- --force --confirm-production
for v in PRODUCTION_OP_ITEM PRODUCTION_OP_VAULT PRODUCTION_OP_FIELD OPS_PREDEPLOY_DUMP_DIR; do
  mkenv "$v"; run "missing $v refuses" 1 "" -- --confirm-production --yes
  has "missing $v is named" "$v"; nothing_changed "missing $v"; expect_not "missing $v: secret store untouched" "op-get"
done
mkenv; rm -f "$tmp/ops.env"
run "missing env file refuses" 1 "" -- --confirm-production --yes
nothing_changed "missing env file"; mkenv

echo "dry run"
run "--dry-run needs no confirmation flag" 0 "" -- --dry-run
expect "dry run called" "supabase dry-run"; expect "probe ran" "psql probe"
nothing_changed "--dry-run"

echo "happy path"
run "confirmed run with --yes succeeds" 0 "" -- --confirm-production --yes
expect "op-get called with the local coordinates" "op-get fake-item fake-vault FAKE"
expect "dump taken" "pg_dump"; expect "dump verified" "pg_restore-list"; expect "push called" "supabase push"
order="$(grep -E '^(supabase dry-run|pg_dump|pg_restore-list|supabase push)$' "$calls" | tr '\n' ' ')"
[ "$order" = "supabase dry-run pg_dump pg_restore-list supabase push " ] && ok "order: dry run, dump, verify dump, push" || bad "order was: $order"
has "verify line printed" "verify: max version 20260101000002 (newest local 20260101000002) · db_pre_request set · trusted clients 0"
[ -n "$(ls "$tmp/dumps" 2>/dev/null | grep -E '^pre-deploy-.*-abc1234\.dump$')" ] && ok "dump kept in the dump dir, named with the commit" || bad "no pre-deploy dump kept"
ls "$tmp/dumps" | grep -q partial && bad ".partial left behind" || ok "no .partial left behind"
expect_not "no function deploy" "supabase functions-deploy"; expect_not "no config push" "supabase config-push"

echo "secrecy"
if grep '^argv ' "$argvlog" | grep -qF "$SECRET_PW"; then bad "password appears in a command's argv"; else ok "password never in argv"; fi
grep -qx "pgpw $SECRET_PW" "$argvlog" && ok "password reaches commands via PGPASSWORD" || bad "PGPASSWORD not set"
grep -q '^argv pg_dump' "$argvlog" && ok "argv log recorded the dump call (check can fail)" || bad "dump argv not recorded"
BASHX=-x run "traced run still succeeds" 0 "" -- --confirm-production --yes
if grep -qF "$SECRET_PW" <<<"$out"; then bad "trace leaks the password"; else ok "bash -x does not leak the password"; fi
run "failed dry run" 1 "" FAKE_DRY_RC=7 -- --confirm-production --yes
if grep -qE "$SECRET_PW|$SECRET_HOST|postgresql://" "$allout"; then bad "connection string, password or host reached output"; else ok "connection string, password and host never reach output (all runs)"; fi

echo "stops before the push"
run "dry-run failure stops" 1 "" FAKE_DRY_RC=7 -- --confirm-production --yes
nothing_changed "dry-run failure"
run "dump failure aborts" 1 "" FAKE_DUMP_FAIL=1 -- --confirm-production --yes
expect "dump attempted" "pg_dump"; expect_not "no push after a failed dump" "supabase push"
run "an unlistable dump aborts" 1 "" FAKE_LIST_EMPTY=1 -- --confirm-production --yes
expect_not "no push after an unlistable dump" "supabase push"
ls "$tmp/dumps" 2>/dev/null | grep -q partial && bad "partial dump left after abort" || ok "no partial dump left after abort"
run "unreadable dry-run output refused" 1 "" FAKE_DRY_OUT="something odd" -- --confirm-production --yes
nothing_changed "unreadable dry run"
run "failed probe aborts" 1 "" FAKE_PROBE_RC=3 -- --confirm-production --yes
nothing_changed "failed probe"
run "probe leaving a policy behind aborts" 1 "" FAKE_LEFT=2 -- --confirm-production --yes
nothing_changed "leftover probe policy"
run "op-get failure stops" 1 "" FAKE_OP_FAIL=1 -- --confirm-production --yes
expect_not "no dry run without the secret" "supabase dry-run"
run "feature branch refused" 1 "" FAKE_BRANCH=feat/x -- --confirm-production --yes
expect_not "no dry run from a feature branch" "supabase dry-run"
run "HEAD behind origin/main refused" 1 "" FAKE_ORIGIN_MAIN=bbbb -- --confirm-production --yes
nothing_changed "stale main"
run "uncommitted migration changes refused" 1 "" FAKE_DIRTY=" M supabase/migrations/x.sql" -- --confirm-production --yes
nothing_changed "dirty migrations"

echo "confirmation"
run "default is No on empty input" 1 "" -- --confirm-production
nothing_changed "empty answer"
run "n is No" 1 "n
" -- --confirm-production
nothing_changed "n answer"
run "y confirms" 0 "y
" -- --confirm-production
expect "dump after y" "pg_dump"; expect "push after y" "supabase push"

echo "nothing pending"
run "up to date: no dump, no push" 0 "" FAKE_DRY_OUT="Remote database is up to date." -- --confirm-production --yes
nothing_changed "up to date"

echo "verify"
run "max-version mismatch fails" 1 "" FAKE_MAX=20260101000001 -- --confirm-production --yes
has "mismatch named" "VERIFY FAILED"
run "missing authenticator setting fails" 1 "" FAKE_ROLCONFIG="statement_timeout=8s" -- --confirm-production --yes
has "rolconfig named" "pgrst.db_pre_request"

printf '\n%s passed, %s failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
