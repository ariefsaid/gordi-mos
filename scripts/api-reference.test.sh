#!/usr/bin/env bash
# Self-test for the public API docs (api-docs/) and scripts/api-reference.sh. No docker, no DB:
# it holds the committed reference to the migrations as text. The full comparison against a live
# database is `bash scripts/api-reference.sh --check`, run by db-contracts.yml after the stack boots.
set -euo pipefail
cd "$(dirname "$0")/.."

pass=0; fail=0
ok()  { pass=$((pass+1)); printf '  ok    %s\n' "$1"; }
bad() { fail=$((fail+1)); printf '  FAIL  %s\n' "$1"; }

tmp=$(mktemp -d -t apiref.XXXXXX)
trap 'rm -rf "$tmp"' EXIT
ref=api-docs/reference.md
sql=$(cat supabase/migrations/*.sql)

# 1. Every api_v1 function in the migrations has a section, and no section is orphaned.
printf '%s\n' "$sql" | grep -oE 'create (or replace )?function api_v1\.[a-z_0-9]+' | sed 's/.*api_v1\.//' | sort -u > "$tmp/fns"
grep -E '^### `' "$ref" | sed 's/^### `//; s/`$//' | sort -u > "$tmp/docs"
if [ -s "$tmp/fns" ] && diff -u "$tmp/fns" "$tmp/docs" > "$tmp/d1"; then
  ok "reference.md documents exactly the api_v1 functions in the migrations ($(wc -l < "$tmp/fns" | tr -d ' '))"
else
  bad "reference.md and the migrations disagree on the operation set (< migrations, > reference):"; sed 's/^/        /' "$tmp/d1"
fi

# 2. Each function's Purpose text (from its COMMENT) appears in the reference.
perl -0ne "while (/comment on function api_v1\.(\w+)\(.*?\) is\s*'Purpose: (.*?) Inputs:/sg) { my (\$n,\$p)=(\$1,\$2); \$p =~ s/''/'/g; print \"\$n\t\$p\n\" }" \
  supabase/migrations/*.sql | sort -u > "$tmp/purposes"
missing=0
while IFS=$'\t' read -r name purpose; do
  # the renderer capitalises the first letter, so compare from the second character on
  grep -qF -- "${purpose:1}" "$ref" || { bad "purpose of $name not in reference.md"; missing=1; }
done < "$tmp/purposes"
[ "$(wc -l < "$tmp/purposes" | tr -d ' ')" -eq "$(wc -l < "$tmp/fns" | tr -d ' ')" ] \
  || { bad "some api_v1 function has no COMMENT starting 'Purpose:'"; missing=1; }
[ "$missing" -eq 0 ] && ok "every function's Purpose comment is in reference.md"

# 3. The refusal messages quoted in the README are the ones the migrations raise.
grep -E '^\| `refused\.[a-z]+` \|' api-docs/README.md | sed -E 's/^\| `[^`]+` \| //; s/ \|$//' > "$tmp/msgs"
bad_msg=0
while IFS= read -r msg; do
  esc=${msg//\'/\'\'}
  grep -qF -- "$esc" <<< "$sql" || { bad "README refusal text not in any migration: $msg"; bad_msg=1; }
done < "$tmp/msgs"
[ -s "$tmp/msgs" ] && [ "$bad_msg" -eq 0 ] && ok "README refusal messages match the migrations ($(wc -l < "$tmp/msgs" | tr -d ' '))"

# 4. The public docs carry placeholders only: no tokens, emails, hosts or IPs.
if grep -RInE 'eyJ[A-Za-z0-9_-]{10,}|[A-Za-z0-9._-]+@[A-Za-z0-9-]+\.[a-z]{2,}|https?://[a-z0-9]|[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}|sb_(publishable|secret)_' api-docs > "$tmp/leaks"; then
  bad "api-docs holds something that looks like a token, email, host or IP:"; sed 's/^/        /' "$tmp/leaks"
else
  ok "api-docs holds placeholders only"
fi

# 5. The generator renders a fixture and refuses what it cannot document.
cat > "$tmp/catalog.json" <<'JSON'
[{"name":"whoami","comment":"Purpose: who is calling. Inputs: none. Returns: {person}. Errors: none expected.","args":[]},
 {"name":"create_task","comment":"Purpose: make a task. Inputs: title. Returns: {item, replayed}. Errors: invalid_input.","args":[{"name":"title","type":"text","required":true},{"name":"note","type":"text","required":false}]}]
JSON
MOS_API_CATALOG_JSON="$tmp/catalog.json" bash scripts/api-reference.sh --out "$tmp/out.md" > /dev/null
if grep -q '^### `create_task`' "$tmp/out.md" && grep -q 'Required parameters as a JSON skeleton' "$tmp/out.md" \
   && grep -q '"title": "<text>"' "$tmp/out.md" && ! grep -q '"note"' "$tmp/out.md"; then
  ok "generator renders sections and the required-parameter skeleton"
else
  bad "generator output for the fixture is wrong"
fi
if MOS_API_CATALOG_JSON="$tmp/catalog.json" bash scripts/api-reference.sh --check --out "$tmp/out.md" > /dev/null 2>&1; then
  ok "--check passes on a fresh render"
else
  bad "--check failed on a fresh render"
fi
echo "stale" >> "$tmp/out.md"
if MOS_API_CATALOG_JSON="$tmp/catalog.json" bash scripts/api-reference.sh --check --out "$tmp/out.md" > /dev/null 2>&1; then
  bad "--check passed on a stale file"
else
  ok "--check fails on a stale file"
fi
echo '[{"name":"x","comment":"no structure","args":[]}]' > "$tmp/bad.json"
if MOS_API_CATALOG_JSON="$tmp/bad.json" bash scripts/api-reference.sh --out "$tmp/bad.md" > /dev/null 2>&1; then
  bad "generator accepted a comment without Purpose/Inputs/Errors"
else
  ok "generator rejects an undocumented function"
fi

# 6. The helper parses.
if bash -n api-docs/mos-session.sh; then ok "mos-session.sh parses"; else bad "mos-session.sh does not parse"; fi

# 7. The helper never puts a password or token in any command's arguments (argv is visible to the
# same user's process list). curl and jq are wrapped to log their argv; curl also fakes a session.
mkdir -p "$tmp/bin"
real_jq=$(command -v jq)
printf '#!/bin/sh\nprintf "%%s\\n" "$*" >> "%s/argv"\nexec "%s" "$@"\n' "$tmp" "$real_jq" > "$tmp/bin/jq"
cat > "$tmp/bin/curl" <<SH
#!/bin/sh
printf '%s\n' "\$*" >> "$tmp/argv"
cat > /dev/null
printf '{"access_token":"tok-SENTINEL-access","refresh_token":"tok-SENTINEL-refresh"}'
case "\$*" in *" -w "*) printf '\n200' ;; esac
SH
chmod +x "$tmp/bin/jq" "$tmp/bin/curl"
: > "$tmp/argv"
if PATH="$tmp/bin:$PATH" MOS_API_URL=http://api.invalid MOS_ANON_KEY=anon bash -c '
     source api-docs/mos-session.sh
     mos_signin someone@example.test <<< "pw-SENTINEL-secret"
     mos_refresh
     mos_call whoami' > /dev/null 2>&1 \
   && [ -s "$tmp/argv" ] && ! grep -q 'SENTINEL' "$tmp/argv"; then
  ok "mos-session.sh keeps the password and tokens out of curl and jq arguments"
else
  bad "a password or token reached a command's arguments (or the helper did not run):"; sed 's/^/        /' "$tmp/argv"
fi

echo "api-reference: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
