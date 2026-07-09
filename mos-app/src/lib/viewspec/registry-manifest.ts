// Primitive Registry MANIFEST — pure names + descriptor metadata ONLY. ZERO React/CSS
// imports (Director build-note, 2026-07-04, pre-ADR-0018-P2-T7): registry.ts imports React
// primitive component types (transitively React/CSS) — importing it from a Deno edge
// function would fail deno check/bundle. Edge functions (compose-view/agent-chat) import
// ONLY this manifest; registry.ts re-exports/binds from it for the app (component-typed
// compile-time guards, `@/` alias). Keep this file free of `@/`, `react`, and `.css`
// imports — the sibling `registry-manifest.test.ts` asserts it via an import-graph guard.

export type PrimitiveStatus = 'live' | 'stub'
export type PropSchemaDescriptor = Record<string, unknown>
export type DataShapeDescriptor = Record<string, unknown>

export interface PrimitiveDescriptor {
  name: string
  status: PrimitiveStatus
  description: string
  propSchema: PropSchemaDescriptor
  dataShape: DataShapeDescriptor
}

export class PrimitiveManifestImpl {
  private readonly entries: ReadonlyMap<string, PrimitiveDescriptor>
  constructor(entries: PrimitiveDescriptor[]) {
    this.entries = new Map(entries.map((e) => [e.name, e]))
  }
  get(name: string): PrimitiveDescriptor | undefined { return this.entries.get(name) }
  keys(): string[] { return Array.from(this.entries.keys()) }
}

// ── LIVE primitives (the 5 MOS dashboard kit primitives, verbatim from their prop types) ──
const KPI_TILE: PrimitiveDescriptor = {
  name: 'KPITile', status: 'live',
  description: 'KPI tile — label, pre-formatted value, optional delta/sub, ready/loading/empty state.',
  propSchema: { label: 'string', value: 'string', delta: 'KPITileDelta | undefined', sub: 'string | undefined', state: "'ready'|'loading'|'empty' | undefined", help: 'string | undefined' },
  dataShape: { value: 'string', delta: '{ text: string; tone: "success"|"destructive"|"neutral"; dot?: boolean } | undefined', sub: 'string | undefined' },
}
const CHART_FRAME: PrimitiveDescriptor = {
  name: 'ChartFrame', status: 'live',
  description: 'Titled chart surface with an injected chart body + MANDATORY a11y table fallback.',
  propSchema: { title: 'string', ariaLabel: 'string', state: "'ready'|'loading'|'empty'|'error' | undefined" },
  dataShape: { children: 'ReactNode (the chart body)', tableFallback: 'ReactNode (MANDATORY a11y table)' },
}
const CUT_TOGGLE: PrimitiveDescriptor = {
  name: 'CutToggle', status: 'live',
  description: 'Segmented control over an enum (arrow-key navigable tablist).',
  propSchema: { ariaLabel: 'string | undefined' },
  dataShape: { options: 'string[]', value: 'string' },
}
const DATA_TABLE: PrimitiveDescriptor = {
  name: 'DataTable', status: 'live',
  description: 'Sortable, reflowing table — desktop table + phone card reflow; ready/loading/empty/error.',
  propSchema: { caption: 'string', isDesktop: 'boolean', emptyLabel: 'string | undefined', state: "'ready'|'loading'|'empty'|'error' | undefined" },
  dataShape: { columns: 'DataTableColumn<Row>[]', rows: 'Row[]' },
}
const FRESHNESS_LABEL: PrimitiveDescriptor = {
  name: 'FreshnessLabel', status: 'live',
  description: 'The reusable "as of {timestamp}" chip — every reporting figure carries one (D11).',
  propSchema: { prefix: 'string | undefined' },
  dataShape: { asOf: 'string | Date' },
}

// ── STUB primitives (ADR-0019 D6 — vendored later; registry-known, render-degraded) ──
const DOC_EDITOR: PrimitiveDescriptor = {
  name: 'doc-editor', status: 'stub',
  description: 'Block editor — content stored as structured block JSON (ADR-0019 D6). Planned; not yet implemented.',
  propSchema: {},
  dataShape: { blocks: 'unknown[]' },
}
const DATA_GRID: PrimitiveDescriptor = {
  name: 'data-grid', status: 'stub',
  description: 'Editable spreadsheet-like grid (ADR-0019 D6). Planned; not yet implemented.',
  propSchema: {},
  dataShape: { rows: 'unknown[]', columns: 'unknown[]' },
}

export const registryManifest = new PrimitiveManifestImpl([
  KPI_TILE, CHART_FRAME, CUT_TOGGLE, DATA_TABLE, FRESHNESS_LABEL, DOC_EDITOR, DATA_GRID,
])

export function validatePrimitiveInManifest(name: string): boolean {
  return registryManifest.get(name) !== undefined
}
