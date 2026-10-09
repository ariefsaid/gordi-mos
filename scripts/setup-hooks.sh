#!/usr/bin/env bash
# Install the tracked hooks (.githooks) from origin/dev — reviewed, committed content, never a
# working tree — as a copy inside the shared git dir, and point every clone and worktree at it.
# No checkout then ever runs a branch's own hook (a branch-controlled post-checkout would run on
# mere checkout). Re-run to pick up hook changes after they merge (npm `prepare` does). Then link
# the project skills into the main checkout and every existing worktree (new ones get it from
# post-checkout). Idempotent:  ./scripts/setup-hooks.sh
set -euo pipefail
self="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"   # absolute: npm prepare calls ../scripts/…
cd "$(dirname "$self")/.."
common="$(git rev-parse --path-format=absolute --git-common-dir)"
src=origin/dev; git rev-parse -q --verify "$src" >/dev/null || src=HEAD   # fresh clone before fetch
dest="$common/mos-hooks-$(git rev-parse --short=12 "$src")"
# One setup at a time (two at once could each delete the other's freshly active set): re-run under
# a kernel lock, which dies with its holder, so a crashed run never leaves a lock behind.
if [ -z "${MOS_HOOKS_LOCKED:-}" ]; then
  exec env MOS_HOOKS_LOCKED=1 perl -MFcntl=:flock -e 'BEGIN { $^F = 255 } open(my $f, ">>", shift) or die $!; flock($f, LOCK_EX) or die $!; exec(@ARGV) or die $!' \
    "$common/mos-hooks.lock" bash "$self" "$@"
fi
stage=""; trap 'rm -rf "$stage"' EXIT
if [ ! -d "$dest" ]; then
  stage="$(mktemp -d "$common/mos-hooks.XXXXXX")"
  git archive "$src" .githooks | tar -x -C "$stage"
  chmod +x "$stage"/.githooks/*
  mv "$stage/.githooks" "$dest"
fi
# Repoint in one config write (git swaps the config file atomically), then drop older sets — there
# is never a moment without hooks.
git config core.hooksPath "$dest"
for d in "$common"/mos-hooks-*; do [ "$d" = "$dest" ] || rm -rf "$d"; done
git worktree list --porcelain | sed -n 's/^worktree //p' | while IFS= read -r wt; do
  (cd "$wt" 2>/dev/null && bash "$dest/post-checkout") || true
done
echo "✓ core.hooksPath = $dest (installed from $src)"
echo "  pre-commit gates: conflict markers + eslint/stylelint/vitest scoped to staged files"
