#!/usr/bin/env bash
# Self-test for scripts/gh-shim/gh — the PATH-level write firewall for non-Claude harnesses:
# reads pass to the real gh, writes refuse, gh-post's GH_POST_DOOR passes through.
set -uo pipefail
cd "$(dirname "$0")/.."
SHIM_DIR="$(pwd)/scripts/gh-shim"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0

mkdir -p "$tmp/realbin"
cat > "$tmp/realbin/gh" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$tmp/real-calls"
EOF
chmod +x "$tmp/realbin/gh"

check() { # $1 name · $2 expected rc · $3 real-called yes/no · args…
  local name="$1" want="$2" rwant="$3"; shift 3
  rm -f "$tmp/real-calls"
  PATH="$SHIM_DIR:$tmp/realbin:/usr/bin:/bin" gh "$@" >/dev/null 2>&1; local rc=$?
  local rgot=no; [ -s "$tmp/real-calls" ] && rgot=yes
  if [ "$rc" -eq "$want" ] && [ "$rgot" = "$rwant" ]; then pass=$((pass+1)); printf '  ok    %s\n' "$name"
  else fail=$((fail+1)); printf '  FAIL  %s — rc=%s/%s real=%s/%s\n' "$name" "$rc" "$want" "$rgot" "$rwant"; fi
}

check "read (issue view) passes to real gh" 0 yes issue view 5 --comments
check "read (pr checks) passes" 0 yes pr checks 5
check "read-mode api passes" 0 yes api repos/x/y/issues --jq .id
check "pr merge passes (the carve-out)" 0 yes pr merge 5 --auto --squash
check "issue comment refused" 1 no issue comment 5 --body x
check "pr create refused" 1 no pr create --title t
check "global-flag dodge refused (-R value skipped)" 1 no -R other/repo issue comment 5 --body x
check "gist refused" 1 no gist create file.md
check "write-mode api (-F) refused" 1 no api repos/x/y/issues -F body=x
check "write-mode api (--method POST) refused" 1 no api repos/x/y/z --method POST

rm -f "$tmp/real-calls"
PATH="$SHIM_DIR:$tmp/realbin:/usr/bin:/bin" GH_POST_DOOR=1 gh issue comment 5 --body x >/dev/null 2>&1
if [ -s "$tmp/real-calls" ]; then pass=$((pass+1)); printf '  ok    GH_POST_DOOR=1 write passes through (gh-post door)\n'
else fail=$((fail+1)); printf '  FAIL  door bypass did not reach real gh\n'; fi

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
