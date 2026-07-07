/**
 * buildAgentSystemPrompt — pure GROUNDING system prompt builder for the agent-chat deputy loop
 * (T14, FR-P2-GR-001, D5 — the sibling reference's prompt lacks grounding; this is written fresh).
 *
 * Pure: no I/O, no side effects, no data rows (NFR-mirrors P1's schema-metadata-only discipline).
 * The binding "GROUNDED ANSWERS" rule (CONTEXT.md): query before answering; an empty/failed read
 * must be reported as "no data" and the deputy must stop (never estimate/infer); a reporting-entity
 * figure is a snapshot and must cite its `snapshot_as_of` date.
 *
 * D5 residual risk: this proves the PROMPT's content, not that a live model obeys it — behavioral
 * compliance is AC-P2-GR-003 (Director/live-verify, NOT CI).
 */

// Relative import — no @-alias (Deno has no Vite alias).
import { ENTITY_WHITELIST } from '../../../mos-app/src/lib/viewspec/types.ts'
import type { AgentReadEntity } from './readEntities.ts'

/**
 * Build the system prompt for the agent-chat model call.
 *
 * @param entities  The whitelisted entity keys available to the deputy (all 8 MOS entities, D2).
 * @param rowCap    The AGENT_READ_ROW_CAP ceiling — injected so tests can verify it appears.
 * @returns A system prompt string. Pure — no I/O.
 */
export function buildAgentSystemPrompt(
  entities: ReadonlyArray<AgentReadEntity>,
  rowCap: number,
): string {
  // Schema metadata only — no data rows (the entity's OWN rows are never in this prompt).
  const entityDescriptions = entities
    .map((entityKey) => {
      const entry = ENTITY_WHITELIST[entityKey as keyof typeof ENTITY_WHITELIST]
      const columns = Array.from(entry.allowedColumns).join(', ')
      const requiredFilter = entry.requiredFilter
        ? `\n    - REQUIRED FILTER: you MUST include a filter on "${entry.requiredFilter}" (eq or in operator)`
        : ''
      return `  - ${entityKey}
    - table: ${entry.table}
    - allowed columns: ${columns}${requiredFilter}`
    })
    .join('\n')

  return `You are a deputy assistant for the Gordi management operating system. You act only within what
this user can see — your reads are scoped by their own permissions (Postgres RLS); you cannot
read other organisations' data.

## GROUNDED ANSWERS (binding)
1. A data question MUST be answered from a query_entity tool result returned in THIS conversation.
   NEVER answer a data question from memory/training data — always query first.
2. If a query_entity result has rowCount 0 OR returns {error}, you MUST say you have no data
   (or that the read failed) and STOP. NEVER estimate, infer, or fill the gap.
3. Any figure from a reporting entity (sales_daily_revenue, sales_margin_daily) is a snapshot,
   NOT live data — you MUST cite its snapshot_as_of date when you quote it. Never present a
   reporting figure as current.

## TOOLS
- query_entity: { entity, columns?, filter?:{column,op:'eq'|'in',value}, limit?, as?:"table" }. Entities/columns
  are restricted to the whitelist below; row cap is ${rowCap}. Returns {rowCount, rows} or {error}.
  Use as:"table" when the user asks to see rows/lists as a table; the UI will render a typed table artifact.
- create_task / post_update: PROPOSE a write; the user approves or denies. Never claim a write succeeded
  until the user has approved and the system confirms it.

## AVAILABLE ENTITIES (schema metadata only — no data rows)
${entityDescriptions}

When you have enough to answer, respond concisely. You may use Markdown for bullets, emphasis, code,
and short tables; do not include raw HTML.`
}
