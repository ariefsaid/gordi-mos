# Vendored Impeccable detector

This directory carries the Impeccable anti-pattern detector used by this repository's design
checks. It is kept in the repository because the installed skill can be a partial runtime: its
wrapper and hook may be present while the detector engine is missing, which makes a supposedly
enabled design check silently unusable.

## Provenance

- Package: `impeccable@3.3.1`
- Repository: `https://github.com/pbakaus/impeccable`
- Tarball: `https://registry.npmjs.org/impeccable/-/impeccable-3.3.1.tgz`
- Integrity: `sha512-wMijNOkhl+Devs5ljgdnw+u695WlvsDyDhWILO8US03gpm0S2EtxkOWEHYcsJxHnlhSVNZ8o6XJbW5sz/SnB3w==`
- License: Apache-2.0; see `LICENSE` in this directory.

The surrounding Codex skill identifies itself as v4.0.2. That is the prompt and workflow version;
the executable detector engine vendored here is the package version above. Keep those versions
distinct when refreshing either part.

Run a source scan from the repository root with:

```sh
node scripts/impeccable-detect.mjs --json mos-app/src/pages/cafe-opening-page.tsx mos-app/src/pages/cafe-opening-page.css
```

`scripts/vendor-skills.sh` copies this detector into the local Impeccable skill after refreshing
the other skill files, so the skill wrapper, hook, and doctor all resolve the same engine. The
detector entry point and browser helper retain their upstream Apache-2.0 notices.

`scripts/pre-pr-verify.sh` runs this repository entry point against changed production UI source
files. Tests and fixtures are excluded so detector examples do not create false failures. The
vendor smoke test is also registered in `.github/workflows/guards.yml`.

For an authenticated rendered page, reuse an `agent-browser` session and inject the vendored
browser detector:

```sh
bash scripts/impeccable-browser-check.sh mvp-review http://127.0.0.1:5188/mos/cafe 390x844
```

The command emits the rendered findings as JSON and exits 2 when it finds an actionable issue.

Source scans are self-contained. URL scans use the detector's optional browser runtime and still
require the browser dependency supplied by the local toolchain. The repository carries one
fail-closed patch in `detector/cli/main.mjs`: a missing browser dependency or failed navigation
returns a non-zero exit instead of printing an error followed by a false-clean `[]` result. The
vendored browser engine also retains Chromium's sandbox in CI; callers may provide explicit launch
arguments only through the programmatic API when their isolated runner requires them.
