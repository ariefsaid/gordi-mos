---
name: handoff
description: Compact the current conversation into a handoff document for another agent to pick up.
argument-hint: "What will the next session be used for?"
disable-model-invocation: true
---

Write a handoff document summarising the current conversation so a fresh agent can continue the work. Save to the temporary directory of the user's OS - not the current workspace.

Include a "suggested skills" section in the document, which suggests skills that the agent should invoke.

Do not duplicate content already captured in other artifacts (specs, plans, ADRs, issues, commits, diffs). Reference them by path or URL instead.

Redact any sensitive information, such as API keys, passwords, or personally identifiable information.

If the user passed arguments, treat them as a description of what the next session will focus on and tailor the doc accordingly.

---

<!-- Below is the project hardening (OD-SDD group). ADDITIVE by design: upstream's text above is kept
     verbatim, so a re-vendor surfaces real upstream drift rather than our delta. -->

## End with the prompt that starts the next session

Upstream does not ask for this; it is the single thing most often missing.

The final section is the **literal text the user pastes into a fresh session** — fenced, nothing to fill in, and **including this file's own absolute path**. The handoff lives outside the repo, so that path is the only thing connecting it to anything; a handoff the user must translate into an opening prompt is half-finished.

Name in it: the decision-group files to read *before* touching anything odd, any artifact worth reading first (an open PR, a ticket), and the skill to run. Close by saying nothing in the handoff is load-bearing — every decision it cites lives in `docs/decisions.md`, so if the file is lost the next session is slower, not wrong.

## Flush unrecorded decisions FIRST (OD-SDD-5)

**Before writing the handoff, sweep the conversation for decisions made and acted on but never recorded.** Write each to its durable home — **`docs/decisions.md`** as a one-line ruling, the why in `docs/decisions/<group>.md`, or `docs/adr/` when architectural — then reference it from the handoff.

Two upstream rules combine into a trap: the handoff lives in a temp directory so it **expires**, and "do not duplicate what is in the ADRs" assumes the decision reached an ADR. A decision executed but never written down satisfies both and evaporates anyway; the next agent meets its *effects* with no record of intent.

Ask per decision: *if the next three sessions never read this file, does this survive?* If no, it is not handoff material — it is a decision record. Never create a new top-level decisions document; append to the existing group.

### `OD-` vs `DD-`

- **`OD-`** — the owner locked it. **Quote them verbatim**, dated, in a `> ` block. The paraphrase is where intent drifts. If you cannot quote it, it is not an `OD-`.
- **`DD-`** — you decided it inside delegated authority, because the work could not proceed without an answer. Reversible; say so plainly rather than dressing a judgement call as settled.

## Flag what will look wrong but isn't

For every state a fresh agent would read as **damage** — a missing file, content in `archive/`, a disabled test or odd fixture, a colliding ID, work deferred with no visible reason, a tool that appears absent — write one line: **what it looks like → why it is correct → what would actually be wrong.**

> `docs/environments.md` is not in the repo. Deliberate — `docs/` is local-only (public repo). Restoring it would be the error.

Without this the next agent finds the anomaly, calls it breakage, and "repairs" a deliberate decision. That has happened here: an archive-and-remove pass was handed off faithfully as *work completed*, and the receiving session spent a long stretch undoing it.

**A record of what was DONE invites the next agent to fix it. A record of what was DECIDED, plus what will look wrong as a result, stops them.**

## Verify before you assert

Handoffs are trusted on sight, so a wrong line costs more here than in chat. Before stating something is missing, broken, absent or complete, check it — `command -v` for a tool, a real search for a file, a real command for a green gate. Write "unverified" rather than a confident guess.
