// Hide in MOS on Recipes (PREVIEW). The switch, its column and the "Show hidden" filter are asked of the SAME ship authority as
// the other preview screens (lib/ship-gate.ts): with the preview opt-in off (every production build) none of it exists and the
// released Recipes page is unchanged. The choice is kept in memory only; nothing is stored until the backend in
// R/handover/recipe-visibility.md exists.
import { useEffect, useState } from 'react'
import { isShipGated } from '@/lib/ship-gate'
import { canManageCafeItemSettings } from '@/lib/db/cafe-item-settings'

/** A path with no route: the ship-gate key for the whole feature. */
const RECIPE_VISIBILITY_PREVIEW_ROOT = '/cafe/recipes/visibility'

/** Is the Hide in MOS preview on for this launch? A build-time constant, never a role, query or stored setting. */
export const useRecipeVisibilityPreview = () => !isShipGated(RECIPE_VISIBILITY_PREVIEW_ROOT)

/**
 * May this viewer change what Recipes shows in MOS? The same right that manages Café item settings (unchanged, no new permission).
 * Recipes are not tied to one stream, so a manager of either activity qualifies. Asks nothing while the preview is off.
 */
export function useCanHideRecipes(previewOn: boolean): boolean {
  const [can, setCan] = useState(false)
  useEffect(() => {
    if (!previewOn) { setCan(false); return }
    let live = true
    void Promise.all((['kitchen', 'bar'] as const).map(activity => canManageCafeItemSettings(activity).catch(() => false)))
      .then(answers => { if (live) setCan(answers.some(Boolean)) })
    return () => { live = false }
  }, [previewOn])
  return can
}
