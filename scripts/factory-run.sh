#!/usr/bin/env bash
# The door to the factory: run an ADW with the gh shim leading PATH, so every shell the factory's
# agents spawn obeys the GitHub write firewall (reads pass, writes refuse toward gh-post.sh).
#
#   scripts/factory-run.sh adw_simple_sdlc.py brief-472.md [--builder fe_builder …]
#
# This wrapper exists because adws/** is VENDORED (byte-identity to the upstream pin, enforced
# by vendor-sssf.test.sh) — a shim prepend edited into adw_modules/utils.py was silently
# destroyed by the next vendor run, with its proof run green minutes earlier (2026-08-28).
# MOS-side behavior around the factory lives in scripts/, never inside adws/.
# Self-test: scripts/factory-run.test.sh
set -uo pipefail

[ $# -ge 1 ] || { echo "usage: factory-run.sh <adw_script.py> [args…]" >&2; exit 2; }
top="$(git rev-parse --show-toplevel)" || exit 2
adw="$1"; shift
case "$adw" in */*|.*) echo "✗ factory-run: ADW must be a bare filename under adws/ (got '$adw')" >&2; exit 2 ;; esac
[ -f "$top/adws/$adw" ] || { echo "✗ factory-run: no such ADW: adws/$adw" >&2; exit 2; }

# uv REWRITES the child PATH (probed 2026-08-28: /opt/homebrew/bin lands first however the
# outer PATH is ordered), so prepending the shim is not enough: every gh-bearing dir is
# STRIPPED from the child PATH — uv re-adds none of them — and the shim gets the real gh
# via GH_SHIM_REAL for its own passthrough.
GH_SHIM_REAL="$(command -v gh || true)"
clean=""
IFS=: read -r -a dirs <<< "$PATH"
for d in "${dirs[@]}"; do
  [ -n "$d" ] || continue
  [ -x "$d/gh" ] && [ "$d" != "$top/scripts/gh-shim" ] && continue
  clean="$clean:$d"
done
export GH_SHIM_REAL
PATH="$top/scripts/gh-shim${clean}" exec uv run "$top/adws/$adw" "$@"
