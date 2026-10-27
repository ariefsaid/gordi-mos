#!/usr/bin/env bash
# Self-test for scripts/deploy-staging.sh. External commands are PATH/env shims; no remote database,
# network or GitHub is touched. Refusal cases assert the staging push was NOT made.
set -uo pipefail
cd "$(dirname "$0")/.."
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
FAKE_FUNCTION_SECRET_VALUE='test-only-function-secret-value'; export FAKE_FUNCTION_SECRET_VALUE
LONG_WORKTREE_PADDING='xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'; export LONG_WORKTREE_PADDING
ROOT_REPO="$(pwd -P)"; calls="$tmp/calls"; ARGVLOG="$tmp/argv"; : > "$ARGVLOG"; allout="$tmp/allout"; : > "$allout"
REAL_GREP="$(command -v grep)"; export REAL_GREP
mkdir -p "$tmp/bin" "$tmp/mig" "$tmp/repo/scripts" "$tmp/repo/supabase" "$tmp/repo/mos-app/src/lib"
# Exercise real deployment behavior with a non-held function in an isolated source tree.
cp scripts/deploy-staging.sh "$tmp/repo/scripts/"
cp -R scripts/lib "$tmp/repo/scripts/"
cp -R supabase/functions "$tmp/repo/supabase/"
cp -R mos-app/src/lib/agent mos-app/src/lib/viewspec "$tmp/repo/mos-app/src/lib/"
SCRIPT="$tmp/repo/scripts/deploy-staging.sh"
ROOT_REPO="$tmp/repo"

cat > "$tmp/bin/op-get.sh" <<'EOF'
#!/usr/bin/env bash
printf 'op-get %s\n' "$*" >> "$CALLS"
[ "${FAKE_OP_FAIL:-}" = 1 ] && { echo "not signed in" >&2; exit 1; }
case "$*" in
  *fake-function-item*APP_ALLOWED_ORIGINS*)
    if [ "${FAKE_FUNCTION_SECRET_MULTILINE:-0}" = 1 ]; then
      printf '%s\nsecond-line=value\n' "$FAKE_FUNCTION_SECRET_VALUE"
    else
      printf '%s\n' "$FAKE_FUNCTION_SECRET_VALUE"
    fi
    ;;
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
case "$*" in *--db-url*) a="$*"; u="${a#*--db-url }"; u="${u%% *}"; h="${u#*@}"; printf 'db-url-host %s\n' "${h%%[:/]*}" >> "$ARGVLOG" ;; esac
if [ -n "${FAKE_FUNCTION_SECRET_VALUE:-}" ] && [[ "$*" == *"$FAKE_FUNCTION_SECRET_VALUE"* ]]; then printf 'argv function-secret\n' >> "$ARGVLOG"; fi
case "$*" in
  *"secrets list"*)
    printf 'supabase secrets-list\n' >> "$CALLS"
    [ "${SUPABASE_ACCESS_TOKEN:-}" = "${FAKE_ACCESS_TOKEN:-}" ] && printf 'supabase secrets-list-token-env-ok\n' >> "$CALLS"
    printf '['
    sep=""
    for name in APP_ALLOWED_ORIGINS AGENT_MODEL_API_KEY ATTENDANCE_PURGE_SECRET AGENT_MODEL_BASE_URL AGENT_MODEL_DEFAULT AGENT_PERSISTENCE VAPID_PRIVATE_KEY VAPID_PUBLIC_KEY; do
      [ "$name" != "${FAKE_STAGING_MISSING_SECRET:-}" ] || continue
      printf '%s{"name":"%s"}' "$sep" "$name"
      sep=,
    done
    printf ']\n'
    ;;
  *"secrets set"*)
    printf 'supabase secrets-set\n' >> "$CALLS"
    env_file=""; prev=""
    for arg in "$@"; do
      [ "$prev" != --env-file ] || env_file="$arg"
      prev="$arg"
    done
    [ -n "$env_file" ] || exit 2
    [ -f "$env_file" ] || exit 2
    printf 'supabase secrets-set-envfile-mode %s\n' "$(stat -c %a "$env_file" 2>/dev/null || stat -f %Lp "$env_file")" >> "$CALLS"
    printf '%s\n' "$env_file" > "$tmp_main/envfile-path"
    while IFS= read -r line; do
      printf 'supabase secrets-set-name %s\n' "${line%%=*}" >> "$CALLS"
      [ "${line#*=}" != "${FAKE_FUNCTION_SECRET_VALUE:-}" ] || printf 'supabase secrets-set-value-ok\n' >> "$CALLS"
    done < "$env_file"
    printf '%s\n' "$FAKE_FUNCTION_SECRET_VALUE"
    printf '%s\n' "$FAKE_FUNCTION_SECRET_VALUE" >&2
    exit "${FAKE_SECRETS_SET_RC:-0}"
    ;;
  *--dry-run*) printf 'supabase dry-run\n' >> "$CALLS"
    echo "Connecting to $FAKE_URL"
    if [ "${FAKE_DRY_RC:-0}" != 0 ]; then echo "failed to connect to host=${h:-$FAKE_HOST} user=deployer" >&2; exit "$FAKE_DRY_RC"; fi
    printf '%s\n' "${FAKE_DRY_OUT}" ;;
  *"db push"*) printf 'supabase push\n' >> "$CALLS"; echo "Finished supabase db push."; exit "${FAKE_PUSH_RC:-0}" ;;
  *"functions deploy"*)
    fn=""; prev=""; project_ref=""
    smoke_host="${FAKE_URL#*@}"; smoke_host="${smoke_host%%[:/?]*}"
    smoke_ref="${smoke_host#db.}"; smoke_ref="${smoke_ref%.supabase.co}"
    for arg in "$@"; do
      case "$arg" in agent-chat|test-function|compose-view|mcp|attendance-photo-purge) fn="$arg" ;; esac
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
  *"insert into shared.deployment_stamp"*)
    printf 'psql deployment-stamp\n' >> "$CALLS"
    if [[ "$sql" == *"${FAKE_ORIGIN_MAIN:-aaaa}"* ]]; then
      printf 'psql deployment-stamp-sha %s\n' "${FAKE_ORIGIN_MAIN:-aaaa}" >> "$CALLS"
    fi
    [ "${FAKE_STAMP_RC:-0}" = 0 ] || { echo "deployment stamp write refused" >&2; exit "${FAKE_STAMP_RC:-1}"; } ;;
  *zz_preflight_probe*"create policy"*|*"create policy"*zz_preflight_probe*) printf 'psql probe\n' >> "$CALLS"
    [ "${FAKE_PROBE_RC:-0}" = 0 ] || { echo "permission denied for $FAKE_HOST" >&2; exit 3; } ;;
  *"to_regclass('shared.deployment_stamp')"*) echo "${FAKE_HAS_STAMP:-t}" ;;
  *"select backend_sha from shared.deployment_stamp"*) printf 'psql stamp-read\n' >> "$CALLS"; echo "${FAKE_STAMP_SHA-$FAKE_STAMP_DEFAULT}" ;;
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
  *refs/remotes/origin/staging*) echo "${FAKE_ORIGIN_STAGING:-stage-old}" ;;
  "status --porcelain"*) printf '%s' "${FAKE_DIRTY:-}" ;;
  "merge-base --is-ancestor "*)
    case "$*" in
      "merge-base --is-ancestor stage-old aaaa") [ "${FAKE_STAGE_ANCESTOR:-1}" = 1 ] && exit 0 || exit 1 ;;
      "merge-base --is-ancestor aaaa stage-old") [ "${FAKE_MAIN_ANCESTOR_STAGE:-0}" = 1 ] && exit 0 || exit 1 ;;
    esac
    exit 1 ;;
  "rev-list --no-merges --count aaaa..stage-old") echo "${FAKE_STAGING_NONMERGE_COUNT:-1}" ;;
  "push origin "*:refs/heads/staging) printf 'git-push %s\n' "$*" >> "$CALLS"; exit "${FAKE_GIT_PUSH_RC:-0}" ;;
  "ls-remote --exit-code origin refs/heads/staging") printf '%s\trefs/heads/staging\n' "${FAKE_ORIGIN_STAGING_AFTER_PUSH:-aaaa}" ;;
  "diff --name-only"*) printf '%s' "${FAKE_FN_DIFF:-}" ;;
  "worktree list --porcelain")
    printf 'worktree %s\n' "$tmp_main"
    if [ "${FAKE_LONG_WORKTREE_LIST:-0}" = 1 ]; then
      for ((i=0; i<1200; i++)); do printf 'worktree /tmp/fake-worktree-%04d-%s\n' "$i" "$LONG_WORKTREE_PADDING"; done
    fi
    ;;
  "worktree add"*) mkdir -p "${@: -2:1}"; echo "${@: -2:1}" > "$WTFILE" ;;
  "checkout -q --ignore-other-worktrees main") touch "$c/.on-main" ;;
esac
exit 0
EOF
cat > "$tmp/gh-post.sh" <<'EOF'
#!/usr/bin/env bash
# Promotion PRs must be opened from the main checkout and only report a URL; never merge.
if [ "$(pwd -P)" = "$(cd "$FAKE_MAIN_CHECKOUT" && pwd -P)" ]; then
  printf 'gh-post %s\n' "$*" >> "$CALLS"
  printf 'https://github.com/ariefsaid/gordi-mos/pull/999\n'
else
  printf 'gh-post-WRONG-CHECKOUT %s\n' "$*" >> "$CALLS"
  exit 1
fi
EOF
cat > "$tmp/bin/grep" <<'EOF'
#!/usr/bin/env bash
if [ "${FAKE_NO_ORIGINS:-0}" = 1 ] && [[ "$*" == *DEFAULT_APP_ORIGINS* ]]; then exit 1; fi
if [ "${FAKE_SCAN_ENV_NAME+x}" = x ] && [[ "$*" == *"Deno[.]env[.]get"* ]]; then
  printf "Deno.env.get('%s')\n" "$FAKE_SCAN_ENV_NAME"
  exit 0
fi
exec "$REAL_GREP" "$@"
EOF
cat > "$tmp/bin/ssh" <<'EOF'
#!/usr/bin/env bash
printf 'argv ssh %s\n' "$*" >> "$ARGVLOG"
host=""; cmd=""; while [ "$#" -gt 0 ]; do case "$1" in -o) shift 2 ;; *) if [ -z "$host" ]; then host="$1"; else cmd="$1"; fi; shift ;; esac; done
case "$cmd" in
  *"checkout -q -B main ${FAKE_ORIGIN_MAIN:-aaaa}"*) printf 'ssh update %s\n' "$host" >> "$CALLS"
    [ "$cmd" = "cd ~/fake-ops/repo && git fetch -q origin main && git merge-base --is-ancestor ${FAKE_ORIGIN_MAIN:-aaaa} origin/main && git checkout -q -B main ${FAKE_ORIGIN_MAIN:-aaaa} && test \"\$(git rev-parse HEAD)\" = ${FAKE_ORIGIN_MAIN:-aaaa}" ] && printf 'ssh update-command-ok\n' >> "$CALLS"
    [ "${FAKE_SSH_UPDATE_RC:-0}" = 0 ] || { echo "fatal: clone update refused on $host" >&2; exit "$FAKE_SSH_UPDATE_RC"; } ;;
  "flock -n /tmp/fake-snapshot.lock ~/fake-ops/run.sh reporting-snapshot-cron.sh --snapshot-only") printf 'ssh snapshot %s\n' "$host" >> "$CALLS"
    printf 'snapshot-only-command-ok\n' >> "$CALLS"
    echo "--- reporting-snapshot START on $host ---"
    [ "${FAKE_SSH_SNAPSHOT_RC:-0}" = 0 ] || { echo "snapshot failed" >&2; exit "$FAKE_SSH_SNAPSHOT_RC"; } ;;
  *) printf 'ssh unexpected %s\n' "$cmd" >> "$CALLS"; exit 9 ;;
esac
EOF
chmod +x "$tmp"/bin/* "$tmp/gh-post.sh"
. scripts/lib/ops-db-dump-test-shims.sh
ops_test_install_db_dump_shims "$tmp/bin"

printf 'create table t();\n' > "$tmp/mig/20260101000001_plain.sql"
printf "alter role authenticator set pgrst.db_pre_request = 'api_private.check_request';\n" > "$tmp/mig/20260101000002_gate.sql"
printf 'STAGING_OP_ITEM=fake-item\nSTAGING_OP_VAULT=fake-vault\nSTAGING_OP_FIELD=FAKE\nSTAGING_FUNCTIONS_OP_ITEM=fake-function-item\nSTAGING_FUNCTIONS_OP_VAULT=fake-function-vault\nSTAGING_FUNCTIONS_OP_FIELD=FAKE_TOKEN\n' > "$tmp/op.env"
printf 'STAGING_FN_SECRET_APP_ALLOWED_ORIGINS=%s|%s|APP_ALLOWED_ORIGINS\n' \
  "$(grep '^STAGING_FUNCTIONS_OP_ITEM=' "$tmp/op.env" | cut -d= -f2-)" \
  "$(grep '^STAGING_FUNCTIONS_OP_VAULT=' "$tmp/op.env" | cut -d= -f2-)" >> "$tmp/op.env"
printf 'STAGING_OP_ITEM=fake-item\nSTAGING_OP_VAULT=fake-vault\nSTAGING_OP_FIELD=FAKE\n' > "$tmp/op-no-functions.env"
cp "$tmp/op.env" "$tmp/op-no-ops.env"
printf 'STAGING_OPS_SSH_HOST=fake-ops-box\nSTAGING_OPS_REPO_DIR=~/fake-ops/repo\nSTAGING_OPS_RUNNER=~/fake-ops/run.sh\nSTAGING_OPS_LOCK=/tmp/fake-snapshot.lock\n' >> "$tmp/op.env"
FAKE_STAMP_DEFAULT=0123456789abcdef0123456789abcdef01234567; export FAKE_STAMP_DEFAULT
# Any real git a test reaches resolves GitHub to a missing local path, so no run can reach GitHub.
NO_GITHUB=(GIT_CONFIG_COUNT=2 "GIT_CONFIG_KEY_0=url.$tmp/no-network.git.insteadOf" GIT_CONFIG_VALUE_0=https://github.com/
  "GIT_CONFIG_KEY_1=url.$tmp/no-network.git.insteadOf" GIT_CONFIG_VALUE_1=git@github.com: GIT_TERMINAL_PROMPT=0)

# run NAME EXPECT_RC STDIN [ENV=val ...] -- args   (sets $out; asserts rc)
run() {
  local name="$1" want="$2" input="$3"; shift 3
  local envs=(); while [ "$#" -gt 0 ] && [ "$1" != -- ]; do envs+=("$1"); shift; done; shift
  : > "$calls"
  out="$(printf '%s' "$input" | env "${NO_GITHUB[@]}" PATH="$tmp/bin:$PATH" CALLS="$calls" ARGVLOG="$ARGVLOG" WTFILE="$tmp/wtfile" ROOT_REPO="$ROOT_REPO" FAKE_URL="$SECRET_URL" FAKE_HOST="$SECRET_HOST" FAKE_PASSWORD="$SECRET_PW" REAL_GREP="$REAL_GREP" \
    FAKE_DRY_OUT="Would push these migrations:
 • 20260101000001_plain.sql
 • 20260101000002_gate.sql" tmp_main="$tmp" \
    STAGING_OP_ENV_FILE="$tmp/op.env" MIGRATIONS_DIR="$tmp/mig" GH_POST="$tmp/gh-post.sh" FAKE_MAIN_CHECKOUT="$tmp/repo" HOME="$tmp" \
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
expect "deployment stamp is written after a successful database deploy" "psql deployment-stamp"
if before "supabase push" "psql deployment-stamp"; then ok "deployment stamp follows the successful database push"; else bad "deployment stamp precedes the database push"; fi
expect "ancestor promotion pushes the deployed origin/main sha to staging" "git-push push origin aaaa:refs/heads/staging"
expect "ancestor promotion confirms remote staging after the push" "git ls-remote --exit-code origin refs/heads/staging"
expect_not "ancestor promotion does not open a PR" "gh-post"
has "ancestor promotion prints the pushed sha" "Pushed origin/main sha aaaa to staging."
has "ancestor promotion confirms origin/staging exact sha" "Confirmed origin/staging at aaaa."
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
expect_not "--dry-run does not promote" "git-push"
run "--no-promote skips the staging push" 0 "" -- --yes --no-promote
expect_not "no direct push with --no-promote" "git-push"
run "--no-pr remains a promotion-skip alias" 0 "" -- --yes --no-pr
expect_not "no direct push with --no-pr" "git-push"
run "unknown option refused" 2 "" -- --force
run "already-promoted main is not pushed again" 0 "" FAKE_ORIGIN_STAGING=aaaa -- --yes
expect_not "already-promoted main is not pushed" "git-push"
run "staging merge-commit-only divergence opens a main-to-staging PR" 0 "" \
  FAKE_STAGE_ANCESTOR=0 FAKE_MAIN_ANCESTOR_STAGE=1 FAKE_STAGING_NONMERGE_COUNT=0 -- --yes
expect "merge-commit-only divergence opens PR through gh-post from main checkout" "gh-post pr create --base staging"
expect_not "merge-commit-only divergence never pushes staging" "git-push"
expect_not "promotion does not merge staging itself" "gh-post pr merge"
has "merge-commit-only divergence prints the PR URL" "https://github.com/ariefsaid/gordi-mos/pull/999"
run "main behind staging with a non-merge commit is refused" 1 "" \
  FAKE_STAGE_ANCESTOR=0 FAKE_MAIN_ANCESTOR_STAGE=1 FAKE_STAGING_NONMERGE_COUNT=1 -- --yes
has "non-merge staging commit refusal is explained" "origin/staging contains non-merge commits absent from origin/main"
expect_not "non-merge staging commit does not open a PR" "gh-post"
expect_not "non-merge staging commit is never pushed" "git-push"
run "real staging divergence is refused" 1 "" \
  FAKE_STAGE_ANCESTOR=0 FAKE_MAIN_ANCESTOR_STAGE=0 -- --yes
has "real divergence refusal is explained" "origin/staging is not an ancestor of origin/main"
expect_not "real divergence never opens a PR" "gh-post"
expect_not "real divergence never pushes staging" "git-push"
run "remote staging mismatch after push is refused" 1 "" FAKE_ORIGIN_STAGING_AFTER_PUSH=bbbb -- --yes
expect "post-push mismatch case pushed the deployed sha" "git-push push origin aaaa:refs/heads/staging"
expect "post-push mismatch case queried origin/staging" "git ls-remote --exit-code origin refs/heads/staging"
has "post-push mismatch is explained" "origin/staging does not match the promoted commit"
mkdir -p "$tmp/supabase"
cp "$tmp/op.env" "$tmp/supabase/op.staging.env"
long_fixture="$tmp/long-worktrees"
: > "$long_fixture"
for ((i=0; i<1200; i++)); do printf 'worktree /tmp/fake-worktree-%04d-%s\n' "$i" "$LONG_WORKTREE_PADDING" >> "$long_fixture"; done
long_bytes="$(wc -c < "$long_fixture" | tr -d ' ')"
if [ "$long_bytes" -gt 65536 ]; then ok "long porcelain fixture exceeds 64 KiB ($long_bytes bytes)"; else bad "long porcelain fixture is too small ($long_bytes bytes)"; fi
run "long worktree list is read without SIGPIPE" 0 "" FAKE_LONG_WORKTREE_LIST=1 STAGING_OP_ENV_FILE= -- --yes --no-pr
has "long worktree list completes the staging deploy" "Staging deploy complete."

echo "held assistant functions"
for changed in supabase/functions/agent-chat/index.ts supabase/functions/_shared/cors.ts supabase/functions/_shared/jwtSegment.ts; do
  run "held assistant change succeeds without function coordinates: $changed" 0 "" \
    STAGING_OP_ENV_FILE="$tmp/op-no-functions.env" FAKE_STAGING_MISSING_SECRET=AGENT_MODEL_API_KEY \
    FAKE_FN_DIFF="$changed" -- --yes --no-pr
  expect_not "agent-chat is never deployed" "supabase functions-deploy agent-chat"
  expect_not "held assistant never reads the function token" "op-get fake-function-item"
  expect_not "held assistant never lists secrets" "supabase secrets-list"
  expect_not "held assistant never sets secrets" "supabase secrets-set"
  expect "migrations still deploy" "supabase push"
  expect "successful deploy still stamps" "psql deployment-stamp"
  has "agent-chat is reported held" "held (not deployed): agent-chat"
  has "hold lasts until assistant switch-on" "held until assistant switch-on"
done
cp -R "$tmp/repo/supabase/functions/agent-chat" "$tmp/repo/supabase/functions/test-function"

echo "verify"
run "max-version mismatch fails" 1 "" FAKE_MAX=20260101000001 -- --yes
has "mismatch named" "VERIFY FAILED"
expect_not "no promotion push after failed verify" "git-push"
run "trusted clients > 0 fails loudly" 1 "" FAKE_TRUSTED=2 -- --yes
has "trusted clients named" "trusted_agent_clients"
expect_not "no promotion push when trusted clients exist" "git-push"
run "a failed database verify stops before any function deploys" 1 "" FAKE_TRUSTED=2 FAKE_FN_DIFF=$'supabase/functions/test-function/index.ts\n' -- --yes --no-pr
expect_not "no function deploy after a failed database verify" "supabase functions-deploy test-function"
run "missing authenticator setting fails" 1 "" FAKE_ROLCONFIG="statement_timeout=8s" -- --yes
has "rolconfig named" "pgrst.db_pre_request"
run "no flagged sample org fails" 1 "" FAKE_SAMPLE_ORGS=0/0 -- --yes
has "sample org check named" "expected exactly one flagged org, shaped like the sample org"
expect_not "no promotion push when the sample org is not flagged" "git-push"
run "a flagged org that is not sample-shaped fails" 1 "" FAKE_SAMPLE_ORGS=1/0 -- --yes
has "the shape failure is named" "flagged/sample-shaped: '1/0'"
expect_not "no promotion push when the flagged org is not sample-shaped" "git-push"
run "two flagged orgs fail" 1 "" FAKE_SAMPLE_ORGS=2/2 -- --yes --no-pr
has "the count failure is named" "flagged/sample-shaped: '2/2'"

echo "edge function secrets"
run "invalid function env name fails safely before secrets are read" 1 "" FAKE_SCAN_ENV_NAME=$'BAD\tNAME' FAKE_FN_DIFF=$'supabase/functions/test-function/index.ts\n' -- --yes --no-pr
has "invalid env name failure identifies only the function" "invalid environment variable name in function test-function"
hasnt "invalid env name is not echoed" $'BAD\tNAME'
expect_not "invalid env name stops before the function token or secret values are read" "op-get fake-function-item"
expect_not "invalid env name stops before staging secret listing" "supabase secrets-list"
expect_not "invalid env name stops before migration push" "supabase push"
expect_not "invalid env name stops before function deploy" "supabase functions-deploy test-function"
run "a missing function secret is set once before deploy" 0 "" FAKE_STAGING_MISSING_SECRET=APP_ALLOWED_ORIGINS FAKE_FN_DIFF=$'supabase/functions/test-function/index.ts\n' -- --yes --no-pr
expect "staging function secrets listed with the deploy token" "supabase secrets-list-token-env-ok"
expect "missing function secret is set" "supabase secrets-set-name APP_ALLOWED_ORIGINS"
expect "secret value reaches the set env-file" "supabase secrets-set-value-ok"
expect "set env-file is owner-only" "supabase secrets-set-envfile-mode 600"
if [ -e "$(cat "$tmp/envfile-path")" ]; then bad "set env-file removed after success"; else ok "set env-file removed after success"; fi
if [ "$(grep -c '^supabase secrets-set$' "$calls")" = 1 ]; then ok "all missing function secrets use one set call"; else bad "expected one function secrets set call"; fi
if before "supabase secrets-set-name APP_ALLOWED_ORIGINS" "supabase functions-deploy test-function"; then ok "function secret is set before deploy"; else bad "function secret is not set before deploy"; fi
has "secret summary names the set key" "function secrets set: APP_ALLOWED_ORIGINS"
hasnt "function secret value never reaches stdout or stderr" "$FAKE_FUNCTION_SECRET_VALUE"
if grep -qE '^(argv function-secret|.*test-only-function-secret-value)' "$ARGVLOG"; then bad "function secret value reached argv log"; else ok "function secret value never reaches argv log"; fi
run "already-present function secrets are not reset" 0 "" FAKE_FN_DIFF=$'supabase/functions/test-function/index.ts\n' -- --yes --no-pr
expect_not "no set call when all required function secrets already exist" "supabase secrets-set"
has "already-present secret summary is clear" "function secrets: none missing"
run "missing secret mapping stops before deploy" 1 "" FAKE_STAGING_MISSING_SECRET=AGENT_MODEL_API_KEY FAKE_FN_DIFF=$'supabase/functions/test-function/index.ts\n' -- --yes --no-pr
has "missing mapping names the secret and key to add" "STAGING_FN_SECRET_AGENT_MODEL_API_KEY"
expect_not "no function deploy after missing mapping" "supabase functions-deploy test-function"
has "missing location gives the one-time command" "supabase secrets set AGENT_MODEL_API_KEY=<value>"
hasnt "missing location generates nothing" "function secrets set:"
run "multiline function secret is rejected before setting" 1 "" FAKE_STAGING_MISSING_SECRET=APP_ALLOWED_ORIGINS FAKE_FUNCTION_SECRET_MULTILINE=1 FAKE_FN_DIFF=$'supabase/functions/test-function/index.ts\n' -- --yes --no-pr
has "multiline rejection names only the secret" "function secret APP_ALLOWED_ORIGINS contains a newline"
hasnt "multiline rejection hides the value" "$FAKE_FUNCTION_SECRET_VALUE"
hasnt "multiline rejection hides the second line" "second-line=value"
expect_not "multiline function secret is not set" "supabase secrets-set"
expect_not "multiline function secret is not deployed" "supabase functions-deploy test-function"
run "failed secrets set stops before function deploy" 1 "" FAKE_STAGING_MISSING_SECRET=APP_ALLOWED_ORIGINS FAKE_SECRETS_SET_RC=1 FAKE_FN_DIFF=$'supabase/functions/test-function/index.ts\n' -- --yes --no-pr
hasnt "failed secret set does not print the value" "$FAKE_FUNCTION_SECRET_VALUE"
expect "failed secret set was attempted" "supabase secrets-set"
if [ -e "$(cat "$tmp/envfile-path")" ]; then bad "set env-file removed after failure"; else ok "set env-file removed after failure"; fi
expect_not "no function deploy after failed secrets set" "supabase functions-deploy test-function"
run "platform SUPABASE names are ignored" 0 "" FAKE_STAGING_MISSING_SECRET=SUPABASE_URL FAKE_FN_DIFF=$'supabase/functions/test-function/index.ts\n' -- --yes --no-pr
expect_not "platform-provided secrets are never set" "supabase secrets-set"
has "ignored platform secret reports no missing app secrets" "function secrets: none missing"
run "dry-run lists candidate function secrets without reading their values" 0 "" FAKE_STAGING_MISSING_SECRET=APP_ALLOWED_ORIGINS FAKE_FN_DIFF=$'supabase/functions/test-function/index.ts\n' -- --dry-run
has "dry-run lists required function secret names" "APP_ALLOWED_ORIGINS"
expect_not "dry-run does not read function secret values" "op-get fake-function-item"
expect_not "dry-run does not list or set function secrets" "supabase secrets-list"
expect_not "dry-run never deploys a function" "supabase functions-deploy"

echo "machine-entry function"
run "machine entry skips CORS preflight but keeps the 401 POST check" 0 "" FAKE_FN_DIFF=$'supabase/functions/attendance-photo-purge/index.ts\n' -- --yes --no-pr
expect "machine entry deployed" "supabase functions-deploy attendance-photo-purge"
expect "machine entry still gets the unauthenticated POST check" "curl POST"
expect_not "machine entry gets no CORS preflight" "curl OPTIONS"
has "preflight skip is stated" "CORS preflight skipped for attendance-photo-purge"
run "browser function still gets preflights" 0 "" FAKE_FN_DIFF=$'supabase/functions/test-function/index.ts\n' -- --yes --no-pr
expect "browser function preflighted" "curl OPTIONS"

echo "edge functions"
run "changed non-held function deploys and passes smoke checks" 0 "sentinel-for-function-cli\n" FAKE_FN_DIFF=$'supabase/functions/test-function/index.ts\nsupabase/functions/agent-chat/index.ts\nsupabase/functions/compose-view/index.ts\nsupabase/functions/mcp/index.ts\nsupabase/functions/_shared/cors.ts\n' -- --yes --no-pr
expect "non-held function deployed" "supabase functions-deploy test-function"
expect_not "agent-chat is held alongside deployable functions" "supabase functions-deploy agent-chat"
expect "function token read from the secret store" "op-get fake-function-item fake-function-vault FAKE_TOKEN"
expect "token supplied through the CLI environment" "supabase token-env-ok"
expect "database password is not forwarded to edge deploy" "supabase db-password-not-forwarded"
expect "handler receives unauthenticated requests" "supabase no-verify-jwt"
expect "deploy carries the project ref derived from the smoke host" "supabase project-ref-ok"
expect "deploy cannot read the caller's stdin" "supabase deploy-stdin-closed"
expect "unauthenticated POST smoke check ran" "curl POST"
expect "backend stamp follows a successful function deploy and smoke checks" "psql deployment-stamp"
if before "supabase functions-deploy test-function" "psql deployment-stamp"; then ok "deployment stamp follows the successful function deploy"; else bad "deployment stamp precedes the function deploy"; fi
if before "supabase push" "supabase functions-deploy test-function"; then ok "edge deploy follows a successful migration push"; else bad "edge deploy follows a successful migration push"; fi
expected_origins="$(grep '^const DEFAULT_APP_ORIGINS' supabase/functions/_shared/cors.ts | tr -cd "'" | wc -c | awk '{print int($1 / 2)}' | tr -d ' ')"
actual_preflights="$(grep -c '^curl OPTIONS$' "$calls" || true)"
if [ "$actual_preflights" = "$expected_origins" ]; then ok "each source allowlisted origin receives a preflight"; else bad "preflight count $actual_preflights differs from source allowlist count $expected_origins"; fi
has "assistant functions are reported held" "held (not deployed): agent-chat compose-view mcp"
hasnt "shared folder is never listed" "_shared"
expect_not "compose-view is not deployed" "supabase functions-deploy compose-view"
expect_not "mcp is not deployed" "supabase functions-deploy mcp"
if grep -qF "$FAKE_ACCESS_TOKEN" "$ARGVLOG" "$allout"; then bad "access token reached argv log or output"; else ok "access token never reached argv log or output"; fi
BASHX=-x run "traced function deploy hides the access token" 0 "" FAKE_FN_DIFF=$'supabase/functions/test-function/index.ts\n' -- --yes --no-pr
if grep -qF "$FAKE_ACCESS_TOKEN" "$ARGVLOG" "$allout"; then bad "traced run exposed the access token"; else ok "traced run keeps the access token private"; fi
run "a failed function deploy stops the run" 1 "" FAKE_FN_DIFF=$'supabase/functions/test-function/index.ts\n' FAKE_DEPLOY_RC=1 -- --yes --no-pr
has "deployment failure is clear" "edge function deploy failed"
has "deployment diagnostics include the redacted CLI reason" "deployment rejected"
hasnt "deployment diagnostics hide the host" "$SECRET_HOST"
hasnt "deployment diagnostics hide the project ref" "$SECRET_PROJECT_REF"
hasnt "deployment diagnostics hide the token" "$FAKE_ACCESS_TOKEN"
expect_not "no smoke check after failed deploy" "curl POST"
expect_not "no deployment stamp after a failed function deploy" "psql deployment-stamp"
run "a gateway 401 with its gateway code fails handler auth" 1 "" FAKE_FN_DIFF=$'supabase/functions/test-function/index.ts\n' FAKE_POST_HANDLER=0 -- --yes --no-pr
has "gateway 401 is not mistaken for handler auth" "unauthenticated POST smoke check failed"
run "an unauthenticated POST returning 200 fails" 1 "" FAKE_FN_DIFF=$'supabase/functions/test-function/index.ts\n' FAKE_POST_STATUS=200 -- --yes --no-pr
has "200 smoke failure is clear" "unauthenticated POST smoke check failed"
expect_not "no promotion push after a failed smoke check" "git-push"
run "a preflight that fails to echo the origin fails" 1 "" FAKE_FN_DIFF=$'supabase/functions/test-function/index.ts\n' FAKE_CORS_MISMATCH=1 -- --yes --no-pr
has "preflight echo failure is clear" "CORS preflight smoke check failed"
expect_not "no deployment stamp after a failed function smoke check" "psql deployment-stamp"
run "dry-run never deploys changed functions" 0 "" FAKE_FN_DIFF=$'supabase/functions/test-function/index.ts\n' -- --dry-run
expect_not "dry-run never deploys a function" "supabase functions-deploy"
expect_not "dry-run never smoke-checks a function" "curl POST"
expect_not "dry-run never reads the function token" "op-get fake-function-item"
run "no function changes: silent" 0 "" -- --yes --no-pr
hasnt "no function warning" "edge functions changed"
run "shared module change redeploys every function importing it" 0 "" FAKE_FN_DIFF=$'supabase/functions/_shared/cors.ts\n' -- --yes --no-pr
expect "shared cors change deploys non-held importer" "supabase functions-deploy test-function"
expect_not "shared cors change holds agent-chat" "supabase functions-deploy agent-chat"
expect_not "shared cors change holds compose-view" "supabase functions-deploy compose-view"
has "shared cors change reports assistant functions held" "held (not deployed): agent-chat compose-view"
run "a shared module reached through another shared module redeploys its importers, never the held ones" 0 "" FAKE_FN_DIFF=$'supabase/functions/_shared/jwtSegment.ts\n' -- --yes --no-pr
expect "transitive shared change deploys non-held importer" "supabase functions-deploy test-function"
expect_not "transitive shared change holds agent-chat" "supabase functions-deploy agent-chat"
expect_not "mcp imports the changed module but is never deployed" "supabase functions-deploy mcp"
has "held importers are reported" "held (not deployed): agent-chat compose-view mcp"
run "a shared module nothing imports deploys nothing" 0 "" FAKE_FN_DIFF=$'supabase/functions/_shared/no-such-module.ts\n' -- --yes --no-pr
expect_not "unimported shared module deploys nothing" "supabase functions-deploy"
run "only mcp changed: nothing deploys" 0 "" FAKE_FN_DIFF=$'supabase/functions/mcp/index.ts\n' -- --yes --no-pr
expect_not "a direct mcp change is never deployed" "supabase functions-deploy"
run "agent library change redeploys non-held importers" 0 "" FAKE_FN_DIFF=$'mos-app/src/lib/agent/runtime/port.ts\n' -- --yes --no-pr
expect "agent library dependency deploys non-held importer" "supabase functions-deploy test-function"
expect_not "agent library dependency holds agent-chat" "supabase functions-deploy agent-chat"
hasnt "agent library dependency does not touch compose-view" "compose-view"
run "viewspec library change redeploys its importers" 0 "" FAKE_FN_DIFF=$'mos-app/src/lib/viewspec/types.ts\n' -- --yes --no-pr
expect "viewspec dependency deploys non-held importer" "supabase functions-deploy test-function"
expect_not "viewspec dependency holds agent-chat" "supabase functions-deploy agent-chat"
run "changes are read from the stamped commit to origin/main" 0 "" -- --yes --no-pr
expect "the stamp is read before the change list" "psql stamp-read"
expect "the change list starts at the stamped commit" "git diff --name-only $FAKE_STAMP_DEFAULT aaaa"
run "before the stamp table exists, changes are read from origin/staging" 0 "" FAKE_HAS_STAMP=f -- --yes --no-pr
expect "the change list starts at origin/staging" "git diff --name-only stage-old aaaa"
run "a malformed stamp is refused before migration push" 1 "" FAKE_STAMP_SHA="x'; drop table t; --" -- --yes --no-pr
has "malformed stamp is explained" "the deployment stamp is not a commit SHA"
expect_not "no migration push after a malformed stamp" "supabase push"
run "function secret-store names are checked before migration push" 1 "" STAGING_OP_ENV_FILE="$tmp/op-no-functions.env" FAKE_FN_DIFF=$'supabase/functions/test-function/index.ts\n' -- --yes --no-pr
has "missing function coordinates are named" "STAGING_FUNCTIONS_OP_ITEM"
expect_not "no migration push when function secret-store names are missing" "supabase push"
run "invalid function host is rejected before migration push" 1 "" FAKE_URL="postgresql://deployer:${SECRET_PW}@db.invalid.example.test:5432/postgres" FAKE_FN_DIFF=$'supabase/functions/test-function/index.ts\n' -- --yes --no-pr
expect_not "no migration push when the function host cannot provide a project ref" "supabase push"
run "unreadable app origins are rejected before migration push" 1 "" FAKE_NO_ORIGINS=1 FAKE_FN_DIFF=$'supabase/functions/test-function/index.ts\n' -- --yes --no-pr
expect_not "no migration push when app origins cannot be read" "supabase push"
full_main_sha=abcdef0123456789abcdef0123456789abcdef01
run "stamp records the full origin/main SHA" 0 "" FAKE_HEAD="$full_main_sha" FAKE_ORIGIN_MAIN="$full_main_sha" -- --yes --no-promote
expect "deployment stamp uses the full main commit SHA" "psql deployment-stamp-sha $full_main_sha"
run "deployment stamp write failure stops promotion" 1 "" FAKE_STAMP_RC=1 -- --yes
has "stamp write failure is explained" "could not update the backend deployment stamp"
expect_not "no promotion after a stamp write failure" "git-push"

run "function-only deployment needs confirmation" 1 "" FAKE_DRY_OUT="Remote database is up to date." FAKE_FN_DIFF=$'supabase/functions/test-function/index.ts\n' -- --no-pr
has "function-only change is included in confirmation" "Deploy 0 migration(s) and 1 edge function(s) to staging?"
expect_not "function-only change does not deploy without confirmation" "supabase functions-deploy"
run "y confirms function-only deployment" 0 "y
" FAKE_DRY_OUT="Remote database is up to date." FAKE_FN_DIFF=$'supabase/functions/test-function/index.ts\n' -- --no-pr
expect "function-only deployment follows confirmation" "supabase functions-deploy test-function"

echo "server ops step"
OPS_MAIN=(FAKE_HEAD="$full_main_sha" FAKE_ORIGIN_MAIN="$full_main_sha")
run "changed snapshot code updates the server clone and runs the snapshot once" 0 "" "${OPS_MAIN[@]}" FAKE_FN_DIFF=$'supabase/functions/test-function/index.ts\nscripts/reporting_snapshot.py\n' -- --yes --no-pr
expect "server clone moved to the deployed commit" "ssh update fake-ops-box"
expect "clone update is the exact fetch and checkout of the deployed commit" "ssh update-command-ok"
expect "snapshot ran through the server runner" "ssh snapshot fake-ops-box"
expect "deploy snapshot skips the director's first Café refresh" "snapshot-only-command-ok"
has "deploy explains that nightly refresh requires per-environment approval" "Scheduled Café stream refresh requires CAFE_STREAM_ITEMS_ENABLED=1 configured per environment after first-run approval."
if grep '^argv ssh ' "$ARGVLOG" | grep -q 'CAFE_STREAM_ITEMS_ENABLED'; then bad "deploy changed the server refresh enable setting"; else ok "deploy never sets the server refresh enable setting"; fi
if [ "$(grep -c '^ssh snapshot fake-ops-box$' "$calls")" = 1 ]; then ok "snapshot runs exactly once"; else bad "snapshot did not run exactly once"; fi
order="$(grep -E '^(supabase push|supabase functions-deploy test-function|ssh update |ssh snapshot fake-ops-box$|psql deployment-stamp$)' "$calls" | tr '\n' ' ')"
case "$order" in "supabase push supabase functions-deploy test-function ssh update fake-ops-box ssh snapshot fake-ops-box psql deployment-stamp ") ok "order: migrations, functions, server ops, stamp" ;; *) bad "unexpected order: $order" ;; esac
hasnt "ssh host alias is redacted from output" "fake-ops-box"
run "other script changes leave the server alone" 0 "" FAKE_FN_DIFF=$'scripts/gh-post.sh\nscripts/deploy-staging.sh\n' -- --yes --no-pr
expect_not "no server update when ops scripts are unchanged" "ssh "
run "shared ops library change runs the server step" 0 "" "${OPS_MAIN[@]}" FAKE_FN_DIFF=$'scripts/lib/ops-common.sh\n' -- --yes --no-pr
expect "ops library change updates the server clone" "ssh update"
run "stream refresh driver change updates the server clone without applying it" 0 "" "${OPS_MAIN[@]}" FAKE_FN_DIFF=$'scripts/refresh-cafe-stream-items.py\n' -- --yes --no-pr
expect "stream refresh driver change updates the server clone" "ssh update"
expect "stream refresh deploy defers to the director's first-run review" "snapshot-only-command-ok"
run "missing ops coordinates are refused before migration push" 1 "" "${OPS_MAIN[@]}" STAGING_OP_ENV_FILE="$tmp/op-no-ops.env" FAKE_FN_DIFF=$'scripts/reporting_snapshot.py\n' -- --yes --no-pr
has "missing ops keys are named" "STAGING_OPS_SSH_HOST"
expect_not "no migration push without ops coordinates" "supabase push"
printf 'STAGING_OPS_SSH_HOST=-oProxyCommand=evil\n' > "$tmp/op-bad-ops.env"; grep -v '^STAGING_OPS_SSH_HOST=' "$tmp/op.env" >> "$tmp/op-bad-ops.env"
run "an ssh option posing as the host is refused" 1 "" "${OPS_MAIN[@]}" STAGING_OP_ENV_FILE="$tmp/op-bad-ops.env" FAKE_FN_DIFF=$'scripts/reporting_snapshot.py\n' -- --yes --no-pr
expect_not "no ssh with an option-like host" "ssh "
expect_not "no migration push with an option-like host" "supabase push"
printf 'STAGING_OPS_REPO_DIR=~/repo;rm -rf ~\n' > "$tmp/op-bad-path.env"; grep -v '^STAGING_OPS_REPO_DIR=' "$tmp/op.env" >> "$tmp/op-bad-path.env"
run "a path carrying shell text is refused" 1 "" "${OPS_MAIN[@]}" STAGING_OP_ENV_FILE="$tmp/op-bad-path.env" FAKE_FN_DIFF=$'scripts/reporting_snapshot.py\n' -- --yes --no-pr
has "bad path is explained" "must be plain paths"
expect_not "no ssh with a shell-text path" "ssh "
run "a failed function deploy stops before the server step" 1 "" "${OPS_MAIN[@]}" FAKE_DEPLOY_RC=1 FAKE_FN_DIFF=$'supabase/functions/test-function/index.ts\nscripts/reporting_snapshot.py\n' -- --yes --no-pr
expect_not "no server update after a failed function deploy" "ssh "
expect_not "no stamp after a failed function deploy" "psql deployment-stamp"
run "a failed clone update stops before the snapshot and the stamp" 1 "" "${OPS_MAIN[@]}" FAKE_SSH_UPDATE_RC=1 FAKE_FN_DIFF=$'scripts/reporting_snapshot.py\n' -- --yes
has "clone update failure is explained" "could not move the server ops clone"
hasnt "clone update failure hides the host" "fake-ops-box"
expect_not "no snapshot after a failed clone update" "ssh snapshot"
expect_not "no stamp after a failed clone update" "psql deployment-stamp"
expect_not "no promotion after a failed clone update" "git-push"
run "a failed snapshot stops before the stamp" 1 "" "${OPS_MAIN[@]}" FAKE_SSH_SNAPSHOT_RC=2 FAKE_FN_DIFF=$'scripts/reporting_snapshot.py\n' -- --yes
has "snapshot failure is explained" "the server reporting snapshot failed"
expect_not "no stamp after a failed snapshot" "psql deployment-stamp"
expect_not "no promotion after a failed snapshot" "git-push"
run "ops-only change needs confirmation" 1 "" "${OPS_MAIN[@]}" FAKE_DRY_OUT="Remote database is up to date." FAKE_FN_DIFF=$'scripts/reporting_snapshot.py\n' -- --no-pr
has "ops step is named in the confirmation" "then update the server ops clone"
expect_not "no server update without confirmation" "ssh "
run "dry run names the functions and the server step and touches nothing" 0 "" "${OPS_MAIN[@]}" FAKE_FN_DIFF=$'supabase/functions/_shared/cors.ts\nscripts/reporting_snapshot.py\n' -- --dry-run
has "dry run lists the functions to deploy" "Dry run: edge functions to deploy: test-function"
has "dry run names the server step" "Dry run: would update the server ops clone and run the reporting snapshot."
expect_not "dry run never contacts the server" "ssh "
expect_not "dry run never deploys" "supabase functions-deploy"
expect_not "dry run never pushes" "supabase push"
expect_not "dry run never stamps" "psql deployment-stamp"
expect_not "dry run takes no backup" "pg_dump"
run "dry run with nothing changed says so" 0 "" -- --dry-run
has "dry run reports no functions" "Dry run: no edge functions to deploy."
has "dry run reports no server step" "Dry run: server ops scripts unchanged; no server update."

echo "no GitHub"
REAL_GIT="$(command -v git)"
gh_out="$(env "${NO_GITHUB[@]}" "$REAL_GIT" ls-remote https://github.com/ariefsaid/gordi-mos.git 2>&1)"; gh_rc=$?
if [ "$gh_rc" -ne 0 ] && printf '%s' "$gh_out" | grep -qF "$tmp/no-network.git"; then ok "real git in a test run resolves https GitHub to a missing local path"; else bad "real git in a test run could reach GitHub over https"; fi
gh_out="$(env "${NO_GITHUB[@]}" "$REAL_GIT" ls-remote git@github.com:ariefsaid/gordi-mos.git 2>&1)"; gh_rc=$?
if [ "$gh_rc" -ne 0 ] && printf '%s' "$gh_out" | grep -qF "$tmp/no-network.git"; then ok "real git in a test run resolves ssh GitHub to a missing local path"; else bad "real git in a test run could reach GitHub over ssh"; fi
if [ "$(env PATH="$tmp/bin:$PATH" sh -c 'command -v git')" = "$tmp/bin/git" ]; then ok "the script under test resolves git to the fake"; else bad "the script under test could reach a real git"; fi

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
expect_not "no deployment stamp after a failed database push" "psql deployment-stamp"
run "database, edge and direct-promotion order" 0 "" FAKE_FN_DIFF=$'supabase/functions/test-function/index.ts\n' -- --yes
order="$(grep -E '^(pg_dump|pg_restore-list|supabase push|supabase functions-deploy test-function|git-push)' "$calls" | tr '\n' ' ')"
case "$order" in pg_dump\ pg_restore-list\ supabase\ push\ supabase\ functions-deploy\ test-function\ git-push\ push\ origin\ aaaa:refs/heads/staging*) ok "order: backup, database push, edge deploy, direct promotion" ;; *) bad "unexpected DB/edge/promotion order: $order" ;; esac
if grep -q 'rehearse-migrations\.sh' "$SCRIPT"; then bad "removed migration helper is still called"; else ok "no removed migration helper call remains"; fi

echo "pooler url file"
printf 'postgresql://postgres.abcdefghijklmnopqrst@aws-9-synthetic-region-1.pooler.supabase.com:5432/postgres\n' > "$tmp/pooler-url"
run "pooler file routes the database commands through the pooler host" 0 "" STAGING_POOLER_URL_FILE="$tmp/pooler-url" -- --dry-run
has "pooler path announced" "Database host: session pooler (IPv4)"
if grep -qx 'db-url-host aws-9-synthetic-region-1.pooler.supabase.com' "$ARGVLOG"; then ok "db push used the pooler host"; else bad "db push did not use the pooler host"; fi
if grep -qx 'db-url-host aws-9-synthetic-region-1.pooler.supabase.com' "$ARGVLOG" && ! grep -q "^db-url-host $SECRET_HOST" <(tail -n 3 "$ARGVLOG"); then ok "direct host not used on the pooler run"; else bad "direct host still used on the pooler run"; fi
printf 'postgresql://postgres.abcdefghijklmnopqrst:leak@aws-9-synthetic-region-1.pooler.supabase.com:5432/postgres\n' > "$tmp/pooler-url-pw"
run "pooler file with a password is refused" 1 "" STAGING_POOLER_URL_FILE="$tmp/pooler-url-pw" -- --dry-run
has "refusal names the rule" "pooler URL file must be this project's Supabase session pooler"
expect_not "no dry run after a refused pooler file" "supabase dry-run"
printf 'postgresql://postgres.abcdefghijklmnopqrst@aws-9-synthetic-region-1.pooler.supabase.com:5432/postgres?Password=leak\n' > "$tmp/pooler-url-qs"
run "pooler file with a password in the query string is refused" 1 "" STAGING_POOLER_URL_FILE="$tmp/pooler-url-qs" -- --dry-run
has "query-string refusal names the rule" "pooler URL file must be this project's Supabase session pooler"
expect_not "no dry run after a refused query-string pooler file" "supabase dry-run"
run "pooler host is masked on a failed dry run" 1 "" STAGING_POOLER_URL_FILE="$tmp/pooler-url" FAKE_DRY_RC=7 -- --dry-run
hasnt "failed dry run output hides the pooler host" "aws-9-synthetic-region-1.pooler.supabase.com"
for bad_url in \
  'postgresql://postgres.abcdefghijklmnopqrst@attacker.example:5432/postgres' \
  'postgresql://postgres.otherprojectref0000@aws-9-synthetic-region-1.pooler.supabase.com:5432/postgres' \
  'postgresql://postgres.abcdefghijklmnopqrst@aws-9-synthetic-region-1.pooler.supabase.com:5432/postgres?sslmode=disable' \
  'postgresql://postgres.abcdefghijklmnopqrst@aws-9-synthetic-region-1.pooler.supabase.com:6543/postgres' \
  'postgresql://postgres.abcdefghijklmnopqrst@aws-9-synthetic-region-1.pooler.supabase.com.attacker.example:5432/postgres'; do
  printf '%s\n' "$bad_url" > "$tmp/pooler-url-bad"
  : > "$ARGVLOG"
  run "pooler file outside this project's session pooler is refused" 1 "" STAGING_POOLER_URL_FILE="$tmp/pooler-url-bad" -- --dry-run
  has "unbound pooler refusal names the rule" "pooler URL file must be this project's Supabase session pooler"
  if [ -s "$ARGVLOG" ]; then bad "a database client ran for an unbound pooler destination"; else ok "no database client ran for an unbound pooler destination"; fi
done
run "absent pooler file keeps the direct host" 0 "" STAGING_POOLER_URL_FILE="$tmp/no-such-file" -- --dry-run
hasnt "no pooler announcement without the file" "session pooler"

printf '\n%s passed, %s failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
