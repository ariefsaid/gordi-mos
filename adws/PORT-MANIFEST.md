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
| `adws/adw_modules/data_types.py` | PMO delta + MOS fix (#335/#336) | PMO: `contract:` key on the agent schema. MOS: `QualityArea`/`QualityOperation` Literals admit `"db"`/`"test"` — upstream's Literals would reject the pgtap block's spec at runtime (latent PMO bug: PMO ships the pgtap block against the unextended Literals). |
| `adws/adw_modules/agents.py` | PMO delta + MOS addition (#335) | PMO: contract file read + verbatim append after prompt render. MOS: a declared-but-missing contract file refuses the run in `validate()` before anything spawns (FAC-002) — never a silent contract-less agent. |
| `adws/adw_modules/quality.py` | PMO delta + MOS wiring (#335/#336) | Grown gate wired to MOS: typecheck → lint (script pins zero warnings) → unit suite → pgTAP-when-`supabase/`-touched, cheap blocks first, first failure skips the heavy ones; all app blocks run in `mos-app/`; unit suite behind `scripts/with-test-lock.sh`; pgTAP reset+test chained inside ONE `scripts/with-db-lock.sh` hold against this project's own stack (`supabase/config.toml` ports). |
| `adws/adw_modules/git_helper.py` | MOS-authored (#336) | Every runner-landed commit carries the project trailer, appended in code (`COMMIT_TRAILER`). |
| `adws/adw_simple_sdlc.py` | PMO delta + MOS rewiring (#335/#336) | PMO: `--builder`/`--reviewer` roster parameterization (FR-006). MOS: `commit_plan` and `commit_docs` are TRACE-record phases, not commits — this repo is public with a blunt docs-split rule, so plan and write-up live in the session dir + trace only; the code commit (`commit_build`) is the chain's only commit. |
| `adws/adw_sssf_config/sssf.config.yaml` | MOS roster (#336) | Substrate ruling 2026-08-15: zai/glm-5.3 (planner/builder/fe_builder — every slot pinned explicitly, incl. fe_builder: no defaults inheritance), zai/glm-4.7 (scout), openai-codex/gpt-5.6-terra (reviewer), openai-codex/gpt-5.6-luna (fe_reviewer/documenter). `contract:` per roster slot → `agents/<name>.md` (authored in #338; a missing contract refuses the run — fail-closed until then). `writes: []` for planner and documenter (docs-split). `protected_files` extended: `agents/`, `scripts/`, `.github/`, `.githooks/`. Two-places header names `docs/agents/pi-delegation.md`. |
| `adws/adw_data/prompt_engineering/planner/system.md` | MOS rewiring (#336) | Contract note (`agents/eng-planner.md`) + the plan's only home is the session dir (docs-split; no `specs/` copy). |
| `adws/adw_data/prompt_engineering/planner/user.md` | MOS rewiring (#336) | Repo-copy step removed; single artifact; `commit_message` stays empty (trace-recorded, not committed). |
| `adws/adw_data/prompt_engineering/builder/system.md` | PMO delta, MOS paths (#336) | Contract note (`agents/implementer.md`) + PMO's do-NOT-git-commit rule (the runner lands commits). |
| `adws/adw_data/prompt_engineering/reviewer/system.md` | PMO delta, MOS paths (#336) | Contract note (`agents/spec-reviewer.md`). |
| `adws/adw_data/prompt_engineering/documenter/system.md` | MOS rewiring (#336) | Contract note (`agents/documenter.md` — MOS runs no contract-less writer into a public repo) + write-up's only home is the session dir (docs-split; no `app_docs/`). |
| `adws/adw_data/prompt_engineering/documenter/user.md` | MOS rewiring (#336) | `app_docs/` copy step removed; single artifact; empty `commit_message`. |
| `adws/adw_data/prompt_engineering/fe_builder/system.md` | PMO delta, MOS paths (#336) | New FE-builder prompt (not in upstream): DESIGN.md-tokens build + agent-browser rendered self-check; `mos-app/` paths; contract `agents/ui-implementer.md`. |
| `adws/adw_data/prompt_engineering/fe_reviewer/system.md` | PMO delta, MOS paths (#336) | New FE-reviewer prompt (not in upstream): rendered-in-browser audit against root `DESIGN.md` incl. ≤390px; contract `agents/design-reviewer.md`. |
| `.env.sample` | MOS rewiring (#336) | Roster note rewritten: zai + openai-codex authenticate through pi (no provider keys here); names-only, no values; public-repo warning; two-places pointer. |
| `scripts/with-db-lock.sh` | PMO delta, MOS-scoped (#335) | DB mutex wrapper; reset+test as one hold. Lock file `~/.mos-supabase-db.lock` + `MOS_*` env vars — per-project, so sibling projects' stacks are never blocked or reset. |
| `scripts/with-test-lock.sh` | PMO delta, MOS-scoped (#335) | Heavy-unit-suite mutex wrapper (one full suite per host at a time); `~/.mos-test.lock`. |
| `scripts/lib/flock-run.sh` | PMO delta, MOS-scoped (#335) | Shared python3/fcntl flock core behind both wrappers; advisory OS lock, kernel-released on process exit. Acquisition order db → test. |
| `scripts/vendor-skills.sh` (sssf stanza) | MOS-authored | The pinned vendor/stamp step. Stamps everything EXCEPT the `SSSF_DEVIATED` files (this table's adws rows) — upstream drift on those is merged by hand on a pin bump; config and `.env.sample` are bootstrap-only stamps. |
| `scripts/vendor-sssf.test.sh` | MOS-authored | FAC-001 conformance self-test. Syncs this table's deviated paths into the expected tree by path, byte-compares the rest; cross-checks its list against this manifest. |
| `scripts/sssf-gate.test.sh` | MOS-authored (#336) | FAC-004/FAC-005 unit layer: runs the REAL `quality.py` + `adw_simple_sdlc.py` under stub siblings — cheap-first ordering, conditional pgTAP, verbatim failure tails, 3-round exhaustion exits with ZERO commits, green run commits exactly once. |
| `scripts/sssf-config.test.sh` | MOS-authored (#336) | FR-007 roster checks: every slot pinned from the ruled substrate set, contracts under `agents/`, protected_files coverage, two-places header — each proven able to fail against perturbed fixtures in the same run. |
| `.gitignore` (sssf block) | MOS-authored | Upstream `install.py`'s runtime entries committed directly (`adws/adw_data/sessions/`, `adws/adw_data/sssf.db*`, `__pycache__/`, `*.pyc`) + `!.env.sample` so the key-name sample (no values) is trackable past this repo's `.env.*` secret guard. |
| `.github/workflows/guards.yml` (sssf lines) | MOS-authored | Registers all three sssf self-tests in the guard lane; any PR touching `adws/**`, the stanza, `.env.sample`, or `justfile` re-proves conformance. |

`justfile` and everything inside `adws/` not listed above remain byte-identical to upstream at
the pin. Notable findings from the diff isolation: PMO's `justfile` is byte-identical to
upstream's (no delta existed to port), and PMO ships its pgtap block against unextended
`QualityArea`/`QualityOperation` Literals (fixed here, see the data_types row).

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

## FAC-003 / FAC-004 evidence (2026-08-18, #336 — real commands, real stack)

Each gate block proven red on a seeded defect and green after revert, run one at a time
(machine-load rule; suite runs used `--maxWorkers=2`). Baselines first: typecheck 0, lint 0,
unit suite 0 (165s).

```
# typecheck — seeded src/fac003-typecheck-seed.ts
$ npm run typecheck        -> exit 2
  error TS2322: Type 'string' is not assignable to type 'number'.
$ rm seed; npm run typecheck -> exit 0

# lint — seeded react-hooks/exhaustive-deps WARNING (zero-warnings bar)
$ npm run lint             -> exit 1
  1 problem (0 errors, 1 warning) … ESLint found too many warnings (maximum: 0)
$ rm seed; npm run lint    -> exit 0

# unit — seeded src/fac003-unit-seed.test.ts
$ npm test -- --maxWorkers=2 …  -> exit 1   (1 test | 1 failed)
$ rm seed                        (suite green already proven in the baseline)

# pgtap — REAL stack (supabase/config.toml ports), the gate's exact argv under the db lock;
# seeded supabase/tests/zz_fac003_seed.sql (select ok(false, …))
$ scripts/with-db-lock.sh bash -c 'supabase db reset && supabase test db'  -> exit 1
  Failed test 1: "fac003 seeded pgTAP failure …"   [db-lock] ACQUIRED … released (rc=1)
$ rm seed; scripts/with-db-lock.sh bash -c 'supabase test db'             -> exit 0
```

FAC-004 (pgTAP conditional, both directions) and FAC-005 (3-round exhaustion exits with zero
commits; control: a green run commits exactly once) are owned by `scripts/sssf-gate.test.sh`,
which runs the real `quality.py`/`adw_simple_sdlc.py`; it was proven able to fail by perturbing
the `_touches_db` condition (red) and reverting (green).
