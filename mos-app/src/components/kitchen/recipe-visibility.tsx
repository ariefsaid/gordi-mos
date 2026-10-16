import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Toggle } from '@/components/ui/toggle'
import { useT } from '@/i18n/use-t'
import { ContractError } from '@/lib/db/contract'
import { setRecipeVisibility, type RecipeVisibility } from '@/lib/db/cafe-recipe-visibility'

type RecipeVisibilityProps = {
  recipeKey: string
  visibility: RecipeVisibility | undefined
  canManage: boolean
  onSaved: (row: RecipeVisibility) => void
  onReload: () => Promise<void>
}

type SaveError = 'conflict' | 'forbidden' | 'load' | 'save'

export function RecipeVisibilityControl({ recipeKey, visibility, canManage, onSaved, onReload }: RecipeVisibilityProps) {
  const t = useT()
  const savedHidden = visibility?.hidden ?? false
  const rowVersion = visibility?.row_version ?? null
  const [draftHidden, setDraftHidden] = useState(savedHidden)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<SaveError | null>(null)

  useEffect(() => {
    setDraftHidden(savedHidden)
    setError(null)
  }, [recipeKey, savedHidden, rowVersion])

  useEffect(() => {
    setSaved(false)
  }, [recipeKey])

  const label = t(draftHidden ? 'cafe.recipes.hidden' : 'cafe.recipes.shown')
  const errorKey = error && ({
    conflict: 'cafe.recipes.visibilityError.conflict',
    forbidden: 'cafe.recipes.visibilityError.forbidden',
    load: 'cafe.recipes.visibilityError.load',
    save: 'cafe.recipes.visibilityError.save',
  } as const)[error]
  if (!canManage) return <section className="cafe-recipe-visibility" aria-label={t('cafe.recipes.inMos')}>
    <p>{t(savedHidden ? 'cafe.recipes.hidden' : 'cafe.recipes.shown')}</p>
    <p className="cafe-recipe-detail__note">{t('cafe.recipes.visibilityNote')}</p>
  </section>

  const save = async () => {
    if (saving || draftHidden === savedHidden) return
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const row = await setRecipeVisibility(recipeKey, draftHidden, rowVersion, {
        client_request_id: crypto.randomUUID(),
      })
      onSaved(row)
      setDraftHidden(row.hidden)
      setSaved(true)
    } catch (caught) {
      setError(caught instanceof ContractError && caught.code === 'CONFLICT'
        ? 'conflict'
        : caught instanceof ContractError && caught.code === 'FORBIDDEN' ? 'forbidden' : 'save')
    } finally {
      setSaving(false)
    }
  }

  const reload = async () => {
    setError(null)
    try {
      await onReload()
    } catch {
      setError('load')
    }
  }

  return <section className="cafe-recipe-visibility" aria-label={t('cafe.recipes.inMos')}>
    <div className="cafe-recipe-visibility__row">
      <Toggle value={!draftHidden} disabled={saving} aria-label={t('cafe.recipes.inMos')} onChange={shown => {
        setDraftHidden(!shown)
        setSaved(false)
        setError(null)
      }} />
      <span className="cafe-recipe-visibility__state" aria-hidden="true">{label}</span>
    </div>
    <p className="cafe-recipe-detail__note">{t('cafe.recipes.visibilityNote')}</p>
    <div className="cafe-recipe-visibility__row">
      <Button variant="primary" disabled={saving || draftHidden === savedHidden} aria-busy={saving} onClick={() => void save()}>
        {t(saving ? 'cafe.recipes.visibilitySaving' : 'cafe.recipes.save')}
      </Button>
      {saved && <span role="status" className="cafe-recipe-detail__note">{t('cafe.recipes.visibilitySaved')}</span>}
    </div>
    {error && <p role="alert" className="cafe-recipe-detail__note">
      {errorKey && t(errorKey)}
      {error === 'conflict' && <Button variant="outline" onClick={() => void reload()}>{t('cafe.recipes.visibilityReload')}</Button>}
    </p>}
  </section>
}
