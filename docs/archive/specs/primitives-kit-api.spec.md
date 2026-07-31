# Spec — Primitives to the mos-design-kit API (Issue 2)

- Feature: **Primitives layer** — re-skin the existing `Button`/`Pill`/`CardHead`/`StateKit` to the kit's token
  values (keeping their public class/prop API stable), and add the six missing primitives the kit defines
  (`IconButton`, `TextInput`, `Checkbox`, `Toggle`, `Avatar`, `Chip`, `Tag`) as fresh shared components under
  `src/components/ui/`, for new use. A primitives gallery page makes them reviewable.
- Status: Proposed (2026-06-19).
- Authority: ADR-0009 (token system adopted, Issue 1 merged). `DESIGN.md` § Components (the kit's anatomy).
  Reference: `docs/reference/mos-design-kit/components/{inputs,display}/*.jsx`.
- Vocabulary: `CONTEXT.md` untouched (UI mechanics).

## Out of scope
- **Forced migration of the 25 raw `.btn-*` class consumers** or the 9 inline `<input>` sites or inline avatars/chips.
  Those stay as-is (they already consume the new tokens via the codemod). A dedicated consumer-sweep is a later issue.
- **Renaming `Pill`→`Tag`** — `Pill`'s public API is preserved (5 consumers + StatePill + regression tests rely on it);
  `Tag` is added as a *new* component. `Pill` is re-skinned to match `Tag`'s visual (kit palette), keeping its dot.
- Sidebar / table / record-page structural work — Issues 3/4/5.
- Schema/RLS — none.

## Functional requirements (EARS)
- **FR-138** The `Button`, `Pill`, `CardHead`, `StateKit` primitives SHALL consume the kit's `--ds-*` tokens (via the
  Issue-1 `@theme inline` aliases) with no raw color literals, preserving their existing public class names
  (`.btn-primary`, `.pill--{tone}`, `.card-head`, `.error-state`, `.empty-state`, `.skeleton-*`).
- **FR-139** The app SHALL provide new shared primitives under `src/components/ui/`: `IconButton`, `TextInput`,
  `Checkbox`, `Toggle`, `Avatar`, `Chip`, `Tag` — each matching the kit's prop API and anatomy.
- **FR-140** Each new primitive SHALL be accessible: correct `role`/`aria-*`, keyboard-activatable, focus-visible ring,
  and WCAG-AA contrast in both light and dark themes.
- **FR-141** A primitives gallery route (`/dev/ui` or a standalone HTML) SHALL render every primitive across all
  variants/sizes/states in both themes, for design review.
- **FR-142** `Pill`'s `skeleton` tone SHALL be preserved (the kit's `Tag` has no skeleton equivalent).

## Acceptance criteria
- **AC-144** `Button`/`Pill`/`CardHead` re-skin: existing tests stay green with no class-name changes; the 25 raw-class
  consumers render unchanged. (gate: `npm test`)
- **AC-145** Each new primitive has a co-located Vitest/RTL test covering its variants + a11y (role, keyboard, focus).
- **AC-146** `Avatar` produces deterministic seeded-pastel initials (same input → same color, both themes).
- **AC-147** Gallery renders all primitives in light + dark with no console errors.
- **AC-148** `npm run typecheck && npm run lint:ci && npm test && npm run build` all green.
