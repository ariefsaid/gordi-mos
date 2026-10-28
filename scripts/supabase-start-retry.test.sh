#!/usr/bin/env bash
# Exercise retry behavior with a stub Supabase CLI and no real backoff delays.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT
mkdir -p "$tmp_dir/bin"

cat > "$tmp_dir/bin/supabase" <<'STUB'
#!/usr/bin/env bash
set -u
count=0
[[ -f "$SUPABASE_STUB_COUNT" ]] && count="$(cat "$SUPABASE_STUB_COUNT")"
count=$((count + 1))
printf '%s\n' "$count" > "$SUPABASE_STUB_COUNT"
case "$SUPABASE_STUB_CASE" in
  success)
    echo 'Supabase started'
    exit 0
    ;;
  persistent-rate-limit)
    echo 'failed to pull image: toomanyrequests'
    exit 1
    ;;
  mixed-output)
    echo 'failed to pull image: toomanyrequests'
    echo 'Error: database service failed to start'
    exit 1
    ;;
esac
exit 99
STUB
cat > "$tmp_dir/bin/sleep" <<'STUB'
#!/usr/bin/env bash
exit 0
STUB
chmod +x "$tmp_dir/bin/supabase" "$tmp_dir/bin/sleep"

run_case() {
  local name="$1" expected_status="$2" expected_attempts="$3"
  local status=0
  export SUPABASE_STUB_CASE="$name" SUPABASE_STUB_COUNT="$tmp_dir/$name.count"
  rm -f "$SUPABASE_STUB_COUNT"
  PATH="$tmp_dir/bin:$PATH" bash "$repo_root/scripts/supabase-start-retry.sh" '' >"$tmp_dir/$name.out" 2>&1 || status=$?
  local attempts=0
  [[ -f "$SUPABASE_STUB_COUNT" ]] && attempts="$(cat "$SUPABASE_STUB_COUNT")"
  if [[ "$status" -ne "$expected_status" || "$attempts" -ne "$expected_attempts" ]]; then
    cat "$tmp_dir/$name.out" >&2
    echo "FAIL $name: status=$status (expected $expected_status), attempts=$attempts (expected $expected_attempts)" >&2
    return 1
  fi
  printf 'PASS %s (status=%s, attempts=%s)\n' "$name" "$status" "$attempts"
}

run_case success 0 1
run_case persistent-rate-limit 1 3
run_case mixed-output 1 1
