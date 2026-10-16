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
import {
  registryManifest,
  
  
  
  
} from './registry-manifest'

export const registry = registryManifest
