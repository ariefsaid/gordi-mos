/* eslint-disable react-refresh/only-export-components -- this module intentionally exports
   the compiler re-export + buildCompilerContext/RenderError alongside the components (mirrors
   I18nProvider.tsx's context+hook pattern); splitting it would fragment the render boundary. */
// UserViewRenderer — the trusted renderer (ADR-0017 D5). Adapted from the sibling internal
// project's renderer boundary. Compiles the spec through compileCompositionSpec on every
// render (synchronously — compile is pure/sync, so this is a useMemo derive, not an effect;
// there is no compile-loading flash), executes each CompiledQuery under the viewer's own JWT,
// and hydrates the registered primitive. Degrades to an error state on ValidationError (never
// crash, never render unvalidated); a stub primitive (or a live primitive with no P1 query
// binding — CutToggle, doc-editor, data-grid) degrades to a "planned" placeholder; a per-panel
// executor error degrades only that panel.
//
// SECURITY INVARIANT (P1 review fix-wave item 9) — spec-derived data (panel props, row values)
// reaches JSX as TEXT ONLY, via ordinary React children/attribute interpolation (which HTML-
// escapes). This file MUST NEVER use `dangerouslySetInnerHTML`, MUST NEVER build an `href`/`src`
// from spec or row data, and MUST NEVER render an anchor/`<a>` from row data — drill-links are
// explicitly NOT part of P1's binding (a future drill-link feature needs its own allowlisted URL
// validation, not a pass-through of arbitrary row strings). A row value like
// `<img src=x onerror=alert(1)>` or `javascript:alert(1)` must render as inert text, never markup.
import { useMemo, useEffect, useState } from 'react'
import { compileCompositionSpec } from './compiler'
import { executeCompiledQuery } from './executor'
import { registry } from './registry'
import { ValidationError } from './types'
import type { CompiledPanel, CompilerContext, CompositionSpec } from './types'
import { useT } from '@/i18n/use-t'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table'
import { KPITile } from '@/components/dashboard/kpi-tile'
import { ChartFrame } from '@/components/dashboard/chart-frame'
import { FreshnessLabel } from '@/components/dashboard/freshness-label'

export type { CompilerContext, CompiledPanel }

export class RenderError extends Error {
  readonly code: string
  readonly detail?: string
  constructor(code: string, detail?: string) {
    super(detail ? `${code}: ${detail}` : code)
    this.code = code
    this.detail = detail
  }
}

/** Builds a CompilerContext from the viewer's person id + the decoded org_id claim. */
export function buildCompilerContext(personId: string, orgId: string): CompilerContext {
  return { personId, orgId }
}

type PanelState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'stub'; name: string }
  | { kind: 'ready'; rows: unknown[]; truncated: boolean }

/**
 * Compile is synchronous (pure TS, no I/O) — a useMemo derive, not an effect. This kills the
 * null→loading flash the old useEffect+useState version had (compile always "succeeds or
 * throws" on the very first render) and removes the need for an exhaustive-deps disable, since
 * useMemo's dependency array is exhaustive by construction here.
 */
function useCompiledPanels(spec: CompositionSpec, ctx: CompilerContext): { panels: CompiledPanel[] | null; compileErr: RenderError | null } {
  return useMemo(() => {
    try {
      return { panels: compileCompositionSpec(spec, ctx), compileErr: null }
    } catch (e) {
      const code = e instanceof ValidationError ? e.code : 'COMPILE_ERROR'
      const detail = e instanceof Error ? e.message : String(e)
      return { panels: null, compileErr: new RenderError(code, detail) }
    }
  }, [spec, ctx])
}

export function UserViewRenderer({
  spec, ctx, onRetry,
}: {
  spec: CompositionSpec
  ctx: CompilerContext
  onRetry?: () => void
}) {
  const t = useT()
  const { panels, compileErr } = useCompiledPanels(spec, ctx)

  if (compileErr) {
    return (
      <section className="uv-render uv-render--error" role="alert">
        <h2 className="uv-render__title">{t('views.render.error.title')}</h2>
        <p className="uv-render__body">{t('views.render.error.body')}</p>
        <p className="uv-render__code" data-testid="uv-render-error-code">{compileErr.code}</p>
        {onRetry && (
          <button type="button" className="uv-render__retry" onClick={onRetry}>
            {t('views.render.retry')}
          </button>
        )}
      </section>
    )
  }
  // panels is never null here (compileErr would be set instead) — the `!panels` guard from the
  // old async version is gone along with the loading flash it existed for.
  return (
    <section className="uv-render" aria-label={t('views.render.aria')}>
      {panels!.map((p) => <PanelHost key={p.id} compiled={p} />)}
    </section>
  )
}

function PanelHost({ compiled }: { compiled: CompiledPanel }) {
  const t = useT()
  const isDesktop = useIsDesktop()
  const desc = registry.get(compiled.primitive)
  const [state, setState] = useState<PanelState>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    // Stub primitives, and the "live" primitives with no P1 query binding (CutToggle needs a
    // cut-selection UX the builder hasn't shipped yet), never execute — they degrade straight to
    // the planned placeholder (ADR-0017 D5 philosophy: known-to-the-registry but
    // not-yet-hydratable). doc-editor / data-grid are the registry's own stub descriptors.
    if (desc?.status === 'stub' || compiled.primitive === 'CutToggle') {
      setState({ kind: 'stub', name: compiled.primitive })
      return
    }
    executeCompiledQuery(compiled.compiledQuery)
      .then(({ rows, truncated }) => { if (!cancelled) setState({ kind: 'ready', rows, truncated }) })
      .catch((e: unknown) => {
        if (cancelled) return
        const message = e instanceof Error ? e.message : String(e)
        setState({ kind: 'error', message })
      })
    return () => { cancelled = true }
  }, [compiled, desc?.status])

  if (state.kind === 'loading') {
    return <div className="uv-panel uv-panel--loading" aria-busy="true">{t('views.render.loading')}</div>
  }
  if (state.kind === 'stub') {
    return (
      <div className="uv-panel uv-panel--stub" role="status" data-testid={`uv-stub-${compiled.primitive}`}>
        <p className="uv-panel__stub-title">{t('views.stub.title')}</p>
        <p className="uv-panel__stub-body">{t('views.stub.body', { name: state.name })}</p>
      </div>
    )
  }
  if (state.kind === 'error') {
    return <div className="uv-panel uv-panel--error" role="alert">{t('views.panel.error')}</div>
  }

  // READY — hydrate the actual registered primitive (P1 review fix-wave item 9). Every value
  // below flows into JSX as a plain string/number child or a `label`/`ariaLabel` attribute —
  // React escapes both; nothing here is ever dangerouslySetInnerHTML'd or used to build a URL.
  return (
    <div data-testid={`uv-panel-${compiled.primitive}`}>
      {state.truncated && (
        <p className="uv-panel__truncated" role="status" data-testid="uv-panel-truncated">
          {t('views.panel.truncated', { n: compiled.compiledQuery.limit ?? state.rows.length })}
        </p>
      )}
      <ReadyPrimitive compiled={compiled} rows={state.rows} isDesktop={isDesktop} />
    </div>
  )
}

function maxSnapshotAsOf(rows: unknown[]): string | undefined {
  let max: string | undefined
  for (const row of rows) {
    const value = (row as Record<string, unknown>).snapshot_as_of
    if (typeof value === 'string' && (max === undefined || value > max)) max = value
  }
  return max
}

function ReadyPrimitive({
  compiled, rows, isDesktop,
}: {
  compiled: CompiledPanel
  rows: unknown[]
  isDesktop: boolean
}) {
  const t = useT()
  const props = (compiled.props ?? {}) as { label?: string }

  switch (compiled.primitive) {
    case 'DataTable': {
      const columns: DataTableColumn<Record<string, unknown>>[] = compiled.compiledQuery.resolvedSelect.map((col) => ({
        key: col, header: col,
      }))
      return (
        <DataTable
          columns={columns}
          rows={rows as Record<string, unknown>[]}
          isDesktop={isDesktop}
          caption={props.label ?? compiled.id}
          state={rows.length === 0 ? 'empty' : 'ready'}
        />
      )
    }
    case 'KPITile': {
      const agg = compiled.compiledQuery.resolvedAggregate
      const value = agg
        ? String((rows[0] as Record<string, unknown> | undefined)?.[agg.alias] ?? 0)
        : String(rows.length)
      return <KPITile label={props.label ?? compiled.primitive} value={value} />
    }
    case 'ChartFrame':
      // Empty frame — the chart body binds to a real series once the polished builder ships
      // chart-shape mapping (querySpec → series). Per D5, an un-hydratable body degrades to a
      // clear "planned" message (rendered as the frame's own body, state="ready") rather than a
      // fake/blank chart or the frame's "no data" empty-state (which means something different —
      // a real query that returned zero rows, not an unimplemented binding).
      return (
        <ChartFrame
          title={props.label ?? compiled.id}
          ariaLabel={props.label ?? compiled.id}
          state="ready"
          tableFallback={<table><caption>{props.label ?? compiled.id}</caption></table>}
        >
          {t('views.chart.pending')}
        </ChartFrame>
      )
    case 'FreshnessLabel': {
      if (!compiled.compiledQuery.resolvedSelect.includes('snapshot_as_of')) return null
      const asOf = maxSnapshotAsOf(rows)
      return asOf ? <FreshnessLabel asOf={asOf} /> : null
    }
    default:
      // Registry-known but no P1 hydration branch (shouldn't happen — every "live" primitive
      // that reaches here has a case above; CutToggle/stubs never reach ReadyPrimitive).
      return null
  }
}
