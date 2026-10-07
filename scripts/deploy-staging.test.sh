#!/usr/bin/env bash
# Self-test for scripts/deploy-staging.sh. External commands are PATH/env shims; no remote database,
# network or GitHub is touched. Refusal cases assert the push (or PR) was NOT made.
set -uo pipefail
cd "$(dirname "$0")/.."
SCRIPT="$(pwd)/scripts/deploy-staging.sh"
tmp="$(mktemp -d -t deploystaging.XXXXXX)"
trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0
ok()  { pass=$((pass+1)); printf '  ok    %s\n' "$1"; }
bad() { fail=$((fail+1)); printf '  FAIL  %s\n' "$1"; }

SECRET_PW='p4ssw0rdZZ'
SECRET_HOST='db.abcdefghijklmnopqrst.supabase.co'
SECRET_PROJECT_REF='abcdefghijklmnopqrst'
SECRET_URL="postgresql://deployer:${SECRET_PW}@${SECRET_HOST}:5432/postgres"
FAKE_ACCESS_TOKEN='test-only-access-token'; export FAKE_ACCESS_TOKEN
ROOT_REPO="$(pwd -P)"; calls="$tmp/calls"; ARGVLOG="$tmp/argv"; : > "$ARGVLOG"; allout="$tmp/allout"; : > "$allout"
REAL_GREP="$(command -v grep)"; export REAL_GREP
mkdir -p "$tmp/bin" "$tmp/mig"

cat > "$tmp/bin/op-get.sh" <<'EOF'
#!/usr/bin/env bash
printf 'op-get %s\n' "$*" >> "$CALLS"
[ "${FAKE_OP_FAIL:-}" = 1 ] && { echo "not signed in" >&2; exit 1; }
case "$*" in
  *fake-function-item*) printf '%s\n' "$FAKE_ACCESS_TOKEN" ;;
  *) printf '%s\n' "$FAKE_URL" ;;
esac
EOF
cat > "$tmp/bin/supabase" <<'EOF'
#!/usr/bin/env bash
if [[ "$*" == *"${FAKE_PASSWORD:-}"* ]] && [ -n "${FAKE_PASSWORD:-}" ]; then printf 'argv supabase-secret\n' >> "$ARGVLOG"
else printf 'argv supabase-safe\n' >> "$ARGVLOG"; fi
# The token on argv is logged verbatim, so the "never reached argv log" checks can fail.
if [ -n "${FAKE_ACCESS_TOKEN:-}" ] && [[ "$*" == *"$FAKE_ACCESS_TOKEN"* ]]; then printf 'argv supabase-token %s\n' "$FAKE_ACCESS_TOKEN" >> "$ARGVLOG"; fi
if [ -n "${PGPASSWORD:-}" ]; then printf 'pgpw-set\n' >> "$ARGVLOG"; else printf 'pgpw-empty\n' >> "$ARGVLOG"; fi
case "$*" in
  *--dry-run*) printf 'supabase dry-run\n' >> "$CALLS"
    echo "Connecting to $FAKE_URL"
    if [ "${FAKE_DRY_RC:-0}" != 0 ]; then echo "failed to connect to host=$FAKE_HOST user=deployer" >&2; exit "$FAKE_DRY_RC"; fi
    printf '%s\n' "${FAKE_DRY_OUT}" ;;
  *"db push"*) printf 'supabase push\n' >> "$CALLS"; echo "Finished supabase db push."; exit "${FAKE_PUSH_RC:-0}" ;;
  *"functions deploy"*)
    fn=""; prev=""; project_ref=""
    smoke_host="${FAKE_URL#*@}"; smoke_host="${smoke_host%%[:/?]*}"
    smoke_ref="${smoke_host#db.}"; smoke_ref="${smoke_ref%.supabase.co}"
    for arg in "$@"; do
      case "$arg" in agent-chat|compose-view|mcp) fn="$arg" ;; esac
      [ "$prev" != --project-ref ] || project_ref="$arg"
      prev="$arg"
    done
    printf 'supabase functions-deploy %s\n' "$fn" >> "$CALLS"
    [ "$project_ref" != "$smoke_ref" ] || printf 'supabase project-ref-ok\n' >> "$CALLS"
    if IFS= read -r -t 0.1 _; then printf 'supabase deploy-stdin-open\n' >> "$CALLS"
    else printf 'supabase deploy-stdin-closed\n' >> "$CALLS"; fi
    if [ "${SUPABASE_ACCESS_TOKEN:-}" = "${FAKE_ACCESS_TOKEN:-}" ] && [ -n "${SUPABASE_ACCESS_TOKEN:-}" ]; then
      printf 'supabase token-env-ok\n' >> "$CALLS"
    fi
    [ -n "${PGPASSWORD:-}" ] || printf 'supabase db-password-not-forwarded\n' >> "$CALLS"
    for arg in "$@"; do [ "$arg" != --no-verify-jwt ] || printf 'supabase no-verify-jwt\n' >> "$CALLS"; done
    if [ "${FAKE_DEPLOY_RC:-0}" != 0 ]; then
      printf 'deployment rejected host=%s project=%s token=%s\n' "$FAKE_HOST" "$smoke_ref" "$FAKE_ACCESS_TOKEN" >&2
    fi
    exit "${FAKE_DEPLOY_RC:-0}" ;;
  *"config push"*) printf 'supabase config-push\n' >> "$CALLS" ;;
esac
EOF
cat > "$tmp/bin/curl" <<'EOF'
#!/usr/bin/env bash
printf 'argv curl %s\n' "$*" >> "$ARGVLOG"
config="$(cat)"
request="$(printf '%s\n' "$config" | sed -n 's/^request = "\(.*\)"$/\1/p' | tail -1)"
origin="$(printf '%s\n' "$config" | sed -n 's/^header = "Origin: \(.*\)"$/\1/p' | tail -1)"
body_file="" header_file=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output|-o) body_file="$2"; shift 2 ;;
    --dump-header|-D) header_file="$2"; shift 2 ;;
    *) shift ;;
  esac
done
case "$request" in
  POST)
    printf 'curl POST\n' >> "$CALLS"
    status="${FAKE_POST_STATUS:-401}"
    if [ "$status" = 401 ] && [ "${FAKE_POST_HANDLER:-1}" = 1 ]; then
      printf '{"error":"UNAUTHORIZED"}' > "$body_file"
    elif [ "$status" = 401 ]; then
      printf '{"code":"UNAUTHORIZED_NO_AUTH_HEADER","message":"Missing authorization header"}' > "$body_file"
    else
      printf 'not unauthorized' > "$body_file"
    fi
    ;;
  OPTIONS)
    printf 'curl OPTIONS\n' >> "$CALLS"
    status="${FAKE_OPTIONS_STATUS:-204}"
    echo_origin="$origin"; [ "${FAKE_CORS_MISMATCH:-0}" != 1 ] || echo_origin="mismatched"
    [ -z "$header_file" ] || printf 'HTTP/1.1 %s No Content\r\nAccess-Control-Allow-Origin: %s\r\n\r\n' "$status" "$echo_origin" > "$header_file"
    ;;
  *) exit 2 ;;
esac
printf '%s' "$status"
EOF
cat > "$tmp/bin/psql" <<'EOF'
#!/usr/bin/env bash
if [[ "$*" == *"${FAKE_PASSWORD:-}"* ]] && [ -n "${FAKE_PASSWORD:-}" ]; then printf 'argv psql-secret\n' >> "$ARGVLOG"
else printf 'argv psql-safe\n' >> "$ARGVLOG"; fi
if [ -n "${PGPASSWORD:-}" ]; then printf 'pgpw-set\n' >> "$ARGVLOG"; else printf 'pgpw-empty\n' >> "$ARGVLOG"; fi
sql="$*"; stdin=""; case "$sql" in *" -c "*) ;; *) stdin="$(cat)" ;; esac
case "$sql$stdin" in
  *zz_preflight_probe*"create policy"*|*"create policy"*zz_preflight_probe*) printf 'psql probe\n' >> "$CALLS"
    [ "${FAKE_PROBE_RC:-0}" = 0 ] || { echo "permission denied for $FAKE_HOST" >&2; exit 3; } ;;
  *"count(*) from pg_policies"*) echo "${FAKE_LEFT:-0}" ;;
  *"max(version)"*) echo "${FAKE_MAX:-20260101000002}" ;;
  *rolconfig*) echo "${FAKE_ROLCONFIG:-pgrst.db_pre_request=api_private.check_request}" ;;
  *trusted_agent_clients*) echo "${FAKE_TRUSTED:-0}" ;;
  *is_sample_org_shape*) echo "${FAKE_SAMPLE_ORGS:-1/1}" ;;
esac
EOF
cat > "$tmp/bin/git" <<'EOF'
#!/usr/bin/env bash
c=""; [ "${1:-}" = -C ] && { c="$2"; shift 2; }
printf 'git %s\n' "$*" >> "$CALLS"
case "$*" in
  "branch --show-current")
    if [ -z "$c" ] || [ "$c" = "$ROOT_REPO" ]; then echo "${FAKE_BRANCH:-main}"   # the checkout running the script
    elif [ -f "$c/.on-main" ]; then echo main; fi ;;                             # a temp worktree is on main only after checkout
  "rev-parse --short HEAD") echo abc1234 ;;
  "rev-parse HEAD") echo "${FAKE_HEAD:-aaaa}" ;;
  *refs/remotes/origin/main*) echo "${FAKE_ORIGIN_MAIN:-aaaa}" ;;
  "status --porcelain"*) printf '%s' "${FAKE_DIRTY:-}" ;;
  "rev-list --count"*) echo "${FAKE_AHEAD:-3}" ;;
  "diff --name-only"*) printf '%s' "${FAKE_FN_DIFF:-}" ;;
  "worktree list --porcelain") echo "worktree $tmp_main" ;;
  "worktree add"*) mkdir -p "${@: -2:1}"; echo "${@: -2:1}" > "$WTFILE" ;;
  "checkout -q --ignore-other-worktrees main") touch "$c/.on-main" ;;
esac
exit 0
EOF
cat > "$tmp/gh-post.sh" <<'EOF'
#!/usr/bin/env bash
# Only a call made from the temp worktree, with main checked out there, counts as a promotion.
if [ "$(pwd -P)" = "$(cd "$(cat "$WTFILE")" && pwd -P)" ] && [ -f .on-main ]; then printf 'gh-post %s\n' "$*" >> "$CALLS"
else printf 'gh-post-WRONG-CHECKOUT %s\n' "$*" >> "$CALLS"; fi
EOF
cat > "$tmp/bin/grep" <<'EOF'
#!/usr/bin/env bash
if [ "${FAKE_NO_ORIGINS:-0}" = 1 ] && [[ "$*" == *DEFAULT_APP_ORIGINS* ]]; then exit 1; fi
exec "$REAL_GREP" "$@"
EOF
chmod +x "$tmp"/bin/* "$tmp/gh-post.sh"
. scripts/lib/ops-db-dump-test-shims.sh
ops_test_install_db_dump_shims "$tmp/bin"

printf 'create table t();\n' > "$tmp/mig/20260101000001_plain.sql"
printf "alter role authenticator set pgrst.db_pre_request = 'api_private.check_request';\n" > "$tmp/mig/20260101000002_gate.sql"
printf 'STAGING_OP_ITEM=fake-item\nSTAGING_OP_VAULT=fake-vault\nSTAGING_OP_FIELD=FAKE\nSTAGING_FUNCTIONS_OP_ITEM=fake-function-item\nSTAGING_FUNCTIONS_OP_VAULT=fake-function-vault\nSTAGING_FUNCTIONS_OP_FIELD=FAKE_TOKEN\n' > "$tmp/op.env"
printf 'STAGING_OP_ITEM=fake-item\nSTAGING_OP_VAULT=fake-vault\nSTAGING_OP_FIELD=FAKE\n' > "$tmp/op-no-functions.env"

# run NAME EXPECT_RC STDIN [ENV=val ...] -- args   (sets $out; asserts rc)
run() {
  local name="$1" want="$2" input="$3"; shift 3
  local envs=(); while [ "$#" -gt 0 ] && [ "$1" != -- ]; do envs+=("$1"); shift; done; shift
  : > "$calls"
  out="$(printf '%s' "$input" | env PATH="$tmp/bin:$PATH" CALLS="$calls" ARGVLOG="$ARGVLOG" WTFILE="$tmp/wtfile" ROOT_REPO="$ROOT_REPO" FAKE_URL="$SECRET_URL" FAKE_HOST="$SECRET_HOST" FAKE_PASSWORD="$SECRET_PW" REAL_GREP="$REAL_GREP" \
    FAKE_DRY_OUT="Would push these migrations:
 • 20260101000001_plain.sql
 • 20260101000002_gate.sql" tmp_main="$tmp" \
    STAGING_OP_ENV_FILE="$tmp/op.env" MIGRATIONS_DIR="$tmp/mig" GH_POST="$tmp/gh-post.sh" HOME="$tmp" \
    STAGING_PREDEPLOY_DUMP_DIR="$tmp/dumps" \
    "${envs[@]+"${envs[@]}"}" bash ${BASHX:-} "$SCRIPT" "$@" 2>&1)"; rc=$?
  printf '%s\n' "$out" >> "$allout"
  if [ "$rc" -eq "$want" ]; then ok "$name"; else bad "$name (rc=$rc, want $want)"; printf '%s\n' "$out" | sed 's/^/        /'; fi
}
called()    { grep -q "^$1" "$calls"; }
expect()    { if called "$2"; then ok "$1"; else bad "$1 (missing call: $2)"; fi; }
expect_not() { if called "$2"; then bad "$1 (unexpected call: $2)"; else ok "$1"; fi; }
has()       { if printf '%s' "$out" | grep -qF -- "$2"; then ok "$1"; else bad "$1 (output lacks: $2)"; fi; }
hasnt()     { if printf '%s' "$out" | grep -qF -- "$2"; then bad "$1 (output has: $2)"; else ok "$1"; fi; }
before() { awk -v a="$1" -v b="$2" 'index($0,a)==1&&!sa{sa=NR} index($0,b)==1&&!sb{sb=NR} END{exit !(sa && (!sb || sa<sb))}' "$calls"; }

echo "happy path"
run "full run with --yes succeeds" 0 "" -- --yes
expect "op-get called with the local coordinates" "op-get fake-item fake-vault FAKE"
expect "dry run called" "supabase dry-run"
expect "probe ran (migration alters authenticator)" "psql probe"
expect "push called" "supabase push"
expect "promotion PR opened against staging, from a temp worktree on main" "gh-post pr create --base staging"
expect_not "gh-post never called from another checkout" "gh-post-WRONG-CHECKOUT"
expect "temp worktree checked out on main" "git checkout -q --ignore-other-worktrees main"
expect "PR made from a temp worktree" "git worktree add"
has "pending list printed" "20260101000002_gate.sql"
has "verify line printed" "verify: max version 20260101000002 (newest local 20260101000002) · db_pre_request set · trusted clients 0 · sample orgs 1/1"
expect_not "no function deploy" "supabase functions-deploy"
expect_not "no config push" "supabase config-push"

echo "secrecy"
BASHX=-x run "traced run (bash -x) still succeeds" 0 "" -- --yes
hasnt "trace does not leak the url" "$SECRET_PW"
run "failed dry run" 1 "" FAKE_DRY_RC=7 -- --yes
hasnt "failure output hides host" "$SECRET_HOST"
if grep -qE "$SECRET_PW|$SECRET_HOST|postgresql://" "$allout"; then bad "connection string, password or host reached stdout/stderr"; else ok "connection string, password and host never reach stdout/stderr (all runs)"; fi

echo "no secret in argv"
if grep -qE '^argv (psql|supabase)-secret$' "$ARGVLOG"; then bad "password appears in a command's argv"; else ok "password never in argv of psql or supabase"; fi
if grep -q '^argv ' "$ARGVLOG"; then ok "argv safety markers recorded (check can fail)"; else bad "argv log empty"; fi
if grep -qx 'pgpw-set' "$ARGVLOG"; then ok "database commands receive PGPASSWORD without logging its value"; else bad "PGPASSWORD not set for the commands"; fi

echo "preflight stops"
run "stops on a failed dry run" 1 "" FAKE_DRY_RC=7 -- --yes
expect_not "no probe after failed dry run" "psql probe"
expect_not "no push after failed dry run" "supabase push"
run "unreadable dry-run output refused" 1 "" FAKE_DRY_OUT="something odd" -- --yes
expect_not "no push when pending list is unreadable" "supabase push"
run "stops on a failed probe" 1 "" FAKE_PROBE_RC=3 -- --yes
expect "probe attempted" "psql probe"
expect_not "no push after failed probe" "supabase push"
run "stops when the probe leaves a policy behind" 1 "" FAKE_LEFT=2 -- --yes
expect_not "no push when probe not rolled back" "supabase push"
run "op-get failure stops before anything" 1 "" FAKE_OP_FAIL=1 -- --yes
expect_not "no dry run when the secret is unavailable" "supabase dry-run"
run "feature branch refused" 1 "" FAKE_BRANCH=feat/x -- --yes
expect_not "no dry run from a feature branch" "supabase dry-run"
run "HEAD behind origin/main refused" 1 "" FAKE_HEAD=aaaa FAKE_ORIGIN_MAIN=bbbb -- --yes --no-pr
expect_not "no push when main is stale" "supabase push"
run "uncommitted migration changes refused" 1 "" FAKE_DIRTY=" M supabase/migrations/x.sql" -- --yes --no-pr
expect_not "no push with a dirty migrations dir" "supabase push"

echo "probe only when needed"
mv "$tmp/mig/20260101000002_gate.sql" "$tmp/gate.save"
printf 'create table u();\n' > "$tmp/mig/20260101000002_gate.sql"
run "plain migrations skip the probe" 0 "" -- --yes --no-pr
expect_not "no probe for plain SQL" "psql probe"
printf 'create policy p on storage.objects for select using (true);\n' > "$tmp/mig/20260101000002_gate.sql"
run "storage policy migration triggers the probe" 0 "" -- --yes --no-pr
expect "probe ran for storage policy" "psql probe"
mv "$tmp/gate.save" "$tmp/mig/20260101000002_gate.sql"

echo "confirmation"
run "default is No on empty input" 1 "" -- --no-pr
expect_not "no push without a yes" "supabase push"
expect_not "no backup without confirmation" "pg_dump"
run "n is No" 1 "n
" -- --no-pr
expect_not "no push on n" "supabase push"
run "y confirms" 0 "y
" -- --no-pr
expect "push after y" "supabase push"
run "--yes skips the prompt" 0 "" -- --yes --no-pr
expect "push with --yes" "supabase push"

echo "dry-run and flags"
run "--dry-run stops after preflight" 0 "" -- --dry-run
expect "dry-run still probes" "psql probe"
expect_not "--dry-run never pushes" "supabase push"
expect_not "--dry-run opens no PR" "gh-post"
run "--no-pr opens no PR" 0 "" -- --yes --no-pr
expect_not "no gh-post with --no-pr" "gh-post"
run "unknown option refused" 2 "" -- --force
run "nothing to promote: no PR" 0 "" FAKE_AHEAD=0 -- --yes
expect_not "no PR when staging has main" "gh-post"

echo "verify"
run "max-version mismatch fails" 1 "" FAKE_MAX=20260101000001 -- --yes
has "mismatch named" "VERIFY FAILED"
expect_not "no PR after failed verify" "gh-post"
run "trusted clients > 0 fails loudly" 1 "" FAKE_TRUSTED=2 -- --yes
has "trusted clients named" "trusted_agent_clients"
expect_not "no PR when trusted clients exist" "gh-post"
run "missing authenticator setting fails" 1 "" FAKE_ROLCONFIG="statement_timeout=8s" -- --yes
has "rolconfig named" "pgrst.db_pre_request"
run "no flagged sample org fails" 1 "" FAKE_SAMPLE_ORGS=0/0 -- --yes
has "sample org check named" "expected exactly one flagged org, shaped like the sample org"
expect_not "no PR when the sample org is not flagged" "gh-post"
run "a flagged org that is not sample-shaped fails" 1 "" FAKE_SAMPLE_ORGS=1/0 -- --yes
has "the shape failure is named" "flagged/sample-shaped: '1/0'"
expect_not "no PR when the flagged org is not sample-shaped" "gh-post"
run "two flagged orgs fail" 1 "" FAKE_SAMPLE_ORGS=2/2 -- --yes --no-pr
has "the count failure is named" "flagged/sample-shaped: '2/2'"

echo "edge functions"
run "changed agent-chat deploys and passes smoke checks" 0 "sentinel-for-function-cli\n" FAKE_FN_DIFF=$'supabase/functions/agent-chat/index.ts\nsupabase/functions/compose-view/index.ts\nsupabase/functions/mcp/index.ts\nsupabase/functions/_shared/cors.ts\n' -- --yes --no-pr
expect "agent-chat deployed" "supabase functions-deploy agent-chat"
expect "function token read from the secret store" "op-get fake-function-item fake-function-vault FAKE_TOKEN"
expect "token supplied through the CLI environment" "supabase token-env-ok"
expect "database password is not forwarded to edge deploy" "supabase db-password-not-forwarded"
expect "handler receives unauthenticated requests" "supabase no-verify-jwt"
expect "deploy carries the project ref derived from the smoke host" "supabase project-ref-ok"
expect "deploy cannot read the caller's stdin" "supabase deploy-stdin-closed"
expect "unauthenticated POST smoke check ran" "curl POST"
if before "supabase push" "supabase functions-deploy agent-chat"; then ok "edge deploy follows a successful migration push"; else bad "edge deploy follows a successful migration push"; fi
expected_origins="$(grep '^const DEFAULT_APP_ORIGINS' supabase/functions/_shared/cors.ts | tr -cd "'" | wc -c | awk '{print int($1 / 2)}' | tr -d ' ')"
actual_preflights="$(grep -c '^curl OPTIONS$' "$calls" || true)"
if [ "$actual_preflights" = "$expected_origins" ]; then ok "each source allowlisted origin receives a preflight"; else bad "preflight count $actual_preflights differs from source allowlist count $expected_origins"; fi
has "compose-view and mcp are reported held" "held (not deployed): compose-view mcp"
hasnt "shared folder is never listed" "_shared"
expect_not "compose-view is not deployed" "supabase functions-deploy compose-view"
expect_not "mcp is not deployed" "supabase functions-deploy mcp"
if grep -qF "$FAKE_ACCESS_TOKEN" "$ARGVLOG" "$allout"; then bad "access token reached argv log or output"; else ok "access token never reached argv log or output"; fi
BASHX=-x run "traced function deploy hides the access token" 0 "" FAKE_FN_DIFF=$'supabase/functions/agent-chat/index.ts\n' -- --yes --no-pr
if grep -qF "$FAKE_ACCESS_TOKEN" "$ARGVLOG" "$allout"; then bad "traced run exposed the access token"; else ok "traced run keeps the access token private"; fi
run "a failed function deploy stops the run" 1 "" FAKE_FN_DIFF=$'supabase/functions/agent-chat/index.ts\n' FAKE_DEPLOY_RC=1 -- --yes --no-pr
has "deployment failure is clear" "edge function deploy failed"
has "deployment diagnostics include the redacted CLI reason" "deployment rejected"
hasnt "deployment diagnostics hide the host" "$SECRET_HOST"
hasnt "deployment diagnostics hide the project ref" "$SECRET_PROJECT_REF"
hasnt "deployment diagnostics hide the token" "$FAKE_ACCESS_TOKEN"
expect_not "no smoke check after failed deploy" "curl POST"
run "a gateway 401 with its gateway code fails handler auth" 1 "" FAKE_FN_DIFF=$'supabase/functions/agent-chat/index.ts\n' FAKE_POST_HANDLER=0 -- --yes --no-pr
has "gateway 401 is not mistaken for handler auth" "unauthenticated POST smoke check failed"
run "an unauthenticated POST returning 200 fails" 1 "" FAKE_FN_DIFF=$'supabase/functions/agent-chat/index.ts\n' FAKE_POST_STATUS=200 -- --yes --no-pr
has "200 smoke failure is clear" "unauthenticated POST smoke check failed"
expect_not "no PR after a failed smoke check" "gh-post"
run "a preflight that fails to echo the origin fails" 1 "" FAKE_FN_DIFF=$'supabase/functions/agent-chat/index.ts\n' FAKE_CORS_MISMATCH=1 -- --yes --no-pr
has "preflight echo failure is clear" "CORS preflight smoke check failed"
run "dry-run never deploys changed functions" 0 "" FAKE_FN_DIFF=$'supabase/functions/agent-chat/index.ts\n' -- --dry-run
expect_not "dry-run never deploys a function" "supabase functions-deploy"
expect_not "dry-run never smoke-checks a function" "curl POST"
expect_not "dry-run never reads the function token" "op-get fake-function-item"
run "no function changes: silent" 0 "" -- --yes --no-pr
hasnt "no function warning" "edge functions changed"
run "shared function code change redeploys agent-chat" 0 "" FAKE_FN_DIFF=$'supabase/functions/_shared/auth.ts\n' -- --yes --no-pr
expect "shared dependency triggers allowlisted deployment" "supabase functions-deploy agent-chat"
run "agent library change redeploys agent-chat" 0 "" FAKE_FN_DIFF=$'mos-app/src/lib/agent/client.ts\n' -- --yes --no-pr
expect "agent library dependency triggers allowlisted deployment" "supabase functions-deploy agent-chat"
run "viewspec library change redeploys agent-chat" 0 "" FAKE_FN_DIFF=$'mos-app/src/lib/viewspec/schema.ts\n' -- --yes --no-pr
expect "viewspec dependency triggers allowlisted deployment" "supabase functions-deploy agent-chat"
run "function secret-store names are checked before migration push" 1 "" STAGING_OP_ENV_FILE="$tmp/op-no-functions.env" FAKE_FN_DIFF=$'supabase/functions/agent-chat/index.ts\n' -- --yes --no-pr
has "missing function coordinates are named" "STAGING_FUNCTIONS_OP_ITEM"
expect_not "no migration push when function secret-store names are missing" "supabase push"
run "invalid function host is rejected before migration push" 1 "" FAKE_URL="postgresql://deployer:${SECRET_PW}@db.invalid.example.test:5432/postgres" FAKE_FN_DIFF=$'supabase/functions/agent-chat/index.ts\n' -- --yes --no-pr
expect_not "no migration push when the function host cannot provide a project ref" "supabase push"
run "unreadable app origins are rejected before migration push" 1 "" FAKE_NO_ORIGINS=1 FAKE_FN_DIFF=$'supabase/functions/agent-chat/index.ts\n' -- --yes --no-pr
expect_not "no migration push when app origins cannot be read" "supabase push"
run "function-only deployment needs confirmation" 1 "" FAKE_DRY_OUT="Remote database is up to date." FAKE_FN_DIFF=$'supabase/functions/agent-chat/index.ts\n' -- --no-pr
has "function-only change is included in confirmation" "Deploy 0 migration(s) and 1 edge function(s) to staging?"
expect_not "function-only change does not deploy without confirmation" "supabase functions-deploy"
run "y confirms function-only deployment" 0 "y
" FAKE_DRY_OUT="Remote database is up to date." FAKE_FN_DIFF=$'supabase/functions/agent-chat/index.ts\n' -- --no-pr
expect "function-only deployment follows confirmation" "supabase functions-deploy agent-chat"

echo "pre-push backup"
run "backup is taken before push and stored under the configured directory" 0 "" -- --yes --no-pr
expect "dump taken" "pg_dump"
expect "dump verified with pg_restore" "pg_restore-list"
if grep -q '^argv pg_dump .*--format=custom' "$ARGVLOG"; then ok "backup uses the full custom dump format"; else bad "backup did not request custom format"; fi
if grep -q '^argv pg_restore --list .*\.partial$' "$ARGVLOG"; then ok "pg_restore validates the partial dump before finalizing it"; else bad "pg_restore did not validate the partial dump"; fi
expect "push follows the backup" "supabase push"
if before "pg_dump" "supabase push" && before "pg_restore-list" "supabase push"; then ok "dump and verification precede the push"; else bad "dump and verification precede the push"; fi
if [ -n "$(ls "$tmp/dumps" 2>/dev/null | grep -E '^pre-deploy-.*-abc1234\.dump$')" ]; then ok "verified backup lands under the configured backup directory"; else bad "verified backup missing from the configured backup directory"; fi
run "default backup directory is under the home backup tree" 0 "" STAGING_PREDEPLOY_DUMP_DIR= -- --yes --no-pr
if [ -n "$(ls "$tmp/backups/gordi-mos-staging" 2>/dev/null | grep -E '^pre-deploy-.*-abc1234\.dump$')" ]; then ok "default backup directory is ~/backups/gordi-mos-staging"; else bad "default backup directory is incorrect"; fi
run "dump failure aborts before push" 1 "" FAKE_DUMP_FAIL=1 -- --yes --no-pr
expect "dump failure attempted" "pg_dump"
expect_not "no push after dump failure" "supabase push"
run "unlistable dump aborts before push" 1 "" FAKE_LIST_EMPTY=1 -- --yes --no-pr
expect "unlistable dump check attempted" "pg_restore-list"
expect_not "no push after unlistable dump" "supabase push"
run "empty dump listing aborts before push" 1 "" FAKE_LIST_ZERO=1 -- --yes --no-pr
has "empty listing is rejected" "pre-push dump does not list"
expect_not "no push after empty listing" "supabase push"
run "dry-run takes no dump and never pushes" 0 "" -- --dry-run
expect_not "dry-run takes no backup" "pg_dump"
expect_not "dry-run never pushes" "supabase push"
run "push failure identifies the recovery backup" 1 "" FAKE_PUSH_RC=1 -- --yes --no-pr
has "push failure names the backup path" "pre-push dump is at $tmp/dumps/pre-deploy-"
expect "failed push was attempted" "supabase push"
run "database, edge and promotion order" 0 "" FAKE_FN_DIFF=$'supabase/functions/agent-chat/index.ts\n' -- --yes
order="$(grep -E '^(pg_dump|pg_restore-list|supabase push|supabase functions-deploy agent-chat|gh-post pr create)' "$calls" | tr '\n' ' ')"
case "$order" in pg_dump\ pg_restore-list\ supabase\ push\ supabase\ functions-deploy\ agent-chat\ gh-post\ pr\ create*) ok "order: backup, database push, edge deploy, promotion PR" ;; *) bad "unexpected DB/edge/promotion order: $order" ;; esac
if grep -q 'rehearse-migrations\.sh' "$SCRIPT"; then bad "removed migration helper is still called"; else ok "no removed migration helper call remains"; fi

printf '\n%s passed, %s failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
