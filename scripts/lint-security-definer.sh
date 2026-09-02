#!/usr/bin/env bash
# Every SECURITY DEFINER function must have a matching REVOKE EXECUTE in the same migration,
# matched per function by schema.name. Non-SQL extents are blanked via scripts/lib/sql-blank.sh
# before executable SQL is scanned. Quoted identifiers with embedded quotes are unsupported.
#
# Migrations dir is overridable (positional arg 1, else $MIGRATIONS_DIR, else
# supabase/migrations) so the self-test can point this at disposable fixtures instead of the
# real migration history.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
source "$REPO/scripts/lib/sql-blank.sh"

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
  body=$(sql_blank_non_sql_extents < "$f")
  if grep -qi 'security definer' <<< "$body"; then
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
