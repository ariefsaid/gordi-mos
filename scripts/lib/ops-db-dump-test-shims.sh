#!/usr/bin/env bash
# Install the shared pg_dump/pg_restore fakes used by deploy self-tests.
ops_test_install_db_dump_shims() {
  local bin="$1"
  cat > "$bin/pg_dump" <<'SH'
#!/usr/bin/env bash
printf 'argv pg_dump %s\npgpw %s\n' "$*" "${PGPASSWORD:-}" >> "$ARGVLOG"
printf 'pg_dump\n' >> "$CALLS"
if [ "${FAKE_DUMP_FAIL:-0}" = 1 ]; then echo "could not connect to $FAKE_HOST" >&2; exit 1; fi
out=""; while [ $# -gt 0 ]; do [ "$1" = -f ] && out="$2"; shift; done; echo "PGDMP" > "$out"
SH
  cat > "$bin/pg_restore" <<'SH'
#!/usr/bin/env bash
printf 'pg_restore-list\n' >> "$CALLS"
printf 'argv pg_restore %s\n' "$*" >> "$ARGVLOG"
[ "${FAKE_LIST_EMPTY:-0}" = 1 ] && exit 1
if [ "${FAKE_LIST_ZERO:-0}" = 1 ]; then printf '; header\n'; exit 0; fi
printf '; header\n1; 2615 1 SCHEMA - mos owner\n'
SH
  chmod +x "$bin/pg_dump" "$bin/pg_restore"
}
