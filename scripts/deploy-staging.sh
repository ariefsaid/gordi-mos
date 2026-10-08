#!/usr/bin/env bash
# One-command staging deploy: preflight, verified backup, confirmation, database push, edge deploy, promotion PR.
#
#   bash scripts/deploy-staging.sh [--dry-run] [--yes] [--no-pr]
#
#   --dry-run  list pending migrations and stop without a dump or push
#   --yes      skip the y/N confirmation (default answer is No)
#   --no-pr    do not open the main -> staging promotion PR
#
# Before pending migrations are pushed, a custom-format backup is verified with pg_restore --list.
# Its directory defaults to ~/backups/gordi-mos-staging/ and can be overridden with
# STAGING_PREDEPLOY_DUMP_DIR.
#
# The connection string, function CLI token and function secrets are read from the secret store; values
# are never printed, written to disk or put in the PR. Locations are read from gitignored
# supabase/op.staging.env (template: supabase/op.staging.env.example).
# Deploys origin/main only (refuses from any other checkout state).
# Never runs `supabase config push` or touches trusted agent clients. Only changed allowlisted app
# functions deploy after migrations succeed, with a handler-auth and CORS smoke check.
# Secrets for changed functions are set before they deploy.
# Self-test: scripts/deploy-staging.test.sh
{ set +x; } 2>/dev/null   # a traced run must not echo the connection string
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIG_DIR="${MIGRATIONS_DIR:-$ROOT/supabase/migrations}"
GH_POST="${GH_POST:-$ROOT/scripts/gh-post.sh}"
PATH="$PATH:$HOME/.local/bin:/opt/homebrew/opt/libpq/bin"
# shellcheck source=lib/ops-common.sh
. "$ROOT/scripts/lib/ops-common.sh"

DRY=0 YES=0 PR=1
for a in "$@"; do
  case "$a" in
    --dry-run) DRY=1 ;;
    --yes) YES=1 ;;
    --no-pr) PR=0 ;;
    -h|--help) sed -n 2,13p "$0"; exit 0 ;;
    *) printf 'deploy-staging: unknown option %s\n' "$a" >&2; exit 2 ;;
  esac
done

die() { printf '✗ deploy-staging: %s\n' "$1" >&2; exit 1; }
say() { printf '%s\n' "$*"; }

URL=""

errf="$(mktemp)"; wt=""
cleanup() {
  rm -f "$errf" "$errf.body" "$errf.headers"
  if [ -n "$wt" ]; then git -C "$ROOT" worktree remove --force "$wt" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT

for t in op-get.sh supabase psql pg_dump pg_restore git curl; do command -v "$t" >/dev/null 2>&1 || die "$t not found on PATH"; done

# ── Where the connection string lives (names only; the values stay in the local file).
envfile="${STAGING_OP_ENV_FILE:-}"
if [ -z "$envfile" ]; then
  main_wt="$(git -C "$ROOT" worktree list --porcelain | awk '$1=="worktree"{print $2; exit}')"
  for d in "$ROOT" "$main_wt"; do [ -f "$d/supabase/op.staging.env" ] && { envfile="$d/supabase/op.staging.env"; break; }; done
fi
[ -n "$envfile" ] && [ -f "$envfile" ] || die "supabase/op.staging.env not found — copy supabase/op.staging.env.example and fill it in"
OP_ITEM="" OP_VAULT="" OP_FIELD=""
FUNCTIONS_OP_ITEM="" FUNCTIONS_OP_VAULT="" FUNCTIONS_OP_FIELD=""
FUNCTION_SECRET_NAMES=() FUNCTION_SECRET_LOCATIONS=()
while IFS='=' read -r k v || [ -n "$k" ]; do
  v="${v%\"}"; v="${v#\"}"; v="${v%\'}"; v="${v#\'}"
  case "$k" in
    STAGING_OP_ITEM) OP_ITEM="$v" ;;
    STAGING_OP_VAULT) OP_VAULT="$v" ;;
    STAGING_OP_FIELD) OP_FIELD="$v" ;;
    STAGING_FUNCTIONS_OP_ITEM) FUNCTIONS_OP_ITEM="$v" ;;
    STAGING_FUNCTIONS_OP_VAULT) FUNCTIONS_OP_VAULT="$v" ;;
    STAGING_FUNCTIONS_OP_FIELD) FUNCTIONS_OP_FIELD="$v" ;;
    STAGING_FN_SECRET_*) FUNCTION_SECRET_NAMES+=("${k#STAGING_FN_SECRET_}"); FUNCTION_SECRET_LOCATIONS+=("$v") ;;
  esac
done < "$envfile"
[ -n "$OP_ITEM" ] && [ -n "$OP_VAULT" ] && [ -n "$OP_FIELD" ] || die "op.staging.env must set STAGING_OP_ITEM, STAGING_OP_VAULT and STAGING_OP_FIELD"

URL="$(op-get.sh "$OP_ITEM" "$OP_VAULT" "$OP_FIELD" 2>/dev/null </dev/null)" || die "op-get.sh could not read the staging connection (is 1Password signed in?)"
[ -n "$URL" ] || die "the staging connection string is empty"
ops_conn_from_url "$URL"

# psql helpers: stdout is the answer, stderr is shown (redacted) only on failure.
sqlq() { local o; if ! o="$(psql "$CONN" -X -At -v ON_ERROR_STOP=1 -c "$1" 2>"$errf" </dev/null)"; then ops_redact < "$errf" >&2; return 1; fi; printf '%s' "$o"; }

say "Staging deploy from $(git -C "$ROOT" branch --show-current) @ $(git -C "$ROOT" rev-parse --short HEAD)"

# ── 1. Source: deploy exactly origin/main, the content the promotion PR carries.
git -C "$ROOT" fetch -q origin main staging || die "git fetch failed"
[ "$(git -C "$ROOT" branch --show-current)" = main ] || die "run this from a checkout of main"
om="$(git -C "$ROOT" rev-parse --verify -q refs/remotes/origin/main)" || die "origin/main not found"
[ "$(git -C "$ROOT" rev-parse HEAD)" = "$om" ] || die "main is not at origin/main — update it first"
[ -z "$(git -C "$ROOT" status --porcelain -- supabase/migrations)" ] || die "supabase/migrations has uncommitted changes"

# ── 2. Dry run: the pending migration list (file names only).
set +e; out="$(supabase --workdir "$ROOT" db push --dry-run --db-url "$CONN" 2>&1 </dev/null)"; rc=$?; set -e
if [ "$rc" -ne 0 ]; then printf '%s\n' "$out" | ops_redact >&2; die "supabase db push --dry-run failed (exit $rc)"; fi
pending=(); while IFS= read -r f; do [ -n "$f" ] && pending+=("$f"); done < <(printf '%s\n' "$out" | grep -oE '[0-9]{8,}_[A-Za-z0-9_.-]+\.sql' | sort -u || true)
if [ "${#pending[@]}" -eq 0 ]; then
  printf '%s\n' "$out" | grep -qi 'up to date' || die "could not read the pending migration list from the dry run"
  say "No pending migrations: staging is up to date."
else
  say "Pending migrations (${#pending[@]}):"; printf '  %s\n' "${pending[@]}"
fi

# ── 3. Edge functions changed on main since staging: deploy only the app allowlist; hold the rest.
changed="$(git -C "$ROOT" diff --name-only origin/staging origin/main -- supabase/functions mos-app/src/lib/agent mos-app/src/lib/viewspec | awk -F/ '
  $1=="supabase" && $2=="functions" && $3=="_shared" {dep=1; next}
  $1=="mos-app" && $2=="src" && $3=="lib" && ($4=="agent" || $4=="viewspec") {dep=1; next}
  $1=="supabase" && $2=="functions" && NF>=3 && $3!="_shared" {print $3}
  END {if (dep) print "agent-chat"}
' | sort -u)"
functions_to_deploy=() held_functions=() agent_held=()
while IFS= read -r n; do
  [ -n "$n" ] || continue
  case "$n" in
    agent-chat) functions_to_deploy+=("$n") ;;
    compose-view|mcp) held_functions+=("$n"); agent_held+=("$n") ;;
    *) held_functions+=("$n") ;;
  esac
done <<< "$changed"
[ "${#held_functions[@]}" -eq 0 ] || say "WARNING: changed edge functions held (not deployed): ${held_functions[*]}"
[ "${#agent_held[@]}" -eq 0 ] || say "  ${agent_held[*]} remain held until agent switch-on."

function_secret_names=()
if [ "${#functions_to_deploy[@]}" -gt 0 ]; then
  for fn in "${functions_to_deploy[@]}"; do
    for scan_dir in "$ROOT/supabase/functions/$fn" "$ROOT/supabase/functions/_shared"; do
      [ -d "$scan_dir" ] || die "could not inspect function source for $fn"
      while IFS= read -r env_name; do
        [ -n "$env_name" ] || continue
        case "$env_name" in SUPABASE_*) continue ;; esac
        duplicate=0
        for existing_name in "${function_secret_names[@]+"${function_secret_names[@]}"}"; do
          [ "$existing_name" != "$env_name" ] || { duplicate=1; break; }
        done
        [ "$duplicate" = 1 ] || function_secret_names+=("$env_name")
      done < <(
        {
          grep -REoh "Deno[.]env[.]get[[:space:]]*[(][[:space:]]*'[^']*'[[:space:]]*[)]" "$scan_dir" 2>/dev/null | sed -E "s/.*[(][[:space:]]*'([^']*)'[[:space:]]*[)].*/\\1/"
          grep -REoh 'Deno[.]env[.]get[[:space:]]*[(][[:space:]]*"[^"]*"[[:space:]]*[)]' "$scan_dir" 2>/dev/null | sed -E 's/.*[(][[:space:]]*"([^"]*)"[[:space:]]*[)].*/\1/'
        }
      )
    done
  done
fi

# Validate every function-deploy input before any migration can be pushed.
PROJECT_REF="" edge_host="" edge_base=""
function_origins=()
if [ "${#functions_to_deploy[@]}" -gt 0 ]; then
  [ -n "$FUNCTIONS_OP_ITEM" ] && [ -n "$FUNCTIONS_OP_VAULT" ] && [ -n "$FUNCTIONS_OP_FIELD" ] || \
    die "op.staging.env must set STAGING_FUNCTIONS_OP_ITEM, STAGING_FUNCTIONS_OP_VAULT and STAGING_FUNCTIONS_OP_FIELD"
  db_host="${URL#*@}"; db_host="${db_host%%[:/?]*}"
  case "$db_host" in db.*.supabase.co) PROJECT_REF="${db_host#db.}"; PROJECT_REF="${PROJECT_REF%.supabase.co}" ;; *) die "could not derive the edge endpoint from the staging connection" ;; esac
  [[ "$PROJECT_REF" =~ ^[a-z0-9]{20}$ ]] || die "could not derive the edge endpoint from the staging connection"
  edge_host="${db_host#db.}"
  edge_base="https://${edge_host}/functions/v1"
  SECRETS+=("$PROJECT_REF" "$edge_host")

  cors_source="$ROOT/supabase/functions/_shared/cors.ts"
  origins_line="$(grep -E '^[[:space:]]*const DEFAULT_APP_ORIGINS[[:space:]]*=' "$cors_source" | head -1 || true)"
  [ -n "$origins_line" ] || die "could not read app origins from the shared CORS module"
  origins_text="${origins_line#*\[}"; origins_text="${origins_text%%\]*}"
  while IFS= read -r origin; do
    origin="$(printf '%s' "$origin" | sed -E "s/^[[:space:]]*['\"]//; s/['\"][[:space:]]*$//")"
    [ -n "$origin" ] || continue
    [[ "$origin" =~ ^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?$ ]] || die "could not validate app origins from the shared CORS module"
    function_origins+=("$origin")
  done < <(printf '%s\n' "$origins_text" | tr ',' '\n')
  [ "${#function_origins[@]}" -gt 0 ] || die "could not read app origins from the shared CORS module"
fi

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
    { cat "$errf.o" "$errf" | ops_redact; } >&2; rm -f "$errf.o"; die "privileged-step probe failed — the deploy role cannot run these steps; nothing was pushed"
  fi
  rm -f "$errf.o"
  left="$(sqlq "select count(*) from pg_policies where policyname='zz_preflight_probe'")" || die "could not confirm the probe rolled back"
  [ "$left" = 0 ] || die "probe left $left zz_preflight_probe policies behind — remove them before deploying"
  say "Probe ok, rolled back."
fi

if [ "$DRY" = 1 ]; then
  if [ "${#function_secret_names[@]}" -gt 0 ]; then
    say "Dry run: function secrets that may need setting: ${function_secret_names[*]}"
  fi
  say "Dry run: stopping before backup and push."
  exit 0
fi

# ── 5. Confirm, take and verify the recovery backup, then push migrations.
if [ "${#pending[@]}" -gt 0 ] || [ "${#functions_to_deploy[@]}" -gt 0 ]; then
  if [ "$YES" != 1 ]; then
    printf 'Deploy %d migration(s) and %d edge function(s) to staging? [y/N] ' \
      "${#pending[@]}" "${#functions_to_deploy[@]}" >&2
    ans=""; read -r ans || true
    case "$ans" in y|Y|yes|YES) ;; *) die "not confirmed — nothing was pushed or deployed" ;; esac
  fi
fi
if [ "${#pending[@]}" -gt 0 ]; then
  commit="$(git -C "$ROOT" rev-parse --short HEAD)"
  dump_dir="${STAGING_PREDEPLOY_DUMP_DIR:-$HOME/backups/gordi-mos-staging}"
  ops_predeploy_dump "$dump_dir" deploy-staging "$CONN" "$commit" || exit 1
  dump="$OPS_PREDEPLOY_DUMP_PATH"
  set +e; out="$(supabase --workdir "$ROOT" db push --yes --db-url "$CONN" 2>&1 </dev/null)"; rc=$?; set -e
  printf '%s\n' "$out" | ops_redact
  [ "$rc" -eq 0 ] || die "supabase db push failed (exit $rc) — the pre-push dump is at $dump"
fi

# ── 6. Verify the database before anything else ships (owner order: DB, then edge, then frontend).
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
so="$(sqlq "select count(*) filter (where is_sample) || '/' || count(*) filter (where is_sample and shared.is_sample_org_shape(id, name)) from shared.orgs")" || so="?"
[ "$so" = 1/1 ] || fail "expected exactly one flagged org, shaped like the sample org (flagged/sample-shaped: '$so')"
say "verify: max version $remote (newest local $newest) · db_pre_request $pre · trusted clients $tc · sample orgs $so"
[ "$bad" = 0 ] || die "verification failed — staging is NOT in the expected state"

# ── 7. Set changed functions' secrets before deployment, then smoke-check the handler.
find_function_secret_location() {
  local wanted="$1" i
  for ((i=0; i<${#FUNCTION_SECRET_NAMES[@]}; i++)); do
    if [ "${FUNCTION_SECRET_NAMES[$i]}" = "$wanted" ]; then
      printf '%s' "${FUNCTION_SECRET_LOCATIONS[$i]}"
      return 0
    fi
  done
  return 1
}

set_function_secrets() {
  local i trace_was_on=0 rc
  case "$-" in *x*) trace_was_on=1; set +x ;; esac
  if SUPABASE_ACCESS_TOKEN="$EDGE_ACCESS_TOKEN" supabase --workdir "$ROOT" secrets set \
    --env-file <(for ((i=0; i<${#missing_function_secret_names[@]}; i++)); do
      printf '%s=%s\n' "${missing_function_secret_names[$i]}" "${missing_function_secret_values[$i]}"
    done) --project-ref "$PROJECT_REF" >/dev/null 2>/dev/null </dev/null; then
    rc=0
  else
    rc=$?
  fi
  [ "$trace_was_on" = 0 ] || set -x
  return "$rc"
}

if [ "${#functions_to_deploy[@]}" -gt 0 ]; then
  unset EDGE_ACCESS_TOKEN
  EDGE_ACCESS_TOKEN="$(op-get.sh "$FUNCTIONS_OP_ITEM" "$FUNCTIONS_OP_VAULT" "$FUNCTIONS_OP_FIELD" 2>/dev/null </dev/null)" || \
    die "op-get.sh could not read the staging Supabase access token"
  [ -n "$EDGE_ACCESS_TOKEN" ] || die "the staging Supabase access token is empty"
  SECRETS+=("$EDGE_ACCESS_TOKEN")

  secrets_json="$(SUPABASE_ACCESS_TOKEN="$EDGE_ACCESS_TOKEN" supabase --workdir "$ROOT" secrets list --project-ref "$PROJECT_REF" -o json 2>"$errf" </dev/null)" || \
    die "could not list staging function secret names"
  case "$secrets_json" in \[*\]) ;; *) die "could not read staging function secret names" ;; esac
  staging_function_secret_names=()
  while IFS= read -r name; do
    [ -n "$name" ] && staging_function_secret_names+=("$name")
  done < <(printf '%s\n' "$secrets_json" | grep -Eo '"name"[[:space:]]*:[[:space:]]*"[^"]+"' | sed -E 's/.*"([^"]+)"$/\1/')

  missing_function_secret_names=() missing_function_secret_items=() missing_function_secret_vaults=() missing_function_secret_fields=()
  for name in "${function_secret_names[@]+"${function_secret_names[@]}"}"; do
    already_set=0
    for staged_name in "${staging_function_secret_names[@]+"${staging_function_secret_names[@]}"}"; do
      [ "$staged_name" != "$name" ] || { already_set=1; break; }
    done
    [ "$already_set" = 1 ] && continue

    mapping_key="STAGING_FN_SECRET_${name}"
    location="$(find_function_secret_location "$name")" || die "missing mapping for $name; add $mapping_key to supabase/op.staging.env"
    IFS='|' read -r item vault field extra <<< "$location"
    [ -n "$item" ] && [ -n "$vault" ] && [ -n "$field" ] && [ -z "${extra:-}" ] || \
      die "missing mapping for $name; add $mapping_key to supabase/op.staging.env"
    missing_function_secret_names+=("$name")
    missing_function_secret_items+=("$item")
    missing_function_secret_vaults+=("$vault")
    missing_function_secret_fields+=("$field")
  done

  missing_function_secret_values=()
  for ((i=0; i<${#missing_function_secret_names[@]}; i++)); do
    name="${missing_function_secret_names[$i]}"
    value="$(op-get.sh "${missing_function_secret_items[$i]}" "${missing_function_secret_vaults[$i]}" "${missing_function_secret_fields[$i]}" 2>/dev/null </dev/null)" || \
      die "op-get.sh could not read the staging function secret $name"
    [ -n "$value" ] || die "the staging function secret $name is empty"
    missing_function_secret_values+=("$value")
  done

  if [ "${#missing_function_secret_names[@]}" -gt 0 ]; then
    set_function_secrets || die "supabase secrets set failed"
    say "function secrets set: ${missing_function_secret_names[*]}"
  else
    say "function secrets: none missing"
  fi
  unset missing_function_secret_values value

  for fn in "${functions_to_deploy[@]}"; do
    set +e
    out="$(PGPASSWORD= SUPABASE_ACCESS_TOKEN="$EDGE_ACCESS_TOKEN" supabase --workdir "$ROOT" functions deploy "$fn" --no-verify-jwt --project-ref "$PROJECT_REF" 2>&1 </dev/null)"
    rc=$?
    set -e
    if [ "$rc" -ne 0 ]; then printf '%s\n' "$out" | ops_redact >&2; die "edge function deploy failed for $fn (exit $rc)"; fi
    say "Deployed edge function $fn."
    : > "$errf.body"
    status="$(printf 'url = "%s/%s"\nrequest = "POST"\nheader = "Content-Type: application/json"\ndata = "{}"\n' "$edge_base" "$fn" | \
      curl --config - --silent --max-time 20 --output "$errf.body" --write-out '%{http_code}' 2>/dev/null)" || \
      die "unauthenticated POST smoke check failed for $fn"
    if [ "$status" != 401 ] || ! grep -Fq '"error":"UNAUTHORIZED"' "$errf.body"; then
      die "unauthenticated POST smoke check failed for $fn (expected handler 401)"
    fi
    say "Unauthenticated POST smoke check passed for $fn (handler 401)."

    origin_index=0
    for origin in "${function_origins[@]}"; do
      origin_index=$((origin_index+1))
      status="$(printf 'url = "%s/%s"\nrequest = "OPTIONS"\nheader = "Origin: %s"\nheader = "Access-Control-Request-Method: POST"\nheader = "Access-Control-Request-Headers: authorization, content-type"\n' "$edge_base" "$fn" "$origin" | \
        curl --config - --silent --max-time 20 --dump-header "$errf.headers" --output /dev/null --write-out '%{http_code}' 2>/dev/null)" || \
        die "CORS preflight smoke check failed for $fn (allowed origin $origin_index)"
      case "$status" in 2??) ;; *) die "CORS preflight smoke check failed for $fn (allowed origin $origin_index, HTTP $status)" ;; esac
      echoed_origin="$(awk 'tolower($0) ~ /^access-control-allow-origin:/ {sub(/^[^:]*:[[:space:]]*/, ""); sub(/\r$/, ""); print; exit}' "$errf.headers")"
      [ "$echoed_origin" = "$origin" ] || die "CORS preflight smoke check failed for $fn (allowed origin $origin_index was not echoed)"
    done
    say "CORS preflight smoke checks passed for $fn (${#function_origins[@]} allowed origins)."
  done
  unset EDGE_ACCESS_TOKEN
fi

# ── 9. Promotion PR: gh-post accepts a staging PR only from a checkout on branch main.
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
