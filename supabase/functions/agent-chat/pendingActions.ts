export const AGENT_PENDING_ACTION_TTL_MS = 5 * 60 * 1000

export interface PendingAction {
  id: string
  actionName: string
  args: unknown
  toolCallId: string
}

export interface PendingActionCreate extends PendingAction {
  personId: string
  orgId: string
  expiresAt: string
}

export interface PendingActionStore {
  create(action: PendingActionCreate): Promise<boolean>
  consume(id: string): Promise<PendingAction | null>
}

interface PendingActionWriter {
  schema(schemaName: string): {
    from(table: string): {
      insert(row: object): PromiseLike<{ error: unknown }>
    }
  }
}

interface PendingActionConsumer {
  schema(schemaName: string): {
    rpc(functionName: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>
  }
}

function safeErrorCode(error: unknown): string {
  if (error !== null && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return error.code
  }
  return error instanceof Error ? error.name : 'unknown'
}

interface PendingActionRow extends Record<string, unknown> {
  id: string
  action_name: string
  args: Record<string, unknown>
  tool_call_id: string
}

function isPendingAction(value: unknown): value is PendingActionRow {
  if (value === null || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return typeof row.id === 'string'
    && typeof row.action_name === 'string'
    && row.args !== null
    && typeof row.args === 'object'
    && !Array.isArray(row.args)
    && typeof row.tool_call_id === 'string'
}

export function createPendingActionStore(
  trustedWriter: PendingActionWriter,
  callerClient: PendingActionConsumer,
): PendingActionStore {
  return {
    async create(action) {
      try {
        const { error } = await trustedWriter.schema('shared').from('agent_pending_actions').insert({
          id: action.id,
          org_id: action.orgId,
          person_id: action.personId,
          action_name: action.actionName,
          args: action.args,
          tool_call_id: action.toolCallId,
          expires_at: action.expiresAt,
        })
        if (error) {
          console.error('[agent-chat] pending action create failed', { errorCode: safeErrorCode(error) })
          return false
        }
        return true
      } catch (error) {
        console.error('[agent-chat] pending action create threw', { errorCode: safeErrorCode(error) })
        return false
      }
    },

    async consume(id) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return null
      try {
        const { data, error } = await callerClient.schema('shared').rpc('consume_agent_pending_action', {
          p_pending_id: id,
        })
        if (error) {
          console.error('[agent-chat] pending action consume failed', { errorCode: safeErrorCode(error) })
          return null
        }
        const row = Array.isArray(data) ? data[0] : data
        if (!isPendingAction(row)) return null
        return {
          id: row.id,
          actionName: row.action_name,
          args: row.args,
          toolCallId: row.tool_call_id,
        }
      } catch (error) {
        console.error('[agent-chat] pending action consume threw', { errorCode: safeErrorCode(error) })
        return null
      }
    },
  }
}
