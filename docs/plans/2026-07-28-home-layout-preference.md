# Home Layout Preference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each person choose how their Home page is arranged — Focused (default), Overview, or List — from Personal profile, with the Signals feed present in all three and the same records visible in all three.

**Architecture:** Two phases, each shippable on its own. **Phase 1** retires the `OD-18` region-order toggle and extracts Home's layout primitives — a pure refactor with no new user-facing feature. **Phase 2** adds the preference store, the profile picker, and the three arrangements as compositions of those primitives. Work regions render through the existing `RecordCollection` engine; a tile or tab *hosts* a collection, it never re-implements one.

**Tech Stack:** React 19 + TypeScript, Vitest + React Testing Library, `localStorage` for v1 persistence, existing `RecordCollection` engine, `DESIGN.md` tokens.

**Spec:** `docs/specs/home-layout-preference.spec.md`
**Decisions:** `OD-V4-9` (the preference), `OD-V4-10` (the retirement), `OD-V4-7` (Home may use tiles)
**Reference implementation:** `docs/design-mockups/home-priority-2026-07-28/index.html` — standing reference with a presumption of correctness. Port what it answered.

---

## Before you start — read these

1. `docs/specs/home-layout-preference.spec.md` — the requirements this plan implements.
2. `docs/v4-inheritance.md` § `OD-V4-9`, `OD-V4-10`.
3. `mos-app/src/lib/home-region-order.ts` — the module you are deleting. **Its shape is the precedent for the module you are writing.** Same person-keyed, throw-guarded, always-resolves design.

**Two traps specific to this repo:**

- `npx tsc --noEmit -p tsconfig.json` **checks nothing** — `tsconfig.json` is a solution file with `"files": []`. Only `npm run typecheck` (which runs `tsc -b`) and `npm run build` are evidence.
- Verifying layout width in a browser harness: if the viewport measures 0 the harness will report "no overflow" for everything. **Assert the viewport is > 400px before trusting any overflow result.**

All commands run from `mos-app/`.

---

## File Structure

**Phase 1 — deleted**
- `src/lib/home-region-order.ts`, `src/lib/home-region-order.test.ts`
- `src/components/home/home-order-toggle.tsx`

**Phase 1 — modified**
- `src/components/home/home-stream.tsx` — drop the `order` prop
- `src/pages/home-page.tsx` — drop order state + the attention-summary that depended on it
- `src/pages/profile-page.tsx` — drop the toggle card
- `src/pages/home-page.test.tsx` — delete the 5 order-toggle tests

**Phase 2 — created**
- `src/lib/home-layout.ts` — the preference store (+ `.test.ts`)
- `src/components/home/home-layout-picker.tsx` — the profile setting (+ `.test.tsx`)
- `src/components/home/home-layout-picker.css`
- `src/components/home/home-regions.ts` — the region model shared by all three arrangements
- `src/components/home/home-focused.tsx`, `home-overview.tsx`, `home-list.tsx`
- `src/components/home/home-layouts.css` — the shared primitives
- `src/components/home/home-layout-parity.test.tsx` — AC-929/AC-931/AC-932

---

# PHASE 1 — Retire the region-order toggle

Ships on its own: Home renders exactly as it does today minus the toggle.

### Task 1: Delete the order-preference module

**Files:**
- Delete: `src/lib/home-region-order.ts`
- Delete: `src/lib/home-region-order.test.ts`

- [ ] **Step 1: Confirm the only consumers are the ones this plan touches**

Run: `grep -rln 'home-region-order\|HomeRegionOrder' src/`

Expected exactly these 6 files:
```
src/components/home/home-order-toggle.tsx
src/components/home/home-stream.tsx
src/lib/home-region-order.test.ts
src/lib/home-region-order.ts
src/pages/home-page.tsx
src/pages/profile-page.tsx
```
If any other file appears, **stop** and report it — the retirement surface is larger than the spec recorded.

- [ ] **Step 2: Delete both files**

```bash
rm src/lib/home-region-order.ts src/lib/home-region-order.test.ts
```

- [ ] **Step 3: Verify the build now fails, for the right reason**

Run: `npm run typecheck`
Expected: FAIL, with unresolved-import errors naming `home-region-order` in `home-stream.tsx`, `home-page.tsx`, `profile-page.tsx`, `home-order-toggle.tsx`. This failure is the checklist for Tasks 2–4.

### Task 2: Remove the `order` prop from HomeStream

**Files:**
- Modify: `src/components/home/home-stream.tsx`
- Test: `src/components/home/home-stream.test.tsx`

- [ ] **Step 1: Remove the import, the prop, and the branch**

In `home-stream.tsx` delete this import line:
```ts
import type { HomeRegionOrder } from '@/lib/home-region-order'
```

Delete this prop from `HomeStreamProps`:
```ts
  /** OD-18 order preference: reorders the two GROUPS within the one stream (never removes a band). */
  order: HomeRegionOrder
```

Remove `order` from the destructured parameter list (currently `signals, failedChecks, mentions, order, attentionAnchorId,`) so it reads:
```ts
  signals, failedChecks, mentions, attentionAnchorId,
```

Replace the return block's `<section>` and its children with:
```tsx
    <section role="region" aria-labelledby={titleId} className="home-stream">
      <h2 id={titleId} className="stream-heading">{t('home.stream.title')}</h2>
      {attentionGroup}
      {myWorkGroup}
    </section>
```

Update the file's header comment — replace the sentence beginning "The stream has two ordered GROUPS" with:
```
// The stream has two GROUPS — the attention bands (overdue → due-today → blocked → failed-checks →
// mentions) and the "my work today" band. Attention always leads (OD-V4-10 retired the OD-18 order
// toggle: with a Home layout preference, a second Home setting that means nothing in two of three
// layouts is a dead affordance).
```

- [ ] **Step 2: Remove `order` from the test's render helper**

In `home-stream.test.tsx`, find every `<HomeStream` render and delete the `order={...}` prop from each.

Run: `grep -n 'order=' src/components/home/home-stream.test.tsx`
Expected: no output.

- [ ] **Step 3: Run the stream tests**

Run: `npx vitest run src/components/home/home-stream.test.tsx`
Expected: PASS, 12 tests.

- [ ] **Step 4: Commit**

```bash
git add src/components/home/home-stream.tsx src/components/home/home-stream.test.tsx
git commit -m "refactor(home): HomeStream drops the OD-18 order prop (OD-V4-10)"
```

### Task 3: Remove the toggle from Home

**Files:**
- Modify: `src/pages/home-page.tsx`
- Modify: `src/pages/home-page.test.tsx`

- [ ] **Step 1: Delete the order state and its import**

Delete this import:
```ts
import { resolveRegionOrder, type HomeRegionOrder } from '@/lib/home-region-order'
```

Delete the order state block (around line 308–315): the `const [order, setOrder] = useState<HomeRegionOrder>('attention-first')` declaration and the `useEffect` that calls `resolveRegionOrder`.

Delete the `order={order}` prop from the `<HomeStream .../>` call.

- [ ] **Step 2: Delete the attention summary that only existed for personal-first**

`showAttentionSummary` is `order === 'personal-first' && …`. With the toggle gone it can never be true, so it and its announcement are dead. Delete:

```ts
const showAttentionSummary = order === 'personal-first' && personId != null && attentionCountTraceable
```

…the `if (showAttentionSummary) setAttentionAnnouncement(...)` line and `showAttentionSummary` from that effect's dependency array, and the `showAttentionSummary` branches in the head-meta JSX (around lines 346–352), leaving `roleLabel` rendered on its own.

**Why this is correct, not scope creep:** the summary existed because in personal-first the attention bands sat *below* the fold, so a count at the top told you what was down there. Attention now always leads, so the summary would restate the thing directly beneath it.

- [ ] **Step 3: Delete the 5 order-toggle tests**

In `home-page.test.tsx` delete these whole `describe`/`it` blocks:
- `AC-514: the order preference reorders + persists`
- `RI-1: the order control is a radiogroup, not a tablist`
- `RI-2: the order toggle folds behind a disclosure at ≤390px` (all 3 tests)

**These are deleted, not fixed.** Their subject stops existing. All 5 are currently red, so this reduces the `OD-V4-4` red-test debt — say so in the PR body so it is not read as tests being bent to pass.

- [ ] **Step 4: Run Home's tests**

Run: `npx vitest run src/pages/home-page.test.tsx`
Expected: PASS. Test count drops from 20 to 15, and the 5 previously-failing tests are gone.

- [ ] **Step 5: Commit**

```bash
git add src/pages/home-page.tsx src/pages/home-page.test.tsx
git commit -m "refactor(home): drop the order toggle + its dead attention summary (OD-V4-10)"
```

### Task 4: Remove the toggle from Personal profile

**Files:**
- Modify: `src/pages/profile-page.tsx`
- Delete: `src/components/home/home-order-toggle.tsx`

- [ ] **Step 1: Delete the imports, state, handler and card**

Delete these imports:
```ts
import { HomeOrderToggle } from '@/components/home/home-order-toggle'
import { resolveRegionOrder, setRegionOrder, type HomeRegionOrder } from '@/lib/home-region-order'
```

Delete the `homeOrder` state block (the `useState`, the `useEffect`, and `handleHomeOrderChange`), and delete the whole `<ProfileCard>` that renders `<HomeOrderToggle …/>`.

- [ ] **Step 2: Delete the component**

```bash
rm src/components/home/home-order-toggle.tsx
```

- [ ] **Step 3: Check the CSS for other consumers before deleting anything**

Run: `grep -rn 'segmented-track\|home-order' src/ --include=*.tsx --include=*.ts`

If `styles/segmented-track.css` still has consumers, **leave it alone**. Delete only rules that grep proves are now unreferenced. Do not assume.

- [ ] **Step 4: Verify the whole app compiles and builds**

Run: `npm run typecheck && npm run build`
Expected: both succeed. Typecheck alone is not sufficient — see "traps" above.

- [ ] **Step 5: Confirm the retirement is total (AC-933)**

Run: `grep -rn 'HomeRegionOrder\|home-region-order\|home-order-toggle' src/`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add -A src/
git commit -m "refactor(profile): remove the Home order setting; retirement complete (OD-V4-10)"
```

---

# PHASE 2 — The layout preference

### Task 5: The preference store

**Files:**
- Create: `src/lib/home-layout.ts`
- Test: `src/lib/home-layout.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/home-layout.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { resolveHomeLayout, setHomeLayout, type HomeLayout } from './home-layout'

describe('home layout preference (OD-V4-9)', () => {
  beforeEach(() => { window.localStorage.clear() })

  it('AC-920: defaults to focused when nothing is stored', () => {
    expect(resolveHomeLayout('person-1')).toBe('focused')
  })

  it('AC-921: round-trips a stored choice', () => {
    setHomeLayout('person-1', 'overview')
    expect(resolveHomeLayout('person-1')).toBe('overview')
  })

  it('AC-922: falls back to focused on an unrecognised stored value', () => {
    window.localStorage.setItem('gordi.home.layout.person-1', 'nonsense')
    expect(resolveHomeLayout('person-1')).toBe('focused')
  })

  it('AC-924: is scoped per person', () => {
    setHomeLayout('person-1', 'list')
    expect(resolveHomeLayout('person-2')).toBe('focused')
  })

  it('AC-923: resolves to focused when localStorage throws', () => {
    const original = window.localStorage.getItem
    window.localStorage.getItem = () => { throw new Error('private mode') }
    expect(resolveHomeLayout('person-1')).toBe('focused')
    window.localStorage.getItem = original
  })

  it('does not throw when a write fails', () => {
    const original = window.localStorage.setItem
    window.localStorage.setItem = () => { throw new Error('quota') }
    expect(() => setHomeLayout('person-1', 'list')).not.toThrow()
    window.localStorage.setItem = original
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/home-layout.test.ts`
Expected: FAIL — cannot resolve `./home-layout`.

- [ ] **Step 3: Write the module**

Create `src/lib/home-layout.ts`:

```ts
// home-layout.ts — per-user Home arrangement (OD-V4-9).
// v1 store = localStorage, following the precedent set by the retired home-region-order module
// (RATIFY-1): one-line swap to a Personal-Profile column later. Guarded against private-mode and
// quota throws — always resolves to a valid layout so Home can never fail to render (NFR-922).

export type HomeLayout = 'focused' | 'overview' | 'list'

export const HOME_LAYOUTS: readonly HomeLayout[] = ['focused', 'overview', 'list']

const DEFAULT: HomeLayout = 'focused'
const key = (personId: string) => `gordi.home.layout.${personId}`

function isHomeLayout(v: unknown): v is HomeLayout {
  return typeof v === 'string' && (HOME_LAYOUTS as readonly string[]).includes(v)
}

/** Resolve the stored layout for a person, or the default when nothing is stored/valid. */
export function resolveHomeLayout(personId: string): HomeLayout {
  try {
    const v = window.localStorage.getItem(key(personId))
    return isHomeLayout(v) ? v : DEFAULT
  } catch {
    return DEFAULT
  }
}

/** Persist the layout for a person. Silently no-ops on quota/private-mode throws. */
export function setHomeLayout(personId: string, layout: HomeLayout): void {
  try {
    window.localStorage.setItem(key(personId), layout)
  } catch {
    /* ignore quota / private-mode */
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/home-layout.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/home-layout.ts src/lib/home-layout.test.ts
git commit -m "feat(home): per-person Home layout preference store (OD-V4-9, FR-920..924)"
```

### Task 6: i18n strings

**Files:**
- Modify: `src/i18n/messages.ts`

- [ ] **Step 1: Add the English keys**

Insert into the `en` catalog next to the other `profile.*` keys:

```ts
    'profile.homeLayout': 'Home layout',
    'profile.homeLayout.help': 'How your Home page is arranged. Everyone sees the same information — this only changes the shape.',
    'profile.homeLayout.focused': 'Focused',
    'profile.homeLayout.focused.desc': 'One section at a time, chosen from tabs. Counts stay visible so nothing hides.',
    'profile.homeLayout.overview': 'Overview',
    'profile.homeLayout.overview.desc': 'Every area at once as tiles, sized by how much they matter.',
    'profile.homeLayout.list': 'List',
    'profile.homeLayout.list.desc': 'One continuous list, grouped by kind. Nothing is behind a click.',
    'profile.homeLayout.default': 'Default',
```

- [ ] **Step 2: Add the Indonesian keys**

Insert into the `id` catalog at the matching position:

```ts
    'profile.homeLayout': 'Tata letak Beranda',
    'profile.homeLayout.help': 'Bagaimana halaman Beranda Anda disusun. Semua orang melihat informasi yang sama — ini hanya mengubah bentuknya.',
    'profile.homeLayout.focused': 'Fokus',
    'profile.homeLayout.focused.desc': 'Satu bagian dalam satu waktu, dipilih dari tab. Jumlah tetap terlihat sehingga tidak ada yang tersembunyi.',
    'profile.homeLayout.overview': 'Ikhtisar',
    'profile.homeLayout.overview.desc': 'Semua area sekaligus sebagai kartu, diukur menurut tingkat kepentingannya.',
    'profile.homeLayout.list': 'Daftar',
    'profile.homeLayout.list.desc': 'Satu daftar berkelanjutan, dikelompokkan per jenis. Tidak ada yang tersembunyi di balik klik.',
    'profile.homeLayout.default': 'Bawaan',
```

- [ ] **Step 3: Verify both catalogs stayed in sync**

Run: `npx vitest run src/i18n/messages.test.ts`
Expected: PASS. This suite asserts en/id key parity — a missing Indonesian key fails here.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/messages.ts
git commit -m "feat(i18n): Home layout preference strings (en/id)"
```

### Task 7: The profile picker

**Files:**
- Create: `src/components/home/home-layout-picker.tsx`
- Create: `src/components/home/home-layout-picker.css`
- Test: `src/components/home/home-layout-picker.test.tsx`

Port the wireframe thumbnails from the mockup's *Profile picker* view. They are CSS-drawn — no image assets.

- [ ] **Step 1: Write the failing test**

Create `src/components/home/home-layout-picker.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@/i18n/I18nProvider'
import { HomeLayoutPicker } from './home-layout-picker'

function renderPicker(value: 'focused' | 'overview' | 'list' = 'focused', onChange = vi.fn()) {
  render(
    <I18nProvider>
      <HomeLayoutPicker value={value} onChange={onChange} />
    </I18nProvider>,
  )
  return onChange
}

describe('HomeLayoutPicker (OD-V4-9, FR-920)', () => {
  it('FR-920: offers exactly three named options', () => {
    renderPicker()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(screen.getByRole('radio', { name: /focused/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /overview/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /list/i })).toBeInTheDocument()
  })

  it('AC-930: the current choice is exposed to assistive tech, not colour alone', () => {
    renderPicker('overview')
    expect(screen.getByRole('radio', { name: /overview/i })).toBeChecked()
    expect(screen.getByRole('radio', { name: /focused/i })).not.toBeChecked()
  })

  it('AC-930: every option is reachable and selectable by keyboard', async () => {
    const onChange = renderPicker('focused')
    await userEvent.tab()
    await userEvent.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenCalledWith('overview')
  })

  it('reports the chosen layout', async () => {
    const onChange = renderPicker('focused')
    await userEvent.click(screen.getByRole('radio', { name: /list/i }))
    expect(onChange).toHaveBeenCalledWith('list')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/components/home/home-layout-picker.test.tsx`
Expected: FAIL — cannot resolve `./home-layout-picker`.

- [ ] **Step 3: Write the component**

Create `src/components/home/home-layout-picker.tsx`:

```tsx
import { useT } from '@/i18n/use-t'
import { HOME_LAYOUTS, type HomeLayout } from '@/lib/home-layout'
import './home-layout-picker.css'

// The wireframe-thumbnail chooser is the standing convention for a page-structure choice: the
// diagram carries the shape so the label does not have to describe it (OD-V4-9). Thumbnails are
// CSS-drawn — no image assets. The right-hand strip in every thumbnail is the Signals feed, which
// is present in ALL three layouts (FR-928).

export interface HomeLayoutPickerProps {
  value: HomeLayout
  onChange: (next: HomeLayout) => void
}

const FEED_STRIP = (
  <span className="hlp-side">
    <span className="hlp-post"><i className="hlp-l hlp-l--tiny" /><i className="hlp-l" /><i className="hlp-l hlp-l--short" /></span>
    <span className="hlp-post"><i className="hlp-l hlp-l--tiny" /><i className="hlp-l" /></span>
  </span>
)

const THUMBS: Record<HomeLayout, JSX.Element> = {
  focused: (
    <span className="hlp-main">
      <span className="hlp-tabs"><i /><i /><i /><i /></span>
      <i className="hlp-l" /><i className="hlp-l" /><i className="hlp-l hlp-l--short" />
    </span>
  ),
  overview: (
    <span className="hlp-main">
      <span className="hlp-grid"><i className="hlp-box hlp-box--wide" /><i className="hlp-box" /><i className="hlp-box" /></span>
    </span>
  ),
  list: (
    <span className="hlp-main">
      <span className="hlp-pair"><i className="hlp-l hlp-l--tiny" /><i className="hlp-l" /></span>
      <span className="hlp-pair"><i className="hlp-l hlp-l--tiny" /><i className="hlp-l" /></span>
      <span className="hlp-pair"><i className="hlp-l hlp-l--tiny" /><i className="hlp-l hlp-l--short" /></span>
    </span>
  ),
}

export function HomeLayoutPicker({ value, onChange }: HomeLayoutPickerProps) {
  const t = useT()
  return (
    <div className="hlp">
      <p className="hlp-help">{t('profile.homeLayout.help')}</p>
      <div className="hlp-opts" role="radiogroup" aria-label={t('profile.homeLayout')}>
        {HOME_LAYOUTS.map((id) => (
          <label key={id} className="hlp-opt">
            <input
              type="radio"
              name="home-layout"
              value={id}
              checked={value === id}
              onChange={() => onChange(id)}
            />
            <span className="hlp-card">
              <span className="hlp-thumb">{THUMBS[id]}{FEED_STRIP}</span>
              <span className="hlp-name">
                {t(`profile.homeLayout.${id}` as Parameters<typeof t>[0])}
                {id === 'focused' && <span className="hlp-badge">{t('profile.homeLayout.default')}</span>}
              </span>
              <span className="hlp-desc">{t(`profile.homeLayout.${id}.desc` as Parameters<typeof t>[0])}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Write the stylesheet**

Create `src/components/home/home-layout-picker.css`. Radii must come from `DESIGN.md`'s scale (4 / 8 / 10 / 12 / 999) — at 4px tall a bar uses the pill radius, which is why `--radius-pill` appears on `.hlp-l`:

```css
.hlp-help { color: var(--muted-foreground); font-size: var(--font-size-label); margin: 0 0 12px; }
.hlp-opts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.hlp-opt { display: block; cursor: pointer; }
.hlp-opt input { position: absolute; opacity: 0; width: 0; height: 0; }
.hlp-card {
  display: block; height: 100%; padding: 12px;
  border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--card);
}
.hlp-opt:hover .hlp-card { border-color: var(--muted-foreground); }
.hlp-opt input:checked + .hlp-card {
  border-color: var(--primary);
  box-shadow: inset 0 0 0 1px var(--primary);
  background: var(--secondary);
}
.hlp-opt input:focus-visible + .hlp-card { outline: 2px solid var(--ring); outline-offset: 2px; }
.hlp-thumb {
  aspect-ratio: 16 / 10; display: grid; grid-template-columns: 1fr 32%; gap: 5px;
  padding: 7px; background: var(--secondary);
  border: 1px solid var(--border); border-radius: var(--radius-sm);
}
.hlp-main, .hlp-side { display: grid; gap: 4px; align-content: start; min-width: 0; }
.hlp-l { display: block; height: 4px; border-radius: var(--radius-pill); background: var(--muted-foreground); opacity: 0.45; }
.hlp-l--short { width: 60%; }
.hlp-l--tiny { width: 38%; opacity: 0.3; }
.hlp-tabs { display: flex; gap: 3px; }
.hlp-tabs i { display: block; height: 5px; width: 16px; border-radius: var(--radius-pill); background: var(--muted-foreground); opacity: 0.3; }
.hlp-tabs i:first-child { background: var(--primary); opacity: 1; width: 20px; }
.hlp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
.hlp-box { display: block; height: 26px; border: 1px solid var(--muted-foreground); border-radius: var(--radius-sm); opacity: 0.45; }
.hlp-box--wide { grid-column: span 2; height: 22px; }
.hlp-pair { display: grid; grid-template-columns: 26% 1fr; gap: 4px; align-items: center; }
.hlp-post { display: grid; gap: 3px; }
.hlp-name { display: flex; align-items: center; gap: 8px; font-weight: 600; margin-top: 12px; }
.hlp-badge {
  font-size: var(--font-size-label); font-weight: 500; color: var(--muted-foreground);
  background: var(--secondary); border-radius: var(--radius-pill); padding: 2px 8px;
}
.hlp-desc { display: block; font-size: var(--font-size-label); color: var(--muted-foreground); margin-top: 4px; }
@media (max-width: 767px) { .hlp-opts { grid-template-columns: minmax(0, 1fr); } }
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/components/home/home-layout-picker.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add src/components/home/home-layout-picker.tsx src/components/home/home-layout-picker.css src/components/home/home-layout-picker.test.tsx
git commit -m "feat(profile): Home layout picker with wireframe thumbnails (FR-920, AC-930)"
```

### Task 8: Wire the picker into Personal profile

**Files:**
- Modify: `src/pages/profile-page.tsx`

- [ ] **Step 1: Add the imports**

```ts
import { HomeLayoutPicker } from '@/components/home/home-layout-picker'
import { resolveHomeLayout, setHomeLayout, type HomeLayout } from '@/lib/home-layout'
```

- [ ] **Step 2: Add state and handler**

Place this where the removed `homeOrder` state used to live:

```ts
  const [homeLayout, setHomeLayoutState] = useState<HomeLayout>('focused')
  useEffect(() => {
    if (personId) setHomeLayoutState(resolveHomeLayout(personId))
  }, [personId])

  function handleHomeLayoutChange(next: HomeLayout) {
    setHomeLayoutState(next)
    if (personId) setHomeLayout(personId, next)
  }
```

- [ ] **Step 3: Render the card**

Add after the Language card:

```tsx
        <ProfileCard title={t('profile.homeLayout')}>
          <HomeLayoutPicker value={homeLayout} onChange={handleHomeLayoutChange} />
        </ProfileCard>
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npx vitest run src/pages/profile-page.test.tsx`
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/profile-page.tsx
git commit -m "feat(profile): expose the Home layout setting (FR-921)"
```

### Task 9: The shared region model

Every arrangement renders the same regions from the same data. Defining them once is what makes `FR-930` enforceable.

**Files:**
- Create: `src/components/home/home-regions.ts`
- Test: `src/components/home/home-regions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/components/home/home-regions.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildHomeRegions } from './home-regions'
import type { StreamItem } from '@/lib/home-stream'

const item = (id: string): StreamItem => ({
  id, title: `Task ${id}`, route: `/work/tasks/${id}`, reason: null, caption: null, meta: null, pic: null,
})

describe('buildHomeRegions (FR-929, FR-930)', () => {
  it('returns every region even when empty, each with its count', () => {
    const regions = buildHomeRegions({
      overdue: [], dueToday: [], blocked: [], myWork: [], failedChecks: [], mentions: [],
    })
    expect(regions.map((r) => r.id)).toEqual(['needs-you', 'failed-checks', 'mentions', 'my-work'])
    expect(regions.every((r) => r.count === 0)).toBe(true)
  })

  it('needs-you merges overdue, due-today and blocked', () => {
    const regions = buildHomeRegions({
      overdue: [item('a')], dueToday: [item('b')], blocked: [item('c')],
      myWork: [], failedChecks: [], mentions: [],
    })
    const needsYou = regions.find((r) => r.id === 'needs-you')!
    expect(needsYou.count).toBe(3)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/components/home/home-regions.test.ts`
Expected: FAIL — cannot resolve `./home-regions`.

- [ ] **Step 3: Write the module**

Create `src/components/home/home-regions.ts`:

```ts
import type { StreamItem } from '@/lib/home-stream'
import type { MessageKey } from '@/i18n/messages'

// The ONE region model. All three Home arrangements render these same regions — a layout chooses
// how to present them, never which of them exist (NFR-924 parity). A region with zero items is
// still returned, so an empty region is distinguishable from a hidden one (FR-929).

export type HomeRegionId = 'needs-you' | 'failed-checks' | 'mentions' | 'my-work'

export interface HomeRegion {
  id: HomeRegionId
  labelKey: MessageKey
  items: StreamItem[]
  count: number
}

export interface HomeRegionInput {
  overdue: StreamItem[]
  dueToday: StreamItem[]
  blocked: StreamItem[]
  myWork: StreamItem[]
  failedChecks: StreamItem[]
  mentions: StreamItem[]
}

export function buildHomeRegions(input: HomeRegionInput): HomeRegion[] {
  const needsYou = [...input.overdue, ...input.dueToday, ...input.blocked]
  const regions: Array<[HomeRegionId, MessageKey, StreamItem[]]> = [
    ['needs-you', 'home.region.needsYou', needsYou],
    ['failed-checks', 'home.stream.band.failedChecks', input.failedChecks],
    ['mentions', 'home.stream.band.mentions', input.mentions],
    ['my-work', 'home.stream.band.myWork', input.myWork],
  ]
  return regions.map(([id, labelKey, items]) => ({ id, labelKey, items, count: items.length }))
}
```

If `home.region.needsYou` or `home.stream.band.myWork` do not exist, add them to both catalogs following Task 6's pattern — English `Needs you now` / `My work`, Indonesian `Perlu Anda sekarang` / `Pekerjaan saya`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/home/home-regions.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/home/home-regions.ts src/components/home/home-regions.test.ts src/i18n/messages.ts
git commit -m "feat(home): one shared region model for all three layouts (FR-929, FR-930)"
```

### Task 10: The shared layout primitives

**Files:**
- Create: `src/components/home/home-layouts.css`

- [ ] **Step 1: Write the stylesheet**

One definition each. Breakpoints act on the primitives so no layout can drift from the others' responsive behaviour (`FR-932`). Every grid track uses `minmax(0, …)` — a grid child defaults to min-content width, and omitting this is what lets long titles push a grid past its container (`NFR-923`).

```css
/* Shared Home layout primitives (OD-V4-9, FR-930/FR-932).
   ONE definition each: the work/feed layout, the tile grid and tile, and the region tabs.
   A layout option may override only what genuinely differs, and must say why at the override. */

.home-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(240px, 300px); gap: 32px; align-items: start; }
.home-layout > * { min-width: 0; }

.home-bento { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 20px; align-items: stretch; }
/* Gap (20px) deliberately EXCEEDS .home-tile padding (16px): separation between groups must beat
   spacing within them, or the grid reads as one mush. */
.home-tile {
  display: flex; flex-direction: column; min-width: 0; padding: 16px;
  border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--card);
  box-shadow: var(--shadow-rest); /* Soft-Elevation Rule, DESIGN.md OD-P3-11 */
}
.home-tile[data-weight="lead"]  { grid-column: span 4; }
.home-tile[data-weight="major"] { grid-column: span 2; }
.home-tile[data-weight="half"]  { grid-column: span 3; }
.home-tile[data-weight="full"]  { grid-column: span 6; }
.home-tile-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.home-tile-name { font-family: var(--font-display); font-size: var(--font-size-label); font-weight: 600; }
.home-tile-count { font-size: var(--font-size-label); color: var(--muted-foreground); white-space: nowrap; }

.home-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); margin-bottom: 12px; flex-wrap: wrap; }
.home-tab {
  font: inherit; font-weight: 500; border: 0; background: none; color: var(--muted-foreground);
  padding: 8px 12px; cursor: pointer; min-height: 44px; /* coarse-pointer floor, NFR-921 */
  border-bottom: 2px solid transparent; margin-bottom: -1px;
}
.home-tab:hover { color: var(--foreground); }
.home-tab[aria-selected="true"] { color: var(--foreground); border-bottom-color: var(--primary); }
.home-tab:focus-visible { outline: 2px solid var(--ring); outline-offset: -2px; }
.home-tab-count { color: var(--muted-foreground); font-weight: 400; margin-left: 4px; }

@media (max-width: 940px) {
  .home-layout { grid-template-columns: minmax(0, 1fr); gap: 24px; }
  .home-bento { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .home-tile[data-weight="lead"]  { grid-column: span 4; }
  .home-tile[data-weight="major"] { grid-column: span 2; }
  .home-tile[data-weight="half"]  { grid-column: span 2; }
  .home-tile[data-weight="full"]  { grid-column: span 4; }
}
@media (max-width: 620px) {
  .home-bento { grid-template-columns: minmax(0, 1fr); }
  .home-tile { grid-column: span 1 !important; }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/home/home-layouts.css
git commit -m "feat(home): shared layout primitives, one definition each (FR-930, FR-932)"
```

### Task 11: The three arrangements

**Files:**
- Create: `src/components/home/home-focused.tsx`
- Create: `src/components/home/home-overview.tsx`
- Create: `src/components/home/home-list.tsx`
- Test: `src/components/home/home-layout-parity.test.tsx`

Each takes the same props — `regions` plus a `feed` node — so `HomePage` can swap one for another with no other change. **None of them fetches anything**; `HomePage` still owns the single Signal read (`NFR-925`).

- [ ] **Step 1: Write the failing parity test**

Create `src/components/home/home-layout-parity.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import { MemoryRouter } from 'react-router-dom'
import { HomeFocused } from './home-focused'
import { HomeOverview } from './home-overview'
import { HomeList } from './home-list'
import { buildHomeRegions } from './home-regions'
import type { StreamItem } from '@/lib/home-stream'

const item = (id: string): StreamItem => ({
  id, title: `Item ${id}`, route: `/work/tasks/${id}`, reason: null, caption: null, meta: null, pic: null,
})

const regions = buildHomeRegions({
  overdue: [item('a')], dueToday: [], blocked: [],
  myWork: [item('b')], failedChecks: [item('c')], mentions: [],
})

const FEED = <div data-testid="signals-feed">feed</div>

function renderLayout(node: React.ReactNode) {
  return render(<I18nProvider><MemoryRouter>{node}</MemoryRouter></I18nProvider>)
}

describe('Home layout parity (NFR-924, FR-927, FR-928)', () => {
  it('AC-927: every layout renders the Signals feed', () => {
    for (const node of [
      <HomeFocused key="f" regions={regions} feed={FEED} />,
      <HomeOverview key="o" regions={regions} feed={FEED} />,
      <HomeList key="l" regions={regions} feed={FEED} />,
    ]) {
      const { unmount } = renderLayout(node)
      expect(screen.getByTestId('signals-feed')).toBeInTheDocument()
      unmount()
    }
  })

  it('AC-928: a zero-count region is still named, in every layout', () => {
    for (const node of [
      <HomeOverview key="o" regions={regions} feed={FEED} />,
      <HomeList key="l" regions={regions} feed={FEED} />,
    ]) {
      const { unmount } = renderLayout(node)
      expect(screen.getByText(/mentions/i)).toBeInTheDocument()
      unmount()
    }
  })

  it('AC-925: Focused shows a count on every tab, selected or not', () => {
    renderLayout(<HomeFocused regions={regions} feed={FEED} />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(4)
    for (const tab of tabs) expect(tab.textContent).toMatch(/\d/)
  })

  it('AC-929: Overview and List render the same record ids', () => {
    const { unmount } = renderLayout(<HomeOverview regions={regions} feed={FEED} />)
    const overview = screen.getAllByRole('link').map((a) => a.getAttribute('href')).sort()
    unmount()
    renderLayout(<HomeList regions={regions} feed={FEED} />)
    const list = screen.getAllByRole('link').map((a) => a.getAttribute('href')).sort()
    expect(list).toEqual(overview)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/components/home/home-layout-parity.test.tsx`
Expected: FAIL — cannot resolve `./home-focused`.

- [ ] **Step 3: Extract `StreamRow` so the row grammar has one definition**

`StreamRow` is currently a **module-private** function at `src/components/home/home-stream.tsx:113`. All three layouts need it, and `FR-930` requires exactly one definition of the row grammar — so it moves out before they are written.

Create `src/components/home/stream-row.tsx` and move the whole `StreamRow` function into it verbatim, adding `export`:

```tsx
import { Link } from 'react-router-dom'
import type { StreamItem } from '@/lib/home-stream'
import { Reason, type ReasonStyle } from './stream-reason'

// The ONE Home record-row anatomy. Shared by HomeStream and all three layout arrangements
// (FR-930) — a Home row must never have a second implementation.
export function StreamRow({ item, hidePic = false, reasonStyle = 'chip' }: {
  item: StreamItem; hidePic?: boolean; reasonStyle?: ReasonStyle
}) {
  // …body moved verbatim from home-stream.tsx…
}
```

`StreamRow` depends on `Reason` and `ReasonStyle`, which are also module-private in `home-stream.tsx`. Move those into `src/components/home/stream-reason.tsx` the same way, exporting both, and import them where they are used.

In `home-stream.tsx`, delete the three moved definitions and add:
```ts
import { StreamRow } from './stream-row'
import { Reason, type ReasonStyle } from './stream-reason'
```

Run: `npx vitest run src/components/home/home-stream.test.tsx`
Expected: PASS, 12 tests — this is a pure move, so any failure means something changed that should not have.

Commit before continuing:
```bash
git add src/components/home/stream-row.tsx src/components/home/stream-reason.tsx src/components/home/home-stream.tsx
git commit -m "refactor(home): extract StreamRow + Reason so the row grammar has one definition (FR-930)"
```

- [ ] **Step 4: Write the shared props and the List layout**

Create `src/components/home/home-list.tsx`:

```tsx
import type { ReactNode } from 'react'
import { useT } from '@/i18n/use-t'
import { StreamRow } from './stream-row'
import type { HomeRegion } from './home-regions'
import './home-layouts.css'

export interface HomeLayoutProps {
  regions: HomeRegion[]
  feed: ReactNode
}

// List — one continuous list grouped by kind, attention-first. The most complete of the three:
// nothing is behind a click.
export function HomeList({ regions, feed }: HomeLayoutProps) {
  const t = useT()
  return (
    <div className="home-layout">
      <div>
        {regions.map((region) => (
          <section key={region.id} className="home-band" aria-label={t(region.labelKey)}>
            <h3 className="stream-band-label">{t(region.labelKey)} · {region.count}</h3>
            <ul className="stream-band-list">
              {region.items.map((i) => <StreamRow key={i.id} item={i} />)}
            </ul>
          </section>
        ))}
      </div>
      {feed}
    </div>
  )
}
```

- [ ] **Step 5: Write the Overview layout**

Create `src/components/home/home-overview.tsx`:

```tsx
import { useT } from '@/i18n/use-t'
import { StreamRow } from './stream-row'
import type { HomeLayoutProps } from './home-list'
import './home-layouts.css'

// Overview — every region at once as tiles, sized by consequence. `needs-you` leads.
const WEIGHT: Record<string, string> = {
  'needs-you': 'lead', 'failed-checks': 'major', mentions: 'major', 'my-work': 'full',
}

export function HomeOverview({ regions, feed }: HomeLayoutProps) {
  const t = useT()
  return (
    <div className="home-layout">
      <div className="home-bento">
        {regions.map((region) => (
          <section key={region.id} className="home-tile" data-weight={WEIGHT[region.id] ?? 'major'}>
            <div className="home-tile-head">
              <h3 className="home-tile-name">{t(region.labelKey)}</h3>
              <span className="home-tile-count">{region.count}</span>
            </div>
            <ul className="stream-band-list">
              {region.items.slice(0, 4).map((i) => <StreamRow key={i.id} item={i} />)}
            </ul>
          </section>
        ))}
      </div>
      {feed}
    </div>
  )
}
```

- [ ] **Step 6: Write the Focused layout**

Create `src/components/home/home-focused.tsx`:

```tsx
import { useState } from 'react'
import { useT } from '@/i18n/use-t'
import { StreamRow } from './stream-row'
import type { HomeLayoutProps } from './home-list'
import './home-layouts.css'

// Focused — one region at a time. Counts stay on EVERY tab, including unselected ones, so nothing
// is hidden even though only one region is present (FR-925). That is the whole safety argument for
// making this the default.
export function HomeFocused({ regions, feed }: HomeLayoutProps) {
  const t = useT()
  const [activeId, setActiveId] = useState(regions[0]?.id)
  const active = regions.find((r) => r.id === activeId) ?? regions[0]

  return (
    <div className="home-layout">
      <div>
        <div className="home-tabs" role="tablist">
          {regions.map((region) => (
            <button
              key={region.id}
              type="button"
              role="tab"
              className="home-tab"
              aria-selected={region.id === active?.id}
              onClick={() => setActiveId(region.id)}
            >
              {t(region.labelKey)}<span className="home-tab-count">{region.count}</span>
            </button>
          ))}
        </div>
        <ul className="stream-band-list">
          {active?.items.map((i) => <StreamRow key={i.id} item={i} />)}
        </ul>
      </div>
      {feed}
    </div>
  )
}
```

- [ ] **Step 7: Run the parity tests**

Run: `npx vitest run src/components/home/home-layout-parity.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 8: Commit**

```bash
git add src/components/home/home-focused.tsx src/components/home/home-overview.tsx src/components/home/home-list.tsx src/components/home/home-layout-parity.test.tsx src/components/home/stream-row.tsx
git commit -m "feat(home): Focused/Overview/List as compositions of the shared primitives (FR-925..932)"
```

### Task 12: Switch Home on the preference

**Files:**
- Modify: `src/pages/home-page.tsx`
- Test: `src/pages/home-page.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `home-page.test.tsx`:

```tsx
  it('AC-920: renders Focused when nothing is stored', async () => {
    window.localStorage.clear()
    renderHome()
    expect(await screen.findByRole('tablist')).toBeInTheDocument()
  })

  it('AC-921: renders the stored layout', async () => {
    window.localStorage.setItem('gordi.home.layout.person-dewi', 'list')
    renderHome()
    await waitFor(() => expect(screen.queryByRole('tablist')).not.toBeInTheDocument())
  })
```

Use whatever person id `renderHome()`'s existing auth mock supplies — check the top of the file and match it, do not assume `person-dewi`.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/pages/home-page.test.tsx -t 'AC-920'`
Expected: FAIL — no `tablist` in the document.

- [ ] **Step 3: Wire the layout switch**

Add the imports:

```ts
import { resolveHomeLayout, type HomeLayout } from '@/lib/home-layout'
import { buildHomeRegions } from '@/components/home/home-regions'
import { HomeFocused } from '@/components/home/home-focused'
import { HomeOverview } from '@/components/home/home-overview'
import { HomeList } from '@/components/home/home-list'
```

Add state, reading on mount and on person change so a reload resolves the real stored value rather than flashing the default:

```ts
  const [layout, setLayout] = useState<HomeLayout>('focused')
  useEffect(() => {
    if (personId) setLayout(resolveHomeLayout(personId))
  }, [personId])

  const regions = useMemo(
    () => buildHomeRegions({ overdue, dueToday, blocked, myWork, failedChecks: failedChecksBand.items, mentions: mentionsBand.items }),
    [overdue, dueToday, blocked, myWork, failedChecksBand, mentionsBand],
  )
```

Replace the `<HomeStream …/>` + `<SignalFeedSection …/>` pair in the return with:

```tsx
      {(() => {
        const feed = (
          <SignalFeedSection
            signals={ambientSignals}
            authorNamesById={signalData?.context.authorNamesById ?? new Map()}
            teamNamesById={signalData?.context.teamNamesById ?? new Map()}
            loading={signalController.state.status === 'loading'}
            error={signalController.state.status === 'error'}
            onReload={signalRetry}
          />
        )
        if (layout === 'overview') return <HomeOverview regions={regions} feed={feed} />
        if (layout === 'list') return <HomeList regions={regions} feed={feed} />
        return <HomeFocused regions={regions} feed={feed} />
      })()}
```

- [ ] **Step 4: Run Home's tests**

Run: `npx vitest run src/pages/home-page.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/home-page.tsx src/pages/home-page.test.tsx
git commit -m "feat(home): render the person's chosen layout (FR-921, AC-920/921)"
```

### Task 13: Geometry and primitive-uniqueness guards

**Files:**
- Create: `src/components/home/guard-home-layout.css.test.ts`

- [ ] **Step 1: Write the guard**

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const css = readFileSync(join(__dirname, 'home-layouts.css'), 'utf8')

// AC-932: the primitives must have EXACTLY ONE definition each. Before the mockup refactor the
// equivalents were declared 3-4x, once per view — which is how three "options" quietly become
// three surfaces that diverge on the next change.
describe('AC-932: Home layout primitives are defined once', () => {
  for (const selector of ['.home-layout', '.home-bento', '.home-tile', '.home-tabs']) {
    it(`${selector} has exactly one base definition`, () => {
      const re = new RegExp(`^\\${selector} \\{`, 'gm')
      expect(css.match(re)?.length ?? 0).toBe(1)
    })
  }

  // NFR-923: a grid child defaults to min-content width. Omitting minmax(0, …) is what lets long
  // titles push a grid past its container — the exact defect found in the mockups.
  it('every grid track uses minmax(0, …)', () => {
    const tracks = css.match(/grid-template-columns:[^;]+;/g) ?? []
    const bad = tracks.filter((t) => /\b1fr\b/.test(t) && !t.includes('minmax(0'))
    expect(bad).toEqual([])
  })
})
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/components/home/guard-home-layout.css.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 3: Commit**

```bash
git add src/components/home/guard-home-layout.css.test.ts
git commit -m "test(home): guard primitive uniqueness + grid-track safety (AC-932, NFR-923)"
```

### Task 14: Full verification

- [ ] **Step 1: Typecheck and build — both**

Run: `npm run typecheck && npm run build`
Expected: both succeed. `npx tsc --noEmit -p tsconfig.json` is not a substitute; it checks nothing.

- [ ] **Step 2: Lint changed files**

Run: `npx eslint src/components/home src/lib/home-layout.ts src/pages/home-page.tsx src/pages/profile-page.tsx --max-warnings=0`
Expected: exit 0.

- [ ] **Step 3: Full unit suite, and compare against the baseline**

Run: `npx vitest run 2>&1 | tail -5`

Record the failure count. It must be **lower than the pre-change baseline by at least 5** — the retired order-toggle tests. If any *new* failure appears, fix it before proceeding; do not net it off against the deletions.

- [ ] **Step 4: Width sweep (AC-931)**

Start the dev server, sign in, and check Home in each layout at 390, 620, 768, 940, 1100 and 1280px.

**Before trusting any measurement, assert the viewport is real:**
```js
if (document.documentElement.clientWidth < 400) throw new Error('collapsed viewport — result is meaningless')
```
A collapsed harness reports "no overflow" for everything. This produced two false passes during mockup work.

At each width assert: `document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1`.

- [ ] **Step 5: Commit any fixes, then update the review ledger**

`docs/reviews/v4-redesign.md` does not exist yet and `scripts/pre-merge-check.sh` will fail without it. Create it from `docs/reviews/TEMPLATE.md` and record the spec, code-quality and design verdicts before offering merge.

---

## Self-review — spec coverage

| Requirement | Task |
|---|---|
| FR-920 picker with three options | 7 |
| FR-921 persist + apply without reload | 5, 8, 12 |
| FR-922/923 default + invalid fallback | 5 |
| FR-924 per-person scope | 5 |
| FR-925 Focused, counts on every tab | 11 |
| FR-926 Overview tiles by consequence | 11 |
| FR-927 List, attention-first | 11 |
| FR-928 feed in all three | 11 |
| FR-929 zero-count regions still shown | 9, 11 |
| FR-930 one primitive set | 9, 10, 11, 13 |
| FR-931 regions render via RecordCollection | 12 — Home already reads through the engine; the layouts receive its output and must not re-fetch |
| FR-932 responsive on the primitives | 10, 13 |
| NFR-920 a11y | 7, 11 |
| NFR-921 44px targets | 10 |
| NFR-922 localStorage persistence | 5 |
| NFR-923 no horizontal overflow | 10, 13, 14 |
| NFR-924 parity | 11 |
| NFR-925 one Signal read | 12 |
| OD-V4-10 retirement | 1–4 |
| AC-934 e2e | Deferred — add one curated Playwright journey once the layouts are merged; do not build it against unmerged UI |

**Known gap, deliberate:** `AC-934` (e2e) is the only acceptance criterion without a task in this plan. Curated e2e is expensive and this repo keeps ~6–8 journeys total; adding one against UI that has not landed wastes the first run. Add it as the final task of the merge PR.
