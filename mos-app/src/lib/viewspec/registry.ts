// Primitive Registry. Adapted from the sibling internal project's ADR-0036 §4a. Registers the MOS
// dashboard kit primitives (ADR-0018 D6 P1) + the 2 planned vendored primitives (ADR-0019 D6) as stubs.
//
// Names + descriptor metadata live in the PURE `registry-manifest.ts` (Director build-note,
// 2026-07-04, pre-ADR-0018-P2-T7) — zero React/CSS imports, so Deno edge functions can import
// the catalog without pulling in the app's component tree. This module re-exports the manifest's
// types/data for the app, and ADDS a component-typed compile-time guard (`KPI_DELTA_TONES`) that
// only makes sense with a React import — that binding stays HERE, not in the manifest.

// Type-only import binds the descriptor's literal unions to the REAL component types via
// `satisfies`, so a future rename fails tsc here — keeping the manifest honest without pulling
// React into the pure manifest module.
import type { KPITileDelta } from '@/components/dashboard/kpi-tile'
import {
  registryManifest,
  validatePrimitiveInManifest,
  type PrimitiveStatus,
  type PropSchemaDescriptor,
  type DataShapeDescriptor,
  type PrimitiveDescriptor,
} from './registry-manifest'

export type { PrimitiveStatus, PropSchemaDescriptor, DataShapeDescriptor, PrimitiveDescriptor }

// Compile-time guard binding the KPITile delta tone union to the descriptor (rename-safe).
// Exported (rather than a bare unreferenced const) so `noUnusedLocals` doesn't fail the build —
// the guard's purpose is purely to fail tsc here if KPITileDelta['tone'] is ever renamed.
export const KPI_DELTA_TONES = ['success', 'destructive', 'neutral'] as const satisfies readonly KPITileDelta['tone'][]

export const registry = registryManifest

export function validatePrimitive(name: string): boolean { return validatePrimitiveInManifest(name) }
