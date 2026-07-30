# Spec — Home layout preference (`OD-V4-9`)

**Status:** DRAFT for owner sign-off. Authored 2026-07-28 via `feature-forge`.
**Authority chain:** `docs/v4-inheritance.md` § `OD-V4-9` (the decision) → `OD-V4-7` (Home may use
tiles; the `DESIGN.md` density-mode amendment) → `DESIGN.md` § MOS density mode → `docs/jtbd.md`
(personas). **Reference implementation:** `docs/design-mockups/home-priority-2026-07-28/index.html`
— the mockup is a standing reference with a presumption of correctness (CLAUDE.md mockup rule);
port what it answered, do not re-open it mid-build.

**ID range:** `FR-920`+ / `NFR-920`+ / `AC-920`+ — the highest in use before this spec were
`FR-910` and `AC-909`, so this range is collision-free.

---

## 1. Overview and user value

Home serves four personas whose relationship to volume is opposite. A contributor mid-shift wants
one short answer; an owner-director scanning six Business Units wants everything at once. A single
imposed layout is therefore wrong for somebody **by construction**.

This slice makes Home's *arrangement* a per-person preference. **The information is identical in all
three options — only the shape changes.** Nobody sees more or less than their permissions already
allow; `can()` and RLS are untouched by this feature.

| Option | User-facing name | Shape |
|---|---|---|
| default | **Focused** | One section at a time, chosen from tabs, with counts pinned to the tabs |
| | **Overview** | Every area at once as tiles, sized by consequence |
| | **List** | One continuous list grouped by kind |

The **Signals feed is present in all three** and never moves into the work area.

**Success looks like:** a floor contributor and the owner-director both call Home usable without
either of them changing how the other's Home works.

## 2. Scope

### In scope
- A `Home layout` setting on `/profile`, chosen from three wireframe-thumbnail options.
- Three Home arrangements built from **one** shared primitive set.
- Per-person persistence, defaulting to Focused.
- **Retirement of the OD-18 region-order toggle** (see §3, `OD-V4-10`).

### Out of scope
- Any change to what data Home reads, to `can()`, or to RLS. This is composition only.
- New Home content. No band, tile or region introduces a record type Home does not already show.
- An admin-set or role-set default. The preference is the person's own.
- Server-side persistence (see `NFR-922` for why v1 is local).

## 3. `OD-V4-10` — the region-order toggle is retired (owner, 2026-07-28)

**Decision, verbatim intent:** *"Remove the old and keep the layout only."*

`OD-REDESIGN-18` gave Home an order toggle (attention-first / my-work-first). With a layout
preference it becomes a second Home setting that is meaningless in two of the three options — tabs
and tiles have no "region order" — and a control that does nothing in the layout you are in is the
dead-affordance defect class the audits flagged repeatedly (anchor A4).

It is **removed outright**, not folded in and not carried over. List renders the attention-first
order, which was already the default.

**Retirement surface** (9 files): `lib/home-region-order.ts` + its test, `components/home/
home-order-toggle.tsx`, the `order` prop on `components/home/home-stream.tsx`, the toggle's markup
in `pages/home-page.tsx` and `pages/profile-page.tsx`, and the dead rules in `pages/home-page.css` /
`styles/segmented-track.css` (only if no other consumer remains — verify, do not assume).

**Note for the implementer:** five of the currently-red tests in `pages/home-page.test.tsx`
(AC-514, RI-1, RI-2 ×3) exercise this toggle. They are **deleted with the feature, not fixed** —
their subject no longer exists. That is a legitimate reduction of the `OD-V4-4` red-test debt, and
must be called out in the PR body so it is not mistaken for tests being bent to pass.

## 4. Functional requirements (EARS)

### The setting

- **FR-920** Where the viewer is on `/profile`, the system shall present a `Home layout` setting
  offering exactly three options — Focused, Overview, List — each rendered as a wireframe thumbnail
  with a name and a one-sentence description of who it suits.
- **FR-921** When the viewer selects a Home layout option, the system shall persist that choice for
  that person and apply it to Home without requiring a reload.
- **FR-922** Where no Home layout choice is stored for the viewer, the system shall use **Focused**.
- **FR-923** Where a stored Home layout value is absent, unrecognised, or unreadable, the system
  shall fall back to Focused rather than failing to render Home.
- **FR-924** The system shall scope the stored preference to the person, so two people signed in on
  the same device do not inherit each other's layout.

### The three arrangements

- **FR-925** Where the layout is **Focused**, Home shall render one work region at a time selected
  from a tab strip, and each tab shall carry its own item count at all times, including for tabs
  that are not currently selected.
- **FR-926** Where the layout is **Overview**, Home shall render every work region simultaneously as
  tiles, with tile prominence reflecting consequence rather than a uniform grid.
- **FR-927** Where the layout is **List**, Home shall render every work region as one continuous
  list grouped by kind, in attention-first order.
- **FR-928** The system shall render the Signals feed in all three layouts, and shall not place
  Signals in the work area of any layout.
- **FR-929** Where a work region contains no items, the system shall still disclose that region's
  existence and its zero count, so an empty region is distinguishable from a hidden one.

### Reuse (binding — `OD-V4-9`)

- **FR-930** The system shall implement the three arrangements as compositions of **one** shared
  primitive set — the work/feed layout, the tile grid and tile, the row grammar, the feed, and the
  region tabs — and shall not introduce a second implementation of any of these per layout.
- **FR-931** Where a Home work region renders records, the system shall source them through the
  existing `RecordCollection` engine rather than a bespoke renderer. A tile or tab **hosts** a
  collection; it does not re-implement one.
- **FR-932** The system shall apply responsive behaviour at the primitive level, so no layout option
  can diverge from the others' responsive behaviour independently.

## 5. Non-functional requirements

- **NFR-920 (a11y).** The layout picker shall be a labelled radio group operable by keyboard alone,
  with a visible focus ring on the focused option and the selected option conveyed by more than
  colour. Focused's tab strip shall use the `tablist`/`tab` roles with `aria-selected`.
- **NFR-921 (touch).** Every control introduced by this feature shall meet the 44×44px tap-target
  floor on coarse pointers (`DESIGN.md` § Density).
- **NFR-922 (persistence, v1).** The preference shall persist via `localStorage`, keyed by person,
  following the **existing precedent** in `lib/home-region-order.ts` — *"v1 store = localStorage
  (RATIFY-1); one-line swap to a Personal-Profile column later."* Reads shall be guarded against
  private-mode and quota throws and always resolve to a valid layout. **This deliberately removes
  the migration + RLS blocker** that `OD-V4-9` listed as owed before build; server-side persistence
  is a later, separate slice.
- **NFR-923 (no horizontal overflow).** No layout shall produce horizontal page overflow at any
  width from 390px upward. This is called out explicitly because it was the defect found in the
  mockups at every intermediate width, and it was missed twice by testing only the two breakpoint
  extremes — **verification must sweep intermediate widths, not just 390 and 1280.**
- **NFR-924 (parity).** **AMENDED — see `RATIFY-3`.** All three layouts shall make the same records
  reachable for the same viewer. A layout shall never be the reason a record is UNREACHABLE. A
  layout may summarise (Overview caps each tile at `OVERVIEW_TILE_ROWS`), but a region that
  truncates shall always state the remainder and offer the route to it.
- **NFR-925 (no regression in reads).** Home shall continue to issue exactly one Signal read
  (`FR-V3-013` — no second Signal loader), regardless of layout.

## 6. Acceptance criteria (Given/When/Then)

Each `AC` is owned by **one** test at the lowest sufficient layer (CLAUDE.md test pyramid).

- **AC-920** *(unit)* **Given** a person with no stored Home layout, **when** they open Home,
  **then** the Focused layout renders.
- **AC-921** *(unit)* **Given** a person on `/profile`, **when** they choose Overview, **then** Home
  renders the Overview layout and the choice survives a remount without a reload.
- **AC-922** *(unit)* **Given** a stored Home layout value of `"nonsense"`, **when** Home renders,
  **then** it renders Focused and does not throw.
- **AC-923** *(unit)* **Given** `localStorage` throws on read (private mode), **when** Home renders,
  **then** it renders Focused and does not throw.
- **AC-924** *(unit)* **Given** person A has chosen List on a device, **when** person B signs in on
  that same device, **then** person B sees Focused.
- **AC-925** *(unit)* **Given** the Focused layout with items in more than one region, **when** the
  viewer reads the tab strip, **then** every tab shows its count, including unselected tabs.
- **AC-926** *(unit)* **Given** the Focused layout, **when** the viewer selects a different tab,
  **then** only that region's records render and the Signals feed is unaffected.
- **AC-927** *(unit)* **Given** any of the three layouts, **when** Home renders, **then** the
  Signals feed is present and no Signal renders inside a work region.
- **AC-928** *(unit)* **Given** a viewer whose regions are all empty, **when** Home renders in any
  layout, **then** each region is still named with a zero count.
- **AC-929** *(unit, parity)* **AMENDED — see `RATIFY-3`.** **Given** one fixed dataset and one
  viewer whose regions hold more items than an Overview tile shows, **when** Home renders in each of
  the three layouts in turn, **then** no layout is the reason a record is unreachable: List and
  Focused render every record, and every region Overview truncates states the honest remainder as a
  link to where those records live.
- **AC-930** *(unit, a11y)* **Given** the layout picker, **when** the viewer navigates by keyboard
  only, **then** every option is reachable and selectable, and the selected option is exposed to
  assistive tech without relying on colour.
- **AC-931** *(unit, geometry)* **Given** each of the three layouts at 390, 620, 768, 940, 1100 and
  1280px, **when** Home renders, **then** no layout produces horizontal overflow.
- **AC-932** *(unit, guard)* **Given** the shipped source, **when** the shared primitives are
  inspected, **then** the work/feed layout, tile grid, tile, row, feed and region tabs each have
  exactly **one** definition, and no layout option redefines them.
- **AC-933** *(unit, regression)* **Given** the shipped source, **when** it is searched for the
  retired region-order toggle, **then** `HomeRegionOrder`, `home-region-order` and
  `home-order-toggle` have no remaining references.
- **AC-934** *(e2e, curated)* **Given** a signed-in person on Home, **when** they change the Home
  layout in `/profile` and return to Home, **then** Home renders in the newly chosen layout.

## 7. Error handling

| Condition | Behaviour | Requirement |
|---|---|---|
| No stored preference | Render Focused silently — this is the normal first-run path, not an error | FR-922 |
| Stored value unrecognised | Render Focused silently; do not surface a system error for a value the user never typed | FR-923 |
| `localStorage` read throws (private mode / quota) | Render Focused; never block Home from rendering | FR-923, NFR-922 |
| `localStorage` write throws | Apply the choice for the session and do not claim it was saved. **Do not** show a success confirmation that is false | FR-921 |
| Underlying record read fails | Unchanged from today — the region's existing `ErrorState` + Retry. A layout must not convert a failed read into an empty-looking all-clear (DIV-G5) | NFR-924 |
| A region has zero items | The region's existing `EmptyState`, still named and counted — never omitted | FR-929 |

## 8. Implementation checklist

**Retire first, so the new work is not built around a corpse.**
- [ ] Delete `lib/home-region-order.ts` + `lib/home-region-order.test.ts`.
- [ ] Delete `components/home/home-order-toggle.tsx`; drop the `order` prop from `HomeStream`.
- [ ] Remove the toggle from `pages/home-page.tsx` and `pages/profile-page.tsx`.
- [ ] Remove dead CSS in `pages/home-page.css`; check `styles/segmented-track.css` for other
      consumers **before** deleting anything there.
- [ ] Delete the 5 order-toggle tests in `pages/home-page.test.tsx` (AC-514, RI-1, RI-2 ×3) and say
      so explicitly in the PR body.

**Preference layer**
- [ ] `lib/home-layout.ts` — `HomeLayout = 'focused' | 'overview' | 'list'`, `resolveHomeLayout`,
      `setHomeLayout`; person-keyed, throw-guarded, defaults to `focused`. Mirror the retired
      module's shape (that is the precedent, and it worked).
- [ ] `/profile` picker: radio group + wireframe thumbnails, ported from the mockup.
- [ ] Bilingual strings (en/id) for the three names, the three descriptions and the setting label.

**Primitives, then arrangements**
- [ ] Extract the shared set: work/feed layout, tile grid + tile, row grammar, feed, region tabs.
- [ ] Build Focused, Overview, List as compositions of those primitives only.
- [ ] Route every work region through the `RecordCollection` engine (`FR-931`).
- [ ] Responsive rules on the primitives, not per layout (`FR-932`).

**Verification**
- [ ] Unit tests for AC-920…AC-933. Curated e2e for AC-934 only.
- [ ] Width sweep at 390 / 620 / 768 / 940 / 1100 / 1280 — **intermediate widths included**, and the
      check must abort rather than report if the harness viewport measures 0 (this produced two
      false "no overflow" results during mockup work).
- [ ] `npm run typecheck` and `npm run build` — both, per the solution-file false-pass trap.
- [ ] ESLint `--max-warnings=0` on changed files.

## 9. Open items for the owner

1. **Phone reality.** All three layouts converge on phone: tiles stack and tabs are the only real
   differentiator, so for the floor persona the setting is close to a no-op. Worth confirming this
   is acceptable, or deciding the setting is desktop/tablet-only and phone always uses Focused.
2. **Discoverability.** The setting lives in `/profile` and nothing on Home points to it. A person
   who would prefer List may never learn it exists. Not solved here.

## 10. `RATIFY-BEFORE-MERGE`

- `RATIFY-1` — `OD-V4-10`, the outright removal of the region-order toggle, is recorded here from a
  single owner instruction. Confirm at sign-off that no carry-over of stored `my-work-first` values
  is wanted.
- `RATIFY-2` — `NFR-922` chooses `localStorage` over the person record, which contradicts
  `OD-V4-9`'s "owed before build: a home on the person record". It follows the established
  precedent and unblocks the slice; confirm the deferral is acceptable.

- `RATIFY-3` — **`AC-929` / `NFR-924` are AMENDED from "the same records" to "the same records
  REACHABLE"** (Director ruling, 2026-07-29, recorded during acceptance).
  As originally written the criterion could not hold and should not: `home-overview.tsx` caps each
  tile at `OVERVIEW_TILE_ROWS` (5) and states the remainder as an "N more →" link, so at ≥6 items
  per region Overview renders strictly fewer records than List by design. The cap plus its link is
  the **intended** behaviour — the link is what keeps the summary honest — so the oracle was
  re-scoped to the invariant the parity requirement actually protects: *no layout is the reason a
  record is unreachable; a truncated region always offers the way through.* The end-state assertion
  was not weakened — it was moved off "identical id sets" and onto reachability, and the owning test
  now runs a fixture that exercises the cap (the previous one held 1 item per region, below the cap,
  so it could never have detected a violation of either reading).
  Owner to confirm at sign-off, since this changes a signed artifact.
  Owning test: `mos-app/src/components/home/home-layout-parity.test.tsx` (`AC-929: no layout hides
  a record …`).

- `RATIFY-4` — **`OVERVIEW_TILE_ROWS` raised from 4 to 5** (owner ruling, 2026-07-30, already
  actioned — recorded here for the artifact trail). The Overview bento tile shows 5 rows before
  stating the remainder as "N more →"; `RATIFY-3` above is updated to match (cap 5, exercised at ≥6
  items). Bento packing (`guard-bento-rows.css.test.ts`) is unaffected — it guards tile-weight/span
  arithmetic, not row count.

- `RATIFY-5` — **Home's job-sentence requirement is retired** (owner ruling, 2026-07-30, verbatim:
  "agree. remove any requirements for what needs my attention"). Home's header renders the
  day-status row in place of the registry job sentence "What needs my attention right now?" —
  previously flagged (`docs/reviews/v4-redesign.md` Open item 1) as an Experience-Contract Rule 1
  violation because Rule 1 mandated the literal sentence and no oracle guarded the real route (the
  fixture at `context-row.test.tsx` composed a shape `/` never renders). Rule 1 is now amended
  (`docs/experience-contract.md`) so a page whose head carries a qualifying status row satisfies
  orientation with that row — never both, never neither — and the oracle is rebuilt to compose the
  head the way `/` actually does. `DESIGN.md` (ratified `509c6ae`) is unchanged; its existing "one
  clear job sentence/context" wording already reads compatibly with a status-row substitute, so no
  edit was made there — see the review ledger for the specific wording recommendation if the token
  document is ever revisited.
