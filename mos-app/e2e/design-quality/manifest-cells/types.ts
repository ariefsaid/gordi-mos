import type { ManifestCell } from '../manifest.ts'

export type ManifestCellInput = readonly [string, Omit<ManifestCell, 'id'>]
