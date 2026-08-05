export type Attention = 'FYI' | 'Needs attention' | 'Urgent'

/** CSS-slug for an attention level (e.g. "Needs attention" → "needs-attention"), for the
 * `signal-attention--<slug>` / `signal-row-attention--<slug>` modifier classes. */
export function attentionSlug(attention: Attention): string {
  return attention.replace(/\s+/g, '-').toLowerCase()
}
export const SIGNAL_CATEGORIES = ['Supply/vendor','Equipment/facility','Inventory/availability',
  'Quality','Customer','People','Process','Other'] as const
export type SignalCategory = typeof SIGNAL_CATEGORIES[number]
export type MentionKind = 'person' | 'team' | 'bu'

export interface SignalRow {
  id: string; author_id: string; owning_team_id: string; occurred_at: string; body: string
  attention: Attention; category: SignalCategory | null; source: 'human' | 'shared_record' | 'rule'
  retracted_at: string | null; retract_reason: string | null; edited_at: string | null; created_at: string
}
export interface StagedMention { kind: MentionKind; targetId: string; label: string }
export interface TeamOption { id: string; name: string; business_unit_id: string; site_id: string | null; is_primary: boolean }
export interface SiteOption { id: string; name: string }
export interface CreateSignalInput { body: string; owningTeamId: string; occurredAt: string; mentions: StagedMention[] }
