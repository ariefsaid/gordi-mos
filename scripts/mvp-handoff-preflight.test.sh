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
  local real_git
  real_git="$(command -v git)"
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
  cat > "$bin/git" <<GIT
#!/usr/bin/env bash
case "\$*" in
  *"for-each-ref --format="*)
    case "\${FAKE_GIT_INVENTORY_MODE:-}" in
      branches-fail) exit 1 ;;
      branches-timeout) sleep 16 ;;
    esac
    ;;
  *"worktree list --porcelain"*)
    case "\${FAKE_GIT_INVENTORY_MODE:-}" in
      worktrees-fail) exit 1 ;;
      worktrees-timeout) sleep 16 ;;
    esac
    ;;
esac
exec "$real_git" "\$@"
GIT
  chmod +x "$bin/git"
}

write_checkpoint() {
  local repo="$1"
  local expected_sha="$2"
  local items_json="${3:-[]}"
  local live_status="${4:-qualified}"
  local remediation_status="${5:-in-progress}"
  local final_status="${6:-pending}"
  local patterns_json="${7:-[\"^mvp-owned/.+$\"]}"
  local docs="$repo/docs"
  local skills="$repo/.claude"
  mkdir -p "$docs/takeover" "$docs/superpowers/plans" "$docs/reviews/mvp-ui-quantitative/current" "$skills/skill-overrides/handoff"
  printf 'takeover plan\n' > "$docs/superpowers/plans/2026-09-16-mvp-remediation-takeover.md"
  printf 'assessment\n' > "$docs/reviews/mvp-ui-quantitative/current/ASSESSMENT.md"
  printf '{"authority":true}\n' > "$docs/reviews/mvp-ui-quantitative/current/mockup-authority.json"
  printf 'remediation plan\n' > "$docs/superpowers/plans/2026-09-15-mvp-quantitative-ui-remediation.md"
  printf 'handoff override\n' > "$skills/skill-overrides/handoff/SKILL.md"

  python3 - "$docs" "$skills" "$expected_sha" "$items_json" "$live_status" "$remediation_status" "$final_status" "$patterns_json" <<'PY'
import hashlib
import json
import pathlib
import sys

docs = pathlib.Path(sys.argv[1])
skills = pathlib.Path(sys.argv[2])
expected = sys.argv[3]
items = json.loads(sys.argv[4])
live = sys.argv[5]
remediation_status = sys.argv[6]
final_status = sys.argv[7]
patterns = json.loads(sys.argv[8])

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
    "schemaVersion": 2,
    "expectedDevSha": expected,
    "requiredFiles": required,
    "mvpWork": {
        "branchPatterns": patterns,
        "items": items,
    },
    "issue": {"number": 855, "requiredState": "OPEN"},
    "provider": {
        "staticStatus": "qualified",
        "liveStatus": live,
        "liveProbeTimestamp": "2026-09-16T00:00:00Z" if live == "qualified" else None,
    },
    "assessment": {
        "baseline": {
            "sessionId": "historical-red-session",
            "candidateSha": "1" * 40,
            "status": "completed-red",
            "filePath": "reviews/mvp-ui-quantitative/current/ASSESSMENT.md",
            "fileSha256": next(item["sha256"] for item in required if item["path"] == "reviews/mvp-ui-quantitative/current/ASSESSMENT.md"),
        },
        "final": {
            "sessionId": "final-session" if final_status == "completed" else None,
            "candidateSha": expected if final_status == "completed" else None,
            "status": final_status,
        },
    },
    "remediation": {"status": remediation_status},
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

create_owned_worktree() {
  local repo="$1"
  local branch="$2"
  local relative="$3"
  local dirt="${4:-untracked}"
  git -C "$repo" branch "$branch"
  mkdir -p "$(dirname "$repo/$relative")"
  git -C "$repo" worktree add "$repo/$relative" "$branch" >/dev/null 2>&1
  case "$dirt" in
    clean) ;;
    tracked) printf 'unfinished\n' >> "$repo/$relative/mos-app/.nvmrc" ;;
    untracked) printf 'unfinished\n' > "$repo/$relative/untracked-product-file" ;;
    *) bad "unknown worktree dirt fixture: $dirt" ;;
  esac
}

create_detached_worktree() {
  local repo="$1"
  local relative="$2"
  git -C "$repo" worktree add --detach "$repo/$relative" HEAD >/dev/null 2>&1
}

malform_checkpoint() {
  local repo="$1"
  local mode="$2"
  python3 - "$repo/docs/takeover/mvp-remediation-checkpoint.json" "$mode" <<'PY'
import json
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
mode = sys.argv[2]
value = json.loads(path.read_text())
if mode == "numeric-digest":
    value["requiredFiles"][0]["sha256"] = 123
elif mode == "array-root":
    value["requiredFiles"][0]["root"] = ["docs"]
elif mode == "numeric-work-sha":
    value["mvpWork"]["items"] = [{
        "branch": "mvp-owned/malformed",
        "expectedSha": 123,
        "worktreePath": ".claude/worktrees/malformed",
        "disposition": "active",
    }]
elif mode == "numeric-provider-status":
    value["provider"]["staticStatus"] = 123
else:
    raise SystemExit(f"unknown mode: {mode}")
path.write_text(json.dumps(value, indent=2) + "\n")
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
create_owned_worktree "$repo" mvp-owned/pending .claude/worktrees/pending
active_sha="$(git -C "$repo" rev-parse mvp-owned/pending)"
active="[{\"branch\":\"mvp-owned/pending\",\"expectedSha\":\"$active_sha\",\"worktreePath\":\".claude/worktrees/pending\",\"disposition\":\"active\"}]"
write_checkpoint "$repo" "$(git -C "$repo" rev-parse HEAD)" "$active"
expect_blocked "$repo" active-work active-mvp-work-remains

repo="$(new_fixture omitted-active-work)"
create_owned_worktree "$repo" mvp-owned/omitted .claude/worktrees/omitted
expect_blocked "$repo" omitted-active-work mvp-work-unrecorded
json_assert "$RUN_JSON" "value['activeWork'][0]['disposition'] == 'unrecorded'" || bad "omitted MVP work is reported as unrecorded"

repo="$(new_fixture branch-only-owned-ref)"
git -C "$repo" branch codex/mvp-ref-only
expect_blocked "$repo" branch-only-owned-ref mvp-work-unrecorded
if json_assert "$RUN_JSON" "value['activeWork'][0]['worktreeStatus'] == 'missing' and value['activeWork'][0]['inventorySource'] == 'local-ref'"; then
  ok "branch-only owned refs are reported without a worktree"
else
  bad "branch-only owned refs are reported without a worktree"
fi

for lane in mvp design-baseline design-audit handoff cafe-books ui-quantitative; do
  repo="$(new_fixture "unrecorded-$lane")"
  branch="codex/${lane}-unrecorded"
  create_owned_worktree "$repo" "$branch" ".claude/worktrees/${lane}-unrecorded" clean
  write_checkpoint "$repo" "$(git -C "$repo" rev-parse HEAD)"
  expect_blocked "$repo" "unrecorded-$lane" mvp-work-unrecorded
  if json_assert "$RUN_JSON" "value['activeWork'][0]['branch'] == '$branch' and value['activeWork'][0]['inventorySource'] == 'local-ref'"; then
    ok "$lane ownership prefix is explicit in inventory evidence"
  else
    bad "$lane ownership prefix is explicit in inventory evidence"
  fi
done

repo="$(new_fixture unrecorded-owned-worktree-path)"
git -C "$repo" branch user/owned-worktree
git -C "$repo" worktree add "$repo/.claude/worktrees/mvp-path-only" user/owned-worktree >/dev/null 2>&1
run_preflight "$repo" unrecorded-owned-worktree-path
if [ "$RUN_RC" -eq 0 ] && json_assert "$RUN_JSON" "value['ready'] is True and value['activeWork'] == []"; then
  ok "ordinary user branch under a reserved path stays clear"
else
  bad "ordinary user branch under a reserved path stays clear"
fi

repo="$(new_fixture unrecorded-detached-review)"
create_detached_worktree "$repo" .claude/worktrees/review-123-spec
expect_blocked "$repo" unrecorded-detached-review detached-review-retained
if json_assert "$RUN_JSON" "value['nextAction'] == 'Remove retained detached review worktrees before handoff readiness.' and value['activeWork'][0]['requiredResolution'] == 'remove-before-ready' and 'mvp-work-unrecorded' in value['blockers'] and value['activeWork'][0]['disposition'] == 'unrecorded' and value['activeWork'][0]['inventorySource'] == 'detached-worktree' and value['activeWork'][0]['worktreePath'] == '.claude/worktrees/review-123-spec'"; then
  ok "detached review ownership is explicit in inventory evidence"
else
  bad "detached review ownership is explicit in inventory evidence"
fi
git -C "$repo" worktree remove "$repo/.claude/worktrees/review-123-spec" >/dev/null 2>&1
run_preflight "$repo" detached-review-removed
if [ "$RUN_RC" -eq 0 ] && json_assert "$RUN_JSON" "value['ready'] is True and value['activeWork'] == []"; then
  ok "removing a retained detached review reaches ready"
else
  bad "removing a retained detached review reaches ready"
fi

repo="$(new_fixture unrelated-inventory-controls)"
git -C "$repo" branch user/mvp-unrelated
git -C "$repo" worktree add "$repo/.claude/worktrees/user-owned" user/mvp-unrelated >/dev/null 2>&1
git -C "$repo" branch codex/feature-unrelated
git -C "$repo" worktree add "$repo/.claude/worktrees/scratch" codex/feature-unrelated >/dev/null 2>&1
git -C "$repo" branch feat/feature-unrelated
git -C "$repo" worktree add "$repo/.claude/worktrees/feat-owned" feat/feature-unrelated >/dev/null 2>&1
git -C "$repo" branch codex/mvp_user_owned
git -C "$repo" branch feat/design-audit_user_owned
create_detached_worktree "$repo" .claude/worktrees/review-user-experiment
run_preflight "$repo" unrelated-inventory-controls
if [ "$RUN_RC" -eq 0 ] && json_assert "$RUN_JSON" "value['ready'] is True and value['blockers'] == []"; then
  ok "unrelated branches and worktrees do not trigger MVP ownership"
else
  bad "unrelated branches and worktrees do not trigger MVP ownership"
fi

for inventory_mode in branches-fail branches-timeout worktrees-fail worktrees-timeout; do
  repo="$(new_fixture "inventory-$inventory_mode")"
  expect_blocked "$repo" "inventory-$inventory_mode" inventory-unverified "FAKE_GIT_INVENTORY_MODE=$inventory_mode"
  if json_assert "$RUN_JSON" "value['nextAction'] == 'Restore read-only Git branch/worktree inventory and rerun the preflight.'" &&
     case "$inventory_mode" in
       branches-fail) json_assert "$RUN_JSON" "value['inventory']['status'] == 'unverified' and value['inventory']['branches']['status'] == 'failed'" ;;
       branches-timeout) json_assert "$RUN_JSON" "value['inventory']['status'] == 'unverified' and value['inventory']['branches']['status'] == 'timeout'" ;;
       worktrees-fail) json_assert "$RUN_JSON" "value['inventory']['status'] == 'unverified' and value['inventory']['worktrees']['status'] == 'failed'" ;;
       worktrees-timeout) json_assert "$RUN_JSON" "value['inventory']['status'] == 'unverified' and value['inventory']['worktrees']['status'] == 'timeout'" ;;
     esac; then
    ok "$inventory_mode emits explicit inventory evidence"
  else
    bad "$inventory_mode emits explicit inventory evidence"
  fi
done

repo="$(new_fixture unverified-disposition)"
create_owned_worktree "$repo" mvp-owned/merged .claude/worktrees/merged clean
merged_sha="$(git -C "$repo" rev-parse mvp-owned/merged)"
merged="[{\"branch\":\"mvp-owned/merged\",\"expectedSha\":\"$merged_sha\",\"worktreePath\":\".claude/worktrees/merged\",\"disposition\":\"merged\",\"integratedDevSha\":\"2222222222222222222222222222222222222222\"}]"
write_checkpoint "$repo" "$(git -C "$repo" rev-parse HEAD)" "$merged"
expect_blocked "$repo" unverified-disposition mvp-disposition-unverified

for dirt in untracked tracked; do
  repo="$(new_fixture "dirty-merged-$dirt")"
  create_owned_worktree "$repo" mvp-owned/merged .claude/worktrees/merged "$dirt"
  merged_sha="$(git -C "$repo" rev-parse mvp-owned/merged)"
  integrated_sha="$(git -C "$repo" rev-parse HEAD)"
  merged="[{\"branch\":\"mvp-owned/merged\",\"expectedSha\":\"$merged_sha\",\"worktreePath\":\".claude/worktrees/merged\",\"disposition\":\"merged\",\"integratedDevSha\":\"$integrated_sha\"}]"
  write_checkpoint "$repo" "$integrated_sha" "$merged"
  before_worktree_status="$(git -C "$repo/.claude/worktrees/merged" status --porcelain --untracked-files=normal)"
  expect_blocked "$repo" "dirty-merged-$dirt" mvp-worktree-dirty
  if json_assert "$RUN_JSON" "value['activeWork'][0]['worktreeCleanStatus'] == 'dirty'" &&
     [ "$(git -C "$repo/.claude/worktrees/merged" status --porcelain --untracked-files=normal)" = "$before_worktree_status" ]; then
    ok "dirty merged $dirt worktree is reported and preserved"
  else
    bad "dirty merged $dirt worktree is reported and preserved"
  fi
done

repo="$(new_fixture verified-merged)"
create_owned_worktree "$repo" mvp-owned/merged .claude/worktrees/merged clean
merged_sha="$(git -C "$repo" rev-parse mvp-owned/merged)"
integrated_sha="$(git -C "$repo" rev-parse HEAD)"
merged="[{\"branch\":\"mvp-owned/merged\",\"expectedSha\":\"$merged_sha\",\"worktreePath\":\".claude/worktrees/merged\",\"disposition\":\"merged\",\"integratedDevSha\":\"$integrated_sha\"}]"
write_checkpoint "$repo" "$integrated_sha" "$merged"
run_preflight "$repo" verified-merged
if [ "$RUN_RC" -eq 0 ] && json_assert "$RUN_JSON" "value['ready'] is True and value['activeWork'] == []"; then
  ok "verified merged disposition permits a clean retained MVP worktree"
else
  bad "verified merged disposition permits a clean retained MVP worktree"
fi

for malformed in numeric-digest array-root numeric-work-sha numeric-provider-status; do
  repo="$(new_fixture "malformed-$malformed")"
  malform_checkpoint "$repo" "$malformed"
  expect_blocked "$repo" "malformed-$malformed" checkpoint-invalid
  if [ "$(wc -l < "$RUN_JSON" | tr -d ' ')" = "1" ] && ! grep -q 'Traceback' "$RUN_ERR"; then
    ok "$malformed emits one JSON object without a traceback"
  else
    bad "$malformed emits one JSON object without a traceback"
  fi
done

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
git -C "$repo" branch unrelated/retained
git -C "$repo" worktree add "$case_dir/unrelated-retained" unrelated/retained >/dev/null 2>&1
mv "$repo/docs" "$case_dir/private-docs"
mv "$repo/.claude" "$case_dir/private-skills"
before_status="$(git -C "$repo" status --porcelain --untracked-files=normal)"
run_preflight "$repo" ready \
  GORDI_DOCS_ROOT="$case_dir/private-docs" \
  GORDI_SKILL_ROOT="$case_dir/private-skills" \
  GORDI_TEST_CREDENTIAL=never-print-this-value
if [ "$RUN_RC" -eq 0 ] &&
   json_assert "$RUN_JSON" "value['ready'] is True and value['blockers'] == [] and value['nextAction'] == 'Begin MVP remediation takeover.'" &&
   json_assert "$RUN_JSON" "value['schemaVersion'] == 2 and value['tracker']['status'] == 'verified' and value['provider'] == {'staticStatus': 'qualified', 'liveStatus': 'qualified', 'liveProbeTimestamp': '2026-09-16T00:00:00Z'}" &&
   json_assert "$RUN_JSON" "value['inventory']['status'] == 'verified' and value['inventory']['branches']['status'] == 'verified' and value['inventory']['worktrees']['status'] == 'verified'" &&
   json_assert "$RUN_JSON" "value['checkpoint']['assessment']['baseline']['status'] == 'completed-red' and value['checkpoint']['assessment']['final']['status'] == 'pending' and value['checkpoint']['remediation']['status'] == 'in-progress'" &&
   json_assert "$RUN_JSON" "value['privateRoots']['docs']['source'] == 'override' and value['privateRoots']['skills']['source'] == 'override'" &&
   ! grep -q 'never-print-this-value\|private-docs\|private-skills' "$RUN_JSON" "$RUN_ERR" &&
   [ "$(git -C "$repo" status --porcelain --untracked-files=normal)" = "$before_status" ] &&
   [ "$(wc -l < "$RUN_JSON" | tr -d ' ')" = "1" ] &&
   [ -s "$RUN_ERR" ]; then
  ok "clean ready state ignores unrelated retained work and emits one JSON object"
else
  bad "clean ready state ignores unrelated retained work and emits one JSON object"
fi

if [ "$FAIL" -ne 0 ]; then
  printf '%d checks passed; %d failed\n' "$PASS" "$FAIL" >&2
  exit 1
fi
printf '%d checks passed\n' "$PASS"
