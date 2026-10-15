// Admin › Modules (PREVIEW — ship state `preview`, dev launch only; see lib/ship-gate.ts). Org level only:
// each module's real release status and the Org on/off. Per-person access lives on the person
// (People › a person › Modules). Persisted Org settings do not exist yet, so they are never shown as
// fetched values ("— · Not connected"). Preview settings is an isolated in-memory model; Save stays
// disabled and nothing reaches the shell. Contract: R/handover/module-switches.md.
import { useMemo } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { AdminSettingsNav } from '@/components/admin/admin-settings-nav'
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table'
import { PreviewBadge } from '@/components/preview/preview-badge'
import { ActionBar } from '@/components/ui/action-bar'
import { Button } from '@/components/ui/button'
import { FilterChip } from '@/components/ui/filter-chip'
import { Notice } from '@/components/ui/notice'
import { Pill } from '@/components/ui/pill'
import { SearchField } from '@/components/ui/search-field'
import { Select } from '@/components/ui/select'
import { EmptyState } from '@/components/ui/state-kit'
import { useT } from '@/i18n/use-t'
import { moduleFacts, peopleWithOverridesPath, previewOrgEnabled, previewPeopleWithOverride, type ModuleFact, type ModuleId, type PreviewModel } from '@/lib/module-switches-preview'
import { useModulePreview } from '@/lib/use-module-switches-preview'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useIsOffline } from '@/shell/use-is-offline'
import './admin-modules-page.css'

export function AdminModulesPage() {
  const t = useT()
  useDocumentTitle(t('common.docTitle', { page: t('admin.modules.title') }))
  const isDesktop = useIsDesktop()
  const offline = useIsOffline()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const { model, open, leave, setOrg } = useModulePreview()
  const preview = model !== null
  const facts = useMemo(() => moduleFacts(), [])
  const reason = t('admin.modules.notConnected')

  // Links from before Modules had its own page (…/access/modules?view=people&person=<id>) land on that person.
  const legacyPerson = params.get('person')
  if (legacyPerson) return <Navigate to={`/admin/people/${encodeURIComponent(legacyPerson)}`} replace />

  const needle = q.trim().toLowerCase()
  const visibleFacts = facts.filter((fact) => !needle || t(fact.labelKey).toLowerCase().includes(needle))
  const setQuery = (value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set('q', value); else next.delete('q')
    setParams(next, { replace: true })
  }

  const orgColumns: DataTableColumn<ModuleFact & { id: string }>[] = [
    { key: 'module', header: t('admin.modules.col.module'), sortState: 'asc', render: (fact) => <strong className="modules__name">{t(fact.labelKey)}</strong> },
    { key: 'release', header: t('admin.modules.col.release'), render: (fact) => <ReleasePill fact={fact} /> },
    { key: 'availability', header: t('admin.modules.col.availability'), render: (fact) => <OrgState fact={fact} preview={model} /> },
    { key: 'overrides', header: t('admin.modules.col.overrides'), render: (fact) => <OverridesLink fact={fact} preview={model} /> },
    { key: 'actions', header: t('admin.modules.col.actions'), render: (fact) => <OrgControl fact={fact} preview={model} setOrg={setOrg} /> },
  ]

  return (
    <PageFamilyFrame family="management" title={t('admin.modules.title')} jobSentence={t('admin.modules.job')}>
      <AdminSettingsNav />
      <div className="modules">
        <Notice tone="info" role="none">{t('admin.modules.notConnected')}</Notice>
        <div className="modules__scope">
          <span className="modules__scope-label">{t('admin.modules.scope')}</span>
          <span className="modules__scope-value">{t('admin.modules.scope.org')}</span>
          {preview
            ? <><PreviewBadge /><Button variant="outline" onClick={leave}>{t('admin.modules.leavePreview')}</Button></>
            : <Button variant="outline" onClick={open}>{t('admin.modules.openPreview')}</Button>}
        </div>
        {preview && <p className="modules__hint">{t('admin.modules.previewHint')}</p>}
        {offline && <Notice tone="attention">{t('common.offline.reconnect')}</Notice>}
        <div className="modules__toolbar">
          <SearchField
            label={t('admin.modules.searchModules')}
            placeholder={t('admin.modules.searchModulesHint')}
            value={q}
            onChange={setQuery}
          />
          <span className="modules__count tabular" role="status">{t(visibleFacts.length === 1 ? 'admin.modules.count.one' : 'admin.modules.count.other', { count: visibleFacts.length })}</span>
        </div>
        {q && (
          <div className="modules__chips">
            <FilterChip label={`${t('admin.modules.searchModules')}: ${q}`} onRemove={() => setQuery('')} />
          </div>
        )}
        {visibleFacts.length === 0 ? (
          <EmptyState variant="blank" title={t('admin.modules.noMatchModules')}><Button onClick={() => setQuery('')}>{t('common.clearFilters')}</Button></EmptyState>
        ) : (
          <>
            <div className="record-collection-view">
              <DataTable<ModuleFact & { id: string }>
                columns={orgColumns}
                rows={visibleFacts.map((fact) => ({ ...fact }))}
                isDesktop={isDesktop}
                caption={t('admin.modules.orgTable')}
                tableClassName="record-collection-table collection-grammar-table modules__table"
                renderCard={(fact) => (
                  <div className="modules__card">
                    <div className="modules__card-head"><strong className="modules__name">{t(fact.labelKey)}</strong><ReleasePill fact={fact} /></div>
                    <OrgState fact={fact} preview={model} />
                    <OrgControl fact={fact} preview={model} setOrg={setOrg} />
                    <div className="modules__card-overrides">
                      <span className="modules__muted">{t('admin.modules.col.overrides')}</span>
                      <OverridesLink fact={fact} preview={model} />
                    </div>
                  </div>
                )}
              />
            </div>
            <ActionBar
              className="modules__actions"
              reason={reason}
              primary={<Button variant="primary" disabled>{t('admin.modules.saveOrg')}</Button>}
              aria-label={t('admin.modules.saveOrg')}
            />
          </>
        )}
      </div>
    </PageFamilyFrame>
  )
}

/** "— · Not connected": the dash is drawn by CSS so it reads as one short word to a screen reader and is not body-copy punctuation. */
function NotConnected() {
  const t = useT()
  return <span className="modules__nc modules__muted">{t('admin.modules.notConnectedShort')}</span>
}

function ReleasePill({ fact }: { fact: ModuleFact }) {
  const t = useT()
  return fact.released ? <Pill tone="success">{t('admin.modules.released')}</Pill> : <Pill tone="neutral">{t('admin.modules.notReleased')}</Pill>
}

/** What the Org setting is right now: unreleased modules say so; otherwise nothing is fetched, so it is "— · Not connected". */
function OrgState({ fact, preview }: { fact: ModuleFact; preview: PreviewModel | null }) {
  const t = useT()
  if (!fact.released) return <span className="modules__muted">{t('admin.modules.cannotEnable')}</span>
  if (!preview) return <NotConnected />
  return <span>{previewOrgEnabled(preview, fact.id) ? t('admin.modules.on') : t('admin.modules.off')}</span>
}

/** "People with personal overrides": the count is unavailable until the backend exists ("—"); links into People filtered to this module. */
function OverridesLink({ fact, preview }: { fact: ModuleFact; preview: PreviewModel | null }) {
  const t = useT()
  if (!fact.released) {
    return <span className="modules__muted"><span aria-hidden="true">—</span><span className="sr-only">{t('admin.modules.notReleased')}</span></span>
  }
  const count = preview ? previewPeopleWithOverride(preview, fact.id) : null
  const module = t(fact.labelKey)
  return (
    <Link className="modules__open" to={peopleWithOverridesPath(fact.id)}>
      <span className="tabular">{count ?? '—'}</span>
      <span className="modules__open-hint">{t('admin.modules.viewPeople')}</span>
      {/* The visible words stay inside the link's name; the module and the missing count follow for a screen reader. */}
      <span className="sr-only">{t(count === null ? 'admin.modules.overridesUnknown' : 'admin.modules.overridesFor', { module })}</span>
    </Link>
  )
}

/** One module's On/Off Select. Live only inside the in-memory preview; disabled and empty otherwise (no fetched default is shown). */
function OrgControl({ fact, preview, setOrg }: { fact: ModuleFact; preview: PreviewModel | null; setOrg: (id: ModuleId, enabled: boolean) => void }) {
  const t = useT()
  const label = t('admin.modules.availabilityOf', { module: t(fact.labelKey) })
  if (!preview || !fact.released) {
    return (
      <div className="modules__cell">
        <Select aria-label={label} value={fact.released ? '' : 'off'} disabled fullWidth>
          {fact.released ? <option value="">—</option> : <option value="off">{t('admin.modules.off')}</option>}
        </Select>
      </div>
    )
  }
  const enabled = previewOrgEnabled(preview, fact.id)
  return (
    <div className="modules__cell">
      <Select aria-label={label} value={enabled ? 'on' : 'off'} fullWidth onChange={(e) => setOrg(fact.id, e.target.value === 'on')}>
        <option value="on">{t('admin.modules.on')}</option>
        <option value="off">{t('admin.modules.off')}</option>
      </Select>
      {!enabled && <span className="modules__muted">{t('admin.modules.offConsequence')}</span>}
    </div>
  )
}
