import type { Translate } from '@/i18n/use-t'
import type { Attention } from '@/lib/db/signals.types'

// attentionLabel — the ONE translated-label lookup for an Attention enum value, shared by every
// Signal surface that renders the attention pill (list rows AND the record page) so the two
// cannot drift again (P1 fix, live measurement: signal-record.tsx rendered the raw English enum
// "Urgent" in the `id` locale while signal-feed-rows.tsx already resolved it correctly). Reuses
// the existing `signals.archive.attention*` keys — no new i18n keys added.
export function attentionLabel(t: Translate, attention: Attention): string {
  if (attention === 'Urgent') return t('signals.archive.attentionUrgent')
  if (attention === 'Needs attention') return t('signals.archive.viewAttention')
  return attention // FYI — the loanword, catalog-wide (archive filter ditto)
}
