// MCP tools derived from the api_v1 catalog: one tool per operation, its description and input
// schema built from the function's documented comment and signature. Nothing here decides who may
// do what; the database functions and RLS answer every call.
import { API_V1_CATALOG } from './catalog.ts'
import type { ApiV1Operation } from './types.ts'

export type McpTool = {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, Record<string, unknown>>
    required?: string[]
    additionalProperties: false
  }
}

const OBJECT = { type: 'object' }

// The JSON shape of each jsonb argument, keyed "operation.argument". The catalog carries only the
// database type, so a new jsonb argument must be declared here or tool generation fails.
const JSON_SHAPES: Record<string, Record<string, unknown>> = {
  'create_signal.mentions': {
    type: 'array',
    maxItems: 50,
    items: {
      type: 'object',
      properties: { kind: { type: 'string', enum: ['person', 'team', 'business_unit'] }, id: { type: 'string', format: 'uuid' } },
      required: ['kind', 'id'],
      additionalProperties: false,
    },
  },
  'edit_project_process.changes': OBJECT,
  'edit_signal.changes': OBJECT,
  'edit_task.changes': OBJECT,
}

function schemaFor(pgType: string, operation: string, argument: string): Record<string, unknown> {
  switch (pgType) {
    case 'uuid': return { type: 'string', format: 'uuid' }
    case 'text': return { type: 'string' }
    case 'integer': return { type: 'integer' }
    case 'boolean': return { type: 'boolean' }
    case 'date': return { type: 'string', format: 'date' }
    case 'timestamp with time zone': return { type: 'string', format: 'date-time' }
    case 'jsonb': {
      const shape = JSON_SHAPES[`${operation}.${argument}`]
      if (!shape) throw new Error(`api_v1.${operation}.${argument} is jsonb with no declared shape; add it to JSON_SHAPES`)
      return shape
    }
    case 'text[]': return { type: 'array', items: { type: 'string' } }
    case 'uuid[]': return { type: 'array', items: { type: 'string', format: 'uuid' } }
    default: throw new Error(`api_v1 argument type "${pgType}" has no MCP schema; extend schemaFor`)
  }
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

export function toTool(operation: ApiV1Operation): McpTool {
  const properties: McpTool['inputSchema']['properties'] = {}
  for (const arg of operation.args) properties[arg.name] = schemaFor(arg.type, operation.name, arg.name)
  const required = operation.args.filter((arg) => arg.required).map((arg) => arg.name)
  const description = [
    capitalise(operation.purpose),
    `Inputs: ${operation.inputs}`,
    operation.returns ? `Returns: ${operation.returns}` : null,
    operation.errors.startsWith('Always raises') ? operation.errors : `Errors: ${operation.errors}`,
  ].filter(Boolean).join(' ')
  return {
    name: operation.name,
    description,
    inputSchema: { type: 'object', properties, ...(required.length ? { required } : {}), additionalProperties: false },
  }
}

export const TOOLS: readonly McpTool[] = API_V1_CATALOG.map(toTool)
export const TOOLS_BY_NAME: ReadonlyMap<string, McpTool> = new Map(TOOLS.map((tool) => [tool.name, tool]))
