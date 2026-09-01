#!/usr/bin/env bash
# worktree-npm-seed.sh — hardlink-seed a fresh drive worktree's mos-app/node_modules from the
# main checkout, so tsc/eslint/vitest/vite exist before the first heavy command instead of
# paying `npm ci` in every worktree (pre-pr-verify.sh runs that same install on a stale tree).
#
# Usage: scripts/worktree-npm-seed.sh [target-worktree-path]   (default: cwd's repo root)
#
# The main checkout is located via --git-common-dir (works from a linked worktree; its parent
# is the main worktree — the same lookup gh-post.sh uses to find the repo's primary checkout).
# Seeding only happens when the two mos-app/package-lock.json files hash-match AND the main
# checkout's own install is current — anything else (missing source, mismatched deps, a stale
# main install) falls back to a plain `npm ci`, same as an unseeded worktree pays today.
set -euo pipefail

target="${1:-$(git rev-parse --show-toplevel)}"
target="$(cd "$target" && pwd)"
target_app="$target/mos-app"

fallback() {
  echo "── worktree-npm-seed: $1 — falling back to npm ci"
  (cd "$target_app" && npm ci --no-audit --no-fund)
  exit 0
}

[ -d "$target_app" ] || fallback "target has no mos-app/"

common_dir="$(cd "$target" && git rev-parse --path-format=absolute --git-common-dir)"
main_root="$(cd "$(dirname "$common_dir")" && pwd)"

if [ "$main_root" = "$target" ]; then
  fallback "target is the main checkout — nothing to seed from"
fi

main_lock="$main_root/mos-app/package-lock.json"
main_nm="$main_root/mos-app/node_modules"
main_state="$main_nm/.package-lock.json"
target_lock="$target_app/package-lock.json"
target_nm="$target_app/node_modules"
target_state="$target_nm/.package-lock.json"

[ -f "$target_lock" ] || fallback "target has no mos-app/package-lock.json"

# Idempotent: a target that already has every build binary and a state file no older than its
# own lockfile is already current — the same test pre-pr-verify.sh runs before it re-installs.
target_current=1
for _b in tsc eslint stylelint vitest vite; do
  [ -x "$target_nm/.bin/$_b" ] || target_current=0
done
if [ "$target_current" = 1 ] && [ -f "$target_state" ] && [ ! "$target_lock" -nt "$target_state" ]; then
  echo "── worktree-npm-seed: target node_modules is already current — no-op"
  exit 0
fi

[ -f "$main_lock" ]  || fallback "main checkout has no mos-app/package-lock.json"
[ -d "$main_nm" ]    || fallback "main checkout has no mos-app/node_modules"
[ -f "$main_state" ] || fallback "main checkout's node_modules has no .package-lock.json state"

# The main checkout's own install must not be stale — seeding a bad install just moves the
# same problem sideways.
if [ "$main_lock" -nt "$main_state" ]; then
  fallback "main checkout's node_modules is older than its own package-lock.json"
fi

main_hash="$(shasum -a 256 "$main_lock" | awk '{print $1}')"
target_hash="$(shasum -a 256 "$target_lock" | awk '{print $1}')"
if [ "$main_hash" != "$target_hash" ]; then
  fallback "lockfile hash mismatch between main checkout and target"
fi

echo "── worktree-npm-seed: lockfiles match — hardlinking node_modules from the main checkout"
rm -rf "$target_nm"

if ! cp -al "$main_nm" "$target_nm"; then
  rm -rf "$target_nm"
  fallback "cp -al failed partway"
fi

# Break the hardlink on the state file and re-copy it as a REGULAR file with a fresh mtime, so
# pre-pr-verify's staleness check (package-lock.json -nt node_modules/.package-lock.json) reads
# the seeded tree as current — without touching the shared inode back in the main checkout,
# which a plain touch on the hardlinked copy would do.
if ! rm -f "$target_state" || ! cp "$main_state" "$target_state"; then
  rm -rf "$target_nm"
  fallback "could not refresh the .package-lock.json state copy"
fi

echo "── worktree-npm-seed: seeded node_modules via hardlink"
