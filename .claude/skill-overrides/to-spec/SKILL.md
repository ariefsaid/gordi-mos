---
name: to-spec
description: Turn the current conversation into a Gordi MOS spec — no interview, just synthesis of what you've already discussed — with EARS functional requirements, Given/When/Then acceptance criteria, and test-pyramid ownership. Project-upgraded override (folds in the EARS/AC discipline that used to live in feature-forge). Writes docs/specs/<feature>.spec.md.
disable-model-invocation: true
---

Take the current conversation context and codebase understanding and produce a spec. **Do NOT interview the user** — synthesize what you already know. (For a from-scratch requirements *workshop*, that's a different job; this skill is the no-interview synthesis path and is now the single spec authority for this repo.)

## Process

1. **Ground it.** Explore the repo for the current state if you haven't. Use the project's domain glossary (`CONTEXT.md`) vocabulary throughout, and respect any ADRs (`docs/adr/`) in the area you're touching.

2. **Pick the seams.** Sketch where you'll test the feature. Prefer existing seams to new ones; use the highest seam possible; the fewer across the codebase, the better (ideal: one). Confirm the seams match the user's expectations before writing.

3. **Write the spec** to `docs/specs/<feature>.spec.md` using the template below. If the work is architecturally significant (schema, auth, cross-cutting), note that an ADR is needed — authorship stays with the planner. Optionally reference the spec from `docs/backlog.md` or a GitHub issue; the spec file is the source of truth.

## IDs & formats (binding)
- **FR-###** functional requirements, in **EARS**: `When <trigger>, the <system> shall <response>.` / `Where <feature> is active, the <system> shall <behaviour>.` / `The <system> shall <action> within <measure>.`
- **NFR-###** non-functional requirements (performance, security, a11y, tenancy) — no vague "make it fast"; give a measure.
- **AC-###** acceptance criteria, in **Given/When/Then**, each testable.
- **Test-pyramid ownership:** every `AC-###` is owned by **one** test at the **lowest sufficient layer** — Unit (Vitest/RTL, mocked) for logic/components/render-states; Integration (**pgTAP**) for RLS/role read+write contracts; E2E (Playwright) for real cross-stack journeys only. Tag the AC-id in the owning test's title so `grep -r AC-###` finds the proof. State each AC's owning layer in the spec.

<spec-template>

## Problem Statement
The problem the user faces, from the user's perspective.

## Solution
The solution, from the user's perspective.

## User Stories
A LONG, numbered list — `As an <actor>, I want <feature>, so that <benefit>` — covering all aspects of the feature.

## Functional Requirements (EARS)
- FR-001 — When <trigger>, the <system> shall <response>.
- FR-002 — ...

## Non-Functional Requirements
- NFR-001 — The <system> shall <action> within <measure>. (perf / security / a11y WCAG-AA / org_id tenancy / RLS)
- ...

## Acceptance Criteria (Given/When/Then)
- AC-001 *(owning layer: unit | pgTAP | e2e)* — Given <context>, When <action>, Then <observable outcome>.
- AC-002 ...

## Implementation Decisions
Modules built/modified and their interfaces; technical clarifications; architectural decisions; schema changes; API contracts; specific interactions. **No file paths or code snippets** (they rot fast) — exception: a prototype-derived snippet that encodes a decision more precisely than prose (state machine, reducer, schema, type shape); inline just the decision-rich bits and note it came from a prototype.

## Testing Decisions
What makes a good test here (external behavior, not implementation details); which modules are tested and at which layer; prior art (similar tests in the codebase).

## Out of Scope
What this spec deliberately does not cover.

## Further Notes
Anything else.

</spec-template>
