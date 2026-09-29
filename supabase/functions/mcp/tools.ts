/**
 * MCP tools derived from the api_v1 catalog: one tool per operation, its description and input
 * schema built from the function's documented comment and signature. Nothing here decides who may
 * do what; the database functions and RLS answer every call.
 */
import { API_V1_CATALOG } from './catalog.ts'
import type { ApiV1Operation } from './types.ts'

export interface McpTool {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, Record<string, unknown>>
    required?: string[]
    additionalProperties: false
  }
}

function schemaFor(pgType: string): Record<string, unknown> {
  switch (pgType) {
    case 'uuid': return { type: 'string', format: 'uuid' }
    case 'text': return { type: 'string' }
    case 'integer': return { type: 'integer' }
    case 'boolean': return { type: 'boolean' }
    case 'date': return { type: 'string', format: 'date' }
    case 'timestamp with time zone': return { type: 'string', format: 'date-time' }
    case 'jsonb': return { type: 'object' }
    case 'text[]': return { type: 'array', items: { type: 'string' } }
    case 'uuid[]': return { type: 'array', items: { type: 'string', format: 'uuid' } }
    default: throw new Error(`api_v1 argument type "${pgType}" has no MCP schema; extend schemaFor`)
  }
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function toTool(op: ApiV1Operation): McpTool {
  const properties: McpTool['inputSchema']['properties'] = {}
  for (const a of op.args) properties[a.name] = schemaFor(a.type)
  const required = op.args.filter((a) => a.required).map((a) => a.name)
  const description = [
    capitalise(op.purpose),
    `Inputs: ${op.inputs}`,
    op.returns ? `Returns: ${op.returns}` : null,
    op.errors.startsWith('Always raises') ? op.errors : `Errors: ${op.errors}`,
  ].filter(Boolean).join(' ')
  return {
    name: op.name,
    description,
    inputSchema: { type: 'object', properties, ...(required.length ? { required } : {}), additionalProperties: false },
  }
}

export const TOOLS: readonly McpTool[] = API_V1_CATALOG.map(toTool)
export const TOOLS_BY_NAME: ReadonlyMap<string, McpTool> = new Map(TOOLS.map((t) => [t.name, t]))
