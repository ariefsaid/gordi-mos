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
  # Explicit if/else rather than relying on `set -e` to abort here: this function is often
  # called from the right side of `||`, and whether -e still fires INSIDE a function called
  # that way is exactly the kind of shell-version edge case not worth trusting — so a failing
  # npm ci is caught and re-raised on purpose, not by hoping errexit propagates through it.
  if (cd "$target_app" && npm ci --no-audit --no-fund); then
    exit 0
  else
    rc=$?
    echo "── worktree-npm-seed: npm ci failed (exit $rc)" >&2
    exit "$rc"
  fi
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

# Never inspect or reinstall through a root node_modules symlink: it may point at another
# checkout, and even the cleanup below would then operate on that checkout's nested alias.
# Refuse before any target path lookup that could invoke npm or traverse the link.
if [ -L "$target_nm" ]; then
  echo "✗ worktree-npm-seed: refusing target node_modules symlink" >&2
  exit 1
fi

[ -f "$target_lock" ] || fallback "target has no mos-app/package-lock.json"

# A root-level node_modules/node_modules path is not an npm package location. npm left an
# absolute self-link there in the main checkout, and cp -al would copy that link verbatim into a
# worktree, making Vite/Vitest walk back into the main checkout despite ordinary package
# resolution reporting target-local paths. Repair it before the idempotent check and again after
# a fresh copy; the latter is needed because cp -al copies the main link as part of the seed.
repair_nested_node_modules_alias() {
  local nested_alias="$target_nm/node_modules"
  local nested_target nested_target_path nested_target_real main_nm_real
  if [ -L "$nested_alias" ]; then
    nested_target="$(readlink "$nested_alias")"
    if [ "$nested_target" != "$main_nm" ]; then
      [ -d "$main_nm" ] || return 0
      case "$nested_target" in
        /*) nested_target_path="$nested_target" ;;
        *) nested_target_path="$(dirname "$nested_alias")/$nested_target" ;;
      esac
      [ -d "$nested_target_path" ] || return 0
      nested_target_real="$(cd "$nested_target_path" && pwd -P)"
      main_nm_real="$(cd "$main_nm" && pwd -P)"
      [ "$nested_target_real" = "$main_nm_real" ] || return 0
    fi
    rm -f "$nested_alias"
    echo "── worktree-npm-seed: removed inherited node_modules/node_modules symlink"
  fi
}

repair_nested_node_modules_alias

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

# An interrupt (Ctrl-C, a killed CI step) between here and the trap being cleared at the end
# must not leave a half-seeded tree sitting untraced: the idempotency check above only looks
# for the five build binaries + a fresh state file, both of which can already be in place by
# the time an interrupt lands (cp -al finishes before the cache prune below runs) — so a
# stray SIGINT/SIGTERM lands here, wipe the target clean instead of leaving it looking done.
trap 'rm -rf "$target_nm"; echo "── worktree-npm-seed: interrupted — removed the partial tree" >&2; exit 130' INT TERM

rm -rf "$target_nm"

if ! cp -al "$main_nm" "$target_nm"; then
  rm -rf "$target_nm"
  fallback "cp -al failed partway"
fi

# tsc's incremental buildinfo (tsconfig's tsBuildInfoFile lives under node_modules/.tmp/) and
# Vite's caches record absolute paths and mtimes from THIS run. cp -al hardlinks them, so tsc
# in the target would keep writing that shared inode in place — after main's own typecheck
# runs once, a seeded worktree's `tsc -b --noEmit` reads main's cached result instead of
# checking the target's own sources, and reports success over a real type error. Per-tree
# caches never survive a hardlink seed; only the packages themselves do.
rm -rf "$target_nm/.tmp" "$target_nm/.vite" "$target_nm/.vite-temp"
repair_nested_node_modules_alias

# Break the hardlink on the state file and re-copy it as a REGULAR file with a fresh mtime, so
# pre-pr-verify's staleness check (package-lock.json -nt node_modules/.package-lock.json) reads
# the seeded tree as current — without touching the shared inode back in the main checkout,
# which a plain touch on the hardlinked copy would do.
if ! rm -f "$target_state" || ! cp "$main_state" "$target_state"; then
  rm -rf "$target_nm"
  fallback "could not refresh the .package-lock.json state copy"
fi

trap - INT TERM
echo "── worktree-npm-seed: seeded node_modules via hardlink"
