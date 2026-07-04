/**
 * COMPOSITION_SPEC_SCHEMA — JSON Schema for the compose_view tool input_schema.
 *
 * Enums are built FROM registryManifest.keys() and Object.keys(ENTITY_WHITELIST) — no
 * hardcoded primitive/entity names (defense-in-depth: the tool schema constrains the model
 * to whitelist values; the compiler remains the enforcement authority).
 *
 * Imports the PURE `registry-manifest.ts` (Director build-note pre-T7) — NOT `registry.ts`,
 * which pulls in React component types and would fail a Deno bundle/typecheck.
 *
 * Importable in both Deno (edge function) and Node/Vitest (mos-app/src/lib/agent/*.test.ts,
 * via relative path — D7).
 */

// Relative imports back into the trusted core. No `.ts` extension issue here for Vite/Node
// (extension-less resolves); Deno resolves via the explicit `.ts` suffix.
import { registryManifest } from '../../../mos-app/src/lib/viewspec/registry-manifest.ts'
import { ENTITY_WHITELIST, MAX_PANELS_PER_VIEW } from '../../../mos-app/src/lib/viewspec/types.ts'

/**
 * JSON Schema for CompositionSpec v1.
 * Used as the `input_schema` for the `compose_view` tool (FR-P2-CV-001).
 * maxItems = MAX_PANELS_PER_VIEW (shared constant).
 */
export const COMPOSITION_SPEC_SCHEMA = {
  type: 'object' as const,
  required: ['version', 'panels'] as string[],
  additionalProperties: false,
  properties: {
    version: {
      type: 'integer' as const,
      const: 1,
      description: 'CompositionSpec version — always 1 in this schema.',
    },
    panels: {
      type: 'array' as const,
      maxItems: MAX_PANELS_PER_VIEW,
      description: `Array of panel specs. Maximum ${MAX_PANELS_PER_VIEW} panels.`,
      items: {
        type: 'object' as const,
        required: ['id', 'primitive', 'querySpec'] as string[],
        additionalProperties: false,
        properties: {
          id: {
            type: 'string' as const,
            description: 'Stable, unique panel identifier (e.g. a UUID or slug).',
          },
          primitive: {
            type: 'string' as const,
            // Built from registryManifest.keys() — defense-in-depth
            enum: registryManifest.keys(),
            description: 'Name of the registered UI primitive to render this panel.',
          },
          querySpec: {
            type: 'object' as const,
            required: ['entity', 'select'] as string[],
            additionalProperties: false,
            properties: {
              entity: {
                type: 'string' as const,
                // Built from Object.keys(ENTITY_WHITELIST) — defense-in-depth
                enum: Object.keys(ENTITY_WHITELIST),
                description: 'Whitelisted entity to query.',
              },
              select: {
                type: 'array' as const,
                items: { type: 'string' as const },
                description: 'Column names to select (must be in entity allowedColumns).',
              },
              filters: {
                type: 'array' as const,
                items: {
                  type: 'object' as const,
                  required: ['column', 'op', 'value'] as string[],
                  properties: {
                    column: { type: 'string' as const },
                    op: {
                      type: 'string' as const,
                      enum: ['eq', 'neq', 'in', 'gt', 'gte', 'lt', 'lte', 'between', 'date-range'],
                    },
                    value: {
                      description: 'Filter value — string, number, boolean, or array.',
                    },
                  },
                },
              },
              groupBy: {
                type: 'string' as const,
                description: 'Column to group by (must be in entity groupableColumns).',
              },
              aggregate: {
                type: 'object' as const,
                required: ['fn', 'column', 'alias'] as string[],
                properties: {
                  fn: {
                    type: 'string' as const,
                    enum: ['count', 'sum', 'avg', 'min', 'max'],
                  },
                  column: { type: 'string' as const },
                  alias: { type: 'string' as const },
                },
              },
              timeRange: {
                type: 'object' as const,
                required: ['column', 'from', 'to'] as string[],
                properties: {
                  column: { type: 'string' as const },
                  from: { type: 'string' as const },
                  to: { type: 'string' as const },
                },
              },
              limit: {
                type: 'integer' as const,
                minimum: 1,
              },
              orderBy: {
                type: 'object' as const,
                required: ['column', 'dir'] as string[],
                properties: {
                  column: { type: 'string' as const },
                  dir: {
                    type: 'string' as const,
                    enum: ['asc', 'desc'],
                  },
                },
              },
            },
          },
          layout: {
            type: 'object' as const,
            properties: {
              colSpan: { type: 'integer' as const, minimum: 1 },
              rowSpan: { type: 'integer' as const, minimum: 1 },
            },
          },
          props: {
            type: 'object' as const,
            description: 'Static primitive props (tone, icon, label, etc.).',
          },
        },
      },
    },
  },
}
