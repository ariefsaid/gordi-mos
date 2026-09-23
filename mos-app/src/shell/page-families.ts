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

export type PageHeadVariant = 'prose' | 'content'

export interface PageFamilyContract {
  family: PageFamily
  headVariant: PageHeadVariant
  mobilePriority: 'work-before-config' | 'record-first'
}

export const PAGE_FAMILY_CONTRACTS: Record<PageFamily, PageFamilyContract> = {
  workspace: {
    family: 'workspace',
    headVariant: 'content',
    mobilePriority: 'work-before-config',
  },
  'focused-record': {
    family: 'focused-record',
    headVariant: 'prose',
    mobilePriority: 'record-first',
  },
  management: {
    family: 'management',
    headVariant: 'content',
    mobilePriority: 'work-before-config',
  },
}
