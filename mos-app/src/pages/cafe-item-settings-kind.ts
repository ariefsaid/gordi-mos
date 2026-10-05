export type CafeItemDraftKind = '' | 'RAW' | 'WIP'

export function isCafeItemDraftKind(value: string): value is CafeItemDraftKind {
  return value === '' || value === 'RAW' || value === 'WIP'
}
