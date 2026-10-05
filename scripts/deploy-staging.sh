#!/usr/bin/env bash
# One-command staging deploy: preflight, confirm, push migrations, verify, open the promotion PR.
#
#   bash scripts/deploy-staging.sh [--dry-run] [--yes] [--no-pr]
#
#   --dry-run  stop after the preflight (pending list, edge-function notice, privileged-step probe)
#   --yes      skip the y/N confirmation (default answer is No)
#   --no-pr    do not open the main -> staging promotion PR
#
# The connection string is read from the host's secret store at run time and lives only in this
# process: it is never printed, written or put in the PR. Where it lives (item/vault/field) is read
# from the gitignored supabase/op.staging.env (template: supabase/op.staging.env.example).
# Deploys origin/main only (refuses from any other checkout state).
# Never runs `supabase config push`, never deploys edge functions, never touches trusted agent clients.
# Self-test: scripts/deploy-staging.test.sh
{ set +x; } 2>/dev/null   # a traced run must not echo the connection string
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIG_DIR="${MIGRATIONS_DIR:-$ROOT/supabase/migrations}"
GH_POST="${GH_POST:-$ROOT/scripts/gh-post.sh}"
PATH="$PATH:$HOME/.local/bin:/opt/homebrew/opt/libpq/bin"

DRY=0 YES=0 PR=1
for a in "$@"; do
  case "$a" in
    --dry-run) DRY=1 ;;
    --yes) YES=1 ;;
    --no-pr) PR=0 ;;
    -h|--help) sed -n 2,8p "$0"; exit 0 ;;
    *) printf 'deploy-staging: unknown option %s\n' "$a" >&2; exit 2 ;;
  esac
done

die() { printf '✗ deploy-staging: %s\n' "$1" >&2; exit 1; }
say() { printf '%s\n' "$*"; }

URL="" ; SECRETS=()
# Replace every secret-bearing fragment of the connection string in the text read from stdin.
redact() {
  local line s
  while IFS= read -r line || [ -n "$line" ]; do
    for s in "${SECRETS[@]}"; do line="${line//"$s"/<redacted>}"; done
    printf '%s\n' "$line"
  done
}

errf="$(mktemp)"; wt=""
cleanup() {
  rm -f "$errf"
  if [ -n "$wt" ]; then git -C "$ROOT" worktree remove --force "$wt" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT

for t in op-get.sh supabase psql git; do command -v "$t" >/dev/null 2>&1 || die "$t not found on PATH"; done

# ── Where the connection string lives (names only; the values stay in the local file).
envfile="${STAGING_OP_ENV_FILE:-}"
if [ -z "$envfile" ]; then
  main_wt="$(git -C "$ROOT" worktree list --porcelain | awk '$1=="worktree"{print $2; exit}')"
  for d in "$ROOT" "$main_wt"; do [ -f "$d/supabase/op.staging.env" ] && { envfile="$d/supabase/op.staging.env"; break; }; done
fi
[ -n "$envfile" ] && [ -f "$envfile" ] || die "supabase/op.staging.env not found — copy supabase/op.staging.env.example and fill it in"
OP_ITEM="" OP_VAULT="" OP_FIELD=""
while IFS='=' read -r k v || [ -n "$k" ]; do
  v="${v%\"}"; v="${v#\"}"; v="${v%\'}"; v="${v#\'}"
  case "$k" in
    STAGING_OP_ITEM) OP_ITEM="$v" ;;
    STAGING_OP_VAULT) OP_VAULT="$v" ;;
    STAGING_OP_FIELD) OP_FIELD="$v" ;;
  esac
done < "$envfile"
[ -n "$OP_ITEM" ] && [ -n "$OP_VAULT" ] && [ -n "$OP_FIELD" ] || die "op.staging.env must set STAGING_OP_ITEM, STAGING_OP_VAULT and STAGING_OP_FIELD"

URL="$(op-get.sh "$OP_ITEM" "$OP_VAULT" "$OP_FIELD" 2>/dev/null </dev/null)" || die "op-get.sh could not read the staging connection (is 1Password signed in?)"
[ -n "$URL" ] || die "the staging connection string is empty"
rest="${URL#*://}"; hostpart="${rest#*@}"; host="${hostpart%%[:/?]*}"
userinfo=""; case "$rest" in *@*) userinfo="${rest%%@*}" ;; esac
user="${userinfo%%:*}"; pass=""; case "$userinfo" in *:*) pass="${userinfo#*:}" ;; esac
# The password never goes in argv (visible to every local user in `ps`): commands get the URL
# without it and read the decoded password from PGPASSWORD, which libpq and the supabase CLI honor.
CONN="$URL"; PGPASSWORD=""
if [ -n "$pass" ]; then
  CONN="${URL%%://*}://${user}@${hostpart}"
  PGPASSWORD="$(printf '%b' "${pass//\%/\\x}")"
  export PGPASSWORD
fi
for s in "$URL" "$userinfo" "$pass" "$PGPASSWORD" "$user" "$host"; do [ "${#s}" -ge 3 ] && SECRETS+=("$s"); done

# psql helpers: stdout is the answer, stderr is shown (redacted) only on failure.
sqlq() { local o; if ! o="$(psql "$CONN" -X -At -v ON_ERROR_STOP=1 -c "$1" 2>"$errf" </dev/null)"; then redact < "$errf" >&2; return 1; fi; printf '%s' "$o"; }

say "Staging deploy from $(git -C "$ROOT" branch --show-current) @ $(git -C "$ROOT" rev-parse --short HEAD)"

# ── 1. Source: deploy exactly origin/main, the content the promotion PR carries.
git -C "$ROOT" fetch -q origin main staging || die "git fetch failed"
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
  say "No pending migrations: staging is up to date."
else
  say "Pending migrations (${#pending[@]}):"; printf '  %s\n' "${pending[@]}"
fi

# ── 3. Edge functions changed on main since staging: report, never deploy.
changed="$(git -C "$ROOT" diff --name-only origin/staging origin/main -- supabase/functions | awk -F/ 'NF>=3{print $3}' | sort -u)"
others=() mcp_changed=0
while IFS= read -r n; do
  [ -n "$n" ] || continue
  if [ "$n" = mcp ]; then mcp_changed=1; else others+=("$n"); fi
done <<< "$changed"
if [ "${#others[@]}" -gt 0 ]; then
  say "WARNING: edge functions changed on main and are NOT deployed by this script: ${others[*]}"
  say "  Deploy them yourself (needs 'supabase login'): supabase functions deploy ${others[*]}"
fi
[ "$mcp_changed" = 0 ] || say "Note: the mcp edge function changed; it stays undeployed until agent switch-on."

# ── 4. Privileged-step probe: only when a pending migration touches the authenticator role or storage policies.
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
    { cat "$errf.o" "$errf" | redact; } >&2; rm -f "$errf.o"; die "privileged-step probe failed — the deploy role cannot run these steps; nothing was pushed"
  fi
  rm -f "$errf.o"
  left="$(sqlq "select count(*) from pg_policies where policyname='zz_preflight_probe'")" || die "could not confirm the probe rolled back"
  [ "$left" = 0 ] || die "probe left $left zz_preflight_probe policies behind — remove them before deploying"
  say "Probe ok, rolled back."
fi

if [ "$DRY" = 1 ]; then say "Dry run: stopping before push."; exit 0; fi

# ── 5. Confirm, then push.
if [ "${#pending[@]}" -gt 0 ]; then
  if [ "$YES" != 1 ]; then
    printf 'Apply %d migration(s) to staging? [y/N] ' "${#pending[@]}" >&2
    ans=""; read -r ans || true
    case "$ans" in y|Y|yes|YES) ;; *) die "not confirmed — nothing was pushed" ;; esac
  fi
  set +e; out="$(supabase --workdir "$ROOT" db push --yes --db-url "$CONN" 2>&1 </dev/null)"; rc=$?; set -e
  printf '%s\n' "$out" | redact
  [ "$rc" -eq 0 ] || die "supabase db push failed (exit $rc)"
fi

# ── 6. Verify.
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
[ "$tc" = 0 ] || fail "shared.trusted_agent_clients has '$tc' rows — agent access must stay off"
say "verify: max version $remote (newest local $newest) · db_pre_request $pre · trusted clients $tc"
[ "$bad" = 0 ] || die "verification failed — staging is NOT in the expected state"

# ── 7. Promotion PR: gh-post accepts a staging PR only from a checkout on branch main.
if [ "$PR" = 1 ]; then
  if [ "$(git -C "$ROOT" rev-list --count origin/staging..origin/main)" = 0 ]; then
    say "staging already contains main: no promotion PR needed."
  else
    body="Promotes main to staging."$'\n\n'
    if [ "${#pending[@]}" -gt 0 ]; then body+="Migrations applied:"$'\n'; for f in "${pending[@]}"; do body+="- $f"$'\n'; done
    else body+="No migrations were pending."$'\n'; fi
    wt="$(mktemp -d)"
    git -C "$ROOT" worktree add -q --detach "$wt" origin/main
    git -C "$wt" checkout -q --ignore-other-worktrees main
    [ "$(git -C "$wt" branch --show-current)" = main ] || die "temp worktree is not on main"
    (cd "$wt" && bash "$GH_POST" pr create --base staging --title "Promote main to staging" --body "$body")
  fi
fi
say "Staging deploy complete."
