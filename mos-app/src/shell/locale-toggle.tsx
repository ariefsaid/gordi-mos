import { useI18n } from '@/i18n/I18nProvider'
import { useT } from '@/i18n/use-t'
import type { Locale } from '@/i18n/messages'

/**
 * LocaleToggle — a minimal en/id switch (plan §1.6/§4.6, ADR-0021). Proves the
 * i18n seam end-to-end. Rendered in the rail footer (RailNav) — reused by the
 * mobile drawer for free since MobileDrawer renders RailNav internally.
 */
export function LocaleToggle() {
  const { locale, setLocale } = useI18n()
  const t = useT()

  const options: Array<{ value: Locale; labelKey: 'locale.en' | 'locale.id' }> = [
    { value: 'en', labelKey: 'locale.en' },
    { value: 'id', labelKey: 'locale.id' },
  ]

  return (
    <div role="group" aria-label={t('locale.toggle.label')} className="flex gap-[2px] px-2 py-1">
      {options.map((opt) => {
        const active = locale === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => setLocale(opt.value)}
            className={[
              'flex-1 rounded-sm px-2 py-1 text-xs font-medium',
              active
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent/60',
            ].join(' ')}
          >
            {t(opt.labelKey)}
          </button>
        )
      })}
    </div>
  )
}
