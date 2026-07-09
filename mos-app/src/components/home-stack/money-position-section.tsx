// MoneyPositionSection — the scoped money-position container for a Home cockpit section
// (Issue E, docs/specs/home-stacked-union.spec.md §2.5/§9). A reusable CONTAINER designed as a slot
// for parallel slices to drop tiles into — NOT a tile rewrite.
//
//  • Company scope (owner-cockpit): renders the EXISTING revenue/margin tiles (reused verbatim via
//    useCompanyFinanceKpis, finance/admin-gated — never a misleading zero) + an AR slot + an
//    AP/unbilled/unearned placeholder strip.
//  • BU scope (function-cockpit): renders a BU-scoped money slot (placeholder — the parallel money
//    slice fills it) + the AR slot. It does NOT render the whole-company tiles — that would violate
//    visibility direction (§3.6: a BU-head sees only their BU's money).
//
// AR slot: a clearly-marked, self-contained drop point (data-money-ar-slot) for the parallel
// AR/Follow-up slice. Placeholder copy now — NO invented AR figure this slice.
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { formatIDRCompact } from '@/lib/sales-dashboard'
import { useCompanyFinanceKpis } from '@/lib/use-company-finance-kpis'
import { KPITile } from '@/components/dashboard/kpi-tile'
import { DataProvenanceNote } from '@/components/ui/data-provenance-note'

export type MoneyScope = { kind: 'company' } | { kind: 'bu'; buName: string }

interface MoneyPositionSectionProps {
  scope: MoneyScope
  /** company-scope tiles render only when the viewer holds finance/admin (RLS is the hard boundary) */
  canSeeFinance: boolean
}

export function MoneyPositionSection({ scope, canSeeFinance }: MoneyPositionSectionProps) {
  const t = useT()
  const title =
    scope.kind === 'company' ? t('home.stack.money.title') : t('home.stack.money.buTitle', { bu: scope.buName })

  return (
    <div className="home-stack-subsection" aria-label={title}>
      <h3 className="home-stack-subsection-title">{title}</h3>

      {scope.kind === 'company' ? (
        <CompanyMoneyTiles canSeeFinance={canSeeFinance} />
      ) : (
        <BuMoneySlot buName={scope.buName} />
      )}

      {/* AR tile slot — a self-contained drop point for the parallel AR/Follow-up slice.
          Placeholder copy now; NO invented AR figure (anchor A4: no dead-end number). */}
      <div className="home-stack-slot" data-money-ar-slot aria-label={t('home.stack.money.arSlot')}>
        <span className="home-stack-slot-label">{t('home.stack.money.arSlot')}</span>
      </div>

      {/* AP · unbilled · unearned — visibility + drill phased later (placeholder, not a dead-end). */}
      <div className="home-stack-slot home-stack-slot--muted" aria-label={t('home.stack.money.apStrip')}>
        <span className="home-stack-slot-label">{t('home.stack.money.apStrip')}</span>
      </div>
    </div>
  )
}

// ── Company scope: the existing revenue/margin tiles (reused) ────────────────
function CompanyMoneyTiles({ canSeeFinance }: { canSeeFinance: boolean }) {
  const t = useT()
  const {
    revenueState,
    revenueWindow,
    revenueDelta,
    marginState,
    marginDisplay,
    snapshotAsOf,
  } = useCompanyFinanceKpis(canSeeFinance)

  // A company-scope viewer without finance/admin sees no whole-company tiles (no misleading zero).
  if (!canSeeFinance) return null

  return (
    <>
      <div className="home-kpi-grid" role="group" aria-label="Sales KPIs">
        <Link to="/dashboard" className="home-kpi-link">
          <KPITile
            label={t('home.kpi.revenue')}
            value={
              revenueState === 'ready' && revenueWindow
                ? formatIDRCompact(revenueWindow.current)
                : '—'
            }
            delta={
              revenueState === 'ready' && revenueDelta
                ? { text: revenueDelta.text, tone: revenueDelta.tone }
                : undefined
            }
            state={revenueState === 'loading' ? 'loading' : 'ready'}
          />
        </Link>
        <Link to="/dashboard" className="home-kpi-link">
          <KPITile
            label={t('home.kpi.margin')}
            value={marginState === 'ready' && marginDisplay ? marginDisplay.value : '—'}
            delta={
              marginState === 'ready' && marginDisplay
                ? { text: marginDisplay.delta.text, tone: marginDisplay.delta.tone }
                : undefined
            }
            sub={marginState === 'ready' && marginDisplay ? marginDisplay.pctSub : undefined}
            state={marginState === 'loading' ? 'loading' : 'ready'}
          />
        </Link>
      </div>
      {(snapshotAsOf || (revenueState !== 'loading' && marginState !== 'loading')) && (
        <DataProvenanceNote
          kind="snapshot"
          hasData={Boolean(revenueWindow || marginDisplay)}
          asOf={snapshotAsOf}
        />
      )}
    </>
  )
}

// ── BU scope: a BU-scoped money slot (placeholder; parallel money slice fills it) ──
function BuMoneySlot({ buName }: { buName: string }) {
  const t = useT()
  return (
    <SlotShell>
      <span className="home-stack-slot-label">{t('home.stack.money.buComing', { bu: buName })}</span>
    </SlotShell>
  )
}

// Tiny shared slot shell (a quiet bordered box) — keeps AR/AP/BU placeholders consistent + drillable.
export function SlotShell({ children }: { children: ReactNode }) {
  return <div className="home-stack-slot home-stack-slot--placeholder">{children}</div>
}
