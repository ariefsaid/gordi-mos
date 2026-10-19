import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { useT } from '@/i18n/use-t'
import { hasKnownModuleAvailability, useModuleAvailability } from '@/lib/module-availability'
import type { ModuleId } from '@/lib/db/module-settings'

type ModuleBoundaryProps = { moduleId: ModuleId; children: ReactNode }

export function ModuleBoundary({ moduleId, children }: ModuleBoundaryProps) {
  const t = useT()
  const { status, isOn, retry } = useModuleAvailability()

  if (status === 'idle' || status === 'loading') return <LoadingShell routeTitle />
  if (status === 'error' && !hasKnownModuleAvailability(moduleId)) {
    return <ErrorState message={t('module.availability.error')} onRetry={retry} />
  }
  if (!isOn(moduleId)) {
    return (
      <EmptyState variant="blank" title={t('module.off.title')} copy={t('module.off.body')}>
        <Link to="/" className="btn btn-outline">{t('nav.home')}</Link>
      </EmptyState>
    )
  }
  return children
}
