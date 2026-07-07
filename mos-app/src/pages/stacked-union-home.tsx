// StackedUnionHome — the `/` route when SHOW_HOME_STACKED is on (Issue E,
// docs/specs/home-stacked-union.spec.md). Home composes the UNION of the role-scopes the viewer holds
// as ONE scrollable surface, widest-scope-first (owner-cockpit → function-cockpit(s) → my-week |
// capture-first). NOT a toggle, NOT a separate login. Reuses the existing tiles + My Week panel — the
// composition is the new layer.
//
// Role-scope detection is pure (src/lib/home-stack.ts). This page fetches the role tree + BUs (shared
// schema, org-readable), reads the viewer, derives the ordered sections, and renders them. Money is
// BU-scoped (§3.6): a BU-head's function-cockpit shows the BU money slot, never whole-company tiles;
// a member gets no cockpit ⇒ no finance section. Every tile drills (anchor A4).
import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { PageFrame } from '@/shell/page-frame'
import { PageHead } from '@/shell/page-head'
import { useDocumentTitle } from '@/shell/use-document-title'
import { getBusinessUnits, getRoles } from '@/lib/db/directory'
import type { BusinessUnitOption, RoleScopeRow } from '@/lib/db/directory'
import { deriveHomeStack, type HomeSection } from '@/lib/home-stack'
import { MoneyPositionSection } from '@/components/home-stack/money-position-section'
import { OpsKpiSection } from '@/components/home-stack/ops-kpi-section'
import { CaptureFirstSection } from '@/components/home-stack/capture-first-section'
import { MyWeekPanel } from '@/components/weekly/my-week-panel'
import './stacked-union-home.css'

type LoadState = 'loading' | 'ready' | 'error'

export function StackedUnionHome() {
  useDocumentTitle('Home — Gordi MOS')
  const t = useT()
  const auth = useAuth()
  const viewer = auth.status === 'authenticated' ? auth.viewer : null
  const personId = viewer?.person?.id ?? null
  const accessRoles = viewer?.accessRoles ?? []
  const canSeeFinance = accessRoles.includes('finance') || accessRoles.includes('admin')
  const now = useMemo(() => new Date(), [])

  // ── Fetch the role tree + BUs (shared schema, org-readable) for role-scope detection ──
  const [allRoles, setAllRoles] = useState<RoleScopeRow[]>([])
  const [businessUnits, setBusinessUnits] = useState<BusinessUnitOption[]>([])
  const [dirState, setDirState] = useState<LoadState>('loading')

  useEffect(() => {
    let cancelled = false
    setDirState('loading')
    Promise.all([getRoles(), getBusinessUnits()])
      .then(([roles, bus]) => {
        if (cancelled) return
        setAllRoles(roles)
        setBusinessUnits(bus)
        setDirState('ready')
      })
      .catch(() => {
        if (!cancelled) setDirState('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  // ── Derive the ordered stacked sections (pure) ────────────────────────────
  const sections: HomeSection[] =
    dirState === 'ready' && viewer
      ? deriveHomeStack({
          viewerRoles: viewer.roles.map((r) => ({
            id: r.id,
            business_unit_id: r.business_unit_id,
            reports_to_role_id: r.reports_to_role_id,
          })),
          allRoles,
          isManager: viewer.isManager,
          accessRoles,
          businessUnits,
        })
      : []

  return (
    <PageFrame surfaceWash>
      <PageHead title={t('home.title')} subtitle={t('home.subtitle')} />

      {dirState === 'error' && (
        <div className="home-stack-error" role="alert">
          {t('home.stack.error')}
        </div>
      )}

      {/* The stacked union — widest-scope-first. While the directory loads, sections is empty
          (the PageHead renders so the surface is never blank). */}
      {sections.map((section, i) => (
        <SectionView
          key={sectionKey(section, i)}
          section={section}
          canSeeFinance={canSeeFinance}
          personId={personId}
          now={now}
        />
      ))}
    </PageFrame>
  )
}

function sectionKey(section: HomeSection, i: number): string {
  switch (section.kind) {
    case 'owner-cockpit':
      return 'owner'
    case 'function-cockpit':
      return `fn-${section.buId}`
    case 'my-week':
      return 'my-week'
    case 'capture-first':
      return 'capture'
  }
  return `sec-${i}`
}

interface SectionViewProps {
  section: HomeSection
  canSeeFinance: boolean
  personId: string | null
  now: Date
}

function SectionView({ section, canSeeFinance, personId, now }: SectionViewProps) {
  const t = useT()

  if (section.kind === 'owner-cockpit') {
    return (
      <section className="home-stack-section" aria-labelledby="home-stack-owner-heading">
        <div className="home-stack-section-head">
          <h2 id="home-stack-owner-heading" className="home-stack-section-title">
            {t('home.stack.owner.title')}
          </h2>
          <p className="home-stack-section-subtitle">{t('home.stack.owner.subtitle')}</p>
        </div>
        <MoneyPositionSection scope={{ kind: 'company' }} canSeeFinance={canSeeFinance} />
        <OpsKpiSection />
        <CascadeDrill />
      </section>
    )
  }

  if (section.kind === 'function-cockpit') {
    return (
      <section className="home-stack-section" aria-labelledby={`home-stack-fn-${section.buId}-heading`}>
        <div className="home-stack-section-head">
          <h2 id={`home-stack-fn-${section.buId}-heading`} className="home-stack-section-title">
            {t('home.stack.function.title', { bu: section.buName })}
          </h2>
          <p className="home-stack-section-subtitle">{t('home.stack.function.subtitle')}</p>
        </div>
        <MoneyPositionSection scope={{ kind: 'bu', buName: section.buName }} canSeeFinance={canSeeFinance} />
        <OpsKpiSection />
        <CascadeDrill />
      </section>
    )
  }

  if (section.kind === 'my-week') {
    return (
      <section className="home-stack-section" aria-labelledby="home-stack-myweek-heading">
        <div className="home-stack-section-head">
          <h2 id="home-stack-myweek-heading" className="home-stack-section-title">
            {t('home.stack.myweek.title')}
          </h2>
        </div>
        <MyWeekPanel />
      </section>
    )
  }

  // capture-first
  if (!personId) return null
  return <CaptureFirstSection viewerId={personId} now={now} />
}

// Cascade drill — a one-line reuse of the existing /work/cascade destination (no aggregation built
// this slice; tasks/cascade are org-readable so a BU-head drilling there is in-model).
function CascadeDrill() {
  const t = useT()
  return (
    <div className="home-stack-cascade-drill">
      <Link to="/work/cascade">{t('home.stack.cascade.drill')} →</Link>
    </div>
  )
}
