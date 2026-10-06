# Cloud-sandbox tool helpers, sourced by scripts/cloud-setup.sh and scripts/cloud-agent-bootstrap.sh.
# Self-test: scripts/cloud-tools.test.sh

# The release tarball ships two binaries: `supabase` execs its sibling `supabase-go`, so both stay
# together in one directory and only the entry point is linked onto PATH.
install_supabase_cli() { # $1 version · $2 install dir · $3 bin dir
  local version="$1" dir="$2" bin="$3" arch expected archive actual
  if command -v supabase >/dev/null && supabase --version 2>/dev/null | grep -qx "$version"; then
    echo "supabase $version already present"; return 0
  fi
  arch="$(uname -m)"; case "$arch" in x86_64) arch=amd64 ;; aarch64|arm64) arch=arm64 ;; esac
  case "$version:$arch" in
    2.104.0:amd64) expected=5a0d3ed4c44f8dd1520a9f7ed6309aa60ef3bfc6c5483c9b11f70191f9d74cf6 ;;
    2.104.0:arm64) expected=29b2ad78e5da29c0f8ad424a720dbda568e9d7458f3810696710b23ca42cba4f ;;
    *) echo "no Supabase CLI checksum is pinned for $version ($arch)" >&2; return 1 ;;
  esac
  mkdir -p "$dir" "$bin"
  archive="$(mktemp)" || return 1
  if ! curl -fsSL "https://github.com/supabase/cli/releases/download/v${version}/supabase_linux_${arch}.tar.gz" > "$archive"; then
    rm -f "$archive"; return 1
  fi
  if command -v sha256sum >/dev/null; then
    actual="$(sha256sum "$archive")" || { rm -f "$archive"; return 1; }
  elif command -v shasum >/dev/null; then
    actual="$(shasum -a 256 "$archive")" || { rm -f "$archive"; return 1; }
  else
    echo "sha256sum or shasum is required to verify the Supabase CLI archive" >&2
    rm -f "$archive"; return 1
  fi
  actual="${actual%% *}"
  if [ "$actual" != "$expected" ]; then
    echo "Supabase CLI archive checksum did not match the pinned value" >&2
    rm -f "$archive"; return 1
  fi
  if ! tar -xzf "$archive" -C "$dir"; then rm -f "$archive"; return 1; fi
  rm -f "$archive"
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
