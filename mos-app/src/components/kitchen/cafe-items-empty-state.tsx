// Diagnoses missing ESB items, missing stream setup, and stock-unit eligibility for Café lists.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, LoadingShell } from '@/components/ui/state-kit'
import { canManageCafeItemSettings, listCafeItemSettings, toCafeLogItem } from '@/lib/db/cafe-item-settings'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'
import { streamLabel } from '@/lib/kitchen-action-label'
import { useT } from '@/i18n/use-t'
import './cafe-items-empty-state.css'

export interface CafeItemsEmptyStateProps {
  stream: ProductionStream
  /** How many ESB items the stream lists, when the page already read its settings; otherwise read here. */
  esbItemCount?: number
  /** The viewer's manage right when the page already knows it; otherwise it is checked here. */
  canManage?: boolean
  /** The list requires a confirmed ERP stock default in addition to ordinary item setup. */
  requiresStockUnit?: boolean
}

type Diagnosis =
  | { kind: 'loading' }
  | { kind: 'unknown' }
  | { kind: 'ready'; count: number; setupCount: number; canManage: boolean }

export function CafeItemsEmptyState({ stream, esbItemCount, canManage, requiresStockUnit = false }: CafeItemsEmptyStateProps) {
  const t = useT()
  const [diagnosis, setDiagnosis] = useState<Diagnosis>({ kind: 'loading' })

  useEffect(() => {
    let live = true
    setDiagnosis({ kind: 'loading' })
    const countRead = esbItemCount !== undefined && !requiresStockUnit
      ? Promise.resolve({ count: esbItemCount, setupCount: 0 })
      : listCafeItemSettings(stream).then(rows => ({
        count: rows.length,
        setupCount: requiresStockUnit ? rows.filter(item => toCafeLogItem(item) !== null).length : 0,
      }))
    // Without ESB items there is nothing to set up, so the manage right is not asked for.
    void countRead.then(
      async ({ count, setupCount }) => {
        const manage = count === 0 || canManage !== undefined
          ? canManage === true
          : await canManageCafeItemSettings(stream.activity).catch(() => false)
        if (live) setDiagnosis({ kind: 'ready', count, setupCount, canManage: manage })
      },
      () => { if (live) setDiagnosis({ kind: 'unknown' }) },
    )
    return () => { live = false }
  }, [stream, esbItemCount, canManage, requiresStockUnit])

  const label = streamLabel(t, stream)
  if (diagnosis.kind === 'loading') return <LoadingShell count={1} />
  if (diagnosis.kind === 'unknown') {
    return (
      <EmptyState
        className="cie"
        variant="blank"
        title={t('cafe.itemsEmpty.unknown.title', { stream: label })}
        copy={t('cafe.itemsEmpty.unknown.copy')}
      />
    )
  }
  if (diagnosis.count === 0) {
    return (
      <EmptyState
        className="cie"
        variant="blank"
        title={t('cafe.itemsEmpty.noEsb.title', { stream: label })}
        copy={t('cafe.itemsEmpty.noEsb.copy')}
      />
    )
  }
  if (requiresStockUnit && diagnosis.setupCount > 0) {
    return (
      <EmptyState
        className="cie"
        variant="blank"
        title={t('cafe.itemsEmpty.stockUnit.title', { stream: label })}
        copy={t(diagnosis.setupCount === 1 ? 'cafe.itemsEmpty.stockUnit.one' : 'cafe.itemsEmpty.stockUnit.other', {
          count: diagnosis.setupCount,
          manager: t(stream.activity === 'bar' ? 'cafe.itemsEmpty.manager.bar' : 'cafe.itemsEmpty.manager.kitchen'),
        })}
      />
    )
  }
  const one = diagnosis.count === 1
  if (diagnosis.canManage) {
    return (
      <EmptyState
        className="cie"
        variant="next-step"
        title={t('cafe.itemsEmpty.setup.title', { stream: label })}
        copy={t(one ? 'cafe.itemsEmpty.setup.manage.one' : 'cafe.itemsEmpty.setup.manage.other', { count: diagnosis.count })}
      >
        <Link to="/cafe/items" className="btn btn-outline btn-touch">{t('cafe.itemsEmpty.action')}</Link>
      </EmptyState>
    )
  }
  return (
    <EmptyState
      className="cie"
      variant="blank"
      title={t('cafe.itemsEmpty.setup.title', { stream: label })}
      copy={t(one ? 'cafe.itemsEmpty.setup.ask.one' : 'cafe.itemsEmpty.setup.ask.other', {
        count: diagnosis.count,
        manager: t(stream.activity === 'bar' ? 'cafe.itemsEmpty.manager.bar' : 'cafe.itemsEmpty.manager.kitchen'),
      })}
    />
  )
}
