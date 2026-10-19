import { logStructuredError } from './errorLog.ts'
import type { EdgeFunctionName } from './errorLog.ts'

type AssistantSettingsClient = {
  schema(schema: string): {
    from(table: string): {
      select(columns: string): {
        eq(column: string, value: string): {
          eq(column: string, value: string): {
            maybeSingle(): Promise<{ data: { enabled?: unknown } | null; error: unknown | null }>
          }
        }
      }
    }
  }
}

export type AssistantAvailability = { allowed: true } | { allowed: false; reason: 'off' | 'unavailable' }

export async function checkAssistantAvailability(
  client: unknown,
  orgId: string,
  fn: EdgeFunctionName,
): Promise<AssistantAvailability> {
  try {
    const { data, error } = await (client as AssistantSettingsClient)
      .schema('mos')
      .from('org_module_settings')
      .select('enabled')
      .eq('org_id', orgId)
      .eq('module_id', 'assistant')
      .maybeSingle()

    if (error) {
      logStructuredError({ fn, errorCode: 'ASSISTANT_SETTING_UNAVAILABLE' })
      return { allowed: false, reason: 'unavailable' }
    }
    return data?.enabled === true ? { allowed: true } : { allowed: false, reason: 'off' }
  } catch {
    logStructuredError({ fn, errorCode: 'ASSISTANT_SETTING_UNAVAILABLE' })
    return { allowed: false, reason: 'unavailable' }
  }
}

/** The refusal for a caller whose org has the assistant off (403) or unreadable (503); null when allowed. */
export function assistantRefusalResponse(
  availability: AssistantAvailability,
  corsHeaders: Record<string, string>,
): Response | null {
  if (availability.allowed) return null
  const body = availability.reason === 'unavailable'
    ? { status: 503, error: 'MODULE_AVAILABILITY_UNAVAILABLE' }
    : { status: 403, error: 'MODULE_OFF', detail: 'assistant is switched off for this org' }
  return new Response(JSON.stringify(body), {
    status: body.status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
