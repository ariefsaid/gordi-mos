#!/usr/bin/env bash
# Self-test for scripts/factory-run.sh — shim leads PATH in the child, bad ADW refuses.
set -uo pipefail
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0

# Stub uv: print the child's first PATH entry and which gh resolves.
mkdir -p "$tmp/bin"
cat > "$tmp/bin/uv" <<'EOF'
#!/usr/bin/env bash
# $1=run $2=script …
echo "PATH1=$(printf '%s' "$PATH" | cut -d: -f1)"
echo "GH=$(command -v gh)"
EOF
chmod +x "$tmp/bin/uv"

out="$(PATH="$tmp/bin:$PATH" bash scripts/factory-run.sh adw_simple_sdlc.py brief.md 2>&1)"; rc=$?
t() { if [ "$2" -eq 0 ]; then pass=$((pass+1)); printf '  ok    %s\n' "$1"
     else fail=$((fail+1)); printf '  FAIL  %s\n%s\n' "$1" "$out"; fi; }
[ "$rc" -eq 0 ]; t "wrapper execs the stub" $?
printf '%s' "$out" | grep -q "PATH1=$(pwd)/scripts/gh-shim"; t "shim leads the child's PATH" $?
printf '%s' "$out" | grep -q "GH=$(pwd)/scripts/gh-shim/gh"; t "child resolves gh to the shim" $?

if bash scripts/factory-run.sh no_such_adw.py >/dev/null 2>&1; then
  fail=$((fail+1)); printf '  FAIL  unknown ADW must refuse\n'
else pass=$((pass+1)); printf '  ok    unknown ADW refuses\n'; fi
if bash scripts/factory-run.sh ../scripts/gh-post.sh >/dev/null 2>&1; then
  fail=$((fail+1)); printf '  FAIL  path traversal must refuse\n'
else pass=$((pass+1)); printf '  ok    ../ traversal refuses (bare filename only)\n'; fi

# THE test that matters: real uv rewrites PATH; the strip-and-pin must survive it.
# (Skips where uv is absent — CI covers the wrapper logic via the stub above.)
if command -v uv >/dev/null 2>&1; then
  cat > "$tmp/probe.py" <<'EOF3'
import shutil, sys
print(shutil.which("gh") or "NONE")
EOF3
  cp "$tmp/probe.py" adws/zz_probe_factory_run.py
  out2="$(bash scripts/factory-run.sh zz_probe_factory_run.py 2>&1 | tail -1)"
  rm -f adws/zz_probe_factory_run.py
  if printf '%s' "$out2" | grep -q "scripts/gh-shim/gh"; then
    pass=$((pass+1)); printf '  ok    REAL uv child resolves gh to the shim (strip-and-pin holds)\n'
  else
    fail=$((fail+1)); printf '  FAIL  real uv child resolved gh to: %s\n' "$out2"
  fi
else
  printf '  skip  real-uv probe (uv not installed here)\n'
fi

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
