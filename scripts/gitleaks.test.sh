#!/usr/bin/env bash
# Self-test the staged-secret hook and the pinned pull-request scanner gate.
set -uo pipefail
cd "$(dirname "$0")/.." || exit
HOOK="$(pwd)/.githooks/pre-commit"
BASH_BIN="$(command -v bash)"
WORKFLOW="$(pwd)/.github/workflows/guards.yml"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
pass=0
fail=0

report() {
  local name="$1" passed="$2"
  if [ "$passed" = true ]; then
    pass=$((pass + 1)); printf '  ok    %s\n' "$name"
  else
    fail=$((fail + 1)); printf '  FAIL  %s\n' "$name"
  fi
}

mkdir -p "$tmp/repo" "$tmp/stub" "$tmp/no-gitleaks"
git init -q "$tmp/repo"
git -C "$tmp/repo" config user.email test@example.invalid
git -C "$tmp/repo" config user.name 'Gitleaks Test'
printf 'baseline\n' > "$tmp/repo/file.txt"
git -C "$tmp/repo" add file.txt
git -C "$tmp/repo" commit -qm baseline
printf 'staged change\n' > "$tmp/repo/file.txt"
git -C "$tmp/repo" add file.txt

cat > "$tmp/stub/gitleaks" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" > "$GITLEAKS_LOG"
exit "${GITLEAKS_EXIT:-0}"
STUB
chmod +x "$tmp/stub/gitleaks"
export GITLEAKS_LOG="$tmp/gitleaks.log"

output="$(cd "$tmp/repo" && PATH="$tmp/stub:$PATH" "$BASH_BIN" "$HOOK" 2>&1)"
rc=$?
gitleaks_args=""
[ -f "$GITLEAKS_LOG" ] && gitleaks_args="$(<"$GITLEAKS_LOG")"
report "installed gitleaks scans staged changes" "$([ "$rc" -eq 0 ] && [ "$gitleaks_args" = 'git --staged --redact --no-banner' ] && [[ "$output" == *'gitleaks: staged changes clean'* ]] && echo true || echo false)"

output="$(cd "$tmp/repo" && PATH="$tmp/stub:$PATH" GITLEAKS_EXIT=2 "$BASH_BIN" "$HOOK" 2>&1)"
rc=$?
report "gitleaks findings block the commit" "$([ "$rc" -eq 1 ] && [[ "$output" == *'gitleaks scan failed on staged changes'* ]] && echo true || echo false)"

for utility in git grep sed cat; do
  utility_path="$(command -v "$utility")"
  ln -s "$utility_path" "$tmp/no-gitleaks/$utility"
done
output="$(cd "$tmp/repo" && PATH="$tmp/no-gitleaks" "$BASH_BIN" "$HOOK" 2>&1)"
rc=$?
report "missing gitleaks prints a skip notice without blocking" "$([ "$rc" -eq 0 ] && [[ "$output" == *'gitleaks not installed — secret scan SKIPPED'* ]] && echo true || echo false)"

scanner_job="$(awk '/^  gitleaks:$/ { in_job = 1 } /^  guard-self-tests:$/ { in_job = 0 } in_job { print }' "$WORKFLOW")"
report "CI scans every pull request in a failing gitleaks job" "$(grep -Fq '  pull_request:' "$WORKFLOW" && [ -n "$scanner_job" ] && ! grep -Eq '^[[:space:]]+(if|continue-on-error):' <<< "$scanner_job" && echo true || echo false)"
report "CI can read PR commits and fetches complete history" "$(grep -Fq '      pull-requests: read' <<< "$scanner_job" && grep -Fq '          fetch-depth: 0' <<< "$scanner_job" && echo true || echo false)"
report "CI uses a full-SHA-pinned gitleaks action" "$(grep -Eq 'uses: gitleaks/gitleaks-action@[0-9a-f]{40} # v[0-9.]+' "$WORKFLOW" && echo true || echo false)"
report "CI pins the gitleaks scanner version" "$(grep -Fq 'GITLEAKS_VERSION: 8.30.1' "$WORKFLOW" && echo true || echo false)"

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
