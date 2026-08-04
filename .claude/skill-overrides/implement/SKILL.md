---
name: implement
description: "Implement one piece of work from a spec or set of tickets, test-first, to Gordi MOS standards. Project-upgraded override — carries the implementer-agent discipline (TDD iron law, escalate-not-guess, verify with fresh evidence, self-review) into a user-invoked build session."
disable-model-invocation: true
---

Implement the work described in the spec or tickets — **exactly** what is asked, nothing more (YAGNI). Build one task to done before starting the next.

## Iron law (TDD)
NO production code without a failing test first. **RED → GREEN → REFACTOR.** Tests assert real behavior, not mocks, and never bend to the app's current state to go green. Use `/tdd` at pre-agreed seams; prefer the highest existing seam, the fewest seams possible.

## Loop
0. **Orient (OD-SDD).** Read `docs/decisions/sdd.md` before treating anything odd as broken — a missing file, an archived doc, a disabled test, a deferred issue. Those are usually settled decisions, and "repairing" one costs a session. Verify absence with `command -v` / a real search before asserting it.
1. **Clarify first.** If requirements, acceptance criteria, approach, or dependencies are unclear, ask *before* writing code. Bad work is worse than no work.
2. **Red** — write the failing test that encodes the user's real journey to the goal, and prove it fails for the right reason.
3. **Green** — the minimal code that passes.
4. **Refactor** — improve what you touched; don't restructure beyond the task.
5. **Verify** — run the commands below and read exit codes. No completion claim without fresh passing evidence.
6. **Self-review** — completeness, naming, YAGNI, tests-verify-behavior, ≥80% coverage on changed lines.
7. **Review** — run `/code-review` against the branch point.
8. **Capture decisions (OD-SDD-5).** Before committing, ask: *did this session settle anything a future agent would otherwise have to re-derive — a deviation from the spec, a deferral, a rejected approach, a constraint discovered the hard way?* If yes, append it to `docs/decisions.md` under the right `OD-` group (and `docs/decisions/sdd.md` if the resulting state will read as damage). Do **not** invent a new decisions document. A decision that lives only in the commit message or the conversation is lost.
9. **Commit** to the current branch with a clear message.

## Verify (run inside `mos-app/`)
```
npm run typecheck    # zero errors — NOT `npx tsc --noEmit` (solution-file false-pass)
npm run lint         # ESLint zero errors (--max-warnings=0)
npm test             # Vitest — the failing test now passes; nothing else regressed
npm run build        # catches what typecheck alone misses (tsc -b includes tests)
```
Coverage on changed code must reach **≥80%** and tests must assert behavior.

## Code organization
- One clear responsibility per file; follow existing `mos-app/` patterns (React 19 + TS; data layer in `src/lib/db/*`).
- Improve code you touch, but if a file grows beyond the task's intent, **stop and report** — don't split files on your own.
- Production-grade: handle loading / empty / error / edge states, responsive layout, WCAG-AA a11y; reusable components with clean props. Watch for needless re-renders, expensive ops, leaks.
- Quality/scalability upgrades to existing code **must not change behavior**.

## Escalate (stop and report) when
architectural choices with multiple valid approaches arise; you need code beyond what was provided; you're unsure the approach is correct; or the task needs restructuring the plan didn't anticipate. Escalating is never penalized.

## Report
Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT — what you implemented; what you tested + results; files changed; self-review findings; concerns.

## Commit trailer
```
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

### Recording a decision (OD-SDD-5)

Two series, and the distinction is the owner's:

- **`OD-`** — the owner locked it. **Quote them verbatim**, in a `> ` block, dated. Do not paraphrase: the paraphrase is where intent drifts, and the next agent inherits your wording rather than theirs. If you cannot quote it, it is not an `OD-`.
- **`DD-`** — you decided it, inside delegated authority, because the work could not proceed without an answer. Reversible; the owner may overturn it. Say so plainly rather than dressing a judgement call as settled.

The **ruling** goes in `docs/decisions.md` as one line. The **why**, the verbatim quote, and the *reads as damage → why correct → what would actually be wrong* detail go in `docs/decisions/<group>.md`. Never create a new top-level decisions document; append to the existing group.
