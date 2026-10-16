// Words and ordering for Stock comparison flags and blank reasons (kept apart from the components so the cells file only exports components).
import type { PillTone } from '@/components/ui/pill'
import type { MessageKey, Locale } from '@/i18n/messages'
import type { Translate } from '@/i18n/use-t'
import { formatWibShortDateTime } from '@/lib/format/date'
import type { ComparisonRow } from '@/lib/cafe-stock-comparison'
import type { Flag, Missing } from '@/lib/db/cafe-stock-comparison'

const FLAG_KEY: Partial<Record<Flag, MessageKey>> = {
  shortage: 'cafe.cmp.flag.shortage',
  surplus: 'cafe.cmp.flag.surplus',
  no_difference: 'cafe.cmp.flag.no_difference',
  pending_confirmation: 'cafe.cmp.flag.pending_confirmation',
  different_times: 'cafe.cmp.flag.different_times',
  stale_esb: 'cafe.cmp.flag.stale_esb',
  old_count: 'cafe.cmp.flag.old_count',
  partial: 'cafe.cmp.flag.partial',
  mapping_needed: 'cafe.cmp.flag.mapping_needed',
  unit_mismatch: 'cafe.cmp.flag.unit_mismatch',
  not_counted: 'cafe.cmp.flag.not_counted',
  zero_expected: 'cafe.cmp.flag.zero_expected',
}

/** Amber = needs a look; blue = in progress; neutral = information. Always a word beside the colour. */
export const FLAG_TONE: Partial<Record<Flag, PillTone>> = {
  shortage: 'warning', surplus: 'warning', zero_expected: 'warning', stale_esb: 'warning', old_count: 'warning',
  partial: 'warning', mapping_needed: 'warning', unit_mismatch: 'warning',
  pending_confirmation: 'primary', no_difference: 'neutral', different_times: 'neutral', not_counted: 'neutral',
}

/** Shown order: the gap first, then what qualifies it. */
const FLAG_ORDER: Flag[] = ['shortage', 'surplus', 'zero_expected', 'no_difference', 'unit_mismatch', 'partial', 'mapping_needed', 'not_counted', 'pending_confirmation', 'different_times', 'stale_esb', 'old_count']

export function flagLabel(t: Translate, flag: Flag, row: Pick<ComparisonRow, 'indicative'>): string {
  // Equal values on different dates (or an intraday snapshot) are never "reconciled".
  if (flag === 'no_difference' && row.indicative) return t('cafe.cmp.flag.no_difference_dated')
  const key = FLAG_KEY[flag]
  return key ? t(key) : flag
}

export function missingReason(t: Translate, missing: Missing | null): string {
  if (missing === 'not_connected') return t('cafe.cmp.notConnected.title')
  const key = missing ? FLAG_KEY[missing] : undefined
  return key ? t(key) : ''
}

/** The flags a row shows, in order. `hide` drops flags that would be wrong right now (Not counted while Counts are unavailable). */
export function shownFlags(row: ComparisonRow, hide: readonly Flag[] = []): Flag[] {
  return FLAG_ORDER.filter((flag) => row.flags.includes(flag) && !hide.includes(flag))
}

/** "14 Oct 23:59 WIB" — an absolute WIB instant. */
export const wibInstant = (iso: string, locale: Locale) => `${formatWibShortDateTime(iso, locale)} WIB`

