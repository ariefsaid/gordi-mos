import { useEffect, useState } from 'react'
import { useI18n } from '@/i18n/I18nProvider'
import { useT } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
import { Pill } from '@/components/ui/pill'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { diffRecipes, latestRecipes, recipeKey, recipeName, type RecipeVersion } from '@/lib/cafe-recipes'
import { listItemRecipeVersions } from '@/lib/db/cafe-recipes'
import { formatDayMonthYear } from '@/lib/format/date'
import { formatQuantityInput } from '@/lib/quantity-parser'
import './cafe-recipes.css'

const CHANGE_KEYS = {
  added: 'cafe.recipes.change.added', removed: 'cafe.recipes.change.removed', quantity: 'cafe.recipes.change.quantity',
  unit: 'cafe.recipes.change.unit', status: 'cafe.recipes.change.status', name: 'cafe.recipes.change.name',
  yield: 'cafe.recipes.change.yield', output: 'cafe.recipes.change.output',
} as const satisfies Record<string, MessageKey>
const OUTPUT_KEYS: Record<string, MessageKey> = {
  menu_name: 'cafe.recipes.output', output_unit: 'cafe.recipes.outputUnit', output_yield: 'cafe.recipes.yield',
  output_detail_id: 'cafe.recipes.outputUnit', bom_id: 'cafe.recipes.mapping', branch_codes: 'cafe.recipes.scope',
  active: 'cafe.recipes.status', menu_deleted: 'cafe.recipes.status',
}

export function CafeRecipeDetail({ versions }: { versions: RecipeVersion[] }) {
  const t = useT()
  const { locale } = useI18n()
  const history = [...versions].sort((a, b) => b.version - a.version)
  const current = history[0]
  if (!current) return <EmptyState variant="blank" title={t('cafe.recipes.noRecipe')} />
  const recipe = current.recipe
  const missing = t('cafe.recipes.notProvided')
  const quantity = (value: number) => value === 0 ? '0' : formatQuantityInput(value, locale, 20)
  return (
    <article className="cafe-recipe-detail">
      <header className="cafe-recipe-detail__head">
        <h2>{recipeName(current) || t('cafe.recipes.unnamed')}</h2>
        <Pill tone="neutral" dot={false}>{t('cafe.recipes.readOnly')}</Pill>
      </header>
      <dl className="cafe-recipe-detail__facts">
        <div><dt>{t('cafe.recipes.outputUnit')}</dt><dd>{recipe.output_unit || missing}</dd></div>
        <div><dt>{t('cafe.recipes.yield')}</dt><dd>{recipe.output_yield == null ? missing : quantity(recipe.output_yield)}</dd></div>
        {recipe.branch_codes?.length ? <div><dt>{t('cafe.recipes.scope')}</dt><dd>{recipe.branch_codes.join(', ')}</dd></div> : null}
      </dl>
      {(recipe.active === false || recipe.menu_deleted) && <p>{t('cafe.recipes.inactive')}</p>}
      <h3>{t('cafe.recipes.ingredients')}</h3>
      {recipe.lines.length === 0 ? <p>{t('cafe.recipes.noIngredients')}</p> : (
        <ul className="cafe-recipe-detail__ingredients">
          {recipe.lines.map((line, index) => (
            <li key={`${line.line_id ?? line.detail_id}:${index}`}>
              <span>{line.name || t('cafe.recipes.unnamedIngredient')}
                {(line.detail_active === false || line.product_active === false || line.product_deleted) && <small>{t('cafe.recipes.inactiveIngredient')}</small>}
              </span>
              <span className="tabular">{quantity(line.qty)} {line.unit || missing}</span>
            </li>
          ))}
        </ul>
      )}
      <details className="cafe-recipe-detail__history">
        <summary>{t(history.length === 1 ? 'cafe.recipes.changesOne' : 'cafe.recipes.changes', { count: history.length })}</summary>
        <p className="cafe-recipe-detail__note">{t('cafe.recipes.observationNote')}</p>
        <ol>
          {history.map((version, index) => {
            const previous = history[index + 1]
            const changes = previous ? diffRecipes(previous, version) : []
            return (
              <li key={version.version}>
                <h3>{t('cafe.recipes.version', { version: version.version })} · <time dateTime={version.first_seen}>{formatDayMonthYear(version.first_seen, locale)}</time></h3>
                {!previous ? <p>{t('cafe.recipes.firstObservation')}</p> : changes.length === 0 ? <p>{t('cafe.recipes.otherChanges')}</p> : (
                  <ul>{changes.map((change, changeIndex) => (
                    <li key={changeIndex}>
                      <strong>{t(CHANGE_KEYS[change.kind])}</strong>{' · '}
                      {change.kind === 'output' && OUTPUT_KEYS[change.name] ? t(OUTPUT_KEYS[change.name]) : change.name || t('cafe.recipes.unnamedIngredient')}
                      {change.before !== undefined && <span> · {change.before || missing}</span>}
                      {change.after !== undefined && <span> → {change.after || missing}</span>}
                    </li>
                  ))}</ul>
                )}
                <details><summary>{t('cafe.recipes.recordedIngredients')}</summary>
                  <ul>{version.recipe.lines.map((line, lineIndex) => <li key={lineIndex}>{line.name || t('cafe.recipes.unnamedIngredient')} · {quantity(line.qty)} {line.unit || missing}</li>)}</ul>
                </details>
              </li>
            )
          })}
        </ol>
      </details>
    </article>
  )
}

export function CafeItemRecipeSection({ itemId, erpName }: { itemId: string; erpName: string }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  return <details className="cafe-item-recipe" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{t('cafe.recipes.itemSection')}</summary>
    {open && <ItemRecipes key={itemId} itemId={itemId} erpName={erpName} />}
  </details>
}

function ItemRecipes({ itemId, erpName }: { itemId: string; erpName: string }) {
  const t = useT()
  const [result, setResult] = useState<Awaited<ReturnType<typeof listItemRecipeVersions>>>()
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    void listItemRecipeVersions(itemId, erpName).then(data => {
      if (active) { setResult(data); setError(false) }
    }).catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [itemId, erpName, retry])
  if (error) return <ErrorState message={t('cafe.recipes.loadError')} onRetry={() => { setError(false); setRetry(retry + 1) }} />
  if (!result) return <LoadingShell count={2} label={t('cafe.recipes.loading')} />
  if (result.versions.length === 0) return <p>{t('cafe.recipes.noRecipe')}</p>
  return <>
    {result.matchedByName && <p className="cafe-recipe-detail__note">{t('cafe.recipes.nameMatch')}</p>}
    {latestRecipes(result.versions).map(row => <CafeRecipeDetail key={recipeKey(row)} versions={result.versions.filter(version => recipeKey(version) === recipeKey(row))} />)}
  </>
}
