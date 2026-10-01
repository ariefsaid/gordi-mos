// RecordPageHeader — the shared record header: title · facts line · primary action · ⋯ menu.
// Record-agnostic; a record kind supplies typed facts and actions, never markup.
//
// Props (RecordPageHeaderProps)
//   title            RecordFieldSpec   the title as a field (editable → inline rename, else plain heading)
//   headingLevel     1 | 2             1 on a record's own page, 2 in a panel
//   facts            RecordFact[]      the facts line, in order (see RecordFact)
//   primary          { label, onClick, disabled?, busy? }   the ONE primary action; omit when none applies
//   menu             RecordMenuItem[]  ⋯ items; the menu renders only with two or more
//   menuLabel        string            accessible name of the ⋯ trigger
//   menuMinItems     number = 2        fewest items for which the ⋯ renders (1 when the menu carries a record's only action)
//   factsLabel       string            accessible name of the facts list
//   note             string            the one read-only line under the facts
//   onCommitField    (key, value) => Promise<void>   persists any editable title/fact field by its key
//   onDirtyChange / fieldCommitsFrozen   forwarded to every field (host leave-guard contract)
//
// RecordFact is a union: { type:'state' } a toned pill · { type:'person' } a role chip that spells the
// role out ("Accountable · Dewi") · { type:'field' } a label + click-to-edit value · { type:'group' }
// several fields sharing one visible label (a quarter and a year read as "Period Q4 2026").
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { RecordField } from '@/components/records/record-field'
import type { RecordFieldSpec, RecordValue } from '@/components/records/record-viewer.types'
import { RecordMenu, type RecordMenuItem } from './record-menu'
import './record-page.css'

export type RecordFactTone = 'neutral' | 'warning' | 'success' | 'primary'
export type RecordPersonRole = 'responsible' | 'accountable' | 'neutral'

export type RecordFact =
  | { type: 'state'; key: string; label: string; tone: RecordFactTone; dot?: boolean }
  | { type: 'person'; key: string; role: RecordPersonRole; field: RecordFieldSpec }
  | { type: 'field'; key: string; field: RecordFieldSpec; tone?: 'overdue' | 'soon' }
  | { type: 'group'; key: string; label: string; fields: readonly RecordFieldSpec[] }

export type RecordPrimaryAction = {
  label: string
  onClick: () => void
  disabled?: boolean
  busy?: boolean
}

export type RecordPageHeaderProps = {
  title: RecordFieldSpec
  headingLevel: 1 | 2
  facts: readonly RecordFact[]
  primary?: RecordPrimaryAction
  menu?: readonly RecordMenuItem[]
  menuLabel: string
  menuMinItems?: number
  factsLabel: string
  note?: string
  onCommitField: (key: string, value: RecordValue) => Promise<void>
  onDirtyChange?: (dirty: boolean) => void
  fieldCommitsFrozen?: boolean
}

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[words.length - 1][0]).toUpperCase()
}

/** The person chip's mark: a separator after the spelled-out role, then initials. */
function personLead(name: string): ReactNode {
  return (
    <>
      <span className="rp-chip__sep" aria-hidden="true">·</span>
      <span className="rp-avatar" data-initials={initialsOf(name)} aria-hidden="true" />
    </>
  )
}

export function RecordPageHeader({
  title, headingLevel, facts, primary, menu = [], menuLabel, menuMinItems, factsLabel, note,
  onCommitField, onDirtyChange, fieldCommitsFrozen = false,
}: RecordPageHeaderProps) {
  const field = (spec: RecordFieldSpec, extra?: Partial<RecordFieldSpec>) => (
    <RecordField
      key={spec.key}
      spec={extra ? { ...spec, ...extra } : spec}
      onCommit={(value) => onCommitField(spec.key, value)}
      onDirtyChange={onDirtyChange}
      commitsFrozen={fieldCommitsFrozen}
    />
  )
  return (
    <header className="rp-head" data-record-header="true">
      <div className="rp-title">
        <RecordField
          spec={title}
          heading
          headingLevel={headingLevel}
          onCommit={(value) => onCommitField(title.key, value)}
          onDirtyChange={onDirtyChange}
          commitsFrozen={fieldCommitsFrozen}
        />
      </div>
      {primary ? (
        <div className="rp-head__primary">
          <Button variant="primary" disabled={primary.disabled || primary.busy} aria-busy={primary.busy || undefined} onClick={primary.onClick}>
            {primary.label}
          </Button>
        </div>
      ) : null}
      <div className="rp-head__more"><RecordMenu items={menu} label={menuLabel} minItems={menuMinItems} /></div>
      <ul className="rp-facts" aria-label={factsLabel}>
        {facts.map((fact) => {
          if (fact.type === 'state') {
            return (
              <li key={fact.key} className="rp-fact rp-fact--state">
                <span className={`pill pill--${fact.tone}`}>{fact.dot === false ? null : <span className="dot" aria-hidden="true" />}{fact.label}</span>
              </li>
            )
          }
          if (fact.type === 'person') {
            const named = fact.field.value !== null && fact.field.displayValue !== ''
            return (
              <li key={fact.key} className={`rp-fact rp-chip rp-chip--${fact.role}${named ? '' : ' rp-chip--ghost'}`}>
                {field(fact.field, named ? { lead: personLead(fact.field.displayValue) } : undefined)}
              </li>
            )
          }
          if (fact.type === 'group') {
            return (
              <li key={fact.key} className="rp-fact rp-fact--group">
                <span className="rp-fact__key" aria-hidden="true">{fact.label}</span>
                <span className="rp-fact__fields">{fact.fields.map((spec) => field(spec))}</span>
              </li>
            )
          }
          return (
            <li key={fact.key} className={`rp-fact rp-fact--field${fact.tone ? ` rp-fact--${fact.tone}` : ''}`}>
              {field(fact.field)}
            </li>
          )
        })}
      </ul>
      {note ? <p className="rp-readonly" role="note">{note}</p> : null}
    </header>
  )
}
