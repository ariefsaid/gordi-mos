#!/usr/bin/env bash
# Self-test for scripts/lane-exempt.sh — category gate, build-lane audit post (no post = no
# marker), and the marker the agent-dispatch hook honors.
set -uo pipefail
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0

# Scratch repo with its own scripts/ dir: lane-exempt calls its sibling gh-post.sh, which we stub.
g() { git -C "$tmp/repo" -c user.email=t@t -c user.name=t "$@"; }
git init -q "$tmp/repo"
g commit -qm init --allow-empty
gitdir="$(g rev-parse --absolute-git-dir)"
mkdir -p "$tmp/repo/scripts"
cp scripts/lane-exempt.sh "$tmp/repo/scripts/"
cat > "$tmp/repo/scripts/gh-post.sh" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$tmp/post-calls"
exit \${GH_POST_RC:-0}
EOF
chmod +x "$tmp/repo/scripts/gh-post.sh"

check() { # $1 name · $2 rc · $3 marker yes/no · $4 posted yes/no · args…
  local name="$1" want="$2" mwant="$3" pwant="$4"; shift 4
  rm -f "$gitdir/lane-exempt" "$tmp/post-calls"
  (cd "$tmp/repo" && bash scripts/lane-exempt.sh "$@") >/dev/null 2>&1; local rc=$?
  local m=no p=no
  [ -f "$gitdir/lane-exempt" ] && m=yes
  [ -s "$tmp/post-calls" ] && p=yes
  if [ "$rc" -eq "$want" ] && [ "$m" = "$mwant" ] && [ "$p" = "$pwant" ]; then
    pass=$((pass+1)); printf '  ok    %s\n' "$name"
  else
    fail=$((fail+1)); printf '  FAIL  %s — rc=%s/%s marker=%s/%s posted=%s/%s\n' "$name" "$rc" "$want" "$m" "$mwant" "$p" "$pwant"
  fi
}

check "unknown category refused" 1 no no 42 yolo "because"
check "research lane: local marker, no post" 0 yes no - research "reading up"
check "review lane: local marker, no post" 0 yes no - review "battery"
check "build lane without issue number refused" 1 no no - diagnosis "broken thing"
check "build lane without reason refused" 1 no no 42 money-auth
check "build lane posts in-flight marker AND writes marker" 0 yes yes 42 money-auth "RLS adversarial"
export GH_POST_RC=1
check "build lane where post fails leaves NO marker" 1 no yes 42 diagnosis "flaky seed"
unset GH_POST_RC

# Marker format: "<epoch> <category> <issue> <reason…>" — what the hook parses.
(cd "$tmp/repo" && bash scripts/lane-exempt.sh - review "battery") >/dev/null 2>&1
read -r ts cat rest < "$gitdir/lane-exempt"
if [ "$cat" = "review" ] && [ "$ts" -gt 0 ] 2>/dev/null; then
  pass=$((pass+1)); printf '  ok    marker format parseable by the hook\n'
else
  fail=$((fail+1)); printf '  FAIL  marker format: %s\n' "$(cat "$gitdir/lane-exempt")"
fi

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
