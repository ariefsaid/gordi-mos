#!/usr/bin/env bash
# Self-test for scripts/lib/cloud-tools.sh — the Supabase CLI install keeps its supabase-go sibling,
# and ensure_dockerd starts a stopped daemon. Network and Docker are stubbed.
set -uo pipefail
cd "$(dirname "$0")/.."
LIB="$(pwd)/scripts/lib/cloud-tools.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0
ok() { pass=$((pass+1)); printf '  ok    %s\n' "$1"; }
bad() { fail=$((fail+1)); printf '  FAIL  %s\n' "$1"; }

# A PATH with only the tools the helpers need, so the host's real supabase/docker/dockerd stay out.
mkdir -p "$tmp/sys" "$tmp/bin"
for t in bash tar gzip mkdir ln grep sleep cat rm touch nohup; do ln -s "$(command -v "$t")" "$tmp/sys/$t"; done
printf '#!/bin/sh\necho x86_64\n' > "$tmp/bin/uname"
# curl stub: records its URL and streams $TARBALL.
printf '#!/bin/sh\necho "$2" >> "%s/curl-calls"\ncat "$TARBALL"\n' "$tmp" > "$tmp/bin/curl"
chmod +x "$tmp/bin/"*
P="$tmp/bin:$tmp/sys"

mk_tarball() { # $1 out · $2.. member names
  local out="$1" d; d="$(mktemp -d)"; shift
  for m in "$@"; do printf '#!/bin/sh\necho 2.104.0\n' > "$d/$m"; chmod +x "$d/$m"; done
  tar -czf "$out" -C "$d" "$@"; rm -rf "$d"
}
mk_tarball "$tmp/full.tgz" supabase supabase-go
mk_tarball "$tmp/partial.tgz" supabase

run() { env -i HOME="$tmp" PATH="$P" TARBALL="$TARBALL" bash -c "source '$LIB'; $1" >/dev/null 2>&1; }

TARBALL="$tmp/full.tgz"
if run "install_supabase_cli 2.104.0 '$tmp/share' '$tmp/link'" && [ -x "$tmp/share/supabase-go" ] \
  && [ "$("$tmp/link/supabase" --version)" = 2.104.0 ]; then ok "install keeps supabase-go beside the linked supabase"
else bad "install keeps supabase-go beside the linked supabase"; fi
grep -q 'v2.104.0/supabase_linux_amd64.tar.gz' "$tmp/curl-calls" && ok "downloads the pinned linux asset" || bad "downloads the pinned linux asset: $(cat "$tmp/curl-calls")"

rm -f "$tmp/curl-calls"
P="$tmp/link:$tmp/bin:$tmp/sys"
run "install_supabase_cli 2.104.0 '$tmp/share' '$tmp/link'" && [ ! -e "$tmp/curl-calls" ] && ok "pinned version already on PATH: no download" || bad "pinned version already on PATH: no download"
P="$tmp/bin:$tmp/sys"

TARBALL="$tmp/partial.tgz"
if ! run "install_supabase_cli 2.104.0 '$tmp/share2' '$tmp/link2'" && [ ! -e "$tmp/link2/supabase" ]; then ok "tarball without supabase-go fails, nothing linked"
else bad "tarball without supabase-go fails, nothing linked"; fi

# docker stub: `info` succeeds once the daemon flag exists. dockerd stub raises the flag unless told not to.
printf '#!/bin/sh\n[ -e "%s/up" ]\n' "$tmp" > "$tmp/bin/docker"
printf '#!/bin/sh\necho started >> "%s/dockerd-calls"\n[ -n "$DOCKERD_DUD" ] || touch "%s/up"\nsleep 1\n' "$tmp" "$tmp" > "$tmp/bin/dockerd"
chmod +x "$tmp/bin/docker" "$tmp/bin/dockerd"
drun() { env -i HOME="$tmp" PATH="$P" DOCKERD_DUD="${DUD:-}" bash -c "source '$LIB'; ensure_dockerd $1 '$tmp/dockerd.log'" >/dev/null 2>&1; }

touch "$tmp/up"; rm -f "$tmp/dockerd-calls"
drun 3 && [ ! -e "$tmp/dockerd-calls" ] && ok "daemon already up: dockerd not started" || bad "daemon already up: dockerd not started"
rm -f "$tmp/up" "$tmp/dockerd-calls"
drun 5 && [ -s "$tmp/dockerd-calls" ] && ok "daemon down: dockerd started and awaited" || bad "daemon down: dockerd started and awaited"
rm -f "$tmp/up"; DUD=1
start=$SECONDS
drun 30 && bad "dockerd that exits fails" || { [ $((SECONDS - start)) -lt 10 ] && ok "dockerd that exits fails without waiting out the timeout" || bad "dockerd that exits waited out the timeout"; }
DUD=""; rm -f "$tmp/up" "$tmp/bin/dockerd"
drun 2 && bad "no dockerd installed fails" || ok "no dockerd installed fails"

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
