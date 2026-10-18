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
