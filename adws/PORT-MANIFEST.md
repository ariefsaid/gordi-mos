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
| `scripts/vendor-skills.sh` (sssf stanza) | MOS-authored | The pinned vendor/stamp step itself. |
| `scripts/vendor-sssf.test.sh` | MOS-authored | The FAC-001 conformance self-test. |
| `.gitignore` (sssf block) | MOS-authored | Upstream `install.py`'s runtime entries committed directly (`adws/adw_data/sessions/`, `adws/adw_data/sssf.db*`, `__pycache__/`, `*.pyc`) + `!.env.sample` so the stamped key-name sample (no values) is trackable past this repo's `.env.*` secret guard. |
| `.github/workflows/guards.yml` (sssf lines) | MOS-authored | Registers the self-test in the guard lane; any PR touching `adws/**`, the stanza, `.env.sample`, or `justfile` re-proves byte-identity. |

No vendored file inside `adws/`, and neither root-stamped file (`.env.sample`, `justfile`),
deviates from upstream at the pin. PMO's adaptations are deliberately NOT applied here — they are
port ticket 2, and land as new rows in this table.

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
