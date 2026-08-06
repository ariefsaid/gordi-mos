# Review: a merge gate that enforces "reviewed by someone other than the author"

You are the independent reviewer. **Do not write to GitHub — no comments, no approvals, no pushes.**
Report your findings to this file's requester as text. Someone else decides what to do with them.

That restriction is the point. This gate exists because a change was once merged on its author's own
review. An earlier attempt at reviewing it had an agent post its own approval comment onto the pull
request — which satisfied the gate while being exactly the thing the gate forbids. Your verdict is
advice, not a sign-off.

## What you are reviewing

Working tree: this directory (a git worktree on branch `chore/review-gate`).

- `scripts/review-gate.sh` — the gate
- `scripts/review-gate.test.sh` — its refusal suite (31 cases; run it with `bash`)
- `.github/workflows/review-gate.yml` — how CI invokes it

A pull request carries a review record — the marker `<!-- review-gate -->` alone on a line, followed
by `Reviewer:`, `Verdict:` and `Commit:` on consecutive lines. The gate reads the PR body and all
comments via `gh`, takes the newest valid record, and refuses when: there is none · the verdict is
`DO NOT MERGE` · the verdict is unrecognised · **the reviewer is the PR author** · the named commit
is not the PR head (a stale review must not gate new code).

Offline mode for testing: `REVIEW_GATE_FIXTURE=<file.json> bash scripts/review-gate.sh`, where the
JSON is `{author, authorName, head, bodies:[...]}`.

## Already found and fixed — do not just re-report these; try to get PAST them

A previous review found five bypasses, all now closed with tests:

1. a record inside a ``` fence was read as a real approval (the PR's own documentation nearly
   self-approved)
2. a malformed *newest* record was dropped, so an older `MERGE` silently stood
3. a record assembled across two separate comments
4. the self-review check compared only the GitHub login `ariefsaid`, while the display name on every
   commit here is `asaid` — so `Reviewer: asaid` passed
5. an undeterminable author skipped the self-review check entirely

And one found by running it live: an inline prose mention of the marker opened a record that could
never complete, so the gate refused its own docs.

## What I want from you

**Break it.** Construct inputs that PASS but should not. Think about: HTML comment variants and
whitespace, indented or nested fences, a record inside an HTML block or a details/summary, CRLF,
unicode look-alikes in the reviewer name, a reviewer string that is empty-ish or punctuation, very
long fields, a `Commit:` naming a sha from a different repo or a branch name, multiple records in
one body, the interaction between the fence toggle and the body separator, and what happens if a
comment body itself contains the literal `===REVIEW-GATE-BODY-END===` line the script uses as its
own separator. That last one looks like the most promising attack — try it first.

**Check the refusals are real.** Break each refusal branch in turn, confirm the matching test goes
red, restore. A refusal with no test that fails when removed is a finding.

**Shell correctness.** `set -Eeuo pipefail` is set. Look for unquoted expansions, a non-zero exit
from `grep`/`awk` killing the script, `shopt -s nocasematch` left set on some exit path, and macOS
bash 3.2 versus GNU bash differences (CI is ubuntu, the author is on macOS — it must work on both).

**The workflow.** It uses `pull_request_target` and checks out the gate from the BASE branch so a
branch cannot rewrite the control that judges it. Verify nothing from the PR head is checked out or
executed. Consider whether the `issue_comment` trigger can be abused, whether the `if:` guard is
right, and whether the run actually attaches to the PR's status.

**The honest question, which I care about most.** In this repo the author spawns every reviewer —
they are all agents. Given that, is this gate worth having at all? It can prove a review was
*recorded*, publicly, against the current commit, by a named non-author identity. It cannot prove
the reviewer was genuinely independent. Say plainly whether you think that is worth the machinery,
or whether it mostly manufactures a feeling of rigour. I would rather hear "delete it" than a
comfortable yes.

## Output

Write your report to
`/private/tmp/claude-502/-Users-ariefsaid-Coding-gordi-mos/cf5b2593-4030-474d-bc9f-fe2b1de9f8f1/scratchpad/luna-gate-review.md`.

- **VERDICT: MERGE / MERGE WITH CHANGES / DO NOT MERGE**, one sentence.
- Every input you found that passes and should not, with the exact fixture and the command.
- Which refusal branches you broke and what went red.
- Your answer to the honest question above.

Quote real command output. Do not claim a check passed that you did not run.
