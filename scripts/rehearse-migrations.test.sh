#!/usr/bin/env bash
# Self-test for scripts/rehearse-migrations.sh; docker is a PATH shim, so no database or network runs.
# Seam: invoke the rehearsal CLI and inspect the TOC list passed to pg_restore -L and its report.
set -uo pipefail
cd "$(dirname "$0")/.."
SCRIPT="$(pwd)/scripts/rehearse-migrations.sh"
tmp="$(mktemp -d -t rehearsemigrations.XXXXXX)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/migrations"
touch "$tmp/source.dump"
printf 'select 1;\n' > "$tmp/migrations/20990101000001_test.sql"
log="$tmp/docker.log"
pass=0; fail=0
ok()  { pass=$((pass+1)); printf '  ok    %s\n' "$1"; }
bad() { fail=$((fail+1)); printf '  FAIL  %s\n' "$1"; }
has() { grep -Fq -- "$2" "$1"; }
has_text() { printf '%s' "$1" | grep -Fq -- "$2"; }

cat > "$tmp/bin/docker" <<'SH'
#!/usr/bin/env bash
cmd="$1"; shift
case "$cmd" in
  ps) printf 'test-image\n' ;;
  run)
    while [ "$#" -gt 0 ]; do
      case "$1" in
        -v)
          case "$2" in *:/rehearsal/toc:ro) printf '%s\n' "${2%:/rehearsal/toc:ro}" > "$TEST_TMP/toc-host" ;; esac
          shift 2 ;;
        *) shift ;;
      esac
    done
    printf 'test-container\n' ;;
  rm) ;;
  exec)
    while [ "$#" -gt 0 ]; do
      case "$1" in
        -i) shift ;;
        -e) shift 2 ;;
        *) break ;;
      esac
    done
    shift # container name
    tool="$1"; shift
    case "$tool" in
      psql)
        args="$*"
        case "$args" in
          *'select rolsuper'*) printf 't\n' ;;
          *'from pg_roles'*) printf 'postgres\n' ;;
        esac ;;
      pg_restore)
        args="$*"
        case " $args " in
          *' -l '*) cat "$TEST_TOC"; printf 'pg_restore -l\n' >> "$TEST_LOG" ;;
          *)
            list=""
            while [ "$#" -gt 0 ]; do
              case "$1" in
                -L) list="$2"; shift 2 ;;
                --use-list=*) list="${1#*=}"; shift ;;
                *) shift ;;
              esac
            done
            if [ -n "$list" ]; then
              printf 'pg_restore -L %s\n' "$list" >> "$TEST_LOG"
              host="$(<"$TEST_TMP/toc-host")"
              case "$list" in
                /rehearsal/toc/*) cp "$host/${list##*/}" "$TEST_TMP/restored.list" ;;
              esac
            else
              printf 'pg_restore without -L\n' >> "$TEST_LOG"
            fi
            ;;
        esac
        ;;
    esac
    ;;
esac
SH
chmod +x "$tmp/bin/docker"

run_rehearsal() {
  : > "$log"
  rm -f "$tmp/restored.list" "$tmp/toc-host"
  out="$(env PATH="$tmp/bin:$PATH" TEST_TMP="$tmp" TEST_LOG="$log" TEST_TOC="$tmp/archive.list" \
    REHEARSAL_PG_IMAGE=test-image REHEARSAL_READY_SECONDS=1 \
    bash "$SCRIPT" "$tmp/source.dump" "$tmp/migrations" 20990101000001_test.sql 2>&1)"
  rc=$?
}

printf '; Archive created by rehearsal test\n; Selected TOC Entries:\n1; 1259 10 TABLE public project_table postgres\n2; 1259 11 TABLE public cloud_owned_table platform_superuser\n3; 3466 12 EVENT TRIGGER public platform_event postgres\n4; 0 20 TABLE DATA public project_table postgres\n' > "$tmp/archive.list"
run_rehearsal
if [ "$rc" -eq 0 ]; then ok "the rehearsal accepts a dump with platform-owned entries"; else bad "the rehearsal exits $rc for platform-owned entries"; printf '%s\n' "$out" | sed 's/^/        /'; fi
if has "$log" 'pg_restore -L /rehearsal/toc/filtered.list' && [ -s "$tmp/restored.list" ]; then
  ok "restore uses the filtered TOC list"
else
  bad "restore does not use pg_restore -L with the filtered TOC"
fi
if [ -s "$tmp/restored.list" ] && has "$tmp/restored.list" 'TABLE public project_table postgres' \
   && has "$tmp/restored.list" 'TABLE DATA public project_table postgres' \
   && ! has "$tmp/restored.list" 'cloud_owned_table' && ! has "$tmp/restored.list" 'EVENT TRIGGER'; then
  ok "platform-owned and event-trigger entries are dropped while project entries stay"
else
  bad "filtered TOC did not retain only project entries"
fi
if [ -s "$tmp/restored.list" ] && has_text "$out" 'skipped 2' \
   && has_text "$out" 'cloud_owned_table' && has_text "$out" 'platform_event'; then
  ok "the skip report gives the count and names"
else
  bad "skip report omits its count or an entry name"
fi

printf '; Archive created by rehearsal test\n; Selected TOC Entries:\n1; 1259 10 TABLE public project_table postgres\n4; 0 20 TABLE DATA public project_table postgres\n' > "$tmp/archive.list"
expected="$tmp/archive.list"
run_rehearsal
if [ "$rc" -eq 0 ] && [ -s "$tmp/restored.list" ] && cmp -s "$expected" "$tmp/restored.list" \
   && has_text "$out" 'skipped 0'; then
  ok "a TOC with nothing to skip reaches restore unchanged"
else
  bad "a TOC with nothing to skip was changed or not restored"
fi

printf '\n%s passed, %s failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
