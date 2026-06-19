# MOS Engineering Conventions

> **Status:** the engineering standard for `mos-app` + the code-quality review oracle.
> Stack-agnostic best practices, written for our stack (React 19 + Vite + TypeScript +
> Tailwind v4 + shadcn-derived `--ds-*` tokens [no shadcn/ui package] + self-hosted Supabase). Orthogonal to the visual `DESIGN.md`
> and the `docs/reference/mos-design-kit` IA/IxD reference.
> §1 + §1b + §4 are enforced (lint + review); §2 records ratified migrations; §3 lists
> patterns that don't fit our stack.

## §1 — Conventions (enforce on changed code)

### Naming
- **No abbreviations in identifiers.** `items.find((item) => …)`, not `(i) =>`. Loop/callback vars get real names.
- Variables/functions `camelCase`; constants `SCREAMING_SNAKE_CASE`; types/components `PascalCase`.
- Component prop types are suffixed **`Props`** (`type ButtonProps = …`).
- **Named exports only** — no default exports (see §2; lint-enforced after migration).

### TypeScript
- **No `any`.** Strict mode; no implicit any. If a type is genuinely unknown, use `unknown` + a guard.
- **`type` over `interface`** (exception: extending a third-party interface).
- **String-literal unions over `enum`** (`type Status = 'open' | 'done'`).
- **Leverage inference** — don't annotate the obvious (`const xs = ['a','b']`); *do* annotate ambiguous returns.
- **Discriminated unions** for result/variant types; narrow with the discriminant, not casts.
- `import { type Foo } from …` — inline type-only imports.

### Utility helpers over manual checks
- Use a shared `isDefined(x)` (≠ null & ≠ undefined) + non-empty guards instead of hand-rolled
  `x !== null && x !== undefined` / `(x): x is T =>` filters. *(Add/centralize `isDefined` in `src/lib/` and reuse.)*

### Functions & components
- **Small, single-responsibility.** Required params first, optional last; object arg beyond ~3 params.
- **Functional components only**; **destructure props**; no `React.FC`.
- **Event handlers over `useEffect`** for state updates — don't sync state in an effect when an `onX`
  handler can set it directly. `useEffect` is for true external sync (subscriptions, DOM, fetch-on-mount).
- **Composition over large components**; extract complex logic into custom hooks.
- `memo`/`useCallback`/`useMemo` **only when warranted** — not by default; prefer fixing the root cause of re-renders.

### Imports
- Order: **(1) external libs → (2) internal alias (`@/…`) → (3) relative sibling (`./…`)**. No unused imports. `prefer-const`.
- **No relative-parent imports (`../…`)** — use the `@/` alias (see §1b).

### Comments
- **Short `//` comments, never JSDoc `/** */` blocks.** Explain **WHY / non-obvious logic**, not WHAT the
  code already says. `TODO:` for deferred work. Delete comments that restate the code.

### Error handling
- Throw **typed, meaningful** errors; **log with context** (`{ id, error }`); validate/sanitize input before processing.

### File size
- **Components < ~300 lines; modules/services < ~500.** Past that, extract hooks/subcomponents/utilities.
  *(Offender: `mos-app/src/components/tasks/TasksWorkspace.tsx` ≈ 808 lines — decompose when next touched.)*

### Testing (complements EARS/BDD + the test pyramid in CLAUDE.md)
- **Test behavior, not implementation.** **Query by user-visible handles** — role / label / text — over
  `data-testid`/class selectors where practical.
- **AAA** (Arrange-Act-Assert); descriptive names: *"should [behavior] when [condition]"*.
- Test-data **factories** with overrides; isolated, repeatable tests.

## §1b — Lint-enforced rules (author our own ESLint config)

We enforce these with **our own ESLint config** (`@typescript-eslint`, `no-restricted-imports`,
`no-restricted-syntax`, a small local rule where needed) — no vendored third-party rule packs.

| Rule | What it requires | MOS status / action |
|---|---|---|
| `no-restricted-imports` group `../*` | **Ban relative-parent imports; use the `@/` alias.** | ✅ **Done (merged #30).** `@/*→src/*` in tsconfig + vite + vitest; ESLint bans `../*`; all relative-parent imports codemodded (0 remain in `src`). |
| no hardcoded colors | **Colors come from tokens, never literal hex/rgb/hsl** | ✅ **Done (merged #31).** Stylelint (`color-no-hex` + rgb/hsl disallowed) on `src/**/*.css` (token files exempt) + ESLint `no-restricted-syntax` on tsx. `Toggle.css` offender fixed. |
| `@typescript-eslint/consistent-type-imports` (`inline-type-imports`) | `import { type Foo }` | **Action:** enable. |
| `no-duplicate-imports` / `import/no-duplicates` | One import per module | Verify on. |
| `no-console` (warn) | No stray `console.*` | **Action:** enable. |
| `import/no-default-export` (on `src/**`, allow config/entry) | **Named exports only** | After the §2 default→named codemod. |
| prefer `<Link>` over imperative `navigate()` | Navigation is a link (a11y/middle-click) | Review guidance — e.g. `TasksWorkspace` rows. |
| `useState` pair names match (`[foo, setFoo]`); no `useRef` as render state | Local-state hygiene | Review guidance. |
| per-file const cap / folder cohesion | File cohesion | Review guidance. |

> **Highest-value:** the `@/`-alias ban and the no-hardcoded-colors rule — they kill 258 brittle
> `../../..` chains and stop color drift at the linter instead of at review.

## §2 — Ratified migrations (owner-approved 2026-06-19)

Repo-wide mechanical codemods — sequence back-to-back (all rewrite imports) on a clean `main`:

| Convention | Target | Migration |
|---|---|---|
| **Named exports only** | No default exports; `import/no-default-export` on `src/**` (allow `vite.config`, lazy-route boundaries). | Codemod default→named + update all import sites. Dedicated PR. |
| **kebab-case filenames** | Component/module files kebab-case (`user-chip.tsx`). | `git mv` rename + update import paths. Dedicated PR. |
| **`@/` alias** | No relative-parent imports. | Alias config + lint rule + import codemod (§1b). Dedicated PR (do this first; the others build on it). |

## §3 — Not applicable to our stack
- Global-state-library-specific patterns — MOS uses React local state + data hooks, not a global atom store.
  *(Principles still apply: props-down/events-up, normalized lookup state, functional `setState(prev => …)`, `useReducer` for complex local state.)*
- CSS-in-JS conventions — MOS uses Tailwind v4 + the `--ds-*` token layer + small CSS files.
- Server-framework / ORM / monorepo-tooling rules — MOS backend is self-hosted Supabase (Postgres + RLS); a single Vite app.

## §4 — Code-quality review checklist (enforced at Review)
On changed code, `code-quality-reviewer` flags violations of §1/§1b alongside its charter (single-responsibility, decomposition, naming, DB/query perf, ≥80% changed-code coverage):
1. `any` / implicit-any / type-casts that should be guards.
2. `interface` where `type` fits; `enum` where a string-union fits.
3. Abbreviated identifiers; missing `Props` suffix; default exports (post-migration).
4. Manual null/undefined checks where an `isDefined`-style helper exists.
5. `useEffect` setting state an event handler should set; needless `memo`/`useCallback`/`useMemo`.
6. JSDoc blocks; obvious/redundant comments; missing WHY on non-obvious logic.
7. Relative-parent imports where `@/` fits; import-order violations; unused imports; `let` where `const` fits.
8. **Hardcoded colors** (literal hex/rgb/hsl outside token files) instead of `--ds-*` tokens.
9. Files past the size budget (§1) without extraction.
10. Tests asserting implementation / `data-testid` where role/label/text fits; non-AAA / vague names.
11. Untyped thrown errors / swallowed errors / no-context logging.
