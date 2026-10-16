export const PAGE_FAMILIES = ['workspace', 'focused-record', 'management'] as const
export type PageFamily = (typeof PAGE_FAMILIES)[number]

export const PAGE_FAMILY_STATES = [
  'default',
  'loading',
  'empty',
  'filtered-empty',
  'error',
  'permission',
  'read-only',
  'saving',
  'saved',
  'validation',
  'archived',
  'retracted',
] as const
export type PageFamilyState = (typeof PAGE_FAMILY_STATES)[number]
