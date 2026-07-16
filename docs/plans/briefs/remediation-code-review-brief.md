# Code review — steps 1–3 design-remediation (waves 1+2: OD-61/62/63/64). Luna cross-family, read-only.

Review the remediation commits since the last code-approve. Verdict to
`docs/reviews/feat-redesign-buildout.md` under "## Remediation (waves 1+2) — code review (Luna cross-family)".

## Scope
Branch `feat/redesign-buildout`. Diff: `git diff 5e81ccd..HEAD (waves 1+2+2b) -- mos-app/src` (waves 1+2). Focus:
- OD-61 role-based mobile Tasks disclosure (member capture-first vs manager filter view; `deriveIsManager` seam).
- OD-62 typed Task record: RACI removed from Task SURFACES (Team/PIC/Supervisor + Mark complete);
  raci-card→task-ownership-card. RACI must remain valid on Objective/Project/Process (not removed there).
- OD-63 canonical page mode: in-list click = split drawer; direct/new-tab/refresh = full page; `?view=` preserved.
- OD-64 Home dead-links fixed/hidden; phone aria-current on all /work/* children.

## Read: `docs/decisions.md` OD-REDESIGN-61..64 · `docs/experience-contract.md` Rules 4/5/8/11/12 · `docs/jtbd.md` A4.

## Verdict must cover
1. Spec/OD conformance — each of OD-61..64 met? Any regression in existing behavior?
2. Rule 11 — OD-62 changed the shipped Task renderer (ratified exception): is it ONE renderer still
   (extended, not forked)? Any duplicate Task editor/table/drawer introduced? Dead code left
   (e.g. `OwnerCellRaciMember` now unused on task rows — flag as cleanup nit, not blocking)?
3. BDD — the updated task tests assert the NEW typed-ownership/completion goal, not weakened to pass,
   no test still asserts old RACI grammar as its goal?
4. Code quality — the role-based disclosure gating, canonical page/panel mode reuse, i18n.
5. Verdict: APPROVE / APPROVE-WITH-NITS / BLOCK with line refs.
End with: REVIEW-DONE
