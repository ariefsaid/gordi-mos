import { useEffect, useState } from 'react'
import { canManageCafeItemSettings } from '@/lib/db/cafe-item-settings'

export function useCanManageRecipeVisibility(): boolean {
  const [canManage, setCanManage] = useState(false)
  useEffect(() => {
    let active = true
    void Promise.all((['kitchen', 'bar'] as const).map(activity =>
      canManageCafeItemSettings(activity).catch(() => false),
    )).then(answers => {
      if (active) setCanManage(answers.some(Boolean))
    })
    return () => { active = false }
  }, [])
  return canManage
}
