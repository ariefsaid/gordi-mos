/**
 * QUERY_ENTITY_SCHEMA / CREATE_TASK_SCHEMA / POST_UPDATE_SCHEMA / COMPOSE_VIEW_INPUT_SCHEMA —
 * JSON Schema for the agent-chat tool catalog v1 (T13).
 *
 * Plain JSON Schema objects, NOT Zod (mirrors compose-view/schema.ts style). Enum for
 * query_entity is built from AGENT_READ_ENTITIES (D2 — derived from ENTITY_WHITELIST, never
 * hand-listed). Importable in both Deno (edge function) and Node/Vitest (D7).
 *
 * P2 scope (§0): 4 schemas shipped. NOTIFY_SCHEMA + ASK_USER_SCHEMA added in P3a (self-notification;
 * clarifying-question contract). Still DROPPED vs the sibling reference: CREATE_AUTOMATION_SCHEMA
 * (P3b, gated on the mint/hook live-verify).
 *
 * FR-P2-WT-004: createdBy/author are NEVER model inputs — CREATE_TASK_SCHEMA has no
 * createdBy property; the handler always attributes writes to the caller's JWT person_id.
 *
 * NOTE: COMPOSE_VIEW_INPUT_SCHEMA is NOT COMPOSITION_SPEC_SCHEMA (compose-view/schema.ts).
 * COMPOSE_VIEW_INPUT_SCHEMA is the tool input the model fills when it decides to call the
 * compose_view tool ({ prompt }); COMPOSITION_SPEC_SCHEMA is the inner schema composeSpec.ts
 * uses when tool-forcing the model to emit a validated CompositionSpec. Two layers, same
 * compileCompositionSpec enforcement boundary underneath both.
 */

import { AGENT_READ_ENTITIES, AGENT_READ_ROW_CAP } from './readEntities.ts'

// ── query_entity (read tool, confirm:false) — FR-P2-RT-* ─────────────────────

export const QUERY_ENTITY_SCHEMA = {
  type: 'object' as const,
  required: ['entity'] as string[],
  additionalProperties: false,
  properties: {
    entity: {
      type: 'string' as const,
      enum: AGENT_READ_ENTITIES as unknown as string[],
      description: "Whitelisted entity to read (the caller's own rows only — RLS-scoped).",
    },
    columns: {
      type: 'array' as const,
      items: { type: 'string' as const },
      description: "Subset of the entity's allowed columns; omit for all allowed columns.",
    },
    filter: {
      type: 'object' as const,
      required: ['column', 'op', 'value'] as string[],
      additionalProperties: false,
      properties: {
        column: { type: 'string' as const },
        op: {
          type: 'string' as const,
          enum: ['eq', 'in'],
          description: 'Filter operator: eq (equality) or in (list membership).',
        },
        value: { description: 'eq -> scalar string; in -> array of strings.' },
      },
    },
    limit: {
      type: 'integer' as const,
      minimum: 1,
      maximum: AGENT_READ_ROW_CAP,
      description: `Maximum rows to return. Hard cap is ${AGENT_READ_ROW_CAP}.`,
    },
    as: {
      type: 'string' as const,
      enum: ['table'],
      description: 'Optional presentation hint. Use "table" when the answer should render as a typed table artifact.',
    },
  },
}

// ── create_task (write tool, confirm:true) — FR-P2-WT-001/004 ────────────────

export const CREATE_TASK_SCHEMA = {
  type: 'object' as const,
  additionalProperties: false,
  required: ['title', 'businessUnitId', 'responsiblePersonId', 'accountablePersonId'] as string[],
  properties: {
    title: { type: 'string' as const, maxLength: 300 },
    businessUnitId: {
      type: 'string' as const,
      description: 'UUID of a shared.business_units row (the caller may query it).',
    },
    responsiblePersonId: {
      type: 'string' as const,
      description: 'UUID of a shared.people row (R person).',
    },
    accountablePersonId: {
      type: 'string' as const,
      description: 'UUID of a shared.people row (A person).',
    },
    dueDate: { type: 'string' as const, description: 'ISO date; optional.' },
    objectiveId: { type: 'string' as const },
    workLineId: { type: 'string' as const },
    description: { type: 'string' as const, maxLength: 2000 },
  },
}

// ── post_update (write tool, confirm:true) — add-line only (Director decision 2) ─

export const POST_UPDATE_SCHEMA = {
  type: 'object' as const,
  additionalProperties: false,
  required: ['label', 'progress'] as string[],
  properties: {
    label: {
      type: 'string' as const,
      maxLength: 300,
      description: 'One update line — what was worked on.',
    },
    progress: {
      type: 'string' as const,
      enum: ['done', 'in_progress', 'blocked'],
    },
    weekStart: {
      type: 'string' as const,
      description: 'ISO Monday date; defaults to current week (Asia/Jakarta).',
    },
  },
}

// ── compose_view (tool input the model fills; delegates to composeSpec.ts) ───

/**
 * COMPOSE_VIEW_INPUT_SCHEMA — the tool input schema the model sees when it decides to call
 * the compose_view tool. The model fills in { prompt } with the user's request for a view.
 *
 * NOTE: this is NOT COMPOSITION_SPEC_SCHEMA (compose-view/schema.ts) — that is the inner
 * schema composeSpec.ts uses when tool-forcing the model to emit a validated CompositionSpec.
 * Two different schemas at two different layers (D-A4-1 analog).
 */
export const COMPOSE_VIEW_INPUT_SCHEMA = {
  type: 'object' as const,
  required: ['prompt'] as string[],
  additionalProperties: false,
  properties: {
    prompt: {
      type: 'string' as const,
      description: "The user's natural-language request describing the dashboard view to compose.",
      maxLength: 2000,
    },
  },
}

// ── notify (P3a; self-notification, confirm:false) — FR-P3-NT-001/002 ────────
//
// The deputy drops a notification into the CALLER'S OWN inbox (e.g. "remind me to follow up").
// Self-only: the insert omits owner_id so the DB default + RLS pin it to the caller — the model
// can never address another person (cross-owner delivery is the @mention path via
// mos.create_notification, not this tool). No model-supplied metadata/route (avoids the model
// forging a deep-link); the notification is a plain title/body/severity. confirm:false — a
// self-note is not a consequential external write.
export const NOTIFY_SCHEMA = {
  type: 'object' as const,
  additionalProperties: false,
  required: ['title'] as string[],
  properties: {
    title: { type: 'string' as const, maxLength: 200 },
    body: { type: 'string' as const, maxLength: 2000 },
    severity: { type: 'string' as const, enum: ['info', 'warning', 'critical'] },
  },
}

// ── ask_user (P3a; clarifying-question contract, ADR-0045 §2 port) — FR-P3-AU-001 ────────────
//
// The model calls this to pose a structured clarifying question inline — the handler emits it as
// a status{kind:'question'} event and ends the stream; the client resolves it via
// control('answer', {questionId, optionId?, freeText?}), which continues the SAME run
// (handleAnswer, T19). NOT a write tool — no approval chip; it is a question/answer turn, always
// registered (unlike compose_view, which is composeEnabled-gated).
export const ASK_USER_SCHEMA = {
  type: 'object' as const,
  required: ['prompt', 'options'] as string[],
  additionalProperties: false,
  properties: {
    prompt: {
      type: 'string' as const,
      maxLength: 300,
      description: 'The clarifying question to show the user.',
    },
    options: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        required: ['id', 'label'] as string[],
        additionalProperties: false,
        properties: {
          id: { type: 'string' as const },
          label: { type: 'string' as const },
        },
      },
      description: 'The choices to present as tappable chips.',
    },
    allowFreeText: {
      type: 'boolean' as const,
      description: 'Whether to also offer a free-text answer box.',
    },
  },
}
