// "Preview · not saved" — the one mark on every in-memory preview surface (handover/README.md: forms
// stay in memory, writes are disabled, no fake success). Persistent, never a toast.
import { Pill } from '@/components/ui/pill'
import { useT } from '@/i18n/use-t'

export function PreviewBadge({ className }: { className?: string }) {
  const t = useT()
  return <Pill tone="violet" className={className}>{t('preview.notSaved')}</Pill>
}
