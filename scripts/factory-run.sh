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

# Two layers, honestly bounded. (1) POLITE: the gh shim is prepended so most child shells
# resolve gh to the refusal message — but uv REWRITES the child PATH (it prepends the resolved
# interpreter's real bin dir, so masks and strips both lose; probed 2026-08-28, and the strip
# version broke /usr/bin/env on CI). (2) HARD, and uv-proof because it rides the ENVIRONMENT:
# GH_CONFIG_DIR points at an empty dir, so any raw gh a factory child reaches is UNAUTHENTICATED
# — every GitHub write fails at the API; anonymous public reads still work. gh-post.sh runs from
# the Director's session, never a factory child, so the door is unaffected.
GH_SHIM_REAL="$(command -v gh || true)"
export GH_SHIM_REAL
# Fresh per-run dir: a reused one could carry auth a child persisted (e.g. gh auth login).
noauth="$(mktemp -d "${TMPDIR:-/tmp}/gh-noauth.XXXXXX")"
export GH_CONFIG_DIR="$noauth"
# Env tokens override config-dir auth — scrub them or the empty config is theater.
unset GH_TOKEN GITHUB_TOKEN GH_ENTERPRISE_TOKEN GITHUB_ENTERPRISE_TOKEN
PATH="$top/scripts/gh-shim:$PATH" exec uv run "$top/adws/$adw" "$@"
