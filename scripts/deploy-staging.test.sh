#!/usr/bin/env bash
# Self-test for scripts/deploy-staging.sh. op-get.sh, supabase, psql, git and gh-post.sh are PATH/env
# shims that record their calls; no database, network or GitHub is touched. Every refusal case asserts
# the push (or PR) was NOT made, so each check can fail.
set -uo pipefail
cd "$(dirname "$0")/.."
SCRIPT="$(pwd)/scripts/deploy-staging.sh"
tmp="$(mktemp -d -t deploystaging.XXXXXX)"
trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0
ok()  { pass=$((pass+1)); printf '  ok    %s\n' "$1"; }
bad() { fail=$((fail+1)); printf '  FAIL  %s\n' "$1"; }

SECRET_PW='p4ssw0rdZZ'
SECRET_HOST='db.fakehost-zz.example.test'
SECRET_URL="postgresql://deployer:${SECRET_PW}@${SECRET_HOST}:5432/postgres"
ROOT_REPO="$(pwd -P)"; calls="$tmp/calls"; allout="$tmp/allout"; : > "$allout"
mkdir -p "$tmp/bin" "$tmp/mig"

cat > "$tmp/bin/op-get.sh" <<'EOF'
#!/usr/bin/env bash
printf 'op-get %s\n' "$*" >> "$CALLS"
[ "${FAKE_OP_FAIL:-}" = 1 ] && { echo "not signed in" >&2; exit 1; }
printf '%s\n' "$FAKE_URL"
EOF
cat > "$tmp/bin/supabase" <<'EOF'
#!/usr/bin/env bash
case "$*" in
  *--dry-run*) printf 'supabase dry-run\n' >> "$CALLS"
    echo "Connecting to $FAKE_URL"
    if [ "${FAKE_DRY_RC:-0}" != 0 ]; then echo "failed to connect to host=$FAKE_HOST user=deployer" >&2; exit "$FAKE_DRY_RC"; fi
    printf '%s\n' "${FAKE_DRY_OUT}" ;;
  *"db push"*) printf 'supabase push\n' >> "$CALLS"; echo "Finished supabase db push." ;;
  *"functions deploy"*) printf 'supabase functions-deploy\n' >> "$CALLS" ;;
  *"config push"*) printf 'supabase config-push\n' >> "$CALLS" ;;
esac
EOF
cat > "$tmp/bin/psql" <<'EOF'
#!/usr/bin/env bash
sql="$*"; stdin=""; case "$sql" in *" -c "*) ;; *) stdin="$(cat)" ;; esac
case "$sql$stdin" in
  *zz_preflight_probe*"create policy"*|*"create policy"*zz_preflight_probe*) printf 'psql probe\n' >> "$CALLS"
    [ "${FAKE_PROBE_RC:-0}" = 0 ] || { echo "permission denied for $FAKE_HOST" >&2; exit 3; } ;;
  *"count(*) from pg_policies"*) echo "${FAKE_LEFT:-0}" ;;
  *"max(version)"*) echo "${FAKE_MAX:-20260101000002}" ;;
  *rolconfig*) echo "${FAKE_ROLCONFIG:-pgrst.db_pre_request=api_private.check_request}" ;;
  *trusted_agent_clients*) echo "${FAKE_TRUSTED:-0}" ;;
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
chmod +x "$tmp"/bin/* "$tmp/gh-post.sh"

printf 'create table t();\n' > "$tmp/mig/20260101000001_plain.sql"
printf "alter role authenticator set pgrst.db_pre_request = 'api_private.check_request';\n" > "$tmp/mig/20260101000002_gate.sql"
printf 'STAGING_OP_ITEM=fake-item\nSTAGING_OP_VAULT=fake-vault\nSTAGING_OP_FIELD=FAKE\n' > "$tmp/op.env"

# run NAME EXPECT_RC STDIN [ENV=val ...] -- args   (sets $out; asserts rc)
run() {
  local name="$1" want="$2" input="$3"; shift 3
  local envs=(); while [ "$#" -gt 0 ] && [ "$1" != -- ]; do envs+=("$1"); shift; done; shift
  : > "$calls"
  out="$(printf '%s' "$input" | env PATH="$tmp/bin:$PATH" CALLS="$calls" WTFILE="$tmp/wtfile" ROOT_REPO="$ROOT_REPO" FAKE_URL="$SECRET_URL" FAKE_HOST="$SECRET_HOST" \
    FAKE_DRY_OUT="Would push these migrations:
 • 20260101000001_plain.sql
 • 20260101000002_gate.sql" tmp_main="$tmp" \
    STAGING_OP_ENV_FILE="$tmp/op.env" MIGRATIONS_DIR="$tmp/mig" GH_POST="$tmp/gh-post.sh" HOME="$tmp" \
    "${envs[@]+"${envs[@]}"}" bash ${BASHX:-} "$SCRIPT" "$@" 2>&1)"; rc=$?
  printf '%s\n' "$out" >> "$allout"
  if [ "$rc" -eq "$want" ]; then ok "$name"; else bad "$name (rc=$rc, want $want)"; printf '%s\n' "$out" | sed 's/^/        /'; fi
}
called()    { grep -q "^$1" "$calls"; }
expect()    { if called "$2"; then ok "$1"; else bad "$1 (missing call: $2)"; fi; }
expect_not() { if called "$2"; then bad "$1 (unexpected call: $2)"; else ok "$1"; fi; }
has()       { if printf '%s' "$out" | grep -qF -- "$2"; then ok "$1"; else bad "$1 (output lacks: $2)"; fi; }
hasnt()     { if printf '%s' "$out" | grep -qF -- "$2"; then bad "$1 (output has: $2)"; else ok "$1"; fi; }

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
has "verify line printed" "verify: max version 20260101000002 (newest local 20260101000002) · db_pre_request set · trusted clients 0"
expect_not "no function deploy" "supabase functions-deploy"
expect_not "no config push" "supabase config-push"

echo "secrecy"
BASHX=-x run "traced run (bash -x) still succeeds" 0 "" -- --yes
hasnt "trace does not leak the url" "$SECRET_PW"
run "failed dry run" 1 "" FAKE_DRY_RC=7 -- --yes
hasnt "failure output hides host" "$SECRET_HOST"
if grep -qE "$SECRET_PW|$SECRET_HOST|postgresql://" "$allout"; then bad "connection string, password or host reached stdout/stderr"; else ok "connection string, password and host never reach stdout/stderr (all runs)"; fi

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

echo "edge functions"
run "changed functions are warned about, not deployed" 0 "" FAKE_FN_DIFF=$'supabase/functions/alpha/index.ts\nsupabase/functions/beta/x.ts\nsupabase/functions/mcp/index.ts\n' -- --yes --no-pr
has "names the changed functions" "alpha beta"
has "gives the deploy command" "supabase functions deploy alpha beta"
has "says mcp stays undeployed" "mcp edge function changed; it stays undeployed until agent switch-on"
expect_not "functions never deployed" "supabase functions-deploy"
run "mcp alone: no deploy command" 0 "" FAKE_FN_DIFF=$'supabase/functions/mcp/index.ts\n' -- --yes --no-pr
hasnt "no deploy command for mcp" "functions deploy"
has "mcp note present" "stays undeployed"
run "no function changes: silent" 0 "" -- --yes --no-pr
hasnt "no function warning" "edge functions changed"

printf '\n%s passed, %s failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
