# Plan — Events stub (redesign buildout Step 10)

**Spec (contract):** `docs/specs/events-stub.spec.md`. **No ADR** — this step reuses existing components
verbatim (Rule 11), touches no schema/RLS/routing architecture, and is explicitly the smallest step in the
buildout; nothing here is architectural, irreversible, or cross-cutting.
**Master plan row:** `docs/plans/2026-07-14-redesign-buildout.md` Step 10.
**Read-first:** `docs/experience-contract.md` Rules 1/6/7/10/11, `docs/specs/events-stub.spec.md` §6
(RATIFY-BEFORE-MERGE placeholder copy + archetype pick).

> **No-placeholder rule.** Every task below has an exact path, real code, a cited `AC-###` (behavior tasks), and
> an exact verify command. TDD order per task: the **failing test is written first**, then the implementation
> makes it pass. All verify commands run from `mos-app/` (Vitest/RTL — no pgTAP, no Playwright; see spec §5).

## AC → task map

| AC | Task(s) |
|---|---|
| AC-1001 (route renders, H1, document title) | T1 (RED), T2 (GREEN), T3 (RED), T4 (GREEN) |
| AC-1002 (job sentence in ContextRow) | T1 (RED), T2 (GREEN) |
| AC-1003 (sanctioned quiet EmptyState, no fake CTA) | T1 (RED), T2 (GREEN) |
| AC-1004 (rail aria-current + breadcrumb) | T5 |

---

## T1 — RED: write the failing `EventsPage` test (AC-1001, AC-1002, AC-1003)

**File:** `mos-app/src/pages/events-page.test.tsx` (create).

`EventsPage` does not exist yet, so this file fails to even compile/import — the whole file is the "red" step.

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { ContextRow } from '@/shell/context-row'
import { EventsPage } from './events-page'

vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'
const mockUseAuth = vi.mocked(useAuth)

function renderEvents(locale: 'en' | 'id' = 'en') {
  localStorage.setItem('mos.locale', locale)
  return render(
    <I18nProvider>
      <MemoryRouter>
        <EventsPage />
      </MemoryRouter>
    </I18nProvider>,
  )
}

describe('AC-1001 (events-stub): EventsPage renders the Events destination', () => {
  it('renders the H1 "Events" inside the main landmark', () => {
    renderEvents()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Events' })).toBeInTheDocument()
  })

  it('sets the document title to "Events — Gordi MOS"', () => {
    renderEvents()
    expect(document.title).toBe('Events — Gordi MOS')
  })

  it('resolves the H1 through i18n for Indonesian ("Acara")', () => {
    renderEvents('id')
    expect(screen.getByRole('heading', { level: 1, name: 'Acara' })).toBeInTheDocument()
    expect(document.title).toBe('Acara — Gordi MOS')
  })
})

describe('AC-1003 (events-stub): sanctioned quiet EmptyState, no fake action', () => {
  it('renders the house EmptyState system at the "quiet" archetype', () => {
    renderEvents()
    const empty = screen.getByTestId('empty-state')
    expect(empty).toHaveAttribute('data-empty-variant', 'quiet')
    expect(empty).toHaveAttribute('role', 'region')
  })

  it('shows the empty-state title + copy, and renders no action button (Rule 7 — no fake CTA)', () => {
    renderEvents()
    expect(screen.getByText('Nothing scheduled yet')).toBeInTheDocument()
    expect(
      screen.getByText(/will show up here once this collection is connected/i),
    ).toBeInTheDocument()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})

describe('AC-1002 (events-stub): the Rule-1 job sentence renders above EventsPage', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      status: 'authenticated',
      viewer: {
        person: {
          id: '40000000-0000-0000-0000-000000000001',
          org_id: '10000000-0000-0000-0000-000000000001',
          user_id: 'auth-user-001',
          full_name: 'Cahya Cafe',
          email: 'cahya@gordi.id',
          archived_at: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
        roles: [],
        isManager: false,
        accessRoles: [],
      },
      signOut: vi.fn(),
    })
  })

  it('renders "See what\'s happening around our outlets and when." in the context row on /events', () => {
    render(
      <I18nProvider>
        <MemoryRouter initialEntries={['/events']}>
          <ContextRow />
          <EventsPage />
        </MemoryRouter>
      </I18nProvider>,
    )
    expect(
      screen.getByText("See what's happening around our outlets and when."),
    ).toBeInTheDocument()
  })
})
```

**Verify (expect failure — module not found):**
```
cd mos-app && npx vitest run src/pages/events-page.test.tsx
```
Expect: fails to resolve `./events-page` (file doesn't exist yet).

---

## T2 — GREEN: add i18n keys + create `EventsPage` (AC-1001, AC-1002, AC-1003)

**File A:** `mos-app/src/i18n/messages.ts` — add two keys to the `en` block, immediately after the existing
`'stub.comingLater': '${name} lands in a later build step.',` line (around line 409):

```ts
    'events.empty.title': 'Nothing scheduled yet',
    'events.empty.copy': 'Outlet events — cuppings, workshops, bookings — will show up here once this collection is connected.',
```

And to the `id` block, immediately after the matching
`'stub.comingLater': '${name} hadir pada langkah build berikutnya.',` line (around line 866):

```ts
    'events.empty.title': 'Belum ada acara terjadwal',
    'events.empty.copy': 'Acara outlet — cupping, workshop, booking — akan muncul di sini setelah koleksi ini terhubung.',
```

**File B:** `mos-app/src/pages/events-page.tsx` (create):

```tsx
/**
 * EventsPage — redesign buildout Step 10 (spec `docs/specs/events-stub.spec.md`).
 * Replaces the generic SliceStubPage at `/events` (Step 2) with the Events destination's
 * own page: PageHead (job identity) + the sanctioned EmptyState (Rule 11 — no new
 * empty-state surface). No schema/DAL in this step (master plan row 10) — the empty
 * state IS the content until a future step wires a real collection + view renderer,
 * proving the Rule-10 extension path (destinations.tsx / job-sentences.ts / breadcrumb.tsx
 * are untouched by this file).
 */
import { PageFrame } from '@/shell/page-frame'
import { PageHead } from '@/shell/page-head'
import { EventsIcon } from '@/shell/icons'
import { useT } from '@/i18n/use-t'
import { useDocumentTitle } from '@/shell/use-document-title'
import { EmptyState } from '@/components/ui/state-kit'

export function EventsPage() {
  const t = useT()
  const title = t('dest.events')
  useDocumentTitle(`${title} — Gordi MOS`)

  return (
    <PageFrame variant="data">
      <PageHead variant="content" title={title} icon={<EventsIcon />} />
      <EmptyState
        variant="quiet"
        title={t('events.empty.title')}
        copy={t('events.empty.copy')}
      />
    </PageFrame>
  )
}
```

**Verify (T1's file now passes):**
```
cd mos-app && npx vitest run src/pages/events-page.test.tsx
```
Expect: all cases green.

**Verify i18n parity is intact (both catalogs still shape-identical):**
```
cd mos-app && npx vitest run src/i18n/messages.test.ts
```
Expect: `AC-I01: en and id key sets are identical` still passes.

---

## T3 — RED: update `router.test.tsx` to expect `EventsPage` at `/events` (AC-1001)

**File:** `mos-app/src/router.test.tsx`.

1. Add the import near the other page imports (after the `SliceStubPage` import, around line 35):
```tsx
import { EventsPage } from './pages/events-page'
```

2. Replace the existing combined test (lines 209–222) that asserts all four stub paths:
```tsx
  it('AC-006: /events, /ecommerce, /roastery, /profile render SliceStubPage', () => {
    expect(shellChildren().find((r) => r.path === 'events')!.element).toEqual(
      <SliceStubPage jobKey="job.events" nameKey="dest.events" />,
    )
    expect(shellChildren().find((r) => r.path === 'ecommerce')!.element).toEqual(
      <SliceStubPage jobKey="job.ecommerce" nameKey="dest.ecommerce" />,
    )
    expect(shellChildren().find((r) => r.path === 'roastery')!.element).toEqual(
      <SliceStubPage jobKey="job.roastery" nameKey="dest.roastery" />,
    )
    expect(shellChildren().find((r) => r.path === 'profile')!.element).toEqual(
      <SliceStubPage jobKey="job.profile" nameKey="dest.profile" />,
    )
  })
```
with two tests — the remaining stubs unchanged, plus a new Events-specific one:
```tsx
  it('AC-006: /ecommerce, /roastery, /profile render SliceStubPage', () => {
    expect(shellChildren().find((r) => r.path === 'ecommerce')!.element).toEqual(
      <SliceStubPage jobKey="job.ecommerce" nameKey="dest.ecommerce" />,
    )
    expect(shellChildren().find((r) => r.path === 'roastery')!.element).toEqual(
      <SliceStubPage jobKey="job.roastery" nameKey="dest.roastery" />,
    )
    expect(shellChildren().find((r) => r.path === 'profile')!.element).toEqual(
      <SliceStubPage jobKey="job.profile" nameKey="dest.profile" />,
    )
  })

  it('AC-1001 (events-stub, Step 10): /events renders EventsPage (no longer SliceStubPage)', () => {
    expect(shellChildren().find((r) => r.path === 'events')!.element).toEqual(<EventsPage />)
  })
```

**Verify (expect failure — router.tsx still wires SliceStubPage):**
```
cd mos-app && npx vitest run src/router.test.tsx
```
Expect: the new `AC-1001` case fails (`SliceStubPage` !== `EventsPage`); the rest of the file still passes.

---

## T4 — GREEN: wire `EventsPage` into `router.tsx` (AC-1001)

**File:** `mos-app/src/router.tsx`.

1. Add the import near the other page imports (after `import { SliceStubPage } from './pages/slice-stub-page'`,
   around line 26):
```tsx
import { EventsPage } from './pages/events-page'
```

2. Replace the route-layout comment's stub line (around line 47):
```tsx
//     /events /ecommerce /roastery /profile → SliceStubPage (later steps)
```
with:
```tsx
//     /events                   → EventsPage (Step 10 — job sentence + sanctioned empty state)
//     /ecommerce /roastery /profile → SliceStubPage (later steps)
```

3. Replace the route entry (around line 122):
```tsx
          { path: 'events', element: <SliceStubPage jobKey="job.events" nameKey="dest.events" /> },
```
with:
```tsx
          { path: 'events', element: <EventsPage /> },
```

**Verify (T3's new case now passes; nothing else regresses):**
```
cd mos-app && npx vitest run src/router.test.tsx
```
Expect: all cases green, including `AC-1001 (events-stub, Step 10)`.

---

## T5 — Rail aria-current coverage for `/events` (AC-1004)

**File:** `mos-app/src/shell/rail-nav.test.tsx`.

This closes a pre-existing coverage gap: `RailNav`'s `aria-current` logic is already path-generic (it never
special-cased `SliceStubPage` vs a real page) so this case is expected to pass without any `rail-nav.tsx`
production change — it is regression/characterization coverage for Rule 5, freshly exercised now that `/events`
is a real page and not a placeholder. Add this new `describe` block after the existing `AC-009` aria-current
block (around line 182, right after the `'at /, Home link page...'` case closes):

```tsx
// AC-1004 (events-stub, Step 10): Rule 5 still holds for /events now that it renders EventsPage,
// not the generic SliceStubPage — the rail's aria-current resolution never depended on which
// component the route mounts.
describe('AC-1004: aria-current — at /events, the Events link is the sole "page"', () => {
  it('AC-1004: at /events, Events link has aria-current=page and is the only one', () => {
    renderRailNav('/events')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const pageLinks = within(nav)
      .getAllByRole('link')
      .filter((l) => l.getAttribute('aria-current') === 'page')
    expect(pageLinks).toHaveLength(1)
    expect(within(nav).getByRole('link', { name: 'Events' })).toHaveAttribute('aria-current', 'page')
  })
})
```

**Verify:**
```
cd mos-app && npx vitest run src/shell/rail-nav.test.tsx
```
Expect: all cases green, including the new `AC-1004` case.

---

## Gates (run before handing off for review)

Confirm AC-1004's breadcrumb half is unaffected (pre-existing `/events → "Events"` case in
`breadcrumb.test.tsx` — no file edit needed, this is a regression check only), then run the full local gate
battery from `mos-app/`:

```
cd mos-app && npm run typecheck
cd mos-app && npm run lint
cd mos-app && npx vitest run src/shell/breadcrumb.test.tsx src/shell/rail-nav.test.tsx src/shell/job-sentences.test.ts src/router.test.tsx src/pages/events-page.test.tsx src/i18n/messages.test.ts
cd mos-app && npm run test:coverage
```

Expect: `typecheck` zero errors; `lint` zero errors/warnings; every listed Vitest file green (11 AC-tagged cases
across the five files: AC-1001 ×4, AC-1002 ×1, AC-1003 ×2, AC-1004 ×1, plus the untouched
`breadcrumb.test.tsx`/`job-sentences.test.ts`/`messages.test.ts` regression cases); coverage on the two new/changed
files (`events-page.tsx` 100% reachable lines — it is five lines of JSX with no branches; `router.tsx`'s one
changed line) at or above the repo's 80%-of-changed-code bar.

**Downstream (not part of this plan — flagging for the Director's loop):** this step touches `.tsx` files
(`events-page.tsx`, `router.tsx`), so the standard review battery's design-reviewer pass is required before
merge per CLAUDE.md's binding gates (spec-reviewer → code-quality-reviewer → design-reviewer, recorded in
`docs/reviews/<branch>.md`, verified by `bash scripts/pre-merge-check.sh`). No security-auditor pass is required
(no auth/RLS/schema path touched).
