// "Shown / Hidden in MOS" for one recipe (PREVIEW). Rendered only when the Hide in MOS preview is on and the viewer can already
// manage Café item settings. The choice lives in the page's memory: Save is disabled and says why, and nothing here calls the
// backend stub (lib/db/cafe-recipe-visibility.ts, contract in handover/recipe-visibility.md).
import { useId } from 'react'
import { PreviewBadge } from '@/components/preview/preview-badge'
import { Button } from '@/components/ui/button'
import { Toggle } from '@/components/ui/toggle'
import { useT } from '@/i18n/use-t'

export function RecipeVisibilityPreview({ hidden, onChange }: { hidden: boolean; onChange: (hidden: boolean) => void }) {
  const t = useT()
  const reasonId = useId()
  const label = t(hidden ? 'cafe.recipes.hidden' : 'cafe.recipes.shown')
  return <section className="cafe-recipe-visibility" aria-label={t('cafe.recipes.inMos')}>
    <div className="cafe-recipe-visibility__row">
      <Toggle value={!hidden} aria-label={label} onChange={shown => onChange(!shown)} />
      <span className="cafe-recipe-visibility__state" aria-hidden="true">{label}</span>
      <PreviewBadge />
    </div>
    <p className="cafe-recipe-detail__note">{t('cafe.recipes.visibilityNote')}</p>
    <div className="cafe-recipe-visibility__row">
      <Button variant="primary" disabled aria-describedby={reasonId}>{t('cafe.recipes.save')}</Button>
      <span id={reasonId} className="cafe-recipe-detail__note">{t('cafe.recipes.saveReason')}</span>
    </div>
  </section>
}
