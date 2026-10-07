// format/percent tests — the ONE canonical locale-aware percent formatter
// (census g-money r5 F-2). Oracle: every percent on the Money/Plan family speaks
// id-ID (comma decimals) — never a raw-period "23.1%" beside a comma "36,7%".
import { describe, it, expect } from 'vitest'
import { formatPercent, formatSignedPercent, formatSignedPoints, formatPoints } from './percent'
import { formatPct } from '@/lib/plan-budget-logic'

describe('formatSignedPercent — a change always carries its sign as text', () => {
  it('writes + or − (the minus sign, not a hyphen) with id-ID comma decimals', () => {
    expect(formatSignedPercent(0.032)).toBe('+3,2%')
    expect(formatSignedPercent(-0.249)).toBe('\u221224,9%')
  })

  it('no change reads as 0,0% with no sign', () => {
    expect(formatSignedPercent(0)).toBe('0,0%')
    expect(formatSignedPercent(-0.00001)).toBe('0,0%')
  })
})

describe('formatSignedPoints — a difference of two percentages, in points', () => {
  it('a 0,072 difference reads +7,2 and a negative one carries the minus sign', () => {
    expect(formatSignedPoints(0.072)).toBe('+7,2')
    expect(formatSignedPoints(-0.0051)).toBe('\u22120,5')
    expect(formatSignedPoints(0.00001)).toBe('0,0')
  })
})

describe('formatPercent (r5 F-2: one locale-aware percent everywhere)', () => {
  it('formats a fraction with id-ID comma decimals at the default 1dp', () => {
    expect(formatPercent(0.367)).toBe('36,7%')
    expect(formatPercent(0.231)).toBe('23,1%')
    expect(formatPercent(-0.061)).toBe('-6,1%')
  })

  it('integer precision drops the separator entirely — never "80.0%"', () => {
    expect(formatPercent(0.8, 0)).toBe('80%')
    expect(formatPercent(0.423, 0)).toBe('42%')
  })

  it('null/NaN render the em-dash placeholder, never "NaN%"', () => {
    expect(formatPercent(null)).toBe('—')
    expect(formatPercent(Number.NaN)).toBe('—')
  })

  it('the pricing formatter is a view over the SAME module (no second format)', () => {
    // formatPct takes a 0..1 fraction at integer precision — id-ID.
    expect(formatPct(0.8)).toBe(formatPercent(0.8, 0))
    expect(formatPct(null)).toBe('—')
  })

  // MUTATION-DRIVEN (2026-08-05, #200). The assertion above is v4's, and reverting either
  // formatter to its old hand-roll SURVIVED it: at 0.367 and 0.8 the hand-rolled
  // `.replace('.', ',')` and `Math.round(x*100)+'%'` produce byte-identical output, so the
  // test agreed with an implementation that does not delegate. It proved a coincidence, not
  // the delegation it is named for.
  //
  // These are the inputs where a hand-roll and the Intl module actually part company:
  //   · above 100% the module inserts an id-ID GROUP separator ("1.234,6%"), a hand-roll
  //     cannot ("1234,6%");
  //   · a non-finite input renders the em-dash placeholder, where a hand-roll prints "NaN%".
  // Both mutations now land red.
  it('delegation is real, not coincidental: the grouped and non-finite cases diverge from any hand-roll', () => {
    // Grouping is the module's, so it appears in the view.
    expect(formatPct(12.3456)).toBe('1.235%')
    // A hand-rolled Math.round path prints "NaN%" here; the module's placeholder wins.
    expect(formatPct(Number.NaN)).toBe('—')
  })
})

describe('formatPoints — the size of a difference, the sentence carries over or under', () => {
  it('drops the sign either way', () => {
    expect(formatPoints(0.072)).toBe('7,2')
    expect(formatPoints(-0.0051)).toBe('0,5')
  })
})
