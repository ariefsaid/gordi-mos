import type { Translate } from '@/i18n/use-t'
import type { Attention } from '@/lib/db/signals.types'
import { SIGNAL_LABEL_KEYS } from './signal-labels'

// attentionLabel — the ONE translated-label lookup for an Attention enum value, shared by every
// Signal surface that renders the attention pill (list rows AND the record page) so the two
// cannot drift again. The enum remains the storage/query value; SIGNAL_LABEL_KEYS owns its
// locale-aware presentation key, including FYI which must not leak as a raw English enum in `id`.
export function attentionLabel(t: Translate, attention: Attention): string {
  return t(SIGNAL_LABEL_KEYS.attention[attention])
}
