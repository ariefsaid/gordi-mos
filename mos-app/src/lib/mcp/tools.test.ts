// @vitest-environment node
// The tool list is the api_v1 catalog: an operation added in a migration without a tool fails here.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { API_V1_CATALOG } from './../../../../supabase/functions/mcp/catalog.ts'
import { TOOLS, TOOLS_BY_NAME } from './../../../../supabase/functions/mcp/tools.ts'

const MIGRATIONS = join(__dirname, '../../../../supabase/migrations')

function migrationOperations(): string[] {
  const names = new Set<string>()
  const dropped = new Set<string>()
  for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort()) {
    for (const line of readFileSync(join(MIGRATIONS, f), 'utf8').split('\n')) {
      const create = /^create (?:or replace )?function api_v1\.([a-z0-9_]+)/i.exec(line)
      if (create) names.add(create[1])
      const drop = /^drop function (?:if exists )?api_v1\.([a-z0-9_]+)/i.exec(line)
      if (drop) dropped.add(drop[1])
    }
  }
  return [...names].filter((n) => !dropped.has(n)).sort()
}

describe('MCP tool list', () => {
  it('has exactly one tool per api_v1 operation defined in the migrations', () => {
    expect(TOOLS.map((t) => t.name).sort()).toEqual(migrationOperations())
  })

  it('has no duplicate names', () => {
    expect(new Set(TOOLS.map((t) => t.name)).size).toBe(TOOLS.length)
    expect(TOOLS_BY_NAME.size).toBe(TOOLS.length)
  })

  it('builds each input schema from the function signature', () => {
    for (const op of API_V1_CATALOG) {
      const tool = TOOLS_BY_NAME.get(op.name)!
      expect(Object.keys(tool.inputSchema.properties)).toEqual(op.args.map((a) => a.name))
      expect(tool.inputSchema.required ?? []).toEqual(op.args.filter((a) => a.required).map((a) => a.name))
      expect(tool.inputSchema.additionalProperties).toBe(false)
    }
  })

  it('maps postgres types to JSON schema types', () => {
    const create = TOOLS_BY_NAME.get('create_task')!.inputSchema.properties
    expect(create.title).toEqual({ type: 'string' })
    expect(create.team_id).toEqual({ type: 'string', format: 'uuid' })
    expect(TOOLS_BY_NAME.get('list_tasks')!.inputSchema.properties.limit).toEqual({ type: 'integer' })
    expect(TOOLS_BY_NAME.get('edit_task')!.inputSchema.properties.changes).toEqual({ type: 'object' })
    expect(TOOLS_BY_NAME.get('edit_task')!.inputSchema.properties.expected_updated_at).toEqual({ type: 'string', format: 'date-time' })
  })

  it('describes each tool from its documented comment', () => {
    const d = TOOLS_BY_NAME.get('get_task')!.description
    expect(d).toMatch(/^One Task with its checklist/)
    expect(d).toContain('Inputs: id.')
    expect(d).toContain('Errors: not_found')
  })

  it('takes no arguments for whoami', () => {
    expect(TOOLS_BY_NAME.get('whoami')!.inputSchema).toEqual({ type: 'object', properties: {}, additionalProperties: false })
  })
})
