// The labelled in-memory SAMPLE for the Stock comparison preview (like Locations' `?layout=preview`): made-up Count and ESB
// figures so the filled table, the sort, the flags and the item panel can be judged before ESB stock is connected.
// It lives only in the browser, is never read from or written to the database, is reached only on the preview launch,
// and the screen says "Sample" wherever it shows. Rows go through the SAME derivation (compareRow) as real ones.
import { parseDecimal, type Dec } from '@/lib/cafe-records/decimal'
import { addDays } from '@/lib/cafe-records/period'
import { compareRow, type ComparisonRow, type CountObservation, type ExpectedSide, type ExpectedStock, type ItemIdentity } from '@/lib/cafe-stock-comparison'

export interface SampleSource {
  asOf: string
  syncedAt: string
  /** Rows the sample ESB snapshot could not vouch for. */
  partialItems: number
  unmappedItems: number
}

export interface HistoryLine {
  id: string
  countDate: string
  submittedAt: string
  status: 'Submitted' | 'Confirmed' | 'Rejected'
  quantity: Dec
  unitName: string | null
}

type Variant = 'fresh' | 'intraday' | 'stale'

interface SampleItem {
  n: number
  name: string
  kind: 'RAW' | 'WIP'
  category: string | null
  unit: [id: string, name: string]
  /** ESB expected quantity; null with `mapping` = no ESB coordinate yet. */
  expected: string | null
  mapping?: boolean
  expectedUnit?: [id: string, name: string]
  partial?: boolean
  variant?: Variant
  count: { quantity: string; daysAgo: number; status: 'Submitted' | 'Confirmed' } | null
}

const KG: [string, string] = ['sample-unit-kg', 'KG']
const PORSI: [string, string] = ['sample-unit-porsi', 'Porsi']
const LITRE: [string, string] = ['sample-unit-l', 'L']
const PCS: [string, string] = ['sample-unit-pcs', 'Pcs']
const BATCH: [string, string] = ['sample-unit-batch', 'Batch @50porsi']
const BOTTLE: [string, string] = ['sample-unit-btl', 'Btl 600ml']

const ITEMS: SampleItem[] = [
  { n: 1, name: 'Beef patty 150g smash seasoned', kind: 'WIP', category: 'Protein', unit: PORSI, expected: '120', count: { quantity: '112', daysAgo: 1, status: 'Confirmed' } },
  { n: 2, name: 'Fresh Atlantic salmon fillet skin on boneless', kind: 'RAW', category: 'Protein', unit: KG, expected: '18.5', count: { quantity: '21', daysAgo: 1, status: 'Confirmed' } },
  { n: 3, name: 'Whipping cream dairy heavy 35 percent', kind: 'RAW', category: 'Dairy & cold', unit: LITRE, expected: '24', count: { quantity: '24', daysAgo: 1, status: 'Confirmed' } },
  { n: 4, name: 'Sambal matah Bali style fresh chopped', kind: 'WIP', category: 'Sauces & dressings', unit: KG, expected: '6.25', count: { quantity: '5', daysAgo: 1, status: 'Submitted' } },
  { n: 5, name: 'Hollandaise sauce new version', kind: 'WIP', category: 'Sauces & dressings', unit: KG, expected: '0', count: { quantity: '3.5', daysAgo: 1, status: 'Confirmed' } },
  { n: 6, name: 'Pickled red onion quick brine sliced fine', kind: 'WIP', category: 'Sauces & dressings', unit: KG, expected: '-2', count: { quantity: '4', daysAgo: 1, status: 'Confirmed' } },
  { n: 7, name: 'Brioche burger bun sliced sesame topped', kind: 'RAW', category: 'Bakery', unit: PCS, expected: '240', count: { quantity: '240', daysAgo: 0, status: 'Confirmed' } },
  { n: 8, name: 'Mozzarella shredded pizza blend low moisture', kind: 'RAW', category: 'Dairy & cold', unit: KG, expected: '12', partial: true, count: { quantity: '11.5', daysAgo: 1, status: 'Confirmed' } },
  { n: 9, name: 'Kecap manis sweet soy sauce refill', kind: 'RAW', category: 'Dry goods', unit: LITRE, expected: '8', expectedUnit: BOTTLE, count: { quantity: '5', daysAgo: 1, status: 'Confirmed' } },
  { n: 10, name: 'Dark chocolate couverture callets 70 percent', kind: 'RAW', category: null, unit: KG, expected: null, mapping: true, count: { quantity: '3', daysAgo: 1, status: 'Confirmed' } },
  { n: 11, name: 'Vanilla syrup classic bar bottle', kind: 'RAW', category: 'Dry goods', unit: LITRE, expected: '6', count: null },
  { n: 12, name: 'Espresso beans single origin Toraja medium roast one kilo bag', kind: 'RAW', category: 'Dry goods', unit: KG, expected: '9.2', count: { quantity: '8', daysAgo: 3, status: 'Confirmed' } },
  { n: 13, name: 'Oat milk barista edition unsweetened', kind: 'RAW', category: 'Dairy & cold', unit: LITRE, expected: '7', variant: 'intraday', count: { quantity: '5', daysAgo: 0, status: 'Confirmed' } },
  { n: 14, name: 'Demi-glace veal stock reduced classic', kind: 'WIP', category: 'Sauces & dressings', unit: LITRE, expected: '10', variant: 'stale', count: { quantity: '8.5', daysAgo: 3, status: 'Confirmed' } },
  { n: 15, name: 'Aioli dressing garlic roasted house recipe', kind: 'WIP', category: 'Sauces & dressings', unit: BATCH, expected: '4.5', count: { quantity: '4.5', daysAgo: 1, status: 'Confirmed' } },
  { n: 16, name: 'Chicken breast fillet skinless halal frozen', kind: 'RAW', category: 'Protein', unit: KG, expected: '45.333333333', count: { quantity: '45.3', daysAgo: 1, status: 'Confirmed' } },
  { n: 17, name: 'Salsa verde herb blend chunky fresh', kind: 'WIP', category: 'Sauces & dressings', unit: KG, expected: '2.4', count: { quantity: '2.4', daysAgo: 0, status: 'Confirmed' } },
  { n: 18, name: 'Potato shoestring fries coated straight cut', kind: 'RAW', category: 'Dry goods', unit: KG, expected: '30', count: { quantity: '36', daysAgo: 1, status: 'Confirmed' } },
]

const pad = (value: number) => String(value).padStart(2, '0')
const sampleItemId = (n: number) => `sample-item-${pad(n)}`

function wibClock(day: string, time: string): string { return `${day}T${time}+07:00` }

/** The sample rows and the sample source state, relative to `today` (WIB date) and `now`. */
export function buildSample(today: string, now: Date): { rows: ComparisonRow[]; source: SampleSource } {
  const yesterday = addDays(today, -1)
  const old = addDays(today, -3)
  const asOfOf = (variant: Variant): Pick<ExpectedStock, 'asOf' | 'businessDate' | 'basis'> => variant === 'intraday'
    ? { asOf: wibClock(today, '07:30:00'), businessDate: today, basis: 'intraday' }
    : variant === 'stale'
      ? { asOf: wibClock(old, '23:59:00'), businessDate: old, basis: 'end_of_day' }
      : { asOf: wibClock(yesterday, '23:59:00'), businessDate: yesterday, basis: 'end_of_day' }

  const rows = ITEMS.map((item): ComparisonRow => {
    const identity: ItemIdentity = {
      itemId: sampleItemId(item.n), itemName: item.name, kind: item.kind, category: item.category, unitId: item.unit[0], unitName: item.unit[1],
    }
    const countDate = item.count ? addDays(today, -item.count.daysAgo) : ''
    const count: CountObservation | null = item.count ? {
      id: `sample-count-${pad(item.n)}`, quantity: parseDecimal(item.count.quantity)!, unitId: item.unit[0], unitName: item.unit[1], countDate,
      submittedAt: wibClock(countDate, '21:15:00'), status: item.count.status,
    } : null
    const expected: ExpectedSide = item.mapping ? { kind: 'mapping_needed' } : {
      kind: 'value',
      value: {
        quantity: parseDecimal(item.expected)!, unitId: (item.expectedUnit ?? item.unit)[0], unitName: (item.expectedUnit ?? item.unit)[1],
        complete: !item.partial, ...asOfOf(item.variant ?? 'fresh'),
      },
    }
    return compareRow({ identity, count, expected, now })
  })
  return {
    rows,
    source: { asOf: asOfOf('fresh').asOf, syncedAt: wibClock(today, '00:10:00'), partialItems: ITEMS.filter((item) => item.partial).length, unmappedItems: ITEMS.filter((item) => item.mapping).length },
  }
}

/** A few earlier Counts per sample item, newest first, including a Rejected one, so the panel's history can be judged. */
export function sampleHistory(row: ComparisonRow, today: string): HistoryLine[] {
  const seed = Number(/(\d+)$/.exec(row.itemId)?.[1] ?? 1)
  const out: HistoryLine[] = []
  if (row.count) out.push({ id: row.count.id, countDate: row.count.countDate, submittedAt: row.count.submittedAt, status: row.count.status, quantity: row.count.quantity, unitName: row.unitName })
  const base = row.count?.quantity ?? 1_000_000_000n
  for (let step = 1; step <= 7; step += 1) {
    const countDate = addDays(row.count?.countDate ?? today, -(step * (1 + (seed % 3)) + 1))
    const drift = BigInt(((seed * 7 + step * 13) % 9) - 4) * 100_000_000n
    out.push({
      id: `sample-history-${seed}-${step}`, countDate, submittedAt: wibClock(countDate, '20:40:00'),
      status: step === 2 && seed % 2 === 1 ? 'Rejected' : 'Confirmed', quantity: base + drift < 0n ? 0n : base + drift, unitName: row.unitName,
    })
  }
  return out
}
