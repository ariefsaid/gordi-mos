/**
 * readEntities.ts — the agent read-tool whitelist + row cap (D2/D6). A dependency-free LEAF
 * module.
 *
 * This lives here, not in actions.ts, to break a circular import: schema.ts builds
 * QUERY_ENTITY_SCHEMA from AGENT_READ_ENTITIES at module scope, and actions.ts imports the
 * schema objects from schema.ts — so actions.ts <-> schema.ts is a cycle. A leaf module (no
 * imports) can never participate in a cycle, so it is always initialized first (mirrors the
 * sibling internal project's TDZ-crash lesson, its own readEntities.ts header).
 *
 * AGENT_READ_ENTITIES is DERIVED from the MOS ENTITY_WHITELIST (P1, viewspec/types.ts) — the
 * SAME trust boundary the P1 renderer compiles against (D2: single-whitelist read surface,
 * NOT a separate agent-only entity list). Never hand-listed.
 */

// Relative import with explicit `.ts` extension (Deno-strict compat — JOB 0 / D7): deno check
// rejects extensionless relative specifiers; Vite/Vitest resolve the extension-ful form
// identically, so no separate resolution path is needed for Node/Vitest vs Deno.
import { ENTITY_WHITELIST } from '../../../mos-app/src/lib/viewspec/types.ts'

/** Whitelisted entities available to the deputy's query_entity tool (D2) — all 8 MOS entities. */
export const AGENT_READ_ENTITIES = Object.keys(ENTITY_WHITELIST) as readonly string[]

/** Hard row cap — the effective limit is min(input.limit ?? CAP, CAP). D6/FR-P2-RT-005. */
export const AGENT_READ_ROW_CAP = 50

/** Validated against ENTITY_WHITELIST at runtime (D2) — not a closed union here (derived list). */
export type AgentReadEntity = string
