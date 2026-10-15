import type { ReactNode } from 'react'
import { Panel, Worksheet } from './worksheet'
import { useT } from '@/i18n/use-t'
import { kitchenCategoryLabel } from '@/lib/kitchen-category-label'
import type { CafeCountableItem } from '@/lib/db/cafe-count'

export type CafeCountSection = { key: string; label: string; rows: CafeCountableItem[] }

export function CafeCountSheet({ children, sections, caption, sectionLabel }: {
  children: ReactNode
  sections: CafeCountSection[]
  caption: string
  sectionLabel: string
}) {
  const t = useT()
  const sectionName = (section: CafeCountSection) => section.key.startsWith('category-')
    ? kitchenCategoryLabel(t, section.label)
    : section.label

  const hasMultipleSections = sections.length > 1
  return <div className={`cafe-count-composition${hasMultipleSections ? ' cafe-count-composition--sectioned' : ''}`}>
    {hasMultipleSections && <>
      <nav className="cafe-count-sheet__index" aria-label={sectionLabel}>
        <h2>{sectionLabel}</h2>
        {sections.map(section => <a key={section.key} href={`#cafe-count-section-${section.key}`}>
          <span>{sectionName(section)}</span><span className="tabular">{section.rows.length}</span>
        </a>)}
      </nav>
      <Panel title={sectionLabel} className="cafe-count-sheet__phone-index">
        <nav aria-label={sectionLabel}>
          {sections.map(section => <a key={section.key} href={`#cafe-count-section-${section.key}`}>
            <span>{sectionName(section)}</span><span className="tabular">{section.rows.length}</span>
          </a>)}
        </nav>
      </Panel>
    </>}
    <Worksheet label={caption} className="cafe-count-sheet">
      {children}
    </Worksheet>
  </div>
}
