---
name: tdd
description: Test-driven development — the red→green→refactor loop that produces tests worth keeping. Use when building features or fixing bugs test-first, when the user mentions "red-green-refactor", or wants integration tests. Project-upgraded override — Matt's seam/anti-pattern structure fused with superpowers' enforcement discipline.
---

# Test-Driven Development

TDD is the red → green → refactor loop. This skill is the reference that makes the loop produce tests worth keeping. Every section applies on **every** cycle — consult them before and during the loop, not after.

Read `CONTEXT.md` (if present) so test names and interface vocabulary match the project's domain language, and respect ADRs in the area you touch.

## The Iron Law
```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```
Wrote code before the test? **Delete it and start over.** Don't keep it "as reference", don't "adapt" it while writing tests, don't look at it. Delete means delete — implement fresh from the test. Thinking "skip TDD just this once"? That's rationalization; stop. (Exceptions, ask first: throwaway prototypes, generated code, config.)

## What a good test is
Tests verify **behavior through public interfaces**, not implementation details. Code can change entirely; the test shouldn't. A good test reads like a specification — `user can checkout with valid cart` tells you exactly what capability exists — and survives refactors because it doesn't care about internal structure. One behavior per test; if the name needs "and", split it. Use real code; mocks only when unavoidable (mocking everything = code too coupled → use dependency injection).

## Seams — where tests go
A **seam** is the public boundary you test at: the interface where you observe behavior without reaching inside. **Test only at pre-agreed seams** — before writing any test, write down the seams under test and confirm them with the user. No test at an unconfirmed seam. You can't test everything; agreeing seams up front lands effort on critical paths and complex logic. Ask: "What's the public interface, and which seams should we test?"

## The loop
1. **RED — write the failing test.** One minimal test showing what should happen; it encodes the user's real journey to the goal. Expected values come from an **independent source of truth** (a known-good literal, worked example, the spec) — never recomputed the way the code does.
2. **Verify RED (MANDATORY, never skip).** Run the single test file. Confirm it **fails, not errors**, and fails for the **expected reason** (feature missing, not a typo). *If you didn't watch it fail, you don't know it tests the right thing.* Passes immediately? You're testing existing behavior — fix the test.
3. **GREEN — minimal code to pass.** Simplest thing that works. No speculative features, params, or hooks (YAGNI). Don't "improve" beyond the test.
4. **Verify GREEN.** Test passes, other tests still pass, output pristine (no errors/warnings). Test fails? Fix the **code**, not the test.
5. **REFACTOR.** Remove duplication, improve names, extract helpers — staying green, adding no behavior. (Broader structural refactoring belongs to the `code-review` stage, not the red→green cycle.)
6. **Repeat** — next failing test for the next slice.

## Anti-patterns
- **Implementation-coupled** — mocks internal collaborators, tests private methods, or asserts through a side channel (querying the DB instead of the interface). Tell: breaks on refactor when behavior hasn't changed.
- **Tautological** — the assertion recomputes the expected value the way the code does (`expect(add(a,b)).toBe(a+b)`, a hand-derived snapshot, a constant equal to itself), so it passes by construction and can never disagree with the code.
- **Horizontal slicing** — all tests first, then all implementation. Bulk tests verify *imagined* behavior and go insensitive to real changes. Work in **vertical slices**: one test → one implementation → repeat, each test a **tracer bullet** responding to what the last cycle taught.

## Bug fixes
Never fix a bug without a test. Write a failing test that **reproduces** it, then follow the loop — the test proves the fix and prevents regression.

## Red flags — STOP and start over
Code before test · test after implementation · test passes immediately · can't explain why it failed · "I'll add tests later" · "already manually tested it" · "keep as reference" · "deleting X hours is wasteful" (sunk cost — unverified code is debt) · "TDD is dogmatic, I'm being pragmatic" (TDD *is* pragmatic — test-first is faster than debugging after). All of these mean: delete the code, start over with TDD.

## Before marking complete
Every new function has a test · you watched each fail for the right reason · minimal code to pass · all tests pass · output pristine · real code (mocks only if unavoidable) · edge/error cases covered. Can't check every box? You skipped TDD — start over.
