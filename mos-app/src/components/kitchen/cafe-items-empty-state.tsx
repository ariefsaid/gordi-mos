// The one empty state for every Café item list (OD-2026-10-06-ESB-ITEMS, audit F02). It names the
// real cause from the stream's ESB settings: no ESB items at all (added in ESB first, nothing to do in
// MOS), or ESB items that are not set up for this list. Only a person who can manage this activity's
// items gets the action to Café items; everyone else is told who can.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, LoadingShell } from '@/components/ui/state-kit'
import { canManageCafeItemSettings, listCafeItemSettings } from '@/lib/db/cafe-item-settings'
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
}

type Diagnosis =
  | { kind: 'loading' }
  | { kind: 'unknown' }
  | { kind: 'ready'; count: number; canManage: boolean }

export function CafeItemsEmptyState({ stream, esbItemCount, canManage }: CafeItemsEmptyStateProps) {
  const t = useT()
  const [diagnosis, setDiagnosis] = useState<Diagnosis>({ kind: 'loading' })

  useEffect(() => {
    let live = true
    setDiagnosis({ kind: 'loading' })
    const countRead = esbItemCount !== undefined
      ? Promise.resolve(esbItemCount)
      : listCafeItemSettings(stream).then(rows => rows.length)
    // Without ESB items there is nothing to set up, so the manage right is not asked for.
    void countRead.then(
      async count => {
        const manage = count === 0 || canManage !== undefined
          ? canManage === true
          : await canManageCafeItemSettings(stream.activity).catch(() => false)
        if (live) setDiagnosis({ kind: 'ready', count, canManage: manage })
      },
      () => { if (live) setDiagnosis({ kind: 'unknown' }) },
    )
    return () => { live = false }
  }, [stream, esbItemCount, canManage])

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
