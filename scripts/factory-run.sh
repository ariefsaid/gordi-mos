#!/usr/bin/env bash
# The door to the factory: run an ADW with the gh shim leading PATH, so every shell the factory's
# agents spawn obeys the GitHub write firewall (reads pass, writes refuse toward gh-post.sh).
#
#   scripts/factory-run.sh [--allow-barred] adw_simple_sdlc.py brief-472.md [--builder fe_builder …]
#
# This wrapper exists because adws/** is VENDORED (byte-identity to the upstream pin, enforced
# by vendor-sssf.test.sh) — a shim prepend edited into adw_modules/utils.py was silently
# destroyed by the next vendor run, with its proof run green minutes earlier (2026-08-28).
# MOS-side behavior around the factory lives in scripts/, never inside adws/.
#
# --allow-barred skips the barred-path pre-flight (scripts/factory-preflight.py) below — pass it
# when the brief only MENTIONS a barred path (e.g. "do not touch scripts/pre-pr-verify.sh") rather
# than asking to change one.
# Self-test: scripts/factory-run.test.sh
set -uo pipefail

allow_barred=0
if [ "${1:-}" = "--allow-barred" ]; then allow_barred=1; shift; fi
[ $# -ge 1 ] || { echo "usage: factory-run.sh [--allow-barred] <adw_script.py> [args…]" >&2; exit 2; }
top="$(git rev-parse --show-toplevel)" || exit 2
adw="$1"; shift
case "$adw" in */*|.*) echo "✗ factory-run: ADW must be a bare filename under adws/ (got '$adw')" >&2; exit 2 ;; esac
[ -f "$top/adws/$adw" ] || { echo "✗ factory-run: no such ADW: adws/$adw" >&2; exit 2; }

# Cheap pre-flight (#590): the barred list is known at dispatch time, so catch a brief that
# targets it BEFORE a ~20-minute build burns tokens only to hit permissions.py::enforce()'s
# rollback at the end. Heuristic and best-effort — see factory-preflight.py's own docstring.
if [ "$allow_barred" -eq 0 ]; then
  brief_arg=""
  if [ $# -ge 1 ] && [ "${1#-}" = "$1" ]; then
    brief_arg="$1"
  else
    prev=""
    for arg in "$@"; do
      [ "$prev" = "--findings" ] && { brief_arg="$arg"; break; }
      prev="$arg"
    done
  fi
  python3 "$top/scripts/factory-preflight.py" "$top" "$brief_arg" || exit 3
fi

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
# Node pin: quality gates must not silently use a rejected inherited major. If the pin cannot
# be resolved, warn and continue with the inherited node (fail open; no install step).
nvmrc=""
if [ -f "$top/mos-app/.nvmrc" ]; then
  nvmrc="$(tr -d '[:space:]' < "$top/mos-app/.nvmrc")"
fi
if [ -z "$nvmrc" ]; then
  echo "⚠ factory-run: mos-app/.nvmrc absent — using inherited node" >&2
fi
nvm_node=""
if [ -n "$nvmrc" ]; then
  nvm_major="${nvmrc#v}"; nvm_major="${nvm_major%%.*}"
  nvm_matches=("${NVM_DIR:-$HOME/.nvm}"/versions/node/v"$nvm_major".*/bin)
  nvm_matches=($(for dir in "${nvm_matches[@]}"; do
    [ -x "$dir/node" ] && printf '%s\n' "$dir"
  done | sort -V))
  if [ "${#nvm_matches[@]}" -gt 0 ] && [ -d "${nvm_matches[0]}" ]; then
    nvm_node="${nvm_matches[${#nvm_matches[@]} - 1]}"
  fi
  if [ -z "$nvm_node" ]; then
    cur_v="$(node -v 2>/dev/null || true)"
    cur_major="${cur_v#v}"; cur_major="${cur_major%%.*}"
    [ "$cur_major" = "$nvm_major" ] || \
      echo "⚠ factory-run: .nvmrc node $nvmrc not found — using inherited node ${cur_v:-none}" >&2
  fi
fi
PATH="$top/scripts/gh-shim${nvm_node:+:$nvm_node}:$PATH" exec uv run "$top/adws/$adw" "$@"
