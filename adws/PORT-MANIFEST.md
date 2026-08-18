# SSSF port manifest

The `adws/` factory skeleton is vendored wholesale from upstream
`disler/super-simple-software-factory` (MIT — see `adws/LICENSE`), stamped by the sssf stanza in
`scripts/vendor-skills.sh` exactly the way upstream's own skill installer
(`.claude/skills/sssf/scripts/install.py`) lays it out: `templates/adws/` → `adws/`,
`templates/prompt_engineering/` → `adws/adw_data/prompt_engineering/`,
`templates/harness_engineering/` → `adws/adw_data/harness_engineering/`,
`templates/sssf.config.yaml` → `adws/adw_sssf_config/sssf.config.yaml`,
`templates/env.sample` → `/.env.sample`, `templates/justfile` → `/justfile`,
plus upstream's runtime `.gitignore` entries (committed directly in this repo's `.gitignore`).

- **Upstream pin:** `de31374882e7a4e3e5b7bb9bd09e69dc2f779356`
  (single source of truth: `SSSF_PIN` in `scripts/vendor-skills.sh`; this line must match it —
  the self-test checks)
- **Vendored:** 2026-08-18 (#334)
- **Conformance (FAC-001):** `scripts/vendor-sssf.test.sh` re-clones upstream at the pin, rebuilds
  the expected stamped tree, and fails on any byte difference outside the deviation table below.

Re-vendor loop: bump `SSSF_PIN`, re-run `scripts/vendor-skills.sh`, review `git diff adws/`,
update this manifest, re-run the self-test.

## Deviations from upstream at the pin

| File | Status | Reason |
| --- | --- | --- |
| `adws/PORT-MANIFEST.md` | MOS-authored | This manifest. |
| `adws/LICENSE` | Upstream byte-identical, relocated | Upstream keeps its MIT LICENSE at repo root; MOS relocates the copy so the notice travels with the vendored code. Copyright line intact. |
| `adws/adw_modules/data_types.py` | PMO delta (#335) | `contract:` key on the agent schema — repo-relative role-contract path, appended verbatim to the system prompt. |
| `adws/adw_modules/agents.py` | PMO delta + MOS addition (#335) | PMO: contract file read + verbatim append after prompt render. MOS: a declared-but-missing contract file refuses the run in `validate()` before anything spawns (FAC-002) — never a silent contract-less agent. |
| `adws/adw_modules/quality.py` | PMO delta (#335) | Grown gate: typecheck → lint → unit suite → pgTAP-when-`supabase/`-touched, cheap blocks first, first failure skips the heavy ones; unit suite behind `scripts/with-test-lock.sh`; pgTAP reset+test chained inside ONE `scripts/with-db-lock.sh` hold. Upstream placeholder argvs kept — real MOS commands are `TODO(#336)`. |
| `adws/adw_simple_sdlc.py` | PMO delta (#335) | `--builder`/`--reviewer` roster parameterization so an FE slice swaps in the FE roster with the chain unchanged (FR-006). |
| `scripts/with-db-lock.sh` | PMO delta, MOS-scoped (#335) | DB mutex wrapper; reset+test as one hold. Lock file `~/.mos-supabase-db.lock` + `MOS_*` env vars — per-project, so sibling projects' stacks are never blocked or reset. |
| `scripts/with-test-lock.sh` | PMO delta, MOS-scoped (#335) | Heavy-unit-suite mutex wrapper (one full suite per host at a time); `~/.mos-test.lock`. |
| `scripts/lib/flock-run.sh` | PMO delta, MOS-scoped (#335) | Shared python3/fcntl flock core behind both wrappers; advisory OS lock, kernel-released on process exit. Acquisition order db → test. |
| `scripts/vendor-skills.sh` (sssf stanza) | MOS-authored | The pinned vendor/stamp step itself. Since #335 it stamps everything EXCEPT the four deviated python files above — upstream drift on those is merged by hand on a pin bump. |
| `scripts/vendor-sssf.test.sh` | MOS-authored | The FAC-001 conformance self-test. Its byte-compare exclusion list must match this table (cross-checked in the test). |
| `.gitignore` (sssf block) | MOS-authored | Upstream `install.py`'s runtime entries committed directly (`adws/adw_data/sessions/`, `adws/adw_data/sssf.db*`, `__pycache__/`, `*.pyc`) + `!.env.sample` so the stamped key-name sample (no values) is trackable past this repo's `.env.*` secret guard. |
| `.github/workflows/guards.yml` (sssf lines) | MOS-authored | Registers the self-test in the guard lane; any PR touching `adws/**`, the stanza, `.env.sample`, or `justfile` re-proves byte-identity. |

Root-stamped files (`.env.sample`, `justfile`) and everything inside `adws/` not listed above
remain byte-identical to upstream at the pin. Notable finding from the #335 diff isolation:
PMO's `justfile` is byte-identical to upstream's — the sdlc/plan/sessions/phases/tail/procs/obs
recipes are upstream's own, so no justfile delta exists to port. PMO's config values (model pins,
contract paths, `docs/plans/` plan home, the fe_builder/fe_reviewer roster entries) and its prompt
scaffolding edits are deliberately NOT ported here — they carry project values and land with MOS
values in #336.

## FAC-001 evidence (2026-08-18, at vendor time)

The self-test was proven able to fail: green on the pristine stamp, red on a one-line
perturbation of a vendored file, green again after revert.

```
$ bash scripts/vendor-sssf.test.sh          # pristine
  ok    adws/ byte-identical to upstream stamp at pin (manifest files excepted)
  ...
6 passed, 0 failed                           (exit 0)

$ echo "# perturbed" >> adws/adw_modules/gates.py
$ bash scripts/vendor-sssf.test.sh
  FAIL  adws/ deviates from upstream at pin:
        diff -r ... expected/adws/adw_modules/gates.py .../adws/adw_modules/gates.py
        108a109
        > # perturbed
5 passed, 1 failed                           (exit 1)

$ # revert the line
$ bash scripts/vendor-sssf.test.sh
6 passed, 0 failed                           (exit 0)
```

## FAC-001 evidence (2026-08-18, after the #335 PMO-delta port)

Green with the delta rows manifested and excluded; still red on an UNMANIFESTED file; the
re-run vendor stamp preserves the deviated files:

```
$ bash scripts/vendor-sssf.test.sh          # deltas applied + manifested
6 passed, 0 failed                           (exit 0)

$ echo "# perturbed" >> adws/adw_modules/runner.py    # runner.py is NOT manifest-listed
$ bash scripts/vendor-sssf.test.sh
  FAIL  adws/ deviates from upstream at pin:
        ... adw_modules/runner.py
        142a143
        > # perturbed
5 passed, 1 failed                           (exit 1)

$ # revert; re-run scripts/vendor-skills.sh  -> deltas intact, tree unchanged
$ bash scripts/vendor-sssf.test.sh
6 passed, 0 failed                           (exit 0)
```
