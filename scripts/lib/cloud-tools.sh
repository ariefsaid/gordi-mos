# Cloud-sandbox tool helpers, sourced by scripts/cloud-setup.sh and scripts/cloud-agent-bootstrap.sh.
# Self-test: scripts/cloud-tools.test.sh

# The release tarball ships two binaries: `supabase` execs its sibling `supabase-go`, so both stay
# together in one directory and only the entry point is linked onto PATH.
install_supabase_cli() { # $1 version · $2 install dir · $3 bin dir
  local version="$1" dir="$2" bin="$3" arch
  if command -v supabase >/dev/null && supabase --version 2>/dev/null | grep -qx "$version"; then
    echo "supabase $version already present"; return 0
  fi
  arch="$(uname -m)"; case "$arch" in x86_64) arch=amd64 ;; aarch64|arm64) arch=arm64 ;; esac
  mkdir -p "$dir" "$bin"
  curl -fsSL "https://github.com/supabase/cli/releases/download/v${version}/supabase_linux_${arch}.tar.gz" \
    | tar -xzf - -C "$dir" || return 1
  [ -x "$dir/supabase" ] && [ -x "$dir/supabase-go" ] || { echo "tarball lacks supabase or supabase-go" >&2; return 1; }
  ln -sfn "$dir/supabase" "$bin/supabase"
}

# The sandbox ships Docker but does not start its daemon.
ensure_dockerd() { # $1 seconds to wait · $2 daemon log
  local wait="${1:-60}" log="${2:-/tmp/dockerd.log}" i pid
  docker info >/dev/null 2>&1 && return 0
  command -v dockerd >/dev/null || { echo "docker daemon is down and dockerd is not installed" >&2; return 1; }
  nohup dockerd >"$log" 2>&1 &
  pid=$!
  for ((i = 0; i < wait; i++)); do
    docker info >/dev/null 2>&1 && return 0
    kill -0 "$pid" 2>/dev/null || { echo "dockerd exited (see $log)" >&2; return 1; }
    sleep 1
  done
  echo "dockerd did not come up in ${wait}s (see $log)" >&2
  return 1
}
