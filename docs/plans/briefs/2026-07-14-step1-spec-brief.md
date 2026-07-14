# Spec brief — Buildout step 1: redesign styling pass (CSS/tokens only)

You are the spec author (feature-forge discipline) for step 1 of the redesign buildout. Produce
`docs/specs/redesign-styling-pass.spec.md` in THIS repo (`gordi-mos`). Spec only — no code changes.

## READ FIRST (exact paths)

1. `docs/plans/2026-07-14-redesign-buildout.md` — the master sequence; step 1 scope line is binding.
2. `docs/experience-contract.md` — Rules 1–11. Step 1 touches NONE of the structural rules (routes,
   anatomy, budgets stay as-is this step) — the spec must say so explicitly and fence them out.
3. `DESIGN.md` — the design-system source of truth (identity authority; tokens live here).
4. Visual reference: `/Users/ariefsaid/Coding/gordi-mos-e7-prototype/docs/design-mockups/redesign-mockups-2026-07/e7-prototype.css`
   (the e7 token set: --e7-* custom properties — colors, radii, shadows, spacing, type scale) and
   the screenshots in `.../convergence-flows/shots/`.
5. Current app styling: `mos-app/src/` global styles / tokens (find them: index.css / theme files)
   and `mos-app/DESIGN.md` if present.

## Scope (from the master plan, verbatim)

"Align the app's tokens/chrome to the redesign look; CSS/`DESIGN.md` only, zero behavior change —
pure visual diff, easy sign-off."

The spec defines: which token groups change (color palette, type scale incl. display font usage,
radius, shadow, spacing, chrome surfaces — header/rail/card/table/pill), how the e7 --e7-* values
map onto the app's existing token names (a mapping table, e7 value → app token), and what is
explicitly OUT of scope (layout, routes, nav structure, component markup, any *.tsx logic change —
those are steps 2–3).

## Conventions (binding)

- Requirements in EARS; IDs `FR-###`/`NFR-###`; acceptance criteria `AC-###` in Given/When/Then.
- Each AC owned by ONE test at the lowest sufficient layer. For a pure-CSS pass most ACs will be
  owned by (a) unit assertions on computed tokens where meaningful, and (b) a curated visual
  screenshot review checklist (this spec must define the exact screens + widths to screenshot:
  at minimum Tasks view, a record drawer, Home, at 1280 and 390 px, before/after).
- NFR: zero behavior/DOM-structure diffs — typecheck/lint/test suite must pass unchanged; no
  component re-implementation (contract Rule 11).
- De-reference firewall: NO external brand/product references in the spec or token names.

## Verify your own work

Re-read the spec against the master plan scope line and the contract; confirm every FR is CSS/token
-only and every AC names its owning layer. List deviations at the end.

End your final message with the sentinel line: SPEC-DONE
