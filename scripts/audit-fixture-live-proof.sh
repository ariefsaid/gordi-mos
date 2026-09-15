#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ "${MOS_DB_LOCK_HELD:-}" != "1" ]; then
  exec "$ROOT/scripts/with-db-lock.sh" "$0" "$@"
fi

export AUDIT_FIXTURE_CANDIDATE_SHA="$(git -C "$ROOT" rev-parse HEAD)"
export AUDIT_FIXTURE_SESSION_ID="$(python3 - <<'PY'
import secrets
print(secrets.token_hex(4))
PY
)"

common_git_dir="$(git -C "$ROOT" rev-parse --path-format=absolute --git-common-dir)"
canonical_root="$(dirname "$common_git_dir")"
if [ -f "$ROOT/mos-app/.env.e2e" ]; then
  export AUDIT_FIXTURE_ENV_FILE="$ROOT/mos-app/.env.e2e"
elif [ -f "$canonical_root/mos-app/.env.e2e" ]; then
  export AUDIT_FIXTURE_ENV_FILE="$canonical_root/mos-app/.env.e2e"
else
  echo "audit-fixture-live-proof: local E2E environment file is unavailable" >&2
  exit 2
fi

cd "$ROOT/mos-app"
exec npx playwright test --config playwright.audit-fixture-live.config.ts
