export const MAX_AGENT_CHAT_BODY_BYTES = 1_048_576

export type CappedJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: 'too_large' }

export async function readCappedJson(request: Request): Promise<CappedJsonResult> {
  const declaredLength = Number(request.headers.get('Content-Length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_AGENT_CHAT_BODY_BYTES) {
    return { ok: false, reason: 'too_large' }
  }

  const chunks: Uint8Array[] = []
  let size = 0
  const reader = request.body?.getReader()
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_AGENT_CHAT_BODY_BYTES) {
        await reader.cancel()
        return { ok: false, reason: 'too_large' }
      }
      chunks.push(value)
    }
  }

  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) as unknown }
}
