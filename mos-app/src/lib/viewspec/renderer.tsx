/* eslint-disable react-refresh/only-export-components -- this module intentionally exports
   the compiler re-export + buildCompilerContext/RenderError alongside the components (mirrors
   I18nProvider.tsx's context+hook pattern); splitting it would fragment the render boundary. */
// UserViewRenderer — the trusted renderer (ADR-0017 D5). Adapted from the sibling internal
// project's renderer boundary. Compiles the spec through compileCompositionSpec on every
// render, executes each CompiledQuery under the viewer's own JWT, and hydrates the registered
// primitive. Degrades to an error state on ValidationError (never crash, never render
// unvalidated); a stub primitive degrades to a "planned" placeholder; a per-panel executor
// error degrades only that panel.
import { useEffect, useState } from 'react'
import { compileCompositionSpec } from './compiler'
import { executeCompiledQuery } from './executor'
import { registry } from './registry'
import { ValidationError } from './types'
import type { CompiledPanel, CompilerContext, CompositionSpec } from './types'
import { useT } from '@/i18n/use-t'

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
  | { kind: 'ready'; data: unknown[] }

function useCompiledPanels(spec: CompositionSpec, ctx: CompilerContext) {
  const [panels, setPanels] = useState<CompiledPanel[] | null>(null)
  const [compileErr, setCompileErr] = useState<RenderError | null>(null)

  useEffect(() => {
    try {
      setPanels(compileCompositionSpec(spec, ctx))
      setCompileErr(null)
    } catch (e) {
      const code = e instanceof ValidationError ? e.code : 'COMPILE_ERROR'
      const detail = e instanceof Error ? e.message : String(e)
      setPanels(null)
      setCompileErr(new RenderError(code, detail))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec, ctx.personId, ctx.orgId])

  return { panels, compileErr }
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
  if (!panels) {
    return (
      <section className="uv-render uv-render--loading" aria-busy="true">
        {t('views.render.loading')}
      </section>
    )
  }
  return (
    <section className="uv-render" aria-label={t('views.render.aria')}>
      {panels.map((p) => <PanelHost key={p.id} compiled={p} />)}
    </section>
  )
}

function PanelHost({ compiled }: { compiled: CompiledPanel }) {
  const t = useT()
  const desc = registry.get(compiled.primitive)
  const [state, setState] = useState<PanelState>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    // Stub primitives never execute — degrade straight to the planned placeholder
    // (ADR-0017 D5 philosophy: known-to-the-registry but not-yet-hydratable).
    if (desc?.status === 'stub') {
      setState({ kind: 'stub', name: compiled.primitive })
      return
    }
    executeCompiledQuery(compiled.compiledQuery)
      .then((data) => { if (!cancelled) setState({ kind: 'ready', data }) })
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
  // READY — hydrate the live primitive. P1 ships the compile→execute→hydrate loop proof
  // (primitive name + row count); full per-primitive data-binding is a thin additive layer
  // that lands with the polished builder issue (plan §5 Task H1 note).
  return (
    <div className="uv-panel uv-panel--ready" data-testid={`uv-panel-${compiled.primitive}`}>
      <p className="uv-panel__name">{compiled.primitive}</p>
      <p className="uv-panel__rows" data-testid="uv-panel-row-count">{t('views.panel.rows', { n: state.data.length })}</p>
    </div>
  )
}
