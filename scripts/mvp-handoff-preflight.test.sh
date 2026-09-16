#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PREFLIGHT="$ROOT/scripts/mvp-handoff-preflight.sh"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/mvp-handoff-preflight.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

PASS=0
FAIL=0

ok() {
  PASS=$((PASS + 1))
  printf 'ok %d - %s\n' "$PASS" "$1"
}

bad() {
  FAIL=$((FAIL + 1))
  printf 'not ok - %s\n' "$1" >&2
}

json_assert() {
  local file="$1"
  local expression="$2"
  python3 - "$file" "$expression" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    value = json.load(handle)
if not eval(sys.argv[2], {"__builtins__": {}}, {"value": value}):
    raise SystemExit(f"assertion failed: {sys.argv[2]}\nJSON: {value!r}")
PY
}

write_tool_shims() {
  local bin="$1"
  local apply_tool
  mkdir -p "$bin"
  for tool in node npm uv supabase docker pi; do
    apply_tool="$bin/$tool"
    printf '#!/usr/bin/env bash\ncase "${1:-}" in\n  --version|version) printf "%%s\\n" "${FAKE_%s_VERSION:-ok}" ;;\n  *) exit 0 ;;\nesac\n' "$(printf '%s' "$tool" | tr '[:lower:]' '[:upper:]')" > "$apply_tool"
    chmod +x "$apply_tool"
  done
  cat > "$bin/gh" <<'GH'
#!/usr/bin/env bash
if [ "${FAKE_GH_MODE:-online}" = "offline" ]; then
  echo "network unavailable" >&2
  exit 1
fi
printf '%s\n' '{"number":855,"state":"OPEN","url":"https://example.invalid/issues/855"}'
GH
  chmod +x "$bin/gh"
}

write_checkpoint() {
  local repo="$1"
  local expected_sha="$2"
  local active_json="${3:-[]}"
  local live_status="${4:-qualified}"
  local assessment_status="${5:-current}"
  local docs="$repo/docs"
  local skills="$repo/.claude"
  mkdir -p "$docs/takeover" "$docs/superpowers/plans" "$docs/reviews/mvp-ui-quantitative/current" "$skills/skill-overrides/handoff"
  printf 'takeover plan\n' > "$docs/superpowers/plans/2026-09-16-mvp-remediation-takeover.md"
  printf 'assessment\n' > "$docs/reviews/mvp-ui-quantitative/current/ASSESSMENT.md"
  printf '{"authority":true}\n' > "$docs/reviews/mvp-ui-quantitative/current/mockup-authority.json"
  printf 'remediation plan\n' > "$docs/superpowers/plans/2026-09-15-mvp-quantitative-ui-remediation.md"
  printf 'handoff override\n' > "$skills/skill-overrides/handoff/SKILL.md"

  python3 - "$docs" "$skills" "$expected_sha" "$active_json" "$live_status" "$assessment_status" <<'PY'
import hashlib
import json
import pathlib
import sys

docs = pathlib.Path(sys.argv[1])
skills = pathlib.Path(sys.argv[2])
expected = sys.argv[3]
active = json.loads(sys.argv[4])
live = sys.argv[5]
assessment_status = sys.argv[6]

files = [
    ("docs", "superpowers/plans/2026-09-16-mvp-remediation-takeover.md"),
    ("docs", "reviews/mvp-ui-quantitative/current/ASSESSMENT.md"),
    ("docs", "reviews/mvp-ui-quantitative/current/mockup-authority.json"),
    ("docs", "superpowers/plans/2026-09-15-mvp-quantitative-ui-remediation.md"),
    ("skills", "skill-overrides/handoff/SKILL.md"),
]
roots = {"docs": docs, "skills": skills}
required = []
for root, relative in files:
    digest = hashlib.sha256((roots[root] / relative).read_bytes()).hexdigest()
    required.append({"root": root, "path": relative, "sha256": digest})

manifest = {
    "schemaVersion": 1,
    "expectedDevSha": expected,
    "requiredFiles": required,
    "activeMvpBranches": active,
    "issue": {"number": 855, "requiredState": "OPEN"},
    "provider": {
        "route": "zai/glm-5.3-flash",
        "staticStatus": "catalogued",
        "liveStatus": live,
        "liveProbeTimestamp": "2026-09-16T00:00:00Z" if live == "qualified" else None,
    },
    "assessment": {
        "sessionId": "ready-session" if assessment_status == "current" else "historical-session",
        "candidateSha": expected if assessment_status == "current" else "1" * 40,
        "status": assessment_status,
    },
    "database": {
        "envFile": "mos-app/.env.e2e",
        "lockWrapper": "scripts/with-db-lock.sh",
    },
    "toolchain": {
        "nodeMajor": 22,
        "requiredExecutables": ["node", "npm", "python3", "uv", "supabase", "docker", "gh", "pi"],
    },
}
(docs / "takeover/mvp-remediation-checkpoint.json").write_text(
    json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
)
PY
}

new_fixture() {
  local name="$1"
  local case_dir="$TMP/$name"
  local bare="$case_dir/origin.git"
  local seed="$case_dir/seed"
  local repo="$case_dir/repo"
  mkdir -p "$case_dir"
  git init --bare --initial-branch=dev "$bare" >/dev/null
  git init --initial-branch=dev "$seed" >/dev/null
  git -C "$seed" config user.name Test
  git -C "$seed" config user.email test@example.invalid
  mkdir -p "$seed/mos-app" "$seed/scripts"
  printf 'docs/\n.claude/\nmos-app/.env.e2e\n' > "$seed/.gitignore"
  printf '22\n' > "$seed/mos-app/.nvmrc"
  printf '#!/usr/bin/env bash\nexit 0\n' > "$seed/scripts/with-db-lock.sh"
  chmod +x "$seed/scripts/with-db-lock.sh"
  git -C "$seed" add .
  git -C "$seed" commit -m seed >/dev/null
  git -C "$seed" remote add origin "$bare"
  git -C "$seed" push -u origin dev >/dev/null 2>&1
  git clone --branch dev "$bare" "$repo" >/dev/null 2>&1
  git -C "$repo" config user.name Test
  git -C "$repo" config user.email test@example.invalid
  mkdir -p "$repo/mos-app"
  printf 'safe fixture; no credentials\n' > "$repo/mos-app/.env.e2e"
  write_checkpoint "$repo" "$(git -C "$repo" rev-parse HEAD)"
  write_tool_shims "$case_dir/bin"
  printf '%s\n' "$repo"
}

run_preflight() {
  local repo="$1"
  local name="$2"
  shift 2
  local case_dir
  case_dir="$(dirname "$repo")"
  set +e
  (
    cd "$repo"
    env PATH="$case_dir/bin:$PATH" \
      FAKE_NODE_VERSION="${FAKE_NODE_VERSION:-v22.20.0}" \
      FAKE_NPM_VERSION="${FAKE_NPM_VERSION:-11.6.2}" \
      FAKE_UV_VERSION="${FAKE_UV_VERSION:-uv 0.6.14}" \
      FAKE_SUPABASE_VERSION="${FAKE_SUPABASE_VERSION:-2.105.0}" \
      FAKE_DOCKER_VERSION="${FAKE_DOCKER_VERSION:-Docker version 28.5.1}" \
      FAKE_PI_VERSION="${FAKE_PI_VERSION:-0.85.1}" \
      "$@" bash "$PREFLIGHT" > "$case_dir/$name.json" 2> "$case_dir/$name.err"
  )
  RUN_RC=$?
  set -e
  RUN_JSON="$case_dir/$name.json"
  RUN_ERR="$case_dir/$name.err"
}

expect_blocked() {
  local repo="$1"
  local name="$2"
  local blocker="$3"
  shift 3
  run_preflight "$repo" "$name" "$@"
  if [ "$RUN_RC" -ne 0 ] &&
     json_assert "$RUN_JSON" "value['ready'] is False and '$blocker' in value['blockers']" &&
     [ -s "$RUN_ERR" ]; then
    ok "$name"
  else
    bad "$name"
  fi
}

repo="$(new_fixture wrong-branch)"
git -C "$repo" checkout -b feature >/dev/null 2>&1
expect_blocked "$repo" wrong-branch primary-not-on-dev

repo="$(new_fixture behind-origin)"
git -C "$(dirname "$repo")/seed" pull --ff-only >/dev/null 2>&1
printf 'remote\n' >> "$(dirname "$repo")/seed/mos-app/.nvmrc"
git -C "$(dirname "$repo")/seed" add . && git -C "$(dirname "$repo")/seed" commit -m remote >/dev/null
git -C "$(dirname "$repo")/seed" push origin dev >/dev/null 2>&1
git -C "$repo" fetch origin >/dev/null 2>&1
expect_blocked "$repo" behind-origin dev-behind-origin

repo="$(new_fixture ahead-origin)"
printf 'local\n' > "$repo/local.txt"
git -C "$repo" add local.txt && git -C "$repo" commit -m local >/dev/null
write_checkpoint "$repo" "$(git -C "$repo" rev-parse HEAD)"
expect_blocked "$repo" ahead-origin dev-ahead-of-origin

repo="$(new_fixture dirty-checkout)"
printf 'dirty\n' >> "$repo/mos-app/.nvmrc"
expect_blocked "$repo" dirty-checkout public-checkout-dirty

repo="$(new_fixture missing-file)"
rm "$repo/docs/reviews/mvp-ui-quantitative/current/ASSESSMENT.md"
expect_blocked "$repo" missing-file required-private-file-missing

repo="$(new_fixture digest-mismatch)"
printf 'changed\n' >> "$repo/docs/reviews/mvp-ui-quantitative/current/ASSESSMENT.md"
expect_blocked "$repo" digest-mismatch required-private-file-digest-mismatch

repo="$(new_fixture stale-sha)"
write_checkpoint "$repo" "0000000000000000000000000000000000000000"
expect_blocked "$repo" stale-sha checkpoint-dev-sha-stale

repo="$(new_fixture active-work)"
active='[{"branch":"feat/pending","expectedSha":"2222222222222222222222222222222222222222","worktreePath":".claude/worktrees/pending","status":"pending"}]'
write_checkpoint "$repo" "$(git -C "$repo" rev-parse HEAD)" "$active"
expect_blocked "$repo" active-work active-mvp-work-remains

repo="$(new_fixture offline-tracker)"
expect_blocked "$repo" offline-tracker tracker-unverified FAKE_GH_MODE=offline
json_assert "$RUN_JSON" "value['tracker']['status'] == 'unverified'" || bad "offline tracker is explicitly unverified"

repo="$(new_fixture tool-mismatch)"
expect_blocked "$repo" tool-mismatch node-major-mismatch FAKE_NODE_VERSION=v20.18.0

repo="$(new_fixture missing-env)"
rm "$repo/mos-app/.env.e2e"
expect_blocked "$repo" missing-env database-prerequisites-unsafe

repo="$(new_fixture ready)"
case_dir="$(dirname "$repo")"
mv "$repo/docs" "$case_dir/private-docs"
mv "$repo/.claude" "$case_dir/private-skills"
before_status="$(git -C "$repo" status --porcelain --untracked-files=normal)"
run_preflight "$repo" ready \
  GORDI_DOCS_ROOT="$case_dir/private-docs" \
  GORDI_SKILL_ROOT="$case_dir/private-skills" \
  GORDI_TEST_CREDENTIAL=never-print-this-value
if [ "$RUN_RC" -eq 0 ] &&
   json_assert "$RUN_JSON" "value['ready'] is True and value['blockers'] == [] and value['nextAction'] == 'Begin MVP remediation takeover.'" &&
   json_assert "$RUN_JSON" "value['schemaVersion'] == 1 and value['tracker']['status'] == 'verified' and value['provider']['liveStatus'] == 'qualified'" &&
   json_assert "$RUN_JSON" "value['privateRoots']['docs']['source'] == 'override' and value['privateRoots']['skills']['source'] == 'override'" &&
   ! grep -q 'never-print-this-value\|private-docs\|private-skills' "$RUN_JSON" "$RUN_ERR" &&
   [ "$(git -C "$repo" status --porcelain --untracked-files=normal)" = "$before_status" ] &&
   [ "$(wc -l < "$RUN_JSON" | tr -d ' ')" = "1" ] &&
   [ -s "$RUN_ERR" ]; then
  ok "clean ready state emits one JSON object and a human summary"
else
  bad "clean ready state emits one JSON object and a human summary"
fi

if [ "$FAIL" -ne 0 ]; then
  printf '%d checks passed; %d failed\n' "$PASS" "$FAIL" >&2
  exit 1
fi
printf '%d checks passed\n' "$PASS"
