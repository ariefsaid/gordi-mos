import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { CafePageFrame } from '@/components/kitchen/cafe-page-frame'
import { CafeQueueEmpty } from '@/components/cafe/redesign/cafe-queue-empty'
import { CafeRecipeDetail } from '@/components/kitchen/cafe-recipe-detail'
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table'
import { KitchenToolbar } from '@/components/kitchen/kitchen-toolbar'
import { RecipeActivityBadge } from '@/components/kitchen/recipe-activity-badge'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { useT } from '@/i18n/use-t'
import { useI18n } from '@/i18n/I18nProvider'
import {
  filterRecipesByActivity, latestRecipes, recipeActivity, recipeKey, recipeName, searchRecipes,
  type RecipeActivityFilter, type RecipeItemFlags, type RecipeVersion,
} from '@/lib/cafe-recipes'
import { listRecipeItemFlags, listRecipeVersions } from '@/lib/db/cafe-recipes'
import { KITCHEN_ACTIVE_FILTER_OPTIONS, kitchenDataTableGroups, toKitchenListRows, useKitchenItemTable } from '@/lib/kitchen-item-list'
import { formatDayMonthYear, formatWibShortDateTime } from '@/lib/format/date'
import { useIsWide } from '@/shell/use-is-wide'
import '@/components/record-collection/record-collection.css'
import '@/components/kitchen/cafe-recipes.css'
import '@/components/kitchen/cafe-setup-workspace.css'

const PAGE_SIZE = 50
const NO_FLAGS: RecipeItemFlags = new Map()

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
  const statusParam = params.get('status')
  const statusFilter: RecipeActivityFilter = KITCHEN_ACTIVE_FILTER_OPTIONS.includes(statusParam as RecipeActivityFilter) ? statusParam as RecipeActivityFilter : 'Active'
  const [versions, setVersions] = useState<RecipeVersion[]>()
  const [itemFlags, setItemFlags] = useState<RecipeItemFlags>(NO_FLAGS)
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
      // Linked-item flags only matter for recipes whose ESB copy carries no flag of its own. A failed read leaves them Unknown.
      const needFlags = latestRecipes(rows).some(row => row.bom_id != null && row.recipe.active === undefined && row.recipe.menu_deleted !== true)
      const flags = needFlags ? await listRecipeItemFlags().catch(() => NO_FLAGS) : NO_FLAGS
      if (active) { setItemFlags(flags); setVersions(rows); setError(false) }
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
  const activityOf = useMemo(() => new Map(latest.map(row => [recipeKey(row), recipeActivity(row, itemFlags)])), [latest, itemFlags])
  const rows = useMemo(() => toKitchenListRows(searchRecipes(filterRecipesByActivity(latest, statusFilter, itemFlags), query), {
    kind: 'Unclassified', getId: recipeKey, getName: recipeName,
    getCategory: () => null, getGroupKey: () => 'all',
  }), [latest, itemFlags, query, statusFilter])
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
  // A search or filter change always returns to the first page; the status filter stays in the URL (Active = no key).
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
    { key: 'status', header: t('kitchen.log.col.status'), render: row => <RecipeActivityBadge activity={activityOf.get(recipeKey(row)) ?? 'unknown'} /> },
    ...(latest.some(row => row.recipe.branch_codes?.length) ? [{ key: 'scope', header: t('cafe.recipes.scope'), render: (row: RecipeVersion) => row.recipe.branch_codes?.join(', ') || t('cafe.recipes.scopeNotRecorded') }] : []),
    { key: 'ingredients', header: t('cafe.recipes.ingredients'), numeric: true, render: row => t(row.recipe.lines.length === 1 ? 'cafe.recipes.ingredientCountOne' : 'cafe.recipes.ingredientCount', { count: row.recipe.lines.length }) },
    { key: 'changed', header: t('cafe.recipes.lastChanged'), render: row => <time dateTime={row.first_seen}>{formatDayMonthYear(row.first_seen, locale)}</time> },
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
              summary: statusFilter === 'All' ? t('cafe.items.filtersNone') : t(statusFilter === 'Active' ? 'kitchen.filter.active.active' : 'kitchen.filter.active.inactive'),
            }}
            countLabel={t('cafe.recipes.count', { count: filtered.length })}
            activeStates={KITCHEN_ACTIVE_FILTER_OPTIONS}
            active={statusFilter}
            onActiveChange={value => setList({ status: value === 'Active' ? null : value })}
            activeId="cafe-recipes-active-filter"
          />
          {filtered.length === 0 ? <EmptyState variant="blank" title={t(query ? 'cafe.recipes.noMatches' : statusFilter === 'Active' ? 'cafe.recipes.noActive' : 'cafe.recipes.noInactive')}>
            {query && <Link className="btn btn-outline" to={href({ q: null, page: null })}>{t('cafe.recipes.clearSearch')}</Link>}
            {statusFilter !== 'All' && <Link className="btn btn-outline" to={href({ status: 'All', page: null })}>{t('cafe.recipes.showAll')}</Link>}
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
          <CafeRecipeDetail versions={versions.filter(row => recipeKey(row) === selected)} activity={selected ? activityOf.get(selected) : undefined} />
        </section>}
      </div>}
  </CafePageFrame>
}
