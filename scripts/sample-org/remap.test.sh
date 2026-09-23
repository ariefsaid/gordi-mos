#!/usr/bin/env bash
# Self-test for remap.py: it re-keys the org, rewrites fixture addresses, strips password hashes,
# and refuses output that still carries the dev org, a non-sample address, or a hash.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT; fail=0
ok() { echo "ok   $1"; }; bad() { echo "FAIL $1"; fail=1; }
org="INSERT INTO shared.orgs (id, name, slug, created_at) VALUES ('10000000-0000-0000-0000-000000000001', 'Gordi', 'gordi', now());"
printf '%s\nINSERT INTO shared.people (id, org_id, email) VALUES (%s, %s, %s);\n' "$org" \
  "'40000000-0000-0000-0000-000000000001'" "'10000000-0000-0000-0000-000000000001'" "'dewi.dev@example.test'" > "$tmp/app.sql"
printf "INSERT INTO auth.users (id, email, encrypted_password) VALUES ('%s', 'dewi.dev@example.test', '\$2a\$10\$abcdefghijklmnopqrstuv');\n" \
  "e0000000-0000-0000-0000-000000000001" > "$tmp/auth.sql"
if out=$(python3 "$here/remap.py" "$tmp/app.sql" "$tmp/auth.sql" 2>"$tmp/err"); then
  grep -q "'5a000000-0000-0000-0000-000000000001', 'Gordi Sample', 'gordi-sample'" <<<"$out" && ok "org re-keyed and renamed" || bad "org re-keyed and renamed"
  grep -q "dewi@sample.gordi.test" <<<"$out" && ok "fixture address rewritten" || bad "fixture address rewritten"
  grep -q "crypt(:'sample_password'" <<<"$out" && ! grep -q '\$2a\$' <<<"$out" && ok "password hash replaced" || bad "password hash replaced"
  grep -q "40000000-0000-0000-0000-000000000001" <<<"$out" && bad "person id remapped" || ok "person id remapped"
else bad "clean input accepted ($(cat "$tmp/err"))"; fi
echo "INSERT INTO shared.people (id, email) VALUES ('40000000-0000-0000-0000-000000000002', 'someone@gordi.id');" >> "$tmp/app.sql"
python3 "$here/remap.py" "$tmp/app.sql" "$tmp/auth.sql" >/dev/null 2>"$tmp/err" && bad "real address refused" || { grep -q "outside the sample domain" "$tmp/err" && ok "real address refused" || bad "real address refused"; }
exit $fail
