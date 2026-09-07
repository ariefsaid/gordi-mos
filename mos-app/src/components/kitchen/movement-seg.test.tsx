// MovementSeg — component tests for the Café movement strip (#782).
//
// AC-023 (RTL) — the strip shows Produksi plus one `→ Branch` tab per allowed destination,
//                no Roastery ever, and the intra tab carries no gloss when its counterpart
//                stream is not defined.
// AC-024 (RTL) — a bar surface with an own kitchen counterpart shows the intra `→ Dapur X`
//                tab with the counterpart-activity gloss; a bar with no own kitchen (Cikal)
//                shows NO intra tab.
// AC-025 (RTL) — with five options the strip scrolls in its own box; the page never gains a
//                horizontal scrollbar of its own.
// AC-026 (unit) — no Café surface calls a catalog-wide `movementsForStream(branches)`; the
//                 helper is origin-aware only, and every callsite matches its shape.
//
// The strip's OPTIONS are derived elsewhere (`movementsForStream(origin, catalog)` in
// `@/lib/kitchen-action-label`); this file exercises what the RENDERED CONTROL puts on the
// page for a viewer at the two seed personas' streams, wired through the real helper.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MovementSeg } from './movement-seg'
import { movementsForStream, PRODUCE } from '@/lib/kitchen-action-label'
import type { BranchOption, ProductionStream } from '@/lib/db/kitchen-logs.types'

// ── Seed-shaped fixtures ────────────────────────────────────────────────────
// Codes match the ops/shared seed exactly (rumah_rames aliases to 'Bungur' via
// BRANCH_DISPLAY_ALIAS; every other name is canonical); ids are opaque test uuids.
const GHQ: BranchOption = { id: 'b-ghq', code: 'gordi_hq', name: 'Gordi HQ' }
const RRS: BranchOption = { id: 'b-rrs', code: 'rumah_rames', name: 'Rumah Rames' }
const RADIANT: BranchOption = { id: 'b-rad', code: 'radiant', name: 'Radiant' }
const CIKAL: BranchOption = { id: 'b-cikal', code: 'cikal', name: 'Cikal' }
const ROASTERY: BranchOption = { id: 'b-roast', code: 'roastery', name: 'Roastery' }
const BRANCHES: readonly BranchOption[] = [GHQ, RRS, RADIANT, CIKAL, ROASTERY]

// The live seven-stream catalog (OD-WAY-79): {GHQ, RRS, Radiant} × {kitchen, bar} + Cikal × bar.
// Radiant kitchen is receive-only (produces=false, #777); every other stream produces.
// Roastery has no stream at all (OD-WAY-42) and so is absent from the catalog.
const CATALOG: readonly ProductionStream[] = [
  { branch: GHQ, activity: 'kitchen', produces: true },
  { branch: GHQ, activity: 'bar', produces: true },
  { branch: RRS, activity: 'kitchen', produces: true },
  { branch: RRS, activity: 'bar', produces: true },
  { branch: RADIANT, activity: 'kitchen', produces: false },
  { branch: RADIANT, activity: 'bar', produces: true },
  { branch: CIKAL, activity: 'bar', produces: true },
]

const RRS_KITCHEN: ProductionStream = { branch: RRS, activity: 'kitchen', produces: true }
const GHQ_BAR: ProductionStream = { branch: GHQ, activity: 'bar', produces: true }
const RRS_BAR: ProductionStream = { branch: RRS, activity: 'bar', produces: true }
const CIKAL_BAR: ProductionStream = { branch: CIKAL, activity: 'bar', produces: true }

function tabLabels(): string[] {
  return screen.getAllByRole('tab').map(tab => tab.textContent ?? '')
}

// ── AC-023: RRS kitchen (Kartika) — Produksi + arrow-form destinations only ─
describe('AC-023: RRS kitchen — Produksi plus `→ Branch` tabs, no Roastery, no intra gloss', () => {
  it('renders one arrow-form tab per allowed destination and never Roastery', () => {
    const options = movementsForStream(RRS_KITCHEN, CATALOG)
    render(
      <MovementSeg
        value={PRODUCE}
        options={options}
        branches={BRANCHES}
        origin={RRS_KITCHEN}
        onChange={vi.fn()}
      />,
    )
    // Roastery is a branch with no stream (OD-WAY-42) — the derivation must not name it.
    for (const label of tabLabels()) {
      expect(label).not.toContain('Roastery')
    }
    // The visible surface leads with Produksi, then arrow-form destinations. Every option
    // renders as `→ Branch` (or Produksi); no long-form "Transfer to X" leaks onto the strip.
    const labels = tabLabels()
    expect(labels[0]).toMatch(/Production|Produksi/)
    for (const label of labels.slice(1)) {
      expect(label).toMatch(/^→\s/)
    }
  })

  it('carries no `within branch · Bar` gloss when nothing intra is offered', () => {
    // Under the origin-aware rule (#782), a kitchen stream's derivation carries no
    // intra-branch destination — RRS kitchen would produce and ship, never to its own
    // branch — so no tab may render the intra-branch qualifier at all.
    const options = movementsForStream(RRS_KITCHEN, CATALOG)
    render(
      <MovementSeg
        value={PRODUCE}
        options={options}
        branches={BRANCHES}
        origin={RRS_KITCHEN}
        onChange={vi.fn()}
      />,
    )
    for (const label of tabLabels()) {
      // Both locales' phrases for the intra gloss: en "within" / id "dalam"; the strip is
      // clean of both since RRS kitchen has no intra tab.
      expect(label.toLowerCase()).not.toContain('within')
      expect(label.toLowerCase()).not.toContain('dalam')
    }
  })
})

// ── AC-024: GHQ bar (Bagas) — intra tab with counterpart-activity qualifier ─
describe('AC-024: bar surface — intra tab renders only where the counterpart stream exists', () => {
  it('GHQ bar offers Produksi + intra `→ GHQ` with the Kitchen qualifier + cross-branch tabs', () => {
    const options = movementsForStream(GHQ_BAR, CATALOG)
    render(
      <MovementSeg
        value={PRODUCE}
        options={options}
        branches={BRANCHES}
        origin={GHQ_BAR}
        onChange={vi.fn()}
      />,
    )
    // The intra option (destination = GHQ) carries the counterpart-activity gloss so it
    // reads as `→ Kitchen at GHQ` rather than as a second entry for the branch itself.
    const intraTab = screen.getByRole('tab', { name: /transfer to gordi hq.*(?:within|kitchen)/i })
    expect(intraTab).toBeInTheDocument()
    // The rendered qualifier rung shows the short form of the intra gloss — the activity
    // travels as display, never as a stored dimension (OD-WAY-44).
    expect(intraTab).toHaveTextContent(/kitchen|dapur/i)
    // Cross-branch tabs to the other bar-having branches all render as `→ Branch`.
    for (const branchName of ['Bungur', 'Radiant', 'Cikal']) {
      expect(screen.getByRole('tab', { name: new RegExp(`transfer to ${branchName}`, 'i') }))
        .toBeInTheDocument()
    }
    // Roastery is never offered.
    for (const label of tabLabels()) {
      expect(label).not.toContain('Roastery')
    }
  })

  it('Cikal bar carries no intra tab — its counterpart kitchen stream does not exist', () => {
    // OD-WAY-79: Cikal is a bar-only branch. Offering an intra tab there would name a
    // movement the database refuses; the origin-aware derivation must omit it.
    const options = movementsForStream(CIKAL_BAR, CATALOG)
    render(
      <MovementSeg
        value={PRODUCE}
        options={options}
        branches={BRANCHES}
        origin={CIKAL_BAR}
        onChange={vi.fn()}
      />,
    )
    // No option's destination equals Cikal's own branch id (the intra shape).
    for (const label of tabLabels()) {
      expect(label.toLowerCase()).not.toContain('within')
      expect(label.toLowerCase()).not.toContain('dalam')
    }
    // The intra-labelled aria variant is absent as well.
    expect(
      screen.queryByRole('tab', { name: /transfer to cikal.*within/i }),
    ).toBeNull()
  })

  it('RRS bar offers Produksi + intra `→ Bungur` with the Kitchen qualifier', () => {
    // The intra option here reads via the branch alias (rumah_rames → Bungur), which is
    // where the shipping the WIP actually lands — RRS bar's outlet is at Bungur.
    const options = movementsForStream(RRS_BAR, CATALOG)
    render(
      <MovementSeg
        value={PRODUCE}
        options={options}
        branches={BRANCHES}
        origin={RRS_BAR}
        onChange={vi.fn()}
      />,
    )
    expect(
      screen.getByRole('tab', { name: /transfer to bungur.*(?:within|kitchen)/i }),
    ).toBeInTheDocument()
  })
})

// ── AC-025: at 390 the strip scrolls in its own box, the page never overflows ─
describe('AC-025: derived scope strip scrolls in its own box, page never overflows', () => {
  it('the track declares overflow-x: auto with a max-width of 100%', () => {
    // jsdom computes no layout, so the assertion sits on the CSS contract that produces the
    // in-box scroll — the track opts into horizontal overflow itself (`overflow-x: auto`)
    // AND is width-bounded to its parent, so it cannot push the page wider.
    const css = readFileSync(join(__dirname, 'movement-seg.css'), 'utf8')
    const track = css.slice(css.indexOf('.kms {'), css.indexOf('}', css.indexOf('.kms {')))
    expect(track).toMatch(/overflow-x:\s*auto/)
    expect(track).toMatch(/max-width:\s*100%/)
    expect(track).toMatch(/box-sizing:\s*border-box/)
  })

  it('renders five tabs (GHQ bar) inside a bounded container without leaking to the DOM root', () => {
    const options = movementsForStream(GHQ_BAR, CATALOG)
    // A 390-wide bounding parent stands in for the phone viewport; the strip is expected
    // to stay INSIDE it (its DOM host — a div with role=tablist — is the ONLY scroll box).
    const { container } = render(
      <div style={{ width: 390, overflowX: 'hidden' }}>
        <MovementSeg
          value={PRODUCE}
          options={options}
          branches={BRANCHES}
          origin={GHQ_BAR}
          onChange={vi.fn()}
        />
      </div>,
    )
    // Exactly five options (Produksi + four allowed destinations for GHQ bar).
    const tabs = within(container).getAllByRole('tab')
    expect(tabs).toHaveLength(5)
    // A strip larger than five options would be the derivation's problem (A7), not a
    // width to solve — the count itself is asserted so a regression that added a sixth
    // option here would fail before the layout ever ran.
    expect(tabs.length).toBeLessThanOrEqual(5)
    // The strip's own host is a div with role=tablist — that is the scroll surface, and
    // it sits inside our width-bounded parent, so the page (its parent) does not scroll.
    const tablist = within(container).getByRole('tablist')
    expect(tablist.parentElement).toBe(container.firstChild)
  })
})

// ── AC-026: `movementsForStream` is origin-aware; no catalog-wide caller ─────
describe('AC-026: the catalog-wide `movementsForStream(branches)` is gone', () => {
  it('every Café callsite passes an origin stream and the catalog, never just branches', () => {
    // The old signature took `(branches, streamOptions)` and enumerated every branch — the
    // strip then offered destinations a producing stream had no right to send to. The
    // origin-aware helper is the ONE shape that ships (#777/#782), so this test greps the
    // Café pages that render the strip and holds the shape.
    const pages = [
      readFileSync(join(__dirname, '..', '..', 'pages', 'kitchen-log-page.tsx'), 'utf8'),
      readFileSync(join(__dirname, '..', '..', 'pages', 'kitchen-plan-page.tsx'), 'utf8'),
    ]
    for (const source of pages) {
      // Every call site names the ORIGIN first (a ProductionStream) and the CATALOG second.
      // A bare-branches call — `movementsForStream(branches)` — would match the negated
      // pattern below and fail this guard.
      expect(source).toMatch(/movementsForStream\(\s*stream\s*,\s*streamOptions\s*\)/)
      expect(source).not.toMatch(/movementsForStream\(\s*branches\s*\)/)
    }
  })

  it('exports the origin-aware `movementsForStream(origin, catalog)` shape and no other', () => {
    const source = readFileSync(join(__dirname, '..', '..', 'lib', 'kitchen-action-label.ts'), 'utf8')
    // The signature line names `origin: ProductionStream` and `catalog: readonly …`. Any
    // reintroduction of a `branches: readonly BranchOption[]` first argument would fail here.
    expect(source).toMatch(/export function movementsForStream\(\s*origin:\s*ProductionStream/)
    expect(source).not.toMatch(/export function movementsForStream\(\s*branches:\s*readonly BranchOption/)
  })
})

// ── AC-027 (doc): DESIGN.md § Tabs / Segmented Controls carries A7 verbatim ──
describe('AC-027: DESIGN.md carries the A7 amendment for derived scope strips', () => {
  it('the § Tabs / Segmented Controls section states the derived-strip rule verbatim', () => {
    const design = readFileSync(join(__dirname, '..', '..', '..', '..', 'DESIGN.md'), 'utf8')
    const start = design.indexOf('### Tabs / Segmented Controls')
    const nextHeader = design.indexOf('\n### ', start + 1)
    const scope = design.slice(start, nextHeader === -1 ? design.length : nextHeader)
    expect(scope).toContain(
      '**Derived scope strips.** A segmented strip whose options come from data (Café movements) '
        + 'renders only the options valid for the current scope, labelled `→ Destination`; it '
        + 'never enumerates a catalog. Above five options the strip is wrong and the derivation '
        + 'is fixed, not the layout.',
    )
  })
})
