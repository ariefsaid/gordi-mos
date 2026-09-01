#!/usr/bin/env bash
# Self-test for scripts/worktree-npm-seed.sh — hardlink seeding on a lockfile match (with the
# hardlink itself proven, not assumed), fallback to npm ci on any mismatch or missing source,
# partial-copy cleanup before that fallback, and no-op on an already-current target.
set -uo pipefail
cd "$(dirname "$0")/.."
SCRIPT="$(pwd)/scripts/worktree-npm-seed.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0
ok()  { pass=$((pass+1)); printf '  ok    %s\n' "$1"; }
bad() { fail=$((fail+1)); printf '  FAIL  %s\n%s\n' "$1" "${2:-}"; }

inode() { stat -f '%i' "$1" 2>/dev/null || stat -c '%i' "$1"; }

# A throwaway repo + a real linked worktree, so --git-common-dir resolves exactly as it does
# for a drive worktree under .claude/worktrees/.
repo="$tmp/repo"
git init -q "$repo"
git -C "$repo" config user.email t@t
git -C "$repo" config user.name t
mkdir -p "$repo/mos-app"
echo '{"lockfileVersion":3}' > "$repo/mos-app/package-lock.json"
git -C "$repo" add mos-app/package-lock.json
git -C "$repo" commit -qm init

wt="$tmp/wt"
git -C "$repo" worktree add -q -b feat "$wt" HEAD

# A fake npm on PATH so a fallback is provable without a real install: it records its args and
# working directory, and — since a genuine node_modules never gets built from stubbed npm —
# leaves the target's node_modules absent, which the assertions below also check.
fakebin="$tmp/fakebin"
mkdir -p "$fakebin"
cat > "$fakebin/npm" <<EOF
#!/usr/bin/env bash
printf '%s\t%s\n' "\$(pwd)" "\$*" >> "$tmp/npm-calls"
EOF
chmod +x "$fakebin/npm"
run() { PATH="$fakebin:$PATH" bash "$SCRIPT" "$@"; }

seed_main_nm() {
  # A minimal but non-trivial node_modules: a nested package (proves recursion) plus the
  # .package-lock.json state file npm ci itself would write.
  rm -rf "$repo/mos-app/node_modules"
  mkdir -p "$repo/mos-app/node_modules/.bin" "$repo/mos-app/node_modules/pkg-a"
  for b in tsc eslint stylelint vitest vite; do
    printf '#!/bin/sh\n' > "$repo/mos-app/node_modules/.bin/$b"
    chmod +x "$repo/mos-app/node_modules/.bin/$b"
  done
  echo 'module.exports = 1;' > "$repo/mos-app/node_modules/pkg-a/index.js"
  cp "$repo/mos-app/package-lock.json" "$repo/mos-app/node_modules/.package-lock.json"
}

### 1. seeded-on-match: identical lockfiles, current main install → hardlink, no npm call.
seed_main_nm
rm -f "$tmp/npm-calls"
out="$(run "$wt" 2>&1)"; rc=$?
[ "$rc" -eq 0 ] && ok "seeded-on-match: exit 0" || bad "seeded-on-match: exit 0" "rc=$rc out=$out"
[ -x "$wt/mos-app/node_modules/.bin/tsc" ] && ok "seeded-on-match: tsc present in target" \
  || bad "seeded-on-match: tsc present in target"
[ ! -f "$tmp/npm-calls" ] && ok "seeded-on-match: npm ci never invoked" \
  || bad "seeded-on-match: npm ci never invoked" "$(cat "$tmp/npm-calls" 2>/dev/null)"
# Red-first: this is the one assertion that distinguishes a hardlink seed from a plain copy —
# a `cp -a` (no -l) would pass every check above while silently doubling disk and drifting from
# main on the next `npm ci`. Only same-inode proves the link.
src_i="$(inode "$repo/mos-app/node_modules/pkg-a/index.js")"
dst_i="$(inode "$wt/mos-app/node_modules/pkg-a/index.js")"
[ -n "$src_i" ] && [ "$src_i" = "$dst_i" ] && ok "seeded-on-match: hardlinked (same inode)" \
  || bad "seeded-on-match: hardlinked (same inode)" "main=$src_i target=$dst_i"
# The state-file copy must NOT share main's inode (it was deliberately re-copied so a later
# touch/rewrite in the target can never mutate the main checkout's own state file).
state_src_i="$(inode "$repo/mos-app/node_modules/.package-lock.json")"
state_dst_i="$(inode "$wt/mos-app/node_modules/.package-lock.json")"
[ "$state_src_i" != "$state_dst_i" ] && ok "seeded-on-match: state file is a real copy, not linked" \
  || bad "seeded-on-match: state file is a real copy, not linked"
# And pre-pr-verify's own staleness test must read the seeded tree as current.
[ ! "$wt/mos-app/package-lock.json" -nt "$wt/mos-app/node_modules/.package-lock.json" ] \
  && ok "seeded-on-match: state file not stale by pre-pr-verify's test" \
  || bad "seeded-on-match: state file not stale by pre-pr-verify's test"

### 2. idempotent no-op: run again on an already-seeded target — no fallback, says so.
rm -f "$tmp/npm-calls"
out2="$(run "$wt" 2>&1)"; rc2=$?
[ "$rc2" -eq 0 ] && ok "idempotent: exit 0" || bad "idempotent: exit 0" "rc=$rc2"
printf '%s' "$out2" | grep -qi 'no-op' && ok "idempotent: says no-op" \
  || bad "idempotent: says no-op" "$out2"
[ ! -f "$tmp/npm-calls" ] && ok "idempotent: npm ci never invoked" \
  || bad "idempotent: npm ci never invoked"

### 3. fallback-on-mismatch: target lockfile differs from main's → plain npm ci, said on stdout.
wt2="$tmp/wt2"
git -C "$repo" worktree add -q -b feat2 "$wt2" HEAD
echo '{"lockfileVersion":3,"other":true}' > "$wt2/mos-app/package-lock.json"
rm -f "$tmp/npm-calls"
out3="$(run "$wt2" 2>&1)"; rc3=$?
[ "$rc3" -eq 0 ] && ok "fallback-on-mismatch: exit 0" || bad "fallback-on-mismatch: exit 0" "rc=$rc3"
printf '%s' "$out3" | grep -qi 'falling back to npm ci' && ok "fallback-on-mismatch: says so on stdout" \
  || bad "fallback-on-mismatch: says so on stdout" "$out3"
[ -f "$tmp/npm-calls" ] && grep -qF "$wt2/mos-app" "$tmp/npm-calls" && grep -q 'ci --no-audit --no-fund' "$tmp/npm-calls" \
  && ok "fallback-on-mismatch: npm ci ran in target's mos-app" \
  || bad "fallback-on-mismatch: npm ci ran in target's mos-app" "$(cat "$tmp/npm-calls" 2>/dev/null)"
[ ! -e "$wt2/mos-app/node_modules/pkg-a" ] && ok "fallback-on-mismatch: main's tree was not linked in" \
  || bad "fallback-on-mismatch: main's tree was not linked in"

### 4. partial-failure cleanup: main's node_modules has an unreadable subdir, so cp -al errors
### (readdir traversal order is filesystem-dependent, so how much lands before the error isn't
### asserted) — the script must remove whatever landed, not leave a half-linked node_modules,
### then fall back to npm ci.
wt3="$tmp/wt3"
git -C "$repo" worktree add -q -b feat3 "$wt3" HEAD
seed_main_nm
mkdir -p "$repo/mos-app/node_modules/pkg-blocked"
echo x > "$repo/mos-app/node_modules/pkg-blocked/index.js"
chmod 000 "$repo/mos-app/node_modules/pkg-blocked"
rm -f "$tmp/npm-calls"
out4="$(run "$wt3" 2>&1)"; rc4=$?
chmod 755 "$repo/mos-app/node_modules/pkg-blocked"  # restore so trap cleanup can rm -rf
[ "$rc4" -eq 0 ] && ok "partial-failure: exit 0 (recovered via fallback)" \
  || bad "partial-failure: exit 0 (recovered via fallback)" "rc=$rc4"
printf '%s' "$out4" | grep -qi 'falling back to npm ci' && ok "partial-failure: says fallback on stdout" \
  || bad "partial-failure: says fallback on stdout" "$out4"
[ -f "$tmp/npm-calls" ] && grep -qF "$wt3/mos-app" "$tmp/npm-calls" \
  && ok "partial-failure: npm ci ran after cleanup" \
  || bad "partial-failure: npm ci ran after cleanup" "$(cat "$tmp/npm-calls" 2>/dev/null)"
# The load-bearing assertion: no half-linked node_modules survives the failure. A script that
# skipped the `rm -rf` on cp's error path would leave pkg-a sitting there.
[ ! -e "$wt3/mos-app/node_modules/pkg-a" ] && ok "partial-failure: partial tree was removed" \
  || bad "partial-failure: partial tree was removed" "pkg-a survived the failed cp"

### 5. missing source falls back too (main checkout with no node_modules at all).
repo_bare="$tmp/repo-bare"
git init -q "$repo_bare"
git -C "$repo_bare" config user.email t@t
git -C "$repo_bare" config user.name t
mkdir -p "$repo_bare/mos-app"
echo '{"lockfileVersion":3}' > "$repo_bare/mos-app/package-lock.json"
git -C "$repo_bare" add mos-app/package-lock.json
git -C "$repo_bare" commit -qm init
wt4="$tmp/wt4"
git -C "$repo_bare" worktree add -q -b feat4 "$wt4" HEAD
rm -f "$tmp/npm-calls"
out5="$(run "$wt4" 2>&1)"; rc5=$?
[ "$rc5" -eq 0 ] && ok "missing-source: exit 0" || bad "missing-source: exit 0" "rc=$rc5"
[ -f "$tmp/npm-calls" ] && grep -qF "$wt4/mos-app" "$tmp/npm-calls" \
  && ok "missing-source: fell back to npm ci" \
  || bad "missing-source: fell back to npm ci" "$out5"

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
