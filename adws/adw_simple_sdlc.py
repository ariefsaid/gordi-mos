#!/usr/bin/env -S uv run
# /// script
# dependencies = ["pydantic", "python-dotenv", "pyyaml", "rich"]
# ///
"""ADW Simple SDLC — plan, build, test, review, document, committing as it goes.

Usage:
    uv run adws/adw_simple_sdlc.py "<prompt or path/to/prompt.md>" [--config adws/adw_sssf_config/sssf.config.yaml] [--adw-id a1b2c3d4]
    uv run adws/adw_simple_sdlc.py --findings "<text or path>" --from-adw-id <prior id>

Phases: engineer(request) -> planner -> code(commit_plan: trace record)
        -> builder -> code(test) [-> builder(fix) -> code(test) ... bounded]
        -> reviewer [-> builder(revise) -> reviewer ... bounded]
        -> code(retest, only if a revision changed code)
        -> git(commit_build) -> code(changes) -> documenter -> code(commit_docs: trace record)

Findings mode (MOS #343 train — the findings-rerun rule): review findings
against an already-planned change do not need a new plan. `--findings` +
`--from-adw-id` reuses the prior session's RECORDED plan envelope, skips the
plan phase entirely, and enters at build with the findings as the prompt
("close these findings against the existing plan"). The reuse_plan phase
COPIES the plan artifacts into this session's context_handoff (#367): the
builder reads them via `previous=`, and the reviewer finds `plan.md` in its
own session exactly as after a normal plan phase — review-against-plan holds
in every findings run. The rerun is its own new adw_id; the prior id is logged
on the request phase record, so the two sessions link in the trace. Round caps
and gates are unchanged.

One commit, three work products (MOS #336). The plan and the write-up are
documentary, and this repo is PUBLIC with a blunt docs-split rule — they live
in the session dir and land on the TRACE record at their phase, never in git.
Only the code commits (`commit_build`), in the builder's own words
(`commit_message` on BuildOutput), with the project trailer appended by
git_helper.

Testing is CODE, not an agent. `bun test` is a command, not a judgement call:
an agent rediscovering it every run costs a million tokens to learn what a
subprocess already knows. Failures travel back to the builder as an envelope,
so the repair loop is unchanged — only the runner became free and repeatable.

Two different questions still get asked, in order. The suite asks "does it
run"; the reviewer asks "is this what was asked for", against `plan.md` — and
neither can answer the other's. A revision that closes a review finding
re-enters the suite, so the tree that gets committed is the tree that was both
tested and approved.

The code commit lands after verification, not straight after the build: fixes
and revisions are part of the same work product, and red code has no business
on the branch. A run that fails verification therefore commits NOTHING — the
plan stays on the trace as the record of what was asked, and the unfinished
code stays dirty in the working tree where the engineer can see it.

The documenter measures against the commit this run STARTED from, not against
`main`, because by then the run has moved `main` itself. That baseline is
pinned before the first commit phase and printed in the request phase.
"""

import argparse
import json
import re
import shutil
import sys
from pathlib import Path

from adw_modules import agents, changes, gates, git_helper, quality, session, utils
from adw_modules.data_types import (AgentCall, BuildOutput, ChangeCapture,
                                    DocumentOutput, PhaseParams, PlanOutput,
                                    ReviewOutput)

MAX_FIX_LOOPS = 3
MAX_REVISION_LOOPS = 2

DOCUMENT_NOTES = ("Read diff_path in full before writing. Document only what the "
                  "diff shows. The write-up lives in <context_handoff_dir> only — "
                  "this repo is PUBLIC and documentary artifacts never land in its "
                  "tree (docs-split rule); the session dir and trace are the record.")

FINDINGS_PROMPT = ("Close these findings against the existing plan (from run "
                   "{prior}). The plan is the previous envelope — read its "
                   "artifacts in full before changing anything; do not re-plan.\n\n"
                   "Findings:\n{findings}")


# The exact shape session.py mints (utils.new_id(8) -> token_hex): 8 lowercase
# hex chars. --from-adw-id becomes a filesystem path component, so anything
# else is refused BEFORE any file read — an id is opaque, never a path.
_ADW_ID = re.compile(r"^[0-9a-f]{8}$")


def _prior_plan(cfg, prior_adw_id: str) -> PlanOutput:
    """The plan envelope the prior session recorded — reused verbatim as build context."""
    if not _ADW_ID.fullmatch(prior_adw_id):
        raise SystemExit(f"--from-adw-id {prior_adw_id!r} is not a session id "
                         f"(8 hex chars, as the runner mints them)")
    sessions = (Path(cfg.defaults.data_dir) / "sessions").resolve()
    path = (sessions / prior_adw_id / "planner" / "envelope.json").resolve()
    if sessions not in path.parents:      # defense in depth behind the format check
        raise SystemExit(f"--from-adw-id {prior_adw_id!r} is not a session id "
                         f"(resolves outside the sessions dir)")
    if not path.is_file():
        raise SystemExit(f"--from-adw-id {prior_adw_id}: no recorded plan envelope at "
                         f"{path} — findings mode needs a prior session that planned")
    return PlanOutput.model_validate(json.loads(path.read_text()))


def _adopt_plan(run, plan: PlanOutput, prior_dir: Path) -> PlanOutput:
    """Copy the prior session's plan artifacts into THIS session's context_handoff.

    The reused plan lives in the PRIOR session's dir. The builder gets it as
    `previous=`, but the reviewer's spec convention is
    `<context_handoff_dir>/plan.md` in its OWN session — without this copy the
    reviewer judged blind (#367, seen live in run bc868de1: review.md admitted
    no plan.md was present and approved a build that met almost none of the
    plan's obligations). Copying puts the plan exactly where a normal run's
    planner leaves it, so every later phase finds it with no special-casing.
    Artifact paths are agent-recorded, so each one is held inside the prior
    session dir before it is read — same defense as `_prior_plan`.
    """
    adopted = []
    for artifact in plan.artifacts:
        src = Path(artifact)
        if not src.is_absolute():
            src = Path(run.repo_root) / src
        src = src.resolve()
        if prior_dir not in src.parents:
            raise SystemExit(f"prior plan artifact {artifact!r} resolves outside its "
                             f"session dir — refusing to adopt it")
        if not src.is_file():
            raise SystemExit(f"prior plan artifact missing: {src} — a findings rerun "
                             f"cannot review against a plan that no longer exists")
        dest = run.context_handoff_dir / src.name
        shutil.copyfile(src, dest)
        adopted.append(str(dest))
    plan.artifacts = adopted
    return plan


def main(prompt: str | None, config: str = "adws/adw_sssf_config/sssf.config.yaml", adw_id: str | None = None,
         builder: str = "builder", reviewer: str = "reviewer",
         findings: str | None = None, from_adw_id: str | None = None) -> int:
    # builder/reviewer are roster names — swap in fe_builder/fe_reviewer for a UI slice;
    # the chain is otherwise identical.
    findings_mode = findings is not None
    if findings_mode:
        if not from_adw_id:
            raise SystemExit("--findings requires --from-adw-id <prior session id>")
        prompt = FINDINGS_PROMPT.format(prior=from_adw_id, findings=findings)
    if prompt is None:
        raise SystemExit("a prompt is required (or --findings with --from-adw-id)")
    cfg = agents.load_config(config)
    required = [builder, reviewer, "documenter"]
    agents.validate(cfg, required if findings_mode else ["planner", *required])
    builder_model = agents.resolve(cfg, builder).model   # commit attribution (#343)
    run = session.ensure(cfg, adw_id)
    baseline = git_helper.rev("HEAD")     # pinned before this run commits anything

    def commit(ph, envelope) -> None:
        """Commit what the preceding phase produced, in that agent's own words."""
        message = envelope.commit_message or f"sssf({run.adw_id}): {envelope.summary}"
        # #343: the trailer names the model that built this — the executing
        # builder's roster model, never a hardcoded substrate.
        ph.log(sha=git_helper.commit_all(message, model=builder_model), message=message)

    def record(ph, result) -> None:
        """Log a deterministic block's verdict — the same shape every ADW uses."""
        passed = sum(1 for check in result.checks if check.passed)
        ph.log(passed=result.passed, checks=f"{passed}/{len(result.checks)}",
               artifacts=", ".join(result.artifacts))

    with run.phase(PhaseParams(name="request", kind="engineer", owner=run.engineer,
                               description="Capture the incoming ask")) as ph:
        if findings_mode:
            # The link between the two sessions lives here, on the request record.
            ph.log(input=prompt, baseline=git_helper.short_sha(baseline),
                   prior_adw_id=from_adw_id,
                   mode="findings rerun — plan reused from the prior session")
        else:
            ph.log(input=prompt, baseline=git_helper.short_sha(baseline))

    if findings_mode:
        plan = _prior_plan(cfg, from_adw_id)
        prior_dir = (Path(cfg.defaults.data_dir) / "sessions" / from_adw_id).resolve()
        with run.phase(PhaseParams(name="reuse_plan", kind="code", owner="git",
                                   description="Findings rerun: adopt the prior session's recorded "
                                               "plan into this session instead of planning again")) as ph:
            plan = _adopt_plan(run, plan, prior_dir)
            ph.log(prior_adw_id=from_adw_id, plan=", ".join(plan.artifacts),
                   note="plan artifacts copied into this session's context_handoff, so the "
                        "builder AND the reviewer find the plan where a normal run puts it "
                        "(#367); the planner never runs")
    else:
        with run.phase(PhaseParams(name="plan", kind="agent", owner="planner",
                                   description="Turn the request into an implementable plan")) as ph:
            plan = ph.call(AgentCall(output_type=PlanOutput, prompt=prompt,
                                     gates=[gates.artifacts_exist, gates.files_non_empty]))

        # MOS (#336): the plan is documentary, and this repo is PUBLIC with a blunt
        # docs-split rule — documentary artifacts never land in its tree. The plan
        # stays in the session dir (gitignored); this phase puts it on the TRACE
        # record before any code exists to blur it, instead of in a commit.
        with run.phase(PhaseParams(name="commit_plan", kind="code", owner="git",
                                   description="Put the plan on the trace record before any code exists to blur it")) as ph:
            ph.log(recorded=", ".join(plan.artifacts),
                   note="plan recorded in the session dir + trace; not committed (docs-split rule)")

    with run.phase(PhaseParams(name="build", kind="agent", owner=builder,
                               description="Implement the plan exactly")) as ph:
        build = ph.call(AgentCall(output_type=BuildOutput, prompt=prompt, previous=plan,
                                  gates=[gates.diff_matches_claims]))

    test = None
    for i in range(1, MAX_FIX_LOOPS + 1):
        with run.phase(PhaseParams(name=f"test_{i}", kind="code", owner="quality",
                                   description="Run the suite — a known command, so code runs "
                                               "it and no agent has to rediscover it")) as ph:
            test = quality.run_tests(run)
            record(ph, test)

        if test.passed:
            break

        with run.phase(PhaseParams(name=f"fix_{i}", kind="agent", owner=builder, retries=1,
                                   description="Repair what the suite reported, from its "
                                               "verbatim output")) as ph:
            build = ph.call(AgentCall(output_type=BuildOutput, prompt=prompt,
                                      previous=quality.as_envelope(test, "tests"),
                                      gates=[gates.diff_matches_claims]))

    review = None
    revised = False
    for i in range(1, MAX_REVISION_LOOPS + 1):
        with run.phase(PhaseParams(name=f"review_{i}", kind="agent", owner=reviewer,
                                   description="Confirm the build matches the plan")) as ph:
            review = ph.call(AgentCall(output_type=ReviewOutput, prompt=prompt, previous=build,
                                       gates=[gates.artifacts_exist, gates.verdict_consistent]))

        if review.approved or i == MAX_REVISION_LOOPS:
            break

        with run.phase(PhaseParams(name=f"revise_{i}", kind="agent", owner=builder, retries=1,
                                   description="Close the reviewer's blocking findings")) as ph:
            build = ph.call(AgentCall(output_type=BuildOutput, prompt=prompt, previous=review,
                                      gates=[gates.diff_matches_claims]))
            revised = True

    # A revision edited code after the suite last ran, so the green light is
    # stale. Re-run it rather than commit on a result that predates the change.
    if revised and review is not None and review.approved:
        with run.phase(PhaseParams(name="retest", kind="code", owner="quality",
                                   description="Re-run the suite — the revision changed code "
                                               "after the last green result")) as ph:
            test = quality.run_tests(run)
            record(ph, test)

    # Red tests or a rejected review stop the chain here: the code stays
    # uncommitted and nothing is documented, because there is nothing worth
    # describing yet. The plan commit stands — it is a record of what was asked.
    verified = (test is not None and test.passed
                and review is not None and review.approved)
    if verified:
        with run.phase(PhaseParams(name="commit_build", kind="code", owner="git",
                                   description="Land the code only now: green suite, approved review")) as ph:
            commit(ph, build)

        with run.phase(PhaseParams(name="changes", kind="code", owner="git",
                                   description="Diff the whole run against its pinned baseline, for the documenter")) as ph:
            changeset = changes.capture(run, ChangeCapture(base=baseline))
            ph.log(base=f"{changeset.base.label} @ {changeset.base.commit[:7]}",
                   reason=changeset.base.reason,
                   files=len(changeset.files) + len(changeset.untracked),
                   lines=f"+{changeset.insertions} -{changeset.deletions}",
                   diff=changeset.diff_path)
            if changeset.empty:
                raise RuntimeError(
                    f"nothing changed since {changeset.base.label} "
                    f"({changeset.base.reason}) — there is nothing to document.")

        with run.phase(PhaseParams(name="document", kind="agent", owner="documenter", retries=1,
                                   description="Write up the completed change")) as ph:
            document = ph.call(AgentCall(output_type=DocumentOutput, prompt=prompt,
                                         previous=changes.as_envelope(changeset, DOCUMENT_NOTES),
                                         gates=[gates.artifacts_exist, gates.files_non_empty]))

        # MOS (#336): same docs-split rule as commit_plan — the write-up stays in
        # the session dir; the trace is its record, not a commit.
        with run.phase(PhaseParams(name="commit_docs", kind="code", owner="git",
                                   description="Put the write-up on the trace record beside the code it describes")) as ph:
            ph.log(recorded=", ".join(document.artifacts),
                   note="write-up recorded in the session dir + trace; not committed (docs-split rule)")

    return run.finish(accepted=verified,
                      reason="the suite or the review never came back clean")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("prompt", nargs="?", default=None,
                        help="inline text or a path to a prompt file (omit in findings mode)")
    parser.add_argument("--config", default="adws/adw_sssf_config/sssf.config.yaml")
    parser.add_argument("--adw-id", default=None, help="join or pin an existing session")
    parser.add_argument("--builder", default="builder",
                        help="roster agent for build/fix/revise phases (e.g. fe_builder for a UI slice)")
    parser.add_argument("--reviewer", default="reviewer",
                        help="roster agent for review phases (e.g. fe_reviewer for a UI slice)")
    parser.add_argument("--findings", default=None,
                        help="findings text or file — skip planning and enter at build "
                             "against a prior session's recorded plan (requires --from-adw-id)")
    parser.add_argument("--from-adw-id", default=None,
                        help="the prior session whose recorded plan the findings close")
    args = parser.parse_args()
    if args.findings is None and args.prompt is None:
        parser.error("a prompt is required (or --findings with --from-adw-id)")
    if args.findings is not None and args.prompt is not None:
        parser.error("pass a prompt OR --findings, not both — findings ARE the build prompt")
    if args.findings is not None and args.from_adw_id is None:
        parser.error("--findings requires --from-adw-id <prior session id>")
    sys.exit(main(utils.resolve_prompt(args.prompt) if args.prompt else None,
                  args.config, args.adw_id, args.builder, args.reviewer,
                  findings=utils.resolve_prompt(args.findings) if args.findings else None,
                  from_adw_id=args.from_adw_id))
