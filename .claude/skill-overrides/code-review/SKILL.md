---
name: code-review
description: Review the changes since a fixed point across the Gordi MOS review battery — Standards, Spec, and (conditionally) Design, Security, and Acceptance — each in a parallel sub-agent, reported side by side, gated by our domain checks and recorded in the review ledger. Project-upgraded override (keeps the two-axis + Fowler-smell engine, adds our design/security/BDD axes and merge gates). Use to review a branch, PR, or WIP, or when asked to "review since X".
---

Review the diff between `HEAD` and a fixed point the user supplies. Each axis runs as a **parallel sub-agent** (isolated context), then this skill aggregates. **Green gates ≠ reviewed** — a passing CI/typecheck run is not a substitute for the axes below.

## Which axes run
Always: **Standards**, **Spec**. Conditionally, by what the diff touches:
- **Design** (4-lens) — if any `*.tsx` / `*.css` changed.
- **Security** (OWASP/STRIDE) — if any auth / RLS / schema / `org_id` tenancy path changed.
- **Acceptance** (BDD) — if the spec carries `AC-###` criteria.

## Process

### 1. Pin the fixed point
Whatever the user said — a SHA, branch, tag, `main`, `HEAD~5`. If unspecified, ask. Capture once: `git diff <fixed-point>...HEAD` (three-dot, vs merge-base) and `git log <fixed-point>..HEAD --oneline`. Confirm the ref resolves (`git rev-parse`) and the diff is non-empty **before** spawning sub-agents — a bad ref or empty diff fails here.

### 2. Identify the spec source
In order: (1) issue refs in commit messages (`#123`, `Closes #45`); (2) a path the user passed; (3) a spec under `docs/specs/`, `docs/plans/`, or matching the branch/feature; (4) else ask. If there's no spec, the Spec sub-agent reports "no spec available" and Acceptance is skipped.

### 3. Identify the standards sources
Repo docs on how code is written — `CLAUDE.md`, `docs/product-expectations.md`, `CODING_STANDARDS.md`, `CONTRIBUTING.md`. On top of those, Standards always carries the **smell baseline** below. Two rules bind it: **the repo overrides** (a documented standard wins; suppress a smell it endorses), and **always a judgement call** (each smell is a labelled heuristic, never a hard violation; skip anything tooling already enforces).

Each smell reads *what it is* → *how to fix*; match against the diff:
- **Mysterious Name** — a name that doesn't reveal what it does/holds. → rename; if no honest name comes, the design's murky.
- **Duplicated Code** — the same logic shape in more than one hunk/file. → extract, call from both.
- **Feature Envy** — a method reaching into another object's data more than its own. → move it onto the data it envies.
- **Data Clumps** — the same few fields/params always travelling together. → bundle into one type, pass that.
- **Primitive Obsession** — a primitive/string standing in for a domain concept. → give the concept its own small type.
- **Repeated Switches** — the same `switch`/`if`-cascade on the same type recurs. → polymorphism, or one shared map.
- **Shotgun Surgery** — one logical change forces scattered edits across many files. → gather what changes together into one module.
- **Divergent Change** — one module edited for several unrelated reasons. → split so each changes for one reason.
- **Speculative Generality** — abstraction/params/hooks for needs the spec doesn't have. → delete; inline back until a real need shows.
- **Message Chains** — long `a.b().c().d()` navigation. → hide the walk behind one method on the first object.
- **Middle Man** — a class/function that mostly just delegates. → cut it, call the real target direct.
- **Refused Bequest** — a subclass/implementer ignoring most of what it inherits. → drop inheritance, use composition.

### 4. Spawn the axes in parallel
One message, one `Agent` call per active axis (general-purpose), each with the diff command + commit list and its brief. Keep each report under ~400 words.

- **Standards** — include the standards-source files **plus the smell baseline pasted in full** (the sub-agent has no other access). Brief: "Report, per file/hunk: (a) each place the diff breaks a documented standard — cite the standard; (b) any baseline smell — name it, quote the hunk. Documented-standard breaches can be hard violations; baseline smells are always judgement calls; a documented standard overrides the baseline. Skip what tooling enforces."
- **Spec** — include the spec path/contents. Brief: "Report: (a) required behavior missing/partial; (b) behavior not asked for (scope creep); (c) requirements implemented wrong. Quote the spec line per finding."
- **Design** *(if UI changed)* — 4-lens against `DESIGN.md` + the design-plan + the Phase-0 mockup + `docs/jtbd.md`: Visual/correctness · IxD/task-flow · IA/structure · Product-intent JTBD. Renders and screenshots the running app.
- **Security** *(if auth/RLS/schema/org_id changed)* — OWASP Top 10 + STRIDE on auth, Supabase **RLS policies**, and the `org_id` tenancy seam. Think like an attacker; no security theater. Confirm **RLS on every business table** and app/workspace seams.
- **Acceptance** *(if AC-### exist)* — verify each `AC-###` at its owning layer (unit / pgTAP / e2e); `grep -r AC-###` must find the proving test and it must pass.

### 5. Domain gates (report pass/fail, don't hand-wave)
- Coverage **≥80%** on changed lines; tests assert behavior.
- `npm run typecheck` zero errors; ESLint zero (`--max-warnings=0`); `npm run build` clean.
- RLS present on every business table touched; migrations reversible.

### 6. Aggregate & record
Present each axis under its own `## Standards` / `## Spec` / `## Design` / `## Security` / `## Acceptance` heading, verbatim or lightly cleaned. **Do not merge or rerank across axes** — the separation stops one axis masking another. End with per-axis finding counts + the worst issue *within each axis* (no single cross-axis winner) and the gate results.

Record the verdicts in **`docs/reviews/<branch>.md`** and verify the battery ran with `bash scripts/pre-merge-check.sh` (exit 0). No ledger + no passing script run = not reviewed = no merge.

**Then capture decisions (OD-SDD-5).** A review is where decisions surface — a finding accepted as a known limitation, a fix deliberately deferred, an axis deviating from the spec on purpose. Those belong in **`docs/decisions.md`** under the right `OD-` group, not only in the review ledger: ledgers are per-branch and get archived, so a decision left there is invisible to the next feature. Record the *reads as damage* framing alongside it when the resulting state will look like breakage. Never create a new decisions document.

## Why separate axes
A change can pass one and fail another: standards-clean but wrong feature (Standards pass, Spec fail); exactly-what-was-asked but breaks conventions or RLS (Spec pass, Standards/Security fail). Reporting them separately keeps one from masking the others.

### Recording a decision (OD-SDD-5)

Two series, and the distinction is the owner's:

- **`OD-`** — the owner locked it. **Quote them verbatim**, in a `> ` block, dated. Do not paraphrase: the paraphrase is where intent drifts, and the next agent inherits your wording rather than theirs. If you cannot quote it, it is not an `OD-`.
- **`DD-`** — you decided it, inside delegated authority, because the work could not proceed without an answer. Reversible; the owner may overturn it. Say so plainly rather than dressing a judgement call as settled.

The **ruling** goes in `docs/decisions.md` as one line. The **why**, the verbatim quote, and the *reads as damage → why correct → what would actually be wrong* detail go in `docs/decisions/<group>.md`. Never create a new top-level decisions document; append to the existing group.
