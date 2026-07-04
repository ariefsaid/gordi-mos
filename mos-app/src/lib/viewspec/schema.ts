// COMPOSITION_SPEC_SCHEMA. Adapted from the sibling internal project's compose-view/schema.ts
// (ADR-0039). Enum source-of-truth = registry.keys() + ENTITY_WHITELIST. Used now by the harness
// for JSON-validation + by tests; P2's compose-view edge function will reuse it as the tool
// input_schema.
import { registry } from './registry'
import { ENTITY_WHITELIST, MAX_PANELS_PER_VIEW } from './types'

export const COMPOSITION_SPEC_SCHEMA = {
  type: 'object' as const,
  required: ['version', 'panels'] as string[],
  additionalProperties: false,
  properties: {
    version: { type: 'integer' as const, const: 1 },
    panels: {
      type: 'array' as const,
      maxItems: MAX_PANELS_PER_VIEW,
      items: {
        type: 'object' as const,
        required: ['id', 'primitive', 'querySpec'] as string[],
        additionalProperties: false,
        properties: {
          id: { type: 'string' as const },
          primitive: { type: 'string' as const, enum: registry.keys() }, // FR-UV-002 single source of truth
          querySpec: {
            type: 'object' as const,
            required: ['entity', 'select'] as string[],
            additionalProperties: false,
            properties: {
              entity: { type: 'string' as const, enum: Object.keys(ENTITY_WHITELIST) }, // FR-UV-003
              select: { type: 'array' as const, items: { type: 'string' as const } },
              filters: {
                type: 'array' as const,
                items: {
                  type: 'object' as const, required: ['column', 'op', 'value'] as string[],
                  properties: {
                    column: { type: 'string' as const },
                    op: { type: 'string' as const, enum: ['eq', 'neq', 'in', 'gt', 'gte', 'lt', 'lte', 'between', 'date-range'] },
                    value: {},
                  },
                },
              },
              groupBy: { type: 'string' as const },
              aggregate: {
                type: 'object' as const, required: ['fn', 'column', 'alias'] as string[],
                properties: {
                  fn: { type: 'string' as const, enum: ['count', 'sum', 'avg', 'min', 'max'] },
                  column: { type: 'string' as const }, alias: { type: 'string' as const },
                },
              },
              timeRange: {
                type: 'object' as const, required: ['column', 'from', 'to'] as string[],
                properties: { column: { type: 'string' as const }, from: { type: 'string' as const }, to: { type: 'string' as const } },
              },
              limit: { type: 'integer' as const, minimum: 1 },
              orderBy: {
                type: 'object' as const, required: ['column', 'dir'] as string[],
                properties: { column: { type: 'string' as const }, dir: { type: 'string' as const, enum: ['asc', 'desc'] } },
              },
            },
          },
          layout: { type: 'object' as const, properties: { colSpan: { type: 'integer' as const, minimum: 1 }, rowSpan: { type: 'integer' as const, minimum: 1 } } },
          props: { type: 'object' as const },
        },
      },
    },
  },
}
