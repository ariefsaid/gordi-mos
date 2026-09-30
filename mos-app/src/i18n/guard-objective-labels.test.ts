// The labels the Objective work added carry real Indonesian, and the retired capability label is
// gone. Complements guard-english-id-values (id === en) with the presence, placeholder and
// vocabulary checks it cannot make.
import { describe, it, expect } from 'vitest'
import { messages } from './messages'

const en = messages.en as Record<string, string>
const id = messages.id as Record<string, string>

// Literal keys (so a rename or deletion fails here) plus prefixes (so a later slice's keys are
// swept in without editing this file). `objective.writeUp.` matches nothing until the write-up ships.
const LITERAL_KEYS = [
  'catalog.companyWide',
  'catalog.period.wholeYear',
  'catalog.period.q1',
  'catalog.period.q2',
  'catalog.period.q3',
  'catalog.period.q4',
  'catalog.record.periodQuarter',
  'catalog.record.periodQuarterNeedsYear',
]
const PREFIXES = ['objective.keyResults.', 'objective.writeUp.']

/** Objective-side role labels stay English in both locales (Responsible / Accountable). */
const SAME_AS_EN: Record<string, string> = {
  'objective.keyResults.responsible': 'Responsible — the Objective record shows the same word',
}

const objectiveKeys = [
  ...LITERAL_KEYS,
  ...Object.keys(en).filter((key) => PREFIXES.some((prefix) => key.startsWith(prefix))),
]

const placeholders = (value: string) => (value.match(/\$\{\w+\}/g) ?? []).sort()

describe('Objective labels have real Indonesian values', () => {
  it('every Objective-slice key exists in both locales with a non-empty, non-English id value', () => {
    const holes = objectiveKeys.filter((key) => {
      const value = id[key]?.trim()
      return !value || (value === en[key] && !(key in SAME_AS_EN))
    })
    expect(holes, `missing or untranslated id values: ${holes.join(', ')}`).toEqual([])
  })

  it('the key-result set is present (the prefix sweep cannot silently match nothing)', () => {
    expect(objectiveKeys.filter((key) => key.startsWith('objective.keyResults.')).length).toBeGreaterThan(10)
  })

  it('each id value keeps the placeholders of its English source', () => {
    const drift = objectiveKeys.filter((key) => placeholders(id[key] ?? '').join() !== placeholders(en[key] ?? '').join())
    expect(drift, `placeholder mismatch: ${drift.join(', ')}`).toEqual([])
  })

  it('every SAME_AS_EN entry is live', () => {
    for (const key of Object.keys(SAME_AS_EN)) expect(objectiveKeys).toContain(key)
  })

  it('the key-result Responsible label matches the record field, not the PIC gloss', () => {
    expect(id['objective.keyResults.responsible']).toBe(id['catalog.record.responsible'])
    expect(id['objective.keyResults.clearResponsible']).toBe('Hapus Responsible')
    const keyResultGloss = Object.keys(id).filter((key) => key.startsWith('objective.keyResults.') && /penanggung jawab/i.test(id[key]))
    expect(keyResultGloss).toEqual([])
  })
})

describe('Indonesian Objective and list wording', () => {
  it('the non-admin Objective note names the Accountable field as the field reads', () => {
    expect(id['catalog.record.objectiveReadOnly']).toContain('Accountable')
    expect(id['catalog.record.objectiveReadOnly']).not.toMatch(/penanggung jawab/i)
  })

  // CollectionToolbar renders the label as the visible placeholder; the placeholder key is only the hover title.
  it('the Objectives and Projects & Processes search label, which renders in the box, is short enough for a 390px toolbar', () => {
    expect(id['catalog.searchLabel'].length).toBeLessThanOrEqual(12)
  })
})

describe('retired capability label', () => {
  it('the objective.manage admin-access label is gone (the control is retired; no surface renders it)', () => {
    for (const locale of [en, id]) expect('admin.access.action.objective.manage' in locale).toBe(false)
  })
})
