import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { CafePageFrame } from '@/components/kitchen/cafe-page-frame'
import { CafeRecipeDetail } from '@/components/kitchen/cafe-recipe-detail'
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { TextInput } from '@/components/ui/text-input'
import { useT } from '@/i18n/use-t'
import { useI18n } from '@/i18n/I18nProvider'
import { latestRecipes, recipeKey, recipeName, searchRecipes, type RecipeVersion } from '@/lib/cafe-recipes'
import { listRecipeVersions } from '@/lib/db/cafe-recipes'
import { kitchenDataTableGroups, toKitchenListRows, useKitchenItemTable } from '@/lib/kitchen-item-list'
import { formatDayMonthYear } from '@/lib/format/date'
import { useIsWide } from '@/shell/use-is-wide'
import '@/components/record-collection/record-collection.css'
import '@/components/kitchen/cafe-recipes.css'

const PAGE_SIZE = 50

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
  const [versions, setVersions] = useState<RecipeVersion[]>()
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  const detailRef = useRef<HTMLDivElement>(null)
  const links = useRef(new Map<string, HTMLAnchorElement>())
  const lastOpened = useRef<string | null>(null)
  useEffect(() => {
    let active = true
    void listRecipeVersions().then(rows => { if (active) { setVersions(rows); setError(false) } })
      .catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [retry])
  useEffect(() => {
    if (!versions) return
    if (selected) { lastOpened.current = selected; detailRef.current?.focus() }
    else if (lastOpened.current) links.current.get(lastOpened.current)?.focus()
  }, [selected, versions])
  const latest = useMemo(() => latestRecipes(versions ?? []), [versions])
  const rows = useMemo(() => toKitchenListRows(searchRecipes(latest, query), {
    kind: 'Unclassified', getId: recipeKey, getName: recipeName,
    getCategory: () => null, getGroupKey: () => 'all',
  }), [latest, query])
  const sorting = useMemo(() => [{ id: 'itemName', desc: false }], [])
  const table = useKitchenItemTable({ data: rows, search: '', kind: 'All', category: 'All', sorting })
  const filtered = kitchenDataTableGroups(table, () => null).flatMap(group => group.rows)
  const maxPage = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const page = Math.min(maxPage, Math.max(1, Math.floor(Number(params.get('page'))) || 1))
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const href = (update: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(update)) { if (value === null) next.delete(key); else next.set(key, value) }
    return { pathname: '/cafe/recipes', search: next.toString() }
  }
  const columns: DataTableColumn<RecipeVersion>[] = [
    { key: 'name', header: t('cafe.recipes.output'), render: row => <Link
      ref={node => { if (node) links.current.set(recipeKey(row), node); else links.current.delete(recipeKey(row)) }}
      className="cafe-recipes__open" to={href({ recipe: recipeKey(row) })}
    >{recipeName(row) || t('cafe.recipes.unnamed')}</Link> },
    ...(latest.some(row => row.recipe.branch_codes?.length) ? [{ key: 'scope', header: t('cafe.recipes.scope'), render: (row: RecipeVersion) => row.recipe.branch_codes?.join(', ') || t('cafe.recipes.scopeNotRecorded') }] : []),
    { key: 'ingredients', header: t('cafe.recipes.ingredients'), numeric: true, render: row => t(row.recipe.lines.length === 1 ? 'cafe.recipes.ingredientCountOne' : 'cafe.recipes.ingredientCount', { count: row.recipe.lines.length }) },
    { key: 'changed', header: t('cafe.recipes.lastChanged'), render: row => <time dateTime={row.first_seen}>{formatDayMonthYear(row.first_seen, locale)}</time> },
  ]
  return <CafePageFrame page="recipes"
    meta={versions && !error ? t('cafe.recipes.count', { count: latest.length }) : undefined}
    state={error ? 'error' : !versions ? 'loading' : 'default'}>
    {error ? <ErrorState message={t('cafe.recipes.loadError')} onRetry={() => { setError(false); setVersions(undefined); setRetry(retry + 1) }} />
      : !versions ? <LoadingShell count={4} label={t('cafe.recipes.loading')} />
      : selected ? <div ref={detailRef} tabIndex={-1} className="cafe-recipes__focused">
        <Link className="btn btn-ghost cafe-recipes__back" to={href({ recipe: null })}>{t('cafe.recipes.back')}</Link>
        <CafeRecipeDetail versions={versions.filter(row => recipeKey(row) === selected)} />
      </div>
      : latest.length === 0 ? <EmptyState variant="awaiting" title={t('cafe.recipes.empty')} copy={t('cafe.recipes.emptyBody')} />
      : <section className="cafe-recipes" aria-label={t('cafe.recipes.list')}>
        <p className="cafe-recipe-detail__note">{t('cafe.recipes.sourceNote')}</p>
        <TextInput type="search" label={t('cafe.recipes.search')} value={query} onChange={event => {
          const next = new URLSearchParams(params)
          if (event.target.value) next.set('q', event.target.value); else next.delete('q')
          next.delete('page')
          setParams(next, { replace: true })
        }} />
        {filtered.length === 0 ? <EmptyState variant="blank" title={t('cafe.recipes.noMatches')}><Link className="btn btn-outline" to={href({ q: null, page: null })}>{t('cafe.recipes.clearSearch')}</Link></EmptyState>
          : <>
            <div className="record-collection-view">
              <DataTable columns={columns} rows={visible} isDesktop={isWide} caption={t('cafe.recipes.list')} tableClassName="record-collection-table collection-grammar-table cafe-recipes__table" />
            </div>
            <nav className="cafe-recipes__pagination" aria-label={t('cafe.recipes.pagination')}>
              {page > 1 && <Link className="btn btn-outline" to={href({ page: String(page - 1) })}>{t('cafe.recipes.previous')}</Link>}
              <span role="status">{t('cafe.recipes.page', { page, pages: maxPage, count: filtered.length })}</span>
              {page < maxPage && <Link className="btn btn-outline" to={href({ page: String(page + 1) })}>{t('cafe.recipes.next')}</Link>}
            </nav>
          </>}
      </section>}
  </CafePageFrame>
}
