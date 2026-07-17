import { useState } from 'react'
import { useT } from '@/i18n/use-t'
import { Button } from '@/components/ui/button'
import { SIGNAL_CATEGORIES, type SignalCategory } from '@/lib/db/signals.types'

// The shared 8-family category affordance (D28), extracted from signal-card + signal-record so the
// two never drift. When the Signal is uncategorised it renders an "Add category" toggle that opens
// the 8-family listbox; once set it renders the category pill. Post-capture enrichment — it never
// blocks capture and correcting a category is allowed.

export interface SignalCategoryPickerProps {
  category: SignalCategory | null
  onCategorize?: (category: SignalCategory) => void
}

export function SignalCategoryPicker({ category, onCategorize }: SignalCategoryPickerProps) {
  const t = useT()
  const [open, setOpen] = useState(false)

  if (category) {
    return <span className="signal-category-pill">{category}</span>
  }

  function pick(next: SignalCategory) {
    onCategorize?.(next)
    setOpen(false)
  }

  return (
    <>
      <Button variant="ghost" onClick={() => setOpen((v) => !v)}>
        {t('signals.record.addCategory')}
      </Button>
      {open && (
        <div role="listbox" aria-label={t('signals.record.categoryPickerLabel')} className="signal-category-picker">
          {SIGNAL_CATEGORIES.map((option) => (
            <button
              type="button"
              key={option}
              role="option"
              aria-selected={category === option}
              className="signal-category-option"
              onClick={() => pick(option)}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </>
  )
}
