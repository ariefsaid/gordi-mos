#!/usr/bin/env bash
# Every migration that DEFINES a `security definer` function must also REVOKE its PUBLIC
# execute grant in the same file. Defense-in-depth: prevents a recurrence of the
# _test_seed_role_tree audit Critical where a SECURITY DEFINER function was reachable via
# PostgREST because it lacked an explicit REVOKE.
#
# SQL line comments are stripped first so a mere *mention* of "security definer" in a comment
# (e.g. "writes are RPC-only via the SECURITY DEFINER approval RPC") is not a false positive —
# only an actual definer clause in executable SQL is flagged. `comment on ... is '...'` bodies
# are stripped too: `sed 's/--.*//'` strips `--` line comments but not SQL *string literals*, so
# a `comment on function ... is '... SECURITY DEFINER ...'` tripped this on a function explicitly
# declared `security invoker` (found on `v4-redesign`, PR #175). Deliberately narrow — a
# `security definer` clause can never appear inside a COMMENT ON statement, so this cannot hide
# a real one. Stripping *all* quoted strings was rejected: one unbalanced quote anywhere would
# silently over-strip and turn a security gate into a false negative, far worse than the false
# positive it fixes.
#
# Extracted from the `pgtap` and `db` CI jobs (#565), which carried this verbatim in both —
# an acknowledged sync burden. One source of truth now; both jobs `run: bash` this file.
#
# Migrations dir is overridable (positional arg 1, else $MIGRATIONS_DIR, else
# supabase/migrations) so the self-test can point this at disposable fixtures instead of the
# real migration history.
set -euo pipefail

MIGRATIONS_DIR="${1:-${MIGRATIONS_DIR:-supabase/migrations}}"

shopt -s nullglob
files=("$MIGRATIONS_DIR"/*.sql)
shopt -u nullglob
if [ "${#files[@]}" -eq 0 ]; then
  echo "LINT FAIL: no .sql files found under $MIGRATIONS_DIR — refusing to pass a check that scanned nothing." >&2
  exit 1
fi

# The REVOKE must name the SAME function as the SECURITY DEFINER declaration — a revoke for some
# other function in the same file leaves this one PUBLIC-reachable. The clause lives in the CREATE
# FUNCTION header (always before the $$ body's first `;`), so each definer fn is matched with the
# text from its `(` to the next `;`. Names are compared schema-qualified, whitespace/quotes
# normalised; argument lists may differ in spelling and are ignored.
normalise_defs_revokes() {
  perl -0777 -ne '
    my (@defs, %revoked);
    while (/\bcreate\s+(?:or\s+replace\s+)?function\s+((?:"[^"]*"|\w+)(?:\.(?:"[^"]*"|\w+))*)\s*\(/gis) {
      my $name = $1;
      my $start = pos();
      my $end = index($_, ";", $start);
      $end = length($_) if $end < 0;
      if (substr($_, $start, $end - $start) =~ /\bsecurity\s+definer\b/i) {
        (my $n = $name) =~ s/"//g;
        $n =~ s/\s+//g;
        push @defs, lc $n;
      }
    }
    while (/\brevoke\s+execute\s+on\s+function\s+((?:"[^"]*"|\w+)(?:\.(?:"[^"]*"|\w+))*)/gis) {
      (my $n = $1) =~ s/"//g;
      $n =~ s/\s+//g;
      $revoked{lc $n} = 1;
    }
    print "$_\n" for grep { !$revoked{$_} } @defs;
  '
}

failed=0
for f in "${files[@]}"; do
  body=$(sed 's/--.*//' "$f" | perl -0777 -pe 's/comment\s+on\b[^;]*;//gis')
  if echo "$body" | grep -qi 'security definer'; then
    missing=$(echo "$body" | normalise_defs_revokes)
    if [ -n "$missing" ]; then
      while IFS= read -r fn; do
        echo "LINT FAIL: $f has SECURITY DEFINER function $fn() without a matching 'revoke execute on function $fn'" >&2
      done <<< "$missing"
      failed=1
    fi
  fi
done

if [ "$failed" -eq 1 ]; then
  echo "Fix: add 'revoke execute on function <fn>() from public, anon, authenticated;' naming each SECURITY DEFINER function after its definition." >&2
  exit 1
fi
echo "Lint OK: every SECURITY DEFINER function has its own revoke."
