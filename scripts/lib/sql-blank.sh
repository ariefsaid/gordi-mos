#!/usr/bin/env bash
# Blank SQL extents that are not executable SQL. Newlines are retained for diagnostics.
sql_blank_non_sql_extents() {
  perl -0777 -pe '
    my $n = length($_);
    my $i = 0;
    while ($i < $n) {
      my $c = substr($_, $i, 1);
      my $j; my $blank = 1;
      if ($c eq "-" && substr($_, $i + 1, 1) eq "-") {
        $j = index($_, "\n", $i); $j = $n if $j < 0;
      } elsif ($c eq "\x27") {
        my $esc = ($i > 0 && substr($_, $i - 1, 1) =~ /[Ee]/
                   && ($i < 2 || substr($_, $i - 2, 1) !~ /[A-Za-z0-9_\$\"]/));
        $j = $i + 1;
        while ($j < $n) {
          if ($esc && substr($_, $j, 1) eq "\\") { $j += 2; next }
          if (substr($_, $j, 1) ne "\x27") { $j++; next }
          if (substr($_, $j + 1, 1) eq "\x27") { $j += 2; next }
          $j++; last;
        }
        $j = $n if $j > $n;
      } elsif ($c eq "\"" ) {
        # Quoted identifiers remain SQL; embedded doubled quotes are unsupported by the caller.
        $blank = 0; $j = $i + 1;
        while ($j < $n) {
          if (substr($_, $j, 1) eq "\"" && substr($_, $j + 1, 1) eq "\"" ) { $j += 2; next }
          if (substr($_, $j, 1) eq "\"" ) { $j++; last }
          $j++;
        }
      } elsif ($c eq "\$" && substr($_, $i) =~ /^(\$\$|\$[A-Za-z_][A-Za-z0-9_]*\$)/) {
        my $tag = $1;
        $j = index($_, $tag, $i + length($tag));
        $j = $n if $j < 0; $j += length($tag) if $j < $n;
      } elsif ($c eq "/" && substr($_, $i + 1, 1) eq "*") {
        $j = $i + 2; my $depth = 1;
        while ($depth > 0 && $j < $n) {
          my $two = substr($_, $j, 2);
          if    ($two eq "/*") { $depth++; $j += 2 }
          elsif ($two eq "*/") { $depth--; $j += 2 }
          else                 { $j++ }
        }
        $j = $n if $j > $n;
      } else { $i++; next }
      if ($blank) {
        my $segment = substr($_, $i, $j - $i);
        $segment =~ s/[^\n]/ /g;
        substr($_, $i, $j - $i) = $segment;
      }
      $i = $j;
    }
  '
}
