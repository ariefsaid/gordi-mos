# ADR-0021 — i18n seam: typed hand-rolled string catalog (en/id)

- Status: **Proposed** (planner-authored, pending owner/Director sign-off with the Home v1 slice)
- Deciders: Owner (Arief) + Director
- Related: **ADR-0019 D12** (bilingual en/id seam from the Home slice on; every string through the
  catalog from day one) · `CONTEXT.md` (org thinks in both languages) · `docs/requirements-evolution.md`
  era E6 (current bar) · `docs/plans/2026-07-04-home-v1-margin.md` (the slice that lands this seam).
- Scope note: records the **string-catalog architecture** for the app shell + Home slice. No UI copy
  decision lives here (copy is per-slice); this is the mechanism + the swap door.

## Context

ADR-0019 D12 makes bilingual (en/id) a binding seam from the Home slice on, because "ops staff adoption
cannot pay an English tax" and "retrofitting i18n across 50 surfaces later is the expensive path." The
obligation is the **seam** — every user-facing string flows through a catalog from day one — not the
choice of library. The slice that lands this is Home v1 + the shell regrouping (the five destinations).

The repo today (`mos-app`) has zero i18n machinery: every label is a string literal in JSX. The existing
number/currency formatting is already locale-aware (`Intl.NumberFormat('id-ID')` in
`src/lib/sales-dashboard.ts`'s `formatIDRFull`). The org's two locales (en, id) need only **simple
string lookup** — no ICU plurals (counts interpolate via `${n}`), no per-locale date math (week helpers
are calendar-only). No dep is present that already pulls an i18n runtime.

## Decision

**Land a hand-rolled, typed string catalog as the i18n seam — no i18n library this slice.**

Concretely (`mos-app/src/i18n/`):

- `messages.ts` — the catalog: `{ en: { … }, id: { … } }`, with `MessageKey = keyof typeof messages.en`.
  Both locales' key sets must match (a test enforces parity). New strings are added here, never inlined.
- `I18nProvider.tsx` — React context holding the active `locale` (default `'en'`) and a `setLocale`
  setter; persisted to `localStorage` (`mos.locale`). Wraps the router inside `ThemeProvider`.
- `use-t.ts` — `useT(): (key: MessageKey, vars?: Record<string, string|number>) => string`. Simple
  `${name}` interpolation; falls back to the key itself if a locale is missing a key (never throws).

Every **new** string introduced by the Home slice + shell regrouping (destination labels, bottom-tab
labels, Home page title, KPI tile labels, locale-toggle affordance) flows through `t()`. Existing app
strings are **not** retrofitted this slice (ADR-0019 D12 explicitly names that retrofit "the expensive
path"; this slice *starts* the seam, it does not finish it).

### Why hand-rolled over react-intl / i18next

| Concern | Hand-rolled catalog | react-intl (FormatJS) | i18next + react-i18next |
|---|---|---|---|
| New deps | **0** | react-intl + ICU plural polyfills (~30–40 kb gz) | i18next + react-i18next (~25 kb gz) |
| en/id needs today | string lookup only — a dict suffices | full ICU machinery (overkill: no plurals, no gender) | runtime config + backends (overkill) |
| Type safety | `MessageKey` = `keyof` catalog → missing key = type error | string ids, runtime-missing only | string ids, runtime-missing only |
| Swap door | mechanical: a codemod maps `t("k")` → `<FormattedMessage id="k"/>` | n/a (the destination) | n/a |
| Constraint ("no heavy deps without justification") | **satisfied** | adds a heavy dep for a problem a dict solves | adds a heavy dep for a problem a dict solves |

The deciding factor is the **constraint** (`AGENTS.md`: "no new heavy deps without justification") +
the **seam-vs-library distinction** (D12 mandates the seam, not a library). A typed `t(key)` enforces
the seam at compile time (a missing key fails `tsc`); react-intl's runtime-only key checks are strictly
weaker for the parity guarantee D12 needs. If a future slice needs ICU (plurals, gender, number
formatting beyond the existing `Intl.NumberFormat`), a codemod migrates the catalog to react-intl — the
`t(key, vars)` call sites stay, only the resolver swaps. The seam survives the swap.

### Scope of the catalog (this slice — keys land in `messages.ts`)

- Destination labels: `dest.home`, `dest.work`, `dest.operate`, `dest.plan`, `dest.inbox`.
- Bottom-tab + rail group labels (rendered via `t(dest.*)`).
- Home: `home.title`, KPI labels `home.kpi.revenue`, `home.kpi.margin`, `home.kpi.tasks`,
  `home.kpi.ops`, plus the freshness prefix already lives in `FreshnessLabel`.
- My Week panel: reused as-is (its strings are **existing** → not retrofitted this slice; they are
  flagged for the next i18n sweep).
- Locale toggle: `locale.toggle.label`, `locale.en`, `locale.id`.

## Consequences

**Positive**

- **Zero new dependencies** — the seam lands with no bundle or supply-chain cost; the constraint holds.
- **Compile-time key parity** — `MessageKey` + a parity test (`en`/`id` key sets equal) catch a missing
  translation at `tsc`/CI, not at runtime on a user's screen.
- **The swap door is real and mechanical** — moving to react-intl later rewrites only the resolver
  (`useT` body) + a codemod over call sites; the catalog data + the provider + the parity test survive.
- **D12 is satisfied incrementally** — the seam exists from the Home slice; each new slice adds keys;
  no big-bang retrofit is ever required.

**Negative / accepted**

- **We own a small i18n runtime.** `t()` + interpolation + locale persistence is ~40 lines; the cost is
  maintaining it (and the parity test) until/unless we swap to a library. Accepted — it is small and the
  swap is bounded.
- **No ICU today.** If a slice needs plurals ("1 task" / "2 tasks" with locale rules) before a swap,
  that slice must hand-roll the plural or trigger the react-intl swap. Recorded so it is a conscious
  choice, not an accident.
- **Existing strings are not yet in the catalog.** The app is bilingual *only* on the shell + Home this
  slice; the rest stays English until each surface is touched or a dedicated i18n-sweep issue runs. This
  is the deliberate incremental posture (D12), not a gap.

## Reversibility

- **Fully reversible.** The catalog, provider, and `useT` are additive; removing them restores literal
  strings. No schema, no migration, no irreversible shape.
- **Swap is bounded.** A react-intl migration is resolver + codemod (call sites unchanged in shape); a
  test asserting every `t()` call resolves against the catalog makes the swap auditable.

## Verification

- `messages.ts` exports `en` + `id` with **identical key sets** (parity test: `assert.deepEqual(keys(en),
  keys(id))`).
- `useT()` returns the `id` string when `locale === 'id'`; returns the `en` string when `'en'`; returns
  the key (never throws) when a key is missing in the active locale.
- `tsc` fails if a `t("typo.key")` is passed (typed argument).
- The Home slice's new strings render from the catalog (a render test asserts the `id` string appears
  when the provider is set to `id`).
