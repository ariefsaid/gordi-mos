#!/usr/bin/env bash
#
# py-with-deps.sh — the SHARED python-with-pydantic+pyyaml resolver behind the
# self-tests that must import the factory's REAL modules (scripts/sssf-config.test.sh,
# scripts/sssf-gate.test.sh). One copy, not one per test: the dependency list
# cannot drift between them.
#
# Sourced, never executed:
#   . scripts/lib/py-with-deps.sh
#   py_with_deps_init "$tmp/venv" || bad "could not provision deps (no uv; venv/pip failed)"
#   py_with_deps harness.py args...     # or alias it: PY() { py_with_deps "$@"; }
#
# Three branches, cheapest first: plain python3 when the ambient interpreter
# already carries the deps (dev machines), else uv with inline deps, else a
# scratch venv via pip. CI's guard runner provisions NO python deps, which is the
# only reason the fallbacks exist. The caller owns the venv path — pass one under
# a directory it already traps, so nothing is left behind.
#
# A provisioning failure returns non-zero and leaves py_with_deps pointing at a
# python that will fail the import LOUDLY. It must fall through to the caller's
# checks going red, NEVER to a skip: a skipped control is exactly the failure
# mode those self-tests exist to kill.

PY_WITH_DEPS_CMD=(python3)

py_with_deps_init() {
  local venv="${1:?py-with-deps: init needs a venv path}"
  if python3 -c 'import pydantic, yaml' 2>/dev/null; then
    PY_WITH_DEPS_CMD=(python3)
  elif command -v uv >/dev/null 2>&1; then
    PY_WITH_DEPS_CMD=(uv run --no-project --quiet --with pydantic --with pyyaml python)
  else
    python3 -m venv "$venv" && "$venv/bin/pip" install --quiet pydantic pyyaml || return 1
    PY_WITH_DEPS_CMD=("$venv/bin/python")
  fi
}

py_with_deps() { "${PY_WITH_DEPS_CMD[@]}" "$@"; }
