import { readCappedText } from '../_shared/cappedBody.ts'

export const MAX_AGENT_CHAT_BODY_BYTES = 1_048_576

export type CappedJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: 'too_large' }

export async function readCappedJson(
  request: Request,
  maxBytes = MAX_AGENT_CHAT_BODY_BYTES,
): Promise<CappedJsonResult> {
  const text = await readCappedText(request, maxBytes)
  if (text === null) {
    return { ok: false, reason: 'too_large' }
  }
  return { ok: true, value: JSON.parse(text) as unknown }
}
