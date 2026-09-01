#!/usr/bin/env bash
# Self-test for scripts/factory-run.sh — shim leads PATH in the child, bad ADW refuses.
set -uo pipefail
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
nvmrc_bak="$(cat mos-app/.nvmrc)"
trap 'rm -rf "$tmp"; printf "%s\n" "$nvmrc_bak" > mos-app/.nvmrc' EXIT
pass=0; fail=0

# Stub uv in a gh-BEARING dir (with a sibling tool): masking must hide gh yet keep the rest.
mkdir -p "$tmp/bin"
printf '#!/usr/bin/env bash\necho fake-gh\n' > "$tmp/bin/gh"; chmod +x "$tmp/bin/gh"
printf '#!/usr/bin/env bash\necho sibling-ok\n' > "$tmp/bin/dummytool"; chmod +x "$tmp/bin/dummytool"
cat > "$tmp/bin/uv" <<'EOF'
#!/usr/bin/env bash
# $1=run $2=script …
echo "PATH1=$(printf '%s' "$PATH" | cut -d: -f1)"
echo "PATH2=$(printf '%s' "$PATH" | cut -d: -f2)"
echo "GH=$(command -v gh)"
echo "CFG=${GH_CONFIG_DIR:-unset}"
echo "TOK=${GH_TOKEN:-scrubbed}"
echo "CFGEMPTY=$(ls -A "$GH_CONFIG_DIR" 2>/dev/null | wc -l | tr -d " ")"
EOF
chmod +x "$tmp/bin/uv"
printf '#!/usr/bin/env bash\nprintf "v99.1.0\\n"\n' > "$tmp/bin/node"
chmod +x "$tmp/bin/node"

out="$(GH_TOKEN=fake-token PATH="$tmp/bin:$PATH" bash scripts/factory-run.sh adw_simple_sdlc.py brief.md 2>&1)"; rc=$?
t() { if [ "$2" -eq 0 ]; then pass=$((pass+1)); printf '  ok    %s\n' "$1"
     else fail=$((fail+1)); printf '  FAIL  %s\n%s\n' "$1" "$out"; fi; }
[ "$rc" -eq 0 ]; t "wrapper execs the stub" $?
printf '%s' "$out" | grep -q "PATH1=$(pwd)/scripts/gh-shim"; t "shim leads the child's PATH" $?
printf '%s' "$out" | grep -q "GH=$(pwd)/scripts/gh-shim/gh"; t "child resolves gh to the shim" $?
printf '%s' "$out" | grep -q "CFG=.*gh-noauth"; t "child gets the empty GH_CONFIG_DIR (hard layer)" $?
printf '%s' "$out" | grep -q "TOK=scrubbed"; t "inherited GH_TOKEN is scrubbed (env-auth override closed)" $?
printf '%s' "$out" | grep -q "CFGEMPTY=0"; t "config dir is per-run FRESH and empty (no carried hosts.yml)" $?

# Node pin (#560): the factory must gate on the .nvmrc node, not the session's inherited one
# (homebrew node first in PATH fails shell tests CI passes). Driven through NVM_DIR + a
# fixture .nvmrc so the resolution is proven deterministically on any machine.
mkdir -p "$tmp/nvm/versions/node/v42.0.0/bin"
printf '#!/usr/bin/env bash\necho fake-node-42\n' > "$tmp/nvm/versions/node/v42.0.0/bin/node"
chmod +x "$tmp/nvm/versions/node/v42.0.0/bin/node"
printf '42.7.3\n' > mos-app/.nvmrc
out="$(NVM_DIR="$tmp/nvm" PATH="$tmp/bin:$PATH" bash scripts/factory-run.sh adw_simple_sdlc.py brief.md 2>&1)"; rc=$?
[ "$rc" -eq 0 ]; t "pinned run execs the stub" $?
printf '%s' "$out" | grep -q "PATH1=$(pwd)/scripts/gh-shim"; t "gh shim still leads PATH over the pinned node" $?
printf '%s' "$out" | grep -q "PATH2=$tmp/nvm/versions/node/v42.0.0/bin"; t ".nvmrc node's bin dir is next in PATH" $?

# No matching node anywhere: warn, then gate on the inherited node — never hard-fail the door.
printf '37\n' > mos-app/.nvmrc
out="$(NVM_DIR="$tmp/nvm" PATH="$tmp/bin:$PATH" bash scripts/factory-run.sh adw_simple_sdlc.py brief.md 2>&1)"; rc=$?
[ "$rc" -eq 0 ]; t "absent .nvmrc node still runs the factory" $?
printf '%s' "$out" | grep -qE "not found — using inherited node v?[0-9]"; t "warns '.nvmrc node 37 not found' and names the inherited node" $?
printf '%s' "$out" | grep -q "PATH2=$tmp/bin"; t "PATH untouched when pinning is impossible" $?

# The session's own node matching the .nvmrc major is fine — no pin, no warning.
printf '99\n' > mos-app/.nvmrc
out="$(NVM_DIR="$tmp/nvm" PATH="$tmp/bin:$PATH" bash scripts/factory-run.sh adw_simple_sdlc.py brief.md 2>&1)"; rc=$?
[ "$rc" -eq 0 ]; t "matching-major inherited node runs" $?
printf '%s' "$out" | grep -q "not found"; [ $? -ne 0 ]; t "no warning when the inherited node already matches" $?

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
import subprocess, sys
r = subprocess.run(["gh", "auth", "status"], capture_output=True)
print("AUTH_RC=%d" % r.returncode)
EOF3
  cp "$tmp/probe.py" adws/zz_probe_factory_run.py
  out2="$(bash scripts/factory-run.sh zz_probe_factory_run.py 2>&1 | tail -1)"
  rm -f adws/zz_probe_factory_run.py
  if printf '%s' "$out2" | grep -qE "AUTH_RC=[1-9]"; then
    pass=$((pass+1)); printf '  ok    REAL uv child gh is UNAUTHENTICATED (env layer survives uv)\n'
  else
    fail=$((fail+1)); printf '  FAIL  real uv child gh auth: %s\n' "$out2"
  fi
else
  printf '  skip  real-uv probe (uv not installed here)\n'
fi

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
