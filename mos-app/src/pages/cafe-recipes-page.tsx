import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { CafePageFrame } from '@/components/kitchen/cafe-page-frame'
import { CafeQueueEmpty } from '@/components/cafe/redesign/cafe-queue-empty'
import { CafeRecipeDetail } from '@/components/kitchen/cafe-recipe-detail'
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table'
import { KitchenToolbar } from '@/components/kitchen/kitchen-toolbar'
import { EsbStatusBadge } from '@/components/kitchen/esb-status-badge'
import { useRecipeTypeLabel } from '@/components/kitchen/use-recipe-type-label'
import { RecipeVisibilityPreview } from '@/components/kitchen/recipe-visibility-preview'
import { Checkbox } from '@/components/ui/checkbox'
import { Pill } from '@/components/ui/pill'
import { Select } from '@/components/ui/select'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { useT } from '@/i18n/use-t'
import { useI18n } from '@/i18n/I18nProvider'
import {
  ESB_STATUS_FILTERS, RECIPE_TYPE_FILTERS, esbStatus, filterRecipes, latestRecipes, recipeKey, recipeName, recipeType, searchRecipes,
  type EsbStatusFilter, type RecipeTypeFilter, type RecipeVersion, type RecipeWipBomIds,
} from '@/lib/cafe-recipes'
import { listRecipeVersions, listRecipeWipBomIds } from '@/lib/db/cafe-recipes'
import { kitchenDataTableGroups, toKitchenListRows, useKitchenItemTable } from '@/lib/kitchen-item-list'
import { useCanHideRecipes, useRecipeVisibilityPreview } from '@/lib/recipe-visibility-preview'
import { formatDayMonthYear, formatWibShortDateTime } from '@/lib/format/date'
import { useIsWide } from '@/shell/use-is-wide'
import '@/components/record-collection/record-collection.css'
import '@/components/kitchen/cafe-recipes.css'
import '@/components/kitchen/cafe-setup-workspace.css'

const PAGE_SIZE = 50
const NO_BOMS: RecipeWipBomIds = new Set()
const NO_HIDDEN: ReadonlySet<string> = new Set()
/** URL values (`?type=`); the filter values are the capitalised words. Active status = no `?status=` key, All types = no `?type=` key. */
const TYPE_PARAM: Record<Exclude<RecipeTypeFilter, 'All'>, string> = { Menu: 'menu', Wip: 'wip' }
const STATUS_LABEL = { Active: 'cafe.items.active', Inactive: 'cafe.items.inactive', Removed: 'cafe.recipes.status.removed', All: 'kitchen.filter.active.all' } as const
const TYPE_LABEL = { Menu: 'cafe.recipes.type.menu', Wip: 'cafe.recipes.type.wip', All: 'cafe.recipes.type.all' } as const

export function CafeRecipesPage() {
  const auth = useAuth()
  return <RecipesForViewer key={auth.status === 'authenticated' ? auth.viewer.person.id : auth.status} />
}

function RecipesForViewer() {
  const t = useT()
  const { locale } = useI18n()
  const isWide = useIsWide()
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const selected = params.get('recipe')
  // Old `?status=Active|Inactive|All` links keep their meaning; anything else is the default, Active.
  const statusParam = params.get('status')
  const statusFilter: EsbStatusFilter = ESB_STATUS_FILTERS.includes(statusParam as EsbStatusFilter) ? statusParam as EsbStatusFilter : 'Active'
  const typeParam = params.get('type')
  const typeFilter: RecipeTypeFilter = RECIPE_TYPE_FILTERS.find(value => value !== 'All' && TYPE_PARAM[value] === typeParam) ?? 'All'
  const previewOn = useRecipeVisibilityPreview()
  const canHide = useCanHideRecipes(previewOn)
  const hideInMos = previewOn && canHide
  // Preview only: the choice lives in this page's memory (nothing is stored), so a reload brings every recipe back.
  const [hidden, setHidden] = useState<ReadonlySet<string>>(NO_HIDDEN)
  const showHidden = hideInMos && params.get('hidden') === '1'
  const typeLabel = useRecipeTypeLabel()
  const [versions, setVersions] = useState<RecipeVersion[]>()
  const [wipBomIds, setWipBomIds] = useState<RecipeWipBomIds>(NO_BOMS)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  const detailRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLElement>(null)
  const links = useRef(new Map<string, HTMLAnchorElement>())
  const lastOpened = useRef<string | null>(null)
  useEffect(() => {
    let active = true
    void (async () => {
      const rows = await listRecipeVersions()
      // MOS items built from a BOM only matter for recipes whose ESB copy sends no type. A failed read leaves their type Unknown.
      const needBoms = latestRecipes(rows).some(row => row.bom_id != null && !row.recipe.bom_type?.trim())
      const boms = needBoms ? await listRecipeWipBomIds().catch(() => NO_BOMS) : NO_BOMS
      if (active) { setWipBomIds(boms); setVersions(rows); setError(false) }
    })().catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [retry])
  useEffect(() => {
    if (!versions) return
    if (selected) { lastOpened.current = selected; detailRef.current?.focus() }
    else if (lastOpened.current) {
      const opener = links.current.get(lastOpened.current)
      if (opener) opener.focus()
      else listRef.current?.focus()
    }
  }, [selected, versions])
  const latest = useMemo(() => latestRecipes(versions ?? []), [versions])
  // Freshness of the nightly ESB copy: the newest observation time MOS holds, or an honest dash.
  const lastCopy = useMemo(() => (versions ?? []).reduce<string | null>((newest, row) => {
    const at = row.source_observed_at
    return at && (!newest || at > newest) ? at : newest
  }, null), [versions])
  const freshness = lastCopy ? t('cafe.recipes.syncedAt', { time: formatWibShortDateTime(lastCopy, locale) }) : t('cafe.recipes.syncedNone')
  const statusOf = useMemo(() => new Map(latest.map(row => [recipeKey(row), esbStatus(row)])), [latest])
  const typeOf = useMemo(() => new Map(latest.map(row => [recipeKey(row), recipeType(row, wipBomIds)])), [latest, wipBomIds])
  const rows = useMemo(() => toKitchenListRows(searchRecipes(filterRecipes(latest, {
    status: statusFilter, type: typeFilter, wipBomIds, ...(hideInMos ? { hidden, showHidden } : {}),
  }), query), {
    kind: 'Unclassified', getId: recipeKey, getName: recipeName,
    getCategory: () => null, getGroupKey: () => 'all',
  }), [latest, wipBomIds, query, statusFilter, typeFilter, hideInMos, hidden, showHidden])
  const sorting = useMemo(() => [{ id: 'itemName', desc: false }], [])
  const table = useKitchenItemTable({ data: rows, search: '', kind: 'All', category: 'All', sorting })
  // TanStack queues its auto-reset on the first read of the grouped model; reading it before the page has
  // committed (while the recipes are still loading) is what logged a state update on an unmounted component.
  const filtered = versions ? kitchenDataTableGroups(table, () => null).flatMap(group => group.rows) : []
  const maxPage = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const page = Math.min(maxPage, Math.max(1, Math.floor(Number(params.get('page'))) || 1))
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const href = (update: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(update)) { if (value === null) next.delete(key); else next.set(key, value) }
    return { pathname: '/cafe/recipes', search: next.toString() }
  }
  // A search or filter change always returns to the first page; each filter stays in the URL (its default = no key).
  const setList = (update: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(update)) { if (value === null) next.delete(key); else next.set(key, value) }
    next.delete('page')
    setParams(next, { replace: true })
  }
  const columns: DataTableColumn<RecipeVersion>[] = [
    { key: 'name', header: t('cafe.recipes.output'), sortState: 'asc' as const, render: row => <Link
      ref={node => { if (node) links.current.set(recipeKey(row), node); else links.current.delete(recipeKey(row)) }}
      className="cafe-recipes__open" to={href({ recipe: recipeKey(row) })}
    >{recipeName(row) || t('cafe.recipes.unnamed')}</Link> },
    { key: 'status', header: t('cafe.recipes.esbStatus'), render: row => <EsbStatusBadge status={statusOf.get(recipeKey(row)) ?? 'unknown'} /> },
    { key: 'type', header: t('cafe.recipes.type'), render: row => typeLabel(typeOf.get(recipeKey(row)) ?? 'unknown') },
    ...(hideInMos ? [{ key: 'inMos', header: t('cafe.recipes.inMos'), render: (row: RecipeVersion) => hidden.has(recipeKey(row)) ? <Pill tone="neutral" dot={false}>{t('cafe.recipes.inMos.hidden')}</Pill> : t('cafe.recipes.inMos.shown') }] : []),
    // With a recipe open beside the list the list keeps only what identifies and sorts a recipe; the rest is in the record.
    ...(!selected && latest.some(row => row.recipe.branch_codes?.length) ? [{ key: 'scope', header: t('cafe.recipes.scope'), render: (row: RecipeVersion) => row.recipe.branch_codes?.join(', ') || t('cafe.recipes.scopeNotRecorded') }] : []),
    ...(selected ? [] : [
      { key: 'ingredients', header: t('cafe.recipes.ingredients'), numeric: true, render: (row: RecipeVersion) => row.recipe.lines.length },
      { key: 'changed', header: t('cafe.recipes.lastChanged'), render: (row: RecipeVersion) => <time dateTime={row.first_seen}>{formatDayMonthYear(row.first_seen, locale)}</time> },
    ]),
  ]
  return <CafePageFrame page="recipes"
    state={error ? 'error' : !versions ? 'loading' : 'default'}>
    {error ? <ErrorState message={t('cafe.recipes.loadError')} onRetry={() => { setError(false); setVersions(undefined); setRetry(retry + 1) }} />
      : !versions ? <LoadingShell count={4} label={t('cafe.recipes.loading')} />
      : latest.length === 0 && !selected ? <CafeQueueEmpty title={t('cafe.recipes.empty')}>{t('cafe.recipes.emptyBody')} {freshness}</CafeQueueEmpty>
      : <div className={`cafe-recipes__workspace cafe-setup-workspace${selected ? ' cafe-recipes__workspace--selected cafe-setup-workspace--selected' : ''}`}>
        <section ref={listRef} tabIndex={-1} className="cafe-recipes" aria-label={t('cafe.recipes.list')}>
          <p className="cafe-recipe-detail__note">{t('cafe.recipes.sourceNote')} {freshness}</p>
          <KitchenToolbar
            search={query}
            onSearchChange={value => setList({ q: value || null })}
            searchPlaceholder={t('cafe.recipes.search')}
            searchAriaLabel={t('cafe.recipes.search')}
            ariaLabel={t('cafe.recipes.filtersAria')}
            filtersPanel={{
              label: t('cafe.items.filtersPanel'),
              summary: [t(STATUS_LABEL[statusFilter]), ...(typeFilter === 'All' ? [] : [t(TYPE_LABEL[typeFilter])]), ...(showHidden ? [t('cafe.recipes.showingHidden')] : [])].join(' · '),
            }}
            countLabel={t('cafe.recipes.count', { count: filtered.length })}
            trailing={<>
              <div className="ktb-filter-selects">
                <Select id="cafe-recipes-type-filter" className="ktb-kind" label={t('cafe.recipes.type')} value={typeFilter}
                  onChange={event => setList({ type: event.target.value === 'All' ? null : TYPE_PARAM[event.target.value as Exclude<RecipeTypeFilter, 'All'>] })}>
                  {RECIPE_TYPE_FILTERS.map(value => <option key={value} value={value}>{t(TYPE_LABEL[value])}</option>)}
                </Select>
                <Select id="cafe-recipes-status-filter" className="ktb-active" label={t('cafe.recipes.esbStatus')} value={statusFilter}
                  onChange={event => setList({ status: event.target.value === 'Active' ? null : event.target.value })}>
                  {ESB_STATUS_FILTERS.map(value => <option key={value} value={value}>{t(STATUS_LABEL[value])}</option>)}
                </Select>
              </div>
              {hideInMos && <label className="cafe-recipes__show-hidden">
                <Checkbox checked={showHidden} onChange={checked => setList({ hidden: checked ? '1' : null })} />
                <span>{t('cafe.recipes.showHidden')}</span>
              </label>}
            </>}
            extraChips={[
              ...(statusFilter === 'Active' ? [] : [{ key: 'status', label: t(STATUS_LABEL[statusFilter]), clear: () => setList({ status: null }) }]),
              ...(typeFilter === 'All' ? [] : [{ key: 'type', label: t(TYPE_LABEL[typeFilter]), clear: () => setList({ type: null }) }]),
              ...(showHidden ? [{ key: 'hidden', label: t('cafe.recipes.showingHidden'), clear: () => setList({ hidden: null }) }] : []),
            ]}
            clearAllLabel={t('cafe.recipes.clearFilters')}
            onClearAll={() => setList({ status: null, type: null, hidden: null })}
          />
          {filtered.length === 0 ? <EmptyState variant="blank" title={t(query ? 'cafe.recipes.noMatches' : 'cafe.recipes.noFilterMatches')}>
            {query && <Link className="btn btn-outline" to={href({ q: null, page: null })}>{t('cafe.recipes.clearSearch')}</Link>}
            {(statusFilter !== 'Active' || typeFilter !== 'All' || showHidden) && <Link className="btn btn-outline" to={href({ status: null, type: null, hidden: null, page: null })}>{t('cafe.recipes.clearFilters')}</Link>}
          </EmptyState>
            : <>
              <div className="cafe-recipes__master-label">{t('cafe.recipes.list')} · {t('cafe.recipes.page', { page, pages: maxPage, count: filtered.length })}</div>
              <div className="record-collection-view">
                <DataTable columns={columns} rows={visible} isDesktop={isWide} caption={t('cafe.recipes.list')} tableClassName="record-collection-table collection-grammar-table cafe-recipes__table" />
              </div>
              <nav className="cafe-recipes__pagination" aria-label={t('cafe.recipes.pagination')}>
                {page > 1 && <Link className="btn btn-outline" to={href({ page: String(page - 1) })}>{t('cafe.recipes.previous')}</Link>}
                <span role="status">{t('cafe.recipes.page', { page, pages: maxPage, count: filtered.length })}</span>
                {page < maxPage && <Link className="btn btn-outline" to={href({ page: String(page + 1) })}>{t('cafe.recipes.next')}</Link>}
              </nav>
            </>}
        </section>
        {selected && <section ref={detailRef} tabIndex={-1} className="cafe-recipes__reference" aria-label={t('cafe.recipes.reference')}>
          <Link className="btn btn-ghost cafe-recipes__back" to={href({ recipe: null })}>{t('cafe.recipes.back')}</Link>
          <CafeRecipeDetail versions={versions.filter(row => recipeKey(row) === selected)} status={statusOf.get(selected)} type={typeOf.get(selected)}
            visibility={hideInMos ? <RecipeVisibilityPreview hidden={hidden.has(selected)} onChange={hide => setHidden(current => {
              const next = new Set(current)
              if (hide) next.add(selected); else next.delete(selected)
              return next
            })} /> : undefined} />
        </section>}
      </div>}
  </CafePageFrame>
}
